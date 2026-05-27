# PRD-201: Gestão Crítica de Estoque de Itens Stop-the-Line (Filtros)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                         |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                                                                              |
| **Objetivo**          | Implementar regra crítica de estoque para itens stop-the-line (filtros de caminhão pesado): parametrização em três níveis, motor event-driven de zonas (verde/amarela/vermelha), bloqueio híbrido (hard no e-commerce, soft no balcão), sistema de override por aprovação remota in-app e notificação multicanal a gestor e fornecedor           |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                          |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                             |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                                |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                                                                                             |
| **Épico**             | Onda 14 — Operações Críticas (Fase 3 — pós-go-live)                                                                                                                                                                                                                                                                                              |
| **PRDs Relacionados** | PRD-006 (RBAC/Auditoria), PRD-019 (Configurações Admin), PRD-030 (Catálogo), PRD-031 (Orçamento), PRD-032 (Pedido), PRD-052 (Estoque BI — esqueleto), PRD-064 (Carrinho/Checkout), PRD-114/115 (WhatsApp Real — Fase 2), PRD-129 (Importação CSV DINTEC — Fase 2), PRD-141 (Resend Email — Fase 2), PRD-143 (WhatsApp Transacional HSM — Fase 2) |
| **Implementação**     | 🟠 Fase 2 — após aprovação do mockup e implantação de DINTEC + WhatsApp Cloud                                                                                                                                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/critical-stock/`                                                                                                                                                                                                                                                                                          |

### Critérios de Complexidade

> **Justificativa de Alta:** módulo transversal que toca catálogo, orçamento, pedido, e-commerce e configurações; introduz motor event-driven de zonas de estoque com idempotência e throttle; parametrização em três níveis com herança (global → marca → SKU); fluxo de exceção multi-ator (vendedor solicita, gestor aprova remoto); cadastro de fornecedor como entidade nova com canais de notificação configuráveis; integração obrigatória com PRD-110 (DINTEC) para saldo real e com PRD-101 (WhatsApp Cloud API) para notificação ao fornecedor; auditoria integral com trilha de overrides, mudanças de política e disparos de notificação.

---

## Contexto do Problema

Filtros (ar, óleo, combustível, hidráulico, separador de água) são itens **stop-the-line** na operação de uma transportadora de caminhões pesados. Diferente de outras peças do catálogo, a ruptura de estoque de um filtro não é um inconveniente comercial — é uma falha operacional que **deixa o caminhão do cliente parado na oficina** e converte o atendimento em emergência. Nesse momento, o cliente paga o que for cobrado, mas a Gallo perde margem (frete emergencial, compra avulsa de fornecedor) e desgasta a relação.

A regra crítica do dono da operação é inegociável: **filtro de caminhão não pode zerar**. Hoje, o DINTEC (ERP atual) entrega saldo, mas não dispara alertas preventivos, não trava venda automaticamente quando o piso é violado, não notifica fornecedores e não tem trilha de auditoria para liberações de exceção. Toda a vigilância depende da memória do gestor e da disciplina do vendedor — o que em escala de 5 marcas × ~500 modelos é insustentável.

Este PRD endereça especificamente os itens classificados como stop-the-line (inicialmente toda a categoria "Filtros"). Outras categorias permanecem com o comportamento atual de estoque até decisão futura. O PRD é destinado à **Fase 3** (Operações Críticas) porque depende de: (a) saldo de estoque atualizado periodicamente via importação CSV exportada do DINTEC (PRD-129, Fase 2 — DINTEC sem API confirmado em 27/05/2026); (b) canais reais de notificação a fornecedor — e-mail via Resend (PRD-141) e WhatsApp via HSM transacional (PRD-143), ambos Fase 2. Na Fase 1 (mockup navegável), apenas as telas de configuração são esqueletos dentro do PRD-052 para validação visual com cliente.

> **⚠️ Tolerância de defasagem de saldo (decisão 27/05/2026):** dado que o DINTEC não expõe API nem acesso direto ao banco, o saldo no GALLO **não é near real-time**. A fonte da verdade do saldo é o último import CSV processado (PRD-129), com frequência configurável (default diário). O motor event-driven opera sobre esse saldo "snapshot diário". Isso significa que entre dois imports, vendas no DINTEC paralelo (caso ocorram fora do GALLO) podem deixar o saldo GALLO superestimado por até 24h. O sistema deve exibir explicitamente em todas as telas críticas o timestamp do último import e o aviso "Saldo atualizado em [X]h atrás — verifique no balcão antes de venda crítica". A Fase 4/5 (substituição parcial/total do DINTEC) elimina essa defasagem ao tornar o GALLO fonte primária do estoque.

---

## Conceito da Solução

### Situação Atual (As-Is)

- Vendedor consulta saldo no DINTEC manualmente; vende até zerar.
- Gestor descobre a ruptura quando cliente liga em emergência.
- Reposição vira urgência: frete dobrado, compra avulsa fora de tabela, margem corroída.
- Não há trilha de quem vendeu o último item, quando, para qual cliente.
- Fornecedor da marca só recebe pedido formal de reposição quando o gestor lembra de fazê-lo.

### Situação Desejada (To-Be)

Sistema de **três zonas operacionais por SKU** alimentadas por motor event-driven:

| Zona        | Condição de saldo                         | E-commerce (B2C)                                                 | Balcão / Atendimento (B2B)                                                                                |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 🟢 Verde    | `saldo > alertThreshold`                  | Vende normalmente                                                | Vende normalmente                                                                                         |
| 🟡 Amarela  | `blockThreshold < saldo ≤ alertThreshold` | Vende + selo "Estoque baixo"                                     | Vende + alerta visual no card do produto; notificação preventiva a gestor e fornecedor                    |
| 🔴 Vermelha | `saldo ≤ blockThreshold`                  | **Trava hard** — produto vira "Sob consulta", remove do carrinho | **Soft com fricção** — exige justificativa obrigatória e dispara solicitação de override ao gestor remoto |

Parametrização em **três níveis com herança** (global → marca → SKU), motor de eventos central com idempotência e throttle, cadastro de fornecedor por marca com canais de notificação (e-mail + WhatsApp), e auditoria integral de toda decisão.

### Analogia operacional

Funciona como um caixa eletrônico bancário. Quando o saldo da agência baixa de um patamar, o sistema **avisa o gerente** (zona amarela = Ponto de Alerta). Quando chega no mínimo absoluto, ele **bloqueia operações de risco** e só libera com **aprovação do gerente regional** (zona vermelha = Ponto de Bloqueio + override). Toda liberação fica auditada. A diferença é que aqui o "gerente regional" é o Owner da loja e a "operação de risco" é a venda da peça.

### Alternativas Consideradas

| Alternativa                                                              | Por que foi descartada                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reaproveitar o esqueleto do PRD-052 e adicionar a regra crítica lá       | PRD-052 é vista executiva de BI (curva de giro, sugestões comerciais), não motor operacional. Misturar BI com regra crítica diluiria responsabilidade e dificultaria evolução                    |
| Hard block para todos os canais (incluindo balcão)                       | Cliente B2B com relacionamento espera flexibilidade; trava total no balcão geraria perda de venda e atrito com vendedor. Soft com justificativa obrigatória mantém controle sem matar a operação |
| Notificar fornecedor apenas por e-mail                                   | E-mail tem taxa de abertura baixa em ambiente comercial diesel; WhatsApp tem leitura praticamente garantida. Como já temos PRD-101 no roadmap, vale aproveitar                                   |
| Aprovação por senha do gestor in-loco (modal no dispositivo do vendedor) | Pressupõe gestor fisicamente presente. Em horário comercial expandido (sábado, fim de tarde), o gestor pode estar fora. Aprovação remota in-app cobre os dois cenários (presente e remoto)       |
| Parametrização por SKU manual (sem herança)                              | 500 modelos × parametrização individual é inviável operacionalmente. Herança global → marca → SKU permite configurar tudo em poucos passos e refinar pontualmente                                |

---

## Escopo

### Incluído

- ✅ Entidade `StockPolicy` com escopo global, por marca ou por SKU (herança em cascata)
- ✅ Tela `/app/configuracoes/estoque-critico/politicas` (Owner) para configurar políticas com preview de impacto antes de salvar
- ✅ Entidade `Supplier` com canais de notificação (e-mail + WhatsApp) associada a uma ou mais marcas
- ✅ Tela `/app/configuracoes/fornecedores` (Owner) para CRUD de fornecedores
- ✅ Motor event-driven que escuta `inventory.changed` e emite `inventory.low_stock`, `inventory.blocked`, `inventory.recovered`
- ✅ Cálculo automático da zona do SKU (`green` | `yellow` | `red`) com cache em `SkuStockStatus`
- ✅ Bloqueio hard de SKUs em zona vermelha no e-commerce (`/loja/p/:produto` e carrinho)
- ✅ Fluxo soft no balcão com modal de justificativa obrigatória e solicitação de override
- ✅ Tela `/app/aprovacoes-estoque` (Owner) para gerenciar pendências de override
- ✅ Push notification + e-mail ao Owner quando um override é solicitado
- ✅ Expiração automática de solicitações de override após janela configurável
- ✅ Notificação ao fornecedor por e-mail (template HTML) em eventos `low_stock` e `blocked`
- ✅ Notificação ao fornecedor por WhatsApp via template Meta pré-aprovado (depende PRD-101)
- ✅ Throttle de notificações: agrega múltiplos eventos do mesmo fornecedor em janela configurável
- ✅ Trilha de auditoria completa em `StockOverrideLog`, `StockPolicyChangeLog`, `StockNotificationLog`
- ✅ Tela `/app/gestao/estoque/auditoria` (Owner) com filtros e export CSV

### Excluído

- ❌ Predição de demanda ou sugestão automática de quantidade de reposição (fica em PRD futuro de IA Analítica — PRD-053)
- ❌ Geração automática de pedido de compra ao fornecedor (apenas notificação; pedido permanece manual no DINTEC)
- ❌ Reserva de estoque por orçamento aberto (mantém comportamento atual do DINTEC — pedido firme reserva, orçamento não)
- ❌ Aplicação da regra a categorias além de Filtros no MVP deste PRD (extensão futura)
- ❌ Portal próprio do fornecedor para visualizar histórico de alertas (decartado na fase de definição)
- ❌ Override por senha de gestor in-loco ou MFA por SMS (descartado em favor de aprovação remota in-app)
- ❌ Override automático por "vendedor sênior" com poder próprio (toda venda em zona vermelha exige aprovação)
- ❌ Notificação ao cliente final quando peça volta a ficar disponível (extensão futura, listada como decisão pendente)

---

## Requisitos Funcionais

### Parametrização de Políticas

- **RF-001:** O sistema deve manter políticas de estoque crítico (`StockPolicy`) com escopo `global`, `brand` (por marca de peça) ou `sku` (por SKU específico).
- **RF-002:** Cada política deve conter, no mínimo: `alertThreshold` (zona amarela), `blockThreshold` (zona vermelha) e `safetyFloor` (piso absoluto abaixo do qual nem override é permitido).
- **RF-003:** O sistema deve aplicar herança em cascata na avaliação de um SKU: prioridade `sku > brand > global`. Se um SKU não tem política própria, herda da sua marca; se a marca não tem, herda da global.
- **RF-004:** A tela de políticas (`/app/configuracoes/estoque-critico/politicas`) deve permitir CRUD apenas para perfil Owner, conforme regras de RBAC do PRD-007.
- **RF-005:** Antes de salvar uma política, o sistema deve apresentar **preview de impacto**: quantos SKUs ficarão em zona verde, amarela e vermelha imediatamente após a aplicação, com base no saldo atual.
- **RF-006:** Toda alteração de política deve gerar registro em `StockPolicyChangeLog` com `changedBy`, `changedAt`, `scopeBefore`, `scopeAfter` e `justification` (campo livre, opcional).
- **RF-007:** O sistema deve permitir edição em lote de políticas filtrando por marca, categoria ou faixa de giro (aplicar nova política a múltiplos SKUs simultaneamente).
- **RF-008:** Toda política deve ter validação: `alertThreshold ≥ blockThreshold ≥ safetyFloor ≥ 0`. Tentativa de salvar valores inconsistentes deve bloquear o submit com mensagem clara.

### Cadastro de Fornecedor

- **RF-010:** O sistema deve manter cadastro de fornecedores (`Supplier`) com campos: `name`, `contactName`, `contactEmail`, `contactWhatsapp`, `notificationLocale`, `active` e relação N:N com marcas.
- **RF-011:** A tela de fornecedores (`/app/configuracoes/fornecedores`) deve permitir CRUD apenas para perfil Owner.
- **RF-012:** O sistema deve validar formato de e-mail e número de WhatsApp (padrão internacional com DDI) no submit.
- **RF-013:** Uma marca pode estar associada a um ou mais fornecedores. Quando há múltiplos fornecedores para a mesma marca, todos recebem a notificação simultaneamente.
- **RF-014:** Fornecedor inativo (`active=false`) não recebe notificações, mas permanece visível no histórico de auditoria.

### Motor de Eventos e Cálculo de Zona

- **RF-020:** O sistema deve escutar o evento `inventory.changed` (emitido por qualquer movimentação: venda na plataforma GALLO, devolução, ajuste manual ou **importação CSV diária do DINTEC via PRD-129**).
- **RF-021:** Para cada SKU afetado, o motor deve recalcular a zona corrente comparando `currentQty` contra a política aplicável (após herança).
- **RF-022:** O resultado deve ser persistido em `SkuStockStatus` com `currentQty`, `zone`, `isBlocked`, `lastEvaluatedAt` e `policySnapshot` (snapshot da política usada, para fins de auditoria).
- **RF-023:** Sempre que houver **transição de zona** (e somente nessas transições), o motor deve emitir o evento derivado correspondente: `inventory.low_stock` (verde → amarela), `inventory.blocked` (qualquer zona → vermelha) ou `inventory.recovered` (vermelha/amarela → verde).
- **RF-024:** O motor deve ser idempotente: dois eventos `inventory.changed` consecutivos sem mudança de zona não devem disparar notificações duplicadas.
- **RF-025:** O motor deve garantir ordem de processamento por SKU. Eventos do mesmo SKU não podem ser processados em paralelo (evita race condition no cálculo de zona).

### Bloqueio no E-commerce

- **RF-030:** Quando um SKU está em zona vermelha (`isBlocked=true`), a ficha do produto (`/loja/p/:produto`) deve exibir o produto com indicação visual clara "Sob consulta" e desabilitar o botão "Adicionar ao carrinho".
- **RF-031:** O e-commerce deve oferecer formulário de contato no lugar do botão de compra, capturando nome, e-mail/WhatsApp e quantidade desejada. Submissão gera lead no PRD-017 com tag "demanda reprimida".
- **RF-032:** Se um SKU em zona vermelha já estiver em carrinhos abertos de clientes B2C, o sistema deve remover automaticamente e notificar o cliente na próxima visita ao carrinho.
- **RF-033:** Resultados de busca (`/loja/buscar`) e listagens de categoria (`/loja/c/:categoria`) devem continuar exibindo o SKU em zona vermelha, mas com o selo "Sob consulta" e sem CTA de compra direto.

### Bloqueio Soft no Balcão

- **RF-040:** Quando um vendedor adiciona um SKU em zona vermelha a um orçamento ou pedido (PRD-031, PRD-032), o sistema deve exibir modal de fricção contendo: saldo atual, política aplicada (limiares), e dois campos obrigatórios — `justificativa` (texto livre, mínimo 20 caracteres) e `urgência` (`baixa | média | alta | emergência`).
- **RF-041:** Ao confirmar, o sistema deve criar uma `StockOverrideRequest` com status `pending` e bloquear a efetivação do item no orçamento/pedido até decisão do gestor.
- **RF-042:** O item bloqueado deve aparecer no orçamento/pedido com indicação visual "Aguardando aprovação" e o vendedor pode prosseguir com os demais itens sem bloqueio.
- **RF-043:** Se o saldo do SKU está abaixo do `safetyFloor` (não apenas abaixo do `blockThreshold`), o sistema deve impedir o submit do override e exibir mensagem "Saldo abaixo do piso de segurança absoluto — venda não permitida". Nesse cenário, apenas reposição libera o item.

### Fluxo de Aprovação Remota

- **RF-050:** Toda `StockOverrideRequest` criada deve disparar simultaneamente: push notification in-app ao(s) Owner(s) da loja, e-mail ao Owner principal, e badge de contador na sidebar (item "Aprovações").
- **RF-051:** A tela `/app/aprovacoes-estoque` (Owner) deve listar todas as solicitações `pending` com: SKU, marca, saldo atual, política aplicada, qty solicitada, cliente, vendedor solicitante, justificativa, urgência, tempo desde criação e tempo restante até expiração.
- **RF-052:** O Owner pode aprovar ou negar cada solicitação individualmente. Em ambos os casos é obrigatório informar `decisionReason` (texto livre, mínimo 10 caracteres).
- **RF-053:** Ao aprovar, o sistema deve atualizar a `StockOverrideRequest` para status `approved`, registrar `approverUserId` e `approvedAt`, e liberar o item no orçamento/pedido original.
- **RF-054:** Ao negar, o sistema deve atualizar para status `denied`, registrar `deniedReason` e remover o item do orçamento/pedido (notificando o vendedor).
- **RF-055:** Solicitações não respondidas em `overrideExpiryMinutes` (configurável globalmente, default 120 minutos) devem ser automaticamente movidas para status `expired` e o vendedor notificado.
- **RF-056:** O vendedor deve receber notificação push + in-app do resultado (aprovado, negado ou expirado) em até 5 segundos após a decisão.
- **RF-057:** Toda decisão de override deve gerar registro em `StockOverrideLog` (imutável, append-only).

### Notificação Multi-canal a Fornecedor

- **RF-060:** Quando o motor emite `inventory.low_stock` ou `inventory.blocked`, o sistema deve identificar o(s) fornecedor(es) ativo(s) associado(s) à marca do SKU.
- **RF-061:** Para cada fornecedor identificado, o sistema deve enfileirar uma notificação por **cada canal habilitado** (e-mail sempre; WhatsApp se o fornecedor tem `contactWhatsapp` cadastrado e o PRD-101 está disponível).
- **RF-062:** O sistema deve aplicar **throttle de agregação**: eventos do mesmo fornecedor recebidos dentro da janela `supplierNotificationThrottleMinutes` (configurável, default 30 minutos) devem ser consolidados em um único disparo.
- **RF-063:** O e-mail ao fornecedor deve usar template HTML brandado GALLO contendo: lista de SKUs em alerta/bloqueio, saldos atuais, sugestão de quantidade mínima de reposição (campo configurável por SKU, default = `alertThreshold × 2`), e call-to-action para responder confirmando prazo de entrega.
- **RF-064:** A mensagem WhatsApp ao fornecedor deve usar template Meta pré-aprovado contendo placeholders compatíveis com o conteúdo do e-mail. Texto livre é proibido (restrição Cloud API).
- **RF-065:** Toda tentativa de envio (sucesso ou falha) deve gerar registro em `StockNotificationLog` com `channel`, `recipientId`, `payload`, `sentAt`, `delivered`, `error`.
- **RF-066:** Falha de entrega não deve interromper o fluxo. O sistema deve registrar o erro e tentar novamente automaticamente até 3 vezes com backoff exponencial. Após a terceira tentativa, escala como notificação interna ao Owner.

### Auditoria e Visualização

- **RF-070:** A tela `/app/gestao/estoque/auditoria` (Owner) deve exibir, em abas separadas: histórico de overrides, histórico de mudanças de política, histórico de notificações enviadas.
- **RF-071:** Cada aba deve permitir filtros por: período (data inicial/final), SKU, marca, fornecedor (quando aplicável), usuário (quando aplicável) e status/resultado.
- **RF-072:** Cada aba deve permitir export em CSV dos registros filtrados.
- **RF-073:** A tela de auditoria deve carregar de forma paginada (50 registros por página) para não comprometer performance com históricos longos.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance — motor):** O recálculo de zona de um SKU após `inventory.changed` deve completar em até 500ms p95. A emissão do evento derivado deve ocorrer em até 1s p95.
- **RNF-002 (Performance — UI):** Telas de configuração e auditoria devem renderizar primeira interação em até 2s em conexão 4G.
- **RNF-003 (Confiabilidade):** O motor deve ser at-least-once: nenhum evento `inventory.changed` pode ser perdido, ainda que ao custo de processar duplicatas (garantia de idempotência via RF-024).
- **RNF-004 (Auditabilidade):** Todo log (`StockOverrideLog`, `StockPolicyChangeLog`, `StockNotificationLog`) é imutável após criação (append-only). Edição ou exclusão direta no banco é proibida.
- **RNF-005 (Segurança):** Acesso às telas de configuração e auditoria deve ser restrito ao perfil Owner via RBAC do PRD-007. Tentativa de acesso por outro perfil retorna 403 com log de tentativa em auditoria geral.
- **RNF-006 (Compatibilidade — frontend):** Telas devem suportar Chrome, Firefox, Safari, Edge nas versões current/current-1 e responsivo até viewport mínimo de 360px.
- **RNF-007 (Internacionalização):** Templates de e-mail e WhatsApp devem usar `Supplier.notificationLocale` para escolha de idioma (no MVP apenas `pt-BR`, mas estrutura preparada).
- **RNF-008 (Observabilidade):** O motor deve expor métricas: contagem de eventos por tipo, tempo médio de recálculo, taxa de falha de notificação, número de overrides pendentes/aprovados/negados/expirados por dia.

---

## Critérios de Aceitação

### RF-005: Preview de Impacto ao Salvar Política

```gherkin
DADO que o Owner está na tela de políticas
  E existem 500 SKUs de filtros distribuídos em diversas marcas
  E o Owner alterou o alertThreshold global de 7 para 10
