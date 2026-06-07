# PRD-027: Envio Rápido & Biblioteca de Ativos

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Existente (clonado do scaffold Lovable)_ |
| **Objetivo** | Acelerar o atendimento com envio rápido de catálogos, documentos, imagens e links, sustentado por uma biblioteca de ativos curada, respostas rápidas (snippets), card de produto, links rastreáveis e agendamento — consumindo o storage do PRD-026. |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 1 — Central de Atendimento (produtividade no atendimento) |
| **PRDs Relacionados** | PRD-002 (Modelo — exige DELTA), PRD-004 (Mocks — exige DELTA), PRD-005 (Provider Pattern), PRD-006 (RBAC/Auditoria), PRD-011 (Conversa/Composer), PRD-017 (Pipeline de Leads — temperatura), PRD-019 (Configurações/Admin), PRD-025 (Copiloto — sugestão de ativo), PRD-026 (Gestão de Mídia — storage) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/quick-send/`; providers seguindo o Provider Pattern do PRD-005; camelCase; tipos novos em `src/shared/types/` via DELTA no PRD-002 |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** integra-se ao composer existente (PRD-011) sem regredi-lo; introduz entidades novas (`IAssetLibraryItem`, `IQuickReply`, `ITrackableLink`) exigindo DELTA no PRD-002 e geradores no PRD-004; depende do storage do PRD-026; aplica versionamento e permissão por ativo via RBAC (PRD-006); card de produto integra o catálogo (PRD-030); links rastreáveis alimentam a temperatura do lead (PRD-017); sugestão de ativo conversa com o Copiloto (PRD-025); e prepara contrato de short-link/UTM e agendamento para a Fase 2.

---

## Contexto do Problema

No atendimento de peças diesel, grande parte das interações se repete: o vendedor manda o mesmo catálogo de freio Volvo, a mesma tabela de preços, o mesmo termo de garantia, o mesmo link da loja. Hoje o composer (PRD-011) permite anexar um arquivo avulso, mas:

**Cada envio é manual e do zero.** O vendedor procura o PDF no computador, arrasta, redigita a mesma mensagem de contexto. Multiplicado por dezenas de conversas por dia, é tempo perdido e inconsistência (cada um manda uma versão diferente do material).

**Não há controle sobre o que circula.** Sem biblioteca versionada, um vendedor pode mandar uma tabela de preços vencida ou um catálogo antigo — com impacto comercial direto. O gestor não tem como publicar/despublicar materiais nem saber o que está sendo enviado.

**O material enviado não gera inteligência.** Mandar um link "solto" não diz se o cliente abriu. Um catálogo ou link da loja com rastreamento poderia sinalizar interesse e alimentar a temperatura do lead (PRD-017), ajudando o vendedor a priorizar quem está realmente quente.

---

## Conceito da Solução

### Situação Atual (As-Is)

O `<MessageInput>` (PRD-011) tem botão de anexo que abre modal de seleção (imagem, documento, áudio) para envio avulso, mais sugestões IA placeholder e templates HSM (Meta). Não há biblioteca curada, snippets, card de produto, links rastreáveis nem agendamento. Não há feature `quick-send`.

### Situação Desejada (To-Be)

Uma camada `src/features/quick-send/` que estende o composer com:

1. **Biblioteca de ativos** curada e versionada (catálogos, fichas, tabela de preços, garantia, vídeos, links), organizada por categoria/marca/linha, com busca, recentes e favoritos.
2. **Slash commands** (`/catalogo`, `/tabela`, `/garantia`, `/loja`) e menu de anexo enriquecido para inserir ativos em 1 clique.
3. **Respostas rápidas (snippets)** de texto com variáveis preenchidas do contexto.
4. **Card de produto** rico, montado a partir do catálogo (PRD-030).
5. **Links rastreáveis** (UTM/short-link, contrato pronto para Fase 2) cujo "abriu" alimenta a temperatura do lead (PRD-017).
6. **Versionamento e permissão por ativo** (RBAC), **sugestão de ativo pelo Copiloto** (PRD-025), **pacotes/combos** e **agendamento de envio** (alinhado ao scheduler de atendimento).

Todo arquivo de ativo é armazenado/recuperado pelo `IMediaStorageProvider` do PRD-026.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Estender só o modal de anexo do PRD-011 | Não comporta biblioteca, versão, permissão, rastreamento e agendamento; vira feature própria |
| Guardar ativos fora do storage do PRD-026 | Duplicaria infraestrutura de mídia; o PRD-026 é justamente a fundação reutilizável |
| Tratar snippets como templates HSM | HSM é específico do Meta e pré-aprovado; snippets são texto livre interno, reutilizável em qualquer canal |
| Implementar short-link/UTM real agora | Depende de backend/redirect; Fase 1 entrega o contrato e simula "aberturas"; real é Fase 2 |

---

## Escopo

### Incluído

- ✅ Entidades novas (DELTA no PRD-002): `IAssetLibraryItem`, `IQuickReply`, `ITrackableLink`
- ✅ Provider `IAssetLibraryProvider` (Mock na Fase 1) sobre o PRD-004, seguindo o Provider Pattern (PRD-005)
- ✅ Biblioteca de ativos com categorias (catálogo, ficha técnica, tabela de preços, garantia, vídeo, link) e taxonomia por marca/linha
- ✅ Painel/seletor de ativos acessível do composer (PRD-011): busca, **recentes** e **favoritos** por vendedor
- ✅ **Slash commands** no composer: `/catalogo`, `/tabela`, `/garantia`, `/loja` (e busca livre `/`)
- ✅ Inserção de ativo na conversa em 1 clique → cria `IMessage` outbound (mídia via PRD-026)
- ✅ **Respostas rápidas (snippets)** com variáveis (`{{nome}}`, `{{peca}}`, `{{prazo}}`) preenchidas do contexto da conversa/cliente
- ✅ **Card de produto** rico (foto, código OE, equivalência, estoque, preço) a partir do catálogo (PRD-030), enviável como bubble dedicado
- ✅ **Versionamento de ativo**: apenas a versão `published` é enviável; histórico de versões mínimo (atual + anterior)
- ✅ **Permissão por ativo (RBAC)**: gestor publica/despublica e define quem pode enviar cada ativo (PRD-006)
- ✅ **Links rastreáveis**: `ITrackableLink` com `shortRef`/UTM (simulado); "abertura" mockada que alimenta a temperatura do lead (PRD-017)
- ✅ **Pacotes/combos**: enviar um conjunto de ativos (ex.: catálogo + tabela + vídeo) de uma vez
- ✅ **Agendamento de envio** de ativo/snippet (fila local simulada; alinhado ao futuro scheduler de atendimento)
- ✅ **Sugestão de ativo pelo Copiloto** (PRD-025): chip "enviar catálogo de freio Volvo" conforme contexto
- ✅ **Estatística de uso**: ativos mais enviados e por vendedor (visão de gestão)
- ✅ Atalhos de teclado para abrir o seletor e inserir o último ativo usado
- ✅ Tema light/dark obrigatório; responsividade 360–1920px; auditoria das ações sensíveis (PRD-006)

### Excluído

- ❌ Redirect/short-link real e métrica real de abertura — Fase 2 (PRDs 100-102)
- ❌ Disparo real de mídia via WhatsApp Meta/Evolution — Fase 2
- ❌ Storage real dos ativos (Supabase Storage) — Fase 2 (usa Mock do PRD-026)
- ❌ Editor de criação de catálogos/PDFs dentro da plataforma — fora do MVP (ativos são importados)
- ❌ Aprovação multi-nível de publicação de ativo — fora do MVP (publish/unpublish simples por gestor)
- ❌ Tradução automática de snippets — fora do MVP
- ❌ Templates HSM do Meta — já cobertos pelo PRD-011 (este PRD não os duplica)
- ❌ Scheduler genérico de mensagens completo (recorrência, janela 24h) — PRD próprio futuro; aqui apenas agendamento simples de ativo/snippet

---

## Requisitos Funcionais

### Modelo e provider

- **RF-001:** Solicitar DELTA no PRD-002 para `IAssetLibraryItem` com: `id`, `title`, `category: 'catalogo' | 'ficha_tecnica' | 'tabela_preco' | 'garantia' | 'video' | 'link'`, `brand?`, `productLine?`, `kind: 'document' | 'image' | 'video' | 'link'`, `storageRef?` (arquivos via PRD-026) ou `url?` (links), `version: number`, `status: 'published' | 'draft' | 'archived'`, `allowedRoleIds?: ID[]`, `createdBy`, `updatedAt: ISO8601`.
- **RF-002:** Solicitar DELTA para `IQuickReply` com: `id`, `shortcut` (ex.: `/garantia`), `title`, `body` (texto com placeholders `{{...}}`), `scope: 'private' | 'shared'`, `ownerId`, `allowedRoleIds?`.
- **RF-003:** Solicitar DELTA para `ITrackableLink` com: `id`, `assetId?`, `targetUrl`, `shortRef`, `utm?: { source; medium; campaign }`, `createdBy`, `opens: number`, `lastOpenedAt?: ISO8601` (na Fase 1, `opens`/`lastOpenedAt` simulados).
- **RF-004:** Definir `IAssetLibraryProvider` (assíncrono) com `list(filter)`, `get(id)`, `search(query)`, `getRecent(sellerId)`, `toggleFavorite(sellerId, id)`, `publish(id)`, `unpublish(id)`, `bumpVersion(id)`. Implementar `MockAssetLibraryProvider` sobre o PRD-004; selecionar via `VITE_DATA_SOURCE` (PRD-005).
- **RF-005:** Arquivos de ativos (catálogo, ficha, vídeo) são lidos/gravados via `IMediaStorageProvider` (PRD-026); este PRD não acessa storage diretamente.

### Seletor de ativos no composer

- **RF-006:** Adicionar ao composer (PRD-011) um botão/atalho "Biblioteca" que abre o `<AssetPicker>` com busca, filtros (categoria/marca/linha), abas **Recentes** e **Favoritos** por vendedor.
- **RF-007:** Implementar **slash commands** no textarea: digitar `/` abre o picker filtrado; `/catalogo`, `/tabela`, `/garantia`, `/loja` pré-filtram por categoria; texto após o comando filtra por título.
- **RF-008:** Selecionar um ativo insere-o na conversa criando uma `IMessage` outbound apropriada (documento/imagem/vídeo via PRD-026, ou link com card de preview), opcionalmente com uma mensagem de contexto editável antes do envio.
- **RF-009:** Apenas ativos com `status: 'published'` e permitidos ao perfil do vendedor (RBAC) aparecem como enviáveis; ativos `draft`/`archived` ou não permitidos não são listados para envio.
- **RF-010:** Atalhos de teclado: abrir o picker e "inserir último ativo usado" sem mouse.

### Respostas rápidas (snippets)

- **RF-011:** Permitir inserir `IQuickReply` por `shortcut` (ex.: `/garantia`) ou pelo picker; o `body` é inserido no textarea com as variáveis `{{...}}` resolvidas a partir do contexto (nome do cliente, peça em discussão, prazo padrão).
- **RF-012:** Variáveis sem valor disponível ficam visíveis como destaque editável (ex.: `[prazo]`) para o vendedor completar antes de enviar — nunca enviar placeholder cru.
- **RF-013:** Snippets `shared` são gerenciados por gestor (criar/editar/arquivar) sob RBAC; `private` pertencem ao vendedor.

### Card de produto

- **RF-014:** Oferecer ação "Enviar produto" que abre busca no catálogo (PRD-030) e monta um **card de produto** com foto, código OE, equivalência, disponibilidade/estoque e preço, enviado como bubble dedicado.
- **RF-015:** O card respeita a fonte de verdade do catálogo no momento do envio; se o produto não tiver imagem/preço, o card degrada graciosamente (sem quebrar).

### Links rastreáveis

- **RF-016:** Ao enviar um link (ativo `category: 'link'` ou link manual), gerar um `ITrackableLink` com `shortRef` e UTM (simulados na Fase 1).
- **RF-017:** Simular "aberturas" do link no ambiente mockado; quando um link enviado a um lead é "aberto", incrementar `opens` e sinalizar evento que **eleva a temperatura do lead** (PRD-017), com indicação visível ao vendedor.
- **RF-018:** Exibir, no contexto da conversa/lead, se o material enviado foi aberto (ex.: "Catálogo aberto há 10 min").

### Versionamento, permissão e gestão

- **RF-019:** Gestor pode `publish`/`unpublish` ativos e definir `allowedRoleIds`; vendedor só envia o que está publicado e permitido (RF-009).
- **RF-020:** Ao atualizar um ativo, incrementar `version`; a versão anterior fica como histórico mínimo; envios sempre usam a versão `published` corrente.
- **RF-021:** Registrar em auditoria (PRD-006): publicar/despublicar ativo, alterar permissão, criar/editar snippet `shared`, e envio de ativos `sensitive` (ex.: tabela de preços, se assim marcada).

### Pacotes, agendamento e sugestão

- **RF-022:** Permitir montar e enviar **pacotes/combos** (conjunto de ativos) em uma única ação; cada item vira sua `IMessage` na sequência.
- **RF-023:** Permitir **agendar** o envio de um ativo/snippet/pacote para data-hora futura (fila local simulada na Fase 1), com lista de "agendados" por conversa e ações editar/cancelar. _Tratamento de janela 24h e recorrência ficam para o scheduler dedicado (PRD futuro)._
- **RF-024:** Integrar com o Copiloto (PRD-025): quando o contexto sugerir um material (ex.: discussão de freio Volvo), o Copiloto expõe um chip "Enviar catálogo de freio Volvo" que, ao clicar, abre o `<AssetPicker>` pré-filtrado.

### Estatística de uso (gestão)

- **RF-025:** Disponibilizar uma visão de gestão (sob RBAC) com ativos mais enviados no período e ranking de uso por vendedor — alimentada pelos `getRecent`/eventos de envio mockados.

### Mocks (DELTA no PRD-004)

- **RF-026:** Solicitar DELTA no PRD-004 para gerar, com a seed determinística, uma biblioteca realista: catálogos por marca (Volvo, Scania, MB, Ford Cargo, Iveco), fichas técnicas, uma tabela de preços (marcável como sensível), termos de garantia, vídeos de instalação e links (loja, localização), além de snippets `shared` comuns e alguns `ITrackableLink` com `opens` simulados.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Abrir o `<AssetPicker>` e mostrar resultados de busca em < 500ms para até 300 ativos; debounce de 300ms na busca.
- **RNF-002 (Não regressão):** O composer existente (PRD-011) — texto, emoji, anexo, templates HSM, sugestões IA, janela 24h — permanece 100% funcional após a integração.
- **RNF-003 (Tipagem):** Zero `any`; tipos derivados das entidades novas do PRD-002.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; picker e slash commands navegáveis por teclado (↑↓, Enter, Esc).
- **RNF-005 (Responsividade):** Picker utilizável de 360px a 1920px; em mobile, picker em folha inferior (bottom sheet).
- **RNF-006 (Tema):** Light e dark obrigatórios (Diesel Heavy).
- **RNF-007 (Substituibilidade):** Trocar providers Mock por reais (storage/short-link) na Fase 2 não deve alterar as features consumidoras.

---

## Critérios de Aceitação

### RF-007/RF-008: Slash command e envio de ativo

```gherkin
DADO que estou numa conversa e digito "/catalogo freio" no campo de mensagem
QUANDO o picker abre
ENTÃO vejo apenas ativos da categoria "catálogo" cujo título contém "freio"
  E ao selecionar o catálogo de freio Volvo, ele é inserido como mensagem outbound (mídia via PRD-026)
  E posso adicionar uma mensagem de contexto antes de enviar
