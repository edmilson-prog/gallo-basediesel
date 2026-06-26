# PRD-145: Push Notifications Web

> **Perfil E (esqueleto enxuto)** — P2. Fundação completa do canal; sofisticação de UX e o público externo ficam para a Onda 11 (PWA real).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `_shared/channels/push.ts` + `src/features/push/` + service worker_ |
| **Objetivo** | Ativar o esqueleto `PushChannel` do PRD-008 via **Web Push API** (VAPID), com público primário **interno**: gestor recebe push de alerta crítico com a aba fechada; vendedor externo no PWA (070) recebe novo lead/conversa no bolso. Entrega: par de chaves VAPID (Vault), tabela `crm.push_subscriptions`, handler de push no service worker, envio server-side pelo dispatch (141), **prompt de permissão no momento certo** (jamais no load — anti-pattern que mata a taxa de aceite), e limpeza automática de subscriptions mortas (410 Gone). Push para **customer** (loja/portal) fica explicitamente adiado para a Onda 11 |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P2 |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-008 F1 (contrato); PRD-009 F1 (toggle de opt-in vive na tela de preferências existente); PRD-141 (dispatch + deliveries); PRD-070 F1 (PWA esqueleto — consumidor natural); PRD-171 Onda 11 (Service Worker completo — este PRD entrega o mínimo de push, o 171 absorve e expande); PRD-014 F1 (alertas do gestor — caso de uso nº 1) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Web Push Protocol puro em Deno (VAPID JWT + payload AES128GCM via lib auditada); SW handler mínimo e versionado |

### Critérios de Complexidade

> **Justificativa de Média (perfil E):** o protocolo Web Push tem criptografia própria (VAPID + ECDH/AES128GCM) — resolvida por lib, mas exige chaves bem guardadas e rotação consciente. Os dois riscos reais: (1) **pedir permissão na hora errada** — prompt no primeiro load tem ~10% de aceite e o "Bloquear" do browser é quase irreversível; o desenho do momento-certo é o coração do PRD; (2) **subscriptions zumbis** — endpoints expiram silenciosamente; sem limpeza por 410, o canal degrada para "enviado, nunca entregue".

---

## Contexto do Problema

O Painel do Gestor (014→008) gera alertas críticos — "conversa sem resposta há 2h", "estoque crítico" — que hoje só existem **com a aba aberta**. O gestor da Turbo Diesel não vive no /app: vive no balcão. E o vendedor externo (070) precisa saber do lead novo **no celular, com o app fechado** — exatamente o que Web Push resolve sem app nativo. O público externo (cliente da loja recebendo "pedido enviado" por push) é desejável, mas depende do PWA real da Onda 11 — adiar é honestidade de escopo.

---

## Conceito da Solução

```
[Opt-in no momento certo]                    [Envio]
seller abre o Center (009) pela 3ª vez       evento crítico → dispatch (141)
  → banner suave "Receber alertas             → canal push p/ recipientType seller
     com a aba fechada?" [Ativar]             → PushChannel: para cada subscription
  → Notification.requestPermission()             ativa do recipient:
  → pushManager.subscribe(VAPID pública)            Web Push (VAPID JWT + AES128GCM)
  → POST subscription → crm.push_subscriptions      201 → delivery sent
                                                    410 Gone → subscription removida
[Service Worker]                                    (audit push_subscription_expired)
self.addEventListener('push', e =>
  showNotification(title, { body, icon, data: { url } }))
'notificationclick' → foca/abre a rota da entityRef
```

```sql
CREATE TABLE crm.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('seller','customer')),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
-- RLS: dono gerencia as próprias; envio service_role
```

- **VAPID**: par gerado uma vez; privada no Vault (`vapid_private_key`), pública no client env — rotação documentada (invalida subscriptions: evento raro e consciente)
- **Momento certo**: gatilhos elegíveis — 3ª visita ao Center, ou clique em alerta crítico, ou toggle manual nas preferências (009). Recusa do banner suave → cooldown 14 dias antes de reoferecer; "Bloquear" do browser → toggle das preferências mostra instrução de desbloqueio
- **Roteamento default**: apenas `severity='critical'` + categoria operacional para sellers/gestores; demais eventos opt-in pela matriz (008). Customer: **nenhum** (Onda 11)
- **Multi-dispositivo**: N subscriptions por recipient (desktop + celular) — envio para todas as ativas; deliveries agregam (1 delivery por notificação×canal; detalhe por endpoint no metadata)
- **PWA (070)**: o SW esqueleto do 070 ganha os 2 handlers (`push`, `notificationclick`) — DELTA aditivo declarado; a Onda 11 (171) absorve este mínimo no SW completo