QUANDO o Owner clica em "Visualizar Impacto"
ENTÃO o sistema exibe um resumo:
  "Após aplicação: 320 SKUs em verde, 140 em amarela, 40 em vermelha"
  E exibe lista expandível dos SKUs que mudaram de zona
  E só permite "Confirmar e Salvar" após o Owner visualizar o preview
```

### RF-023: Transição de Zona Emite Evento

```gherkin
DADO que o SKU "FILTRO-MANN-WK1234" tem saldo de 8 unidades (zona verde)
  E a política aplicável tem alertThreshold=7 e blockThreshold=5
QUANDO uma venda reduz o saldo para 6 unidades
ENTÃO o motor recalcula a zona como "amarela"
  E emite o evento inventory.low_stock
  E persiste SkuStockStatus com zone="yellow" e isBlocked=false
  E aciona o fluxo de notificação a gestor e fornecedor
```

### RF-030: Bloqueio Hard no E-commerce

```gherkin
DADO que o SKU "FILTRO-WEGA-WO230" está em zona vermelha (isBlocked=true)
QUANDO um cliente B2C acessa /loja/p/filtro-wega-wo230
ENTÃO o produto é exibido com selo "Sob consulta"
  E o botão "Adicionar ao carrinho" está desabilitado
  E em seu lugar aparece formulário de contato com campos nome, e-mail/WhatsApp e quantidade
  E ao submeter o formulário, é criado um lead na pipeline (PRD-017) com tag "demanda reprimida"