```

### RF-009/RF-019: Versão publicada e permissão

```gherkin
DADO que a tabela de preços v2 está "published" e a v1 está arquivada
QUANDO abro o picker como vendedor permitido
ENTÃO só a v2 aparece como enviável

DADO que sou vendedor sem permissão para enviar a tabela de preços
QUANDO busco por "tabela"
ENTÃO o ativo não aparece como enviável
```

### RF-011/RF-012: Snippet com variáveis

```gherkin
DADO o snippet "/garantia" com body "Olá {{nome}}, a {{peca}} tem garantia de {{prazo}}."
QUANDO eu o insiro numa conversa com a cliente "Lívia" discutindo "pastilha FH 460"
ENTÃO o texto vem como "Olá Lívia, a pastilha FH 460 tem garantia de [prazo]."
  E "[prazo]" fica destacado para eu completar antes de enviar
  E não é possível enviar com placeholder cru
```

### RF-016/RF-017/RF-018: Link rastreável e temperatura

```gherkin
DADO que enviei o link da loja a um lead
QUANDO o ambiente mockado simula a abertura do link
ENTÃO opens incrementa e a temperatura do lead sobe (PRD-017)
  E vejo na conversa "Link da loja aberto há poucos minutos"
```

### RF-023: Agendamento simples

```gherkin
DADO que seleciono um catálogo e escolho "agendar envio" para amanhã às 9h
QUANDO confirmo
ENTÃO o item entra na lista de "agendados" da conversa
  E posso editar ou cancelar antes do horário
  E no horário (simulado) o envio dispara como mensagem outbound
