# PRD-025: Copiloto de Vendas — Assistência de IA ao Vendedor

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                            |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                                                                                 |
| **Objetivo**          | Introduzir o Copiloto de Vendas — camada de orientação **privada** que assiste o vendedor humano durante a conversa (contexto do cliente, resumo do atendimento e sugestões acionáveis). Entregue na Fase 1 como superfície navegável com assistência por **regras determinísticas** e dados mockados; o motor de IA plena fica reservado à Fase 2. |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                             |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                                                |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                                   |
| **Prioridade**        | Média                                                                                                                                                                                                                                                                                                                                               |
| **Épico**             | Bloco 2 — Inteligência de IA no Atendimento (SDR autônomo + Copiloto assistido)                                                                                                                                                                                                                                                                     |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual), PRD-004 (Mocks), PRD-005 (Provider Pattern), PRD-006 (RBAC/Auditoria), PRD-010 (Inbox), PRD-011 (Conversa), PRD-012 (Ficha), PRD-017 (Pipeline de Leads), PRD-023 (Escalonamento c/ Resumo), PRD-024 (Painel SDR)                                                                                                      |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                  |
| **Padrão de código**  | Feature-based; código em `src/features/copilot/`; `ICopilotProvider` seguindo o Provider Pattern do PRD-005; camelCase                                                                                                                                                                                                                              |

### Critérios de Complexidade

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** nova superfície de UI com **três variantes de posicionamento alternáveis por parâmetro**; introdução de entidade nova (`ICopilotSuggestion`) exigindo DELTA no PRD-002 e gerador no PRD-004; Provider Pattern com troca Mock → IA (PRD-005); integração transversal com Ficha (PRD-012), Conversa/Inbox (PRD-010/011), Escalonamento (PRD-023) e Pipeline (PRD-017); três regras determinísticas com gatilhos sobre dados mockados; orientação privada sob RBAC (PRD-006); e preparação explícita do contrato para o motor LLM da Fase 2.

> **Sobre o equilíbrio deste PRD (prescritivo × descritivo):** este documento é **prescritivo** nas decisões de produto e arquitetura (a existência das três variantes, o contrato do provider, a entidade de sugestão, a separação orientação × resposta, o reaproveitamento de Ficha e Resumo, a privacidade e o recorte Fase 1 × Fase 2) e deliberadamente **descritivo/aberto** na acomodação visual (qual variante adotar como _default_, layout fino, responsividade e microinterações), que ficam a critério do Agente Desenvolvedor e de suas skills de design.

---

## Contexto do Problema

O atendimento humano da GALLO já conta com inbox unificada (PRD-010), conversa multicanal (PRD-011), ficha consolidada do cliente (PRD-012) e handoff estruturado do SDR (PRD-023). Mas no instante decisivo — quando o vendedor vai responder — ele está sozinho com o próprio repertório. Objeções de preço, sinais de risco (silêncio, repetição de pergunta) e oportunidades de recompra passam despercebidos, sobretudo com o vendedor júnior. A "Sugestões IA" atual da conversa entrega apenas uma **resposta pronta**, sem orientar o vendedor sobre **o que fazer e por quê**.

A dor é concreta e mensurável no negócio de peças pesadas: conversões perdidas em objeções mal conduzidas, follow-ups esquecidos com o cliente esfriando, oportunidades de cross-sell e de reativação de clientes dormentes que ninguém percebe — e onboarding lento de novos vendedores, que demoram a internalizar o playbook comercial. Num setor onde "veículo parado" é a dor número um do cliente, ler corretamente urgência e intenção é o que separa o fechamento da perda.

Isso é importante agora porque a base (CRM + SDR) está madura. A camada de **inteligência sobre a conversa** é o próximo multiplicador de valor da plataforma — e, na Fase 1, boa parte dela pode ser entregue de forma navegável e validável **sem backend novo**, reaproveitando dados que já existem (ficha, resumo do SDR, pipeline) e regras determinísticas simples. O motor de IA plena entra depois, sobre uma casa já construída.

---

## Conceito da Solução

### Situação Atual (As-Is)

- A conversa (PRD-011) exibe, acima do campo de digitação, uma "Sugestões IA" que apresenta **uma frase pronta** para envio.
- A ficha (PRD-012), à direita, traz contexto comercial completo (ticket médio, LTV, recência, frequência, curva ABC, ciclo de vida, vendedor responsável).
- Não há nenhuma orientação proativa sobre como conduzir a conversa. O vendedor decide tudo sozinho.

### Situação Desejada (To-Be)

