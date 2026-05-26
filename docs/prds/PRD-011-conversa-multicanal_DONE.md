# PRD-011: Conversa com Histórico Multicanal

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                         |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                              |
| **Objetivo**          | Construir a coluna central do `ConversationLayout` — a área onde o vendedor efetivamente conversa com o cliente, vendo o histórico completo, enviando mensagens, e executando ações contextuais (criar orçamento, escalar, transferir, resolver) |
| **Tipo**              | Feature                                                                                                                                                                                                                                          |
| **Complexidade**      | Alta                                                                                                                                                                                                                                             |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                |
| **Prioridade**        | Alta                                                                                                                                                                                                                                             |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                           |
| **PRDs Relacionados** | PRD-010 (Inbox), PRD-012 (Ficha), PRD-013 (Distribuição), PRD-022 (Orçamento via SDR), PRD-023 (Escalonamento), PRD-031 (Orçamento)                                                                                                              |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                                 |
| **Padrão de código**  | Feature-based; código em `src/features/conversations/`; bubble types em `src/features/conversations/components/bubbles/`; input em `src/features/conversations/components/MessageInput.tsx`                                                      |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** componente complexo com scroll virtualizado para conversa de até centenas de mensagens, 5+ tipos de bubble (texto, imagem, áudio, documento, sistema), marcadores temporais dinâmicos, input de mensagem com auto-resize e múltiplos modos (texto/template/áudio gravado/anexo), indicador de janela de 24h específica do Meta provider, suporte adaptativo por capabilities do WhatsApp provider, mensagens do SDR inline distinguidas visualmente, sugestões de IA com botão de inserir, ações contextuais (criar orçamento, transferir, escalar, resolver, arquivar), e integração com providers do PRD-005 e mocks do PRD-004 incluindo simulação de envio (envio → enviada → entregue → lida com delays).

---

## Contexto do Problema

A inbox do PRD-010 mostra "que conversas existem". Mas o trabalho real do vendedor é **dentro** de cada conversa: ler o histórico, entender o que o cliente quer, responder, anexar fotos de peças, enviar orçamento, marcar resolvida. Sem uma área central bem desenhada, três problemas concretos:

**Vendedor migra para WhatsApp Web e perde o contexto do CRM.** Se a "conversa" da plataforma for ruim, o vendedor abandona — abre o WhatsApp Web em outra aba e ali responde. Resultado: a plataforma fica como CRM "passivo" (ver dados) sem capturar a interação ativa. Toda a estratégia de "unificar atendimento + CRM" falha. **Histórico multi-canal vira impossível.** Cliente que ligou ontem, mandou WhatsApp hoje, e abriu ticket no site amanhã — sem visualização unificada, cada canal vira sua própria "ilha". O vendedor precisa lembrar de tudo de cabeça. **Janela de 24h do Meta vira armadilha.** No WhatsApp Cloud API (provider Meta), há regra: depois de 24h sem o cliente mandar mensagem, só dá pra enviar **template HSM** pré-aprovado, não texto livre. Vendedor que não sabe disso tenta mandar texto e dá erro. UI precisa avisar antes.

Este PRD entrega: área de conversa completa com header informativo, histórico rolável com bubbles tipados, input rico que adapta capabilities por provider, indicador de janela de 24h, mensagens do SDR distinguidas (badge "🤖 SDR"), botões de ação contextual, e simulação de envio com estados visuais (enviada → entregue → lida).

---

## Conceito da Solução

### Layout

A área da conversa é a coluna central do `ConversationLayout` (PRD-003), `flex: 1`, com 3 zonas verticais:

```
┌──────────────────────────────────────────────────────────┐
│ Header da conversa (h: 64px)                              │
│  Avatar  Nome cliente • WhatsApp     [📋] [⋮]  [Ficha▸]   │
│  WhatsApp +55 (55) 9 9999-9999  • Status: em andamento    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Histórico de mensagens (scroll vertical, virtualizado)   │
│                                                           │
│  ── Hoje ──                                               │
│   [Cliente] Mensagem do cliente            10:32          │
│              "Você tem filtro de óleo Volvo R450?"        │
│                                                           │
│   [Vendedor] Mensagem do vendedor          10:35  ✓✓     │
│              "Bom dia! Sim, temos. Posso te enviar..."    │
│                                                           │
│   [Cliente] 📷 Imagem                      10:38          │
│              [Thumbnail clicável]                          │
│                                                           │
│   [🤖 SDR] Mensagem automática             10:40  ✓      │
│              "Identifiquei a peça pela foto..."           │
│                                                           │
│  ── Ontem ──                                              │
│   ...                                                     │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ Janela de 24h: 22h restantes (ícone verde)                │
├──────────────────────────────────────────────────────────┤
│ MessageInput (h: variável, max 120px)                     │
│  [📎] [😊] [textarea auto-resize]      [Templates] [Enviar]│
│  💡 Sugestões IA: [Sim, em estoque] [Posso confirmar]     │
└──────────────────────────────────────────────────────────┘
```

### Header da conversa