```

### Cenários de Erro

```gherkin
DADO que o storage (PRD-026) falha ao recuperar o arquivo do ativo
QUANDO tento enviar
ENTÃO recebo aviso "não foi possível carregar o material — tentar novamente"
  E nenhuma mensagem quebrada é enviada

DADO que tento usar um slash command inexistente "/xyz"
QUANDO digito
ENTÃO o picker mostra estado vazio "nenhum ativo encontrado" sem erro técnico
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | DELTA de tipos + providers + mocks | 4-6 |
| 2 | AssetPicker + slash commands + envio de ativo | 5-7 |
| 3 | Snippets + card de produto | 4-6 |
| 4 | Links rastreáveis + temperatura + pacotes + agendamento | 5-7 |
| 5 | Versionamento/permissão + estatística + Copiloto + auditoria + polish | 4-6 |

### Detalhamento das Fases

#### Fase 1: Fundação (tipos, providers, mocks)

**Objetivo:** modelo e dados disponíveis.

**Ações:**
- [ ] DELTA no PRD-002 (`IAssetLibraryItem`, `IQuickReply`, `ITrackableLink`) + barrel
- [ ] `IAssetLibraryProvider` + `MockAssetLibraryProvider` (sobre PRD-004), seleção via `VITE_DATA_SOURCE`
- [ ] Confirmar consumo do `IMediaStorageProvider` (PRD-026) para arquivos
- [ ] DELTA no PRD-004 (biblioteca + snippets + links mockados)

