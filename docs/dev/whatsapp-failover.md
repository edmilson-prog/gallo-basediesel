# Failover Meta ↔ Evolution + monitoring de provider (PRD-120)

> Fecha a Onda 5: contingência configurável por conta para o envio outbound,
> monitoramento passivo de saúde por provider e override manual do Owner.

## Modelo

Colunas novas em `public.whatsapp_accounts` (migration `20260610152000`):

| Coluna | Papel |
| --- | --- |
| `failover_account_id` | Conta reserva (FK self, `on delete set null`). CHECK: ≠ própria conta. |
| `failover_policy` | `disabled` \| `manual` \| `automatic`. CHECK: ≠ disabled exige reserva. |
| `current_state` | `healthy` \| `degraded` \| `down` \| `paused` (mantido pelo tick + ação manual). |
| `state_changed_at` | Última transição. |
| `is_failover_active` | Flag operacional — enquanto `true`, envios NOVOS saem pela reserva. |

**Failover não é mágica:** o histórico nunca migra (Meta/Evolution são silos)
e o inbound continua chegando no número original. Vale só para **outbound
novo** enquanto o primário está degradado.

## Detecção de estado (tick SQL)

`public.whatsapp_health_tick()` roda via **pg_cron a cada 5 min**
(migration `20260610153000`; job `whatsapp-health-tick`):

1. Para cada conta, mede a **taxa de erro dos últimos 15 min** em
   `integration_logs` (atribuição por provider — `whatsapp_meta` /
   `whatsapp_evolution`, a mesma granularidade da view do PRD).
2. Régua (espelha `src/providers/whatsapp/failover.ts` — `evaluateAccountState`;
   **drift consciente** TS×SQL, como nas notificações derivadas):
   - ≥ 70% → `down` · ≥ 10% → `degraded` · < 10% → `healthy`
   - **< 5 chamadas na janela → mantém o estado** (sem falso positivo)
   - `paused` é **pegajoso** — só sai por ação manual (caso Meta account paused)
3. Transição: atualiza estado + `state_changed_at`, audita
   (`provider_state_changed`, ator = `stores.manager_id`) e cria notificação
   in-app para o gestor (critical para down/paused, warning para degraded).
4. **Auto-failover (RF-030):** `policy=automatic` + estado down/paused →
   `is_failover_active=true` + audit `failover_activated` + notificação.
5. **Auto-restore (RF-031):** ativo + `healthy` contínuo por ≥ 30 min →
   desativa + audit `failover_deactivated` + notificação informativa.

> ⚠️ **Desvio registrado (RF-010/011):** o PRD pede um cron invocando a Edge
> Function `whatsapp-health-monitor`, que também faria `provider.healthCheck()`
> ativo. `pg_net` **não está habilitado** no projeto (instalar extensão exige
> consentimento do dono) e não há credenciais reais para pingar — o tick é
> **SQL-only (passivo, por logs)**. Quando as credenciais Meta/Evolution forem
> ativadas, reavaliar: habilitar `pg_net` + edge para healthCheck ativo.

## Resolução no envio (RF-040/041)

`processSendRequest` (send/core.ts) resolve a **conta efetiva** antes do
pre-check de 24h:

- Failover ativo + reserva configurada → envia pela reserva
  (`resolveEffectiveAccount`), audita `failover_used` por mensagem e o
  pre-check de 24h usa o provider **efetivo** (reserva Evolution não tem
  janela Meta).
- **Template HSM com reserva não-Meta → `FAILOVER_INCOMPATIBLE` 422** antes
  de persistir; o frontend mostra mensagem clara (`SEND_ERROR_MESSAGES`).
- Reserva apagada/ausente → **fail-open para a primária** (não bloqueia o
  vendedor; o dashboard expõe o estado).

## Override manual (RF-050)

Tela **Configurações → WhatsApp** (Owner-only, PRD-119):

- Edição: política (`disabled`/`manual`/`automatic`) + conta reserva
  (validação client-side do CHECK RF-003).
- Botões "Ativar failover agora" / "Desativar failover" (visíveis quando há
  reserva configurada). Desativar a política limpa um failover ativo.
- Tudo auditado: `failover_policy_changed`, `manual_failover_toggle`
  (client-side via `recordAuditLogSync`) + os eventos do tick e do envio
  (server-side).

## Dashboard (RF-060)

`/app/gestao/saude` (Owner) ganhou **"WhatsApp — Provedores & Failover"**:
conta, provider, estado (badge com `state_changed_at` no hover), chamadas
24h, erro % e latência p95 (por provider, `integration_logs`), e a coluna
Failover (Desativado / Disponível (reserva) / **ATIVO → reserva**). Fonte:
RPC `public.whatsapp_provider_health()` — SECURITY DEFINER com filtro
silencioso owner-only (padrão da casa; substitui a view
`v_whatsapp_provider_health` do PRD). Atualiza a cada 30s com a tela aberta.

## Runbook do Owner

1. **Configurar:** Configurações → WhatsApp → Editar conta principal →
   política `automatic` (ou `manual`) + conta reserva → Salvar.
2. **Quando degradar:** chega notificação in-app; o dashboard mostra o estado.
   Com política `automatic`, o failover liga sozinho quando o estado cai para
   `down`/`paused`; com `manual`, use "Ativar failover agora".
3. **Durante o failover:** texto/mídia saem pela reserva; templates HSM são
   bloqueados se a reserva for Evolution (aguardar restauração).
4. **Restauração:** automática após 30 min saudável (notificação informativa)
   ou manual via "Desativar failover".
5. **Conta `paused` (Meta):** resolver no Meta Business Manager e, depois,
   atualizar o estado manualmente (o tick não sai de `paused` sozinho).

## Troubleshooting

- **Estado não muda nunca** → sem tráfego real não há sinal (o tick exige ≥ 5
  chamadas/15min); estados só fazem sentido com credenciais ativas.
- **Notificação não chegou** → o destinatário é `stores.manager_id`; confira
  o vínculo owner↔seller da loja.
- **Template bounçando com conta saudável** → verifique se `is_failover_active`
  ficou ligado (override manual esquecido) com reserva Evolution.

## Desvios do PRD (registrados)

1. **Sem Edge Function `whatsapp-health-monitor` + pg_net** — tick SQL-only
   (ver acima). HealthCheck ativo de engine fica para quando houver
   credenciais.
2. **RPC owner-only** em vez de view `crm.v_whatsapp_provider_health` + RLS
   (padrão da casa desde o PRD-108/110); schema `public`, não `crm`.
3. **Alertas por e-mail adiados** — notificação in-app no sino (Resend segue
   gated na ativação #52 + rotação da chave); revisitar com o e-mail
   transacional (PRD-141).
4. **Página de detalhe por conta com gráficos (RF-061) adiada** — sem tráfego
   real, gráficos de 24h ficam vazios; a tabela agregada cobre o MVP.
   Reavaliar com credenciais ativas. O mesmo vale para o filtro de inbox por
   falha (RF-031 do PRD-118, novamente adiado).
5. **Numeração v2.1.0 "Bridge" do PRD não adotada** — SemVer da casa
   (codinome próprio no bump pós-merge); `Bridge` já foi usado na v0.76.0.
6. **`whatsapp_accounts` não tem `is_active`** — o tick avalia todas as
   contas (o modelo da casa usa `status` connected/disconnected/pending).
