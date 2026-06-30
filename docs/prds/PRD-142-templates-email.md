# PRD-142: Templates de Email (React Email + Branding GALLO)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/emails/` (templates) + `_shared/email-render.ts` (SSR Deno)_ |
| **Objetivo** | Entregar o catálogo de templates transacionais que o `renderEmailTemplate` (contrato do PRD-141) consome: **React Email** (`@react-email/components`) com renderização server-side no Edge (Deno + `react-dom/server`), tipagem por template (cada um exporta seu `Props`), **branding GALLO adaptado ao meio email** (versão light — dark mode não sobrevive a clientes de email; dourado/preto técnico; fontes seguras com Saira best-effort), layout base único com header/footer conformes (endereço físico + descadastro do 141), **plain text gerado junto**, e preview dev-only para iteração visual sem enviar nada |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P1 — o canal (141) funciona com fallback; a marca exige isto antes do go-live |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | PRD-141 (**co-dependência**: define o contrato; Fase 1 daqui destrava a Fase 4 de lá); PRD-001 F1 (identidade visual — adaptada, não copiada); PRD-147 (link de descadastro no footer); PRD-148/149 (templates de marketing/recuperação virão sobre o mesmo sistema); PRD-129/134/135 (conteúdo dos transacionais) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Templates como componentes React tipados em `src/emails/templates/`; render isomórfico importável pelo Edge |

### Critérios de Complexidade

> **Justificativa de Média:** a lógica é simples; a dificuldade é o **meio hostil**. HTML de email vive em 1999: Outlook renderiza com engine do Word, Gmail corta CSS no `<head>`, dark mode dos clientes inverte cores sem pedir licença, e webfonts carregam em talvez 40% dos casos. Cada decisão visual do PRD-001 (dark default, Saira Condensed, dourado sobre carbono) precisa de **tradução consciente** — não cópia — ou o email da GALLO chega ilegível exatamente no cliente mais usado pelo comprador B2B (Outlook corporativo).

---

## Contexto do Problema

O PRD-141 entrega o canal com um template fallback propositalmente feio — texto puro num shell mínimo. Para o go-live, os quatro emails que todo cliente verá (pedido confirmado, pagamento recebido, boleto, NFe) precisam:

1. **Parecer a GALLO** — sem virar um boleto bancário genérico
2. **Renderizar em Outlook/Gmail/Apple Mail** — incluindo o Outlook desktop do financeiro da transportadora
3. **Ser type-safe** — `nfe.issued` sem `nfNumber` deve falhar em `tsc`, não em produção
4. **Ter par em texto puro** — clientes corporativos com HTML bloqueado e acessibilidade

E o sistema precisa nascer extensível: drip (148) e carrinho abandonado (149) adicionarão templates de marketing sobre a mesma base.

---

## Conceito da Solução

### Stack: React Email + SSR no Deno

```typescript
// _shared/email-render.ts — consumido pelo EmailChannel (141)
import { render } from '@react-email/render'        // html + plain text
import { templates } from '@/emails/registry'

export function renderEmailTemplate<K extends TemplateKey>(
  key: K,
  props: TemplateProps[K]
): { subject: string; html: string; text: string }
```

- `@react-email/components` (`<Html> <Container> <Section> <Button> <Hr>`) gera tabelas compatíveis com Outlook automaticamente
- Render no Edge via `react-dom/server` (suportado em Deno) — sem serviço externo, sem build step de templates
- **Registry tipado:** `TemplateKey` union literal; `TemplateProps` mapeia key→Props; chave desconhecida ou props faltando = erro de compilação
- Subject é função das props (`subject(props)`) — "Pedido #PD-0042 confirmado", não genérico

### Tradução do Branding (PRD-001 → meio email)

| Token PRD-001 | No email | Por quê |
|---------------|----------|---------|
| Dark + Diesel default | **Light** com acentos dourado `#D2A809` sobre branco; texto `#404041` | Dark mode de clientes de email inverte cores imprevisívelmente; light é a única base controlável |
| Saira Condensed (display) | `@font-face` best-effort + fallback `Arial Narrow, Arial, sans-serif` | Webfont carrega em ~40% dos clientes; o fallback precisa manter a hierarquia |
| Inter (UI) | Fallback `Helvetica, Arial, sans-serif` | Idem |
| JetBrains Mono (códigos) | `Courier New, monospace` para linha digitável/chave NFe | Monospace é essencial para conferência visual de códigos |
| Logo | PNG hospedado em bucket público (`assets/email/logo-gallo.png`), `width` fixo, `alt` correto | SVG não renderiza em Outlook; imagem bloqueada → alt segura a marca |

