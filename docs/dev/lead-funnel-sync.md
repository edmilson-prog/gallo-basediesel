# Sincronia `leads.stage` → participação no funil

> **Status:** versionada em `supabase/migrations/20260805120000_lead_stage_membership_sync.sql`, **NÃO aplicada**
> **Origem:** débito declarado nas fases 1–2 do multi-funil, pago na fase 3
> **Spec:** `docs/superpowers/specs/2026-07-23-leads-multi-funil-design.md`

## Por que existe

O modelo N:N move a etapa do lead para a **participação** (`lead_funnel_entries.stage_id`). Mas as telas atuais ainda escrevem em `leads.stage` — o snapshot jsonb legado — quando alguém arrasta um card no kanban, converte ou marca como perdido.

Enquanto nenhuma tela **lê** a etapa da participação, os dois convivem sem consequência. A **fase 4** troca as colunas do board pelas etapas do funil. A partir daí, um lead movido no kanban ficaria com `leads.stage` e `lead_funnel_entries.stage_id` discordando — **em silêncio**, sem erro e sem sinal.

Este trigger fecha essa janela.

## O que sincroniza

| Campo | Sincroniza? | Por quê |
|---|---|---|
| **etapa** | **sim**, só no funil padrão | é o que a fase 4 passa a ler |
| desfecho (`converted_to_customer_id`, `loss_reason`) | **não** | é por participação — perder num funil não fecha os outros (decisão 6 do dono) |
| valor estimado | **não** | vive na participação; copiar o valor único do lead para todo funil é exatamente a dupla contagem que o modelo existe para evitar (decisão 5) |

**Só o funil padrão.** Mover um lead num funil não pode mexer na posição dele nos outros — é o ponto inteiro do N:N (decisão 1 do dono). O `Geral` é o único destino estável e irrestrito, então é o único que pode espelhar a escrita legada sem ambiguidade.

## Como casa a etapa

Pela **mesma regra do backfill** (`20260723122000`): nome truncado em 24 caracteres, comparação case-insensitive, e nunca resolvendo para uma etapa terminal (`kind not in ('ganho','perda')`).

Divergir dessa regra faria a sincronia discordar da migration que criou as próprias linhas que ela atualiza.

## Best-effort, de propósito

Se o nome da etapa não casar com nada, o trigger **não faz nada** e o UPDATE do lead segue normalmente. Não levanta exceção.

O motivo: derrubar a edição de um lead porque um nome de etapa divergiu troca um problema silencioso por um bloqueio na tela. O primeiro é ruim; o segundo é pior e mais visível para o usuário errado.

## Dois detalhes que não são estilo

- **`security definer` + `set search_path`** — as funções irmãs têm; `assert_funnel_has_terminal_stages` precisou de correção justamente por faltar.
- **`stage_id is distinct from v_stage` no `WHERE`** — sem isso, qualquer edição não relacionada do lead reescreveria `entered_stage_at` e zeraria o contador de "dias na etapa" por funil, que é o campo que `ILeadFunnelEntry` existe para manter honesto.

## Aplicação

⚠️ **A migration está versionada e NÃO aplicada.** Pela regra do projeto (`CLAUDE.md`), mergear o PR não aplica migration — a aplicação em produção é manual e exige OK explícito do dono.

Ensaio já executado em 2026-08-05 contra o schema real, dentro de transação com `ROLLBACK`: passou sem erro, e `pg_trigger` confirma que nada ficou.

Para aplicar:

```bash
{ echo "begin;"; cat supabase/migrations/20260805120000_lead_stage_membership_sync.sql; echo "commit;"; } \
  | supabase db query --linked -f -
```

Depois, confirmar:

```sql
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname = 'leads_sync_default_funnel_stage';
```

## O que isto NÃO resolve

A direção inversa — participação → `leads.stage` — não existe e não deve existir na v1. Quando a fase 4 passar a escrever direto na participação, o snapshot legado `leads.stage` fica para trás por definição, e a spec (§14) já prevê sua remoção física numa migration posterior.
