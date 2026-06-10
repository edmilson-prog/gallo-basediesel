# PRD-116: Templates HSM (Highly Structured Messages)

> ✅ **STATUS (2026-06-10): CONCLUÍDO** — catálogo `public.message_templates`
> (migration `20260610134530`, RLS por loja validada ao vivo: staff escreve,
> vendedor só lê), provider `messageTemplates` (37º: contrato + mock com os 3
> seeds do PRD + supabase), render puro `renderTemplate`/`countTemplateVariables`
> (6 testes Vitest), tela `/app/configuracoes/templates-whatsapp`
> (Owner/Gestor — CRUD com validador de `{{N}}`, preview ao vivo, meta-campos
> imutáveis pós-criação) e `TemplatePicker` integrado ao `MessageInput`: o
> erro `TEMPLATE_REQUIRED` do whatsapp-send abre o picker automaticamente em
> fonte supabase (o `TemplateDialog` mock da Fase 1 segue intacto); o envio
> usa `kind='template'` com nome/idioma/variáveis reais. Desvios em
> `docs/dev/whatsapp-templates.md`: schema `public`, Provider Pattern da casa
> (não métodos no IDataProvider), rota `templates-whatsapp` (colisão com
> templates do SDR), sincronização Meta manual (conforme o próprio PRD),
> envio real gated nas credenciais Meta. Bump v2.1.0-rc.x não se aplica.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/templates/` + `supabase/migrations/`_ |
| **Objetivo** | Gestão e uso de **templates HSM** (Highly Structured Messages) aprovados pela Meta para iniciar conversa fora da janela de 24h. Catálogo local em `crm.message_templates` espelhando o que foi aprovado no Meta Business Manager, render de variáveis (`{{1}}`, `{{2}}`...), picker no frontend que sugere templates ao receber `TEMPLATE_REQUIRED` (PRD-115), e construção do payload `components` para envio via `provider.sendTemplate` |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — sem templates, comunicação outbound fora da janela 24h é impossível em Meta |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-112 (Meta — provider.sendTemplate); PRD-115 (Envio — chama este); PRD-101 (schema novo `crm.message_templates`); PRD-006 (RBAC — quem gerencia templates); PRD-009 (Identidade — exemplos consistentes); PRD-148 Onda 8 (Drip Campaigns — consome templates) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Tabela em migration aditiva; frontend em `src/features/templates/`; render lib pura |

### Critérios de Complexidade

> **Justificativa de Média:** lógica de domínio (templates Meta têm regras específicas — categories, params, components), render de variáveis com escape correto, sincronização manual entre Business Manager e nosso catálogo, picker UX funcional. Sem complexidade técnica gigante; mas erro causa template enviado com variável errada ou template não-aprovado que falha no provider.

---

## Contexto do Problema

Quando vendedor tenta enviar mensagem de texto livre para cliente que não enviou nada nas últimas 24h, **Meta bloqueia** (PRD-115 RF-020 detecta e retorna `TEMPLATE_REQUIRED`). Para reabrir o canal, é obrigatório enviar um **Template HSM** previamente aprovado.

Os templates HSM:
- São criados no Meta Business Manager (Workflow manual; pode levar dias/horas para aprovação)
- Têm `name`, `language`, `category` (utility/marketing/authentication), `components` (header, body, footer, buttons)
- Aceitam variáveis posicionais `{{1}}`, `{{2}}`, ... preenchidas na hora do envio
- Não podem ter texto promocional na categoria utility

Cliente GALLO tem templates como:
- `boas_vindas_v1`: "Olá {{1}}! Recebemos seu interesse na peça {{2}}. Um vendedor entrará em contato em breve."
- `aviso_pedido_pronto`: "Pedido #{{1}} pronto para retirada na loja {{2}}. Endereço: {{3}}"
- `cobranca_amigavel`: "Olá {{1}}, seu pedido #{{2}} no valor de R$ {{3}} vence em {{4}}."

Este PRD entrega catálogo + picker + render.

---

## Conceito da Solução

### Schema Novo

Migration adicional ao PRD-101:

```sql
CREATE TABLE crm.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES crm.stores(id),  -- null = global
  whatsapp_account_id uuid REFERENCES crm.whatsapp_accounts(id),  -- conta onde foi aprovado
  
  -- Metadata Meta
  meta_template_name text NOT NULL,
  meta_language_code text NOT NULL,
  meta_category text NOT NULL CHECK (meta_category IN ('utility','marketing','authentication')),
  meta_status text NOT NULL DEFAULT 'unknown' CHECK (meta_status IN ('approved','pending','rejected','paused','unknown')),
  
  -- Curadoria interna
  display_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Estrutura
  body_template text NOT NULL,  -- "Olá {{1}}! Pedido {{2}} pronto."
  variable_count integer NOT NULL DEFAULT 0,
  variable_labels jsonb NOT NULL DEFAULT '[]',  -- ["Nome do cliente", "Número do pedido"]
  
  header_type text CHECK (header_type IN ('none','text','image','document','video')),
  header_text_template text,  -- se header_type='text'
  
  buttons jsonb,  -- [{ type: 'quick_reply'|'url'|'call', text, url?, phone? }]
  
  -- Auditoria
  created_by uuid REFERENCES crm.sellers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,  -- última sincronia com Meta (futuro PRD)
  
  UNIQUE (whatsapp_account_id, meta_template_name, meta_language_code)
);

