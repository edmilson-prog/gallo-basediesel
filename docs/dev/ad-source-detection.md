# Detecção de origem por anúncio (Click-to-WhatsApp Ads)

Conversas que começaram (ou foram retomadas mais recentemente) por um
anúncio/post do WhatsApp ganham `conversations.ad_referral` (jsonb),
extraído de `contextInfo.externalAdReplyInfo` na mensagem que carregou o
referral. Badge "📢 Anúncio" na lista (`AdSourceBadge`) e no painel de
Atendimento (`AtendimentoTab`).

## Escopo e confiança por motor

- **Evolution-Go (whatsmeow):** schema confirmado via
  `docs/integracoes/evo-go/doc.json` (`ContextInfo_ExternalAdReplyInfo`).
- **Evolution v2 (Baileys) / WAHA (GOWS/whatsmeow):** casing dos campos é uma
  hipótese fundamentada (Baileys `WAProto` público / mesmo shape do
  whatsmeow), **não confirmada contra um payload real**. `extractAdReferral`
  de cada engine degrada para `undefined` em qualquer campo ausente/
  inesperado — nunca derruba o parse da mensagem.

## Runbook de verificação pós-deploy (pendente)

1. Peça para o dono clicar num anúncio/post de teste que abre o WhatsApp de
   um número conectado via Evolution v2 e/ou WAHA.
2. Confira `conversations.ad_referral` da conversa recém-criada:
   `select ad_referral from conversations where customer_id = '<id>' order by created_at desc limit 1;`
3. Se vier `null` (mensagem claramente veio de anúncio, mas não capturou):
   capture o payload bruto real (mesmo padrão já usado no projeto para
   descoberta de shape — log temporário/webhook de depuração em n8n) e
   ajuste `extractEvolutionAdReferral`/`extractWahaAdReferral` para o shape
   observado.
4. Repita para o outro motor.

## Gap conhecido

`search_conversations`/`list_conversations` (busca textual e filtro "Minhas
conversas") não retornam `ad_referral` ainda — os `RETURNS TABLE` dessas RPCs
precisam ser estendidos; fica para o follow-up "filtro + métrica de origem".