O **Copiloto de Vendas** é uma camada de **orientação privada ao vendedor** — um vendedor sênior sussurrando no ouvido, que só ele ouve. A superfície do copiloto reúne três coisas:

1. **Briefing de contexto** — extrato mínimo e relevante do cliente, derivado da Ficha (PRD-012), **sem recálculo** (fonte única de verdade).
2. **Resumo da conversa** — quando a conversa foi escalada pelo SDR, reaproveita o resumo de contexto já produzido pelo PRD-023; quando não houve escalonamento, exibe um resumo mockado.
3. **Sugestões acionáveis** — classificadas em **alerta**, **ação** e **oportunidade**, geradas por regras determinísticas na Fase 1.

Distinção central, que o PRD trata como requisito: **orientação ≠ resposta**. A orientação é privada (marcada "só você vê"), nunca trafega para o cliente e existe para guiar a decisão do vendedor. A **resposta pronta** (a "Sugestões IA" atual, PRD-011) é texto destinado ao cliente. As duas coisas coexistem e devem permanecer visualmente distintas.

### Posicionamento — três variantes, decisão delegada

A superfície do copiloto pode ocupar três lugares na tela de atendimento. **A decisão de qual adotar não é fixada neste PRD**: as três são implementadas como variantes selecionáveis por configuração, e a escolha da acomodação definitiva fica com o Agente Desenvolvedor durante a implementação.

| Variante                      | Onde                                                      | Caráter                                                                                                           |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `strip` (Faixa sobre o input) | Faixa expansível acima do campo de digitação              | Orientação **e** resposta pronta onde o olho do vendedor já está ao responder; evolução natural da "Sugestões IA" |
| `tab` (Aba na Ficha)          | Aba dedicada na Ficha do cliente                          | Espaço amplo e organizado; porém exige clique — fraco para alerta proativo                                        |
| `card` (Card no topo)         | Card no topo da conversa, no lugar do banner de escalação | Máxima visibilidade; colapsável para não atrapalhar                                                               |

A variante ativa é resolvida por um parâmetro de configuração (padrão sugerido: `VITE_COPILOT_PLACEMENT = strip | tab | card`), de modo que a troca **não exija refatoração** — mesmo espírito do `VITE_DATA_SOURCE` (PRD-005). Um protótipo navegável acompanha este PRD como anexo de design (ver seção "Anexos"), demonstrando as três variantes na conversa real.

### Modelo conceitual (extensão — requer DELTA no PRD-002)

> O copiloto introduz **uma entidade nova** ao domínio. Ela deve ser formalizada via DELTA no PRD-002 (Modelo Conceitual) e gerada no PRD-004 (Mocks). Os agregados abaixo descrevem a **forma conceitual**, não a implementação.

```typescript
ICopilotSuggestion {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  kind: 'alert' | 'action' | 'opportunity';
  source: 'rule' | 'ai';                 // Fase 1 sempre 'rule'; Fase 2 habilita 'ai'
  title: string;                          // orientação curta exibida ao vendedor
  detail?: string;                        // complemento opcional
  triggeredBy: string;                    // identificador da regra/sinal (ex: 'unanswered_deadline')
  severity?: 'low' | 'medium' | 'high';
  relatedRecommendationId?: ID;           // liga a IRecommendation quando a sugestão deriva de uma recomendação existente
  status: 'active' | 'dismissed' | 'acted';
  createdAt: ISO8601;
}

ICopilotBriefing {                        // reflete os MESMOS valores da Ficha (PRD-012) — referência, sem recomputar
  customerName: string;
  lifecycleStatus: 'ativo' | 'dormente' | 'recuperacao' | 'perdido';
  abcClass?: 'A' | 'B' | 'C';
  averageTicket?: Money;
  ltv?: Money;
  recencyDays?: number;
  frequency?: string;
  primaryVehicle?: { brand: string; model: string };
  isPositivado?: boolean;
}

ICopilotPanelData {                       // agregado consumido pela superfície
  conversationId: ID;
  briefing: ICopilotBriefing;
  summary?: ISdrContextSummary | ICopilotSummary;  // PRD-023 quando escalado; mock caso contrário
  suggestions: ICopilotSuggestion[];
  placement: 'strip' | 'tab' | 'card';    // resolvido por configuração
}

ICopilotProvider {                        // segue o Provider Pattern do PRD-005
  getPanelData(conversationId: ID): Promise<ICopilotPanelData>;
  dismissSuggestion(id: ID): Promise<void>;
  // Fase 2 (AICopilotProvider): generateReply(conversationId: ID): Promise<string>;
}
```

### Tipos de sugestão e origem

