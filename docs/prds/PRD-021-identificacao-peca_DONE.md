# PRD-021: Identificação de Peça (via SDR)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                   |
| **Objetivo**          | Construir o sistema que identifica peças no catálogo a partir de mensagens em texto natural (descrição) ou foto (código OEM) do cliente, com fluxo de confirmação, indicadores de confiança e suporte a equivalências |
| **Tipo**              | Feature                                                                                                                                                                                                               |
| **Complexidade**      | Alta                                                                                                                                                                                                                  |
| **Total de Fases**    | 5                                                                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                                                                  |
| **Épico**             | Bloco 2 — SDR (Agente IA 24/7)                                                                                                                                                                                        |
| **PRDs Relacionados** | PRD-016 (Veículos), PRD-020 (Simulação SDR), PRD-022 (Orçamento via SDR), PRD-030 (Catálogo)                                                                                                                          |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/part-identification/`; integração via stubs até PRD-030                                                                                                                        |

### Critérios de Complexidade

> **Justificativa de Alta:** parsing de texto natural com extração de 5+ atributos (marca, modelo, ano, motor, tipo de peça) preparado para LLM, busca em catálogo via aplicações peça↔veículo (PRD-030 placeholder), sistema de scoring e confiança, fluxo de confirmação com cliente, suporte a foto de código OEM com OCR placeholder (Fase 2 com Tesseract ou serviço externo), equivalências entre peças (filtro genérico equivalente ao original), e arquitetura limpa que permite trocar parsing simples por LLM na Fase 2 sem refatorar consumidores.

---

## Contexto do Problema

Quando um caminhoneiro manda mensagem "preciso de filtro pro meu Volvo R450 2020 motor DC13", o SDR precisa entender:

- **Marca**: Volvo
- **Modelo**: R450
- **Ano**: 2020
- **Motor**: DC13
- **Tipo de peça**: filtro (mas qual? óleo, ar, combustível, cabine?)

Sem isso, o SDR responde genericamente ("Que tipo de filtro?") e a conversa vira ping-pong de perguntas. Três problemas concretos resolvidos:

**Extração automática de atributos.** Cliente fala 1 mensagem; SDR já sabe tudo o que precisa para buscar no catálogo. **Match com aplicações do catálogo.** PRD-030 (catálogo) registra "Filtro X é compatível com Volvo R450 motor DC13 anos 2018-2024". Identificação casa atributos do cliente com aplicações. **Suporte a foto do código OEM.** Caminhoneiro pode tirar foto do código numérico de uma peça antiga e perguntar "tem essa?". OCR (Fase 2) lê o código; busca direto por número. No MVP, placeholder: cliente digita o código manualmente.

Este PRD entrega: engine de identificação com 5+ atributos extraíveis, busca no catálogo via aplicações (com placeholder coerente até PRD-030 implementado), scoring de confiança, modal de confirmação com cliente, suporte a foto (placeholder OCR), equivalências entre peças.

---

## Conceito da Solução

### Atributos extraídos

| Atributo         | Como detectar (MVP)                                                             | Como detectar (Fase 2 - LLM) |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| **Marca**        | Lista de marcas conhecidas + lookup (Volvo, Scania, Mercedes-Benz, Ford, Iveco) | LLM com fine-tuning          |
| **Modelo**       | Pattern: marca + alfanumérico (Volvo R450, Scania R124)                         | LLM contextualiza            |
| **Ano**          | Regex `(19                                                                      | 20)\d{2}` no texto           | LLM extrai |
| **Motor**        | Lista de motores comuns por marca (DC13, OM457LA, MX-13)                        | LLM extrai                   |
| **Tipo de peça** | Keywords + categoria (filtro/freio/correia/motor/embreagem)                     | LLM classifica               |
| **Sub-tipo**     | Modificadores (óleo/ar/combustível/cabine para filtro)                          | LLM detalha                  |
| **Código OEM**   | Pattern numérico (10+ dígitos) OU foto via OCR (Fase 2)                         | OCR + LLM                    |

### Modelo da identificação

```typescript
IPartIdentification {
  id: ID;
  conversationId: ID;
  sessionId?: ID;             // ISdrSession.id se via SDR
  rawInput: string;            // mensagem original do cliente
  extractedAttributes: {
    brand?: string;
    model?: string;
    year?: number;
    engine?: string;
    partCategory?: string;     // 'filtro', 'freio', 'correia', 'motor', 'embreagem', 'eletrica', 'transmissao'
    partSubtype?: string;      // 'oleo', 'ar', 'combustivel', etc. para filtros
    oemCode?: string;
  };
  confidence: number;          // 0..1 — confidence agregada
  attributeConfidence: Record<string, number>;  // por atributo
  candidates: IPartCandidate[];
  status: 'extracting' | 'searching' | 'awaiting_confirmation' | 'confirmed' | 'rejected' | 'failed';
  customerConfirmedPartId?: ID;
  createdAt: ISO8601;
  resolvedAt?: ISO8601;
}

