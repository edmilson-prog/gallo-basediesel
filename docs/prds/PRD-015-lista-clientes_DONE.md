# PRD-015: Lista Geral de Clientes (segmentações e ações em lote)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                   |
| **Objetivo**          | Construir a visão macro da base de clientes — tabela paginada com filtros avançados combinados, segmentações salvas reusáveis, ações em lote, e drill-down para ficha — complementar à ficha individual (PRD-012) que é a visão micro |
| **Tipo**              | Feature                                                                                                                                                                                                                               |
| **Complexidade**      | Alta                                                                                                                                                                                                                                  |
| **Total de Fases**    | 5                                                                                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                                                                                  |
| **Épico**             | Bloco 1 — Central de Atendimento e CRM                                                                                                                                                                                                |
| **PRDs Relacionados** | PRD-012 (Ficha), PRD-014 (Painel Gestor), PRD-018 (Carteira), PRD-044 (Positivação), PRD-045 (Curva ABC), PRD-046 (Carteira Analítica)                                                                                                |
| **Implementação**     | 🔵 Claude Code CLI (sobre o scaffold do Lovable)                                                                                                                                                                                      |
| **Padrão de código**  | Feature-based; código em `src/features/customers/`; reutiliza `<CustomerProfile>` do PRD-012; tabela em `src/features/customers/components/CustomersTable.tsx`                                                                        |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios                                                       |
| ------------ | --------------------------------------------------------------- |
| **Baixa**    | 1 arquivo, sem dependências externas, < 100 linhas              |
| **Média**    | 2-5 arquivos, banco OU integração, funcionalidade isolada       |
| **Alta**     | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** tabela com até 70+ clientes mockados, 9 colunas (algumas configuráveis), 10 filtros combináveis com 8 modos de busca, sistema de segmentações salvas (private/shared) com CRUD próprio, multi-select com 5 ações em lote, ordenação por qualquer coluna, busca textual com debounce, drill-down via drawer ou navegação, integração com PRD-012 (`<CustomerProfile>` reutilizado), e impacto direto em PRDs futuros (044 Positivação, 045 ABC, 046 Carteira Analítica) que consomem esta lista como base para visões especializadas.

---

## Contexto do Problema

A ficha individual (PRD-012) responde "como está esse cliente específico?". A lista geral responde "como está minha base de clientes inteira?". Sem ela, três problemas concretos:

**Sem visão macro, gestão de carteira vira anedótica.** O Gestor sabe que Carlos tem "muitos clientes", mas não sabe quantos exatamente, quais estão dormentes, quantos A da curva ABC ele perdeu nos últimos 6 meses. Decisões viram intuição. **Operações em lote são impossíveis.** "Quero adicionar tag 'campanha-natal' nos 50 clientes que compraram nos últimos 90 dias." Sem multi-select com ação em lote, vira clicar 50 vezes na ficha. **Sem segmentações reusáveis, todo trabalho recomeça do zero.** Gestor faz filtro complexo hoje, descobre algo importante, fecha a tela. Amanhã quer ver os mesmos clientes — refaz tudo. Segmentações salvas guardam filtros nomeados.

Este PRD entrega: lista poderosa em formato tabela, 10 filtros combináveis, segmentações nomeadas que qualquer um pode reusar, multi-select com ações em lote (transferir 30 clientes para outro vendedor de uma vez), e integração com a ficha (drill-down).

---

## Conceito da Solução

### Layout

Rota `/app/clientes` usando `DetailLayout` do PRD-003: tabela à esquerda (60%), ficha do cliente selecionado à direita (40%). Em mobile, vira navegação por níveis (lista → ficha em tela cheia).

```
┌────────────────────────────────────────────────────────────────────┐
│ Header (h: 64px)                                                    │
│  [Clientes] [70 total]  [+ Cliente]   [Buscar____]  [Segm.▾] [⚙]   │
├────────────────────────────────────────────────────────────────────┤
│ Filtros + Toolbar (h: 56px)                                         │
│  [Status▾] [Tipo▾] [ABC▾] [Tags▾] [Vendedor▾]  [☐ Selecionar todos]│
│                                              [3 selecionados] [Ações▾]│
├──────────────────────────────────┬─────────────────────────────────┤
│ Tabela (60%)                     │  Ficha cliente selecionado (40%) │
│  ☐ Avatar  Nome   ABC  Status... │   (componente <CustomerProfile>  │
│  ☐ JG     Aurora  A   Ativo      │    do PRD-012 em modo compacto)  │
│  ☐ PS     Bruno   B   Dormente   │                                  │
│  ☐ MC     Ceará   C   Recup.     │                                  │
│  ...                              │                                  │
├──────────────────────────────────┴─────────────────────────────────┤
│ Paginação                                                           │
└────────────────────────────────────────────────────────────────────┘
```

### Colunas da tabela

**Sempre visíveis:**

1. Checkbox de seleção
2. Avatar + Nome
3. Tipo (badge B2B/B2C compacto)
4. ABC (badge colorido)
5. Status ciclo de vida (badge colorido)

