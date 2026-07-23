# Onda 5 — Reconciliação das telas Fase 1 (PRD-119)

> Fecha a integração da Onda 5 (PRDs 111–118) com as telas da Fase 1 que tocam
> WhatsApp. Garante que, em `VITE_DATA_SOURCE=supabase`, Inbox / Conversa /
> Distribuição operam ponta a ponta com os providers reais — e que o modo
> `mock` preserva a UX da Fase 1 byte a byte.

## 1. Auditoria de resíduos mock (RF-001/002)

Grep por `mockConversations`, `mockMessages`, `mockWhatsAppAccounts`,
`simulateIncoming` e `from "@/mocks` fora de `src/mocks/**` e
`src/providers/data/**` (fronteira imposta por ESLint desde o PRD-005):

| Hit | Avaliação |
| --- | --- |
| `useRealtimeConversations.ts` → `messagesProvider.simulateIncoming(...)` | ✅ Legítimo — simulador da Fase 1, roda **só** em mock (`IS_SUPabase` gate na linha 11; em supabase o efeito retorna antes). Chama via provider, não via mock direto. |
| `features/gamification/hooks/useBadges.ts` → `import { badgesApi } from "@/mocks/api"` | ✅ Exceção documentada — gamificação (PRD-043) é feature demo-only, sem tabela no Supabase. |
| `routes/design-system.tsx` → `useResetMocks` | ✅ Exceção oficial do ESLint — rota dev-only (redirect em produção). |

**Conclusão: zero violação real.** O Provider Pattern segurou a migração —
nenhuma tela referencia dado mock hard-coded.

## 2. Estado por tela (o que já estava pronto × o que este PRD entregou)

### Inbox (PRD-010)

Já estava pronto (PRDs 104/105/118): `useConversationsList` via provider;
Realtime real da lista em supabase (`useRealtimeConversations` assina
`conversations` + `messages` via canais ref-counted e bumpa `refreshKey`);
mini-badge de status da última mensagem outbound (PRD-118). **Sem mudanças
neste PRD.**

### Conversa (PRD-011)

Já estava pronto: `useMessages` (provider), `useRealtimeMessages` (PRD-118),
`useMessageSend` ramificado por fonte (PRD-115), banner da janela 24h
(PRD-117), `TemplatePicker` no `TEMPLATE_REQUIRED` (PRD-116), retry real e
fluxo de número inválido (PRD-118).

**Entregue neste PRD — anexo de arquivo avulso (RF-026):** os itens
Imagem/Documento/Áudio do menu de anexos saíram do stub ("próxima fase") e
viraram file picker real:

- `useAttachmentUpload` (`features/conversations/hooks/useAttachmentUpload.ts`)
  faz o upload como `media_asset` outbound (PRD-026, bytes reais no bucket
  `whatsapp-media` em supabase) e monta o payload de envio.
- Em **supabase**, o payload leva uma signed URL (mesmo caminho do quick-send
  PRD-027); o pipeline `whatsapp-send` repassa URLs absolutas ao engine.
- Em **mock**, o asset é registrado (galeria consistente) e a bolha renderiza
  um object URL local da sessão — demo fiel sem rede.
- Limite: **64 MiB para todos os tipos** — o `file_size_limit` do bucket
  `whatsapp-media`, único teto real do caminho (o upload vai direto do browser
  para o Storage). Fonte única em `@/shared/utils/mediaLimits`. Histórico: até
  2026-07-23 os caps espelhavam a Meta (imagem 5 MB, vídeo/áudio 16 MB), o que
  rejeitava no cliente arquivos que todos os outros engines aceitam; corrigido
  primeiro para 25 MiB (teto do bucket na época) e, no mesmo dia, elevado para
  64 MiB (bucket subido junto) — um vídeo WAHA sai via `/api/sendFile` (como
  documento, limite ~100 MB no WhatsApp), então 64 MiB é folgado e infra-safe.
- A janela de 24h e o gate de número inválido aplicam como em qualquer envio
  livre (bounce abre o picker de template / diálogo de confirmação staff).

### Distribuição (PRD-013)

Já estava pronto: settings via `useSettingsProvider`; o engine
(`features/distribution/engine/distribute.ts`) é puro e a orquestração vive
nos providers `conversations.create` (mock e supabase). **Sem mudanças neste
PRD.** A notificação WhatsApp ao vendedor atribuído segue in-app no MVP
(decisão registrada no PRD — envio proativo real fica para onda futura).

### Simulação SDR (PRD-020) — decisão registrada (RF-040..043)

**A tela permanece sandbox local em qualquer fonte, by design.** O
`SdrSimulatorPage` monta cliente/conversa fictícios em memória
(`SIM_CONVERSATION_ID = "sim-conv"`) e responde pelo engine puro
(`features/sdr/engine/respond.ts`) — nada é persistido em nenhum provider de
sessão/conversa. O único provider consumido é `parts` (leitura do catálogo
para o score de identificação — em supabase usa o catálogo real, o que é
desejável). Não foi preciso "forçar MockProvider": a tela nunca dependeu de
provider de conversa. Treinos não poluem o banco.