IPartCandidate {
  partId: ID;
  partName: string;
  score: number;                 // 0..1 — quão bem casa com a extração
  matchedAttributes: string[];   // ['brand', 'model', 'year']
  isEquivalent: boolean;         // true se é peça equivalente, não original
  estimatedPrice?: Money;        // preview opcional
}
```

### Fluxo de identificação

```
mensagem cliente "preciso filtro Volvo R450 2020"
       ↓
[extractAttributes]
       ↓
{brand: 'Volvo', model: 'R450', year: 2020, partCategory: 'filtro', confidence: 0.85}
       ↓
[searchCatalog] (PRD-030 stub)
       ↓
[IPartCandidate × N] ordenados por score
       ↓
Se candidates.length === 1 E score > 0.9:
  → status='confirmed' direto, sem perguntar
Senão:
  → status='awaiting_confirmation'
  → SDR envia mensagem com top 3 candidatos para cliente escolher
```

### Mensagem de confirmação ao cliente

Quando confidence é alta mas há ambiguidade (ex: identificou "filtro" mas não sub-tipo):

```
🔎 Encontrei algumas opções pro seu Volvo R450 2020:

1️⃣ Filtro de óleo (R$ 95) — original Volvo
2️⃣ Filtro de ar (R$ 165) — original Volvo
3️⃣ Filtro de combustível (R$ 88) — equivalente Mann

