# Design — Conexão WhatsApp real via Evolution API (pareamento por QR code)

**Data:** 2026-06-11
**Status:** Aprovado em brainstorming (usuário validou arquitetura, UI e seção de dados/segurança/testes)
**Branch:** `feat/whatsapp-evolution-connect`
**Versão prevista:** MINOR v0.87.0 (codinome sugerido: `Socket`)

---

## 1. Objetivo

Permitir conectar um número de WhatsApp real à plataforma via **Evolution API**, de dentro de Configurações → WhatsApp, lendo um **QR code** (mesmo fluxo do WhatsApp Web). Premissas acordadas:

- A **instância já existe** no servidor Evolution — a plataforma não cria instâncias; o usuário informa nome/ID da instância existente.
- **Tudo por parâmetro:** URL do servidor, nome/ID da instância e apikey entram pela UI; nada em env, nada hardcoded. A apikey vai **criptografada para o Supabase Vault** (Keyring, PR #63) — rotação sem redeploy.
- **Meta Cloud API fica para depois** — este fluxo é exclusivo de contas `provider === 'evolution'` (Meta não usa QR).
- Servidor Evolution v2 do usuário **já está no ar** → validação e2e real é possível durante a implementação.

### Escopo (ciclo completo aprovado)

1. Conectar por QR (com renovação automática do código)
2. Status de conexão ao vivo (polling durante o pareamento)
3. Desconectar (logout da instância)
4. Reiniciar instância
5. Configurar o webhook da instância automaticamente ao iniciar o pareamento (aponta para a edge `whatsapp-webhook` já deployada)

### Fora de escopo

- Criação/provisionamento de instâncias no servidor Evolution
- Conexão Meta Cloud API (sem QR; fica para a ativação Meta)
- Envio/recepção de mensagens (já entregue na Onda 5 — PRDs 111–120)
- Qualquer mudança no pipeline `whatsapp-send`/`whatsapp-webhook` além do webhook-set

---

## 2. Arquitetura

```
WhatsAppAccountsPage (modal "Conectar")
   │  TanStack Query (polling 2s durante pareamento; pausa com aba oculta)
   ▼
Edge Function whatsapp-connect   ← NOVA (11ª função; verify_jwt + gate staff)
   │  resolve apikey Vault-first (_shared/secrets.ts — fallback env)
   ▼
_shared/whatsapp/evolution/  (espelho de src/providers/whatsapp/evolution/)
   │  novos métodos de INSTÂNCIA no engine
   ▼
Servidor Evolution v2 (VPS do usuário)
   GET    /instance/connect/{instance}            → QR base64
   GET    /instance/connectionState/{instance}    → close | connecting | open
   DELETE /instance/logout/{instance}
   POST   /instance/restart/{instance}
   POST   /webhook/set/{instance}                 → URL do whatsapp-webhook
```

**Decisão central (abordagem 1 de 3, aprovada):** o navegador **nunca** fala com o servidor Evolution nem vê a apikey. A edge `whatsapp-connect` é um proxy de gestão de instância — alternativas descartadas: estender `whatsapp-send` (mistura gestão com hot path de envio) e chamada direta do browser (apikey no cliente + CORS + sem auditoria).

### 2.1 Camada engine (runtime-agnostic)

Novos métodos em `src/providers/whatsapp/evolution/` (só Web APIs, deps injetadas `resolveSecret`/`logIntegration`, reusando `evolutionRequest`/`mapEvolutionError`):

| Método | Endpoint Evolution | Retorno |
|---|---|---|
| `getInstanceQr` | `GET /instance/connect/{instance}` | `{ qrBase64, pairingCode? }` |
| `getConnectionState` | `GET /instance/connectionState/{instance}` | `'close' \| 'connecting' \| 'open'` (+ número/perfil quando `open`) |
| `logoutInstance` | `DELETE /instance/logout/{instance}` | ok |
| `restartInstance` | `POST /instance/restart/{instance}` | ok |
| `setInstanceWebhook` | `POST /webhook/set/{instance}` | ok (idempotente) |

⚠️ **Regra da casa:** mudou `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts` e redeployar as edges que consomem o espelho.

### 2.2 Edge Function `whatsapp-connect`

- **Contrato:** `POST { accountId: string, action: 'test' | 'qr' | 'state' | 'logout' | 'restart' }`.
- **Auth:** `verify_jwt` + gate de papel staff (mesmo critério da edição da tela de contas WhatsApp).
- **Respostas tipadas e sanitizadas:**
  - `test` → `{ ok: true, version? }` ou erro tipado
  - `qr` → `{ state: 'qr', qrBase64, expiresInSeconds }` — e, antes de devolver o primeiro QR, executa `setInstanceWebhook` apontando para o `whatsapp-webhook` (eventos mínimos: mensagens + status + `connection.update`); se a instância já estiver `open`, devolve direto `{ state: 'open', ... }` (modal pula o QR)
  - `state` → `{ state: 'close' | 'connecting' | 'open', phoneNumber?, profileName? }`
  - `logout` / `restart` → `{ ok: true }`
- **Efeitos colaterais:** a edge é quem atualiza `whatsapp_accounts` (`status`: `pending → connected/disconnected`, número/perfil ao conectar) e grava audit log; `integration_logs` já é gravado por `engineFetch` em toda chamada.
- **Códigos de erro estáveis** (mapeados de `mapEvolutionError`): `EVOLUTION_UNREACHABLE` (timeout/rede), `UNAUTHORIZED` (401/403), `INSTANCE_NOT_FOUND` (404), `QR_EXPIRED`.
- **Um ciclo de pareamento por vez por conta:** reabrir o modal cancela o ciclo anterior (QRs concorrentes falham na leitura).

### 2.3 Parâmetros e segredo

- `baseUrl` + `instanceName` → `whatsapp_accounts.provider_config` (jsonb, já existe e já é editável na tela).
- **Apikey** → digitada no modal, gravada pela edge `integration-secrets` existente com nome `{credentials_ref}_API_KEY` — exatamente a convenção que o `EvolutionProvider` já resolve (`EVOLUTION_SECRET_SUFFIXES.apiKey`). Write-only com hint de 4 chars; o valor nunca volta ao cliente.

### 2.4 Modo mock

Com `VITE_DATA_SOURCE=mock`, o modal simula a sequência (`qr` fake → `connecting` → `open` em ~4s) sem rede — mesma postura do resto do projeto. A simulação vive na camada mock (não no componente).

---

## 3. UI — Modal na `WhatsAppAccountsPage` (aprovado sobre mockups)

Container: **Dialog** (shadcn) que troca de conteúdo internamente — sem navegação de rota. Decisão tomada com mockups (modal vs página wizard); consultoria do agente de design incorporada.

### Pontos de entrada

- Botão **"+ Conectar conta"** substitui o bloco estático "Conectar uma conta nova" no fim da tela → abre o Dialog na etapa 1.
- Cards Evolution desconectados ganham ação **"Reconectar"** → abre direto na etapa 2 (QR), pois os parâmetros já existem.
- Fluxo exclusivo de `provider === 'evolution'`.

### Etapa 1 — Dados da instância

- Campos na ordem: **Nome da conta** (label) → **URL do servidor** (validação de formato, `inputMode=url`) → **Nome/ID da instância** → **API key** (`type=password`).
- Apikey write-only: se já existe no Vault, mostra hint `••••a1b2` + "Chave salva — preencha apenas para substituir".
- Botão **"Testar servidor"** (action `test`) valida URL+apikey **antes** de habilitar **"Gerar QR code"** — erros já saem tipados nesta etapa.
- Validação inline com `aria-invalid` + `aria-describedby`.

### Etapa 2 — QR

- Layout 2 colunas: QR à esquerda, passos numerados à direita (máx. 4, estilo WhatsApp Web: Abra o WhatsApp → ⋮ Menu → Dispositivos conectados → Conectar dispositivo → aponte a câmera).
- QR **sempre sobre fundo branco** (`rounded-lg bg-white p-4`, quiet zone obrigatória), módulos pretos (nunca dourado), ≥ 256px.
- Countdown: anel de progresso + texto "Expira em 0:28" (redundância visual + numérica).
- **Renovação automática até 3×**; depois, estado expirado com overlay `bg-white/80` + botão "Gerar novo código" (layout estável, sem reflow).
- Polling `state` a cada 2s; pausa quando `document.hidden`, retoma ao voltar; timers atrelados ao ciclo de vida do Dialog (`onOpenChange` limpa).
- Fechar por ESC/overlay durante `qr`/`connecting` pede confirmação ("Cancelar conexão?").

### Etapa 3 — Sucesso

- `connecting` detectado → "Celular detectado! Pareando o número…" (feedback imediato pós-leitura).
- `open` → QR colapsa em check animado verde (scale-in; respeita `prefers-reduced-motion`) + "Conectado como **{perfil}** · {número}".
- Toast sonner + invalidação da query da lista (card vira "Conectada" na hora).
- Se a instância já estiver conectada ao abrir o modal, pula o QR e mostra o estado conectado com opção "Desconectar".

### Microcopy de estados (linha de status fixa sob o QR)

| Estado | Ícone | Texto |
|---|---|---|
| Gerando QR | `mdi:loading` (spin) | "Gerando código de conexão…" |
| QR exibido | `mdi:qrcode-scan` | "Escaneie o código com seu celular. Expira em 0:30." |
| Pareando | `mdi:cellphone-link` | "Celular detectado! Pareando o número…" |
| Conectado | `mdi:check-circle` | "Conectado como {perfil} · {número}" |
| Servidor fora | `mdi:server-network-off` | "Não conseguimos falar com o servidor Evolution. Verifique se a URL está correta e se o servidor está no ar." |
| Chave recusada | `mdi:key-alert` | "A chave de API foi recusada pelo servidor. Confira a apikey." |
| Instância não encontrada | `mdi:help-network` | "Instância não encontrada neste servidor. Confira o nome/ID." |
| QR expirado | `mdi:refresh` | "O código expirou. Gere um novo para continuar." |

### Acessibilidade

- Linha de status: `role="status" aria-live="polite"`; erros: `role="alert" aria-live="assertive"`.
- Countdown numérico com `aria-live="off"` (anuncia apenas "Código expirado").
- Foco gerenciado: abre no primeiro campo → heading da etapa QR → botão "Concluir" no sucesso.
- Timeout de 10s nas ações — nunca spinner infinito; sempre botão "Tentar novamente".

### Tokens e componentes

Somente tokens semânticos (`bg-card`, `text-foreground`, `border-border`, severidades `severity-{info|success|warning|critical}`); exceção deliberada: o wrapper do QR é branco puro por exigência de leitura por câmera. Componentes: `dialog`, `progress` (ou SVG p/ anel), `alert`, `input`/`label`/`form`, `tooltip`, `skeleton`. Ícones mdi via wrapper `Icon`.

---

## 4. Dados e auditoria

- **Sem migration nova prevista:** `provider_config` (jsonb) absorve `baseUrl`/`instanceName` (já existem) e metadados do pareamento (ex.: `profileName`); `status` e telefone já existem no modelo da conta.
- **Auditoria:** `whatsapp_instance_connected`, `whatsapp_instance_disconnected`, `whatsapp_instance_restarted`, `whatsapp_instance_webhook_set` no audit log imutável; `integration_logs` (leitura Owner-only) cobre cada chamada HTTP.

## 5. Segurança

- Apikey: só no Vault + memória da edge (cache 60s já existente no engine); nunca em log (sanitize RNF-001 da Onda 5), nunca de volta ao cliente.
- QR base64 só trafega na resposta da edge — nunca persistido.
- Edge com `verify_jwt` + gate staff; RLS inalterada.
- Um ciclo de pareamento ativo por conta.

## 6. Testes

- **Vitest (unit, co-localizados):** novos métodos do engine (QR ok / 401 / 404 / timeout), parser do `connectionState`, sequência simulada do mock.
- **Gate de CI:** `bun run build` + `bun run test`; conferir espelho `_shared/whatsapp/` (sync script) no PR.
- **E2E real:** manual pelo usuário contra o servidor Evolution dele (conectar número de teste, desconectar, reconectar, derrubar servidor p/ ver erro tipado).

## 7. Entrega

1. Branch `feat/whatsapp-evolution-connect` → PR para `main` (aprovação explícita para merge, regra da casa).
2. Deploy da edge `whatsapp-connect` + redeploy das edges afetadas pelo sync (se houver mudança no espelho).
3. Após merge: bump **MINOR v0.87.0** (codinome sugerido `Socket`), CHANGELOG em linguagem de usuário.
4. Validação e2e real pelo usuário (gate final).

## 8. Decisões registradas no brainstorming

| Decisão | Escolha |
|---|---|
| Objetivo da sessão | Implementar conexão Evolution agora; Meta depois; NPS (PRD-148B) engavetado |
| Servidor Evolution | Já rodando — e2e real possível |
| Parâmetros | Tudo pela UI + apikey no Vault (Keyring) |
| Escopo | Ciclo completo (QR, status, logout, restart, webhook automático) |
| Localização na UI | Modal na tela existente (escolhido sobre mockups; especialista de design consultado) |
| Arquitetura | Edge proxy `whatsapp-connect` dedicada |
