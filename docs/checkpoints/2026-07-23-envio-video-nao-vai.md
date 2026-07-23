# Envio de vídeo no Atendimento não ia — diagnóstico e correção

**Data:** 2026-07-23
**Worktree:** `.claude/worktrees/video-send-fix` — branch `worktree-video-send-fix` (base: `main` @ `f0756308`)
**PR:** #356
**Status:** causa raiz encontrada e corrigida; pendente smoke do dono + redeploy da Edge `waha-send`

---

## 1. O sintoma

Vídeo `.mp4` de **20 MB**, conversa da instância **"Vendas — WAHA"**. Nada acontece — pelo drag-and-drop e pelo clipe → "Vídeo". **Nenhum erro**, nem na tela nem no console do DevTools.

O envio de vídeo foi entregue na **v0.149.0 `Reel`** e validado na época. **Não é regressão:** o cap nasceu no mesmo commit que habilitou vídeo (`7d4d1938`, 2026-07-17), copiado do limite do Meta. O maior vídeo já enviado pelo composer em produção tem **2,18 MiB** — o teto nunca havia sido exercitado.

## 2. Causa raiz — duas falhas somadas

### 2.1 O arquivo era rejeitado no navegador

`useAttachmentUpload.ts` aplicava `MAX_SIZE_BYTES.video = 16 MiB`, valor copiado dos limites do **Meta Cloud API**. 20 MB > 16 MiB ⇒ `prepareAttachment` retornava `null` e `MessageInput.tsx:476` (`if (!payload) return;`) encerrava o pipeline.

**Nenhuma requisição saía** — daí o console limpo. E o Meta é **um engine entre cinco**, que nem é o usado em produção: `evolution`, `evolution-go` e `openwa` declaram 64 MiB nas próprias capabilities. O composer ignorava isso e aplicava o teto do engine mais restritivo a todos.

### 2.2 O aviso de erro não tinha onde aparecer

O código *disparava* `toast.error("Arquivo muito grande…")`. Mas o **`<Toaster />` do sonner nunca esteve montado na árvore React** — nem em `__root.tsx`, nem em `main.tsx`, nem em layout algum. Estava definido e estilizado em `components/ui/sonner.tsx`, e nenhum arquivo o importava.

Verificado: `git log -S"<Toaster" -- src/` retorna **zero commits** — nunca esteve montado em toda a história da branch. **~190 módulos chamam `toast.*` e nenhum jamais apareceu na tela.** O sonner enfileira no vazio sem warning e sem rastro no console.

Esse é o motivo de "não retorna nenhum erro": não era um erro faltando, era a superfície de renderização inteira ausente.

### 2.3 O cap estava triplicado e já divergente

| Caminho | Cap de vídeo (antes) |
|---|---|
| Composer (`useAttachmentUpload.ts`) | 16 MiB ← rejeitava o arquivo |
| Envio agendado (`useScheduleMediaUpload.ts`) | 16 MiB (cópia literal) |
| Biblioteca de ativos (`useAssetLibraryAdmin.ts`) | 25 MiB, com TODO pedindo confirmar o bucket |
| Galeria da conversa (`MediaGallery.tsx`) | sem validação |

O mesmo vídeo de 20 MB **entrava pela biblioteca e era recusado pelo composer**.

## 3. Qual é o teto real

Levantada a cadeia inteira, do navegador ao WhatsApp:

| Degrau | Limite | Vinculante? |
|---|---|---|
| Cap do composer | 16 MiB | ← **era o bug** |
| Bucket `whatsapp-media` (`file_size_limit`) | **26.214.400 B (25 MiB)** | **sim — teto real** |
| Payload da Edge `waha-send` | irrelevante | não — trafega só a **URL**, nunca os bytes |
| Engines (evolution/go/openwa) | 64 MiB | não |
| Meta Cloud API | 16 MiB | só na conta Meta, enforced server-side |

O upload vai **direto do navegador para o Storage** (supabase-js `.upload()`), sem Edge no meio — então o `file_size_limit` do bucket é absoluto: acima dele o Storage responde 413. Valor confirmado ao vivo em produção e declarado em `supabase/migrations/20260610014819_storage_106_buckets_policies.sql:15`.

**Conclusão:** 25 MiB destrava o vídeo de 20 MB **sem tocar em infraestrutura**. Subir para 64 MiB (copiando o Evolution) quebraria com 413 no Storage — exigiria alterar o bucket na mesma entrega.

## 4. O que foi corrigido