Regra de ouro documentada: **nenhum** CSS fora de inline/atributos suportados; o React Email cuida, mas componentes custom passam por checklist.

### Layout Base (`<GalloEmailLayout>`)

```
┌──────────────────────────────────────┐
│  [logo GALLO]                         │  header: branco, logo 160px
├──────────────────────────────────────┤
│  {children — corpo do template}       │  Container 600px máx
├──────────────────────────────────────┤
│  GALLO Base Diesel · <endereço store> │  footer: cinza, 12px
│  Você recebe este email porque...     │
│  [Gerenciar preferências de email]    │  ← token do 141 / página do 147
└──────────────────────────────────────┘
```

Footer recebe `storeAddress` e `unsubscribeUrl` como props obrigatórias (o 141 injeta) — impossível enviar template sem conformidade.

### Catálogo do Go-Live

| TemplateKey | Evento (141) | Conteúdo essencial | Props (resumo) |
|-------------|--------------|--------------------|----------------|
| `order-confirmed` | `order.confirmed` | nº pedido, itens (até 5 + "e mais N"), total, método escolhido, link de acompanhamento | orderNumber, items[], total, paymentMethod, trackUrl |
| `payment-confirmed` | `payment.confirmed` | valor, método, data/hora, nº pedido, próximos passos | orderNumber, amount, method, paidAt |
| `boleto-created` | `payment.boleto_created` | **linha digitável em mono copiável**, vencimento destacado, botão "Abrir boleto (PDF)", aviso de compensação | digitableLine, dueDate, boletoUrl, amount |
| `nfe-issued` | `nfe.issued` | nº NFe, chave de acesso em mono, aviso do PDF anexo (ou botão se link) | nfNumber, chave, hasAttachment, pdfUrl? |
| `generic-notification` | fallback do 141 | title + body da INotification | title, body, ctaUrl? |

Esqueletos registrados (props tipadas, corpo mínimo, marcados `draft`): `order-shipped` (fulfillment futuro), `portal-invite` (PRD-167). Drip/abandono (148/149) **não** entram aqui — adicionarão os seus.

### Preview Dev-Only

Rota `/dev/emails` (guard: apenas `import.meta.env.DEV`): lista o registry, renderiza cada template com fixtures de exemplo, toggle HTML/plain-text, viewport 600px/mobile. Iteração visual sem disparar nada — e serve de documentação viva para o Owner aprovar a identidade.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Editor visual / templates no banco | Templates são código versionado: type-safety, review, zero drift entre ambientes; edição por leigo não é requisito do transacional |
| MJML | Resolve o mesmo problema com DSL própria; React Email mantém a stack única (React+TS) e é da casa da Resend |
| Handlebars/HTML cru | Perde tipagem das props e a compilação Outlook-safe automática |
| Manter dark mode no email | Incontrolável nos clientes; light com acentos é a tradução fiel possível |
| Templates hospedados na Resend (template id) | Acopla conteúdo ao painel do provider; render local mantém portabilidade do `EmailChannel` |
| Plain text só quando pedirem | Par obrigatório: acessibilidade, clientes corporativos e spam score melhor |

---

## Escopo

### Incluído

