# PRD-016: Veículos do Cliente

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                     |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                          |
| **Objetivo**          | Tratar veículos como entidade de primeira classe — listagem geral, ficha de detalhe, histórico de manutenção, cadastro configurável em 3 modos, e recomendações proativas baseadas em km/uso |
| **Tipo**              | Feature                                                                                                                                                                                      |
| **Complexidade**      | Alta                                                                                                                                                                                         |
| **Total de Fases**    | 5                                                                                                                                                                                            |
| **Prioridade**        | Alta                                                                                                                                                                                         |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                       |
| **PRDs Relacionados** | PRD-012 (Ficha do Cliente), PRD-015 (Lista de Clientes), PRD-030 (Catálogo), PRD-031 (Orçamento), PRD-032 (Pedido), PRD-019 (Configurações)                                                  |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                             |
| **Padrão de código**  | Feature-based; código em `src/features/vehicles/`; reutiliza `<DetailLayout>` do PRD-003                                                                                                     |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** entidade transversal consumida por ficha do cliente (PRD-012), orçamento (PRD-031), pedido (PRD-032), recomendações (PRD-053); cadastro configurável em 3 modos (auto/aprovação/manual) com lógica de aprovação por gestor; histórico de manutenção com derivação automática a partir de pedidos pagos contendo peças; recomendações proativas calculadas via km + intervalo; tela de listagem com filtros (marca/modelo/ano/motor/cliente/cidade); página de detalhe com seções (dados técnicos, histórico, peças compatíveis); integração com aplicações do catálogo (PRD-030 ainda não implementado — placeholder coerente).

---

## Contexto do Problema

A GALLO BASE DIESEL atende **frotas de caminhões**. Um cliente B2B típico ("Transportadora Aurora") tem 8 a 30 caminhões — Volvo R450, Scania R124, Mercedes Actros, Iveco Stralis, Ford Cargo. Cada caminhão tem motor diferente, ano diferente, quilometragem diferente, histórico de manutenção único. Vender peças para essa frota sem conhecer os veículos é venda no escuro:

**Vendedor pergunta "qual o caminhão?" toda vez.** Cliente já mandou semana passada. Sem ficha do veículo, vendedor sempre depende da memória do cliente — que pode estar errada ou cansado de repetir. **Aplicações (peça↔veículo) ficam isoladas no catálogo.** O catálogo (PRD-030) tem aplicações: "Filtro X é compatível com Scania R450 motor DC13 anos 2018-2024". Mas se não há ficha do veículo do cliente conectada, vendedor copia/cola entre telas. **Manutenção preventiva passa em branco.** Caminhão a 240k km precisa de revisão pesada. Sem cálculo automatizado de "esse veículo está perto da revisão dos 250k", oportunidades de venda evaporam.

Este PRD entrega: `IVehicle` como entidade de primeira classe (já modelada no PRD-002), tela de listagem geral `/app/veiculos`, página de detalhe `/app/veiculos/:id`, histórico de manutenção derivado de pedidos, recomendações proativas baseadas em km, cadastro configurável em 3 modos (com lógica de aprovação por gestor), e integração com a tab Veículos da ficha do cliente (PRD-012).

---

## Conceito da Solução

### Entidade IVehicle (PRD-002)

Já modelada:

```typescript
IVehicle {
  id: ID;
  customerId: ID;
  brand: 'Volvo' | 'Scania' | 'Mercedes-Benz' | 'Ford' | 'Iveco' | string;  // string para casos especiais
  model: string;        // ex: "R450", "FH540", "Actros 2651"
  year: number;
  engine?: string;      // ex: "DC13", "OM457LA", "MX-13"
  plate?: string;       // placa (opcional)
  vin?: string;         // chassi (opcional)
  currentKm?: number;
  serviceHistory: IVehicleServiceEntry[];
  cadastroStatus: 'aprovado' | 'pendente' | 'rejeitado';
  storeId: ID;
  createdAt: ISO8601;
}

IVehicleServiceEntry {
  vehicleId: ID;
  orderId?: ID;            // se foi derivado de um pedido
  parts: string[];          // nomes das peças instaladas (snapshot)
  date: ISO8601;
  km?: number;              // km no momento da troca
  notes?: string;
}
```