**Validação:** `tsc --noEmit` limpo; provider lista biblioteca mockada determinística.

#### Fase 2: Seletor e envio de ativo

**Objetivo:** inserir ativo em 1 clique.

**Ações:**
- [ ] `<AssetPicker>` (busca/filtros/recentes/favoritos) integrado ao composer (PRD-011)
- [ ] Slash commands no textarea
- [ ] Inserção → `IMessage` outbound (mídia via PRD-026) com mensagem de contexto editável
- [ ] Filtro por `published` + RBAC; atalhos de teclado

**Validação:** `/catalogo freio` filtra e envia; ativos não publicados/sem permissão não aparecem; composer original intacto.

#### Fase 3: Snippets e card de produto

**Objetivo:** texto rápido e produto rico.

**Ações:**
- [ ] Inserção de `IQuickReply` por shortcut/picker com resolução de variáveis
- [ ] Destaque editável de variáveis sem valor; bloqueio de placeholder cru
- [ ] Ação "Enviar produto" com busca no catálogo (PRD-030) e bubble de card

**Validação:** snippet resolve variáveis do contexto; card degrada sem imagem/preço.

#### Fase 4: Rastreamento, pacotes e agendamento

**Objetivo:** inteligência e conveniência de envio.

**Ações:**
- [ ] `ITrackableLink` ao enviar links; simulação de aberturas
- [ ] Evento de abertura → eleva temperatura (PRD-017) + indicador na conversa
- [ ] Pacotes/combos (envio em sequência)
- [ ] Agendamento simples (fila local) com lista editar/cancelar