| Commit | Correção |
|---|---|
| `6e38ee4b` | **Monta o `<Toaster />`** em `__root.tsx` (top-right, para não cobrir o composer) + severidade por borda esquerda em tokens semânticos. Os ~190 toasts do app passam a aparecer. |
| `1d45e52f` | **`src/shared/utils/mediaLimits.ts`** — fonte única: `STORAGE_BUCKET_MAX_BYTES = 26_214_400` e caps por kind fixados nesse teto. Composer, agendamento e biblioteca passam a ler a mesma constante. Um teste falha se algum cap for posto acima do que o Storage aceita. Resolve o TODO do `useAssetLibraryAdmin`. |
| `2633b5a2` | **Fallback por extensão** em `inferAttachmentKind` para vídeo/imagem/áudio (antes só documento tinha) — cobre `type` vazio no paste e `application/octet-stream` no drag. |
| `b6697301` | **Timeout de mídia** em `sendWahaMedia` (herdava 15 s). O `/api/sendFile` do WAHA é síncrono: baixa a URL assinada e sobe os bytes ao WhatsApp antes de responder — 15 s não cobre 20 MB. |
| `379c22c0` | **Correção do review:** o estilo do toast era inerte (ver §4.1). |
| `a36661d0` | **Correção do review:** timeout calibrado 120 s → **60 s**; `.mkv`/`.avi` fora do fallback; doc `onda5-migration.md` atualizada. |

### 4.1 O que o review adversarial pegou — no meu próprio código

Os 4 primeiros commits passaram por review sob 3 lentes independentes, com um
refutador cético por achado. Dois defeitos **reais** sobreviveram, ambos no
commit do Toaster, ambos com a mesma raiz:

**O sonner injeta o próprio CSS em runtime, sem `@layer`.** Na cascata CSS,
declaração sem layer vence qualquer declaração em layer, **independentemente
de especificidade**. As utilities do Tailwind vivem em `@layer utilities` —
logo o `border: 1px solid var(--normal-border)` do sonner ganhava sempre.
Consequências:

1. As classes de severidade que adicionei **não pintavam nada** — todo toast
   saía com a mesma borda cinza, e um erro ficava idêntico a um sucesso.
2. Sem prop `theme`, o sonner assume a paleta clara (`--normal-bg: #fff`) — no
   modo escuro o toast sairia **branco com texto quase preto**. A utility
   `bg-background` que corrigiria isso era inerte pelo mesmo motivo.

Corrigido movendo o skin para `styles.css` **fora de todo `@layer`**, mapeando
as variáveis do sonner para os tokens semânticos (segue tema e light/dark
sozinho), com prefixo `html` para vencer a especificidade. **Validado no CSS
buildado** (`dist/assets/*.css`), não em teoria — o `bun run build` verde não
detecta esse tipo de falha.

Um terceiro achado veio da minha própria leitura, contra a refutação: o
`sendWahaMedia` também alimenta o **worker de agendamento**, que percorre até
50 linhas em sequência dentro de uma única invocação da Edge. 120 s por item
podia consumir a janela de execução e deixar o resto do lote órfão — daí a
calibração para 60 s, que ainda cobre 25 MiB com folga.

### O que deliberadamente NÃO foi mexido

- **O `catch` mudo do envio em produção** (`MessageInput.tsx:487`) — parece bug, mas é intencional: em `supabase` o `handle.fail()` (`useMessageSend.ts:213`) marca o balão otimista como falho, e o balão vermelho já é o feedback. Um toast seria redundante.
- **O bucket** — continua em 25 MiB. Subir exige DDL em produção, que é decisão do dono.
- **Cache/realtime/query keys do Atendimento** — congelados por decisão anterior.

## 5. Validação

- `bun run test` — **2300 testes, 291 arquivos, todos verdes** (30 deles novos/alterados nesta branch).
- `bun run build` — verde (4,3 s).
- `tsc` — nenhum erro novo nos arquivos tocados; o que aparece em `waha/send.test.ts` é baseline pré-existente (arquivo não tocado).
- Prettier — os 3 arquivos que acusam formatação **já acusavam no `HEAD`**, comprovado extraindo a versão original; o resto é ruído de CRLF do Windows.

## 6. Gates do dono

1. **Smoke:** anexar o mp4 de 20 MB e confirmar que sai. Tentar também um arquivo **acima** de 25 MiB e confirmar que agora aparece o aviso "Arquivo muito grande (25 MB)" — antes esse aviso era invisível.
2. **Redeploy da Edge `waha-send`** — sem ele o timeout de 60 s não vale em produção:
   `npx supabase functions deploy waha-send --project-ref njizaasajkdqptlxddqn`
3. **Merge do PR #356** (nunca mergeado sem OK).
4. **Atenção ao efeito colateral desejado do Toaster:** ~190 toasts que estavam mudos passam a aparecer em todo o app. É o comportamento pretendido pelo código, mas é uma mudança visível ampla — vale um olhar geral no primeiro uso.

## 7. Se precisar de vídeo acima de 25 MiB

Alterar `storage.buckets.file_size_limit` do `whatsapp-media` e subir `STORAGE_BUCKET_MAX_BYTES` na mesma entrega (o teste em `mediaLimits.test.ts` obriga os dois a andarem juntos). Os engines suportam até 64 MiB. É DDL em produção — decisão do dono.
