# Encerramento do Evolution Go — 2026-07-07

> Documento de fechamento do capítulo evo-go (whatsmeow). Preserva a decisão,
> o método da migração de dados, a validação e2e e as lições operacionais.
> Os relatórios técnicos referenciados vivem nesta mesma pasta.

## Decisão (2026-07-06)

Após os fixes do QR falso (PR #251) e do auto-reconnect do canal de pareamento
(PR #252), o pareamento no evolution-go **seguiu falhando na prática**. Decisão
do dono: **abandonar o evo-go e ficar apenas com o Evolution API legado**
("vamos ficar com o que funciona"). O provedor Meta segue modelado e dormente.

## Migração das conversas (Go → legado)

A plataforma bloqueia excluir instância com conversas (`HAS_LINKED_DATA`,
guard atômico no RPC `delete_whatsapp_account`), então as conversas foram
**repontadas** antes da exclusão. Fatos do modelo que tornaram isso um UPDATE
de uma coluna:

- Tudo de uma conversa (mensagens, mídias, tags, notas, participantes,
  histórico de atendimento) pende de `conversation_id`; o vínculo com a
  instância é só `conversations.whatsapp_account_id` (FK simples, sem unique
  composto).
- `whatsapp_account_access_rules` tem `ON DELETE CASCADE` → as regras de
  acesso foram **copiadas** para a conta nova (INSERT…SELECT com guarda
  NOT EXISTS).
- O webhook resolve conversa por `(customer_id, whatsapp_account_id)` →
  continuidade perfeita após repontar. Ordem segura: **criar instância nova →
  repontar → parear QR** (parear antes criaria conversas duplicadas).

Execução em 2026-07-07 via SQL assistido (CTE atômico por par de contas),
com conferência exata de contagens antes/depois:

| Conta Go | Conta legada nova | Conversas | Mensagens | Regras |
| --- | --- | --- | --- | --- |
| Teste-AIL-Go-VI (`13e0e95c`) | `migration-test` (`c8ab6842`, `migration-test-5eg`) | 299 | 14.215 | 1 |
| Vendas (`3e6e85a6`) | `Vendas1` (`9ceb9256`, `vendas1-iij`) | 728 | 21.796 | 7 |
| Vendas Externa (`34aa2346`) | `VendasExterna1` (`382980ea`, `vendasexterna1-n9a`) | 298 | 10.180 | 3 |

**Total: 1.325 conversas / 46.191 mensagens. Zero conversas restantes em
contas Go.** A conta piloto Go (Teste-AIL-Go-VI) foi excluída pela plataforma
com sucesso — fluxo de exclusão validado e2e.

## Validação e2e do piloto (2026-07-07)

Com o chip +55 54 8157-2275 pareado na `migration-test-5eg`, os 3 testes
passaram **na conversa migrada existente** (sem duplicação):

1. **Continuidade:** inbound de outro número caiu na conversa migrada.
2. **Eco do celular:** mensagem enviada pelo próprio aparelho espelhou na
   plataforma — **fecha a investigação original de 2026-07-03**: o eco ao vivo
   nunca funcionou no evo-go (os "ecos históricos" eram bulk-import) e
   funciona por design no Evolution legado (`fromMe=true` → outbound-echo).
3. **Envio pela plataforma:** entregue e lido, com status rastreado.

O import de histórico pull-based (`findChats`/`findMessages`) rodou após o
pareamento e populou as conversas migradas sem duplicar (o parser do webhook
só processa `messages.upsert`; history-sync não entra por webhook).

## ⚠️ Lição operacional crítica (Evolution legado)

Após **criar instância → registrar webhook → parear QR**, a sessão do
Evolution **não entrega webhooks** — o registro responde 201, `MESSAGES_UPSERT`
habilitado, instância `open`, e mesmo assim zero entregas, sem erro em lugar
nenhum. Sintoma: mensagens não chegam à plataforma; diagnóstico: zero
eventKeys da instância em `processed_events` enquanto outra instância processa
normalmente.

**Remédio: "Reiniciar instância"** (tela de contas) logo após o pareamento —
a sessão recarrega a config de webhook e a entrega destrava imediatamente.
Receita padrão para novos pareamentos: **parear → reiniciar → testar inbound**.

## Errata dos relatórios

`ECO-CELULAR-INVESTIGACAO-2-vps-agent.md` contém uma premissa **errada** não
corrigida no corpo: a tabela que afirma "Vendas Externa ecoa 5.289 mensagens"
contava mensagens de **bulk-import**, não ecos ao vivo. A conclusão correta
(eco ao vivo nunca funcionou no Go) está em `ECO-CELULAR-RELATORIO-2-vps-agent.md`.

## Pendências na data deste documento

- Parear QR de `Vendas1` (+55 55 9985-0110) e `VendasExterna1`
  (+55 55 9975-5317) — **com o restart pós-pareamento**.
- Excluir as 2 contas Go restantes (Vendas `3e6e85a6`, Vendas Externa
  `34aa2346`) — ambas com 0 conversas.
- Avisar o agente do VPS para desligar o container/VPS do evo-go
  (o script `go-orphan-cleanup.mjs` desta pasta ajuda a listar/limpar
  instâncias penduradas no servidor antes do desligamento).
- `migration-test` permanece como arquivo do histórico do chip de teste
  (não deletável enquanto detiver as 299 conversas — by design).

## Índice dos relatórios desta pasta (capítulo evo-go)

- `ECO-CELULAR-INVESTIGACAO-vps-agent.md` / `-2` — investigação do eco do
  celular (ver errata acima).
- `ECO-CELULAR-RELATORIO-vps-agent.md` / `-2` — relatórios finais do eco.
- `INCIDENTE-2026-07-06-conexao-total-vps-agent.md` e
  `RELATORIO-INCIDENTE-2026-07-06-vps-agent.md` — queda total por vazamento de
  conexões Postgres no evo-go (pool esgotado por tentativas de pareamento).
- `go-orphan-cleanup.mjs` — limpeza pontual de instâncias órfãs no servidor Go
  (pré-fix PR #177).