### Cadastro configurável em 3 modos

`IPlatformSettings.vehicleCadastroMode` define padrão da loja, sobrescrito opcionalmente por `ISeller.vehicleCadastroMode`:

| Modo       | Comportamento                                                                       |
| ---------- | ----------------------------------------------------------------------------------- |
| `auto`     | Vendedor cadastra; `cadastroStatus` vira `aprovado` imediatamente                   |
| `approval` | Vendedor cadastra; `cadastroStatus` fica `pendente`; Gestor revisa e aprova/rejeita |
| `manual`   | Apenas Gestor/Owner cadastra; vendedor não tem o botão "Adicionar"                  |

Aplicação na UI:

- Tab Veículos da ficha (PRD-012)
- Página `/app/veiculos`
- Página de detalhe `/app/veiculos/:id`

### Lista geral `/app/veiculos`

Tabela paginada com colunas:

- Avatar/ícone (montadora)
- Marca + modelo + ano
- Motor
- Placa
- Cliente proprietário (link para ficha)
- Vendedor responsável (do cliente)
- Km atual
- Última manutenção (data)
- Status de cadastro (badge)

Filtros:

- Marca (multi-select)
- Modelo (autocomplete)
- Ano (faixa)
- Motor (autocomplete)
- Cliente (autocomplete por nome)
- Status de cadastro
- Loja (Owner only)

Busca textual: placa, VIN, modelo, nome do cliente.

Ações em lote (Owner/Gestor):

- Aprovar pendentes (selecionar múltiplos pendentes)
- Rejeitar pendentes

### Página de detalhe `/app/veiculos/:id`

Layout `DetailLayout` com seções:

1. **Header**: marca + modelo + ano + foto/ícone + badge cadastroStatus + botões (editar, dispensar)
2. **Dados técnicos**: motor, chassi, placa, km atual (editável inline com confirmação), data de cadastro
3. **Proprietário**: card do cliente (avatar + nome + link para ficha)
4. **Histórico de manutenção**: linha do tempo cronológica reversa de `IVehicleServiceEntry`
5. **Recomendações de manutenção**: cards previsivos baseados em km
6. **Peças compatíveis**: catálogo filtrado por aplicações que casam com este veículo (link para PRD-030)

### Histórico de manutenção

Duas origens:

1. **Manual**: vendedor adiciona entry manualmente (data, peças trocadas, km, notas)
2. **Derivado**: ao fechar um `IOrder` com `customerId` que tem veículo, sistema sugere "associar este pedido ao veículo X?" — se sim, gera `IVehicleServiceEntry` com `orderId`

No MVP, derivação é manual via botão "Associar pedido". Na Fase 2 (com IA), pode ser automática.

### Recomendações de manutenção previsível

Heurística simples baseada em km:

| Tipo                            | Intervalo padrão        | Última manutenção       |
| ------------------------------- | ----------------------- | ----------------------- |
| Filtros (óleo, ar, combustível) | 30.000 km               | Última troca registrada |
| Correia dentada                 | 100.000 km              | Última troca            |
| Freios                          | 80.000 km               | Última troca            |
| Revisão completa                | 250.000 km / 500.000 km | Marcadores específicos  |

Quando `currentKm` se aproxima de `ultimaManutencao + intervalo` (faltam < 5.000 km), gera `IRecommendation` tipo `predictable_maintenance` que aparece:

- Tab Recomendações da ficha do cliente (PRD-012)
- Página de detalhe do veículo
- Painel do gestor (PRD-014) como alerta

Configuração desses intervalos: futura (Fase 2 com curadoria de catálogo).

### Aplicações: peças compatíveis

Veículo + Catálogo (PRD-030) → mostra peças aplicáveis:

- `IPart.applications` contém `[{vehicleBrand, vehicleModel, yearStart, yearEnd, engine?}]`
- Filtrar catálogo onde alguma aplicação casa com `vehicle.brand + model + year + engine`
- Mostrar como lista linkando para ficha de produto (PRD-063 / catálogo interno PRD-030)

No MVP, PRD-030 ainda não implementado — placeholder estilizado coerente.

### Tab Veículos da ficha do cliente (PRD-012)