| Elemento                | Comportamento                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Avatar + Nome           | Click leva à ficha (PRD-012)                                                                           |
| Nome do canal + número  | WhatsApp +55 ..., Site (sessão xyz), Telefone, E-commerce                                              |
| Status atual            | Pill com cor: aguardando (laranja), em_andamento (verde), aguardando_cliente (azul), resolvida (cinza) |
| Botão "Criar orçamento" | Atalho que abre flow do PRD-031 já vinculado ao cliente da conversa                                    |
| Menu (⋮)                | Marcar como resolvida, Marcar não-lida, Transferir, Arquivar, Adicionar nota                           |
| Botão "Ficha"           | Toggle abre/fecha a coluna direita (PRD-012)                                                           |

### Tipos de bubble

| Tipo             | Anatomia                                                           | Notas                                                                 |
| ---------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **Texto**        | Balão com texto + timestamp + status (out)                         | Status com check único (enviada), duplo (entregue), duplo azul (lida) |
| **Imagem**       | Thumbnail clicável que abre em modal + caption opcional            | Loading skeleton enquanto carrega                                     |
| **Áudio**        | Player com play/pause + duração + waveform (estática no mock)      | Botão de transcrição (placeholder no MVP)                             |
| **Documento**    | Ícone do tipo + nome do arquivo + tamanho + botão download         | Reconhece PDF, XLSX, DOCX, etc.                                       |
| **Sistema**      | Itálico, centralizado, sem balão                                   | "SDR foi ativado nesta conversa", "Carlos assumiu o atendimento"      |
| **Template HSM** | Texto + selo "Template" + botões de resposta rápida (se aplicável) | Apenas Meta provider                                                  |
| **Localização**  | Mapa estático + endereço                                           | Placeholder no MVP                                                    |

### Direção e autoria

| Direction | AuthorType | Lado     | Cor de fundo                                     |
| --------- | ---------- | -------- | ------------------------------------------------ |
| `in`      | `customer` | Esquerda | Surface neutra                                   |
| `out`     | `seller`   | Direita  | `--accent` translúcido                           |
| `out`     | `sdr`      | Direita  | `--accent` + badge "🤖 SDR" + borda diferenciada |
| `out`     | `system`   | Centro   | Itálico, sem balão                               |

### Marcadores temporais

Inseridos automaticamente entre grupos de mensagens:

- "Hoje" (todas as mensagens do dia atual)
- "Ontem"
- "Segunda-feira" (últimos 7 dias, dia da semana por extenso)
- "12 de maio" (mais antigo, formato curto)

### Indicador de janela de 24h

Faixa fina entre histórico e input, **apenas quando** `whatsappAccount.provider === 'meta'` E a conversa está aberta:

```
┌─────────────────────────────────────────────────────────┐
│ ⏱ Janela de 24h: 22h restantes (cliente respondeu há 2h) │
└─────────────────────────────────────────────────────────┘
```

Estados:

- **Verde (> 12h)**: "Janela aberta — 22h restantes"
- **Amarelo (1-12h)**: "Janela aberta — 4h restantes" + recomendação suave "Considere usar template HSM"
- **Vermelho (< 1h)**: "Janela fechando — 32 min restantes" + sugestão proeminente
- **Cinza (fechada)**: "Janela de 24h fechada — apenas templates HSM disponíveis"

Para provider Evolution, a faixa não aparece (capability `supportsProactiveMessaging` é true).

### Input de mensagem

Estrutura:

| Elemento                   | Comportamento                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Anexo (📎)                 | Abre modal de seleção: imagem, documento, áudio (gravar)                                            |
| Emoji (😊)                 | Abre picker do shadcn                                                                               |
| Textarea                   | Auto-resize (1-5 linhas); Shift+Enter quebra linha; Enter envia                                     |
| Templates                  | Aparece apenas no Meta provider; abre modal com templates HSM disponíveis                           |
| Botão Enviar               | Habilitado quando há texto OU anexo                                                                 |
| Sugestões IA (linha acima) | 2-3 sugestões clicáveis baseadas no contexto (placeholder no MVP — strings estáticas)               |
| Capabilities adaptativas   | Se provider é Evolution, botão "Templates" fica escondido com tooltip "Disponível no provider Meta" |

### Fluxo de envio com estados

Quando o vendedor clica "Enviar":

1. Mensagem aparece imediatamente como **enviada** (ícone ✓ cinza, optimistic UI)
2. Provider mock simula latência de 200-500ms
3. Estado vira **entregue** (✓✓ cinza)
4. Após 1-3s extras, com 80% de chance, estado vira **lida** (✓✓ azul)
5. Em 5% das vezes (configurável), mensagem **falha** (ícone ⚠ vermelho com botão "Tentar novamente")

### Botões de ação contextual

Localizados no header e no menu ⋮:

| Ação                | Quem pode                                   | Comportamento                                             |
| ------------------- | ------------------------------------------- | --------------------------------------------------------- |
| Criar orçamento     | Vendedor/SDR/Owner                          | Abre flow do PRD-031 pré-preenchido com cliente           |
| Marcar resolvida    | Vendedor (own) / Gestor (store)             | Muda status para `resolvida`; toast com Desfazer          |
| Marcar não-lida     | Vendedor                                    | Reseta o "última visualização" para forçar badge não-lida |
| Transferir          | Owner/Gestor                                | Modal com dropdown de vendedores                          |
| Escalar para gestor | Vendedor (em conversas onde SDR está ativo) | Atribui a um Gestor disponível                            |
| Arquivar            | Owner/Gestor                                | Muda status para `arquivada`; sai da inbox padrão         |
| Adicionar nota      | Qualquer com `addNote` permission           | Modal que cria `ICustomerNote`                            |
| Pausar SDR          | Owner/Gestor (quando SDR ativo)             | Define `isSdrActive: false` na conversa                   |