- ✅ Setup React Email no projeto + `email-render.ts` (SSR Deno) implementando o contrato do 141
- ✅ Registry tipado (`TemplateKey`, `TemplateProps`, `subject(props)`) com erro de compilação para chave/props inválidas
- ✅ `<GalloEmailLayout>` (header logo, container 600px, footer conforme com props obrigatórias) + tokens traduzidos (paleta light, font stacks, mono para códigos)
- ✅ Asset do logo em bucket público + guideline de imagens (dimensões fixas, alt, peso < 50KB)
- ✅ 5 templates completos do go-live (tabela do conceito) + 2 esqueletos `draft`
- ✅ Plain text gerado em par para todos (via `render(..., { plainText: true })` + revisão de legibilidade)
- ✅ Preview `/dev/emails` com fixtures por template, toggle html/text, viewport mobile
- ✅ Substituição do fallback do 141: eventos passam a resolver seus templates reais (o `generic-notification` permanece como rede de segurança para eventos sem template dedicado)
- ✅ Checklist de compatibilidade documentado + teste manual guiado: Gmail web, Outlook desktop, Apple Mail (matriz mínima do B2B brasileiro)
- ✅ Testes: snapshot de html/text por template, subject dinâmico, props inválidas falham tsc (teste de tipo), footer presente em 100% (teste estrutural), linha digitável em mono no boleto
- ✅ Documentação `docs/dev/email-templates.md` (como criar template novo, checklist Outlook, tradução de branding)

### Excluído

- ❌ Templates de marketing/drip/abandono (148/149 — sobre esta base)
- ❌ Editor visual ou templates editáveis em runtime
- ❌ Localização multi-idioma (pt-BR only no MVP)
- ❌ Testes automatizados cross-client (Litmus/Email on Acid — custo; checklist manual cobre o MVP)
- ❌ Emails do Supabase Auth (item de runbook do 141)
- ❌ AMP for Email

---

## Requisitos Funcionais

### Render

- **RF-001:** `renderEmailTemplate(key, props)` retorna `{ subject, html, text }`; html Outlook-safe (tabelas via React Email); text legível (sem tags residuais, links em linha própria).
- **RF-002:** Registry tipado: `TemplateProps[K]` exato por chave; chave fora do union → erro de compilação (teste de tipo com `@ts-expect-error`).
- **RF-003:** Render puro e determinístico (mesmas props → mesmo output) — snapshots estáveis.
- **RF-004:** Funciona em Deno (Edge) e em Node/Vite (preview) sem fork de código.

### Layout e Branding

- **RF-010:** `<GalloEmailLayout storeAddress unsubscribeUrl>` obrigatório em todo template; footer com endereço físico + "Gerenciar preferências de email" linkando o `unsubscribeUrl` (token do 141).
- **RF-011:** Paleta light: fundo `#FFFFFF`, texto `#404041`, ações/destaques `#D2A809`, divisores `#E5E5E5`; botão primário dourado com texto escuro (contraste AA).
- **RF-012:** Font stacks com fallbacks; `@font-face` Saira best-effort apenas em display; corpo nunca depende de webfont.
- **RF-013:** Códigos (linha digitável, chave NFe) em `Courier New, monospace`, tamanho ≥ 14px, sem quebra no meio (formatação com espaços do padrão).
- **RF-014:** Largura máxima 600px; legível em 320px (single column, botões full-width no mobile via media query suportada).

### Catálogo

- **RF-020:** 5 templates do go-live conforme tabela, cada um com fixture de exemplo no preview.
- **RF-021:** `boleto-created`: linha digitável selecionável (sem imagem), vencimento em destaque visual, botão para `boletoUrl`.
- **RF-022:** `nfe-issued`: chave de 44 dígitos em mono quebrada em grupos de 4 (legibilidade de conferência); ramo com/sem anexo conforme `hasAttachment`.
- **RF-023:** `order-confirmed`: itens limitados a 5 + sumarização; valores formatados pt-BR.
- **RF-024:** Esqueletos `draft` não são roteáveis pelo 141 (registry os marca; dispatch cai no generic se evento apontar draft + audit `template_draft_fallback`).

### Preview

- **RF-030:** `/dev/emails` apenas em DEV; lista registry com status (ready/draft); render ao vivo com fixtures editáveis (JSON inline); toggle html/text; frame 600px e 360px.

### Testes e Docs

- **RF-040:** Snapshot html+text dos 5; teste estrutural de footer (endereço + unsubscribe presentes); teste de tipo das props; subject dinâmico por template.
- **RF-041:** Checklist manual de clientes executado e registrado (prints em `docs/dev/email-clients-checklist.md`) antes do `_DONE`.
- **RF-042:** `email-templates.md`: anatomia de um template, como adicionar, regras Outlook, tradução do branding.

---

## Requisitos Não-Funcionais

