# SDR — Consolidação do painel `/app/sdr` + escopo por instância — Design (Parte C)

> **Status:** design em revisão. Continua a cadeia `docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md` (Parte A, PR #287) → `docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md` (Parte B, PR #301, mergeada e deployada em 2026-06-16/17 — infra real já em produção). Esta é a **Parte C**: reorganização de UI + uma extensão real de escopo (seleção de instância). A **Parte D** (escalonamento com timeout real + broadcast urgente) é um documento separado — as duas foram desenhadas na mesma sessão de brainstorm por estarem relacionadas, mas são planos e PRs independentes.

**Objetivo:** eliminar a duplicação confusa entre dois painéis "SDR ativo" (o hub de IA, criado na Parte B, e o painel legado `/app/sdr`), concentrando toda a configuração operacional do piloto em `/app/sdr`. Ao mesmo tempo, fechar uma lacuna real do piloto: hoje ele age em **todas** as instâncias WhatsApp da loja sem distinção — passa a ser possível escolher em quais.

---

## Contexto — como chegamos aqui

A Parte B concentrou a configuração operacional do piloto (liga/desliga + timeout de backstop) numa nova 5ª aba "SDR" dentro do hub `/app/configuracoes/ia`, por decisão explícita da sessão anterior. Só que o projeto **já tinha** um painel dedicado inteiro para o SDR — `/app/sdr` (`SdrDashboardPage`, PRD-024, 5 abas: Visão geral / Histórico / Métricas / Templates / Configurações) — construído na Fase 1 como simulação mock-first (PRD-020/022/023) e nunca conectado a tráfego real.

Investigação desta sessão encontrou:

- **`sdr_sessions` e `sdr_escalations` já são tabelas reais**, com impls Supabase de verdade — e o `sdr-respond` real (Parte B) já escreve nelas. As abas Visão geral/Histórico/Métricas do painel antigo **já vão mostrar dado real automaticamente** assim que uma loja for ativada — sem precisar de nenhuma mudança de código. Confirmado que o Simulador (`SdrSimulatorPage`) não consegue contaminar essas tabelas em modo `supabase`: ele usa um `conversation_id` fixo (`"sim-conv"`), que não é um UUID válido — a escrita falharia silenciosamente sob RLS/tipo, então nunca chegou a acontecer em produção.
- A aba "Configurações" do painel antigo tem **três blocos que não têm correspondência real** hoje: "Orçamento automático" (PRD-022 — geração de orçamento + desconto autorizado, o SDR real nunca menciona valores, por decisão da Parte A) e "Escalonamento" (PRD-023 — timeouts de fila + broadcast urgente, tratado na Parte D). A aba "Templates" edita textos (`IPlatformSettings.sdrTemplates`) que o SDR real não lê — ele usa `ai_settings.routing[feature='sdr'].systemPrompt`.
- O toggle "Agente SDR ativo" desse painel grava em `stores.settings.sdrEnabled` (jsonb) — persiste de verdade, mas **nenhum código de produção lê esse campo**. É decorativo.

## Decisões desta sessão

1. **`/app/sdr` vira o único lugar para configuração operacional do piloto.** A aba "SDR" do hub de IA (criada na Parte B) é removida; o campo `sdr_enabled`/`backstop_timeout_minutes` (tabela `sdr_settings`, já em produção) passa a ser editado só pela aba "Configurações" de `/app/sdr`.
2. **Modelo/provedor/prompt do SDR continuam na aba Funcionalidades do hub de IA** — não migram. Esse campo é compartilhado com o mesmo padrão de roteamento usado por copiloto, identificação de peça e insights; duplicá-lo quebraria esse padrão. `/app/sdr` ganha só um link de atalho.
3. **Orçamento automático e Templates ficam como placeholder visual** — visíveis, com indicação clara de "em breve"/não-funcional, campos desabilitados. Não escrevem em nada, não afetam o SDR real. Preserva a visão de produto sem reabrir a decisão de guardrails da Parte A.
4. **Escalonamento (timeout + broadcast)** é implementado de verdade, mas em um documento e plano **separados** (Parte D) — complexidade e risco comparáveis à Parte B inteira (trigger novo, tick novo, RPC atômica).
5. **Nova funcionalidade: escopo por instância WhatsApp.** A aba "Configurações" de `/app/sdr` ganha uma lista das instâncias WhatsApp da loja, cada uma com um checkbox — **desmarcado por padrão** (comportamento conservador: mesmo com o piloto ligado na loja, nenhuma instância recebe o SDR até o dono marcar explicitamente).

---

## Componentes

### 1. Migration — escopo por instância

Nova coluna `whatsapp_accounts.sdr_enabled boolean not null default false` — mesmo padrão já usado por `whatsapp_accounts.alerts_muted` nessa mesma tabela (feature togglável por conta, sem tabela nova).

```sql
alter table public.whatsapp_accounts
  add column sdr_enabled boolean not null default false;
```

Sem RLS nova: `whatsapp_accounts` já tem suas policies (leitura por acesso de instância, escrita staff-only) — este campo entra na mesma superfície.

`IWhatsAppAccount` (`src/shared/types/conversation.ts`) ganha `sdrEnabled: boolean`, ao lado do já existente `alertsMuted: boolean`; `IWhatsAppAccountPatch` ganha `sdrEnabled?: boolean`. Mock e Supabase impls do provider `whatsappAccounts` mapeiam o campo novo (leitura + `update()`), mesmo padrão de `alertsMuted`.

### 2. Enforcement no backend real (Parte B, ajuste cirúrgico)

Dois pontos que já checam `sdr_settings.sdr_enabled` (store-wide) passam a checar **também** `whatsapp_accounts.sdr_enabled` (instância) antes de agir — defesa em profundidade, mesmo padrão usado pelas outras checagens do piloto:

- **`sdr-backstop-tick`**: ao resolver as conversas candidatas por loja, faz join com `whatsapp_accounts` (via `conversations.whatsapp_account_id`) e só ativa o SDR (`is_sdr_active=true`) se a instância também estiver com `sdr_enabled=true`. Segue o padrão já usado ali para o filtro de horário comercial (checagem em código, não embutida na predicate do índice parcial existente).
- **`sdr-respond`**: no passo que hoje só lê `sdr_settings.sdr_enabled` da loja, passa a ler também a flag da instância da conversa (`conversations.whatsapp_account_id` → `whatsapp_accounts.sdr_enabled`) e faz no-op se estiver desligada — cobre o caminho do `whatsapp-webhook`'s `onSdrTurn`, que não muda.

**Semântica ao desligar uma instância em andamento:** igual ao toggle de loja hoje — não força o desligamento de conversas já com `is_sdr_active=true`; a checagem vale a partir do próximo turno. Sem caso especial novo.

### 3. Aba "Configurações" real em `/app/sdr`

Substitui o conteúdo mock de `SdrSettingsTab.tsx` (`src/features/sdr-dashboard/components/tabs/`). Novo conteúdo:

- **Bloco "Piloto"**: switch "SDR ativo nesta loja" + input "Tempo de espera até o SDR assumir (minutos)" — mesmos campos e mesmo provider (`sdrSettings`, contrato/impls já existentes da Parte B), só que renderizados aqui em vez do hub de IA.
- **Bloco "Instâncias"** (novo): lista das contas WhatsApp da loja (nome + número, reaproveitando o componente de listagem já usado em `WhatsAppAccountsPage`), cada uma com um `Switch` "SDR ativo neste número" — todas desligadas por padrão. Reaproveita o `update()` já existente do provider `whatsappAccounts` — `IWhatsAppAccountPatch` é uma whitelist explícita (não `Partial<IWhatsAppAccount>`), então ganha um novo campo `sdrEnabled?: boolean` ao lado do já existente `alertsMuted?: boolean` (mesmo padrão), com o `id`/`storeId` implícitos como em qualquer chamada de `update`.
- **Bloco "Orçamento automático" (placeholder)**: mesmos campos visuais do painel antigo (slider validade, slider desconto), todos `disabled`, com badge "Em breve" no cabeçalho do card e texto explicando que o SDR real não gera orçamento hoje.
- **Bloco "Escalonamento" (placeholder até a Parte D)**: mesma tratativa — campos visíveis e desabilitados, badge indicando que o mecanismo real chega numa entrega separada. **Este bloco é substituído pelo conteúdo real quando a Parte D for implementada** — não é definitivo.
- **Bloco "Templates" (placeholder)**: mantém o link "Ir para aba Templates" mas com aviso de que os textos editados ali não alimentam o SDR real hoje.
- Link de atalho: *"Provedor, modelo e prompt de sistema do SDR são configurados em Configurações → Inteligência artificial → Funcionalidades."*

### 4. Remoção da aba "SDR" do hub de IA

- `AiSdrTab.tsx` (`src/features/ai-settings/pages/`) é removido; `AiSettingsPage.tsx` volta a 4 abas (Visão geral / Provedores & chaves / Funcionalidades / Playground).
- A aba Funcionalidades (onde o roteamento do SDR já vive) ganha uma nota curta apontando para `/app/sdr` para o liga/desliga operacional.
- O provider `sdrSettings` (contrato + impls mock/supabase) **não muda** — só quem o consome muda de tela.

### 5. Aba "Templates" do painel antigo — nenhuma mudança de dado

Sem mudança de schema ou provider — só o texto/estado visual (placeholder). O trabalho aqui é inteiramente de UI.

---

## Testes

- Engine puro do escopo por instância (se houver lógica de filtro extraída, ex. "quais instâncias estão elegíveis para o SDR nesta loja") ganha teste Vitest, seguindo o padrão `engine/` do projeto.
- `sdr-backstop-tick`/`sdr-respond`: sem cobertura automatizada (Deno, fora do `tsc`/Vitest do projeto — mesma ressalva já documentada na Parte B). Validação por revisão + smoke manual do dono pós-deploy.
- Componentes de UI (blocos placeholder, lista de instâncias): sem necessidade de teste automatizado além do já padrão do projeto (não há teste de componente React nesta base).

## Rollout

Mesma filosofia cautelosa da Parte B: com `whatsapp_accounts.sdr_enabled` chegando com `default false`, e `sdr_settings.sdr_enabled` já `false` em todas as lojas, este trabalho **não muda nenhum comportamento real em produção** ao ser deployado — só reorganiza onde a configuração é editada e adiciona uma trava extra (instância) que começa fechada.

## Não-objetivos (fora desta entrega)

- Orçamento automático real (PRD-022) — decisão explícita: fora de escopo, sem previsão.
- Escalonamento com timeout/broadcast real — Parte D, documento separado.
- Templates reais alimentando o prompt do SDR — fora de escopo, sem previsão.