Qual você precisa? Responde 1, 2 ou 3.
```

Quando confidence é baixa:

```
Para te ajudar melhor, preciso entender:
• Que tipo de filtro? (óleo, ar, combustível, cabine)
• O motor é DC13 ou outro?
```

### Scoring de candidatos

Cada candidato recebe `score` calculado:

- +0.35 se brand bate
- +0.30 se model bate
- +0.15 se year está no range de aplicação
- +0.10 se engine bate
- +0.10 se partCategory bate
- Penalidade -0.05 se é peça equivalente vs original

Threshold para confirmação automática: > 0.9 com candidato único.

### Suporte a foto de código OEM

**MVP** (sem OCR real):

- Quando cliente envia imagem, SDR responde: "Vi a foto! No MVP ainda não temos leitura automática. Você consegue digitar o código numérico que aparece?"
- Cliente digita → fluxo normal de busca por código OEM
- Engine busca direto por `IPart.oemCode === input`

**Fase 2** (com OCR):

- Foto vai para serviço de OCR (Tesseract.js no client ou serviço externo)
- Texto extraído alimenta `extractAttributes`
- Confidence inicial alta para códigos numéricos longos (10+ dígitos)

### Equivalências

`IPart.equivalents: ID[]` (PRD-030) lista peças equivalentes. Engine sempre apresenta tanto a original quanto equivalentes na resposta, ordenadas por preço:

```
Filtro de óleo Volvo R450:
1️⃣ Original Volvo (cód. 21380488) — R$ 95
2️⃣ Equivalente Mann (cód. W11102/14) — R$ 65 (economia 32%)
3️⃣ Equivalente Mahle (cód. OC568) — R$ 70 (economia 26%)
```

### Indicador de confiança visual

Para inspetor do simulador (PRD-020) e debug:

| Confidence | Cor      | Significado                                 |
| ---------- | -------- | ------------------------------------------- |
| > 0.85     | Verde    | Confiança alta — pode confirmar com cliente |
| 0.6 - 0.85 | Amarelo  | Confiança média — perguntar para refinar    |
| < 0.6      | Vermelho | Confiança baixa — pedir mais informações    |

### Integração com PRDs

- **PRD-020 (SDR)**: chama `identifyPart(text, session)` quando detecta intent `identificar_peca`
- **PRD-022 (Orçamento via SDR)**: recebe `IPartIdentification` confirmada e gera orçamento
- **PRD-030 (Catálogo)**: este PRD consome `searchPartsByApplication(attributes)` — placeholder até implementado
- **PRD-016 (Veículos)**: se conversa tem cliente identificado com veículo cadastrado, atributos do veículo são prepopulados (cliente já sabe que é o Volvo R450 que está cadastrado)

### Alternativas Consideradas

| Alternativa                                     | Por que foi descartada                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| Apenas LLM (sem keyword no MVP)                 | Complexidade desnecessária; MVP funciona razoavelmente com keywords |
| Sem scoring de candidatos                       | Cliente recebe lista enorme sem priorização                         |
| Sem equivalências                               | Perde oportunidade de venda de peça alternativa mais barata         |
| Sem OCR placeholder                             | UX confusa quando cliente manda foto                                |
| Identificação 100% automática (sem confirmação) | Erros são custos altos; confirmação é segurança                     |
| Sem reaproveitar veículo cadastrado             | Cliente repete dados que já estão no sistema                        |
| Confidence binária (sim/não)                    | Perde nuance — médio significa "pergunta mais"                      |

**Decisão consolidada:** **extração por keywords + lookup tables no MVP, scoring 0-1 por candidato, top 3 apresentados ao cliente, OCR como placeholder com texto educativo, reaproveitamento de veículo cadastrado quando disponível, equivalências sempre incluídas.**

---

## Escopo

### Incluído

- ✅ Modelo `IPartIdentification` em `src/shared/types/part-identification.ts`
- ✅ Engine `identifyPart(input, context)` em `src/features/part-identification/engine/`:
  - `extractAttributes(text)` — extrai marca/modelo/ano/motor/categoria/subtipo
  - `searchCatalog(attributes)` — busca candidatos (stub do PRD-030)
  - `scoreCandidate(candidate, attributes)` — calcula score
  - `formatConfirmationMessage(identification, language='pt-BR')` — gera texto da mensagem ao cliente
- ✅ Lookup tables: marcas, modelos por marca, motores por marca, categorias de peças, subtipos
- ✅ Suporte a código OEM via input direto (numérico)
- ✅ Placeholder educativo quando cliente envia foto
- ✅ Reaproveitamento de veículos cadastrados (PRD-016): se conversa tem customer com 1 veículo, pré-preenche brand/model/year
- ✅ Scoring com pesos definidos
- ✅ Inclusão de equivalências em resultados
- ✅ Modal de "Inspetor de identificação" no painel do SDR (PRD-020 simulador) — mostra extração + candidatos + scores
- ✅ Status de identificação evoluindo (extracting → searching → awaiting_confirmation → confirmed/rejected/failed)
- ✅ Integração com PRD-020: chamada quando SDR detecta intent `identificar_peca`
- ✅ Integração com PRD-022 (stub): quando confirmed, dispara geração de orçamento
- ✅ Audit log em cada identificação criada/resolvida
- ✅ Permissões: SDR cria identificações; Vendedor/Gestor visualizam histórico

### Excluído

- ❌ OCR real (Tesseract, Google Vision) — Fase 2
- ❌ LLM para extração de atributos — Fase 2 (mas arquitetura preparada)
- ❌ Identificação por foto da peça (visão computacional) — Fase 2
- ❌ Identificação de peças usadas / com defeito específico — Fase 2
- ❌ Cross-sell / up-sell automático ("você também precisa de...") — Fase 2 com IA
- ❌ Histórico de "peças similares já compradas por outros clientes com o mesmo veículo" — Fase 2
- ❌ Edição manual da identificação pelo vendedor durante a conversa — fora do MVP
- ❌ Sugestão de peças compatíveis quando a peça pedida está em falta — Fase 2
- ❌ Identificação de peças OEM cruzando dados de fornecedores — Fase 2
- ❌ Multi-idioma — apenas pt-BR no MVP

---

## Requisitos Funcionais

### Modelo e tipos

- **RF-001:** Adicionar `IPartIdentification` e `IPartCandidate` em `src/shared/types/part-identification.ts`.
- **RF-002:** Lookup tables em `src/features/part-identification/data/`:
  - `brands.ts`: lista de marcas suportadas
  - `models.ts`: modelos por marca
  - `engines.ts`: motores por marca
  - `partCategories.ts`: categorias e subtipos
- **RF-003:** Tipos garantem extração tipada sem `any`.

### Engine de extração

- **RF-004:** Criar `extractAttributes(text: string, context: { conversation?: IConversation; customer?: ICustomer })` em `src/features/part-identification/engine/extract.ts` como função pura.
- **RF-005:** Implementar parsers individuais:
  - `extractBrand(text)`: busca por nomes de marcas (case-insensitive)
  - `extractModel(text)`: padrão `[marca]?\s+([A-Z]\d{3,4})` (Volvo R450, Scania R124)
  - `extractYear(text)`: regex `(19|20)\d{2}`
  - `extractEngine(text)`: lookup em lista de motores
  - `extractPartCategory(text)`: keywords (filtro, freio, correia, etc.)
  - `extractPartSubtype(text, category)`: keywords específicos por categoria
  - `extractOemCode(text)`: padrão numérico 10+ dígitos
- **RF-006:** Cada parser retorna `{ value?: string; confidence: number; matchedSubstring?: string }`.
- **RF-007:** Confidence agregada = média ponderada por relevância do atributo para a query.
- **RF-008:** Reaproveitamento de veículo cadastrado:
  - Se `context.customer` tem 1 veículo cadastrado E não há brand/model na mensagem, prepopula
  - Se tem múltiplos veículos, pergunta (via SDR — PRD-020): "Você tem [X] caminhões cadastrados, qual deles?"

### Engine de busca

- **RF-009:** Criar `searchCatalog(attributes): IPartCandidate[]` em `src/features/part-identification/engine/search.ts`.
- **RF-010:** No MVP, busca em mocks do PRD-030 (stub): filtra `IPart` cujas `applications` casam com `attributes.brand/model/year/engine`.
- **RF-011:** Se PRD-030 não estiver implementado ainda, retornar candidatos mockados estilizados — 3-5 peças plausíveis para a query.
- **RF-012:** Implementar `scoreCandidate(candidate, attributes): number`:
  - +0.35 se brand bate exatamente
  - +0.30 se model bate exatamente
  - +0.15 se year está dentro do range `yearStart-yearEnd` da aplicação
  - +0.10 se engine bate
  - +0.10 se partCategory bate
  - -0.05 se é peça equivalente (não original)
  - Total clamped em 0..1
- **RF-013:** Ordenar candidatos por score descendente; pegar top 3.

### Fluxo de confirmação

- **RF-014:** Função `decideAction(identification): { type: 'confirm_auto' | 'ask_user' | 'request_more_info' }`:
  - `confirm_auto`: se top candidato score > 0.9 E há apenas 1 candidato relevante
  - `ask_user`: se 2-3 candidatos com score > 0.6
  - `request_more_info`: se < 2 candidatos OU top score < 0.6
- **RF-015:** Função `formatConfirmationMessage(identification, action)`:
  - `confirm_auto`: "Encontrei: [Nome da peça] — R$ X. Confirma?"
  - `ask_user`: "Encontrei algumas opções: 1️⃣ ... 2️⃣ ... 3️⃣ ... Qual você quer?"
  - `request_more_info`: "Pra te ajudar melhor: [pergunta específica]"
- **RF-016:** Mensagem é enviada pelo SDR (PRD-020) como `authorType='sdr'` na conversa.

### Suporte a código OEM

- **RF-017:** Se `extractedAttributes.oemCode` está preenchido, busca direta no catálogo por código.
- **RF-018:** Match exato → confirm_auto.
- **RF-019:** Sem match → mensagem: "Não encontrei a peça com esse código. Você pode me dizer a marca e modelo do veículo?"

### Suporte a foto (placeholder)

- **RF-020:** Quando mensagem `in` tem `mediaType='image'`, SDR responde com texto:
  > "Vi a foto! No momento não consigo ler códigos automaticamente. Você consegue digitar o código numérico que aparece na peça? Ou me dizer marca, modelo e ano do caminhão?"
- **RF-021:** Mensagem registra em audit log que cliente enviou foto sem OCR ainda.

### Equivalências

- **RF-022:** Resultado `IPartCandidate[]` inclui peças equivalentes via `IPart.equivalents`.
- **RF-023:** Equivalentes têm flag `isEquivalent: true` e penalidade -0.05 no score.
- **RF-024:** Mensagem ao cliente sempre destaca equivalência: "Equivalente Mann (economia 32%)".

### Inspetor visual (no simulador do PRD-020)

- **RF-025:** Painel direito do simulador SDR (PRD-020) mostra também:
  - Atributos extraídos com cores por confidence (verde/amarelo/vermelho)
  - Lista de candidatos com scores expandidos
  - Decisão tomada (`confirm_auto` / `ask_user` / `request_more_info`)
  - Trace completo da busca

### Histórico de identificações

- **RF-026:** Aba "Histórico de identificações" no painel SDR (PRD-024 trata da visualização ampla, este PRD prepara dados):
  - Lista de `IPartIdentification` ordenadas por `createdAt` desc
  - Filtros: status (confirmed/rejected/failed), período
  - Click expande detalhe

### Integração com PRD-020 (SDR)

- **RF-027:** Quando SDR (PRD-020) detecta intent `identificar_peca`, chama `identifyPart(text, context)` e:
  - Cria `IPartIdentification` com status `'extracting'`
  - Aguarda resultado
  - Envia mensagem de confirmação para cliente baseada em `decideAction`
  - Atualiza `ISdrSession.collectedData.identifiedPart` quando confirmed
- **RF-028:** Quando cliente responde com escolha (ex: "2"), parser de resposta atualiza `IPartIdentification.status='confirmed'` e `customerConfirmedPartId`.

### Integração com PRD-022 (Orçamento)

- **RF-029:** Quando `IPartIdentification.status='confirmed'`, dispara fluxo do PRD-022 com `customerConfirmedPartId`.
- **RF-030:** Stub no MVP: cria `IQuote` mockado com a peça identificada.

### Permissões e audit

- **RF-031:** SDR cria identificações (via PRD-020).
- **RF-032:** Vendedor/Gestor visualizam histórico de identificações em conversas que veem.
- **RF-033:** Owner edita lookup tables (placeholder no MVP — Fase 2 sub-rota `/app/configuracoes/sdr/dicionarios`).
- **RF-034:** Audit log em criação/resolução de cada identificação.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `identifyPart()` executa em < 100ms (parsing local).
- **RNF-002 (Determinismo):** Mesma entrada produz mesma saída.
- **RNF-003 (Tipagem):** Zero `any`; tipos rigorosos por atributo.
- **RNF-004 (Acuidade no MVP):** Para casos típicos GALLO (Volvo/Scania/Mercedes/Ford/Iveco), identificação deve acertar marca em > 90% e modelo em > 70%.
- **RNF-005 (Arquitetura para LLM):** Substituir `extractAttributes` por versão LLM-based mantendo mesma interface; consumidores não mudam.

---

## Critérios de Aceitação

### Extração de atributos

```gherkin
DADO mensagem "preciso de filtro de óleo pro meu Volvo R450 2020 motor DC13"
QUANDO extractAttributes() processa
ENTÃO retorna {
  brand: "Volvo" (conf 1.0),
  model: "R450" (conf 0.95),
  year: 2020 (conf 1.0),
  engine: "DC13" (conf 0.90),
  partCategory: "filtro" (conf 0.95),
  partSubtype: "oleo" (conf 0.85)
}
  E confidence agregada > 0.85

