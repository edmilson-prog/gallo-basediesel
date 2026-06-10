# Templates HSM — catálogo e picker (PRD-116)

> Templates aprovados pela Meta são o ÚNICO jeito de iniciar conversa fora da
> janela de 24h (erro `TEMPLATE_REQUIRED` do `whatsapp-send` — PRD-115).
> Este módulo entrega o catálogo local, o render de variáveis e o picker.

## Peças

| Peça | Onde |
| --- | --- |
| Tabela `public.message_templates` | migration `20260610134530` — RLS: SELECT por loja (+ globais `store_id null`); escrita só staff (validado ao vivo: owner insere, seller bloqueado) |
| Provider `messageTemplates` (37º) | contrato + mock (3 seeds do PRD) + supabase; acesso via `useMessageTemplatesProvider()` |
| Render | `src/features/templates/engine/render.ts` — puro, 6 testes: `renderTemplate(template, variables)` → `{ text, components }` no formato Meta; `countTemplateVariables` detecta `{{N}}` distintos |
| Tela | `/app/configuracoes/templates-whatsapp` (Owner/Gestor) — CRUD com validador de variáveis, preview ao vivo e badge de status Meta. Corpo e metadados Meta são **imutáveis** após criar (mudou na Meta ⇒ template novo) |
| Picker | `TemplatePicker` — abre quando o envio bounce com `TEMPLATE_REQUIRED` (ou pelo botão Templates em fonte `supabase`); inputs rotulados por variável + preview; envia `kind='template'` |

## Fluxo de envio

1. Vendedor envia texto livre fora da janela → `whatsapp-send` responde 422
   `TEMPLATE_REQUIRED` → o `MessageInput` abre o `TemplatePicker`
   (sem toast de erro — não é falha, é fluxo).
2. Vendedor escolhe template aprovado, preenche variáveis (labels da tela de
   config), vê o preview e confirma.
3. `useMessageSend` envia `{ kind: 'template', templateName, templateLanguage,
   templateParameters, text: <corpo renderizado> }` — o texto renderizado é o
   que fica persistido na conversa.
4. Em fonte **mock**, o `TemplateDialog` da Fase 1 segue intacto.

## Cadastro (sincronização manual — MVP)

1. Criar/aprovar o template no **Meta Business Manager** (categoria utility/
   marketing/authentication; aprovação pode levar horas/dias).
2. Em Configurações → Templates WhatsApp → **Novo template**: colar
   exatamente como aprovado (nome, idioma, corpo com `{{N}}`), rotular as
   variáveis e marcar o status real.
3. Template rejeitado/pausado na Meta ⇒ atualizar o status aqui (sai do
   picker se não-approved) — sincronização automática via Graph API fica para
   onda futura (documentado no PRD).

## Desvios do PRD (registrados)

1. Schema `public` (não `crm`); helpers RLS da casa (`current_store_id`/`is_staff`).
2. Provider Pattern da casa (contrato dedicado `messageTemplates`) em vez de
   métodos no `IDataProvider` monolítico (que não existe neste repo).
3. Rota `/app/configuracoes/templates-whatsapp` (não `/templates` — evita
   colisão com Templates de mensagem do SDR).
4. Header com variável própria e buttons interativos: schema cobre, UX MVP
   não expõe (exclusões do próprio PRD).
5. Envio real ida-e-volta **gated** nas credenciais Meta (mesmos gates dos
   PRDs 112–115).