**Configuráveis** (toggle via botão ⚙): 6. CNPJ/CPF 7. Vendedor responsável (avatar + iniciais) 8. Ticket médio 9. Recência (dias desde última compra) 10. LTV 11. Tags (chips inline, máximo 3 + "...") 12. Cidade 13. Última conversa (data) 14. Data de cadastro

Owner/Gestor escolhe quais colunas exibir; persiste em `localStorage` chave `gallo-customers-columns`.

### Filtros combináveis

| Filtro                   | Tipo                      | Opções                                                 |
| ------------------------ | ------------------------- | ------------------------------------------------------ |
| **Status**               | Multi-select              | Ativo, Dormente, Recuperação, Perdido                  |
| **Tipo**                 | Single ou Both            | B2B, B2C, Ambos                                        |
| **ABC**                  | Multi-select              | A, B, C, sem classificação                             |
| **Tags**                 | Multi-select              | Lista de todas as tags (oficiais + livres)             |
| **Vendedor**             | Multi-select              | Lista de vendedores (filtrada por papel)               |
| **Recência**             | Range                     | 0-30 / 31-90 / 91-180 / 180+ / personalizado           |
| **Ticket médio**         | Range                     | < 500 / 500-2000 / 2000-10000 / 10000+ / personalizado |
| **LTV**                  | Range                     | < 5000 / 5000-50000 / 50000+ / personalizado           |
| **Tem veículo de marca** | Multi-select              | Volvo, Scania, Mercedes, Ford, Iveco, "qualquer"       |
| **Loja**                 | Multi-select (Owner only) | Lista de lojas — Gestor vê apenas a sua                |

Filtros combinam via AND. Indicador de quantos filtros estão ativos.

### Busca textual

Input no header com debounce 300ms, pesquisa em:

- Nome (razão social / nome fantasia / fullName)
- CNPJ / CPF (com ou sem formatação)
- Telefone (com ou sem formatação)
- Email
- Notas (conteúdo)

### Segmentações salvas

`ICustomerSegment` do PRD-002. Conjunto de filtros + nome + escopo:

| Campo       | Valor                                                              |
| ----------- | ------------------------------------------------------------------ |
| `id`        | UUID                                                               |
| `name`      | Texto curto ("Clientes A dormentes", "Volvo + Scania últimos 90d") |
| `ownerId`   | Quem criou                                                         |
| `scope`     | `'private'` (só dono vê) ou `'shared'` (todos da loja veem)        |
| `filters`   | Objeto serializado com todos os filtros aplicados                  |
| `createdAt` | Timestamp                                                          |

UI:

- Dropdown "Segmentações" no header lista todas as acessíveis (private do user + shared da loja)
- Click em uma → aplica seus filtros
- Botão "Salvar como segmentação" quando filtros estão aplicados → modal com nome e escolha private/shared
- Botão "Gerenciar" abre modal com lista de segmentações do user → editar nome/escopo, deletar

### Multi-select e ações em lote

Checkbox em cada linha + checkbox "Selecionar todos" no header. Quando há ≥ 1 selecionado, barra de ações aparece:

```
[3 selecionados]  [Adicionar tag] [Transferir vendedor] [Marcar dormente] [Exportar▾] [Mais▾]
```

| Ação                      | Comportamento                                                                                                            | Permissão        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **Adicionar tag**         | Modal multi-select de tags; aplica a todos                                                                               | edit em customer |
| **Remover tag**           | Modal multi-select das tags presentes; remove                                                                            | edit em customer |
| **Transferir vendedor**   | Modal com dropdown de vendedores; transfere carteira em lote (cria `ICarteiraTransfer` tipo `permanent_batch` — PRD-018) | Owner/Gestor     |
| **Marcar dormente**       | Confirmação; muda status manualmente em lote                                                                             | Owner/Gestor     |
| **Exportar CSV**          | Placeholder com tooltip "Disponível na Fase 2"                                                                           | Owner only       |
| **Exportar dados (LGPD)** | Placeholder Fase 2                                                                                                       | Owner only       |
| **Mais**                  | Outras ações futuras                                                                                                     |

Cada ação em lote registra `auditLog` por afetado (audit por linha) + um audit "summary" da ação em lote.

### Drill-down: tabela ↔ ficha

Click numa linha:

- Desktop (≥1280px): ficha aparece à direita (mesma `<CustomerProfile>` do PRD-012)
- Tablet/Mobile: navega para `/app/clientes/:id` em tela cheia

Linha selecionada destacada com background `--accent` translúcido. Próximo/anterior via setas ↑↓ navega entre clientes mantendo a ficha aberta.

### Ordenação

Click no header de qualquer coluna ordena por aquela coluna. Click duplo inverte. Indicador visual (▲▼) na coluna ordenada. Estado persistido em URL.

### Paginação

50 itens por página. Paginação numérica (1, 2, 3, ..., última) no rodapé. Total de resultados sempre visível.

### Criar cliente

Botão "+ Cliente" no header abre modal de criação rápida:

- Tipo (B2B/B2C) - radio
- Nome / Razão social
- CNPJ / CPF
- Telefone
- Email (opcional)
- Vendedor responsável (Owner/Gestor escolhe; Vendedor cria para si)