```

### RF-040 + RF-050: Solicitação de Override no Balcão

```gherkin
DADO que o vendedor "João" está editando um orçamento (PRD-031)
  E adiciona o SKU "FILTRO-MAHLE-OX123" ao orçamento
  E o SKU está em zona vermelha com saldo 4 e blockThreshold 5
QUANDO João clica em "Adicionar"
ENTÃO o sistema exibe modal de fricção com saldo, política aplicada
  E exige preenchimento de justificativa (mín 20 caracteres) e urgência
  E ao confirmar, cria StockOverrideRequest com status="pending"
  E dispara push notification e e-mail ao Owner
  E o item aparece no orçamento com "Aguardando aprovação"
  E João pode prosseguir com outros itens do orçamento
```

### RF-043: Saldo Abaixo do Piso Absoluto

```gherkin
DADO que o SKU "FILTRO-BOSCH-F002H10322" tem saldo 0 e safetyFloor=1
  E o vendedor tenta adicionar este SKU a um pedido
QUANDO o vendedor confirma a adição no modal de fricção
ENTÃO o sistema rejeita o submit
  E exibe mensagem: "Saldo abaixo do piso de segurança absoluto — venda não permitida. Aguarde reposição."
  E nenhuma StockOverrideRequest é criada
  E nenhuma notificação adicional é disparada
