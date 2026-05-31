# PRD-009: Notification Center e Preferências (UI)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Entregar a camada visível das notificações — sino na TopBar com badge de não-lidas, dropdown de preview, página de Notification Center (interna e no portal do cliente) e tela de preferências (matriz canal × categoria) — consumindo a fundação do PRD-008 e substituindo o sino placeholder do PRD-003 |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 0 — Fundação (camada de superfície) |
| **PRDs Relacionados** | PRD-008 (Fundação de Notificações — base obrigatória), PRD-001 (Design System), PRD-003 (Shell/TopBar — sino substituído), PRD-014 (Painel do Gestor — `<ActiveAlertsList>` vira view filtrada), PRD-065 (Conta do Cliente — hospeda a página do cliente), PRD-146 (Onda 8 — candidato a absorção por este PRD) |
| **Implementação** | 🔵 Claude Code CLI (sobre o scaffold do Lovable) |
| **Padrão de código** | Feature-based; componentes em `src/features/notifications/components/`; páginas em `src/routes/` (TanStack file-based); preferências reaproveitam o padrão de `/app/configuracoes` (PRD-019) |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** múltiplos componentes (sino, dropdown, item, grupo, página, tela de preferências) renderizados em **dois sub-apps** (`/app/*` interno e `/loja/*` do cliente) com públicos e tom distintos; integração reativa com a fundação do PRD-008 (hooks, real-time simulado, agrupamento); substituição de um componente existente do shell (PRD-003) e migração visual do `<ActiveAlertsList>` do PRD-014; tema light/dark obrigatório e acessibilidade. Toca a experiência de praticamente todos os módulos.

---

## Contexto do Problema

A fundação do PRD-008 dá à plataforma um cérebro de notificações — modelo, barramento, roteamento, persistência e canais — mas **nada disso é visível ao usuário ainda**. Sem a camada de superfície, o vendedor não vê que recebeu três clientes numa transferência de carteira, o gestor não percebe que uma conversa estourou o SLA, e o cliente não acompanha o status do pedido. O valor da fundação só se materializa quando há uma interface que a expõe.

Hoje o shell (PRD-003) tem um **sino placeholder**: um badge que mostra sempre 3 itens estáticos e não faz nada ao ser clicado. E os toasts disparados pelas features (PRD-010/011) são efêmeros — somem em segundos sem deixar rastro. Os alertas do Painel do Gestor (PRD-014) vivem isolados numa lista própria com dismiss em `localStorage`. O usuário não tem **um lugar único** para ver, filtrar e agir sobre tudo que aconteceu.

Este PRD entrega esse lugar único: o Notification Center. Conecta o sino de verdade à contagem de não-lidas, abre um dropdown de preview, oferece uma página completa com filtros e ações inline, dá ao usuário controle sobre o que recebe e por onde (tela de preferências, com os canais da Onda 8 já visíveis mas adormecidos), e replica a experiência no portal do cliente. É o PRD que torna a fundação do PRD-008 tangível — e o que o roadmap previa como PRD-146, agora antecipado para a Fase 1.

---

## Conceito da Solução

### Situação Atual (As-Is)

- **Sino placeholder** na TopBar (PRD-003): badge fixo em 3, sem dropdown funcional, sem navegação.
- **Toasts isolados** disparados localmente nas features, sem persistência nem histórico.
- **`<ActiveAlertsList>`** no Painel do Gestor (PRD-014): lista própria de até 10 alertas com dismiss em `localStorage`.
- **Fundação do PRD-008** pronta (modelo, bus, providers, hooks `useNotifications`/`useUnreadCount`/`useNotificationPreferences`), mas sem consumidores visuais.

### Situação Desejada (To-Be)

Uma experiência de notificação coesa em três superfícies, consumindo exclusivamente os hooks do PRD-008:

1. **Sino + dropdown (TopBar interna).** O sino mostra a contagem real de não-lidas e abre um dropdown com as últimas notificações agrupadas, ações rápidas e atalhos para "ver todas" e "marcar todas como lidas".
2. **Página Notification Center.** Uma página dedicada — `/app/notificacoes` para o usuário interno e uma equivalente no portal do cliente — com lista paginada, filtros (categoria, status, severidade), agrupamento por `groupKey`, ações inline (Ver, Resolver, Transferir…), empty states e skeletons.
3. **Tela de preferências.** A matriz canal × categoria que permite ao usuário ligar/desligar o que recebe e por onde, respeitando as travas do PRD-008 (transacionais/sistema críticos não-silenciáveis no in-app). Os canais da Onda 8 (email, WhatsApp, SMS, push) aparecem listados, porém **desabilitados com selo "Fase 2"** — educando sobre o roadmap sem prometer o que ainda não existe.