Modal de criação completa (com endereço, etc.) na ficha após criar.

### Alternativas Consideradas

| Alternativa                       | Por que foi descartada                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Lista em cards (não tabela)       | Tabela é mais densa em informação, padrão CRM consagrado                         |
| Filtros como sidebar lateral fixa | Ocupa espaço; dropdowns são mais compactos                                       |
| Sem segmentações                  | Vendedor/Gestor perde tempo refazendo filtros todo dia                           |
| Segmentações apenas privadas      | Compartilhar entre time é valor — Gestor cria segmentações úteis para vendedores |
| Sem multi-select                  | Tarefas em lote (transferência, tagging) viram inviáveis                         |
| Edição inline na tabela           | Complexa; melhor abrir ficha                                                     |
| Sem ordenação                     | Frustração óbvia                                                                 |
| Export CSV no MVP                 | Complexidade adicional; placeholder com promessa Fase 2                          |

**Decisão consolidada:** **tabela com colunas configuráveis, 10 filtros combinados, segmentações private/shared, multi-select com 5 ações em lote, drill-down via DetailLayout, ordenação por coluna.**

---

## Escopo

### Incluído

- ✅ Rota `/app/clientes` usando `DetailLayout` do PRD-003 substituindo placeholder
- ✅ Tabela `<CustomersTable>` paginada (50/página) com colunas configuráveis
- ✅ Header com contador total, botão "+ Cliente", busca textual, dropdown segmentações, botão ⚙ de configurar colunas
- ✅ 10 filtros combináveis: Status, Tipo, ABC, Tags, Vendedor, Recência, Ticket médio, LTV, Veículo marca, Loja (Owner)
- ✅ Busca textual em nome/CNPJ/CPF/telefone/email/notas com debounce 300ms
- ✅ Sistema de segmentações salvas (`ICustomerSegment`) com:
  - Listar (combinando private do user + shared da loja)
  - Aplicar (carrega filtros)
  - Salvar como nova segmentação (modal: nome + escopo)
  - Gerenciar (editar nome/escopo, deletar)
- ✅ Multi-select com checkbox por linha + "Selecionar todos"
- ✅ 5 ações em lote: Adicionar tag, Remover tag, Transferir vendedor (PRD-018), Marcar dormente, Exportar (placeholder)
- ✅ Ordenação clicável por qualquer coluna; estado em URL
- ✅ Drill-down: click em linha abre ficha (PRD-012) na coluna direita (desktop) ou nova rota tela cheia (mobile)
- ✅ Navegação por setas ↑↓ entre clientes mantendo ficha aberta
- ✅ Modal de criação rápida de cliente
- ✅ Filtros, busca, ordenação e segmentação ativa sincronizados em URL
- ✅ Persistência de colunas exibidas em `localStorage`
- ✅ Empty states contextuais
- ✅ Skeleton durante fetch
- ✅ Permissões (RBAC): Vendedor vê só sua carteira; Gestor/Owner vê toda a loja/cross-store
- ✅ Audit log em ações em lote (por afetado + sumário)

### Excluído

- ❌ Edição inline de campos da tabela — fora do MVP
- ❌ Export real para CSV/Excel — Fase 2 (placeholder)
- ❌ Export LGPD por cliente individual — Fase 2 (placeholder)
- ❌ Importação de clientes via CSV — Fase 2
- ❌ Operações em lote complexas (envio de mensagem em massa, criação de campanha) — Fase 2
- ❌ Visualização em mapa geográfico — Fase 2
- ❌ Histórico de mudanças por cliente (já existe via audit log) — sem UI dedicada no MVP
- ❌ Sugestões automáticas baseadas em IA (clientes parecidos, próximas ações) — Fase 2
- ❌ Visualização "tarjeta" alternativa para mobile — usar mesma tabela com scroll horizontal
- ❌ Filtros salvos cross-segmentação (filtros usados frequentemente sem nome) — fora do MVP

---

## Requisitos Funcionais

### Página e roteamento

- **RF-001:** Substituir placeholder de `/app/clientes` (PRD-003) por `CustomersListPage` em `src/features/customers/pages/`.
- **RF-002:** Usar `DetailLayout` do PRD-003: tabela à esquerda, área direita para ficha (`<CustomerProfile>` do PRD-012 reutilizado).
- **RF-003:** Quando nenhum cliente selecionado, área direita mostra EmptyState: "Selecione um cliente para ver detalhes".
- **RF-004:** Em mobile (< 768px), rota dedicada `/app/clientes/:id` substitui a tabela para abrir ficha em tela cheia.

### Tabela