| `kind`        | Significado                                     | Tom semântico | Origem na Fase 1 |
| ------------- | ----------------------------------------------- | ------------- | ---------------- |
| `alert`       | Risco a tratar (silêncio, repetição, pendência) | Atenção       | `rule`           |
| `action`      | Próxima ação concreta a executar                | Informacional | `rule`           |
| `opportunity` | Abertura comercial a explorar                   | Positivo      | `rule`           |

Na Fase 1, **toda** sugestão tem `source: 'rule'`. A Fase 2 habilita `source: 'ai'` para sugestões geradas por LLM (objeção interpretada, tom lido, oportunidade inferida) — sem mudar o contrato consumido pela superfície.

### Regras determinísticas da Fase 1

As três regras abaixo operam sobre dados que **já existem nos mocks** (conversa, ficha, ciclo de vida). Termos e limiares são **fixos no mockup** e tornam-se parametrizáveis pelo gestor na Fase 2 (via PRD-019), seguindo o padrão dos limiares de ciclo de vida do projeto.

- **R1 — `unanswered_deadline` (alert):** quando a conversa contém **duas ou mais** mensagens do cliente cujo conteúdo trata de prazo/entrega, **sem** mensagem subsequente do vendedor e com a conversa ainda não resolvida, emitir alerta de prazo pendente.
- **R2 — `billing_mismatch` (action):** quando o cliente solicita nota fiscal/faturamento "em nome da empresa" enquanto o cadastro é pessoa física/B2C, emitir ação para confirmar os dados de faturamento antes de emitir.
- **R3 — `dormant_opportunity` (opportunity):** quando o ciclo de vida do cliente (PRD-012) é `dormente` **e** há sinal de intenção de compra na conversa atual (pedido de orçamento, preço ou boleto), emitir oportunidade sugerindo facilitar o fechamento (ex.: oferecer condição de pagamento).

### Alternativas Consideradas

| Alternativa                                          | Por que foi descartada                                                                                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixar **uma única** posição agora                    | A melhor acomodação depende de espaço, responsividade e validação em uso; manter as três por parâmetro custa pouco e preserva flexibilidade para o desenvolvedor decidir com o código na mão                                           |
| Concentrar tudo numa **aba da Ficha**                | Enterra os alertas atrás de um clique, eliminando o caráter proativo do "sussurro" — adequado para consulta, fraco para tempo real                                                                                                     |
| Reusar `IRecommendation` para **todas** as sugestões | Recomendações são sobre cliente/veículo no horizonte longo; o copiloto reage à **conversa em tempo real**. `IRecommendation` é reaproveitada apenas quando a sugestão deriva de uma recomendação existente (`relatedRecommendationId`) |
| Já entregar o motor de IA na Fase 1                  | Exigiria LLM e backend, contrariando o Frontend First; a casa + regras determinísticas valida o conceito antes do investimento                                                                                                         |

---

## Escopo

### Incluído (Fase 1)

- ✅ Superfície do copiloto (a "casa") nas **três variantes** (`strip`, `tab`, `card`), alternáveis por parâmetro de configuração, sem refatoração na troca
- ✅ Briefing de contexto derivado da Ficha (PRD-012), **sem recálculo** (fonte única)
- ✅ Exibição do resumo de conversa reaproveitando o resumo do SDR (PRD-023) quando há escalonamento; resumo mockado quando não há
- ✅ Sugestões por regra determinística (R1, R2, R3), entidade `ICopilotSuggestion` com `kind` em alerta/ação/oportunidade e `source: 'rule'`
- ✅ Distinção visual e funcional entre **orientação privada** e a **resposta pronta** existente (PRD-011)
- ✅ Privacidade: orientação visível apenas ao vendedor e perfis autorizados (RBAC, PRD-006); jamais enviada ao cliente
- ✅ `ICopilotProvider` com `MockCopilotProvider` (determinístico), seguindo o Provider Pattern (PRD-005)
- ✅ Dispensar sugestão (`dismiss`) com estado visual local na sessão
- ✅ Esqueleto visual do botão "gerar resposta sugerida" (desabilitado/placeholder), sinalizando a capacidade da Fase 2
- ✅ DELTA no PRD-002 (nova entidade) e no PRD-004 (gerador de mocks de sugestões)
- ✅ Suporte a tema light/dark e aos temas do design system (PRD-001); ícones via Iconify

### Excluído (Fase 2 ou fora do escopo)