DADO mensagem "tem freio pro Scania?"
QUANDO extractAttributes() processa
ENTÃO retorna {
  brand: "Scania",
  partCategory: "freio"
}
  E confidence agregada ~0.6 (modelo/ano faltando)
  E decisão = "request_more_info"
```

### Busca e scoring

```gherkin
DADO atributos {brand: Volvo, model: R450, year: 2020, partCategory: filtro, partSubtype: oleo}
QUANDO searchCatalog() processa
ENTÃO retorna candidates com peças cuja application casa
  E candidato top score > 0.85
  E equivalentes aparecem com isEquivalent=true e score -0.05

DADO scoring de candidato com brand match (+0.35), model match (+0.30), year no range (+0.15), categoria match (+0.10)
QUANDO scoreCandidate() processa
ENTÃO retorna 0.90
```

### Confirmação ao cliente

```gherkin
DADO identification com 3 candidatos, top score 0.92
QUANDO decideAction() processa
ENTÃO retorna "ask_user"
  E formatConfirmationMessage gera "🔎 Encontrei algumas opções: 1️⃣..."

DADO identification com 1 candidato, score 0.95
QUANDO decideAction() processa
ENTÃO retorna "confirm_auto"
  E mensagem é "Encontrei: [peça] - R$ X. Confirma?"

