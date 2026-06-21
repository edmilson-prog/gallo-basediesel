# Design — Performance de carregamento de mídia das conversas

**Data:** 2026-06-20
**Branch:** `perf/whatsapp-media-signing` (a partir de `origin/main` @ v0.110.0 Turnstile)
**Autor:** Claude (sessão com o dono)
**Status:** aprovado para implementação

## Problema

As mídias do WhatsApp (imagens, áudios, documentos) demoram a carregar ao abrir
uma conversa, e a lentidão é **sensivelmente pior para papéis não-staff**
(Vendedor/SDR) do que para Owner/Gestor. Diagnóstico fechado com medição em
produção (impersonação read-only, transação revertida).

### Causa-raiz (duas, que se somam)

**(A) RLS da assinatura faz varredura completa de `conversations` por item.**
A mídia recebida vive no bucket privado `whatsapp-media` sob o path
`conversations/<convId>/<msgId>/media.<ext>` e exige um **signed URL** para
navegar. A policy `storage_whatsapp_media_select_inbound` autoriza a leitura via:

```sql
(storage.foldername(name))[2] IN (
  SELECT c.id::text FROM conversations c WHERE c.store_id = current_store_id()
)
```

Esse subquery **sofre a RLS de `conversations`** (`conversations_select` =
`can_access_conversation(id)`), avaliada **por linha**. Medição (EXPLAIN ANALYZE,
837 conversas na loja, por `createSignedUrl`):

| Papel | Tempo | SubPlan `can_access` | Buffers |
|---|---|---|---|
| Owner (`is_staff`) | **113 ms** | 837 loops (ramo barato) | 2.608 |
| Vendedor (não-staff) | **2.375 ms** | 837 loops (ramo pesado) | 26.684 |

~21× mais lento para o vendedor. O `is_staff()` curto-circuita dentro de
`can_access_conversation`, daí a assimetria. **O path já carrega o `convId`** —
a varredura é totalmente desnecessária.

**(B) N+1 de assinatura no frontend.** Cada balão/thumb chama
`useResolvedMediaUrl` individualmente → **uma chamada `createSignedUrl` por
item**. Abrir uma conversa com N mídias dispara N requisições em paralelo;
para o vendedor, N × 2,4 s satura a conexão e algumas estouram `statement_timeout`
→ aparecem como "indisponível". O `createSignedUrls` (lote) não é usado.

### O que já foi feito (e por que não resolveu isto)

- PR #107/#109 — cache de mensagens/cabeçalho (TanStack Query). Não tocou mídia.
- v0.89.1 — renovação automática do signed URL ao abrir a conversa. Não tocou o
  N+1 nem o custo de RLS.
- PR #132/#133/#134 — gated-once RPC para leitura de mensagens/ficha. **Não
  tocaram o caminho de assinatura de mídia no storage.**

## Solução

### Fix A — RLS gated-once (ganho dominante)

Helper `SECURITY DEFINER` que extrai o `convId` do path e checa
`can_access_conversation` **uma vez**, com cast seguro (path malformado nunca
lança dentro da avaliação da policy):

```sql
create or replace function public.can_read_conversation_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  conv_id uuid;
begin
  if (storage.foldername(object_name))[1] is distinct from 'conversations' then
    return false;
  end if;
  begin
    conv_id := (storage.foldername(object_name))[2]::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_conversation(conv_id);
end;
$$;
```

A policy passa a usar o helper:

```sql
drop policy "storage_whatsapp_media_select_inbound" on storage.objects;
create policy "storage_whatsapp_media_select_inbound"
on storage.objects for select to authenticated
using (
  bucket_id = 'whatsapp-media'
  and (storage.foldername(name))[1] = 'conversations'
  and public.can_read_conversation_media(name)
);
```

**Efeito:** O(837) → O(1) por assinatura. Não-staff cai de ~2.375 ms para
~poucos ms; owner também (837-loop scan → 1 lookup indexado).

**Segurança:** semântica **idêntica** ("lê a mídia ⇔ acessa a conversa"). O
conjunto autorizado é o mesmo de hoje (o `IN (subquery)` sob RLS já era
equivalente a `can_access_conversation(convId)`). Zero alargamento — só troca a
forma de avaliar. `is_staff()` segue dentro de `can_access_conversation`.
Outbound (`<storeId>/<uuid>.<ext>`) não é afetada — continua na policy
store-prefix `storage_whatsapp_media_select` (O(1), barata).

**Migration:** `supabase/migrations/2026XXXXXXXXXX_media_signing_gated_once.sql`,
espelhada no Git. **Não aplicada em prod sem OK explícito do dono.**

### Fix B — assinatura em lote (corta os N round-trips)