-- Trigger updated_at já criado em PRD-101 RF-100

-- RLS (vai no PRD-103 estendido ou aqui):
ALTER TABLE crm.message_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer authenticated da store (vendedor escolhe template para usar)
CREATE POLICY "templates_select" ON crm.message_templates
  FOR SELECT TO authenticated
  USING (store_id IS NULL OR store_id = crm.current_store_id());

-- INSERT/UPDATE/DELETE: apenas owner/manager
CREATE POLICY "templates_manage" ON crm.message_templates
  FOR ALL TO authenticated
  USING (crm.has_any_role(ARRAY['owner','manager']));
```

### Render

```typescript
// src/features/templates/render.ts
export function renderTemplate(template: IMessageTemplate, variables: string[]): {
  text: string
  components: MetaTemplateComponent[]
} {
  // Validação
  if (variables.length !== template.variableCount) {
    throw new AppError('VALIDATION_ERROR', 422,
      `Template ${template.metaTemplateName} requer ${template.variableCount} variáveis, recebeu ${variables.length}`)
  }
  
  // Renderiza body (substitui {{1}}, {{2}}, ...)
  let text = template.bodyTemplate
  variables.forEach((value, i) => {
    text = text.replace(new RegExp(`\\{\\{${i+1}\\}\\}`, 'g'), value)
  })
  
  // Constrói payload para Meta
  const components: MetaTemplateComponent[] = []
  if (variables.length > 0) {
    components.push({
      type: 'body',
      parameters: variables.map(v => ({ type: 'text', text: v }))
    })
  }
  if (template.headerType === 'text' && template.headerTextTemplate) {
    // Headers podem ter sua própria variável
    // simplificação MVP: header sem variável ou variável única {{1}}
    components.unshift({
      type: 'header',
      parameters: [{ type: 'text', text: template.headerTextTemplate }]
    })
  }
  
  return { text, components }
}
```

### Picker UX

```
[Frontend tenta enviar text livre fora da janela 24h]
   ──▶ PRD-115 retorna TEMPLATE_REQUIRED
   ──▶ Frontend abre modal "Selecionar Template"
   ──▶ Lista templates ativos com display_name e preview
   ──▶ Vendedor escolhe um
   ──▶ Modal mostra inputs por variável (com labels)
   ──▶ Vendedor preenche
   ──▶ Preview rendered atualiza em tempo real
   ──▶ Vendedor clica "Enviar"
   ──▶ Frontend chama send({ kind: 'template', templateName, languageCode, variables: [...] })
   ──▶ Edge Function PRD-115 monta components via renderTemplate e chama provider.sendTemplate