Já especificada no PRD-012. Este PRD garante que o componente que renderiza essa tab vem deste módulo, com:

- Cards de veículos (até 5 visíveis + "Ver todos" → `/app/veiculos?customerId=X`)
- Botão "Adicionar veículo" (conforme modo de cadastro)
- Quando cliente B2B tem frota grande (> 5 veículos), preview compacto + ações de drill-down

### Alternativas Consideradas

| Alternativa                                                                     | Por que foi descartada                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Veículo apenas como atributo do cliente (string em campo "veículos do cliente") | Quebra normalização; histórico de manutenção impossível; aplicações impossíveis                       |
| Sem cadastro configurável (sempre `auto`)                                       | GALLO disse que querem aprovar veículos por Gestor para evitar duplicatas — flexibilidade obrigatória |
| Sem recomendações de manutenção                                                 | Oportunidade comercial perdida; vendedor precisa lembrar manualmente                                  |
| Sem aplicações no detalhe do veículo                                            | Cliente pergunta "qual peça serve no meu caminhão?" — sem essa visão, vendedor improvisa              |
| Histórico de manutenção como texto livre                                        | Estruturado permite agregações futuras (gráficos de manutenção)                                       |
| Veículo cross-cliente (compartilhamento)                                        | Caminhão pertence a uma empresa só; multi-tenant complica desnecessariamente                          |

**Decisão consolidada:** **veículo como entidade primária, cadastro em 3 modos, histórico estruturado, recomendações por heurística simples, integração com catálogo via aplicações.**

---

## Escopo

### Incluído

- ✅ Rota `/app/veiculos` substituindo placeholder do PRD-003 — listagem geral com filtros
- ✅ Rota `/app/veiculos/:id` — página de detalhe completa
- ✅ Listagem com 9 colunas + filtros (marca, modelo, ano, motor, cliente, status, loja)
- ✅ Busca textual (placa, VIN, modelo, nome do cliente)
- ✅ Configuração de modo de cadastro em `IPlatformSettings.vehicleCadastroMode`
- ✅ Override por vendedor em `ISeller.vehicleCadastroMode` (campo opcional adicionado ao PRD-002)
- ✅ Modal `<NewVehicleModal>` para criação rápida — comportamento conforme modo:
  - `auto`: cria com status `aprovado`
  - `approval`: cria com status `pendente`, gestor notificado
  - `manual`: botão desabilitado para vendedor; visível para gestor
- ✅ Página de detalhe com 6 seções (header, dados técnicos, proprietário, histórico, recomendações, peças compatíveis)
- ✅ Edição inline de `currentKm` (com confirmação se mudança > 50.000 km de uma vez)
- ✅ Histórico de manutenção:
  - Adicionar entry manual via modal
  - Associar entry a pedido (selecionar `IOrder` com mesmo customerId)
- ✅ Recomendações de manutenção via heurística simples (intervalos fixos no MVP)
- ✅ Peças compatíveis: filtragem do catálogo (placeholder estilizado até PRD-030 implementado)
- ✅ Ações em lote no `/app/veiculos`: aprovar/rejeitar pendentes (Owner/Gestor)
- ✅ Audit log em criação, edição de km, aprovação/rejeição, adição de manutenção
- ✅ Integração com tab Veículos da ficha (PRD-012) — componente `<CustomerVehiclesList>` reutilizado
- ✅ Permissões: Vendedor cadastra para clientes da sua carteira; Gestor cadastra/aprova/rejeita; Owner tudo cross-store
- ✅ Empty states contextuais

### Excluído

- ❌ Geolocalização do veículo (GPS) — fora do MVP
- ❌ Telemetria em tempo real — fora
- ❌ Integração com sistema da montadora para extrair histórico — Fase 2
- ❌ Cadastro via foto da placa (OCR) — Fase 2 com IA
- ❌ Documentos vinculados ao veículo (CRLV, IPVA) — Fase 2
- ❌ Edição em massa de km (atualizar km de N veículos de uma vez) — fora do MVP
- ❌ Veículos arquivados/inativos — fora do MVP (sempre considerar ativos)
- ❌ Histórico de troca de proprietário (cliente A vendeu caminhão para cliente B) — Fase 2
- ❌ Cálculo automático de manutenção com IA — heurística simples no MVP
- ❌ Configuração de intervalos personalizada pelo cliente — Fase 2

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Validar que `IVehicle` (PRD-002) está completo e gerado pelos mocks do PRD-004 (60 veículos vinculados a 25 clientes B2B).
- **RF-002:** Adicionar campo opcional `vehicleCadastroMode?: 'auto' | 'approval' | 'manual'` em `ISeller` (override do default da loja).
- **RF-003:** Verificar que `IPlatformSettings.vehicleCadastroMode` está com default `'auto'` no MVP.