- **RF-005:** Implementar `<CustomersTable>` paginada (50 por página default) consumindo `useCustomersProvider().list(filters)`.
- **RF-006:** Colunas obrigatórias visíveis: Checkbox, Avatar+Nome, Tipo (B2B/B2C), ABC, Status.
- **RF-007:** Colunas opcionais (toggle pelo Owner/Gestor): CNPJ/CPF, Vendedor responsável, Ticket médio, Recência, LTV, Tags (3 visíveis + "..."), Cidade, Última conversa, Data de cadastro.
- **RF-008:** Configuração de colunas via botão ⚙ → `<ColumnsConfigModal>`; salva em `localStorage` chave `gallo-customers-columns`.
- **RF-009:** Linha de cliente selecionado destacada com background `--accent` translúcido (8%).
- **RF-010:** Click numa linha (fora do checkbox) seleciona o cliente e exibe ficha na coluna direita (ou navega em mobile).
- **RF-011:** Navegação por setas ↑↓ no teclado quando uma linha está selecionada — move para próxima/anterior na tabela.

### Filtros

- **RF-012:** Header de filtros com 10 controles:
  - **Status** (multi-select): Ativo, Dormente, Recuperação, Perdido
  - **Tipo** (toggle): B2B, B2C, Ambos
  - **ABC** (multi-select): A, B, C, Sem classificação
  - **Tags** (multi-select com busca interna): listando tags oficiais + livres
  - **Vendedor** (multi-select): listando vendedores acessíveis ao user (Gestor vê todos da loja; Vendedor vê apenas ele mesmo)
  - **Recência** (faixa pré-definida + personalizada): 0-30d, 31-90d, 91-180d, 180+, personalizado
  - **Ticket médio** (faixa pré-definida + personalizada): < R$500, R$500-2k, R$2k-10k, > R$10k, personalizado
  - **LTV** (faixa pré-definida + personalizada)
  - **Veículo marca** (multi-select): Volvo, Scania, Mercedes, Ford, Iveco, Qualquer
  - **Loja** (multi-select, Owner only): lista de lojas
- **RF-013:** Filtros combinam via AND (cliente precisa atender a todos para aparecer).
- **RF-014:** Indicador visual de quantos filtros ativos: "3 filtros ativos" + botão "Limpar tudo".
- **RF-015:** Filtros persistem em URL como query params: `/app/clientes?status=ativo,dormente&abc=A&tags=frota-volvo`.

### Busca textual

- **RF-016:** Input de busca no header com debounce 300ms.
- **RF-017:** Busca pesquisa em: `customer.name/razaoSocial/nomeFantasia/fullName`, `customer.cnpj/cpf` (normalizado sem formatação), `customer.phone` (normalizado), `customer.email`, e em conteúdo de notas (`customer.notes[].content`).
- **RF-018:** Resultados destacam o termo encontrado no texto (highlight amarelo translúcido).

### Segmentações salvas

- **RF-019:** Dropdown "Segmentações" no header lista:
  - Suas segmentações privadas (private + ownerId = currentUser)
  - Segmentações compartilhadas (shared + storeId = currentStore)
  - Botão "+ Salvar atual como segmentação" se há filtros aplicados
  - Botão "Gerenciar segmentações" → abre modal
- **RF-020:** Click em uma segmentação aplica seus filtros (sobrescreve filtros atuais com confirmação se há filtros não salvos).
- **RF-021:** Modal "Salvar segmentação": nome (texto curto, máx 50 chars) + escopo (radio: Privada/Compartilhada).
- **RF-022:** Apenas Owner/Gestor podem salvar segmentação como `shared`; Vendedor só `private`.
- **RF-023:** Modal "Gerenciar" lista segmentações do user: editar nome/escopo, deletar (com confirmação).
- **RF-024:** Quando segmentação está ativa, badge "Segmentação: [nome]" aparece no header com botão "x" para desativar (volta ao default sem filtros).
- **RF-025:** Mudanças em filtros após carregar uma segmentação geram badge "Modificado" ao lado do nome — Owner pode "Salvar alterações" ou "Salvar como nova".

### Multi-select e ações em lote

- **RF-026:** Checkbox em cada linha; checkbox "Selecionar todos" no header da tabela:
  - Click seleciona apenas os 50 da página atual
  - Click longo (ou opção "Selecionar todos os N") seleciona todos os clientes filtrados
- **RF-027:** Quando ≥ 1 linha selecionada, barra de ações aparece acima da tabela mostrando contador + dropdowns/botões:
  - "Adicionar tag"
  - "Remover tag"
  - "Transferir vendedor"
  - "Marcar dormente"
  - "Exportar ▾" (CSV / LGPD — placeholders)
- **RF-028:** Ação "Adicionar tag": modal com input de tag (autocomplete sugestões); aplica a todos selecionados; audit log por afetado.
- **RF-029:** Ação "Remover tag": modal lista tags presentes em ≥ 1 selecionado; user escolhe quais remover; audit log.
- **RF-030:** Ação "Transferir vendedor": modal com dropdown de vendedores; criar `ICarteiraTransfer` tipo `permanent_batch` (PRD-018) com array de customerIds; audit log com sumário ("Transferência em lote: 23 clientes de Carlos para Marina").
- **RF-031:** Ação "Marcar dormente": confirmação "Deseja marcar 3 clientes como dormentes manualmente?" → muda status; audit log.
- **RF-032:** Ação "Exportar CSV" / "LGPD" — tooltip "Disponível na Fase 2"; sem execução.
- **RF-033:** Após cada ação em lote, toast com Desfazer (5s).