### Admin → Integrações → WhatsApp — fora do "EM BREVE"

`WhatsAppPlaceholderPage` (lia `settings.whatsappAccounts` do jsonb e
estampava "Mock") foi substituída por **`WhatsAppAccountsPage`**:

- Lê do provider `whatsappAccounts` (tabela real em supabase, store em mock).
- Mostra por conta: provedor, status, capabilities, prefixo de credenciais e
  config não-secreta (`provider_config` — PRD-111).
- **Edição staff-only** de `label`, `credentials_ref` e `provider_config`
  (Meta: Phone Number ID + WABA ID; Evolution: URL base + instância), com a
  validação de shape do banco replicada no client (os 2 campos do engine ou
  ambos vazios).
- **Segredos nunca transitam pela tela** — `credentials_ref` é só o prefixo
  dos secrets de Edge Function. QR/OTP da Cloud API não existe aqui por
  decisão de arquitetura (ver `whatsapp-providers.md`).
- Contrato `IWhatsAppAccountsProvider` ganhou `update(id, patch)`;
  RLS: migration `20260610145458_whatsapp_119_accounts_staff_writes` aperta
  INSERT/UPDATE/DELETE para staff (SELECT continua store-wide — a UI de
  conversa lê capabilities para qualquer vendedor). Seção #119 na suíte
  `supabase/tests/rls-regression.sql`.
- Criar/excluir contas segue processo operacional assistido (registro +
  secrets + webhook no provedor — guias `whatsapp-meta-provider.md` /
  `whatsapp-evolution-provider.md`); monitor de saúde/quota chega no PRD-120.

## 3. Roteiro de smoke (RF-050)

Executar nos 2 modos (flip `VITE_DATA_SOURCE` no `.env.local` + restart):

| # | Cenário | mock | supabase |
| --- | --- | --- | --- |
| 1 | Inbox lista conversas, filtros e ordenação | UX Fase 1 idêntica (simulador injeta inbound a cada 8–15s) | Lista real (RLS escopa por vendedor); inbound real só com credenciais Meta |
| 2 | Conversa: enviar texto na janela aberta | Dança de status simulada | queued→sent persistido; status via webhook |
| 3 | Anexar imagem pelo clipe | Bolha renderiza o arquivo local; asset na galeria | Upload no bucket + envio real; bolha com signed URL |
| 4 | Texto fora da janela 24h | Banner + TemplateDialog demo | Bounce `TEMPLATE_REQUIRED` abre TemplatePicker real |
| 5 | Distribuição: simular conversas | Engine roda no provider mock | Persiste conversa+trace reais |
| 6 | Simulação SDR | Sandbox local determinística | Idem — nada gravado no banco |
| 7 | Configurações → WhatsApp | Contas fictícias editáveis (store local) | Contas reais; edição grava na tabela (staff-only) |

Resultados do smoke manual ficam anotados nesta tabela quando o dono validar
(testes de UI são manuais por convenção do projeto).

## 4. Troubleshooting

- **Anexo falha em supabase com erro de Storage** → conferir policies do
  bucket `whatsapp-media` (PRD-106) e se a conversa pertence ao vendedor
  (INSERT de `media_assets` é gated — #48).
- **Anexo envia mas a imagem "quebra" depois de um tempo** → a mensagem
  persiste a signed URL (5 min), mesmo trade-off do quick-send; re-assinatura
  no display é melhoria futura (PRD-120+).
- **Tela de contas não salva** → papel precisa ser Owner/Gestor (RLS
  staff-only); em mock qualquer papel salva (store local, sem RLS).
- **`provider_config` rejeitado pelo banco** → CHECK de shape do PRD-111
  (RF-032): Meta exige `phoneNumberId`+`businessAccountId`; Evolution exige
  `baseUrl`+`instanceName`.

## 5. Desvios do PRD (registrados)

1. **Inbox/Conversa/Distribuição não precisaram de migração** — o texto do
   PRD assumia telas com state mock local (`useState(mockConversations)`);
   na prática a Fase 1 já nasceu no Provider Pattern (PRD-005) e os PRDs
   104/105/114–118 plugaram tudo. O delta real foi anexo avulso + tela admin.
2. **Simulação SDR**: não foi necessário "forçar MockProvider local" — a tela
   já é engine-puro sem provider de conversa; leitura do catálogo real em
   supabase mantida de propósito.
3. **`MediaUploader` como componente dedicado** (RF-026) virou
   `useAttachmentUpload` + file input no `MessageInput` — menor e coerente com
   o composer existente; a biblioteca de ativos (PRD-027) continua sendo o
   caminho para arquivos reutilizáveis.
4. **README**: o repositório não tinha `README.md`; criado um mínimo com a
   seção "mock vs supabase" (RF-061).
5. **Playwright**: smoke permanece manual roteirizado (decisão da casa — o
   dono valida UI manualmente; suíte e2e automatizada não existe no projeto).