### Listagem `/app/veiculos`

- **RF-004:** Criar `VehiclesListPage` em `src/features/vehicles/pages/`, rota `/app/veiculos`.
- **RF-005:** Tabela com colunas obrigatórias: avatar/ícone, marca+modelo+ano, motor, placa, cliente (link), vendedor, km, última manutenção, status cadastro.
- **RF-006:** Filtros no header:
  - Marca (multi-select)
  - Modelo (autocomplete em texto)
  - Ano (faixa: mín-máx)
  - Motor (autocomplete)
  - Cliente (autocomplete por nome)
  - Status cadastro (multi-select)
  - Loja (multi-select, Owner only)
- **RF-007:** Busca textual no header: placa, VIN, modelo, nome do cliente — debounce 300ms.
- **RF-008:** Paginação 50/página com ordenação por colunas (default: data de cadastro desc).
- **RF-009:** URL sync para todos os filtros, busca, ordenação.
- **RF-010:** Multi-select em linhas para ações em lote: "Aprovar selecionados" e "Rejeitar selecionados" — visíveis apenas para Owner/Gestor com `vehicle.approve` permission.
- **RF-011:** Click numa linha navega para `/app/veiculos/:id`.

### Modal de criação

- **RF-012:** Botão "+ Veículo" no header. Comportamento conforme modo efetivo (settings da loja sobrescrito por settings do user):
  - `auto`: botão habilitado, cria direto
  - `approval`: botão habilitado, cria com pendente
  - `manual`: botão visível apenas para Owner/Gestor (Vendedor não vê)
- **RF-013:** Modal `<NewVehicleModal>` com campos:
  - Cliente proprietário (autocomplete obrigatório — apenas clientes da carteira do user atual; Owner vê todos)
  - Marca (dropdown: Volvo / Scania / Mercedes-Benz / Ford / Iveco / Outro)
  - Modelo (texto, obrigatório)
  - Ano (input numérico, validação 1990 a ano atual + 1)
  - Motor (texto, opcional)
  - Placa (texto, validação básica de formato brasileiro: 7 chars)
  - VIN/Chassi (texto, opcional, validação 17 chars)
  - Km atual (numérico, opcional)
- **RF-014:** Ao salvar, criar `IVehicle` com `cadastroStatus` conforme modo, `storeId` do user atual, `createdAt`.
- **RF-015:** Audit log via PRD-006.
- **RF-016:** Após criar, navegar para `/app/veiculos/:id`.

### Página de detalhe `/app/veiculos/:id`

- **RF-017:** Criar `VehicleDetailPage` usando `DetailLayout` ou layout customizado.
- **RF-018:** Header com:
  - Ícone/foto da montadora (SVG estático do PRD-001)
  - Marca + modelo + ano em grande
  - Badge de cadastroStatus
  - Botão "Editar" (modal de edição)
  - Botão "Adicionar manutenção" (modal de service entry)
- **RF-019:** Seção "Dados técnicos":
  - Motor
  - Chassi/VIN (mostrar mascarado por padrão, click para revelar)
  - Placa
  - Km atual com botão "atualizar" inline:
    - Click → input editável
    - Salvar → confirmação se mudança > 50.000 km de uma vez ("Tem certeza? Mudança grande detectada.")
    - Atualizar via provider + audit log
  - Data de cadastro
- **RF-020:** Seção "Proprietário": card do cliente (avatar + nome + tipo B2B/B2C + link para ficha PRD-012).
- **RF-021:** Seção "Histórico de manutenção":
  - Timeline cronológica reversa (mais recente em cima)
  - Cada entry: data, km no momento, peças trocadas (snapshot textual), link para pedido (se foi derivado), notas
  - Botão "+ Adicionar manutenção" abre modal:
    - Data (date picker, default hoje)
    - Km (numérico)
    - Peças (multi-input de strings)
    - Notas (textarea opcional)
    - Toggle "Associar a um pedido" → autocomplete de pedidos do mesmo cliente