```

### Sincronização com Meta

MVP: **manual**. Owner/Manager cadastra template no Business Manager → aprova → cria registro correspondente no `/app/configuracoes/templates` colocando `meta_template_name`, `meta_status='approved'`, etc.

Futuro (Onda 8 ou 13): Edge Function que consulta Graph API `/{business_account_id}/message_templates` e sincroniza catálogo automaticamente.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Sincronização automática com Meta no MVP | Workflow Meta tem nuances (aprovação assíncrona, paused, etc.); manual é mais simples e seguro pra começar |
| Templates como JSON em `platform_settings` | Tabela dedicada permite RLS por store + audit; melhor estrutura |
| Render no provider (PRD-112) | Renderização é responsabilidade de domínio do CRM, não do provider |
| Aceitar texto livre como "template" fallback | Meta rejeita; pior UX que mostrar picker |

---

## Escopo

### Incluído

- ✅ Migration `crm.message_templates` + RLS
- ✅ Função `renderTemplate(template, variables): { text, components }`
- ✅ CRUD básico de templates em `/app/configuracoes/templates` (apenas owner/manager):
  - Listar
  - Criar (input dos metadados; o template real precisa ter sido aprovado na Meta — UX explicita isso)
  - Editar (display_name, description, is_active; meta_status atualizável manualmente)
  - Desativar (`is_active=false` — não aparece no picker)
- ✅ Componente `TemplatePicker` reutilizável (modal)
- ✅ Integração na tela de Conversa: aparece quando `TEMPLATE_REQUIRED` é recebido
- ✅ Preview em tempo real durante preenchimento das variáveis
- ✅ Validação de variáveis (count + labels não-vazios)
- ✅ Provider de dados: `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate` no `IDataProvider` (PRD-005) + implementação Supabase (PRD-104)
- ✅ Seeds: 3 templates exemplo (boas_vindas, pedido_pronto, cobranca_amigavel) — apenas se cliente já tiver aprovados; caso contrário, seeds vazios e Owner cadastra
- ✅ Testes: render com variáveis corretas/erradas, picker abre/escolhe/envia
- ✅ Documentação `docs/dev/whatsapp-templates.md`: como cadastrar template no Business Manager, como espelhar aqui, regras Meta de category, troubleshooting de template rejeitado

### Excluído

- ❌ Sincronização automática com Meta API (manual no MVP; Onda 8/13 considera)
- ❌ Submissão de template para aprovação Meta via API (Owner usa Business Manager UI)
- ❌ Templates com header de mídia (imagem/vídeo) — MVP só text header; expandir conforme demanda
- ❌ Buttons interativos completos — schema cobre, mas UX MVP foca em quick_reply simples; URLs e call buttons em PRD futuro
- ❌ Analytics de uso de template (PRD-118/Onda 8)
- ❌ A/B testing de templates (Onda 13)

---

## Requisitos Funcionais

### Schema

- **RF-001:** Migration `crm.message_templates` conforme schema acima.
- **RF-002:** RLS: SELECT para authenticated (com store filter), CUD apenas owner/manager.
- **RF-003:** Constraint UNIQUE em `(whatsapp_account_id, meta_template_name, meta_language_code)`.
- **RF-004:** `body_template` deve usar `{{N}}` para variáveis (validação no INSERT via CHECK ou Edge Function).

### Render

- **RF-010:** Função pura `renderTemplate(template, variables): { text, components }` em `src/features/templates/render.ts`.
- **RF-011:** Valida `variables.length === template.variableCount`; lança AppError se não.
- **RF-012:** Substitui `{{1}}`, `{{2}}`, ... por valores em ordem.
- **RF-013:** Constrói `components` no formato Meta:
  ```ts
  [
    { type: 'header', parameters: [...] },  // se header_type='text'
    { type: 'body', parameters: [...] },     // sempre se há variáveis
    { type: 'button', sub_type: 'quick_reply', index: 0, parameters: [...] }  // futuro
  ]
  ```
- **RF-014:** Escape de caracteres especiais Meta (linha quebrada, etc.) no `text` retornado para preview UI.

### CRUD via Provider

- **RF-020:** `IDataProvider.listTemplates(storeId?): IMessageTemplate[]` (filter by store implícito via RLS).
- **RF-021:** `IDataProvider.getTemplate(id): IMessageTemplate`.
- **RF-022:** `IDataProvider.createTemplate(input): IMessageTemplate` — owner/manager.
- **RF-023:** `IDataProvider.updateTemplate(id, partial): IMessageTemplate` — owner/manager.
- **RF-024:** `IDataProvider.deactivateTemplate(id)` — soft delete via `is_active=false`.
- **RF-025:** Implementação Supabase mapeia `crm.message_templates` row ↔ `IMessageTemplate` TS.

### Tela `/app/configuracoes/templates`

- **RF-030:** Listagem de templates ativos e inativos (toggle filtro).
- **RF-031:** Botão "Novo template" abre formulário:
  - Campos: `display_name`, `description`, `whatsapp_account_id` (select), `meta_template_name`, `meta_language_code` (default `pt_BR`), `meta_category`, `body_template`, `variable_labels[]`, `header_type`, `header_text_template?`, `buttons[]?`.
  - Botão `Verificar contagem de variáveis` parseia `body_template` e detecta `{{N}}` — valida que bate com `variable_labels.length`.
  - Helper UX: "Cole exatamente como aprovado no Business Manager".
- **RF-032:** Editar permite ajustar `display_name`, `description`, `is_active`, `variable_labels` (UI label, não muda o que vai pra Meta). `body_template` e `meta_*` ficam read-only após criação (alteração exige novo template aprovado).
- **RF-033:** `meta_status` atualizável (owner reporta o que ele viu no Business Manager): approved/pending/rejected/paused.
- **RF-034:** Tabela com colunas: display_name, meta_template_name, language, category, status (badge colorido), variáveis, ações.

### Componente TemplatePicker

- **RF-040:** Modal/sheet acionado por `<TemplatePicker onSelect={...} />`.
- **RF-041:** Lista templates `is_active=true` e `meta_status='approved'`.
- **RF-042:** Filtros: busca por nome, filtro por categoria, idioma.
- **RF-043:** Clicar em template abre seção de variáveis:
  - Inputs com labels (`variable_labels[i]`)
  - Preview em tempo real ao lado/abaixo (render via `renderTemplate` no client)
- **RF-044:** Botão "Enviar" só habilitado quando todas as variáveis preenchidas.
- **RF-045:** Ao confirmar: callback `onSelect({ templateId, templateName, languageCode, variables })`.

### Integração com Conversa

- **RF-050:** Hook `useSendMessage` (PRD-115) ao receber `TEMPLATE_REQUIRED`:
  - Exibe banner "Fora da janela de 24h. Use um template."
  - Botão "Selecionar template" abre `TemplatePicker`
  - `onSelect` aciona `send({ kind: 'template', templateName, languageCode, variables })`
- **RF-051:** PRD-115 monta payload `components` via `renderTemplate` antes de chamar `provider.sendTemplate`.

### Seeds

- **RF-060:** Migration `00000000000051_seeds_message_templates.sql` (após seeds principais do PRD-101):
  - Opcional: 3 templates exemplo com `meta_status='unknown'` (placeholder — Owner deve verificar e atualizar para `approved` quando real)
  - Documentar que seeds são placeholder até Owner confirmar status no Business Manager

### Testes

- **RF-070:** Testes unitários `render.test.ts`:
  - Render com variáveis corretas → text esperado + components esperados
  - Render com count errado → AppError
  - Escape de caracteres especiais
  - Template sem variáveis → components vazios (apenas body sem parameters)
- **RF-071:** Teste de integração: enviar template real via PRD-115 → Meta sandbox → validar entrega

### Documentação

- **RF-080:** `docs/dev/whatsapp-templates.md`:
  - O que são templates HSM e por que existem
  - Categorias Meta (utility, marketing, authentication) — exemplos
  - Workflow: cadastrar no Business Manager → aguardar aprovação → espelhar aqui
  - Regras de variáveis ({{1}}, {{2}})
  - Exemplos de templates GALLO
  - Troubleshooting (rejected, paused, etc.)
  - Roadmap futuro (sync automático, header de mídia, buttons completos)

---

## Requisitos Não-Funcionais

- **RNF-001 (Manutenibilidade):** Cadastrar template novo leva < 5min após aprovação Meta — fluxo simples.
- **RNF-002 (UX picker):** Picker abre em < 200ms; lista de templates renderiza instantaneamente.
- **RNF-003 (Preview):** Preview de render em tempo real (< 50ms para feedback).
- **RNF-004 (Validação):** Render falha rápido e claro se variáveis não batem; nunca envia template malformado.
- **RNF-005 (Segurança):** Apenas owner/manager edita templates; vendedor só consome.

---

## Critérios de Aceitação

### RF-011 + RF-012: Render Correto

```gherkin
DADO um template body_template = "Olá {{1}}! Seu pedido {{2}} está pronto na loja {{3}}."
  E variableCount = 3