**Função pura (testável):** `partitionMediaRefs(refs: string[])` em
`src/shared/utils/mediaRef.ts` (ou co-localizada) — classifica cada ref via o
`classifyMediaRef` existente em três baldes: `storagePaths` (assinar),
`passthrough` (absolutas → usar verbatim) e `none` (→ null). Dedup de paths.

**Provider — novo método `resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>>`**
em `IMessagesProvider`:
- **Supabase:** particiona via `partitionMediaRefs`; assina os `storagePaths`
  numa única chamada `createSignedUrls(paths, TTL)` (retorna
  `{ path, signedUrl, error }[]`); monta o mapa ref→url (absolutas passam, none
  vira null, erro de assinatura vira null).
- **Mock:** mapeia cada ref pela mesma lógica do `resolveMediaUrl` atual.

**Hook orquestrador `useSeedSignedMediaUrls(refs: string[])`** (novo, em
`src/features/conversations/hooks/`):
- Coleta os refs distintos que ainda **não** estão no cache do TanStack Query
  (`queryClient.getQueryData(["message-media-url", ref])` ausente).
- Chama `resolveMediaUrls` para o lote faltante.
- Popula `queryClient.setQueryData(["message-media-url", ref], url)` para cada,
  com o mesmo `staleTime`/`gcTime` do `useResolvedMediaUrl` (via `setQueryData`
  + opções de query padrão já herdadas pela key).

**Pontos de chamada (escopo: thread + galeria):**
1. `MessageList` (thread) — semeia a partir de `messages.map(m => m.mediaUrl)`.
2. `useConversationMessageMedia` (aba/galeria "Mídias") — semeia a partir de
   `items.map(i => i.mediaUrl)`.

**Bubbles intactos:** `useResolvedMediaUrl` **não muda**. Passa a achar a URL já
no cache (hit instantâneo) e continua sendo o fallback para qualquer item não
semeado (ex.: mensagem que chega via Realtime depois do seed). Zero alteração em
`ImageBubble`/`AudioBubble`/`DocumentBubble`/`MediaThumb`.

## Unidades e fronteiras

| Unidade | Faz | Depende de |
|---|---|---|
| `can_read_conversation_media(text)` | autoriza 1 objeto de mídia inbound | `can_access_conversation` |
| policy `..._select_inbound` | gate de SELECT no storage | o helper acima |
| `partitionMediaRefs(refs)` | classifica refs em assinar/passar/null | `classifyMediaRef` (puro) |
| `messages.resolveMediaUrls(refs)` | assina N refs em 1 ida | `partitionMediaRefs`, `createSignedUrls` |
| `useSeedSignedMediaUrls(refs)` | semeia o cache em lote | `resolveMediaUrls`, queryClient |
| `useResolvedMediaUrl(ref)` | **inalterado** — lê o cache / fallback | `resolveMediaUrl` |

## Testes

- **`partitionMediaRefs`** (Vitest, puro): storage vs absolute vs none; dedup;
  entrada vazia; mistura. Reaproveita `classifyMediaRef` (já testado).
- **`resolveMediaUrls` mock** (Vitest): mapeia refs corretamente (absolutas
  passam, placeholders viram null).
- A lógica de assinatura supabase real não é unit-testável sem cliente — fica
  coberta pela verificação manual/EXPLAIN abaixo.

## Verificação (gate)

1. `bun run build` verde.
2. `bun run test` verde.
3. `bunx tsc --noEmit` — sem novos erros por delta (`git diff --name-status main...HEAD --diff-filter=A`).
4. Medição impersonada do helper para o Lucas (não-staff) provando ~ms
   (`select public.can_read_conversation_media('conversations/<conv>/<msg>/media.bin')`).
5. Smoke manual do dono (UI): abrir conversa com várias mídias como vendedor →
   mídias carregam rápido; galeria "Mídias" idem.

## Rollout e segurança

- Branch a partir de `origin/main`; **integração só via PR** (nunca merge direto).
- Migration **espelhada em `supabase/migrations/`**; **aplicação em prod só com
  OK explícito do dono** (regra do projeto). O Fix A só produz efeito em prod
  após a migration ser aplicada; o Fix B (frontend) já reduz round-trips assim
  que o deploy do front subir.
- `vite.config.ts` (mod local de dev do dono) e docs untracked **não** entram
  nos commits desta branch.

## Não-objetivos (YAGNI)

- Persistir o cache de signed URL entre reloads (continua em memória).
- Virtualização da lista de mensagens.
- Mexer no caminho de mídia outbound (já é O(1)).
- Qualquer mudança de `can_access_conversation` ou das policies de `conversations`.