- **RF-022:** Seção "Recomendações de manutenção":
  - Calcula via heurística: para cada tipo (filtros, correia, freios, revisão), se `currentKm + 5000` ≥ `ultimaManutencao(tipo) + intervalo`, gerar recomendação
  - Card por recomendação com tipo, km estimado, mensagem ("Filtros devem ser trocados nos próximos 5.000 km — última troca há 32.000 km")
  - Botão "Criar orçamento" para essa recomendação (atalho para PRD-031 com peças sugeridas)
- **RF-023:** Seção "Peças compatíveis":
  - Filtragem do catálogo (`IPart.applications` casando com este veículo)
  - Lista de até 10 peças mais relevantes
  - Botão "Ver todas" para `/app/catalogo?veiculo=:id` (placeholder até PRD-030)
  - Placeholder coerente se PRD-030 ainda não implementado: mostrar 5 peças mockadas com "Catálogo completo disponível em breve"

### Aprovação de cadastro

- **RF-024:** Para veículos com `cadastroStatus: 'pendente'`:
  - Banner amarelo no header do detalhe: "Cadastro pendente de aprovação. [Aprovar] [Rejeitar]"
  - Botões visíveis para Owner/Gestor com permission `vehicle.approve`
  - Aprovar muda para `'aprovado'`; rejeitar muda para `'rejeitado'` (com modal pedindo motivo)
  - Audit log obrigatório
- **RF-025:** Na lista `/app/veiculos`, filtro rápido "Pendentes" exibe apenas pending; útil para Gestor revisar em lote.
- **RF-026:** Notificação ao vendedor que cadastrou quando o gestor aprova/rejeita (toast + badge na inbox de configurações).

### Tab Veículos da ficha do cliente (integração com PRD-012)

- **RF-027:** Criar componente `<CustomerVehiclesList customerId>` em `src/features/vehicles/components/`.
- **RF-028:** Listar até 5 veículos do cliente em cards compactos.
- **RF-029:** Cada card: marca + modelo + ano + motor + placa + km atual + última manutenção + botão "Ver detalhes" (link para `/app/veiculos/:id`).
- **RF-030:** Se cliente tem > 5 veículos, mostrar 5 + link "Ver todos os N veículos" → `/app/veiculos?cliente=:customerId`.
- **RF-031:** Botão "+ Adicionar veículo" no topo da tab — comportamento conforme modo de cadastro (igual ao da lista geral).

### Permissões

- **RF-032:** **Vendedor**: lista apenas veículos de clientes da sua carteira; cria conforme modo de cadastro; edita km de veículos da carteira; não aprova nem rejeita; não vê filtro Loja.
- **RF-033:** **Gestor**: lista veículos da loja; aprova/rejeita pendentes; cria livremente; edita qualquer.
- **RF-034:** **Owner**: cross-store; tudo.
- **RF-035:** **Cliente B2B no portal** (PRD-071): vê apenas seus veículos; não cria (a menos que portal permita — Fase 2).

### Audit log

- **RF-036:** Audit log em todas as mutations: criar, editar (qualquer campo), atualizar km, aprovar, rejeitar, adicionar manutenção, associar pedido.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Lista de 60 veículos + filtros renderiza em < 350ms.
- **RNF-002 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado em filtros e tabela; foco visível em cards.
- **RNF-003 (Responsividade):** Mobile usável; cards de veículo em coluna única em < 768px.
- **RNF-004 (Tipagem):** Zero `any`; tipos do PRD-002 respeitados.
- **RNF-005 (Compatibilidade Fase 2):** Estrutura prepara integração futura com APIs de montadoras para extrair histórico oficial.

---

## Critérios de Aceitação

### Listagem e filtros