- ❌ Motor de IA/LLM: detecção semântica de objeções, leitura de sentimento, _next best action_ interpretativo e **geração real de resposta** (`AICopilotProvider` — PRD(s) da Fase 2)
- ❌ Cross-sell/upsell preditivo real (integra recomendações e quilometragem — Fase 2)
- ❌ Aprendizado pós-conversa / loop de melhoria com base em ganhos e perdas (Fase 2)
- ❌ Parametrização das regras pelo gestor (Fase 2, via PRD-019)
- ❌ Persistência real das sugestões e auditoria persistente (Fase 2; na Fase 1 o estado é local/mockado)
- ❌ Notificações push (Fase 2)

---

## Requisitos Funcionais

### Superfície e Posicionamento

- **RF-001:** A superfície do copiloto deve poder ser renderizada em três variantes — `strip` (faixa sobre o input), `tab` (aba na Ficha) e `card` (card no topo da conversa) — todas funcionalmente equivalentes em conteúdo.
- **RF-002:** A variante ativa deve ser resolvida por um parâmetro de configuração, com _default_ definível, de modo que a troca entre variantes não exija refatoração do código que produz o conteúdo do copiloto.
- **RF-003:** A orientação do copiloto deve ser **privada** — visível apenas ao vendedor e a perfis autorizados (PRD-006), sinalizada como "só você vê" — e nunca deve ser enviada ao cliente, permanecendo visualmente distinta da resposta pronta da conversa (PRD-011).

### Briefing de Contexto

- **RF-004:** O copiloto deve exibir um extrato de contexto do cliente — identificação, ciclo de vida, curva ABC, ticket médio, LTV, recência, frequência e veículo principal — refletindo os mesmos valores apresentados na Ficha (PRD-012), sem recomputá-los.

### Resumo da Conversa

- **RF-005:** Quando a conversa tiver sido escalada pelo SDR (PRD-023), o copiloto deve exibir o resumo de contexto já existente; quando não houver escalonamento, deve exibir um resumo mockado da conversa.

### Sugestões

- **RF-006:** O copiloto deve emitir sugestões classificadas em `alert`, `action` e `opportunity` (entidade `ICopilotSuggestion`), cada uma com título, tipo, origem e tom visual correspondente.
- **RF-007:** O copiloto deve emitir um **alerta** quando houver pergunta de prazo/entrega repetida pelo cliente sem resposta subsequente do vendedor (regra R1).
- **RF-008:** O copiloto deve emitir uma **ação** quando o cliente solicitar faturamento em nome de empresa divergindo de um cadastro pessoa física/B2C (regra R2).
- **RF-009:** O copiloto deve emitir uma **oportunidade** quando um cliente com ciclo de vida `dormente` apresentar sinal de intenção de compra na conversa atual (regra R3).
- **RF-010:** O vendedor deve poder **dispensar** uma sugestão, removendo-a da superfície na sessão atual (estado local na Fase 1).

### Provider e Preparação para a Fase 2

- **RF-011:** As capacidades do copiloto devem ser acessadas por meio de um `ICopilotProvider`; na Fase 1, a implementação ativa é o `MockCopilotProvider` (determinístico), e o contrato deve estar preparado para um `AICopilotProvider` na Fase 2 sem alteração na superfície.
- **RF-012:** A superfície deve apresentar o botão "gerar resposta sugerida" como **esqueleto** (desabilitado ou com retorno mockado fixo), sinalizando a capacidade futura de geração de resposta por IA.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** A montagem da superfície do copiloto deve ser perceptivelmente instantânea (< 300 ms sobre dados mockados) e **não deve bloquear** a renderização ou o uso da conversa.
- **RNF-002 (Resiliência):** Falha ao obter dados do copiloto deve **degradar graciosamente** — a conversa permanece plenamente utilizável e a superfície exibe estado vazio coerente, sem erro intrusivo.
- **RNF-003 (Tema):** Suporte obrigatório a light/dark e aos temas do design system (PRD-001), sem cores fixas fora dos tokens.
- **RNF-004 (Responsividade):** As três variantes devem se comportar adequadamente nas larguras de tela alvo do app interno (desktop); a acomodação fina é decisão de implementação.
- **RNF-005 (Acessibilidade):** Contraste adequado, navegação por teclado e leitura por leitor de tela da superfície e de suas sugestões.
- **RNF-006 (Isolamento):** A feature não deve alterar o comportamento das colunas existentes (inbox, conversa, ficha) além de hospedar a superfície do copiloto.
- **RNF-007 (Compatibilidade):** Navegadores-alvo do projeto (Chrome, Firefox, Safari, Edge — versões correntes).

---

## Critérios de Aceitação

### RF-001 / RF-002: Variantes alternáveis por parâmetro