Como consequência, o sino placeholder do PRD-003 é **substituído**, os toasts passam a ser a manifestação efêmera do mesmo fluxo (já roteados pelo `ToastChannel` no PRD-008), e o `<ActiveAlertsList>` do PRD-014 deixa de ter lógica própria: vira uma **view filtrada** do Notification Center por `category=operational`.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Manter só toasts e adiar o center para a Onda 8 (PRD-146) | Desperdiça a fundação do PRD-008 já entregue e mantém o usuário sem histórico nem controle; a antecipação é barata sobre a fundação pronta |
| Center só para o usuário interno (cliente fica para depois) | O escopo aprovado inclui o cliente final; e a página do cliente é de baixo custo reaproveitando os mesmos componentes |
| Tela de preferências sem os canais da Onda 8 | Esconder os canais futuros perde a oportunidade de comunicar o roadmap; mostrá-los desabilitados é mais honesto e prepara o terreno do PRD-147 |
| Criar um layout próprio para o center | Viola o PRD-003 (8 layouts são contrato); o center usa `AppLayout` (interno) e `LojaLayout` (cliente) |
| Reimplementar contagem/listagem na UI | Quebra o isolamento do PRD-008; a UI só consome hooks, nunca acessa providers diretamente |

---

## Escopo

### Incluído

- ✅ `<NotificationBell>` na TopBar interna (substitui o placeholder do PRD-003), com badge de não-lidas reativo via `useUnreadCount()`
- ✅ `<NotificationDropdown>` — preview das últimas notificações, agrupadas, com ações rápidas, "marcar todas como lidas" e "ver todas"
- ✅ Página interna `/app/notificacoes` — lista paginada, filtros (categoria, status, severidade), agrupamento por `groupKey`, ordenação por recência, empty states e skeletons
- ✅ `<NotificationItem>` — item com ícone/cor de severidade, título, corpo, timestamp relativo, indicador lido/não-lido e ações inline
- ✅ `<NotificationGroup>` — colapso visual de notificações com mesmo `groupKey` ("N novas conversas atribuídas")
- ✅ Ações: marcar como lida (individual e em massa), arquivar, executar ação inline (navegação por rota ou mutação nomeada do `INotificationAction`)
- ✅ `<NotificationPreferences>` — matriz canal × categoria com toggles; canais da Onda 8 desabilitados e marcados "Fase 2"; respeito às categorias não-silenciáveis
- ✅ Página de preferências interna acoplada a `/app/configuracoes` (PRD-019) como nova sub-rota (ex.: `/app/configuracoes/notificacoes`)
- ✅ Página de Notification Center do cliente no portal (`/loja/conta/notificacoes`) e preferências do cliente — versão simplificada, tom comercial
- ✅ Consolidação visual dos toasts (já roteados pelo `ToastChannel` no PRD-008), incluindo "Desfazer" (5s) em ações reversíveis quando aplicável
- ✅ Migração do `<ActiveAlertsList>` do PRD-014 para consumir o Notification Center filtrado por `category=operational`
- ✅ Atualização reativa (real-time simulado) do badge e da lista quando novas notificações chegam, alinhada ao mecanismo do PRD-010
- ✅ Tema light/dark (PRD-001) e responsividade mobile (sino na TopBar reduzida; página em tela cheia; acesso via BottomNav)
- ✅ Acessibilidade: `aria-live` para badge/toasts, foco gerenciado no dropdown, navegação por teclado, `prefers-reduced-motion`

### Excluído

- ❌ Qualquer alteração na fundação (modelo, bus, providers, reconciliador) — é escopo do PRD-008
- ❌ Entrega real por canais externos (email/WhatsApp/SMS/push) — Onda 8; aqui os canais aparecem desabilitados na tela de preferências
- ❌ Templates de notificação editáveis — PRD-142/143 (Onda 8)
- ❌ Digest/resumo periódico — Onda 8; aqui só agrupamento visual por `groupKey`
- ❌ Sons de notificação / vibração — fora do MVP
- ❌ Configuração de janela de silêncio (quiet hours) ativa — o campo existe no PRD-008 mas a UI fica adormecida no MVP
- ❌ Implementação da área de conta do cliente em si (dashboard, pedidos, perfil…) — é escopo do PRD-065; este PRD entrega **apenas** a página de notificações/preferências do cliente, a ser integrada à navegação de conta