---

## Requisitos Funcionais (essenciais)

- **RF-001:** Geração/armazenamento VAPID (privada Vault, pública client); util `web-push` compatível Deno para JWT+criptografia.
- **RF-002:** Migration `crm.push_subscriptions` + RLS; endpoints de subscribe/unsubscribe (Edge, withAuth, dono-only).
- **RF-003:** `PushChannel.send`: busca subscriptions ativas do recipient; envia a todas; 201→sent (delivery única, endpoints no metadata); **410/404 → DELETE da subscription + audit**; zero ativas → `skipped/NO_SUBSCRIPTION`.
- **RF-004:** SW handlers: `push` exibe notificação (title/body/ícone GALLO/badge); `notificationclick` foca aba existente ou abre a rota de `entityRef`; payload ≤ 3KB.
- **RF-005:** Opt-in no momento certo: banner suave nos gatilhos definidos; cooldown de recusa 14d (localStorage); jamais `requestPermission` sem gesto do usuário; toggle nas preferências (009) com estado real da permissão do browser (granted/denied/default) e instrução quando denied.
- **RF-006:** Roteamento default: critical+operacional para sellers; DELTA no catálogo (008) declarado; customer sem push (guarda explícita até Onda 11).
- **RF-007:** Testes: subscribe/unsubscribe, multi-dispositivo, 410 limpa, NO_SUBSCRIPTION, cooldown do banner, click abre rota; E2E manual guiado (push real exige browser — roteiro documentado).
- **RF-008:** Documentação `docs/dev/notification-push.md` (VAPID, rotação, momento-certo, ponte com 171).

---

## Critérios de Aceitação (núcleo)

```gherkin
DADO gestor que ativou push no desktop e no celular
QUANDO alerta crítico 'conversa sem resposta' dispara com as abas fechadas
ENTÃO notificação nativa aparece nos 2 dispositivos
  E clique abre /app/conversas/<id> focando aba existente se houver
  E delivery 'sent' com 2 endpoints no metadata

DADO subscription expirada no celular (endpoint 410)
QUANDO o próximo push é enviado
ENTÃO endpoint removido de push_subscriptions + audit
  E desktop recebe normalmente

DADO seller que recusou o banner suave
QUANDO visita o Center novamente em 5 dias
ENTÃO banner NÃO reaparece (cooldown 14d)
  E o toggle manual nas preferências segue disponível
```

---

## Fases de Implementação

### Fase 1 — VAPID + Schema + Canal (1.5 dias)
Chaves, migration+RLS, subscribe/unsubscribe, PushChannel com 410-cleanup.

### Fase 2 — SW + Opt-in (1.5 dias)
Handlers no SW (DELTA 070), banner momento-certo + cooldown, toggle real nas preferências (009).

### Fase 3 — Roteamento + Testes + Docs (1 dia)
Defaults critical/operacional, roteiro E2E manual, notification-push.md; `_DONE`.

---

## Dependências

- **Depende de:** PRD-141 (dispatch+deliveries), PRD-008 (contrato+matriz), PRD-009 (tela de preferências — host do toggle), PRD-070 (SW esqueleto — DELTA aditivo), PRD-100 (Vault)
- **Bloqueia:** PRD-150; PRD-171 (Onda 11 absorve o mínimo daqui)
- **DELTAs declarados:** PRD-070 (2 handlers no SW); PRD-008 (defaults critical→push para sellers)
- **Decisões Pendentes:** gatilhos exatos do momento-certo (3ª visita sugerido — validar com uso real); ícone/badge monocromático para Android (asset do designer)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.5; CHANGELOG; renomear `PRD-145-push-web_DONE.md`; roteiro E2E manual executado em Chrome desktop + Android.

| Princípio | Descrição |
|-----------|-----------|
| **Permissão é capital** | Pedir na hora errada queima o canal para sempre |
| **410 limpa na hora** | Subscription zumbi é entrega fantasma |
| **Interno primeiro** | Customer push é Onda 11 — guarda explícita |
| **Mínimo absorvível** | O 171 herda, não reescreve |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5b do Lote 5 (Onda 8), perfil E |

---

**AILA - Sistemas Inteligentes**
