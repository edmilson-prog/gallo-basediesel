# Evolution Go — UI de pareamento (Fase 5) — Design

> **Status:** aprovado em design (2026-06-25). Próximo passo: writing-plans.
> **Contexto:** fecha a migração WhatsApp v2 → Evolution Go. As Fases 0–2 (engine
> runtime-agnostic + 3 Edge Functions wired + deploy em prod) estão prontas; o
> que falta é a UI para **criar e parear** uma conta `evolution-go` por QR. Isso
> destrava o smoke e2e e os 2 contratos ainda abertos (corpo do
> `/message/downloadimage`; shape exato do webhook).

## Objetivo

Permitir que o Owner crie e conecte números **Evolution Go** pela plataforma,
com um seletor de provedor no fluxo "Adicionar número" (Go por padrão; Evolution
v2 segue disponível como legado). Reaproveitar ao máximo a maquinaria de
pareamento por QR que a Fase 2 já deixou pronta.

## Arquitetura (decisão)

**Generalizar os componentes existentes** em vez de criar componentes Go
paralelos. O passo de QR (`QrPairingStep`), o hook de pareamento
(`useEvolutionPairing`) e a API de conexão (`whatsappConnect.ts`) **já são
provider-agnósticos**: mandam `{accountId, action}` e o Edge `whatsapp-connect`
ramifica pelo `account.provider` (o ramo Go é auto-contido e foi deployado na
Fase 2). Logo a Fase 5 só precisa:

1. **Criar o row certo** (`provider:"evolution-go"`, `credentialsRef` único,
   `providerConfig:{baseUrl, instanceId:""}`) e **gravar a chave global** no
   Vault (`{credentialsRef}_API_KEY`) antes do 1º QR.
2. **Tornar a tela de contas Go-aware** (labels + gates).
3. **Parear por QR** reusando o hook.

### Assimetria de segredo (restrição de fronteira, herdada da Fase 2)

No v2, várias instâncias **compartilham** o `credentialsRef`. No Go **não dá**:
o Edge nomeia o `_INSTANCE_TOKEN` pelo `credentialsRef`, então cada número Go
precisa de um `credentialsRef` **único**. A chave global (`_API_KEY`) é o **mesmo
valor** para todos os números do mesmo servidor, mas é write-only no Vault — não
dá para lê-la de volta e copiá-la. **Decisão aprovada pelo dono:** a chave global
é **colada uma vez por número Go** no wizard. Evitar isso exigiria mudar o
contrato de segredo do Edge (já deployado) — fora de escopo.

## Componentes e mudanças

### A. Fundação (tipos de domínio do frontend)

O frontend `shared/types` **ainda não conhece** `evolution-go` (a Fase 2 alargou
as uniões da camada `providers/whatsapp/` e dos Edges, não as do domínio).

- `src/shared/types/conversation.ts`
  - `WhatsAppProviderName`: `"meta" | "evolution"` → **`| "evolution-go"`**.
  - `MessageProvider`: `"meta" | "evolution" | "mock"` → **`| "evolution-go"`**
    (linhas de mensagem vindas do webhook Go carregam esse `provider`).
  - `IWhatsAppProviderConfig`: adicionar **`instanceId?: string`** — "Evolution
    Go — id da instância gerado pelo servidor; vazio até o 1º pareamento".
- `src/shared/utils/whatsappProvider.ts` (novo): helper puro
  **`isEvolutionFamily(provider: WhatsAppProviderName): boolean`**
  (`=== "evolution" || === "evolution-go"`). Substitui os `=== "evolution"`
  espalhados onde Go deve se comportar como a família Evolution.

> Alargar `WhatsAppProviderName` **força** o type-check a apontar todo `Record`
> e `switch` exaustivo sobre `provider` que ficou incompleto — exatamente os
> sites abaixo. Verificar (não-exaustivo) o mapper de mensagens do provider
> supabase: ele só faz cast de `row.provider` — alargar a união é mudança de
> tipo, sem alterar o cache/signing/realtime.

### B. Wizard "Adicionar número" provider-aware

`src/features/admin-settings/components/AddInstanceWizard.tsx`