---

## Requisitos Funcionais

### Sino e badge (TopBar interna)

- **RF-001:** Substituir o sino placeholder do PRD-003 por `<NotificationBell>`, mantendo a posição na TopBar (entre busca global e avatar) e o comportamento responsivo da TopBar reduzida em mobile.
- **RF-002:** O badge exibe a contagem de não-lidas via `useUnreadCount()`, respeitando o escopo do usuário (resolvido na camada de provider do PRD-008). Acima de 99, exibir "99+".
- **RF-003:** Quando a contagem é zero, o badge é ocultado (apenas o ícone do sino permanece).
- **RF-004:** Clicar no sino abre `<NotificationDropdown>`; clicar fora ou pressionar Esc fecha. O foco é movido para dentro do dropdown ao abrir e devolvido ao sino ao fechar.

### Dropdown de preview

- **RF-005:** O dropdown lista as últimas notificações do usuário (sugestão: 8), priorizando não-lidas, agrupadas por `groupKey` quando aplicável, com timestamp relativo.
- **RF-006:** Cada item do dropdown mostra ícone/cor de severidade, título, trecho do corpo e, quando houver, a ação inline primária.
- **RF-007:** Cabeçalho do dropdown com título "Notificações" e ação "Marcar todas como lidas"; rodapé com "Ver todas" navegando para `/app/notificacoes`.
- **RF-008:** Abrir uma notificação a partir do dropdown a marca como lida e executa sua ação primária (navegação ou mutação), fechando o dropdown.
- **RF-009:** Estado vazio do dropdown: mensagem amigável ("Nada novo por aqui ✅"), sem ação de erro.

### Página Notification Center (interna)

- **RF-010:** Criar a rota `/app/notificacoes` sobre o `AppLayout` (um dos 8 layouts do PRD-003 — não criar layout novo), consumindo `useNotifications(filters)`.
- **RF-011:** Lista paginada com ordenação por recência (mais recentes primeiro), agrupamento por `groupKey` colapsável, e indicador visual de lido/não-lido.
- **RF-012:** Filtros combináveis: categoria (multi-select), status (não-lidas/lidas/arquivadas) e severidade. Filtros sincronizados na URL via query params.
- **RF-013:** Ações por item: marcar como lida/não-lida, arquivar, e executar `INotificationAction` (botões "Ver", "Resolver", "Transferir" etc., conforme definido no PRD-008).
- **RF-014:** Ação global "Marcar todas como lidas" e filtro rápido "Apenas não-lidas".
- **RF-015:** Skeleton durante o fetch inicial; empty states contextuais (sem notificações: mensagem neutra; com filtros sem resultado: "Nenhuma notificação corresponde aos filtros" + "Limpar filtros").
- **RF-016:** Estado de erro tratado graciosamente (mensagem + opção de tentar novamente), sem quebrar a TopBar nem a navegação.

### Item e agrupamento

- **RF-017:** `<NotificationItem>` renderiza ícone e cor derivados de `category` + `severity` (ver Anexo A), título, corpo (snapshot), timestamp relativo, e ações inline.
- **RF-018:** `<NotificationGroup>` colapsa notificações de mesmo `groupKey` num cabeçalho resumido ("N novas conversas atribuídas"); expandir revela os itens individuais.
- **RF-019:** Notificações não-lidas têm destaque visual (ex.: marcador/realce); visualizar a notificação (abrir ou marcar) remove o destaque.

### Preferências

- **RF-020:** Criar `<NotificationPreferences>` exibindo a matriz canal × categoria a partir de `useNotificationPreferences()`, refletindo os defaults do PRD-008 quando o usuário ainda não personalizou.
- **RF-021:** Cada célula da matriz é um toggle (canal habilitado/desabilitado para a categoria). Alterações persistem via o provider de preferências do PRD-008 e são auditadas (PRD-006).
- **RF-022:** Canais da Onda 8 (email, WhatsApp, SMS, push) aparecem na matriz **desabilitados** e marcados com selo "Fase 2" (tooltip explicativo). Não são alteráveis no MVP.
- **RF-023:** Células de categorias não-silenciáveis (transacional e sistema críticos) exibem o canal in-app como **fixo/bloqueado** (com indicação visual), impedindo o opt-out completo conforme regra do PRD-008.
- **RF-024:** A tela de preferências interna é uma nova sub-rota de `/app/configuracoes` (PRD-019), seguindo o padrão de sub-sidebar e respeitando permissões.

