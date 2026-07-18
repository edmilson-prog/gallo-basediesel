# Checkpoint — Reconciliação do 9º dígito via oráculo WAHA (2026-07-17)

## Contexto

Descoberto no smoke do caso RODAWE (mesmo dia): o ERP DINTEC grava celulares no formato moderno (com o 9º dígito), mas muitos contatos têm conta WhatsApp antiga **sem o 9** — o JID com 9 não é canônico e o GOWS/WAHA falha o envio com HTTP 500 sem corpo. Operação aprovada pelo dono ("pode fazer a reconciliação do 9º dígito").

## Método

`GET /api/contacts/check-exists` do WAHA como **oráculo**: consultado com qualquer variante, devolve o `chatId` **canônico** (o usync do WhatsApp normaliza o 9º dígito). Critério do projeto (PR #302) respeitado: nenhum 9 inserido/removido às cegas — só com confirmação do WhatsApp. Script one-off versionado: `scripts/waha-ninth-digit-reconcile.ts` (probe read-only, concorrência 4; sessão `vendas-waha-6ea34d`).

## Escopo e números

Sondados **1.902 números distintos** (1.948 clientes DINTEC com `+55` e 12–13 dígitos — os 1.387 do backfill DDI + 561 que já tinham DDI, mesma origem ERP):

| Classe | Qtde | Ação |
|---|---|---|
| `same` (confere com o WhatsApp) | 834 | Nenhuma |
| `ninth_removed` (ERP com 9, WhatsApp sem 9) | 802 | **758 clientes corrigidos** (para o canônico sem 9); ~68 clientes em colisão preservados |
| `ninth_added` (ERP sem 9, WhatsApp com 9) | 2 | **2 clientes corrigidos** (DDD 21/RJ) |
| `not_on_whatsapp` | 264 | Só relatório (fixos/números mortos; `whatsapp_status` NÃO alterado — decisão futura) |
| erros de probe | 0 | — |

Verificação pós-apply: distribuição DINTEC `+55` passou a 1.737 (12 díg.) + 211 (13 díg.); 969−211 = 758 confere exatamente com o rowcount esperado. Amostras conferidas individualmente (0 remanescentes com 9, canônico presente).

## Colisões (~68 clientes — NÃO tocados, casos de merge)

Padrão idêntico ao Lote B do backfill DDI: o registro DINTEC "com 9" tem **0 conversas** e o cliente canônico (sem 9) já existe com o histórico — são duplicados a mesclar (repontar conversas quando houver + dados DINTEC → registro canônico + apagar o duplicado). Inclui o caso GILBERTO FISCHER (`0e179d08` → canônico `b3eff7a7`, 1 conversa a repontar). Lista completa reproduzível com:

```sql
-- clientes DINTEC cuja variante com 9 colide com o canônico existente na mesma loja
select c.id, c.phone, coalesce(c.nome_fantasia, c.full_name),
       b.id as canon_id, b.phone as canon_phone
from customers c
join customers b on b.store_id = c.store_id and b.id <> c.id
  and b.phone_digits = substring(c.phone_digits,1,4) || substring(c.phone_digits,6)
where c.dintec_codcli is not null and length(c.phone_digits) = 13
  and substring(c.phone_digits,5,1) = '9';
```

## Auditoria

- Backfill DDI: `audit_logs` `7ede8cd8` (`customers_phone_ddi_backfill`, 1.387 linhas).
- Fix pontual RODAWE: `d85fc155` (`customer_phone_canonical_fix`).
- Esta reconciliação: `6f59f4e1` (`customers_phone_ninth_digit_reconcile`, payload com todas as contagens).

## Pendências

1. Merge dos duplicados: ~68 colisões do 9º dígito + 20 pares do Lote B do DDI (todos com histórico no registro canônico).
2. `not_on_whatsapp` (264): decidir se marca `whatsapp_status` ou apenas ignora.
3. Lote D (67 leads sem DDI) — não aprovado ainda.
4. Estrutural (código): webhook `@lid` poderia adotar o pn canônico no cliente casado por tolerância de 9º dígito (evita recriar o desvio em clientes futuros); avaliar num PR próprio.
