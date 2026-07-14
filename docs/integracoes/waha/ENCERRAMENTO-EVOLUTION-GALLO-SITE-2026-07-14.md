# Migração Evolution → WAHA — `GALLO Site` (2026-07-14)

> Terceiro capítulo da migração Evolution clássico → WAHA. Primeira conta
> migrada de ponta a ponta **sem nenhum incidente** — os 3 bugs corrigidos
> durante a migração da `Vendas` (reaproveitamento de conversa fechada,
> resiliência a falha transiente, 504 por timeout de mídia) já estavam
> ativos em produção antes de começar. Também documenta a investigação da
> lacuna de backfill de mídia para contas WAHA. Precedente:
> `docs/integracoes/waha/ENCERRAMENTO-EVOLUTION-VENDAS-2026-07-14.md`.

## Contexto

Mesmo método das contas anteriores (criar sessão WAHA → repontar → deslogar
Evolution → parear QR → reiniciar → validar e2e → importar histórico →
sincronizar avatares → excluir conta antiga).

Contas:
- **Evolution (antiga):** `GALLO Site`, `d1d16b14-50ea-4090-b244-68f8b4d88181`,
  `+555599003314`, instância `Agent-GALLO-R9-B1` — **excluída** ao final.
- **WAHA (nova):** `GALLO Site — WAHA`, `32c9bbef-df1f-495f-9794-47897d868a01`,
  sessão `gallo-site-waha-8c2e82`.

## Detalhe particular: failover mútuo com `GALLO Matriz (Oficial)`

Diferente das contas anteriores, a `GALLO Site` tinha uma relação de
**failover mútuo** com a `GALLO Matriz (Oficial)` (`a7b1be48-...`, provider
`meta`, conta dormente mantida por decisão do dono — não faz parte desta
migração): cada uma apontava `failover_account_id` para a outra. Como o WAHA
não participa de failover (por arquitetura), essa relação ficou órfã do lado
da `GALLO Site` assim que a conta virou WAHA. Confirmado que
`delete_whatsapp_account` desativa automaticamente o ponteiro **de entrada**
(o que a `GALLO Matriz` apontava para a conta antiga da `GALLO Site`) no
momento da exclusão — nenhuma ação manual extra foi necessária.

## Execução — sem incidentes

1. Sessão WAHA criada pelo dono via UI.
2. `migrate_whatsapp_account(old, new, dry_run=true)` → conferido (794
   conversas, 4 regras de acesso, 0 templates) → aplicado (`dry_run=false`).
   Confirmado por consulta direta: as 794 conversas migraram, 0 restantes na
   conta antiga.
3. Evolution deslogada → QR pareado → sessão reiniciada → status
   `connected` confirmado.
4. 3 testes e2e, todos na mesma conversa já repontada (`921400d6-...`), sem
   criar duplicata (contagem de conversas verificada estável em 794 durante
   os 3 testes):
   - **Inbound:** mensagem de outro número — chegou na conversa existente.
   - **Outbound:** mensagem pelo composer — status `sent` confirmado.
   - **Eco do celular:** mensagem direto do aparelho físico — chegou como
     `direction: out`, `author_type: seller`, na mesma conversa.
5. Import de histórico: `done:true`, **zero falhas em todos os lotes** —
   maior volume já migrado (~430 chats no servidor WAHA processados).

## Contagem pós-import: 794 → 983 conversas (não é duplicação)

O total de conversas saltou de 794 para 983 (+189) após o import — bem
diferente do padrão mais enxuto visto na `Vendas` (+10). Investigado antes
de dar como certo: **972 clientes distintos em 983 conversas** — apenas
**3 clientes com mais de uma conversa (10 extras)**, o mesmo patamar
residual normal das outras contas. O salto de +189 é composto por clientes
genuinamente novos: threads que o histórico do WAHA trouxe e que nunca
tinham virado uma conversa registrada nesta conta antes (plausível para a
`GALLO Site`, que recebe tráfego mais avulso vindo do site/campanhas do que
uma carteira de vendas tradicional). Não houve duplicação induzida pelo
import.

## Exclusão da conta antiga

`delete_whatsapp_account('d1d16b14-...')` — sucesso, 0 conversas/templates
vinculados. Ponteiro de failover da `GALLO Matriz (Oficial)` desativado
automaticamente (confirmado: `failover_account_id` voltou a `null`).
**Mesma ressalva dos pilotos anteriores:** exclusão feita via SQL direto
(RPC), não pela Edge Function `whatsapp-connect action=delete` — o teardown
remoto da instância Evolution (`Agent-GALLO-R9-B1` em
`evo.ailainteligente.com.br`) não rodou. Instância pode ainda existir no
servidor, órfã do banco.

## Investigação paralela: mídia de histórico importado (WAHA)

Durante esta migração, confirmado por leitura direta de código (não
suposição):

- **Mensagens novas (ao vivo):** mídia é baixada normalmente e vai para o
  Storage (`whatsapp-webhook` → função `attachMedia` → bucket
  `whatsapp-media`) — comportamento idêntico ao que a Evolution sempre teve,
  sem regressão.
- **Histórico importado:** mídia **nunca é baixada** — por design desde a
  spec original (PRD-119, real-inbox, §3, junho/2026), não é regressão desta
  migração. Mensagens de mídia ficam com `media_download_status: "failed"`,
  preservando texto/legenda.
- **Gap real encontrado (não específico de hoje, mas descoberto agora):** a
  ferramenta de reprocessamento posterior (`whatsapp-media-backfill`) só
  suporta contas `meta`/`evolution` — nunca foi estendida para
  `evolution-go`, `openwa` ou `waha`. Investigado (sem implementar, a pedido
  do dono): a API do WAHA tem um endpoint capaz
  (`GET /api/{session}/chats/{chatId}/messages/{messageId}?downloadMedia=true`),
  mas um issue conhecido do próprio projeto WAHA
  ([devlikeapro/waha#857](https://github.com/devlikeapro/waha/issues/857))
  documenta que buscar mídia indisponível (comum para mensagens anteriores
  ao pareamento da sessão — exatamente o caso de todo histórico importado)
  trava por ~60s e retorna 504 em vez de um erro limpo. Estender o backfill
  para WAHA replicaria o mesmo risco de timeout já corrigido no import,
  desta vez por mensagem individual. **Registrado como pendência de
  backlog, não implementado.**

## Lição para as próximas contas

Confirma a lição do documento da `Vendas`: os 3 bugs de código eram
genéricos ao pipeline, não específicos de uma conta — com os fixes ativos,
a migração roda limpa mesmo no maior volume até agora. `VendasExterna` e
`Comercial Lucas` devem seguir o mesmo padrão sem incidentes.

Próximas contas: **VendasExterna**, depois investigar+migrar
**Comercial Lucas** (desconectada há mais de 13 dias — anômala, investigar
antes de aplicar o runbook às cegas).