QUANDO renderTemplate(template, ['João', '12345', 'Matriz'])
ENTÃO text = "Olá João! Seu pedido 12345 está pronto na loja Matriz."
  E components = [{ type: 'body', parameters: [{type:'text',text:'João'},{type:'text',text:'12345'},{type:'text',text:'Matriz'}] }]

QUANDO renderTemplate(template, ['João'])  -- count errado
ENTÃO lança AppError VALIDATION_ERROR
```

### RF-040 + RF-050: Picker Acionado

```gherkin
DADO vendedor tenta enviar text fora da janela 24h
QUANDO PRD-115 retorna TEMPLATE_REQUIRED
ENTÃO frontend exibe banner "Fora da janela"
  E botão "Selecionar template" visível
  E clicar abre TemplatePicker
  E lista mostra apenas templates is_active=true e meta_status='approved'
```

### RF-043 + RNF-003: Preview em Tempo Real

```gherkin
DADO TemplatePicker aberto com template selecionado
QUANDO usuário digita "João" no input variável 1
ENTÃO preview ao lado atualiza com "João" substituído imediatamente
  E enquanto variáveis incompletas, botão Enviar desabilitado
```

### RF-020 + RF-002: Listagem Filtrada por Store

```gherkin
DADO 2 stores ST1 e ST2
  E template T1 em ST1, T2 em ST2, T3 global (store_id=null)