```gherkin
DADO que sou Owner e acesso /app/veiculos
QUANDO a página carrega
ENTÃO vejo tabela com 50 veículos paginada
  E filtros disponíveis no header (incluindo Loja)

DADO que aplico filtro Marca=Volvo, Ano=2018-2024
QUANDO os filtros aplicam
ENTÃO tabela mostra apenas Volvos do período
  E URL atualiza para refletir

DADO que sou Vendedor (Carlos)
QUANDO acesso /app/veiculos
ENTÃO vejo apenas veículos de clientes da minha carteira (filtragem implícita)
```

### Cadastro em 3 modos

```gherkin
DADO que vehicleCadastroMode da loja é "auto" e sou Vendedor
QUANDO crio um veículo via modal
ENTÃO veículo é criado com cadastroStatus="aprovado" imediatamente
  E aparece na lista normalmente

DADO que vehicleCadastroMode é "approval" e sou Vendedor
QUANDO crio um veículo
ENTÃO veículo é criado com cadastroStatus="pendente"
  E gestor da loja é notificado (audit + alerta visual)
  E veículo aparece na lista com badge "Pendente"

DADO que vehicleCadastroMode é "manual" e sou Vendedor
QUANDO procuro botão "+ Veículo"
ENTÃO ele NÃO está visível na minha interface
  E só Gestor/Owner pode cadastrar

DADO que sou Vendedor com vehicleCadastroMode override "auto"
  E loja está em "approval"
QUANDO crio veículo
ENTÃO o override do meu user prevalece — criado direto como aprovado
```

### Página de detalhe

```gherkin
DADO um veículo com currentKm=240000
QUANDO clico em "atualizar" no km e mudo para 245000
ENTÃO valor é salvo sem confirmação (mudança razoável)

QUANDO mudo de 240000 para 300000 (mudança > 50000)
ENTÃO modal de confirmação aparece: "Mudança grande detectada. Confirmar?"
  E confirmar salva; cancelar reverte
  E auditLog registra a mudança grande

DADO um veículo com última troca de filtros há 28.000 km
  E currentKm=58000 (próximo do 60.000 da regra de filtros)
QUANDO observo seção "Recomendações de manutenção"
ENTÃO vejo card "Filtros devem ser trocados nos próximos X km"
  E botão "Criar orçamento" abre PRD-031 com peças sugeridas
```

### Aprovação

```gherkin
DADO que sou Gestor e há 3 veículos pendentes
QUANDO acesso /app/veiculos e filtro "Status=Pendente"
ENTÃO vejo os 3 pendentes
  E posso selecionar todos e clicar "Aprovar selecionados"

DADO que aprovo um veículo individual via página de detalhe
QUANDO clico "Aprovar"
ENTÃO status muda para "aprovado"
  E vendedor que cadastrou recebe toast/notificação
  E audit log registra
```

### Aplicações (peças compatíveis)

```gherkin
DADO um veículo Volvo R450 motor DC13 ano 2020
  E o catálogo tem 15 peças com aplicação que casa
QUANDO abro seção "Peças compatíveis"
ENTÃO vejo lista de até 10 peças mais relevantes
  E posso clicar "Ver todas" para listagem completa (placeholder até PRD-030)
```

### Tab Veículos na ficha do cliente

```gherkin
DADO um cliente B2B com 8 veículos
QUANDO abro a tab Veículos na ficha
ENTÃO vejo 5 cards + link "Ver todos os 8 veículos"
  E clicar no link navega para /app/veiculos?cliente=X
  E vejo botão "+ Adicionar veículo" conforme modo de cadastro
```

### Cenários de erro

```gherkin
DADO um veículo com cadastroStatus="rejeitado"
QUANDO observo o detalhe
ENTÃO vejo banner vermelho "Cadastro rejeitado: [motivo]"
  E botões para reapresentar (vendedor que cadastrou) ou editar

DADO que tento criar veículo sem cliente proprietário selecionado
QUANDO submeto o modal
ENTÃO validação inline: "Selecione um cliente"
  E botão Salvar fica desabilitado

DADO que tento cadastrar duplicata (mesma placa para mesmo cliente)
QUANDO o save processa
ENTÃO alerta: "Já existe um veículo com placa XXX-1234 para este cliente"
```

---

## Fases de Implementação