### Mensagens do SDR inline

Quando uma mensagem `out` tem `authorType: 'sdr'`, o bubble:

- Mantém lado direito (out)
- Tem badge "🤖 SDR" prominente no canto
- Borda em `--brand-parts` (verde) para distinguir visualmente do vendedor humano
- Tooltip ao hover: "Mensagem enviada pelo agente SDR"

Isso permite ao vendedor entender em retrospectiva o que o SDR já respondeu antes de ele assumir a conversa.

### Alternativas Consideradas

| Alternativa                                             | Por que foi descartada                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sem distinção visual entre SDR e vendedor               | Vendedor não sabe o que ele disse vs o que o agente disse — confusão certa  |
| Permitir editar mensagens enviadas                      | WhatsApp não suporta; gerar UX que não condiz com realidade                 |
| Mostrar todas as mensagens de uma vez sem virtualização | Performance ruim em conversas com 200+ mensagens                            |
| Esconder mensagens antigas (paginação manual)           | Difícil de buscar contexto; auto-load via scroll para cima é melhor UX      |
| Input sempre habilitado independente da janela de 24h   | Vendedor descobre o erro só depois de enviar e falhar                       |
| Templates HSM em dropdown simples sem preview           | Templates têm variáveis (`{{1}}`, `{{2}}`); precisa preview e preenchimento |

**Decisão consolidada:** **scroll virtualizado, bubbles tipados em 6 categorias, janela de 24h visualmente proeminente, mensagens do SDR distinguidas, capabilities do provider adaptam input, optimistic UI no envio.**

---

## Escopo

### Incluído

- ✅ Página de conversa em `/app/atendimento/:conversationId` consumindo `<ConversationLayout>`
- ✅ Header da conversa com avatar, nome, canal, status pill, botões de ação (Criar orçamento, Ficha, ⋮)
- ✅ Histórico de mensagens com scroll virtualizado e paginação por scroll-up (carregar mais antigas)
- ✅ 6 tipos de bubble: texto, imagem, áudio, documento, sistema, template HSM
- ✅ Marcadores temporais automáticos (Hoje, Ontem, dia da semana, data)
- ✅ Indicador de janela de 24h adaptativo ao provider (Meta only)
- ✅ Input de mensagem com auto-resize, emojis, anexos, sugestões IA (placeholder)
- ✅ Capabilities adaptativas: botão "Templates" só Meta; gravação de áudio simulada
- ✅ Simulação de envio com 5 estados (enviando, enviada, entregue, lida, falha)
- ✅ Mensagens do SDR distinguidas visualmente (badge + borda)
- ✅ Menu ⋮ com ações contextuais (resolver, transferir, escalar, arquivar, adicionar nota, pausar SDR)
- ✅ Modal de transferência com dropdown de vendedores
- ✅ Modal de templates HSM (apenas Meta) com preview + variáveis preenchíveis
- ✅ Toast com Desfazer (5s) em ações reversíveis (resolver, arquivar)
- ✅ Atalho "Criar orçamento" pré-preenche cliente da conversa (link para PRD-031)
- ✅ Empty state quando conversa selecionada não existe ou foi excluída
- ✅ Estado de "Cliente está digitando..." (simulado aleatoriamente quando a conversa está aberta)
- ✅ Auditoria via PRD-006 em todas as ações sensíveis (transferir, escalar, arquivar)

### Excluído

- ❌ Envio real via WhatsApp Meta ou Evolution — Fase 2 (PRDs 100-102)
- ❌ Transcrição automática de áudio — Fase 2 (provavelmente usando OpenAI Whisper ou similar)
- ❌ IA generativa de respostas reais — Fase 2 (LangChain/OpenAI); MVP tem placeholders estáticos
- ❌ Reações com emoji (👍, ❤) — fora do MVP
- ❌ Encaminhar mensagem para outra conversa — fora do MVP
- ❌ Citar mensagem (reply) — fora do MVP
- ❌ Voice/Video call dentro da conversa — fora do MVP
- ❌ Compartilhar localização real (apenas placeholder em bubble) — Fase 2
- ❌ Edição de mensagem enviada — WhatsApp não suporta
- ❌ Indicação de leitura entre vendedores (vendedora A vê quando vendedora B leu) — fora do MVP
- ❌ Marca d'água ou assinatura automática em mensagens — fora do MVP

---

## Requisitos Funcionais

### Página e header

