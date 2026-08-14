# Redistribuição da carteira do Fernando — 2026-08-14

Registro da operação que redistribuiu a carteira inteira de Fernando Mello Muniz Gallo entre
Tiago da Rosa Oliveira e Ramon Schimidt, executada em produção em 2026-08-14.

> **Sobre os dados desta operação:** as listas nominais de clientes (nome, documento, telefone,
> e-mail, faturamento) **não são versionadas** — este repositório é público. Elas vivem em dois
> lugares: no arquivo de backup local, fora do git, e na tabela `carteira_transfers`, que guarda
> os `customer_ids` exatos de cada metade.

## Resultado

| Vendedor | Antes | Depois |
|---|---|---|
| Fernando Mello Muniz Gallo | 3.114 | **0** |
| Tiago da Rosa Oliveira | 9 | **1.566** |
| Ramon Schimidt | 0 | **1.557** |

Fernando concentrava 98% da base — herança do import do ERP DINTEC, que atribuiu todos os
clientes importados a ele. Os 9 clientes que já eram do Tiago **não entraram no sorteio** e
permaneceram com ele; daí terminar com 1.566 e não 1.557.

Intocados: 27 clientes de outros vendedores, 30 sem dono, todas as conversas, mensagens e leads.
A base seguiu com os mesmos 3.180 clientes — nada criado nem apagado.

## Regra do sorteio

Aleatório, porém **determinístico e auditável**: em vez de `random()`, a ordem vem de
`md5(customers.id::text || 'gallo-carteira-2026-08-14')`. Rodar a mesma expressão sobre os mesmos
ids reproduz a divisão idêntica, o que permite conferir o resultado depois.

O sorteio é **estratificado** em três faixas, alternando par/ímpar dentro de cada uma, para que os
clientes de maior valor fiquem igualmente divididos:

| Estrato | Critério | Tiago | Ramon |
|---|---|---|---|
| `A_top20` | Top 20 do relatório de recorrentes de 12 meses | 9 | 9 |
| `B_recorrente` | Demais clientes recorrentes do relatório | 108 | 108 |
| `C_demais` | Restante da carteira | 1.440 | 1.440 |
| **Total** | | **1.557** | **1.557** |

Um sorteio único sobre os 3.114, sem estratos, daria 127 recorrentes para um lado contra 107 para
o outro — empate no total, desequilíbrio no valor. Por isso a estratificação.

## Padrão de execução (reaproveitável)

A mutação rodou como um único `DO $$ ... $$` atômico com **três guardas**. Se qualquer uma
dispara, a transação inteira é revertida e nada é gravado:

1. **Entrada** — aborta se a carteira do Fernando não tiver exatamente 3.114 clientes
2. **Divisão** — aborta se o sorteio não produzir 1.557 / 1.557
3. **Resultado** — aborta se o estado final não for Fernando 0, Tiago 1.566, Ramon 1.557

O `UPDATE` carrega `and seller_id = <fernando>` na cláusula, de modo que um cliente que já tivesse
mudado de dono no meio do caminho não seria tocado.

Este é o molde recomendado para qualquer mutação em massa em produção.

## Auditoria e reversão

A operação gravou **2 linhas** em `public.carteira_transfers` (`type='permanent_batch'`,
`status='active'`), cada uma com o array `customer_ids` do respectivo destino. É o formato que a
tela **Gestão de carteira** lê, então a reversão pode ser feita pela própria interface.

Pelo banco:

```sql
begin;
update public.customers
   set seller_id = '<fernando>'
 where id in (
   select unnest(customer_ids) from public.carteira_transfers
    where type = 'permanent_batch'
      and from_seller_id = '<fernando>'
      and created_at::date = '2026-08-14'
 );
update public.carteira_transfers set status = 'reverted'
 where type = 'permanent_batch'
   and from_seller_id = '<fernando>'
   and created_at::date = '2026-08-14';
commit;
```

Atenção ao escrever qualquer coisa nessa tabela: `created_by` é FK para `sellers(id)` — precisa do
`sellerId`, nunca do `auth_user_id`. Ver `docs/dev/` e o histórico do PR #368.

## Pendência aberta: o acesso não acompanhou a carteira

Carteira é apenas **um dos dois portões** de acesso. As conversas continuam presas ao portão de
**instância de WhatsApp**, que esta operação não alterou. Situação após a redistribuição:

| Instância | Conversas da nova carteira | Tiago | Ramon | Cegas |
|---|---|---|---|---|
| Vendas — WAHA | 261 | sim | sim | 0 |
| Comercial Lucas (Evolution) | 116 | **não** | **não** | 116 |
| VendasExterna — WAHA | 95 | **não** | sim | 42 |
| GALLO Site — WAHA | 87 | sim | **não** | 43 |

**201 conversas estão invisíveis** para quem hoje é dono do cliente. Fechar isso exige 4 concessões
em `whatsapp_account_access_rules`:

1. Tiago → Comercial Lucas
2. Ramon → Comercial Lucas
3. Tiago → VendasExterna
4. Ramon → GALLO Site

Ressalva: "Comercial Lucas" é a única instância que ainda roda no Evolution e tem migração para
WAHA pendente. Liberar acesso ali funciona, mas é uma instância que vai trocar de motor.