| Fase | Objetivo                                                           | Arquivos Estimados |
| ---- | ------------------------------------------------------------------ | ------------------ |
| 1    | Listagem geral + filtros + busca + ordenação                       | 5-6                |
| 2    | Modal de criação + lógica de modos + integração na ficha (PRD-012) | 4-5                |
| 3    | Página de detalhe completa (6 seções)                              | 6-7                |
| 4    | Histórico de manutenção + recomendações de manutenção              | 4-5                |
| 5    | Aprovação/rejeição + notificações + auditoria + polish             | 3-4                |

### Detalhamento das Fases

#### Fase 1: Listagem

**Objetivo:** explorar veículos da loja

**Ações:**

- [ ] Criar `VehiclesListPage` em `src/features/vehicles/pages/`
- [ ] Implementar tabela com colunas configuráveis (igual padrão PRD-015)
- [ ] 7 filtros + busca textual + ordenação + paginação
- [ ] URL sync de todos os estados

**Validação:** lista 60 veículos com filtros funcionais.

#### Fase 2: Criação e Modos

**Objetivo:** cadastro funcional em 3 modos

**Ações:**

- [ ] `<NewVehicleModal>` com validação de campos
- [ ] Lógica de modo efetivo (settings da loja → override do user)
- [ ] Botão "+ Veículo" visível conforme modo
- [ ] Integrar `<CustomerVehiclesList>` na tab Veículos da ficha (PRD-012)
- [ ] Validação anti-duplicata (mesma placa para mesmo cliente)
- [ ] Audit log na criação

**Validação:** 3 modos funcionam corretamente; tab Veículos da ficha consome este componente.

#### Fase 3: Página de Detalhe

**Objetivo:** ficha completa do veículo

**Ações:**

- [ ] `VehicleDetailPage` com 6 seções
- [ ] Edição inline de km com confirmação para mudanças grandes
- [ ] Link para ficha do cliente proprietário
- [ ] Placeholder coerente para "Peças compatíveis" (até PRD-030 implementado)
- [ ] Modal de edição completa para outros campos

**Validação:** página de detalhe completa; edições funcionais.

#### Fase 4: Manutenção e Recomendações

**Objetivo:** histórico estruturado e proativo

**Ações:**

- [ ] Implementar timeline de histórico de manutenção
- [ ] Modal "+ Adicionar manutenção" com opção de associar a pedido
- [ ] Heurística de recomendações (intervalos fixos)
- [ ] Cards de recomendação com "Criar orçamento" como atalho

**Validação:** adicionar manutenção manualmente; recomendações aparecem para veículos com km próximo do intervalo.

#### Fase 5: Aprovação e Polish

**Objetivo:** ciclo de cadastro completo

**Ações:**

- [ ] Aprovação/rejeição individual via detalhe
- [ ] Aprovação em lote na lista
- [ ] Notificação ao vendedor quando gestor aprova/rejeita
- [ ] Banners de status nos detalhes
- [ ] Empty states em todas as seções
- [ ] Mobile responsivo

**Validação:** fluxo completo de aprovação; gestor recebe pendentes; vendedor é notificado.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                         | Status                             |
| ------- | --------------------------------- | ---------------------------------- |
| PRD-002 | Modelo (IVehicle)                 | 📝 Redigido                        |
| PRD-003 | Shell                             | 📝 Redigido                        |
| PRD-005 | Provider Pattern                  | 📝 Redigido                        |
| PRD-006 | RBAC (vehicle.approve permission) | 📝 Redigido                        |
| PRD-012 | Ficha do Cliente (tab Veículos)   | 📝 Redigido                        |
| PRD-030 | Catálogo (aplicações)             | ⏳ Pendente — placeholder coerente |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD          | Título                  | Status       |
| ----- | ------------ | ----------------------- | ------------ |
| 1-6   | PRDs 010-015 | CRM core                | 📝           |
| **7** | **PRD-016**  | **Veículos do Cliente** | **🔄 ATUAL** |
| 8+    | PRDs 017-019 | Demais do Bloco 1       | ⏳           |

---

## Considerações de Segurança

### Acesso aos veículos respeita carteira

Vendedor não consegue ver veículos de clientes que não são seus — filtragem implícita via PRD-006/007.

### Edição de km tem proteção

Mudança > 50.000 km de uma vez exige confirmação para evitar erros de digitação que invalidariam o histórico.

### Aprovação centralizada