### Ordenação

- **RF-034:** Click no header de qualquer coluna ordena por aquele campo ascendente. Click duplo descendente. Indicador ▲/▼ visível.
- **RF-035:** Default: ordenação por `name` ascendente.
- **RF-036:** Ordenação persistida em URL: `?orderBy=ticketMedio&orderDir=desc`.

### Paginação

- **RF-037:** Paginação numérica no rodapé (1, 2, 3, ..., última) + indicador "Página X de Y" + "N resultados totais".
- **RF-038:** Seletor de tamanho de página: 25, 50 (default), 100, 200.
- **RF-039:** Página atual em URL: `?page=2`.

### Criar cliente

- **RF-040:** Botão "+ Cliente" no header (visível para users com `customer.create`) abre modal `<NewCustomerModal>`.
- **RF-041:** Modal com campos:
  - Tipo (B2B / B2C) — radio
  - Nome / Razão social (obrigatório)
  - CNPJ / CPF (validação básica de formato)
  - Telefone (obrigatório)
  - Email (opcional)
  - Vendedor responsável (dropdown):
    - Owner/Gestor: lista todos os vendedores da loja
    - Vendedor: locked em si mesmo
- **RF-042:** Ao salvar, cria `ICustomer` via provider, atribui à carteira do vendedor escolhido, navega para a ficha do recém-criado (cliente selecionado).
- **RF-043:** Audit log via PRD-006 da criação.

### Permissões

- **RF-044:** **Vendedor**: lista só clientes de sua carteira (filtragem implícita via PRD-006 scope `own`); pode criar para si.
- **RF-045:** **Gestor**: lista clientes da sua loja (scope `store`); ações em lote permitidas; cria atribuindo a qualquer vendedor da loja.
- **RF-046:** **Owner**: lista cross-store; mesmas permissões expandidas.
- **RF-047:** **Cliente B2B em /portal**: vê apenas a si mesmo (caso aplicável no portal — PRD-071).

### URL e persistência

- **RF-048:** Todos os filtros, ordenação, página, busca textual, segmentação aplicada, e cliente selecionado sincronizam em URL via query params.
- **RF-049:** Configuração de colunas em `localStorage` (não URL — preferência pessoal).
- **RF-050:** Última posição do scroll mantida ao voltar de uma ficha.

### Empty states e skeletons

- **RF-051:** Tabela vazia (sem filtros): "Você ainda não tem clientes cadastrados. Clique em '+ Cliente' para adicionar o primeiro."
- **RF-052:** Tabela vazia (com filtros): "Nenhum cliente corresponde aos filtros aplicados." + botão "Limpar filtros".
- **RF-053:** Busca sem resultado: "Nenhum cliente encontrado para '[termo]'."
- **RF-054:** Skeleton de tabela durante fetch inicial (linhas vazias com shimmer).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Tabela com 70 clientes mockados + filtros + ficha lateral renderiza em < 400ms.
- **RNF-002 (Filtragem reativa):** Mudar qualquer filtro atualiza resultados em < 200ms.
- **RNF-003 (Acessibilidade):** WCAG 2.1 AA; navegação por teclado completa (tab entre filtros, setas na tabela, Enter abre ficha).
- **RNF-004 (Responsividade):** Mobile usável; tabela com scroll horizontal se necessário; ficha em tela cheia em < 768px.
- **RNF-005 (Tipagem):** Zero `any`; filtros tipados via interface dedicada.
- **RNF-006 (Persistência segura):** URL e localStorage não vazam PII; apenas IDs e flags.

---

## Critérios de Aceitação

### Tabela e filtros

```gherkin
DADO que sou Owner e acesso /app/clientes
QUANDO a página carrega
ENTÃO vejo 50 clientes na tabela com colunas default
  E vejo total "70 clientes" no header
  E ficha vazia à direita

DADO que aplico filtro Status=Dormente e ABC=A
QUANDO os filtros aplicam
ENTÃO tabela mostra apenas clientes A dormentes
  E URL atualiza para ?status=dormente&abc=A
  E vejo indicador "2 filtros ativos"

DADO que clico em "Limpar tudo"
QUANDO filtros resetam
ENTÃO URL limpa, tabela mostra todos
```

### Busca

```gherkin
DADO que digito "Aurora" no campo de busca
QUANDO 300ms passam
ENTÃO tabela filtra para clientes com Aurora no nome/CNPJ/etc
  E o termo é destacado em amarelo onde aparece

DADO que busco "11.222.333" (CNPJ parcial)
QUANDO a busca processa
ENTÃO clientes com CNPJ iniciando com esses dígitos aparecem
```

### Segmentações

```gherkin
DADO que aplico filtros (Status=Dormente, ABC=A) e clico em "Salvar como segmentação"
QUANDO modal abre, informo nome "Clientes A dormentes" e escopo Privada e salvo
ENTÃO segmentação é criada e fica disponível no dropdown
  E badge "Segmentação: Clientes A dormentes" aparece no header

DADO que outro user (Gestor) cria segmentação Compartilhada "Volvo recência > 60d"
QUANDO eu (vendedor) abro o dropdown
ENTÃO vejo essa segmentação porque é shared da loja
  E posso aplicá-la (carrega os filtros dela)

DADO que selecione uma segmentação e modifico filtros
QUANDO um filtro muda
ENTÃO badge ganha sufixo "Modificado"
  E posso "Salvar alterações" (se for minha) ou "Salvar como nova"
```