- **RF-001:** Criar página `ConversationPage` em `src/features/conversations/pages/ConversationPage.tsx`, rota `/app/atendimento/:conversationId`.
- **RF-002:** Página deve carregar a conversa via `useConversationsProvider().get(id)`. Se retornar null, mostrar `<EmptyState>` com "Conversa não encontrada" + botão "Voltar à inbox".
- **RF-003:** Header da conversa renderiza:
  - Avatar + nome do cliente/lead (click leva à ficha — PRD-012)
  - Linha secundária: ícone do canal + número (WhatsApp +55..., E-commerce, etc.)
  - Pill de status atual (aguardando/em_andamento/aguardando_cliente/resolvida) com cor semântica
  - Botão **Criar orçamento** (atalho)
  - Botão **Ficha** (toggle de exibição da coluna direita — PRD-012)
  - Menu **⋮** com ações contextuais

### Histórico de mensagens

- **RF-004:** Renderizar histórico via `useMessagesProvider().listByConversation(conversationId, { page, pageSize: 50 })`.
- **RF-005:** Implementar scroll virtualizado (mesmo `@tanstack/react-virtual` do PRD-010) para suportar conversas com 200+ mensagens sem perda de performance.
- **RF-006:** Ao scrollar para cima além de 80% do início, carregar página anterior automaticamente.
- **RF-007:** Renderizar marcador temporal entre grupos de mensagens:
  - "Hoje" para mensagens do dia atual
  - "Ontem" para mensagens do dia anterior
  - "Segunda-feira" (etc.) para últimos 7 dias
  - "12 de maio" para mais antigas
- **RF-008:** Auto-scroll para o final do histórico quando:
  - Conversa abre pela primeira vez
  - Nova mensagem chega E o usuário já estava no final (não interromper rolagem se ele está lendo histórico)

### Bubbles tipados

- **RF-009:** Implementar `<TextBubble>` com balão arredondado, texto, timestamp e status de envio (apenas em `out`).
- **RF-010:** Implementar `<ImageBubble>` com thumbnail clicável (abre modal); skeleton enquanto carrega; caption opcional embaixo.
- **RF-011:** Implementar `<AudioBubble>` com player (play/pause), duração formatada (mm:ss), waveform estática (SVG simplificado); placeholder "Transcrição em breve".
- **RF-012:** Implementar `<DocumentBubble>` com ícone por tipo (PDF/XLSX/DOCX), nome do arquivo, tamanho, botão download.
- **RF-013:** Implementar `<SystemBubble>` centralizado, itálico, cor `--text-muted`, sem balão. Usado para eventos: "SDR ativado", "Carlos assumiu o atendimento", "Conversa transferida para Marina".
- **RF-014:** Implementar `<TemplateBubble>` (apenas Meta) com selo "Template", texto do template substituído pelas variáveis fornecidas, botões de resposta rápida (se o template tinha).

### Direção e autoria visual

- **RF-015:** Bubbles `direction='in'` (cliente) ficam à esquerda com background neutro (`--surface-elevated`).
- **RF-016:** Bubbles `direction='out'` (out) ficam à direita.
- **RF-017:** Bubbles `direction='out'` com `authorType='seller'` têm background `--accent` translúcido (10%).
- **RF-018:** Bubbles `direction='out'` com `authorType='sdr'` têm:
  - Background `--brand-parts` translúcido (10%)
  - Borda esquerda 2px sólida `--brand-parts`
  - Badge "🤖 SDR" no canto inferior do balão
  - Tooltip ao hover: "Mensagem enviada pelo agente SDR"
- **RF-019:** Bubbles com `authorType='system'` ficam centralizados, sem fundo, com texto em itálico.

### Status de envio (out only)

- **RF-020:** Status visual:
  - `sent` (enviada): ícone ✓ cinza
  - `delivered` (entregue): ícone ✓✓ cinza
  - `read` (lida): ícone ✓✓ azul
  - `failed`: ícone ⚠ vermelho + botão "Tentar novamente"
- **RF-021:** Tooltip no status ao hover mostra detalhe: "Enviada às 10:32", "Entregue às 10:32", "Lida às 10:38".

### Indicador de janela de 24h

- **RF-022:** Faixa fina entre histórico e input, **apenas quando** a conversa está vinculada a `IWhatsAppAccount.provider === 'meta'` E status ≠ `arquivada`.
- **RF-023:** Calcular tempo restante baseado em `lastInboundMessageAt` (timestamp da última mensagem `direction='in'`) + 24h.
- **RF-024:** Estados visuais:
  - Verde (> 12h): "✅ Janela aberta — Xh restantes"
  - Amarelo (1-12h): "⚠ Janela aberta — Xh restantes — Considere usar template"
  - Vermelho (< 1h): "🔴 Janela fechando — X min restantes"
  - Cinza (= 0): "🚫 Janela fechada — Apenas templates HSM"
- **RF-025:** Quando janela fechada, input de texto fica desabilitado e mostra mensagem "Use um template HSM para reabrir a conversa". Botão "Templates" fica em destaque.
- **RF-026:** Para provider Evolution, faixa não aparece em hipótese alguma.

### Input de mensagem