**Validação:** abertura sobe temperatura; combo envia múltiplos; agendado dispara no horário simulado.

#### Fase 5: Governança, gestão, Copiloto e polish

**Objetivo:** controle e acabamento.

**Ações:**
- [ ] Publish/unpublish + permissão por ativo + versionamento mínimo
- [ ] Visão de estatística de uso (gestão, RBAC)
- [ ] Chip de sugestão de ativo do Copiloto (PRD-025) abrindo picker pré-filtrado
- [ ] Auditoria (PRD-006); tema light/dark; responsividade; estados vazios/erro

**Validação:** só versão publicada envia; estatística reflete uso mockado; chip do Copiloto abre picker filtrado; ações sensíveis auditadas.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-026 | Gestão de Mídia (storage) | ⏳ Pendente (este épico) |
| PRD-002 | Modelo Conceitual (DELTA: 3 entidades) | ✅ Concluído (DELTA pendente) |
| PRD-004 | Mocks (DELTA: biblioteca/snippets/links) | ✅ Concluído (DELTA pendente) |
| PRD-005 | Provider Pattern | ✅ Concluído |
| PRD-006 | RBAC e Auditoria | ✅ Concluído |
| PRD-011 | Conversa/Composer | ✅ Concluído |
| PRD-017 | Pipeline de Leads (temperatura) | ✅ Concluído |
| PRD-019 | Configurações/Admin (gestão da biblioteca) | ✅ Concluído |
| PRD-025 | Copiloto de Vendas (sugestão de ativo) | ⏳ Pendente |
| PRD-030 | Catálogo Interno (card de produto) | ✅ Concluído |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| Supabase Storage | Storage (via PRD-026) | A configurar (Fase 2) |
| Encurtador/redirect de link + analytics | API/Serviço | A configurar (Fase 2) |