```gherkin
DADO que o parâmetro de posicionamento está definido como "card"
QUANDO o vendedor abre uma conversa
ENTÃO o copiloto é exibido como um card no topo da conversa
  E nenhuma das outras variantes é renderizada simultaneamente

DADO que o parâmetro de posicionamento é alterado para "strip"
QUANDO a tela de atendimento é recarregada
ENTÃO o copiloto passa a ser exibido como faixa sobre o campo de digitação
  E o conteúdo (briefing, resumo e sugestões) permanece o mesmo
```

### RF-003: Orientação privada e distinta da resposta

```gherkin
DADO um vendedor visualizando o copiloto em uma conversa
QUANDO a superfície é exibida
ENTÃO as orientações aparecem marcadas como "só você vê"
  E são visualmente distintas da resposta pronta exibida no campo de envio
  E em nenhum momento são inseridas automaticamente como mensagem ao cliente
```

### RF-004: Briefing reflete a Ficha sem recálculo

```gherkin
DADO um cliente cujo ciclo de vida na Ficha é "dormente" e curva ABC "A"
QUANDO o briefing do copiloto é exibido
ENTÃO ele apresenta ciclo de vida "dormente" e curva "A"
  E os valores coincidem com os exibidos na Ficha (PRD-012)
```

### RF-005: Resumo conforme origem da conversa

```gherkin
DADO que a conversa foi escalada pelo SDR
QUANDO o copiloto é aberto
ENTÃO o resumo exibido é o resumo de contexto do escalonamento (PRD-023)

DADO que a conversa não passou por escalonamento do SDR
QUANDO o copiloto é aberto
ENTÃO o copiloto exibe um resumo mockado da conversa
```

### RF-007 / RF-008 / RF-009: Regras determinísticas

```gherkin
DADO um cliente que perguntou sobre prazo de entrega duas vezes sem resposta do vendedor
QUANDO o copiloto avalia a conversa
ENTÃO é exibido um alerta de prazo pendente (kind = alert)

DADO um cliente B2C (cadastro com CPF) que pede nota em nome da empresa
QUANDO o copiloto avalia a conversa
ENTÃO é exibida uma ação para confirmar os dados de faturamento (kind = action)

DADO um cliente com ciclo de vida "dormente" que pede orçamento na conversa atual
QUANDO o copiloto avalia a conversa
ENTÃO é exibida uma oportunidade sugerindo facilitar o fechamento (kind = opportunity)
```

### RF-011: Provider e preparação para Fase 2

```gherkin
DADO que a fonte de inteligência do copiloto está em modo mock
QUANDO a superfície solicita os dados do painel
ENTÃO os dados são fornecidos pelo MockCopilotProvider
  E o contrato do provider expõe o ponto de extensão para geração de resposta (Fase 2)
```

### Cenários de Erro

```gherkin
DADO que o provider do copiloto falha ao retornar dados
QUANDO a conversa é aberta
ENTÃO a conversa permanece totalmente utilizável
  E a superfície do copiloto exibe um estado vazio coerente, sem erro bloqueante

DADO um parâmetro de posicionamento com valor inválido
QUANDO a tela de atendimento é carregada
ENTÃO o copiloto assume a variante default
  E nenhuma exceção é exposta ao usuário

DADO um cliente sem ciclo de vida definido na Ficha
QUANDO o copiloto avalia a conversa
ENTÃO a regra de oportunidade dormente (R3) não dispara
  E as demais sugestões aplicáveis continuam sendo exibidas
```

---

## Fases de Implementação

| Fase | Objetivo                                                     | Arquivos Estimados |
| ---- | ------------------------------------------------------------ | ------------------ |
| 1    | Análise, contrato e DELTAs                                   | 2-3                |
| 2    | Superfície base + parametrização das variantes               | 4-6                |
| 3    | Briefing + Resumo (reaproveitamento)                         | 2-3                |
| 4    | Sugestões por regra + MockCopilotProvider + esqueleto Fase 2 | 4-6                |
| 5    | Validação (tema, responsividade, RBAC, acessibilidade)       | —                  |

### Detalhamento das Fases

#### Fase 1: Análise, contrato e DELTAs

**Objetivo:** definir o contrato e formalizar a extensão do modelo antes de qualquer UI.

**Ações:**

- [ ] Explorar a estrutura de dados existente (Ficha, Conversa, Escalonamento, Pipeline) e confirmar de onde vem cada dado do copiloto
- [ ] Definir `ICopilotSuggestion`, `ICopilotBriefing`, `ICopilotPanelData` e a interface `ICopilotProvider`
- [ ] Registrar DELTA no PRD-002 (nova entidade) e no PRD-004 (gerador de mocks)