- **RF-027:** `<MessageInput>` com textarea de auto-resize (1 linha mín, 5 linhas máx; após excede, mostra scroll interno).
- **RF-028:** Enter envia mensagem; Shift+Enter quebra linha.
- **RF-029:** Botão **📎 Anexo** abre modal com opções: imagem, documento, áudio (gravar — placeholder no MVP, abre alerta "Gravação em breve").
- **RF-030:** Botão **😊 Emoji** abre picker do shadcn (ou alternativa) e insere emoji na posição do cursor.
- **RF-031:** Botão **Templates** apenas para Meta provider. Abre modal com lista de templates HSM disponíveis (mockados pelo PRD-004), preview com variáveis e campos para preencher antes de enviar.
- **RF-032:** Botão **Enviar** habilitado quando há texto OU anexo selecionado; desabilitado se janela fechada e texto sem anexo.
- **RF-033:** Linha acima do input com **sugestões de IA** (placeholder no MVP): 2-3 botões com texto estático que, ao clicar, preenchem o textarea. Sugestões mudam conforme última mensagem do cliente (simulação simples: se contém "preço", sugere "O valor é R$ X"; se contém "estoque", sugere "Em estoque, sim").

### Simulação de envio

- **RF-034:** Quando vendedor envia mensagem, fluxo otimista:
  1. Mensagem aparece imediatamente como `sent` (✓ cinza) — UI optimistic
  2. Provider mock simula latência 200-500ms
  3. Status muda para `delivered` (✓✓ cinza)
  4. Após 1-3s, com 80% de chance, muda para `read` (✓✓ azul)
  5. Em 5% das tentativas (configurável em `src/mocks/config.ts`), status vira `failed` com botão "Tentar novamente"
- **RF-035:** Falha no envio: bubble destacado em vermelho claro com ícone ⚠ e botão pequeno "Tentar novamente" que refaz a mutation.

### Ações contextuais

- **RF-036:** Menu **⋮** no header expõe:
  - **Marcar resolvida** (qualquer um com `edit` em conversation no scope adequado): muda status, toast com Desfazer
  - **Marcar não-lida** (Vendedor): reseta `gallo-conversation-last-view-...` no localStorage para forçar badge na inbox
  - **Transferir** (Owner/Gestor): abre modal com dropdown de vendedores da loja
  - **Escalar para gestor** (Vendedor, quando `isSdrActive: true`): atribui ao primeiro gestor disponível
  - **Arquivar** (Owner/Gestor): muda status para arquivada
  - **Adicionar nota** (qualquer com `addNote` permission): modal que cria `ICustomerNote`
  - **Pausar SDR** (Owner/Gestor, quando SDR ativo): `isSdrActive: false`
- **RF-037:** Botão **Criar orçamento** no header chama navegação para flow do PRD-031 com query `?customerId=X&conversationId=Y` para pré-preencher.
- **RF-038:** Toda ação sensível (transferir, escalar, arquivar, pausar SDR) registra audit log via `auditLog()` do PRD-006.

### Estado "Cliente está digitando..."

- **RF-039:** Simular indicador "Cliente está digitando..." aleatoriamente:
  - 30% de chance a cada 20-40s em conversas ativas (status `em_andamento` ou `aguardando_cliente`)
  - Duração: 3-8s
  - Aparece como bubble especial sem balão, com 3 pontos animados, à esquerda
- **RF-040:** Indicador desaparece quando uma mensagem real chega ou o timer expira.

### Permissões

- **RF-041:** Vendedor não vinculado à conversa (sem permission view scope=`own`) vê apenas leitura — input desabilitado com mensagem "Esta conversa não está atribuída a você".
- **RF-042:** Cliente B2B em sua própria conversa pode enviar mensagens normalmente (em sua interface no `/portal` futuro — PRD-071).

### Empty states

- **RF-043:** Conversa não encontrada: `<EmptyState>` com ícone, mensagem "Esta conversa não existe ou foi removida", botão "Voltar à inbox".
- **RF-044:** Conversa sem mensagens ainda (nova lead): `<EmptyState>` no centro do histórico: "Inicie a conversa enviando uma mensagem" + sugestões IA preenchidas.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Conversa com 200 mensagens deve renderizar em < 300ms; scroll fluido 60fps.
- **RNF-002 (Optimistic UI):** Envio de mensagem aparece em < 50ms (antes mesmo do provider responder).
- **RNF-003 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado; bubble têm `aria-label` descritivo; input com `aria-live` para anunciar novas mensagens.
- **RNF-004 (Responsividade):** Mobile (< 768px) ocupa tela inteira; tablet (768-1023px) coexiste com sidebar; desktop tem layout completo de 3 colunas.
- **RNF-005 (Compatibilidade provider):** Mesma UI funciona para Meta e Evolution; diferenças resolvidas via capabilities em `IWhatsAppAccount.capabilities`.
- **RNF-006 (Tipagem):** Zero `any`; bubbles polimorficos via union types discriminadas em `IMessage.mediaType`.

---

## Critérios de Aceitação

### Header e navegação

```gherkin
DADO que estou em /app/atendimento/abc123 e a conversa existe
QUANDO a página carrega
ENTÃO vejo o header com avatar, nome do cliente, canal e status
  E vejo o histórico de mensagens
  E vejo o input no rodapé

DADO que clico no nome do cliente no header
QUANDO o clique processa
ENTÃO a coluna direita abre (ou se já aberta, ficha rola para o topo) — PRD-012

DADO que id da conversa não existe
QUANDO a página carrega com /app/atendimento/inexistente
ENTÃO vejo EmptyState "Conversa não encontrada" + botão "Voltar à inbox"
```