### Portal do cliente

- **RF-025:** Entregar a página de Notification Center do cliente sobre o `LojaLayout`, na rota `/loja/conta/notificacoes`, consumindo os mesmos hooks com `recipientType: 'customer'` resolvido pela sessão mock do cliente (perfil "Cliente" do PRD-003/PRD-004).
- **RF-026:** Versão simplificada (sem jargão interno): foco em transacionais de pedido/orçamento e avisos do portal; tom comercial neutro.
- **RF-027:** Entregar a tela de preferências do cliente (canais por categoria, com os canais da Onda 8 desabilitados e selo "Fase 2"; marketing como opt-in explícito), acessível a partir da conta do cliente.
- **RF-028:** Como a área de conta do cliente (PRD-065) pode ainda não estar implementada, as páginas do cliente devem funcionar por rota direta sobre o `LojaLayout` e ser estruturadas para integração à navegação de conta quando o PRD-065 existir (ver Decisões Pendentes).

### Integrações com o existente

- **RF-029:** Migrar o `<ActiveAlertsList>` do PRD-014 para consumir o Notification Center filtrado por `category=operational`, preservando a aparência e os botões "Ver"/"Dispensar" — onde "Dispensar" passa a marcar como lida/arquivar via PRD-008 (sem `localStorage` próprio).
- **RF-030:** Consolidar a apresentação visual dos toasts (já roteados pelo `ToastChannel` no PRD-008), mantendo "Desfazer" (5s) nas ações reversíveis já previstas (PRD-011).
- **RF-031:** O badge e a lista atualizam reativamente quando novas notificações chegam (real-time simulado), alinhados ao mecanismo do PRD-010, com toggle de demonstração respeitado quando aplicável.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Abrir o dropdown e refletir marcação de leitura devem ocorrer em menos de 100 ms (camada mock). A página com filtros não deve travar a UI; filtragem/paginação ocorrem na camada de provider.
- **RNF-002 (Responsividade):** Layout fluido do desktop ao mobile; em mobile o sino permanece na TopBar reduzida e a página `/app/notificacoes` ocupa tela cheia, acessível pela navegação mobile (BottomNav/"Mais").
- **RNF-003 (Tema):** Suporte obrigatório a light e dark (PRD-001), inclusive cores de severidade legíveis em ambos os modos.
- **RNF-004 (Acessibilidade):** Badge e toasts com `aria-live` apropriado; dropdown navegável por teclado com foco gerenciado; contraste WCAG AA; respeito a `prefers-reduced-motion`.
- **RNF-005 (Consistência):** Reuso dos componentes shadcn/ui e ícones Iconify do projeto; nenhum layout novo (usar `AppLayout`/`LojaLayout`).
- **RNF-006 (Isolamento):** A UI consome exclusivamente os hooks públicos do PRD-008; nunca importa providers/implementações internas (ESLint do PRD-008/005 vale aqui).
- **RNF-007 (Internacionalização):** Textos em português brasileiro; timestamps relativos localizados (ex.: "há 5 min", "ontem").

---

## Critérios de Aceitação

### RF-001/RF-002: Sino e badge reais

```gherkin
DADO um usuário interno com 5 notificações não-lidas
QUANDO a TopBar é renderizada
ENTÃO o sino exibe o badge "5"
  E o sino não é mais o placeholder estático do PRD-003

DADO um usuário sem notificações não-lidas
QUANDO a TopBar é renderizada
ENTÃO o badge é ocultado e apenas o ícone do sino aparece
```

### RF-005/RF-008: Dropdown funcional

```gherkin
DADO que clico no sino
QUANDO o dropdown abre
ENTÃO vejo as últimas notificações agrupadas, priorizando não-lidas
  E o foco é movido para dentro do dropdown

DADO que abro uma notificação a partir do dropdown
QUANDO a ação primária é executada
ENTÃO a notificação é marcada como lida
  E sou navegado ao destino (ou a mutação é executada)
  E o dropdown fecha
```

### RF-010/RF-012: Página e filtros

```gherkin
DADO que estou em /app/notificacoes
QUANDO aplico o filtro categoria=operational e status=não-lidas
ENTÃO a lista mostra apenas notificações operacionais não-lidas
  E os filtros são refletidos na URL
  E recarregar a página restaura o estado dos filtros
```

### RF-020/RF-022/RF-023: Preferências e travas