```

### RF-055: Expiração de Solicitação

```gherkin
DADO que existe uma StockOverrideRequest com status="pending"
  E foi criada há 121 minutos
  E overrideExpiryMinutes está configurado como 120
QUANDO o job de varredura periódica executa
ENTÃO a solicitação é marcada como status="expired"
  E o vendedor solicitante recebe notificação push + in-app
  E o item é removido do orçamento/pedido original
  E o registro é preservado em StockOverrideLog para auditoria
```

### RF-062: Throttle de Notificação a Fornecedor

```gherkin
DADO que o fornecedor "Mann Filter Brasil" está cadastrado para a marca Mann
  E o sistema dispara inventory.low_stock para 5 SKUs Mann em 10 minutos
  E supplierNotificationThrottleMinutes está configurado como 30
QUANDO o motor processa os 5 eventos
ENTÃO apenas 1 notificação consolidada é enviada ao fornecedor
  E essa notificação contém os 5 SKUs listados
  E o log registra 1 entrada de envio com payload contendo os 5 SKUs
```

### Cenários de Erro

```gherkin
DADO que o sistema tenta enviar e-mail ao fornecedor
  E o servidor SMTP está indisponível
QUANDO o disparo falha 3 vezes consecutivas (com backoff)
ENTÃO o sistema marca a notificação como "failed" em StockNotificationLog
  E gera notificação in-app ao Owner: "Falha ao notificar fornecedor X — verificar e reagendar"
  E não bloqueia o motor de continuar processando outros eventos