DADO identification com top score 0.5
QUANDO decideAction() processa
ENTÃO retorna "request_more_info"
  E mensagem é pergunta específica baseada no que faltou
```

### Suporte a OEM

```gherkin
DADO mensagem com texto "21380488" (código OEM válido)
QUANDO extractOemCode() processa
ENTÃO retorna code="21380488", confidence=1.0
  E searchCatalog busca direto por código
  E se acha match, decision é "confirm_auto"

DADO código OEM sem match no catálogo
QUANDO busca falha
ENTÃO mensagem: "Não encontrei a peça com esse código..."
```

### Foto (placeholder)

```gherkin
DADO cliente envia mensagem com mediaType="image"
QUANDO SDR processa
ENTÃO mensagem do SDR sai: "Vi a foto! No momento não consigo ler códigos automaticamente. Você consegue digitar o código numérico que aparece..."
  E audit log: "cliente enviou foto, OCR pendente Fase 2"
```

### Reaproveitamento de veículo cadastrado

```gherkin
DADO customer tem 1 veículo cadastrado (Volvo R450 2020)
  E cliente envia "preciso de filtro"
QUANDO extractAttributes() processa com context.customer
ENTÃO atributos prepopulados com brand=Volvo, model=R450, year=2020
  E SDR pula pergunta de modelo e vai direto para categoria/subtipo