### Bubbles e direção

```gherkin
DADO uma mensagem com direction=in, authorType=customer
QUANDO renderiza
ENTÃO bubble fica à esquerda com background neutro

DADO uma mensagem com direction=out, authorType=seller
QUANDO renderiza
ENTÃO bubble fica à direita com background --accent translúcido
  E mostra status de envio (✓, ✓✓, ✓✓ azul)

DADO uma mensagem com direction=out, authorType=sdr
QUANDO renderiza
ENTÃO bubble fica à direita com borda em --brand-parts
  E mostra badge "🤖 SDR"
  E tooltip ao hover indica "Mensagem enviada pelo agente SDR"
```

### Janela de 24h

```gherkin
DADO uma conversa com WhatsApp Meta e última mensagem in há 2h
QUANDO observo o indicador
ENTÃO vejo faixa verde "Janela aberta — 22h restantes"

DADO uma conversa com WhatsApp Meta e última mensagem in há 23h
QUANDO observo o indicador
ENTÃO vejo faixa vermelha "Janela fechando — 32 min restantes"

DADO uma conversa com WhatsApp Meta e última mensagem in há 25h
QUANDO tento digitar e enviar texto livre
ENTÃO input fica desabilitado
  E vejo mensagem "Use um template HSM para reabrir a conversa"
  E botão Templates fica destacado

DADO uma conversa com WhatsApp Evolution
QUANDO observo a UI
ENTÃO não aparece indicador de janela
  E botão Templates fica escondido com tooltip "Disponível no provider Meta"
```

### Envio de mensagem

```gherkin
DADO que digito "Olá, em estoque sim" e clico enviar
QUANDO a mensagem é processada
ENTÃO ela aparece imediatamente no histórico com status sent (✓ cinza)
  E após 200-500ms muda para delivered (✓✓ cinza)
  E após mais 1-3s, em 80% das vezes muda para read (✓✓ azul)

DADO que o envio falha (5% das vezes)
QUANDO o status muda para failed
ENTÃO bubble destacada em vermelho claro
  E vejo botão "Tentar novamente" pequeno
  E clicar refaz o envio
```

### Ações contextuais

```gherkin
DADO que sou Vendedor responsável pela conversa
QUANDO abro o menu ⋮
ENTÃO vejo: Marcar resolvida, Marcar não-lida, Adicionar nota
  E NÃO vejo: Transferir, Arquivar (sem permissão)

DADO que sou Gestor
QUANDO abro o menu ⋮
ENTÃO vejo todas as ações + Transferir + Arquivar + (se SDR ativo) Pausar SDR

DADO que clico "Marcar resolvida"
QUANDO a ação processa
ENTÃO status muda para "resolvida"
  E vejo toast "Conversa marcada como resolvida" + botão "Desfazer" por 5s
  E clicar em Desfazer reverte o status
  E audit log é criado registrando a mudança

DADO que clico "Criar orçamento"
QUANDO o clique processa
ENTÃO navego para /app/orcamentos/novo?customerId=X&conversationId=Y
  E o formulário do PRD-031 já chega com cliente pré-preenchido
```

### SDR distinguido

```gherkin
DADO que existem mensagens do SDR e do vendedor humano misturadas no histórico
QUANDO o vendedor lê
ENTÃO consegue distinguir claramente: bubbles do SDR têm borda verde + badge "🤖 SDR"
  E bubbles do vendedor têm fundo --accent sem borda especial
```

### Cliente digitando (simulado)

```gherkin
DADO que conversa está aberta em status em_andamento
QUANDO 20-40s passam aleatoriamente
ENTÃO 30% das vezes, indicador "Cliente está digitando..." aparece à esquerda
  E desaparece após 3-8s OU quando nova mensagem chega
```

### Cenários de erro

```gherkin
DADO que provider.send() rejeita com MockNetworkError
QUANDO mensagem otimista já estava visível
ENTÃO status muda para failed
  E botão "Tentar novamente" aparece
  E clicar refaz o envio

DADO que conversa é transferida para outro vendedor enquanto eu estou nela
QUANDO o real-time reflete a mudança
ENTÃO vejo mensagem system "Conversa transferida para [novo vendedor]"
  E input fica desabilitado com mensagem "Conversa não está mais atribuída a você"
```

---

## Fases de Implementação

| Fase | Objetivo                                                        | Arquivos Estimados |
| ---- | --------------------------------------------------------------- | ------------------ |
| 1    | Header, layout base e carregamento de conversa                  | 4-5                |
| 2    | Bubbles tipados + histórico virtualizado + marcadores temporais | 8-10               |
| 3    | Input de mensagem + simulação de envio + sugestões IA           | 5-6                |
| 4    | Janela de 24h + templates + capabilities                        | 4-5                |
| 5    | Ações contextuais + auditoria + cliente digitando + permissões  | 5-6                |

### Detalhamento das Fases

#### Fase 1: Header e Layout Base

**Objetivo:** página da conversa funcional com header informativo

**Ações:**