Modo `approval` garante que duplicatas e dados duvidosos passem pelo crivo do gestor antes de entrar no catálogo de veículos.

---

## Fluxos de Usuário

### Fluxo Principal — Vendedor cadastra novo veículo

1. Carlos atende cliente "Aurora" que tem caminhão novo
2. Vai para `/app/clientes/aurora` → tab Veículos
3. Clica "+ Adicionar veículo"
4. Modal abre com cliente já preenchido
5. Preenche: Volvo, FH540, 2024, motor MX-13, placa XYZ-9999, km 8.500
6. Salva — modo é `auto` na loja → veículo criado e aprovado
7. Tab Veículos atualiza com o novo card

### Fluxo Alternativo — Modo aprovação

1. Loja está em modo `approval`
2. Carlos cadastra veículo → fica pendente
3. Marina (Gestor) recebe alerta no PRD-014 (Painel)
4. Acessa `/app/veiculos?status=pendente` → vê 1 pendente
5. Abre detalhe, confirma dados, aprova
6. Carlos recebe toast "Veículo aprovado"

### Fluxo de Recomendação Proativa

1. Sistema detecta: caminhão de "Aurora" com km 58.000 e última troca de filtros aos 30.000 km (intervalo 30.000 km)
2. Gera `IRecommendation` tipo `predictable_maintenance`
3. Aparece no PRD-012 (tab Recomendações) e no detalhe do veículo
4. Carlos vê, contata cliente: "Seu Volvo está próximo da troca de filtros"
5. Cliente confirma, Carlos cria orçamento com peças sugeridas

### Fluxo Mobile

1. Marina abre /app/veiculos no celular
2. Lista compacta em cards verticais
3. Toca em veículo → detalhe em tela cheia
4. Edita km, adiciona manutenção
5. Volta → lista preservada

---

## Convenções de Código (Referência Rápida)

| Elemento        | Convenção            | Exemplo                                                     |
| --------------- | -------------------- | ----------------------------------------------------------- |
| **Página**      | PascalCase + `Page`  | `VehiclesListPage`, `VehicleDetailPage`                     |
| **Componentes** | PascalCase           | `<NewVehicleModal>`, `<CustomerVehiclesList>`               |
| **Hooks**       | camelCase + `use`    | `useVehiclesList`, `useVehicleDetail`                       |
| **Pasta**       | kebab-case           | `vehicles/`                                                 |
| **Git commits** | Conventional Commits | `feat(vehicles): add vehicle management with approval flow` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                                  | Descrição                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| **Veículo é entidade primária**            | Não atributo do cliente — vida própria, histórico próprio                   |
| **3 modos de cadastro**                    | Configuração da loja sobrescrita por do user; sempre consultar modo efetivo |
| **Histórico é estruturado**                | `IVehicleServiceEntry` com campos definidos, não texto livre                |
| **Recomendações são heurísticas simples**  | MVP usa intervalos fixos; Fase 2 com IA refina                              |
| **Aplicações conectam veículo a catálogo** | Mesmo com PRD-030 ainda não implementado, placeholder coerente prepara      |
| **km tem proteção**                        | Mudança grande exige confirmação — proteger histórico                       |

### O que NÃO Fazer

| ❌ Evitar                                                     |
| ------------------------------------------------------------- |
| Tratar veículo como string atributo do cliente                |
| Permitir histórico de manutenção em texto livre sem estrutura |
| Esquecer modo `manual` para vendedor (botão deve desaparecer) |
| Permitir edição de km sem confirmação para mudanças grandes   |
| Esquecer audit log em aprovação/rejeição                      |
| Cadastrar duplicata sem validação                             |
| Implementar PRD-030 catálogo aqui — placeholder até a hora    |
| Misturar lógica de recomendação com BI do Bloco 4             |

---

## Status de Implementação

| Campo             | Valor           |
| ----------------- | --------------- |
| **Status**        | ✅ IMPLEMENTADO |
| **Versão**        | v0.13.0 — Fleet |
| **Data**          | 26/05/2026      |
| **Implementador** | Claude Code CLI |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                 |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — veículos como entidade primária com 3 modos de cadastro, histórico estruturado, recomendações proativas |

---

**AILA - Sistemas Inteligentes**