### Multi-select e ações em lote

```gherkin
DADO que seleciono 3 clientes via checkbox
QUANDO a seleção processa
ENTÃO barra "3 selecionados" aparece com botões de ações

DADO que clico "Adicionar tag" e adiciono "campanha-natal"
QUANDO confirmo
ENTÃO os 3 clientes ganham a tag
  E auditLog é criado para cada afetado + 1 sumário
  E toast aparece "3 clientes atualizados" com Desfazer

DADO que sou Gestor e clico "Transferir vendedor"
QUANDO seleciono Marina como destino e confirmo
ENTÃO ICarteiraTransfer tipo permanent_batch é criado (PRD-018)
  E os clientes selecionados passam para Marina
  E audit log registra o sumário

DADO que clico "Exportar CSV"
QUANDO o tooltip aparece
ENTÃO mostra "Disponível na Fase 2"
  E nada acontece além do tooltip
```

### Drill-down

```gherkin
DADO que clico numa linha de cliente em desktop
QUANDO a seleção processa
ENTÃO ficha do cliente (PRD-012) carrega na coluna direita
  E linha fica destacada
  E URL atualiza para /app/clientes?...&selected=customer-id

DADO que pressiono seta ↓ no teclado
QUANDO a navegação processa
ENTÃO próxima linha é selecionada
  E ficha à direita atualiza para o novo cliente

DADO que estou em mobile e clico numa linha
QUANDO o clique processa
ENTÃO navego para /app/clientes/:id em tela cheia (ficha do PRD-012)
  E botão "voltar" retorna à lista
```

### Criar cliente

```gherkin
DADO que clico "+ Cliente" como Vendedor
QUANDO modal abre
ENTÃO campo "Vendedor responsável" está locked em mim mesmo (Carlos)

DADO que sou Owner e preencho tipo=B2B, nome="Frota XYZ", CNPJ válido, telefone, vendedor=Marina e salvo
QUANDO o save processa
ENTÃO cliente é criado, atribuído a Marina
  E ficha do recém-criado aparece selecionada
  E tabela inclui o novo registro
```

### Permissões

```gherkin
DADO que sou Vendedor (Carlos)
QUANDO acesso /app/clientes
ENTÃO vejo apenas clientes da minha carteira (filtragem implícita)
  E NÃO vejo botão "Transferir vendedor" nas ações em lote
  E filtro "Vendedor" mostra apenas eu mesmo (locked)

DADO que sou Gestor
QUANDO acesso /app/clientes
ENTÃO vejo clientes da minha loja
  E ações em lote disponíveis incluem transferir
  E filtro "Loja" está locked na minha loja

DADO que sou Owner
QUANDO acesso /app/clientes
ENTÃO vejo cross-store (todas as lojas)
  E todos os filtros e ações disponíveis
```

### Cenários de erro

```gherkin
DADO que provider falha (MockNetworkError)
QUANDO useCustomersProvider().list() rejeita
ENTÃO tabela mostra estado de erro com botão "Tentar novamente"

DADO que tento criar cliente com CNPJ inválido
QUANDO submetc o modal
ENTÃO validação inline mostra "CNPJ inválido"
  E botão Salvar fica desabilitado

DADO segmentação compartilhada criada por outro user é deletada
QUANDO tento aplicá-la (ela ainda está no meu cache local)
ENTÃO toast aparece: "Segmentação não encontrada — pode ter sido removida"
  E dropdown atualiza removendo-a
```

---

## Fases de Implementação

| Fase | Objetivo                                                         | Arquivos Estimados |
| ---- | ---------------------------------------------------------------- | ------------------ |
| 1    | Tabela básica, paginação, busca, ordenação                       | 6-8                |
| 2    | 10 filtros combináveis + URL sync + configuração de colunas      | 8-10               |
| 3    | Segmentações salvas (CRUD + dropdown + modais)                   | 5-6                |
| 4    | Multi-select + 5 ações em lote + audit log                       | 5-6                |
| 5    | Drill-down (DetailLayout integração), criação de cliente, polish | 4-5                |

### Detalhamento das Fases

#### Fase 1: Tabela Base

**Objetivo:** lista navegável com básicos

**Ações:**

- [ ] Criar `CustomersListPage` em `src/features/customers/pages/`
- [ ] Usar `DetailLayout` do PRD-003
- [ ] Implementar `<CustomersTable>` com colunas obrigatórias + Avatar+Nome (com `<Avatar>` shadcn)
- [ ] Paginação numérica
- [ ] Ordenação clicável por coluna
- [ ] Busca textual com debounce 300ms

**Validação:** lista de 70 clientes paginada; busca funciona; ordenação por colunas.

#### Fase 2: Filtros