- [ ] Criar `ConversationPage` em `src/features/conversations/pages/ConversationPage.tsx`, rota `/app/atendimento/:id`
- [ ] Componente `<ConversationHeader>` com avatar, nome, canal, status pill, botões (Criar orçamento, Ficha, ⋮)
- [ ] Carregamento via `useConversationsProvider().get(id)` com loading skeleton e empty state
- [ ] Layout vertical (header + histórico vazio + input vazio) já posicionado

**Validação:** acessar `/app/atendimento/abc123` mostra header com dados certos; URL inexistente mostra EmptyState.

#### Fase 2: Histórico de Mensagens

**Objetivo:** histórico rico e performático

**Ações:**

- [ ] Componentes: `<TextBubble>`, `<ImageBubble>`, `<AudioBubble>`, `<DocumentBubble>`, `<SystemBubble>`, `<TemplateBubble>`
- [ ] Wrapper `<MessageBubble>` que escolhe o tipo certo baseado em `mediaType`
- [ ] Hook `useMessages(conversationId)` consumindo `useMessagesProvider().listByConversation`
- [ ] Scroll virtualizado com `@tanstack/react-virtual`
- [ ] Marcadores temporais inseridos pelo hook ao agrupar mensagens
- [ ] Auto-scroll inteligente (apenas se usuário estava no fim)
- [ ] Status de envio visual (✓, ✓✓, ✓✓ azul, ⚠)

**Validação:** conversa com 100+ mensagens rola fluidamente; SDR distinguido; bubbles de mídia abrem corretamente.

#### Fase 3: Input de Mensagem

**Objetivo:** envio funcional com optimistic UI

**Ações:**

- [ ] Componente `<MessageInput>` com textarea auto-resize
- [ ] Botões: anexo (modal), emoji (picker), templates (Meta only), enviar
- [ ] Implementar fluxo otimista no envio: criar IMessage local imediatamente, depois aguardar provider, atualizar status
- [ ] Simulação de delays e falha (5%) configurável em `src/mocks/config.ts`
- [ ] Linha de sugestões IA placeholder com textos estáticos baseados em palavras-chave

**Validação:** digitar Enter envia; mensagem aparece como sent; status evolui; falhas têm botão de retry.

#### Fase 4: Janela de 24h e Templates

**Objetivo:** capabilities específicas do Meta

**Ações:**

- [ ] Componente `<MetaWindowIndicator>` com 4 estados (verde/amarelo/vermelho/cinza)
- [ ] Cálculo de tempo restante baseado em `lastInboundMessageAt`
- [ ] Atualização do indicador a cada minuto (via interval)
- [ ] Modal `<TemplateSelectorModal>` listando templates mockados, com preview e campos para variáveis
- [ ] Capability check via `IWhatsAppAccount.capabilities.supportsTemplatesHsm`
- [ ] Desabilitar input texto quando janela fechada; redirecionar para templates

**Validação:** Meta com 23h+ mostra indicador vermelho; Evolution não mostra; templates renderizam com variáveis substituídas corretamente.

#### Fase 5: Ações, Auditoria, Polish

**Objetivo:** ações contextuais e detalhes finais

**Ações:**

- [ ] Menu ⋮ com `<DropdownMenu>` do shadcn listando ações
- [ ] Filtragem de ações por permissão via `usePermission()` (PRD-006)
- [ ] Modais: transferir (com dropdown), adicionar nota, escalar
- [ ] Toast com botão Desfazer para resolver/arquivar
- [ ] Integração com `auditLog()` em todas as mutations sensíveis
- [ ] Indicador "Cliente está digitando..." simulado por timer
- [ ] Validação de permissões: Vendedor não atribuído vê leitura

**Validação:** Owner vê todas as ações; Vendedor sem atribuição vê leitura; auditoria registra cada transferência.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                      | Status      |
| ------- | ---------------------------------------------- | ----------- |
| PRD-003 | Shell do App, Navegação e Layouts Base         | ⏳ Pendente |
| PRD-004 | Geradores de Dados Fictícios e Camada de Mocks | ⏳ Pendente |
| PRD-005 | Arquitetura de Provedores de Dados             | ⏳ Pendente |
| PRD-006 | RBAC                                           | ⏳ Pendente |
| PRD-010 | Inbox Unificado                                | ⏳ Pendente |

### Serviços Externos

| Serviço                                        | Tipo | Status                                       |
| ---------------------------------------------- | ---- | -------------------------------------------- |
| `@tanstack/react-virtual`                      | Lib  | A instalar (provavelmente já vem do PRD-010) |
| Emoji picker (`emoji-picker-react` ou similar) | Lib  | A instalar                                   |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD         | Título                                | Status       |
| ----- | ----------- | ------------------------------------- | ------------ |
| 1     | PRD-010     | Inbox Unificado                       | 📝           |
| **2** | **PRD-011** | **Conversa com Histórico Multicanal** | **🔄 ATUAL** |
| 3     | PRD-012     | Ficha Unificada do Cliente            | ⏳           |
| 4     | PRD-013     | Regras de Distribuição                | ⏳           |
| ...   |             |                                       |              |

---

## Considerações de Segurança

### Conteúdo sensível em mensagens

Mensagens podem conter CPF, CNPJ, endereço, dados financeiros. No MVP, são dados sintéticos do Faker. Na Fase 2 (Supabase), considerar:

