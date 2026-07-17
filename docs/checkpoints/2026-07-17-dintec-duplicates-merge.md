# Checkpoint — Merge de duplicados DINTEC + pendências da reconciliação (2026-07-17, tarde)

Fecha as pendências abertas pelos checkpoints do mesmo dia (`2026-07-17-phone-ddi-backfill.md` e `2026-07-17-ninth-digit-reconcile.md`). Todas as operações aprovadas pelo dono, aplicadas via SQL assistido com trilha em `audit_logs`.

## 1. Merge de duplicados (audit `0583ef29`)

Dry-run revelou que os "~88 pares de colisão" não eram uniformes:

| Categoria | Pares | Ação |
|---|---|---|
| Canônico sem codcli, 1 dupe (mesmo cliente) | **38** | **MERGE** |
| Canônico recebendo 2–3 dupes com codclis distintos | 11 | Sem merge (ver §2) |
| Canônico já com OUTRO codcli (2 cadastros ERP na mesma linha) | 40 | Sem merge (ver §2) |

**Regra do merge (38 pares):** o canônico (contato WhatsApp, dono do histórico) **adota a identidade ERP** — `type`, `cnpj`, `razao_social`, `nome_fantasia`, `cpf` e o bloco `dintec_*` completo; o nome anterior do contato é preservado em `contact_name` (B2B); tag `pending_review` removida (25 estavam ocultos da tela Clientes); mantém telefone canônico, avatar, carteira, status e histórico do canônico. FKs repontadas (11 tabelas; sem colunas órfãs — inventário conferido): 25 veículos, 1 conversa (GILBERTO FISCHER `0e179d08`→`b3eff7a7`), 1 activity. Dupes apagados. Transação única com guardas de contagem.

## 2. Linhas compartilhadas — telefone normalizado sem merge (audit `0a417ee3`)

Os 51 registros restantes são **clientes ERP distintos compartilhando a mesma linha WhatsApp** (codclis diferentes; mesclar apagaria um código ERP — inclusive casos de duplicação dentro do próprio DINTEC, ex. AUTO POSTO VALCIR GABBI codcli 2892 vs 1299). Ação: só `phone` → formato canônico (+55 / sem o 9, confirmado pelo probe check-exists), ambos os cadastros mantidos. 43 do 9º dígito + 8 do DDI.

## 3. whatsapp_status a partir do probe (audit `b49d9e52`)

- **284 clientes → `invalid`** (264 dígitos `not_on_whatsapp` do probe; maioria telefone fixo). Arma o gate de envio existente (override staff disponível).
- **1.684 clientes → `valid`** (todos os DINTEC +55 probados que existem no WhatsApp).

## 4. Lote D — leads (audit `f737295f`)

**67 leads** sem DDI corrigidos (`'+55'+dígitos`, DDD válido). A guarda revelou 13 leads extras com DDD **inexistente** — são leads fictícios de demo (nomes faker: "Srta. Meire Costa", "Dr. Gael Saraiva"; DDDs 20/30/36/60/70...) que vazaram para prod; deixados como estão (limpeza de dados demo é assunto separado).

## 5. Triagem dos casos residuais (audit `adcf88a8`)

| Caso | Ação |
|---|---|
| "Teste" `5554981169884` | → `+555481169884` (canônico confirmado pelo WhatsApp, sem o 9) + `valid` |
| Edmilson `555498152275` | → `+555498152275` (só formato; nenhuma variante tem WhatsApp) |
| 4 prefixos mortos (57/599/595/59) | check-exists = não existe → `whatsapp_status='invalid'`, fone mantido |
| `+0` (1 conversa) | fone limpo + `invalid`; conversa intacta |

## 6. Re-sync de avatares (audit `a92c48af`)

`avatar_synced_at` resetado em **2.674** clientes DINTEC carimbados sem avatar (muitos foram consultados com o número pré-correção); o job re-sincroniza com o número canônico.

## Estado final verificado

- 0 colisões de 9º dígito restantes; 0 leads sem DDI (DDD válido); 0 carimbos de avatar pendentes de reset.
- `whatsapp_status`: 1.685 valid · 289 invalid · 6.429 unknown.
- 4 telefones sem `+` restantes = os 4 mortos (intencional, fone preservado para referência do ERP).

## Pendência remanescente (única)

**Estrutural (código):** webhook `@lid` adotar o número canônico no cliente casado por tolerância de 9º dígito — evita recriar o desvio em clientes futuros. PR próprio, não iniciado.
