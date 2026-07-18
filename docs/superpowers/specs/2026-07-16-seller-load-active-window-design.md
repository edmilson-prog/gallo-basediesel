# Carga por vendedor v2 — recorte de atividade pelo período da aba

**Data:** 2026-07-16 · **Status:** aprovado pelo dono · **Escopo:** card "Carga por vendedor" da aba Atendimento (`/app/inicio`)

## Problema

A métrica atual conta **todas** as conversas abertas (`aguardando` / `em_andamento` /
`aguardando_cliente`) atribuídas ao vendedor, sem recorte temporal. Conversas
antigas paradas inflam o número e distorcem a leitura de carga: com dados reais
de produção (2026-07-16), Ramon aparecia com 100 conversas, mas **75 delas não
tinham atividade há mais de 7 dias** — enquanto o vendedor com mais movimento
real (Tiago, 84 ativas na semana) e o com mais trabalho pendente (Welligton, 22
clientes aguardando resposta) ficavam visualmente atrás dele.

## Decisões (com o dono, 2026-07-16)

1. **Semântica escolhida: "ativas no período"** — conversas abertas atribuídas
   ao vendedor cuja `last_message_at` cai dentro do período selecionado.
   Alternativas consideradas e descartadas: "esperando resposta" (cliente falou
   por último), barra composta com 2 números, e manter a métrica atual com
   rotina de arquivamento.
2. **Janela: segue o filtro da aba** (24h / 7 dias / 30 dias / custom), como o
   restante dos cards. Alternativas descartadas: janela fixa de 7 dias e janela
   configurável.

Efeito prático (dados reais, 2026-07-16): 30d → Tiago 96, Welligton 84,
Ramon 52, Lucas 26. 7d → Tiago 84, Welligton 56, Ramon 25, Lucas 18.

## Design

### RPC (migration)

Recriar `public.service_volume_seller_load` com dois parâmetros novos
opcionais: `(p_store_id uuid, p_seller_id uuid default null, p_from
timestamptz default null, p_to timestamptz default null)`.

- `p_from`/`p_to` `null` = sem recorte (comportamento atual) — o frontend já
  deployado continua funcionando na janela migration→deploy.
- Recorte aplicado: `and (p_from is null or c.last_message_at >= p_from) and
  (p_to is null or c.last_message_at <= p_to)`.
- ⚠️ A função de 2 parâmetros deve ser **dropada** antes do `create` — recriar
  com aridade diferente cria um *overload* e o PostgREST passa a falhar por
  ambiguidade na chamada nomeada.
- Demais semânticas intactas: guard `owner/manager` + `eff_store`, exclusão
  `demo-seed`, statuses abertos, `assigned_seller_id is not null`, ordenação
  `active_count desc, seller_id`.

### Frontend

- `ISellerLoadParams` ganha `from?: ISO8601; to?: ISO8601`.
- `supabaseAtendimentoMetricsProvider.getSellerLoad` passa `p_from`/`p_to`
  (`?? null`).
- `mockAtendimentoMetricsProvider.getSellerLoad` filtra `lastMessageAt` pela
  janela quando informada (mesmo `inRange` inclusivo dos irmãos).
- `useSellerLoad` passa `state.fromIso`/`state.toIso` e os adiciona à
  `queryKey` (`["sv","sellerLoad", store, from, to, tick]`).
- Textos do card: subtítulo → *"Conversas abertas com atividade no período
  selecionado"*; InfoHint atualizado na mesma linha semântica.

### O que não muda

Limite de sobrecarga (bandas vermelho/âmbar via configurações do dashboard),
refetch por Realtime tick, roster completo (vendedor com 0 aparece), conversas
sem atribuição fora do card, engine puro `buildSellerLoadEntries`.

## Validação

- Testes: providers mock/supabase atualizados; engine intacto (sem mudança).
- Verificação empírica pré-prod: corpo SQL (guard com literais) ≡ referência JS
  service-role nas janelas 24h/7d/30d, por vendedor, valores exatos.
- Pós-aplicação: RPC real como `authenticated` owner (claims
  `app_metadata.role`) + latência; papel não-staff recebe vazio.
- Gate de rollout: migration em prod **antes** do merge/deploy (aprovação
  explícita do dono para cada um).