- **RNF-001 (Compatibilidade):** legível em Gmail, Outlook desktop e Apple Mail sem quebra estrutural.
- **RNF-002 (Type-safety):** impossível compilar chamada com props erradas.
- **RNF-003 (Peso):** html final < 100KB (Gmail clipping em 102KB); imagens externas < 50KB.
- **RNF-004 (Conformidade by-design):** footer impossível de omitir (props obrigatórias do layout).
- **RNF-005 (Determinismo):** snapshots estáveis viabilizam review de qualquer mudança visual.

---

## Critérios de Aceitação

### RF-002: Type-Safety

```gherkin
DADO chamada renderEmailTemplate('nfe-issued', { nfNumber: '123' })  // falta chave
QUANDO tsc compila
ENTÃO erro de compilação (Props incompletas)
  E o teste @ts-expect-error documenta o caso
```

### RF-010: Conformidade do Footer

```gherkin
DADO qualquer template do registry renderizado
QUANDO o teste estrutural varre o html
ENTÃO endereço físico presente E link de unsubscribe presente
  E template sem GalloEmailLayout não compila (children tipados)
```

### RF-021: Boleto Legível

```gherkin
DADO boleto-created com linha digitável real
QUANDO renderizado
ENTÃO linha em monospace ≥14px, selecionável, no padrão com espaços
  E vencimento em destaque
  E par em plain text mantém a linha copiável
```

### RF-024: Draft Não Roteia

```gherkin
DADO evento apontando template 'order-shipped' (draft)
QUANDO o 141 despacha
ENTÃO render cai no generic-notification
  E audit template_draft_fallback registra
```

---

## Fases de Implementação

### Fase 1 — Render + Layout + Generic (1 dia)
- Setup React Email, email-render.ts isomórfico
- GalloEmailLayout + tokens + logo asset
- generic-notification (destrava a Fase 4 do 141)

### Fase 2 — 4 Templates do Go-Live (1.5 dias)
- order-confirmed, payment-confirmed, boleto-created, nfe-issued
- Plain text revisado; fixtures

### Fase 3 — Preview + Esqueletos (1 dia)
- /dev/emails completo
- order-shipped e portal-invite como draft + guarda RF-024

### Fase 4 — Checklist + Testes + Docs (1 dia)
- Matriz manual de clientes com prints
- Snapshots, estrutural, tipo
- email-templates.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-141 (contrato + injeção de storeAddress/unsubscribeUrl — co-dependência: Fase 1 daqui antes da Fase 4 de lá), PRD-001 F1 (tokens de origem), PRD-106 (bucket público do logo)
- **Bloqueia:** 141 Fase 4 (templates reais), 148/149 (base de marketing), 150
- **Decisões Pendentes:**
  - Aprovação visual do Owner via `/dev/emails` antes do go-live (gate de marca)
  - Endereço físico por store para o footer (dado cadastral — conferir `crm.stores`)

---

## Considerações de Segurança

- Nenhum dado sensível além do necessário no corpo (snapshot mínimo — herda RF-006 do 008)
- Links sempre https absolutos para domínios próprios; zero redirecionadores de terceiros (phishing-pattern)
- unsubscribeUrl com token assinado (141) — template não constrói URL manualmente
- Preview dev-only com guard de build (não existe em produção)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.2; CHANGELOG; renomear `PRD-142-templates-email_DONE.md`; checklist de clientes com prints commitado; aprovação visual do Owner registrada.

| Princípio | Descrição |
|-----------|-----------|
| **Email vive em 1999** | Tabelas, inline, fallbacks — sempre |
| **Light é a tradução fiel** | Dark do app não sobrevive aos clientes |
| **Props erradas não compilam** | O registry é o contrato |
| **Footer é inevitável** | Conformidade por design, não por disciplina |
| **Plain text é par, não extra** | Acessibilidade e Outlook corporativo |

| ❌ Evitar |
|-----------|
| CSS no head / classes externas |
| SVG ou webfont como dependência |
| Template fora do registry |
| Footer opcional |
| HTML > 100KB (Gmail clipa) |
| Draft roteável |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5a do Lote 5 (Onda 8) |

---

**AILA - Sistemas Inteligentes**
