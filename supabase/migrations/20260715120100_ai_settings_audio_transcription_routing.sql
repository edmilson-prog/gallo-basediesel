-- supabase/migrations/20260715120100_ai_settings_audio_transcription_routing.sql
-- A tela Configurações → IA → Funcionalidades (AiFeaturesTab.tsx) só desenha o
-- que já está persistido em ai_settings.routing (settings.routing.map(...)), e
-- updateFeatureRouting só EDITA uma entrada existente — não cria. Como o
-- registro id=1 já existe em produção com 5 entradas, é preciso empurrar a 6ª
-- via UPDATE (idempotente: só insere se ainda não existir).
--
-- Fica desligada por padrão (enabled=false) — o dono liga manualmente na tela
-- depois de confirmar a chave OPENROUTER_API_KEY no Vault. providerId é fixado
-- em 'openrouter' porque é o único provedor com adapter de transcrição
-- (callOpenRouterTranscription); trocar de provedor pela UI genérica não tem
-- efeito real até outro adapter existir (mesmo comportamento já aceito hoje
-- para a rota part_identification, roteada a 'google' sem adapter Google).
-- params/systemPrompt não têm uso em transcrição — ficam neutros só para
-- satisfazer o tipo IAiFeatureRouting, que os exige.

update public.ai_settings
set routing = routing || jsonb_build_object(
  'feature', 'audio_transcription',
  'enabled', false,
  'providerId', 'openrouter',
  'model', 'openai/whisper-1',
  'params', jsonb_build_object('temperature', 0, 'maxTokens', 0),
  'systemPrompt', ''
)
where id = 1
  and not exists (
    select 1 from jsonb_array_elements(routing) r
    where r ->> 'feature' = 'audio_transcription'
  );
