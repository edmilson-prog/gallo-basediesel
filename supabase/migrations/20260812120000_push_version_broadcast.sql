-- Aviso de versão nova por push, para o app de atendimento.
--
-- A faixa dentro do app já avisa quem está com ele aberto. Este caminho alcança
-- quem está com o app fechado — que é o caso normal de um PWA no bolso.
--
-- ⚠️ É um BROADCAST: vai para todos os aparelhos inscritos. Essa é a forma exata
-- do incidente de disparo em massa do SDR, então a segurança está na trava, não
-- na intenção:
--
--   * `build_id` é UNIQUE e a linha é escrita ANTES dos envios. Dois workers em
--     corrida — só um ganha, e o outro vê o conflito e desiste.
--   * a função tem janela de silêncio própria (21h–7h em São Paulo), porque a
--     preferência "silenciar das 22h às 6h" mora no aparelho e o servidor não a
--     enxerga.
--   * `/version.json` ilegível não anuncia nada.
--
-- Ordem: aplicar DEPOIS de `npx supabase functions deploy push-version-broadcast
-- --no-verify-jwt`. O cron é inofensivo fora de ordem (a função responde 401 e o
-- pg_net é fire-and-forget), mas evita ruído no log.

create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  -- Chave de deduplicação. Vem do /version.json e é único por deploy.
  build_id text not null unique,
  version text,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.push_broadcasts is
  'Um registro por build anunciado à equipe por push. A unicidade de build_id é o que impede o mesmo deploy de ser anunciado duas vezes.';

-- Tabela de worker: só o service_role escreve e lê. RLS ligada sem policy é
-- deliberado — não há caso de uso para o cliente, e uma policy permissiva aqui
-- exporia a cadência de deploy sem necessidade.
alter table public.push_broadcasts enable row level security;

create index if not exists push_broadcasts_created_at_idx
  on public.push_broadcasts (created_at desc);

-- A cada 2 minutos: barato (um GET no /version.json) e detecta o deploy poucos
-- minutos depois de ele subir.
select cron.schedule(
  'push-version-broadcast-tick',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/push-version-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', public.integration_secret_get('PUSH_DISPATCH_WORKER_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
