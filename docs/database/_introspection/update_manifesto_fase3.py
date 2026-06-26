"""Fase 3 closeout — mark the 10 núcleo rows as enriquecido, record Fase 3 in the
progress log, and append the consolidated cross-cutting findings + the surgical
questions the human must answer in Fase 4."""
import os
DB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(DB, "_MANIFESTO-BOOTSTRAP.md")
t = open(p, encoding="utf-8").read()

# flip núcleo rows gerado -> enriquecido
out = []
for line in t.split("\n"):
    if "**nucleo**" in line and "| gerado |" in line:
        line = line.replace("| gerado |", "| enriquecido |")
    out.append(line)
t = "\n".join(out)

t = t.replace(
"- [ ] **Fase 3 — Enriquecimento de contexto**: núcleo (10) completo + suporte leve, com marcador de origem.",
"- [x] **Fase 3 — Enriquecimento de contexto** (2026-06-17): as 10 fichas de núcleo enriquecidas com\n      marcador de origem (descrição, dicionário de colunas-chave, justificativa de RLS, narrativa de\n      regras, perguntas cirúrgicas). Suporte/estrutural permanecem `gerado` (esqueleto). Achados e\n      perguntas consolidados abaixo.")

FINDINGS = """

---

## Achados transversais (Fase 3) `🔍 inferido`

Padrões que apareceram em várias fichas durante o enriquecimento do núcleo:

1. **PK text → uuid (histórico).** As migrations de criação originais (POC) declaravam `id text`
   (seeds como `'store-matriz'`); a migration `20260608174030_convert_transactional_pks_to_uuid.sql`
   converteu as PKs transacionais para `uuid`. A introspecção (verdade do banco hoje) reporta `uuid` —
   as fichas estão corretas; o `text` aparece só nas migrations originais.
2. **CHECK ausente nos enums comerciais.** `orders`, `quotes`, `conversations` **não** têm CHECK
   constraints em `status`/`payment_status`/`channel` etc. — a validação é 100% na aplicação.
   Contrasta com `sellers`/`customers`, que têm CHECKs no banco.
3. **IDs `TEXT` sem FK uuid.** `conversations.lead_id`, `customers.converted_from_lead_id` e
   `quotes.converted_to_order_id` são `text` (não FK uuid) — provavelmente para tolerar IDs de
   origem externa (mock/DINTEC), mas sem integridade referencial.
4. **Cobertura parcial dos providers Supabase.** Algumas colunas existem no banco mas não são
   lidas/mapeadas pelo provider (ex.: `customers.avatar_url` está no SELECT mas não é mapeado em
   `rowToCustomerBase`; `provider_message_id`/`webhook_event_ids` em `messages` só são tocadas pelas
   Edges). Não é divergência de schema, mas de cobertura.

## Perguntas para o humano (Fase 4 — validação)

Cirúrgicas, levantadas no enriquecimento. Confirmar/responder para promover `🔍` → `✅`:

- **Q1 (avatar):** `customers.avatar_url` é selecionado no provider mas **não mapeado** em
  `rowToCustomerBase` ⇒ `avatarUrl` fica `undefined` em produção (Supabase). É bug ou intencional?
- **Q2 (enums sem CHECK):** a ausência de CHECK em `orders`/`quotes`/`conversations` é decisão
  consciente (flexibilidade) ou lacuna de integridade a corrigir?
- **Q3 (IDs text):** os campos `lead_id`/`converted_*` em `text` são permanentes (IDs cross-source)
  ou débito a migrar para `uuid` + FK?
- **Q4 (`processed_events`):** RLS habilitada e **zero policies** ⇒ acessível só por `service_role`
  (webhook). Confirmar que é intencional.
- **Q5 (suspeita de uso):** `model_kits`, `model_kit_items`, `recommendations`, `product_indicators`,
  `asset_combos` ainda são usadas na prática? (classificadas por nome/FK; confirmar.)
- **Q6 (`ai-generate`):** Edge implantada (v4) com fonte **fora** da árvore principal de
  `supabase/functions/`; `list-models` citada na memória mas ausente. Confirmar merge/estado.
- **Q7 (`stores.settings`):** JSONB monolítico (20+ subchaves de `IPlatformSettings`) — normalizar
  alguma subchave em tabela própria ou manter monolítico?
- **Q8 (`stores.id`):** confirmar que a conversão de PK para `uuid` cobriu `stores` (migration POC
  criava `id text`; introspecção reporta `uuid`).
"""
if "## Achados transversais (Fase 3)" not in t:
    t = t.rstrip() + "\n" + FINDINGS
open(p, "w", encoding="utf-8").write(t)
print("manifesto Fase 3 updated; núcleo rows ->", t.count("| enriquecido |"))