```

```gherkin
DADO que o Owner tenta salvar uma política com alertThreshold=3 e blockThreshold=5
QUANDO o Owner clica em "Salvar"
ENTÃO o sistema rejeita o submit
  E exibe mensagem clara: "O Ponto de Alerta deve ser maior ou igual ao Ponto de Bloqueio"
  E destaca os campos inconsistentes
```

---

## Fases de Implementação

| Fase | Objetivo                                                                                         | Arquivos Estimados |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------ |
| 1    | Esqueleto navegável (incorporado ao PRD-052) — telas de política e fornecedor com dados mockados | 8                  |
| 2    | Motor event-driven + cálculo de zona + tabelas de estado (depende de PRD-110 / DINTEC)           | 12                 |
| 3    | Fluxo soft no balcão + tela de aprovações + notificações in-app ao Owner                         | 10                 |
| 4    | Bloqueio hard no e-commerce + formulário de demanda reprimida                                    | 6                  |
| 5    | Notificação ao fornecedor por e-mail e WhatsApp (depende PRD-101) + auditoria + export           | 12                 |

### Detalhamento das Fases

#### Fase 1: Esqueleto Navegável (Frontend First, integrado ao PRD-052)

**Objetivo:** Validar visualmente com o cliente o modelo de parametrização e cadastro de fornecedor antes de investir no motor real.

**Ações:**

- [ ] Criar mock provider `criticalStockProvider` em `src/mocks/` retornando políticas, fornecedores e status fictícios
- [ ] Construir tela `/app/configuracoes/estoque-critico/politicas` com listagem, edição e preview de impacto sobre dados mockados
- [ ] Construir tela `/app/configuracoes/fornecedores` com CRUD básico sobre dados mockados
- [ ] Construir tela `/app/aprovacoes-estoque` com lista vazia + estado "sem pendências" + exemplo mockado de pendência
- [ ] Adicionar selos visuais "Estoque baixo" e "Sob consulta" em mocks do catálogo e e-commerce
- [ ] Documentar no PRD-052 a delimitação clara entre BI (PRD-052) e operação crítica (PRD-150)

**Validação:** Cliente Gallo navega por todas as telas, valida UX e aprova prosseguir para Fase 2.

#### Fase 2: Motor e Cálculo de Zona

**Objetivo:** Implementar o coração do sistema — leitura real do DINTEC, cálculo de zona com herança, emissão de eventos derivados.

**Ações:**

- [ ] Criar tabelas: `stock_policies`, `suppliers`, `suppliers_brands`, `sku_stock_status`
- [ ] Implementar serviço `criticalStockService` com método `evaluateZone(sku)` e cache em `SkuStockStatus`
- [ ] Implementar listener de `inventory.changed` (vindo de PRD-110)
- [ ] Implementar emissão de `inventory.low_stock`, `inventory.blocked`, `inventory.recovered`
- [ ] Implementar idempotência (não duplicar eventos para mesma transição)
- [ ] Substituir mock provider da Fase 1 pelo serviço real (manter switch via `VITE_DATA_SOURCE`)

**Validação:** Movimentar saldo manualmente em ambiente de homologação e verificar que zonas mudam corretamente e eventos são emitidos sem duplicação.

#### Fase 3: Soft Block no Balcão + Aprovação Remota

**Objetivo:** Plugar o motor ao fluxo de orçamento/pedido e habilitar o ciclo completo de override.

**Ações:**

- [ ] Adicionar interceptor em PRD-031 e PRD-032 que detecta tentativa de incluir SKU em zona vermelha
- [ ] Construir modal de fricção com justificativa e urgência
- [ ] Criar tabela `stock_override_requests` e `stock_override_log`
- [ ] Implementar push notification + e-mail ao Owner via serviço de notificações
- [ ] Implementar tela `/app/aprovacoes-estoque` com listagem, filtros e ações
- [ ] Implementar job de expiração com cron job (`overrideExpiryMinutes`)
- [ ] Implementar notificação ao vendedor sobre resultado

**Validação:** Vendedor de teste tenta vender SKU em zona vermelha, completa modal, Owner aprova/nega, item flui no orçamento. Testar também caminhos de expiração e negação.

#### Fase 4: Hard Block no E-commerce

**Objetivo:** Garantir que cliente B2C nunca chega ao checkout com SKU bloqueado.

**Ações:**

- [ ] Adicionar verificação de `isBlocked` na ficha de produto, carrinho e checkout (PRD-063, PRD-064)
- [ ] Construir formulário de "demanda reprimida" com captura de contato
- [ ] Integrar com PRD-017 (pipeline de leads) gerando lead com tag específica
- [ ] Implementar remoção automática de itens bloqueados de carrinhos abertos
- [ ] Notificar cliente na próxima visita ao carrinho sobre a remoção

**Validação:** Marcar SKU em zona vermelha em homologação e tentar fluxo de compra B2C. Confirmar que carrinho não permite checkout e lead é criado.

#### Fase 5: Notificação a Fornecedor + Auditoria

**Objetivo:** Fechar o ciclo notificando o elo externo (fornecedor) e entregar visibilidade total ao gestor.

**Ações:**

- [ ] Implementar template HTML de e-mail brandado GALLO
- [ ] Integrar com provider de e-mail transacional (Resend ou similar)
- [ ] Submeter template WhatsApp à aprovação Meta (depende PRD-101)
- [ ] Implementar disparo via Cloud API quando template aprovado
- [ ] Implementar throttle de agregação por fornecedor
- [ ] Implementar retry com backoff exponencial e fallback ao Owner
- [ ] Construir tela `/app/gestao/estoque/auditoria` com 3 abas, filtros e export CSV

**Validação:** Forçar eventos em ambiente de homologação, confirmar disparo correto nos dois canais, validar throttle, validar export CSV completo.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                           | Status                                                 |
| ------- | --------------------------------------------------- | ------------------------------------------------------ |
| PRD-007 | RBAC, papéis e auditoria transversal                | ✅ Concluído                                           |
| PRD-019 | Configurações Admin (parametrizações da plataforma) | ✅ Concluído                                           |
| PRD-030 | Catálogo de Produtos (visão interna)                | ✅ Concluído                                           |
| PRD-031 | Orçamento                                           | ✅ Concluído                                           |
| PRD-032 | Pedido                                              | ✅ Concluído                                           |
| PRD-017 | Pipeline de Leads                                   | ✅ Concluído                                           |
| PRD-052 | Estoque com Curadoria Comercial (esqueleto)         | ⏳ Pendente (Fase 1) — esqueleto deste PRD entra junto |
| PRD-063 | Ficha de Produto (e-commerce)                       | ⏳ Pendente                                            |
| PRD-064 | Carrinho e Checkout                                 | ⏳ Pendente                                            |
| PRD-101 | Integração WhatsApp Cloud API (Fase 2)              | ⏳ Pendente — bloqueante para canal WhatsApp           |
| PRD-110 | Integração DINTEC (leitura — Fase 2)                | ⏳ Pendente — bloqueante para saldo real               |

### Serviços Externos

| Serviço                                                       | Tipo                    | Status                 |
| ------------------------------------------------------------- | ----------------------- | ---------------------- |
| DINTEC (ERP — saldo de estoque)                               | API / leitura de banco  | A configurar (PRD-110) |
| WhatsApp Cloud API (Meta)                                     | API outbound + template | A configurar (PRD-101) |
| Provider de e-mail transacional (Resend, SendGrid ou similar) | API outbound            | A definir e configurar |

### Decisões Pendentes

- [ ] **Tempo de expiração padrão de override** — proposta inicial 120 minutos. Validar com Gallo se faz sentido operacional (e.g., expediente de 8h — talvez 30 min seja mais adequado para gestor reativo).
- [ ] **Fallback de aprovação quando há múltiplos Owners** — proposta: notificar todos simultaneamente; primeiro a decidir prevalece. Confirmar.
- [ ] **Comportamento em kits / combos** — se um kit contém um filtro em zona vermelha, o kit inteiro vira "sob consulta"? Proposta: sim, com mensagem específica indicando qual item bloqueou.
- [ ] **Notificação ao cliente B2C quando peça volta a ficar disponível** — fora de escopo do MVP deste PRD; aguarda decisão futura.
- [ ] **Auditoria de modificações no `Supplier`** — incluída em `StockPolicyChangeLog` ou tabela própria `SupplierChangeLog`? Recomendação: tabela própria, para separar concerns.

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 8 — Operações Críticas (Fase 2)"** e tem caráter terminal: não bloqueia outros PRDs.

| Ordem | PRD         | Título                                               | Status       | Relação                                  |
| ----- | ----------- | ---------------------------------------------------- | ------------ | ---------------------------------------- |
| 1     | PRD-101     | Integração WhatsApp Cloud API                        | ⏳ Pendente  | Base — habilita canal de notificação     |
| 2     | PRD-110     | Integração DINTEC (leitura)                          | ⏳ Pendente  | Base — fornece saldo real                |
| 3     | PRD-052     | Estoque com Curadoria Comercial (esqueleto)          | ⏳ Pendente  | Convive — BI ao lado da operação crítica |
| **4** | **PRD-150** | **Gestão Crítica de Estoque de Itens Stop-the-Line** | **🔄 ATUAL** | Depende dos anteriores                   |

> **Nota:** A Fase 1 deste PRD (esqueleto navegável) pode ser entregue junto com o PRD-052 sem aguardar PRD-101 e PRD-110, desde que toda a integração com dados reais fique explicitamente flagada como "mock-only" até a Fase 2.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado                                          | Classificação | Proteção                                                                                                            |
| --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| E-mail e WhatsApp de fornecedor               | PII de B2B    | Armazenado em coluna criptografada; acesso restrito a Owner; auditoria de visualização                              |
| Justificativa de override (texto livre)       | Operacional   | Pode conter nome de cliente final — acesso restrito a Owner; redação livre permitida mas log permanente             |
| Saldo de estoque por SKU                      | Confidencial  | Acesso a `currentQty` exato restrito a perfis internos. E-commerce nunca expõe número exato, apenas disponibilidade |
| Razão de aprovação/negação (`decisionReason`) | Operacional   | Mesma classificação da justificativa                                                                                |

### Autenticação e Autorização

- Toda tela deste módulo (`/app/configuracoes/estoque-critico/*`, `/app/configuracoes/fornecedores`, `/app/aprovacoes-estoque`, `/app/gestao/estoque/auditoria`) requer perfil **Owner** conforme RBAC do PRD-007.
- O fluxo de override no balcão (RF-040) é acessível a perfil **Vendedor**, mas a decisão final permanece restrita a Owner.
- Tentativas de acesso não autorizado devem retornar HTTP 403 e gerar registro em log geral de auditoria.

### Auditoria

Três trilhas distintas (todas append-only, imutáveis após criação):

1. **`StockOverrideLog`** — toda solicitação de override e sua decisão final (incluindo `expired`).
2. **`StockPolicyChangeLog`** — toda criação, alteração e remoção de política.
3. **`StockNotificationLog`** — toda tentativa de envio de notificação, com payload, canal, resultado.

Retenção mínima: 5 anos (compatível com exigências contábeis e de relacionamento comercial B2B).

---

## Fluxos de Usuário

### Fluxo Principal — Cliente B2C tenta comprar peça bloqueada

```
[Cliente B2C] ──▶ Busca filtro no e-commerce
              ──▶ Acessa ficha do produto
              ──▶ Vê selo "Sob consulta" + formulário de contato
              ──▶ Preenche formulário
              ──▶ Sistema cria lead "demanda reprimida"
              ──▶ Vendedor entra em contato fora do fluxo automático
```

### Fluxo Principal — Vendedor com SKU bloqueado no balcão

```
[Vendedor] ──▶ Adiciona SKU ao orçamento
           ──▶ Sistema detecta zona vermelha
           ──▶ Modal de fricção (justificativa + urgência)
           ──▶ Vendedor preenche e confirma
           ──▶ Item aparece como "Aguardando aprovação"
           ──▶ Owner recebe push + e-mail
           ──▶ Owner aprova/nega em /app/aprovacoes-estoque
           ──▶ Vendedor recebe resultado
           ──▶ Item é liberado ou removido do orçamento
```

### Fluxo de Notificação a Fornecedor

```
[Movimentação] ──▶ inventory.changed emitido
               ──▶ Motor recalcula zona do SKU afetado
               ──▶ Detecta transição verde→amarela
               ──▶ Emite inventory.low_stock
               ──▶ Identifica fornecedores da marca
               ──▶ Aplica throttle (já há disparo nos últimos 30min para este fornecedor?)
               ──▶ Enfileira disparo (e-mail + WhatsApp)
               ──▶ Worker processa fila
               ──▶ Log de cada envio em StockNotificationLog
```

### Fluxos de Exceção

**Override expirado:**

```
[StockOverrideRequest pending] ──▶ Job cron varre solicitações > 120min
                              ──▶ Marca como expired
                              ──▶ Remove item do orçamento original
                              ──▶ Notifica vendedor (push + in-app)
                              ──▶ Vendedor pode reabrir nova solicitação se desejar
```

**Saldo abaixo do piso de segurança absoluto:**

```
[Vendedor] ──▶ Tenta adicionar SKU com saldo 0 (safetyFloor=1)
           ──▶ Modal de fricção é exibido
           ──▶ Vendedor preenche e tenta submeter
           ──▶ Sistema rejeita: "Saldo abaixo do piso absoluto"
           ──▶ Nenhuma StockOverrideRequest é criada
           ──▶ Item simplesmente não pode ser vendido até reposição
```

### Fluxos de Erro

**Falha de envio ao fornecedor:**

```
[Sistema] ──▶ Tenta enviar e-mail
          ──▶ SMTP retorna erro
          ──▶ Aguarda backoff (10s, 60s, 5min)
          ──▶ Tenta 3 vezes
          ──▶ Após 3ª falha: marca como "failed" + notifica Owner in-app
          ──▶ Owner pode reagendar manualmente em /app/gestao/estoque/auditoria
```

---

### Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                | Convenção                                                | Exemplo                                                     |
| ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| **Componentes React**   | PascalCase                                               | `StockPolicyEditor.tsx`, `OverrideRequestModal.tsx`         |
| **Hooks**               | camelCase + `use`                                        | `useStockPolicy.ts`, `useOverrideQueue.ts`                  |
| **Services**            | camelCase + `Service`                                    | `criticalStockService.ts`, `supplierNotificationService.ts` |
| **Pastas**              | kebab-case                                               | `src/features/critical-stock/`                              |
| **Variáveis/Funções**   | camelCase                                                | `currentZone`, `evaluateZone()`                             |
| **Constantes**          | UPPER_SNAKE_CASE                                         | `DEFAULT_OVERRIDE_EXPIRY_MIN`, `MAX_NOTIFICATION_RETRIES`   |
| **Interfaces**          | PascalCase + `I`                                         | `IStockPolicy`, `ISupplier`, `IStockOverrideRequest`        |
| **Tabelas (banco)**     | snake_case (plural)                                      | `stock_policies`, `stock_override_requests`                 |
| **Colunas (banco)**     | snake_case                                               | `alert_threshold`, `safety_floor`                           |
| **Env vars (frontend)** | `VITE_` prefix                                           | `VITE_DATA_SOURCE`, `VITE_DEFAULT_THROTTLE_MIN`             |
| **Git commits**         | Conventional Commits                                     | `feat(critical-stock):`, `fix(override):`                   |
| **Estrutura de pastas** | Feature-based                                            | `src/features/critical-stock/{components,hooks,services}`   |
| **Imports**             | Ordem: React → libs → components → hooks → utils → types | —                                                           |
| **Ícones**              | Iconify (`@iconify/react`)                               | `<Icon icon="mdi:alert-octagon" />`                         |
| **Tema**                | Light + Dark obrigatório                                 | CSS variables para cores                                    |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.5 operando via Claude Code CLI v2.1.3. Este PRD foi criado pelo Agente Arquiteto (Claude Opus 4.5 na plataforma web).

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Atualizar o registro de versão no banco de dados (se aplicável)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-150-estoque-critico-filtros_DONE.md`
> - Atualizar a seção "Status de Implementação" com:
>   - Status: ✅ IMPLEMENTADO
>   - Data de Implementação
>   - Versão do App após implementação
>   - Observações relevantes

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 1.0.0 → 1.0.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinome sugerido:** `Sentinel` (para a versão MINOR que entrega este PRD — evoca a função de vigia automatizada do estoque crítico).

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar:

- **Added** — novas funcionalidades
- **Changed** — mudanças em funcionalidades existentes
- **Deprecated** — funcionalidades que serão removidas
- **Removed** — funcionalidades removidas
- **Fixed** — correções de bugs
- **Security** — correções de vulnerabilidades

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio                        | Descrição                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Idempotência primeiro**        | Toda operação do motor deve poder ser reexecutada sem efeitos colaterais (sem dupla notificação) |
| **Auditoria sempre append-only** | Logs nunca são editados ou deletados, apenas inseridos                                           |
| **Fail gracefully**              | Falha de notificação a fornecedor não pode bloquear a operação comercial                         |
| **Preservar evidências**         | Mesmo solicitações expiradas ficam registradas para análise post-mortem                          |
| **Testar incrementalmente**      | Validar cada fase em homologação com dados reais antes de prosseguir                             |
| **Documentar decisões**          | Registrar no CHANGELOG o motivo de cada limiar default escolhido                                 |
| **Frontend First**               | Fase 1 (esqueleto) entrega valor de validação antes de qualquer linha de backend                 |

### Orientações Gerais

| Aspecto                                  | Orientação                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Motor de eventos**                     | Considerar fila com garantia at-least-once (e.g., Supabase Queues ou tabela `event_outbox` própria) — não usar in-memory sem persistência                               |
| **Cálculo de herança**                   | Cachear política aplicável por SKU em `SkuStockStatus.policySnapshot` no momento do recálculo. Mudança de política dispara recálculo em massa via job em background     |
| **Templates de e-mail**                  | Construir com biblioteca like react-email + MJML para garantir renderização consistente em clients corporativos (Outlook, Gmail web)                                    |
| **Templates WhatsApp**                   | Submeter à Meta com placeholders genéricos (`{{1}}`, `{{2}}` etc.) e versionar a aprovação. Mudança no template exige nova aprovação                                    |
| **Throttle**                             | Implementar com chave `(supplier_id, window_start)` em tabela ou cache Redis. Janela rolante é mais cara; janela fixa (cada 30min completo) é mais simples e suficiente |
| **Cron de expiração**                    | Executar a cada 1 minuto, varrer solicitações `pending` com `created_at < now() - overrideExpiryMinutes`                                                                |
| **Estado do orçamento durante override** | Manter o item visível mas com flag `is_pending_approval`. Não alterar valores do orçamento. Após aprovação, valores são confirmados                                     |
| **Acessibilidade**                       | Modal de fricção deve ser plenamente operável por teclado e leitor de tela (regulação interna de software corporativo)                                                  |

### O que NÃO Fazer

| ❌ Evitar                                                                                         |
| ------------------------------------------------------------------------------------------------- |
| Hardcode dos limiares default (7, 5) no código — sempre vir de configuração (PRD-019)             |
| Disparar notificação a fornecedor sem checar throttle (risco de spam e estouro de cota WhatsApp)  |
| Permitir edição/exclusão direta de qualquer linha das tabelas de log                              |
| Bloquear o motor de eventos por falha de canal de notificação (separar concerns)                  |
| Calcular zona on-the-fly em cada renderização do catálogo (custoso) — usar cache `SkuStockStatus` |
| Tratar `safetyFloor` como mero alias do `blockThreshold` — são conceitos distintos                |
| Expor saldo numérico exato no e-commerce B2C (informação comercial sensível)                      |
| Permitir override de SKU com saldo abaixo do `safetyFloor` mesmo com aprovação do Owner           |
| Implementar fluxo de aprovação por SMS, MFA ou senha in-loco (foram descartados explicitamente)   |
| Notificar fornecedor antes que o Owner tenha sido avisado da transição de zona                    |

### Aviso Crítico

> ⚠️ **Itens stop-the-line são regra de negócio crítica.** Bugs neste módulo têm consequência operacional direta (cliente B2C compra peça inexistente; oficina fica parada esperando reposição que não vai chegar). Toda mudança em produção exige: dois reviewers, plano de rollback documentado, monitoramento ativo nas primeiras 48h após deploy. Mudanças em política em produção exigem confirmação explícita com checkbox "Entendo que esta mudança afeta vendas em tempo real" antes do submit.

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                                                            |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 27/05/2026 | v1     | Criação inicial como PRD-150                                                                                                                                                                         |
| 27/05/2026 | v1.1   | Renumerado para PRD-201 (Onda 14 Fase 3 — Operações Críticas); refs PRD-101→PRD-114/115, PRD-110→PRD-129 (CSV manual); adicionada tolerância de defasagem de saldo (snapshot diário, DINTEC sem API) |

---

**AILA - Sistemas Inteligentes**