QUANDO vendedor de ST1 chama listTemplates()
ENTÃO recebe T1 e T3 (RLS filtra)
  E NÃO recebe T2
```

---

## Fases de Implementação

### Fase 1 — Schema + Provider CRUD (1 dia)
- Migration message_templates + RLS
- Provider methods (mock + supabase)
- Seeds placeholder

### Fase 2 — Render + Testes (1 dia)
- renderTemplate puro
- Validação
- Testes unitários

### Fase 3 — Tela Configuração + CRUD UI (1.5 dias)
- /app/configuracoes/templates
- Form de criação/edição
- Validação UX (count de variáveis)

### Fase 4 — Picker + Integração + Docs (1.5 dias)
- TemplatePicker componente
- Integração com Conversa via useSendMessage
- Preview em tempo real
- Teste E2E
- `docs/dev/whatsapp-templates.md`
- `_DONE`

---

## Dependências

- **Depende de:** PRD-101 (schema base), PRD-103 (RLS), PRD-104 (provider supabase), PRD-115 (envio integra)
- **Bloqueia:** PRD-148 Onda 8 (Drip Campaigns), uso operacional fora da janela 24h
- **Decisões Pendentes:** seeds reais (depende de Owner GALLO ter templates aprovados); header de mídia (futuro); sync automático (futuro Onda 8/13).

---

## Considerações de Segurança

- **RLS estrito:** SELECT por store, manage só owner/manager
- **Variáveis sanitizadas no preview** — não interpretar HTML
- **No prompt injection** — variáveis são texto literal, sem render markdown/HTML no template body
- **Validação rigorosa de count** — evita envio malformado

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.6; CHANGELOG; renomear `PRD-116-whatsapp-templates_DONE.md`; ao menos 1 template real testado fim-a-fim com Meta sandbox.

| Princípio | Descrição |
|-----------|-----------|
| **Templates espelham Meta** | Catálogo aqui é réplica; Meta é a fonte de verdade da aprovação |
| **Variáveis numéricas** | `{{1}}`, `{{2}}` — manter consistência Meta |
| **Render é puro** | Função sem side-effect; fácil testar |
| **Validação antes de enviar** | Count, status approved, ativo |

| ❌ Evitar |
|-----------|
| Render no provider |
| Permitir edição de body_template (gera divergência com aprovação Meta) |
| Picker mostrar templates não-aprovados |
| HTML/markdown nos templates |
| Variáveis nomeadas (`{{name}}`) — Meta usa numéricas |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (com desvios documentados — ver nota no topo) |
| **Data** | 2026-06-10 |
| **Versão** | PR do PRD-116 (bump no merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2b do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
