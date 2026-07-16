# Migração Evolution → WAHA — piloto `Teste-AILA` (2026-07-13)

> Primeiro capítulo da migração Evolution clássico → WAHA. Documenta o piloto
> (`Teste-AILA`), o incidente de duplicação encontrado no meio do processo, o
> método de correção usado, e as lições para as próximas contas (`Vendas`,
> `VendasExterna`, `Comercial Lucas`, `GALLO Site`). Precedente:
> `docs/integracoes/evo-go/ENCERRAMENTO-EVO-GO-2026-07-07.md`.

## Contexto

Migração proativa (sem incidente forçando), replicando o método e o ritmo da
migração evolution-go → Evolution (criar → repontar → parear → validar e2e →
importar histórico → excluir conta antiga), com um ajuste: como o WAHA é
isolado (não compartilha pipeline de webhook/envio com o Evolution), o
runbook adicionou o passo de deslogar a conta Evolution antes de parear o
WAHA, para evitar dois dispositivos vinculados simultâneos no mesmo número.

Contas:
- **Evolution (antiga):** `Teste-AILA`, `520ef62d-c4fe-49d8-83cd-64726a299767`,
  `+555481169884`, instância `teste-aila-j90` — **excluída** ao final.
- **WAHA (nova):** `Teste-AILA — WAHA`, `793f2d92-7350-4155-ab19-83a7824bcff3`,
  sessão `teste-aila-waha-d792fe`.

## Preparação

Antes do piloto, uma limpeza de contas de teste desconectadas e sem valor
(`migration-test`, `Teste-222`, `Teste-3333` — 338 conversas / 15.195
mensagens, sem pedidos/orçamentos/agendamentos vinculados) foi executada a
pedido do dono, com confirmação explícita por serem dados de teste
descartáveis. Nova função reutilizável `public.migrate_whatsapp_account(old,
new, dry_run)` criada e versionada (`supabase/migrations/20260713170000_migrate_whatsapp_account_rpc.sql`),
substituindo o "SQL assistido" ad-hoc do precedente.

## ⚠️ Incidente: importação de histórico antes do repontamento

O runbook previa criar a sessão WAHA e **aguardar** o repontamento antes de
parear/importar. Na prática, o operador pareou o QR e rodou "Importar
conversas" antes dessas etapas — sem saber que havia uma ordem específica.

**Efeito:** a conta WAHA nova, com o mesmo número físico, importou o
histórico de chat do servidor e criou **45 conversas novas** — 29 delas
duplicando clientes que já tinham conversa na conta Evolution antiga (16 eram
legitimamente novas, sem conversa anterior). Diferente do precedente
evo-go→Evolution (mesmo pipeline, sem esse risco), aqui os dois engines são
isolados e cada um resolve `(customer_id, whatsapp_account_id)` no seu
próprio namespace — não há proteção automática contra isso.

**Diagnóstico:** das 29 conversas duplicadas, 157 mensagens no total — 105
já existiam na conversa antiga (mesmo sentido + mesmo horário, tolerância de
5s: puro re-import de histórico), e **52 eram genuinamente novas** (a maioria
mídia, que o import da WAHA capturou e o Evolution nunca tinha). Em um caso
específico, a conversa WAHA tinha 116 mensagens contra 66 da conversa antiga
— indício de que o histórico disponível no servidor WAHA para aquele número
era mais completo que o que o Evolution jamais capturou via webhook.

**Correção aplicada** (confirmada passo a passo com o dono antes de cada
ação destrutiva):
1. Apagadas as 105 mensagens duplicadas da conversa WAHA (já existiam na
   antiga).
2. Movidas (`UPDATE conversation_id`) as 52 mensagens novas da conversa WAHA
   para a conversa antiga — preserva o que só a WAHA tinha.
3. Excluídas as 29 conversas WAHA agora vazias (confirmado: nenhuma tinha
   pedido/orçamento/agendamento/sessão SDR vinculado antes de excluir).
4. `migrate_whatsapp_account(old, new, false)` — repontou as 29 conversas
   (agora únicas e com histórico completo) para a conta WAHA + copiou a 1
   regra de acesso.

**Resultado final:** conta WAHA com as 45 conversas corretas (29 mescladas +
16 que já eram só dela, zero duplicata); conta Evolution com 0 conversas
restantes.

## Validação e2e

Sessão WAHA já estava `connected` desde o pareamento (a conta Evolution
antiga caiu para `disconnected` sozinha ao parear a nova, sem precisar do
passo explícito de logout previsto no runbook). Teste confirmado pelo dono:
mensagem enviada direto do celular físico apareceu na Inbox **sem duplicar**.

## Exclusão da conta antiga

`delete_whatsapp_account('520ef62d-...')` — sucesso, 0 conversas/templates
vinculados no momento da exclusão. **Pendência:** a exclusão foi feita via
SQL direto (RPC), não pela Edge Function `whatsapp-connect action=delete` —
isso significa que o **teardown remoto da instância no servidor Evolution
(`teste-aila-j90` em `evo.ailainteligente.com.br`) não rodou**. A instância
pode ainda existir no servidor, órfã do banco. Não afeta a plataforma, mas
vale uma limpeza manual futura no painel do Evolution.

## Lição para as próximas contas (Vendas, VendasExterna, Comercial Lucas, GALLO Site)

**Não pausar o operador entre "criar sessão" e "parear/importar" sem um
bloqueio ativo** — instrução em texto não foi suficiente. Para as próximas
contas, repontar as conversas **imediatamente após criar a sessão WAHA**,
antes de qualquer pareamento, elimina essa janela de risco por completo (o
método original do runbook já previa isso — a lição é reforçar a execução
nessa ordem, não o desenho). Se a duplicação acontecer de novo mesmo assim, o
método de correção acima (dedupe por direção+horário, mover mensagens novas,
excluir conversa vazia, só então repontar) provou funcionar sem perda de
dados e pode ser reaplicado.

## Inventário completo de contas Evolution (levantado em 2026-07-13)

| Conta | Status | Conversas (antes da limpeza) |
|---|---|---|
| Vendas | conectada | 1.262 |
| GALLO Site | conectada | 786 |
| Comercial Lucas | desconectada | 374 |
| VendasExterna | conectada | 305 |
| Teste-AILA | migrada (este documento) | 29 → 0 |

`GALLO Matriz (Oficial)` (provider `meta`) não faz parte desta migração —
conta Meta dormente, mantida por decisão do dono (ver memória do projeto).

Próxima conta: **Vendas**.