DADO customer tem 5 veículos cadastrados (frota)
  E cliente envia "preciso de filtro"
QUANDO SDR processa
ENTÃO mensagem: "Você tem 5 caminhões cadastrados. Qual deles? 1️⃣ Volvo R450 placa ABC-1234 ..."
```

### Equivalências

```gherkin
DADO peça original "Filtro Volvo OEM 21380488" tem equivalents=[mannW11102, mahleOC568]
QUANDO searchCatalog retorna candidatos
ENTÃO inclui os 3 (original + 2 equivalentes)
  E equivalentes têm isEquivalent=true
  E mensagem destaca "equivalente Mann (economia 32%)"
```

### Cenários de erro

```gherkin
DADO catálogo vazio (PRD-030 placeholder)
QUANDO searchCatalog é chamada
ENTÃO retorna candidatos mockados estilizados como fallback
  E inspetor mostra "Catálogo em construção — usando dados de exemplo"

DADO confidence < 0.4 em todos atributos
QUANDO identifyPart processa
ENTÃO status='failed', mensagem ao cliente: "Não entendi muito bem. Pode me dizer marca e modelo do caminhão?"
  E SDR continua tentando próxima rodada
```

---

## Fases de Implementação

| Fase | Objetivo                                                             | Arquivos Estimados |
| ---- | -------------------------------------------------------------------- | ------------------ |
| 1    | Modelo, lookup tables, parsers individuais                           | 6-7                |
| 2    | Engine de busca + scoring + decideAction + formatConfirmationMessage | 4-5                |
| 3    | Integração com PRD-020 (SDR) + reaproveitamento de veículo           | 3-4                |
| 4    | Suporte a OEM + placeholder foto + equivalências                     | 3-4                |
| 5    | Inspetor no simulador + histórico + audit + polish                   | 3-4                |

### Detalhamento das Fases

#### Fase 1: Extração

- [ ] Tipos `IPartIdentification`, `IPartCandidate`
- [ ] Lookup tables (brands, models, engines, partCategories)
- [ ] Parsers individuais com confidence
- [ ] `extractAttributes()` orquestrando
- [ ] Testes manuais via console com 10+ frases típicas

**Validação:** parsers funcionam isoladamente; agregação retorna confidence sensata.

#### Fase 2: Busca e Decisão

- [ ] `searchCatalog()` (stub do PRD-030 com candidatos mockados)
- [ ] `scoreCandidate()` com pesos definidos
- [ ] `decideAction()` com 3 estratégias
- [ ] `formatConfirmationMessage()` com 3 templates

**Validação:** cenários típicos produzem decisões e mensagens esperadas.

#### Fase 3: Integração com SDR

- [ ] Modificar PRD-020 para chamar `identifyPart()` quando intent `identificar_peca`
- [ ] Status evoluindo (extracting → searching → awaiting_confirmation)
- [ ] Parser de resposta do cliente (ex: "1", "2", "3", "primeiro")
- [ ] Reaproveitamento de veículo via `context.customer.vehicles`

**Validação:** simulador funciona end-to-end com identificação.

#### Fase 4: OEM, Foto, Equivalências

- [ ] Reconhecimento de código OEM em texto
- [ ] Placeholder de foto com mensagem educativa
- [ ] Inclusão de equivalências nos resultados
- [ ] Destaque de economia em equivalentes

**Validação:** cliente digitando código OEM funciona; foto recebe resposta certa.

#### Fase 5: Inspetor, Histórico, Polish

- [ ] Inspetor no simulador (PRD-020) mostrando extração e candidatos
- [ ] Histórico de identificações (para PRD-024)
- [ ] Audit log padronizado
- [ ] Validação WCAG; mobile responsivo
- [ ] Documentação `docs/identificacao-peca.md`

**Validação:** inspetor mostra dados certos; histórico paginado funciona.

---

## Dependências

### PRDs Anteriores

| PRD                            | Status      |
| ------------------------------ | ----------- |
| PRD-002 (modelo)               | 📝 Redigido |
| PRD-016 (veículos cadastrados) | 📝 Redigido |
| PRD-020 (SDR — engine)         | 📝 Redigido |

### Dependências Futuras (placeholders)

| PRD                 | Como Lidar                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| PRD-030 (Catálogo)  | `searchCatalog()` retorna candidatos mockados quando catálogo não disponível |
| PRD-022 (Orçamento) | Stub: identificação confirmada dispara criação de quote mockado              |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD          | Status       |
| ------ | ------------ | ------------ |
| 1-11   | PRDs 010-020 | 📝           |
| **12** | **PRD-021**  | **🔄 ATUAL** |
| 13     | PRD-022      | ⏳           |
| 14     | PRD-023      | ⏳           |
| 15     | PRD-024      | ⏳           |

---

## Considerações de Segurança

### Acuidade não 100%

MVP usa keywords + lookup. Erros são esperados. Por isso confirmação com cliente é etapa obrigatória — sem isso, riscamos vender peça errada.

### Foto sem OCR

Cliente pode enviar foto de plaqueta com dados pessoais (placa do caminhão visível). No MVP, foto não é processada — sem risco LGPD imediato. Fase 2 com OCR exige tratamento adequado.

### Logs de identificações

`IPartIdentification` registra texto bruto do cliente. Pode conter PII (nome do caminhoneiro, telefone). Cuidado em backups e exports na Fase 2.

---

## Fluxos de Usuário

### Fluxo Principal — Identificação bem-sucedida

1. Cliente: "preciso filtro óleo pro Volvo R450 2020"
2. SDR detecta intent (PRD-020), chama `identifyPart()`
3. Engine extrai todos atributos com confidence 0.88
4. Busca no catálogo: 1 candidato dominante (filtro de óleo Volvo 21380488)
5. `decideAction` retorna `confirm_auto`
6. SDR envia: "Encontrei: Filtro de óleo Volvo R450 (cód. 21380488) - R$ 95. Confirma?"
7. Cliente: "sim"
8. `IPartIdentification.status='confirmed'`, dispara PRD-022 para orçamento

### Fluxo Alternativo — Ambiguidade

1. Cliente: "tem filtro pro Volvo R450?"
2. Engine extrai brand + model + categoria, mas não subtype nem year
3. 3 candidatos com scores similares (óleo, ar, combustível)
4. `decideAction` retorna `ask_user`
5. SDR envia lista com 3 opções
6. Cliente escolhe "1" (óleo)
7. Status='confirmed', segue fluxo

### Fluxo de Erro — Confidence baixa

1. Cliente: "preciso de uma peça"
2. Engine não consegue extrair nada relevante (confidence 0.2)
3. `decideAction` retorna `request_more_info`
4. SDR envia: "Pra te ajudar melhor, me diz a marca e modelo do caminhão e que tipo de peça?"
5. Cliente responde com detalhes, ciclo recomeça

### Fluxo Foto (placeholder)

1. Cliente envia foto da peça antiga
2. SDR detecta `mediaType='image'`
3. Responde: "Vi a foto! No momento não consigo ler códigos automaticamente. Você consegue digitar o código numérico que aparece?"
4. Cliente: "21380488"
5. Engine busca por OEM, encontra match
6. Confirma e segue

---

## Convenções de Código

| Elemento          | Convenção                 | Exemplo                                                      |
| ----------------- | ------------------------- | ------------------------------------------------------------ |
| **Engine**        | camelCase, função pura    | `identifyPart()`, `extractAttributes()`, `searchCatalog()`   |
| **Tipos**         | PascalCase com `I`        | `IPartIdentification`, `IPartCandidate`                      |
| **Lookup tables** | camelCase, default export | `brands.ts` exporta `BRANDS`                                 |
| **Pasta**         | kebab-case                | `part-identification/`, `data/`, `engine/`                   |
| **Git commits**   | Conventional              | `feat(part-id): add part identification engine with scoring` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                        | Descrição                                                        |
| -------------------------------- | ---------------------------------------------------------------- |
| **Confirmação sempre**           | Mesmo com confidence alta, melhor confirmar — peça errada é caro |
| **Reaproveitamento de contexto** | Veículo cadastrado economiza turnos da conversa                  |
| **Equivalências aumentam venda** | Sempre incluir; cliente decide                                   |
| **Foto sem OCR é OK no MVP**     | Resposta educativa redireciona cliente                           |
| **Arquitetura para LLM**         | Interface da engine não muda na Fase 2                           |
| **Scoring transparente**         | Inspetor mostra todos os pesos — útil para debug                 |

### O que NÃO Fazer

| ❌ Evitar                                                             |
| --------------------------------------------------------------------- |
| Implementar OCR real no MVP — placeholder educativo                   |
| Implementar LLM real — keywords + lookup tables                       |
| Esquecer confirmação com cliente                                      |
| Não incluir equivalências (perde venda)                               |
| Implementar catálogo aqui — stub do PRD-030                           |
| Implementar criação de orçamento — stub do PRD-022                    |
| Permitir vendedor editar identificação durante conversa — fora do MVP |
| Confidence binária (sim/não) — usar gradient                          |

---

## Status de Implementação

| Campo      | Valor                             |
| ---------- | --------------------------------- |
| **Status** | ✅ IMPLEMENTADO (v0.18.0 — Scout) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — engine de identificação com extração de atributos, busca e scoring, confirmação com cliente, suporte a OEM, placeholder de foto, equivalências |

---

**AILA - Sistemas Inteligentes**
