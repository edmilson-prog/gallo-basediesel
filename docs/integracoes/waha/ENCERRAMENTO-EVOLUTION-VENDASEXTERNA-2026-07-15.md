# Migração Evolution → WAHA — `VendasExterna` (2026-07-15)

> Quarto capítulo da migração Evolution clássico → WAHA. Primeira conta
> migrada sem nenhum bug novo de código — os 3 fixes corrigidos durante a
> migração da `Vendas` (reaproveitamento de conversa fechada, resiliência a
> falha transiente, 504 por timeout de mídia) já estavam ativos em produção
> desde antes de começar. Precedente:
> `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-GALLO-SITE-2026-07-14.md`.

## Contexto

Mesmo método das contas anteriores (criar sessão WAHA → repontar → deslogar
Evolution → parear QR → reiniciar → validar e2e → importar histórico →
sincronizar avatares → excluir conta antiga → documentar).

Contas:
- **Evolution (antiga):** `VendasExterna`, `382980ea-7fa6-493f-982e-b43da5931868`,
  `+555599755317`, instância `vendasexterna1-n9a` — **excluída** ao final,
  pelo dono, via UI.
- **WAHA (nova):** `VendasExterna — WAHA`, `5cfd2beb-ca13-4037-8c88-1832e4039ac9`,
  sessão `vendasexterna-waha-17d2dc`.

## Repontamento

`migrate_whatsapp_account` rodado como dry-run e depois aplicado **antes** de
qualquer pareamento (lição das contas anteriores). Resultado:

- 305 conversas movidas
- 3 regras de acesso copiadas
- 0 templates vinculados à conta antiga

Verificado por consulta direta: 0 conversas restantes na conta Evolution
antiga, 305 na WAHA nova, imediatamente após a aplicação.

## Pareamento e validação e2e

Evolution deslogada, QR pareado na sessão WAHA, sessão reiniciada, status
`connected` confirmado. 3 testes e2e, todos confirmados por evidência direta
no banco (não só relato) antes de prosseguir:

- **Inbound:** mensagem de outro número ("Isos") — `direction:in`,
  `status:delivered`, conversa existente, sem duplicar.
- **Eco do celular:** mensagem enviada direto do aparelho pareado — chegou
  via evento `message.any` do webhook, `direction:out`/`author_type:seller`,
  mesma conversa, sem duplicar.
- **Outbound pelo composer:** mensagem enviada pela plataforma
  ("Teste-de-envio-(Isos)") — confirmada como `direction:out`,
  `author_type:seller`, `status:sent`, sem passar pelo caminho de eco
  (exercita o pipeline `waha-send`, que já foi causa de um bug real nesta
  integração — PR #273).

**Nota de processo:** nas duas primeiras rodadas desta migração, o teste de
outbound pelo composer inicialmente não tinha sido executado de fato — a
confirmação só veio depois de cruzar `integration_logs`/`messages` e pedir
para o teste ser refeito. Reforça o padrão já estabelecido nesta migração:
"validado" só conta com evidência de banco, não só relato.

## Importar histórico

Resultado do "Importar conversas" na conta WAHA nova:

- 236 conversas processadas
- 0 conversas novas criadas
- 0 mensagens importadas
- 0 contatos novos (pendentes)
- 0 grupos ignorados
- 4.704 mensagens "já existiam" (puladas)

**Diferente de `GALLO Site`** (que teve +189 conversas genuinamente novas,
tráfego avulso nunca antes registrado), a `VendasExterna` não trouxe nada
novo do import — porque o repontamento já movia as conversas **com todo o
histórico de mensagens já persistido** (mensagens seguem `conversation_id`,
que não muda ao repontar; só `conversations.whatsapp_account_id` muda). O
import WAHA reencontrou os mesmos 236 chats já materializados como
conversas repontadas e não teve nada incremental a fazer — resultado
esperado e correto, não uma falha silenciosa.

## Sincronizar fotos

- 79 contatos processados
- 66 fotos encontradas
- 13 sem foto pública

## Contagem final e verificação de duplicatas

- **306 conversas** na conta WAHA nova (305 repontadas + 1 conversa nova
  criada pelo próprio teste de outbound, para um contato até então inédito).
- **0 conversas** na conta Evolution antiga.
- **0 clientes** com mais de uma conversa vinculada à conta WAHA — nenhuma
  duplicata residual, diferente do patamar de 3-10 extras visto nas contas
  anteriores.

## Exclusão da conta antiga

Conta Evolution `382980ea-7fa6-493f-982e-b43da5931868` excluída pelo dono
via UI — confirmado por ausência na tabela `whatsapp_accounts`. **Mesma
ressalva das migrações anteriores:** o teardown remoto da instância
Evolution (`vendasexterna1-n9a`) não roda automaticamente por esse caminho
quando a exclusão é feita via SQL/RPC direto em vez da Edge Function
`whatsapp-connect action=delete` — a instância pode continuar existindo
órfã no servidor Evolution.

## Código

Nenhuma mudança de código nesta migração — os 3 fixes do pipeline de
import já estavam em produção desde a migração da `Vendas`
(`docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDAS-2026-07-14.md`), branch
`fix/waha-import-duplicate-and-retry`, PR
[#279](https://github.com/edmilson-prog/gallo-basediesel/pull/279) (já
mergeada).

## Lição para as próximas contas

Confirma a lição das duas migrações anteriores: os 3 bugs de código eram
genéricos ao pipeline, não específicos de uma conta. Ganho adicional
observado aqui: **contas que já tinham sido corretamente repontadas antes
do pareamento herdam o histórico completo de mensagens de graça** — o
import de chat history da WAHA serve principalmente para achar conversas
*genuinamente novas* que a Evolution nunca tinha capturado (caso de
`GALLO Site`), não para reconstituir histórico que a repontagem já trouxe.

Também reforça, de forma mais geral: pedidos de "pular" um passo de
validação em produção (e2e, import, exclusão) foram checados contra o
banco antes de aceitar como concluídos nesta migração — em 2 dos 3 casos
(outbound do composer, import de histórico), a checagem revelou que o
passo ainda não tinha rodado de fato, apesar do relato inicial. Vale manter
esse padrão nas próximas contas.

Próximas contas: **Comercial Lucas** (desconectada há mais de 13 dias —
investigar antes de aplicar o runbook às cegas), depois **GALLO Matriz
(Oficial)** permanece **fora** desta migração (conta `meta`, dormente,
mantida por decisão do dono).