```gherkin
DADO que abro a tela de preferências
QUANDO inspeciono a matriz canal × categoria
ENTÃO os canais email/whatsapp/sms/push aparecem desabilitados com selo "Fase 2"
  E o canal in-app das categorias transacional e sistema crítico aparece fixo/bloqueado

DADO que desabilito o toast para a categoria gamification e salvo
QUANDO uma notificação de gamificação chega depois
ENTÃO ela não dispara toast
  E continua aparecendo no in-app (se habilitado)
  E a alteração foi registrada em auditoria
```

### RF-025/RF-026: Portal do cliente

```gherkin
DADO que estou logado como Cliente (sessão mock do PRD-003)
QUANDO acesso /loja/conta/notificacoes
ENTÃO vejo apenas as minhas notificações (transacionais de pedido/orçamento e avisos do portal)
  E o tom é comercial, sem jargão interno
```

### RF-029: Migração do ActiveAlertsList

```gherkin
DADO o Painel do Gestor (PRD-014)
QUANDO a lista de alertas é renderizada
ENTÃO ela consome o Notification Center filtrado por category=operational
  E "Dispensar" marca como lida/arquivar via PRD-008 (sem usar localStorage próprio)
```

### Cenários de Erro

```gherkin
DADO que o provider de notificações falha ao listar
QUANDO a página /app/notificacoes carrega
ENTÃO vejo um estado de erro com opção de tentar novamente
  E a TopBar e a navegação permanecem funcionais

DADO uma notificação cuja ação inline aponta para um registro inexistente
QUANDO executo a ação
ENTÃO sou levado a um empty state ("registro não encontrado") em vez de uma tela quebrada
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | Sino + badge + dropdown (TopBar interna) | 4-5 |
| 2 | Página `/app/notificacoes` + item + grupo + filtros | 6-8 |
| 3 | Tela de preferências interna (sub-rota de configurações) | 3-4 |
| 4 | Migração do `<ActiveAlertsList>` (PRD-014) + consolidação dos toasts | 3-4 |
| 5 | Páginas do cliente (notificações + preferências) no portal | 4-6 |

### Detalhamento das Fases

#### Fase 1: Sino, Badge e Dropdown

**Objetivo:** tornar o sino real e dar o primeiro ponto de acesso às notificações.

**Ações:**
- [ ] Criar `<NotificationBell>` consumindo `useUnreadCount()` e substituir o placeholder na TopBar (PRD-003)
- [ ] Criar `<NotificationDropdown>` consumindo `useNotifications()` (últimas N)
- [ ] Implementar agrupamento por `groupKey` no preview e ações "marcar todas como lidas" / "ver todas"
- [ ] Implementar foco gerenciado, fechar por Esc/clique-fora e `aria-live` no badge

**Validação:** badge reflete a contagem real; dropdown abre/fecha corretamente; abrir item marca como lido e navega.

#### Fase 2: Página Notification Center (interna)

**Objetivo:** a visão completa com filtros e ações.

**Ações:**
- [ ] Criar a rota `/app/notificacoes` sobre `AppLayout`
- [ ] Criar `<NotificationItem>` e `<NotificationGroup>` (ícone/cor por categoria+severidade — Anexo A)
- [ ] Implementar filtros (categoria/status/severidade) sincronizados na URL
- [ ] Implementar ações por item (ler/arquivar/ação inline) e ação global "marcar todas como lidas"
- [ ] Implementar skeletons, empty states e estado de erro

**Validação:** filtros refletem na URL e sobrevivem a refresh; ações atualizam a lista; estados vazios/erro corretos.

#### Fase 3: Preferências (interna)

**Objetivo:** dar ao usuário controle sobre o que recebe e por onde.

**Ações:**
- [ ] Criar `<NotificationPreferences>` (matriz canal × categoria) consumindo `useNotificationPreferences()`
- [ ] Marcar canais da Onda 8 como desabilitados + selo "Fase 2"
- [ ] Bloquear in-app das categorias não-silenciáveis (transacional/sistema crítico)
- [ ] Adicionar como sub-rota de `/app/configuracoes` (PRD-019), respeitando permissões e o padrão de sub-sidebar

**Validação:** toggles persistem e são auditados; canais Fase 2 não editáveis; categorias críticas não silenciáveis.

#### Fase 4: Migração de Alertas e Toasts

**Objetivo:** unificar o que já existia sob o novo center.

**Ações:**
- [ ] Adaptar `<ActiveAlertsList>` (PRD-014) para consumir o center filtrado por `category=operational`
- [ ] Trocar o dismiss em `localStorage` por marcar-lida/arquivar via PRD-008
- [ ] Consolidar a apresentação visual dos toasts roteados pelo `ToastChannel`, preservando "Desfazer" (5s)

**Validação:** painel do gestor mostra alertas vindos do center; "Dispensar" reflete no center; toasts mantêm UX.

#### Fase 5: Portal do Cliente

**Objetivo:** replicar a experiência para o cliente final.

**Ações:**
- [ ] Criar `/loja/conta/notificacoes` sobre `LojaLayout` (versão simplificada, tom comercial)
- [ ] Criar a tela de preferências do cliente (canais por categoria; Onda 8 desabilitada; marketing opt-in)
- [ ] Garantir funcionamento por rota direta e estrutura pronta para integração ao PRD-065 quando existir
- [ ] Popular com o seed de notificações de `customer` do PRD-008

**Validação:** cliente logado vê apenas as próprias notificações; preferências do cliente funcionam; integração ao 065 prevista sem retrabalho.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-008 | Fundação de Notificações (modelo, bus, providers, hooks) | ⏳ Pendente (pré-requisito direto) |
| PRD-001 | Design System (tokens, tema, componentes, Iconify) | ✅ Concluído |
| PRD-003 | Shell/TopBar (sino placeholder substituído; layouts) | ✅ Concluído |
| PRD-006 | RBAC (escopo e auditoria de preferências) | ✅ Concluído |
| PRD-014 | Painel do Gestor (`<ActiveAlertsList>` migrado) | ✅ Concluído |
| PRD-019 | Configurações (hospeda a sub-rota de preferências interna) | ✅ Concluído |
| PRD-065 | Conta do Cliente (hospeda a página do cliente) | ⏳ Pendente (Bloco 5 / Onda 3) |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| — | — | Nenhum (toda entrega externa é Onda 8; aqui os canais aparecem desabilitados) |

### Decisões Pendentes

- [ ] **Ordem vs. PRD-065:** a área de conta do cliente é da Onda 3 e pode não estar pronta. Recomendação: entregar as páginas do cliente por **rota direta** sobre o `LojaLayout` agora (demonstrável com a sessão mock "Cliente"), e integrá-las à navegação de conta quando o PRD-065 for implementado — registrando no PRD-065 o item de menu a adicionar. Confirmar se concorda ou se prefere reordenar o PRD-065 para antes.
- [ ] **Absorção do PRD-146:** como a UI do Notification Center sai aqui, avaliar com o Frederico se o PRD-146 (Onda 8) é reduzido a "ativar os canais reais na UI já existente" ou removido. (Já sinalizado no Anexo C do PRD-008.)
- [ ] **Local da preferência do cliente:** confirmar se a preferência do cliente fica em página própria (`/loja/conta/preferencias`) ou embutida no perfil (`/loja/conta/perfil`), alinhando com o desenho final do PRD-065.
- [ ] **Codinome de versão:** sugestão **"Chime"** (o toque do sino) para esta camada de superfície.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Sistema de Notificações da Plataforma"** (Bloco 0 — Fundação, camada de superfície).

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-008 | Fundação de Notificações | ⏳ | Base obrigatória |
| **2** | **PRD-009** | **Notification Center & Preferências (UI)** | **🔄 ATUAL** | Depende de PRD-008 (e 001/003/014/019; 065 para o cliente) |
| 3+ | PRDs 141–150 | Onda 8 — Notificações Reais | ⏳ | Ativam os canais reais sobre esta UI |

> **Nota:** Implemente na ordem indicada. O PRD-008 deve estar ✅ antes de iniciar este. A parte do cliente (Fase 5) pressupõe o PRD-065 ou a estratégia de rota direta descrita em Decisões Pendentes.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Conteúdo de notificação (nomes, valores, métricas) | PII / Sensível | A UI exibe apenas o que o provider do PRD-008 retorna no escopo do usuário; nada é buscado fora do escopo |
| Preferências de notificação | PII / consentimento | Persistidas via provider; alterações auditadas (PRD-006) |

### Autenticação e Autorização

A UI **não filtra dados sensíveis por conta própria** — confia no escopo já resolvido pela camada de provider do PRD-008 (papel + `storeId` + `recipientId`). O sino, o dropdown e a página apenas renderizam o que os hooks retornam. A sessão mock (interna no PRD-003, do cliente no PRD-065/PRD-003) determina o `recipientId`/`recipientType`.

### Auditoria

Alterações na tela de preferências disparam auditoria via PRD-006 (autor + timestamp). Ações de leitura/arquivamento não são auditadas (não são sensíveis), mas seguem o ciclo de vida definido no PRD-008.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — Vendedor reage a uma notificação

1. Carlos (Vendedor) vê o badge do sino indicar "3".
2. Clica no sino; o dropdown mostra "Você recebeu 2 clientes (transferência)" e "Conversa sem resposta há 4h".
3. Clica na conversa sem resposta; a notificação é marcada como lida e ele é levado à conversa (PRD-011).
4. O badge cai para "2".

### Fluxo Alternativo — Gestor ajusta preferências

1. Marina (Gestor) abre `/app/configuracoes/notificacoes`.
2. Desliga o toast para `gamification` (não quer pop-ups de ranking).
3. Salva; a alteração é auditada.
4. Notificações de gamificação passam a aparecer só no in-app, sem toast.

### Fluxo do Cliente — Acompanhamento de pedido

1. Cliente (Transportadora Aurora) acessa `/loja/conta/notificacoes`.
2. Vê "Pedido #OP-2026-0042 confirmado" e "Orçamento aprovado".
3. (Os canais email/WhatsApp aparecem na tela de preferências como "Fase 2"; no MVP, a entrega real desses canais ainda não ocorre.)

### Fluxo de Erro — Falha de carregamento

1. Usuário abre `/app/notificacoes`; o provider falha.
2. A página mostra estado de erro com "Tentar novamente"; a TopBar e a navegação seguem funcionais.
3. Ao recuperar, a lista carrega normalmente.

---

### Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `NotificationBell.tsx` |
| **Hooks** | camelCase + `use` | `useNotifications.ts` (do PRD-008) |
| **Pastas** | kebab-case | `features/notifications/` |
| **Variáveis/Funções** | camelCase | `unreadCount`, `markAllRead()` |
| **Constantes** | UPPER_SNAKE_CASE | `DROPDOWN_PREVIEW_LIMIT` |
| **Interfaces** | PascalCase + `I` | `INotification` (do PRD-008) |
| **Rotas** | TanStack file-based | `src/routes/app/notificacoes.tsx` |
| **Env vars (frontend)** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Git commits** | Conventional Commits | `feat:`, `refactor:` |
| **Estrutura de pastas** | Feature-based | `src/features/notifications/` |
| **Ícones** | Iconify (`@iconify/react`) | `<Icon icon="mdi:bell" />` |
| **Tema** | Light + Dark obrigatório | CSS variables para cores |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.5 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.5 na plataforma web).

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: a estratégia de rota do cliente diante do PRD-065 não implementado, o local da preferência do cliente, e o mapeamento de ícones/cores por categoria × severidade (Anexo A).**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/) (MINOR)
> - Gerar codinome em inglês (sugestão: **Chime**)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final (`PRD-009-notification-center-preferencias_DONE.md`)
> - Atualizar a seção "Status de Implementação"
> - Registrar no PRD-014 que o `<ActiveAlertsList>` passou a consumir o Notification Center; e no PRD-065 (quando aplicável) o item de menu de notificações/preferências

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinomes:** para MINOR/MAJOR, gerar codinome em inglês baseado no contexto. Sugestão para este PRD: **Chime**.

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Não bloquear fluxo principal** | Erro de notificação nunca derruba a TopBar nem a navegação |
| **Fail gracefully** | Estado de erro visível e recuperável; nunca tela branca |
| **Reuso sobre reinvenção** | Usar componentes shadcn/ui, ícones Iconify e os 8 layouts do PRD-003; não criar layout novo |
| **Testar incrementalmente** | Validar sino → página → preferências → migração → cliente, nessa ordem |
| **Documentar decisões** | Registrar no CHANGELOG qualquer divergência (ex.: local da preferência do cliente) |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Consumir só hooks** | A UI nunca importa providers/implementações do PRD-008 — apenas `useNotifications`, `useUnreadCount`, `useNotificationPreferences` |
| **Substituir, não duplicar** | O sino do PRD-003 é substituído, não duplicado; o `<ActiveAlertsList>` é migrado, não mantido em paralelo |
| **Timestamps relativos** | Usar utilitário de data já adotado no projeto (ex.: `date-fns`) com locale pt-BR |
| **Cores de severidade** | Derivar das CSS variables do tema (PRD-001), legíveis em light e dark; alinhar com o padrão de severidade do PRD-014 |
| **Cliente vs. interno** | Mesmos componentes, props/variações diferentes; tom comercial no cliente, sem jargão |
| **Real-time** | Reaproveitar o mecanismo simulado do PRD-010; não criar um segundo loop concorrente |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Alterar a fundação (modelo, bus, providers, reconciliador) — é o PRD-008 |
| Implementar entrega real de email/WhatsApp/SMS/push — é Onda 8; aqui os canais ficam desabilitados |
| Criar um layout novo — usar `AppLayout`/`LojaLayout` (PRD-003) |
| Acessar providers/implementações internas do PRD-008 a partir da UI |
| Manter o sino placeholder ou o `<ActiveAlertsList>` com lógica própria em paralelo |
| Persistir dismiss/estado de notificação em `localStorage` na UI — o ciclo de vida é do PRD-008 |
| Permitir opt-out completo de transacionais/sistema críticos |
| Implementar a área de conta do cliente (dashboard, pedidos, perfil) — é o PRD-065 |
| Esquecer `aria-live`, foco no dropdown e `prefers-reduced-motion` |
| Bloquear a TopBar/navegação em caso de erro de notificação |

---

## Anexo A — Mapa de Ícone e Cor por Categoria × Severidade

> Ícones Iconify (set `mdi`) sugeridos; cores derivadas das CSS variables do tema (PRD-001), com paridade light/dark. Severidade governa a cor; categoria governa o ícone.

| Categoria | Ícone sugerido | | Severidade | Cor (semântica) |
|-----------|----------------|---|------------|-----------------|
| transactional | `mdi:receipt-text` | | info | neutra/azulada |
| commercial | `mdi:account-clock` | | success | verde |
| operational | `mdi:alert-circle` | | warning | amarelo/âmbar |
| gamification | `mdi:trophy` | | critical | vermelho (acento Diesel Heavy) |
| system | `mdi:cog` | | | |
| marketing | `mdi:bullhorn` | | | |

> O ícone do sino na TopBar é `mdi:bell` (com `mdi:bell-badge` quando há não-lidas, se preferível à sobreposição de badge).

---

## Anexo B — Anatomia das Telas (referência)

> Wireframe textual — referência estrutural, não prescrição visual.

**Dropdown (sino):**
```
┌────────────────────────────────────────┐
│ Notificações        [Marcar todas lidas]│
├────────────────────────────────────────┤
│ ● 🏆 Meta batida! 100% do mês      2min │
│ ● 🔔 2 novas conversas atribuídas  10min│   ← grupo (groupKey)
│   ⚠ Conversa sem resposta há 4h    1h   │
│   📋 Pedido #OP-2026-0042 confirmado 3h │
├────────────────────────────────────────┤
│              Ver todas →                 │
└────────────────────────────────────────┘
```

**Página `/app/notificacoes`:**
```
Notificações                         [Marcar todas como lidas]
[Categoria ▾] [Status ▾] [Severidade ▾]        [Apenas não-lidas]
───────────────────────────────────────────────────────────────
● ⚠  Cliente A dormente: Aurora — 95 dias        [Ver]   há 2h
● 🏆 Meta batida! 100% do mês                             há 3h
  🔔 2 novas conversas atribuídas (grupo)         [Expandir] há 4h
  📋 Pedido #OP-2026-0042 confirmado              [Ver]    ontem
───────────────────────────────────────────────────────────────
                         « 1 2 3 »
```

**Preferências (matriz canal × categoria):**
```
                In-app   Toast   Email*   WhatsApp*  SMS*  Push*
Transacional     🔒 ✓     ☑       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)
Operacional      ☑        ☑       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)
Comercial        ☑        ☐       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)
Gamificação      ☑        ☑       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)
Sistema          🔒 ✓     ☑       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)
Marketing        ☐        —       ▢(F2)    ▢(F2)     ▢(F2) ▢(F2)

🔒 = fixo (não-silenciável)   * canais "Fase 2" desabilitados (▢)
```

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Codinome** | - (sugestão: Chime) |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 30/05/2026 | v1 | Criação inicial — UI do sistema de notificações: sino+badge, dropdown, página Notification Center (interna e portal do cliente), tela de preferências (matriz canal × categoria com canais da Onda 8 desabilitados), migração do `<ActiveAlertsList>` do PRD-014 e consolidação dos toasts. Consome a fundação do PRD-008 |

---

**AILA - Sistemas Inteligentes**