- Mensagens são "pessoais" do ponto de vista LGPD
- Apenas vendedor responsável + gestores podem ler (RLS by `assignedSellerId` + `storeId`)
- Logs de quem visualizou cada conversa (audit log expandido)

### Anexos

No MVP, anexos são placeholders (não há upload real). Na Fase 2, validações: tamanho máximo, tipos permitidos, scan de malware (terceiros tipo VirusTotal), criptografia em trânsito (já é nativo no S3/Supabase Storage).

### Templates HSM

Templates do Meta são pré-aprovados pela Meta — não há liberdade arbitrária. Validar que apenas templates aprovados na conta do cliente aparecem no seletor.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor responde mensagem

1. Carlos clica em conversa na inbox → navega para `/app/atendimento/abc123`
2. Lê histórico, vê última mensagem do cliente: "Tem filtro de óleo Volvo R450?"
3. Digita no input "Sim, em estoque! R$ 95"
4. Pressiona Enter → mensagem aparece imediatamente como `sent`
5. ~300ms depois vira `delivered`
6. ~2s depois vira `read`
7. Cliente responde 1 minuto depois (simulado)

### Fluxo SDR → Humano — Escalonamento (relacionado ao PRD-023)

1. Vendedor abre conversa onde SDR estava atuando
2. Vê histórico SDR distinguido (badges 🤖)
3. SDR mandou orçamento, cliente está pedindo desconto
4. Vendedor clica "Pausar SDR" no menu ⋮
5. SystemBubble aparece: "Carlos assumiu o atendimento"
6. SDR não mais responde; vendedor controla

### Fluxo Janela Fechada — Reabrir via Template

1. Cliente parou de responder há 25h
2. Indicador vermelho/cinza: "Janela fechada"
3. Vendedor clica "Templates" → modal abre
4. Seleciona template "Cobrança gentil" com variáveis `{{nome}}` e `{{produto}}`
5. Preenche: nome="João", produto="filtro de óleo"
6. Envia → template é enviado, janela reabre quando cliente responder

### Fluxo Mobile — Conversa em tela cheia

1. Em iPhone (390px), inbox mostra lista de conversas
2. Toca em uma → navega para `/app/atendimento/abc123` em tela cheia
3. Header com botão "voltar" no canto superior esquerdo
4. Sem coluna direita visível (ficha vira drawer ao tocar no botão Ficha)
5. Toca "voltar" → volta para inbox preservando scroll

### Fluxo de Erro — Envio falha

1. Vendedor envia "Olá!"
2. Mock simula falha (5% das vezes)
3. Bubble fica destacado em vermelho com ⚠
4. Botão "Tentar novamente" aparece
5. Vendedor clica → retry; nova chance de sucesso

---

## Convenções de Código (Referência Rápida)

| Elemento         | Convenção                      | Exemplo                                                     |
| ---------------- | ------------------------------ | ----------------------------------------------------------- |
| **Componentes**  | PascalCase                     | `<ConversationHeader>`, `<MessageBubble>`                   |
| **Bubble types** | PascalCase com sufixo `Bubble` | `<TextBubble>`, `<ImageBubble>`                             |
| **Hooks**        | camelCase + `use`              | `useMessages`, `useMetaWindow`                              |
| **Pasta**        | kebab-case                     | `bubbles/`, `dialogs/`                                      |
| **localStorage** | prefixo `gallo-`               | `gallo-conversation-last-view-{id}`                         |
| **Git commits**  | Conventional Commits           | `feat(conversations): add bubbles and 24h window indicator` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                            | Descrição                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| **Optimistic UI sempre**             | Mensagem aparece em < 50ms, status evolui depois                      |
| **SDR e humano distinguíveis**       | Borda + badge nas bubbles do SDR; sem ambiguidade                     |
| **Capabilities adaptam UI**          | Nunca esconder funcionalidade — sempre tooltip explicando o porquê    |
| **Mock simula realidade**            | Latências, falhas, leituras, digitando — tudo varia para parecer real |
| **Auditoria em mutations sensíveis** | Transferir, escalar, arquivar, pausar SDR — todas registram           |
| **Performance > tudo**               | Virtual scroll obrigatório; conversa pesada é cenário real            |

### O que NÃO Fazer

| ❌ Evitar                                                                            |
| ------------------------------------------------------------------------------------ |
| Implementar a ficha do cliente — é PRD-012                                           |
| Implementar criação de orçamento — apenas navegar para PRD-031                       |
| Fazer indicador de "cliente digitando" como permanente — é simulado e probabilístico |
| Esquecer de desabilitar input quando janela 24h fechada (Meta)                       |
| Esconder o botão "Templates" — sempre visível, com tooltip se inativo                |
| Sobrecarregar bubble com features extras (citar, encaminhar, reagir) — fora do MVP   |
| Renderizar histórico sem virtualização                                               |

---

## Status de Implementação

| Campo      | Valor         |
| ---------- | ------------- |
| **Status** | ✅ CONCLUÍDO  |
| **Data**   | 2026-05-25    |
| **Versão** | 0.8.0 — Pilot |

---

## Histórico

| Data       | Versão | Alteração                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — conversa multicanal com histórico virtualizado, bubbles tipados, janela 24h, ações contextuais |

---

**AILA - Sistemas Inteligentes**