**Validação:** modelo e contrato revisados; DELTAs documentados; nenhuma entidade duplicando conceito já existente.

#### Fase 2: Superfície base + parametrização

**Objetivo:** entregar a "casa" do copiloto nas três variantes, alternáveis por parâmetro.

**Ações:**

- [ ] Implementar a superfície (cabeçalho "Copiloto" + selo de privacidade) reutilizável entre variantes
- [ ] Implementar as variantes `strip`, `tab` e `card` e a resolução por parâmetro de configuração
- [ ] Garantir que a troca de variante não altere o conteúdo nem exija refatoração

**Validação:** alternar o parâmetro troca a posição mantendo o conteúdo; only-one-variant por vez.

#### Fase 3: Briefing + Resumo

**Objetivo:** popular contexto e resumo sem duplicar fontes.

**Ações:**

- [ ] Exibir o briefing refletindo os valores da Ficha (PRD-012), sem recálculo
- [ ] Exibir o resumo do escalonamento (PRD-023) quando aplicável; resumo mockado caso contrário

**Validação:** briefing coincide com a Ficha; resumo correto conforme origem da conversa.

#### Fase 4: Sugestões por regra + Provider + esqueleto Fase 2

**Objetivo:** entregar as orientações determinísticas e o ponto de extensão.

**Ações:**

- [ ] Implementar as regras R1, R2 e R3 sobre os dados mockados
- [ ] Implementar `MockCopilotProvider` atrás do contrato `ICopilotProvider`
- [ ] Implementar `dismiss` de sugestão (estado local)
- [ ] Adicionar o botão "gerar resposta sugerida" como esqueleto desabilitado/placeholder

**Validação:** as três regras disparam nos cenários previstos; dispensar funciona; botão presente e inerte.

#### Fase 5: Validação

**Objetivo:** garantir qualidade transversal.

**Ações:**

- [ ] Validar tema light/dark e temas do design system
- [ ] Validar responsividade das três variantes nas larguras-alvo
- [ ] Validar privacidade (RBAC) e acessibilidade
- [ ] Confirmar resiliência (estado vazio gracioso) e isolamento das colunas existentes

**Validação:** checklist de qualidade do GuiaPRD satisfeito.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                                         | Status          |
| ------- | ------------------------------------------------- | --------------- |
| PRD-002 | Modelo Conceitual (recebe DELTA)                  | ✅ Implementado |
| PRD-004 | Mocks (recebe gerador de sugestões)               | ✅ Implementado |
| PRD-005 | Provider Pattern (base do `ICopilotProvider`)     | ✅ Implementado |
| PRD-006 | RBAC/Auditoria (privacidade da orientação)        | ✅ Implementado |
| PRD-010 | Inbox                                             | ✅ Implementado |
| PRD-011 | Conversa (hospeda `strip`/`card`; "Sugestões IA") | ✅ Implementado |
| PRD-012 | Ficha (fonte do briefing; hospeda `tab`)          | ✅ Implementado |
| PRD-017 | Pipeline de Leads (temperatura/intenção)          | ✅ Implementado |
| PRD-023 | Escalonamento c/ Resumo (fonte do resumo)         | 📝 Redigido     |

### Serviços Externos

| Serviço          | Tipo | Status |
| ---------------- | ---- | ------ |
| Nenhum na Fase 1 | —    | —      |

### Decisões Pendentes

- [ ] **Variante default de posicionamento** (`strip` / `tab` / `card`) — delegada ao Agente Desenvolvedor durante a implementação
- [ ] **Número definitivo no índice** — proposto `PRD-025` (extensão do Bloco 2); a ratificar pelo Arquiteto

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Bloco 2 — Inteligência de IA no Atendimento"**.

| Ordem  | PRD              | Título                                                            | Status       | Relação                                |
| ------ | ---------------- | ----------------------------------------------------------------- | ------------ | -------------------------------------- |
| …      | PRD-020–022      | SDR (engine, identificação, orçamento)                            | 📝           | Base de IA                             |
| 14     | PRD-023          | Escalonamento c/ Resumo                                           | 📝           | Fonte do resumo de conversa            |
| 15     | PRD-024          | Painel SDR                                                        | 📝           | Métricas de IA                         |
| **16** | **PRD-025**      | **Copiloto de Vendas (este)**                                     | **🔄 ATUAL** | Depende de 010, 011, 012, 023          |
| 17+    | PRD-11x (Fase 2) | Copiloto IA — motor de objeções, sentimento e geração de resposta | ⏳           | Substitui Mock por `AICopilotProvider` |