- **Passo 0 — seletor de provedor:** `Evolution Go` (padrão) | `Evolution v2`
  (legado; desabilitado com dica quando não houver instância v2 para herdar).
- **Ramo Go:**
  - Campos: Apelido (label) · Finalidade (purpose) · **URL do servidor Go**
    (pré-preenchida de um template Go se existir; placeholder
    `https://evogo.ailainteligente.com.br`) · **Chave global da API** (password,
    obrigatória) · `credentialsRef` (auto-gerado, visível, editável).
  - `credentialsRef` gerado por helper puro
    **`generateGoCredentialsRef(label, existingRefs, suffix)`** →
    `WA_EVO_GO_<SLUG>_<suffix>`; valida `isValidCredentialsRef` (env-style) e
    **unicidade** contra as contas existentes.
  - Submit: `provider.create({ provider:"evolution-go", credentialsRef,
    providerConfig:{baseUrl, instanceId:""}, capabilities: EVOLUTION_FAMILY_CAPS,
    purpose, status:"pending", failoverPolicy:"disabled", isFailoverActive:false,
    currentState:"healthy", phoneNumber:"" })` → **(só em modo real)**
    `setIntegrationSecret('${credentialsRef}_API_KEY', chaveGlobal, desc)` →
    entra no passo `qr` com o novo `accountId`, reusando `useEvolutionPairing` +
    `QrPairingStep` → "conectado".
  - Erro no write da chave: mantém o row (conectável depois pela tela) e mostra
    a mensagem do Edge integration-secrets (ex.: 403 Owner-only).
- **Ramo v2:** comportamento atual **intacto** (herda baseUrl+credentialsRef de
  um template v2, cria `provider:"evolution"` com `instanceName`).
- Props: passar a lista de contas (ou os dois templates) em vez de um único
  `templateAccount`. As caps Evolution viram um objeto compartilhado
  `EVOLUTION_FAMILY_CAPS` (Go == v2: sem HSM/botões/listas; com reações/proativa).

### C. Tela de contas Go-aware

`src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

- `PROVIDER_LABEL` += `"evolution-go": "Evolution Go"`.
- Trocar `account.provider === "evolution"` por `isEvolutionFamily(...)` em:
  bloco de ações (Verificar agora / Mensagem de teste / Importar / Sincronizar /
  Conectar), banner de desconexão, rodapé "Conectar conta".
- `templateAccount` → dois derivados (`evolutionTemplate` e `evolutionGoTemplate`).
- Botão "Adicionar número" passa a ficar **sempre habilitado** (a 1ª conta Go
  nasce do zero — não precisa de template).
- `openConnect(account)`: para Go, sempre `step:"qr"` (não há form v2).
- Form de edição: caso Go — `baseUrl` editável; `instanceId` **somente-leitura**
  (gerado pelo servidor). `IAccountDraft`/`configFromDraft` ganham o ramo Go
  (`{baseUrl, instanceId}` preservando o `instanceId` existente).

`src/features/admin-settings/hooks/useEvolutionStatusSync.ts`
- Filtro de alvos: `isEvolutionFamily(provider) && Boolean(baseUrl)` (Go entra
  no polling de status ao vivo; conta Go ainda não pareada → o Edge devolve
  `close`, sem efeito colateral).

### D. Conexão de conta Go existente = QR-only

`src/features/admin-settings/components/ConnectWhatsAppDialog.tsx`
- Provider-aware: para Go, **pular o form v2** (não há `instanceName`/apikey por
  instância) e abrir direto no passo `qr`. Os estados "conectado / reiniciar /
  desconectar" já são provider-agnósticos (`restartEvolution`/`logoutEvolution`).
  Esconder o botão "Editar dados da conexão" (form) quando Go.

### E. Exclusão de instância Go-aware

`src/features/admin-settings/components/DeleteInstanceDialog.tsx`
- `PROVIDER_LABEL` += `"evolution-go"`.
- Gates de teardown (linhas ~174/200) → `isEvolutionFamily(...)`. O Edge já tem o
  ramo de delete `evolution-go` (Fase 2: teardown por instance token, fail-soft).

### F. Polimento cosmético no atendimento (cache-safe, isolável)

Correção de exibição para Go, **sem encostar** no cache congelado de mensagens/
mídias (signing em lote #137, Realtime, query keys, RPC gated-once). Tarefa
isolada — pode ser descartada sem afetar o núcleo.

- `src/features/conversations/hooks/useMessageSend.ts` (~l.142): a tag `provider`
  do balão **otimista** passa a usar a conta da família Evolution
  (`whatsappAccount.provider` quando for família) — hoje Go cai em `"meta"` por
  ~1s até o Realtime trazer a linha real. Só a tag; nada de signing/realtime/keys.
- `src/features/conversations/components/NewConversationDialog.tsx` (l.84):
  `isEvolution` → `isEvolutionFamily(origin?.provider)` (escolhe só o texto do
  aviso anti-ban; não bloqueia o `handleStart`).
- `src/features/system-health/pages/SystemHealthPage.tsx` (l.225): nota de
  diagnóstico → família (consistência; Owner-only).

> Se preferir a Fase 5 **100% fora de `conversations/`**, dropamos F e os balões
> Go ficam taggeados `"meta"` por ~1s (auto-cura via Realtime). É só avisar.

## Fluxo de dados (criação + 1º pareamento Go)

```
Wizard (Go) → provider.create(evolution-go, credsRef, {baseUrl, instanceId:""})
            → setIntegrationSecret(credsRef_API_KEY, chaveGlobal)   [real only]
            → passo QR (accountId)