**Objetivo:** filtragem combinada poderosa

**Ações:**

- [ ] Implementar 10 dropdowns/inputs de filtro no header
- [ ] Sincronização com URL via `useSearchParams`
- [ ] Indicador de filtros ativos + botão "Limpar tudo"
- [ ] Configuração de colunas via `<ColumnsConfigModal>` salvando em localStorage
- [ ] Highlight do termo de busca nas células

**Validação:** combinações de filtros funcionam; refresh restaura estado.

#### Fase 3: Segmentações

**Objetivo:** filtros nomeados reutilizáveis

**Ações:**

- [ ] Implementar `useSegments()` consumindo `useSegmentsProvider`
- [ ] Dropdown "Segmentações" no header
- [ ] Modal `<SaveSegmentModal>` com nome + escopo
- [ ] Modal `<ManageSegmentsModal>` com lista + editar + deletar
- [ ] Badge "Segmentação ativa" no header
- [ ] Comportamento "Modificado" quando filtros divergem da segmentação carregada

**Validação:** salvar/carregar/deletar segmentações; private/shared respeitados.

#### Fase 4: Multi-select e Ações em Lote

**Objetivo:** operações em massa

**Ações:**

- [ ] Checkbox por linha + "Selecionar todos da página" + opção "Selecionar todos os filtrados"
- [ ] Barra de ações ao ter ≥ 1 selecionado
- [ ] 5 modais: Adicionar tag, Remover tag, Transferir vendedor, Marcar dormente, Exportar (placeholders)
- [ ] Integração com `ICarteiraTransfer` tipo `permanent_batch` (PRD-018)
- [ ] Audit log por afetado + sumário
- [ ] Toast com Desfazer (5s)

**Validação:** ações em lote afetam corretamente; audit log gera entries certos.

#### Fase 5: Drill-down e Criação

**Objetivo:** integração com ficha + cadastro novo

**Ações:**

- [ ] Click na linha exibe ficha (`<CustomerProfile>` do PRD-012) à direita em desktop
- [ ] Mobile: navega para `/app/clientes/:id` em tela cheia
- [ ] Setas ↑↓ navegam entre clientes mantendo ficha aberta
- [ ] Modal `<NewCustomerModal>` para criação
- [ ] Empty states contextuais
- [ ] Skeleton de tabela durante fetch

**Validação:** drill-down completo; criação flui para a ficha; mobile funcional.

---

## Dependências

### PRDs Anteriores

| PRD     | Descrição                               | Status                                           |
| ------- | --------------------------------------- | ------------------------------------------------ |
| PRD-002 | Modelo (ICustomerSegment)               | 📝 Redigido                                      |
| PRD-003 | Shell (DetailLayout)                    | 📝 Redigido                                      |
| PRD-005 | Provider Pattern                        | 📝 Redigido                                      |
| PRD-006 | RBAC                                    | 📝 Redigido                                      |
| PRD-007 | Multi-Loja                              | 📝 Redigido                                      |
| PRD-012 | Ficha (`<CustomerProfile>` reutilizado) | 📝 Redigido                                      |
| PRD-018 | Carteira (Transferência em lote)        | ⏳ Pendente — usar provider mockado por enquanto |

### Serviços Externos

| Serviço                                               | Tipo | Status  |
| ----------------------------------------------------- | ---- | ------- |
| `@tanstack/react-table` (tabela poderosa, opcional)   | Lib  | Avaliar |
| `@tanstack/react-virtual` (já instalado pelo PRD-010) | Lib  | OK      |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem | PRD          | Título                                   | Status       |
| ----- | ------------ | ---------------------------------------- | ------------ |
| 1-5   | PRDs 010-014 | Inbox/Conversa/Ficha/Distribuição/Painel | 📝           |
| **6** | **PRD-015**  | **Lista Geral de Clientes**              | **🔄 ATUAL** |
| 7+    | PRDs 016-019 | Demais do Bloco 1                        | ⏳           |

---

## Considerações de Segurança

### Filtragem implícita protege carteira

Vendedor não consegue ver clientes de outros vendedores. Filtro implícito via provider (PRD-005 + PRD-006 + PRD-007).

### Ações em lote são auditadas

Cada cliente afetado gera entry de audit log + um sumário da operação. Rastreabilidade completa.

### Segmentações shared têm cuidado de PII

Nomes de segmentação podem conter dados sensíveis ("Clientes com Aurora no nome"). UI permite, mas Owner pode auditar.

### LGPD na exportação

Botão placeholder "Exportar dados (LGPD)" é estratégico. Fase 2 implementa export oficial respeitando direito de acesso aos dados.

---

## Fluxos de Usuário

### Fluxo Principal — Gestor cria campanha de recuperação

1. Marina abre `/app/clientes`
2. Aplica filtros: Status=Dormente + ABC=A (clientes A dormentes)
3. Tabela mostra 8 clientes
4. Salva como segmentação "Recuperação A" (Compartilhada — para vendedores usarem também)
5. Seleciona todos os 8 via checkbox
6. Clica "Adicionar tag" → adiciona "campanha-recuperacao-jun"
7. Toast confirma: "8 clientes atualizados"
8. Volta amanhã, aplica segmentação "Recuperação A" novamente — filtros recarregados, vê os 8 clientes ainda lá