> **Nota:** implemente na ordem indicada. PRDs anteriores devem estar ✅ antes de iniciar este.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente | 📝 Redigido

---

## Considerações de Segurança

### Dados Sensíveis

| Dado                                     | Classificação            | Proteção                                                                                                  |
| ---------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Briefing (nome, métricas, ciclo de vida) | PII / Sensível comercial | Reutiliza os mesmos dados da Ficha; exibido apenas a quem tem permissão de ver a conversa/ficha (PRD-006) |
| Resumo da conversa                       | PII                      | Já protegido pelo RBAC da conversa (PRD-006/023)                                                          |
| Orientações do copiloto                  | Interno                  | Privadas ao vendedor/perfis autorizados; jamais expostas ao cliente                                       |

### Autenticação e Autorização

A superfície do copiloto só é exibida a perfis com permissão de atender a conversa correspondente (escopo `own`/`store` conforme o papel, PRD-006). A orientação não é um recurso voltado ao cliente e não possui rota ou exposição no lado cliente.

### Auditoria

Na Fase 1, eventos relevantes (sugestão exibida, dispensada) podem ser refletidos no log de auditoria **visual** (PRD-006), sem persistência real. A auditoria persistente fica para a Fase 2.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — conversa escalada pelo SDR

1. O vendedor recebe uma conversa escalada pelo SDR (PRD-023) e a abre.
2. O copiloto exibe o briefing do cliente (da Ficha) e o resumo do escalonamento.
3. O copiloto apresenta as sugestões aplicáveis (ex.: alerta de prazo pendente, ação de faturamento, oportunidade de cliente dormente).
4. O vendedor executa a ação sugerida (confirma dados de faturamento) e dispensa o alerta já tratado.
5. O vendedor responde ao cliente; a resposta pronta permanece disponível no campo de envio, separada das orientações.

### Fluxos de Exceção

- **Conversa sem escalonamento:** não há resumo do SDR; o copiloto exibe um resumo mockado e segue com briefing e sugestões.
- **Cliente sem ciclo de vida definido:** a regra de oportunidade dormente (R3) não dispara; as demais sugestões continuam.
- **Cliente fora de carteira / sem permissão:** a superfície do copiloto não é exibida ao perfil sem permissão de atender a conversa.

### Fluxos de Erro

- **Provider indisponível:** a conversa segue utilizável; o copiloto mostra estado vazio coerente.
- **Parâmetro de posicionamento inválido:** o copiloto assume a variante default, sem erro ao usuário.

---

## Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento                | Convenção                  | Exemplo                                                                |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------- |
| **Componentes React**   | PascalCase                 | `CopilotPanel.tsx`, `CopilotSuggestionItem.tsx`                        |
| **Hooks**               | camelCase + `use`          | `useCopilotPanel.ts`                                                   |
| **Services/Providers**  | camelCase + `Provider`     | `mockCopilotProvider.ts`                                               |
| **Pastas**              | kebab-case (feature-based) | `src/features/copilot/`                                                |
| **Variáveis/Funções**   | camelCase                  | `dismissSuggestion()`                                                  |
| **Interfaces**          | PascalCase + `I`           | `ICopilotProvider`, `ICopilotSuggestion`                               |
| **Env vars (frontend)** | `VITE_` prefix             | `VITE_COPILOT_PLACEMENT`                                               |
| **Git commits**         | Conventional Commits       | `feat(copilot): add sales copilot surface with rule-based suggestions` |
| **Ícones**              | Iconify (`@iconify/react`) | `<Icon icon="mdi:robot-outline" />`                                    |
| **Tema**                | Light + Dark + temas GALLO | CSS variables / tokens do PRD-001                                      |

---

## Anexos