### Decisões Pendentes

- [ ] Categorias finais da biblioteca e taxonomia de marca/linha a validar com a GALLO
- [ ] Quais ativos são "sensíveis" (ex.: tabela de preços) e quais perfis podem enviá-los
- [ ] Conjunto inicial de snippets `shared` padrão (garantia, frete, prazo, dados de faturamento)
- [ ] Se o agendamento simples deste PRD será absorvido depois pelo scheduler dedicado (recomendado)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Central de Atendimento — Camada de Mídia"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | PRD-026 | Gestão de Mídia (DAM + Galeria) | ⏳ | Fundação de storage |
| 2 | **PRD-027** | **Envio Rápido & Biblioteca de Ativos** | **🔄 ATUAL** | Consome o storage do PRD-026 |

> **Nota:** Implemente após o PRD-026. O envio rápido depende do `IMediaStorageProvider`.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Tabela de preços | Sensível (comercial) | Marcável como restrita; envio por RBAC; auditoria de envio |
| Snippets com dados de faturamento | Sensível | Resolver variáveis sem expor dados de terceiros; RBAC para `shared` |
| `ITrackableLink` | Interno | `shortRef`/UTM não expõem dado do cliente; sem PII no link |

### Autenticação e Autorização

Envio de ativos e gestão da biblioteca herdam o RBAC do PRD-006. Vendedor só envia ativos publicados e permitidos ao seu perfil; publicação/permissão/versão são ações de gestor.

### Auditoria

Registrar via PRD-006: publicar/despublicar ativo, alterar permissão/versão, criar/editar snippet `shared`, envio de ativo sensível, e agendamento/cancelamento de envio.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — Envio rápido de catálogo

1. Vendedor está negociando freio com a cliente
2. Digita `/catalogo freio` no composer → picker filtra catálogos de freio
3. Seleciona "Catálogo Freios Volvo (v3, publicado)"
4. Adiciona contexto "Segue o catálogo, qualquer dúvida me chama" e envia
5. Material vai como mensagem outbound (arquivo via PRD-026); fica localizável na galeria do cliente (PRD-026)

### Fluxos de Exceção

- **Ativo despublicado:** não aparece no picker; se estava nos "recentes", exibe "indisponível (despublicado)".
- **Variável sem valor no snippet:** destaque editável; bloqueio de envio com placeholder cru.
- **Card de produto sem preço/imagem:** card degrada sem quebrar o envio.

### Fluxos de Erro

- **Falha de storage (PRD-026):** aviso "não foi possível carregar o material — tentar novamente"; nada quebrado é enviado.
- **Slash command inexistente:** estado vazio amigável, sem erro técnico.

---

### Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `AssetPicker.tsx`, `ProductCardBubble.tsx` |
| **Hooks** | camelCase + `use` | `useAssetLibrary`, `useQuickReplies` |
| **Provider** | PascalCase + `Provider` | `MockAssetLibraryProvider` |
| **Interfaces** | PascalCase + `I` | `IAssetLibraryItem`, `IQuickReply`, `ITrackableLink` |
| **Pasta da feature** | kebab-case | `src/features/quick-send/` |
| **Env vars (frontend)** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Ícones** | Iconify (`@iconify/react`) | `<Icon icon="mdi:file-send" />` |
| **Tema** | Light + Dark obrigatório | CSS variables (Diesel Heavy) |
| **Git commits** | Conventional Commits | `feat(quick-send): add asset library and slash commands` |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Você é o Claude Opus operando via Claude Code CLI. Este PRD foi criado pelo Agente Arquiteto na plataforma web.

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Renomear este arquivo adicionando `_DONE` ao final (`PRD-027-envio-rapido-biblioteca-ativos_DONE.md`)
> - Atualizar a seção "Status de Implementação" (status, data, versão, observações)
> - Atualizar o INDEX de PRDs

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinome sugerido:** "Dispatch" (envio rápido de materiais). 🔗 https://semver.org/

### Guia de Changelog (Keep a Changelog)

Added, Changed, Deprecated, Removed, Fixed, Security. 🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Não regredir o composer** | A integração estende o PRD-011 sem quebrar texto/emoji/anexo/templates/janela 24h |
| **Reusar storage** | Arquivos sempre via `IMediaStorageProvider` (PRD-026); não duplicar infraestrutura de mídia |
| **Sugerir, não impor** | Slash/Copiloto facilitam, mas o vendedor sempre revisa antes de enviar |
| **Versão correta** | Enviar sempre a versão `published`; nunca um material vencido |
| **Substituibilidade** | Providers Mock trocáveis por reais (storage/short-link) na Fase 2 sem mexer nas features |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Slash commands** | Implementar como sugestão dentro do textarea, sem capturar `/` em contextos onde o vendedor quer digitar barra literal (oferecer escape) |
| **Variáveis de snippet** | Resolver do contexto da conversa/cliente; o que não resolver vira destaque editável, nunca placeholder cru enviado |
| **Links rastreáveis** | `shortRef`/UTM são contrato; aberturas são simuladas na Fase 1 e alimentam PRD-017 |
| **Agendamento** | Manter simples (fila local); janela 24h e recorrência são do scheduler dedicado futuro |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Acessar storage de arquivo direto, sem o `IMediaStorageProvider` (PRD-026) |
| Listar/enviar ativos `draft`/`archived` ou não permitidos ao perfil |
| Enviar snippet com placeholder `{{...}}`/`[...]` não resolvido |
| Duplicar templates HSM do Meta (já são do PRD-011) |
| Implementar short-link/redirect/analytics reais nesta fase |
| Regredir qualquer comportamento existente do composer (PRD-011) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (Fase 1 — Frontend First) |
| **Data de Implementação** | 07/06/2026 |
| **Versão do App** | v0.68.0 (Dispatch) |
| **Implementado por** | Claude Code CLI (Opus 4.8) — fluxo Superpowers (brainstorming → spec → 3 planos → subagent-driven → revisão final) |
| **Observações** | 63 tarefas (A 24 · B 17 · C 22) + 6 correções da revisão final. Build (vite) verde; 244 testes (vitest) verdes. Sem regressão do composer (PRD-011) nem da galeria de mídia (PRD-026). Storage via `IMediaStorageProvider` (PRD-026). Curto/médio prazo Fase 2: short-link/redirect e métricas reais, disparo real via WhatsApp, storage real (Supabase) e scheduler dedicado absorvendo o agendamento simples. Chip do Copiloto (RF-024) com o receptor pronto, aguardando o PRD-025. |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 04/06/2026 | v1 | Criação inicial |
| 07/06/2026 | v0.68.0 | Implementação concluída (Fase 1) — biblioteca de ativos (3 modos), slash commands, snippets com trava, card de produto, links rastreáveis + temperatura, combos, agendamento, governança/estatística e auditoria; codinome "Dispatch" |

---

**AILA - Sistemas Inteligentes**