### Fluxo Alternativo — Vendedor revisa carteira

1. Carlos abre `/app/clientes` → vê só sua carteira (35 clientes)
2. Ordena por "Recência" descendente → vê quais estão sem comprar há mais tempo
3. Identifica 5 clientes A com recência > 60 dias
4. Clica em cada um na ficha → adiciona nota "Ligar para confirmar pedido"

### Fluxo Mobile

1. Em iPhone, Marina toca em "Clientes" na bottom nav
2. Tabela em modo compacto (algumas colunas escondidas)
3. Toca em cliente → navega para `/app/clientes/abc` em tela cheia (ficha)
4. Toca "voltar" → retorna à lista preservando scroll

### Fluxo de Criação

1. Owner clica "+ Cliente"
2. Modal abre, escolhe B2B
3. Preenche razão social, CNPJ, telefone, vendedor=Marina
4. Salva → ficha aparece, lista atualiza
5. Owner navega para a ficha e completa endereço

### Fluxo de Erro — Segmentação deletada

1. Carlos aplica segmentação "Vol Volvo - Marina" (criada por Marina como shared)
2. Marina deletou a segmentação em outro momento
3. Refresh atualiza a lista de segmentações de Carlos — a deletada some
4. Toast pequeno informa: "Segmentação ativa foi removida — voltando ao default"

---

## Convenções de Código (Referência Rápida)

| Elemento             | Convenção                      | Exemplo                                                          |
| -------------------- | ------------------------------ | ---------------------------------------------------------------- |
| **Página**           | PascalCase + `Page`            | `CustomersListPage`                                              |
| **Componentes**      | PascalCase                     | `<CustomersTable>`, `<ColumnsConfigModal>`                       |
| **Hooks**            | camelCase + `use`              | `useCustomersList`, `useSegments`                                |
| **Filtros (objeto)** | Camelcase com sufixo `Filters` | `IListCustomersFilters`                                          |
| **Pasta**            | kebab-case                     | `customers/`, `tables/`, `modals/`                               |
| **URL params**       | kebab-case                     | `?status=dormente&abc=A&order-by=ticketMedio`                    |
| **Git commits**      | Conventional Commits           | `feat(customers): add list with filters, segments, bulk actions` |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                          | Descrição                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| **Tabela é o padrão CRM**          | Cards são bonitos mas dataset denso pede tabela; manter                                 |
| **Filtros combinam via AND**       | Cliente precisa atender a todos; mais filtros = menos resultados                        |
| **Segmentações são produtividade** | Não opcional — vendedor/gestor usa todo dia; CRUD completo                              |
| **Multi-select é poder**           | Permite operações que seriam tediosas; audit log obrigatório                            |
| **URL é estado**                   | Filtros, ordenação, página, busca, segmentação ativa, cliente selecionado — tudo em URL |
| **Drill-down sem perder contexto** | Setas ↑↓ navegam entre clientes mantendo ficha à direita                                |

### Orientações Gerais

| Aspecto                           | Orientação                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tabela performática**           | Considerar `@tanstack/react-table` para sorting/pagination prontos; ou implementação custom mais leve |
| **Selecionar todos os filtrados** | Botão pequeno "Selecionar todos os N filtrados" abaixo da barra de ações quando há seleção parcial    |
| **Audit em lote**                 | Para cada cliente afetado, um entry de audit + 1 entry summary com totais e action `bulk_*`           |
| **Highlight de busca**            | Helper `highlightSearchTerm(text, term)` em utils retorna ReactNode com `<mark>` em volta dos termos  |
| **Configuração de colunas**       | `localStorage` chave `gallo-customers-columns` armazena array de IDs de coluna visíveis               |
| **Validação de CNPJ/CPF**         | Helper `isValidCnpj(s)` / `isValidCpf(s)` com algoritmo de dígito verificador                         |

### O que NÃO Fazer

| ❌ Evitar                                                                     |
| ----------------------------------------------------------------------------- |
| Implementar export real para CSV — placeholder com promessa Fase 2            |
| Implementar edição inline na tabela — fora do MVP                             |
| Importação CSV de clientes — fora do MVP                                      |
| Sobrescrever permissões com lógica local — confiar em provider para filtragem |
| Esquecer mobile (tela cheia em <768px)                                        |
| Cards em vez de tabela — fora do padrão CRM                                   |
| Esquecer empty states ou usar genéricos                                       |
| Permitir Vendedor salvar segmentação shared                                   |
| Esquecer audit log em ações em lote                                           |
| Ignorar URL sync (filtros não compartilháveis quebra UX)                      |
| Bypass de permissões cross-store (filtro Loja deve ser locked para Gestor)    |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |
| **Data**   | -           |
| **Versão** | -           |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                            |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — lista geral de clientes com 10 filtros, segmentações private/shared, multi-select com 5 ações em lote, drill-down via DetailLayout |

---

**AILA - Sistemas Inteligentes**