| Anexo                        | Descrição                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gallo-copiloto-mockup.html` | Protótipo navegável de design (standalone) recriando a tela de atendimento no tema Black Gold, com as três variantes de posicionamento alternáveis pelos botões ou pelo parâmetro de URL `?copilot=a\|b\|c` (aliases `strip\|tab\|card`). **Referência visual, não especificação de layout** — a acomodação definitiva é decisão do desenvolvedor. _Observação:_ o protótipo usa ícones Lucide por conveniência; no produto, os ícones seguem o padrão Iconify. |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus 4.x operando via Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto (na plataforma web).

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
>
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o `CHANGELOG.md` seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Atualizar o registro de versão no banco de dados (se aplicável)
> - Renomear este arquivo adicionando `_DONE` ao final (ex.: `PRD-025-copiloto-vendas_DONE.md`)
> - Atualizar a seção "Status de Implementação" (status, data, versão, observações)

### Guia de Versionamento (SemVer)

| Tipo de Mudança      | Ação                 | Exemplo       |
| -------------------- | -------------------- | ------------- |
| Correção de bug      | PATCH +1             | 1.0.0 → 1.0.1 |
| Nova funcionalidade  | MINOR +1, PATCH = 0  | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinomes:** para MINOR/MAJOR, gerar codinome em inglês baseado no contexto (sugestão para este PRD: **Copilot** ou **Whisper**). PATCH mantém o codinome anterior.

🔗 https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos: **Added**, **Changed**, **Deprecated**, **Removed**, **Fixed**, **Security**.

🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio                      | Descrição                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **Não bloquear o atendimento** | O copiloto é assistivo; nunca deve travar a conversa                                          |
| **Fail gracefully**            | Falha do provider → estado vazio coerente, conversa intacta                                   |
| **Fonte única de verdade**     | Briefing reflete a Ficha; resumo reflete o escalonamento — sem recomputar                     |
| **Contrato pronto para a IA**  | Manter `ICopilotProvider` estável para o `AICopilotProvider` da Fase 2 entrar sem mexer na UI |
| **Documentar decisões**        | Registrar a variante default escolhida e o porquê                                             |

### Orientações Gerais

| Aspecto                             | Orientação                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Posicionamento**                  | Implemente as três variantes e a resolução por parâmetro; **escolha o default** com base no espaço real e na validação — esta decisão é sua |
| **Distinção orientação × resposta** | Mantenha a orientação privada e visualmente separada da resposta pronta (PRD-011); não as funda                                             |
| **Reaproveitamento**                | Não duplique a Ficha nem o resumo do SDR — consuma-os                                                                                       |
| **Regras**                          | Termos/limiares das regras são fixos no mock; deixe o ponto de extensão para parametrização futura (PRD-019)                                |
| **Esqueleto Fase 2**                | O botão de geração de resposta deve existir, mas inerte; não implemente LLM                                                                 |

### O que NÃO Fazer

| ❌ Evitar                                                                                       |
| ----------------------------------------------------------------------------------------------- |
| Implementar qualquer chamada a LLM/IA real nesta fase                                           |
| Duplicar dados da Ficha ou recalcular métricas no copiloto                                      |
| Inserir orientações automaticamente como mensagem ao cliente                                    |
| Fixar uma única variante removendo as outras (todas devem permanecer alternáveis por parâmetro) |
| Inventar dados fora da camada de mocks (PRD-004)                                                |
| Persistir sugestões ou auditoria de verdade (Fase 2)                                            |
| Implementar notificações push (Fase 2)                                                          |
| Acoplar o copiloto de forma que sua falha quebre a conversa                                     |

---

## Status de Implementação

| Campo                     | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                | ✅ CONCLUÍDO                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Data de Implementação** | 31/05/2026                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Versão do App**         | v0.56.0 — Copilot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Implementado por**      | Claude Code CLI (Opus)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Observações**           | Fase 1 entregue: superfície navegável em `src/features/copilot/`, três variantes (`strip` default / `card` / `tab`) com assistência por regras determinísticas (R1 `unanswered_deadline`, R2 `billing_mismatch`, R3 `dormant_opportunity`) e dados mockados. Briefing reaproveita a Ficha (PRD-012); resumo reaproveita o escalonamento do SDR (PRD-023). `ICopilotProvider` segue o Provider Pattern (PRD-005) com `mockCopilotProvider` ativo e stub Supabase para a Fase 2. **Posicionamento alternável em runtime** via Configurações → Copiloto (`/app/configuracoes/copiloto`), persistido em `localStorage` (`gallo-copilot-placement`); `VITE_COPILOT_PLACEMENT` permanece como default de fábrica. Botão "Gerar resposta" presente porém inerte (LLM reservado à Fase 2). Sem chamadas a IA real, sem persistência de sugestões/auditoria. |

---

## Histórico

| Data       | Versão  | Alteração                                                                                                                                                                                                                                                                                           |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31/05/2026 | v1      | Criação inicial — Copiloto de Vendas (Fase 1): superfície em três variantes alternáveis por parâmetro, briefing reaproveitando a Ficha, resumo reaproveitando o escalonamento do SDR, sugestões por regra determinística, Provider Pattern com mock e contrato preparado para o motor LLM da Fase 2 |
| 31/05/2026 | v0.56.0 | Implementação concluída (Copilot). Posicionamento promovido a preferência de runtime configurável em Configurações → Copiloto (`localStorage`), com `VITE_COPILOT_PLACEMENT` como default de fábrica                                                                                                |

---

**AILA — Sistemas Inteligentes**