useEvolutionPairing → requestEvolutionQr(accountId) → Edge whatsapp-connect (qr)
   Edge (1ª vez): lê _API_KEY → createGoInstance(globalKey) → captura token
        → grava credsRef_INSTANCE_TOKEN (token-first) → persiste instanceId
        → connectGoInstance(token)  [registra webhook] → devolve QR
hook: countdown + poll getEvolutionState(accountId) → "open"
Wizard: passo "conectado" → "Configurar quem acessa"
```

## Tratamento de erros

- `MISSING_API_KEY` (Edge): a chave global não foi gravada antes do QR — o row
  fica conectável; mostrar microcopy existente ("Salve a chave de API no cofre
  antes de conectar").
- `credentialsRef` inválido/duplicado: bloqueio client-side no wizard
  (`isValidCredentialsRef` + unicidade) antes de criar o row.
- Write da chave (integration-secrets) é Owner-only: surfacing da mensagem do
  Edge (ex.: 403), mantendo o row.
- Falhas de poll continuam silenciosas (padrão atual do hook).

## Testes

TDD nos puros (Vitest, co-localizados):
- `isEvolutionFamily` — tabela meta/evolution/evolution-go.
- `generateGoCredentialsRef` — shape `WA_EVO_GO_<SLUG>_<suffix>`, passa
  `isValidCredentialsRef`, evita colisão com `existingRefs`, slug de label
  acentuado/espaçado.
- `configFromDraft` (ramo Go) — `{baseUrl, instanceId}`, preserva instanceId,
  ambos-vazios → `null`, parcial → `{ok:false}`.

Componentes (wizard/dialog/page) cobertos por `bun run build` + **smoke manual**
(o dono testa a UI à mão). Gate prático: `bun run test` + `bun run build` +
`bunx tsc --noEmit` (avaliar por delta sobre o baseline).

## Fora de escopo (Fase 5)

- **Smoke e2e real** e a resolução dos 2 contratos abertos — acontece **depois**
  desta UI existir (é o que ela destrava).
- **Fase 3 (paridade):** avatar de contato Go no webhook + captura de
  perfil/telefone no connect (hoje só status sync). Continua deferida.
- Mudar o contrato de segredo do Edge para compartilhar a chave global (evitar
  a colagem por número) — deferido por decisão.
- Recuperação de half-create Go por find-by-name (já anotado como Fase 3 no Edge).

## Riscos

- Alargar `WhatsAppProviderName`/`MessageProvider` pode revelar sites exaustivos
  além dos mapeados — o type-check os aponta; o plano os cobre.
- O mock provider de `whatsappAccounts` precisa aceitar `provider:"evolution-go"`
  no `create` (deve ser genérico — verificar no plano).
- Modo demonstração: o wizard Go pula o write de segredo e o pareamento é
  simulado (`whatsappConnect.ts` mock) — Go fica demoável sem servidor real.
