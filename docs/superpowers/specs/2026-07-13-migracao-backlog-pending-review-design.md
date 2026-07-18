# Migração assistida do backlog de clientes importados (pending_review) — Design

## Contexto

Ao testar a feature "Qualificar como lead" (PR #260, já mergeada na `main`) descobrimos que ela praticamente nunca aparece na prática: toda conversa de WhatsApp já chega com `conversation.customerId` preenchido, porque o webhook cria automaticamente um `customer` placeholder (tag `pending_review`) na primeira mensagem de um número desconhecido. Investigando isso, veio à tona que o dono importou **todos os clientes da plataforma antiga** para o Gallo Base Diesel — e essa importação também usou o mecanismo de `pending_review`, gerando um backlog grande (~4.771 registros no momento deste documento, número vivo pois a equipe já converte manualmente todo dia pela tela existente).

Diferente de um contato desconhecido genuíno, esses registros são **clientes reais** — já compraram na plataforma antiga. Tratá-los como Leads (candidatos a funil de qualificação) estaria errado: eles devem virar `ICustomer` confirmado diretamente, sem passar pelo funil de vendas.

Esse documento cobre **só essa frente** (a migração do backlog). A reestruturação do fluxo de novas conversas (webhook criar Lead em vez de customer placeholder, aposentar a tela `contact-review`) é uma frente separada e posterior — só começa depois que este backlog chegar a zero.

## Escopo

Todo `customer` com a tag `pending_review` no momento da execução. Os 4 registros já marcados `reviewed_not_customer` ficam de fora — um humano (staff) já revisou e decidiu manualmente que não eram clientes; a migração não deve sobrescrever essa decisão.

Confirmado no dado real: todos os `pending_review` atuais são `type = 'B2C'`, nenhum tem CPF/CNPJ preenchido, todos têm `full_name`. A migração mantém `type = 'B2C'` e `full_name` como estão, e deixa CPF em branco (campo opcional no fluxo de conversão existente — `ConvertContactDialog`/`convert_pending_contact`).

## Resolução do dono (seller_id)

Por registro, nessa ordem:

1. Se existir uma conversa vinculada a esse customer (`conversations.customer_id`) com `assigned_seller_id` preenchido, usa a conversa **mais recente** (`order by last_message_at desc limit 1`) para decidir o dono.
2. Caso contrário (conversa sem atendente atribuído, ou nenhuma conversa vinculada) — cai no dono default temporário: **Edmilson Souza** (`622d1d2c-0223-4133-91cd-0264c1fc29aa`). A redistribuição posterior para o vendedor certo acontece via transferência de carteira (`ICarteiraTransfer`), ferramenta já existente — fora do escopo desta migração.

Levantamento no momento deste documento: ~158 registros caem no critério 1, o restante (~4.613) cai no fallback.

## Mecanismo de execução

A RPC `convert_pending_contact` (já existente, usada pela tela `contact-review`) não serve para uma migração administrativa em lote: ela resolve o ator via `current_seller_id()`/`is_staff()`, que dependem de claims de JWT de uma sessão autenticada — uma migração rodada via conexão administrativa não tem esse contexto.

Em vez disso, a migração replica o mesmo efeito líquido da RPC com um `UPDATE` SQL direto sobre `public.customers`:
- `type = 'B2C'`
- `seller_id = <dono resolvido acima>`
- `tags = array_remove(tags, 'pending_review')`
- `full_name`, `cpf`, demais campos: inalterados

Mais um `INSERT` manual em `public.audit_logs` por registro convertido, creditando a ação (`action = 'convert_pending_contact'`, mesmo formato `before`/`after` que a RPC já grava), pra manter o rastro de auditoria consistente com conversões feitas manualmente pela tela.

Execução em duas etapas, cada uma sob revisão explícita antes de avançar:

1. **Dry-run:** `SELECT` mostrando, por registro (ou agregado por dono resolvido), a contagem e uma amostra de quem receberia qual dono — sem nenhuma escrita.
2. **Execução:** só depois do OK explícito do dono sobre o resultado do dry-run. Roda em uma transação (ou em lotes pequenos, se o volume total pedir por causa de lock/timeout), com contagem de linhas afetadas reportada ao final.

## Fora de escopo

- Qualquer mudança no webhook, em `contact-review`, ou no funil de Leads — pertence à frente 2 (reestruturação), que só começa depois deste backlog zerar.
- Os 4 registros `reviewed_not_customer`.
- Redistribuição fina de carteira para quem cair no dono default — decisão e execução posteriores, via transferência de carteira.
- Preenchimento de CPF/CNPJ — não há esse dado na origem; fica em branco, editável depois pela ficha do cliente normalmente.

## Rollback

Como é um `UPDATE` (não um `DELETE`), o estado anterior é recuperável revertendo `seller_id`, `type` e a tag `pending_review` a partir do `before` gravado em `audit_logs`, caso algo saia errado — não há necessidade de backup extra além do que os workflows de backup semanal já cobrem.
