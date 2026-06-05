# PRD-026: Gestão de Mídia — DAM e Galeria de Conversas

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Existente (clonado do scaffold Lovable)_ |
| **Objetivo** | Introduzir a camada embarcada de gestão de mídia: storage abstrato (Provider Pattern), persistência de mídia recebida (inbound), galeria unificada por conversa e por cliente, classificação/vinculação assistida e governança (LGPD/retenção). Fundação que o PRD-027 (Envio Rápido) consome. |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 1 — Central de Atendimento (camada de mídia) |
| **PRDs Relacionados** | PRD-002 (Modelo Conceitual — exige DELTA), PRD-004 (Mocks — exige DELTA), PRD-005 (Provider Pattern), PRD-006 (RBAC/Auditoria), PRD-010 (Inbox), PRD-011 (Conversa), PRD-012 (Ficha), PRD-016 (Veículos), PRD-021 (Identificação de Peça), PRD-027 (Envio Rápido — consumidor) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/media/`; provider `IMediaStorageProvider` seguindo o Provider Pattern do PRD-005; camelCase; tipos novos em `src/shared/types/` via DELTA no PRD-002 |

### Critérios de Complexidade Utilizados

| Complexidade | Critérios |
|--------------|-----------|
| **Baixa** | 1 arquivo, sem dependências externas, < 100 linhas |
| **Média** | 2-5 arquivos, banco OU integração, funcionalidade isolada |
| **Alta** | 5+ arquivos, múltiplas integrações, regras de negócio complexas |

> **Justificativa de Alta:** novo provider abstrato de storage com troca Mock → Supabase Storage (PRD-005); introdução de entidade nova (`IMediaAsset`) exigindo DELTA no PRD-002 e gerador no PRD-004; persistência de inbound com simulação de expiração da URL Meta; duas superfícies de UI (galeria por conversa e galeria por cliente na Ficha); classificação assistida com vínculo a `IVehicle`/`IOrder`/`IPart`; governança LGPD com rótulo de sensibilidade, retenção e acesso por RBAC (PRD-006); e preparação explícita do contrato para Supabase Storage + OCR/transcrição da Fase 2.

---

## Contexto do Problema

Hoje a mídia trocada em uma conversa (foto da peça, foto do chassi, nota fiscal, comprovante, áudio) vive apenas dentro do scroll do histórico (PRD-011), como `mediaUrl` em cada `IMessage`. Isso cria três problemas concretos:

**A mídia recebida via WhatsApp é efêmera.** No WhatsApp Cloud API (provider Meta), a URL de mídia tem validade curta — o arquivo precisa ser baixado e persistido em storage próprio, ou se perde. Sem uma camada que faça esse *download-and-store*, o histórico visual do atendimento desaparece com o tempo. Este é o motivo central deste PRD: não é conveniência, é preservação de evidência operacional e comercial.

**A mídia fica enterrada e não é localizável.** Um vendedor que precisa reencontrar a foto da peça que o cliente mandou há três semanas tem de rolar a conversa inteira. Não há visão consolidada "todas as mídias deste cliente" nem busca por tipo, data ou conteúdo. No diesel pesado, onde foto de peça, chassi e nota fiscal são parte do fluxo de cotação e faturamento, isso custa tempo a cada atendimento.

**Não há governança sobre dado sensível.** Notas fiscais e comprovantes carregam CPF/CNPJ e dados de faturamento. Sem classificação, controle de acesso e política de retenção, a plataforma acumula PII sem rastreabilidade — risco direto de LGPD para a GALLO.

---

## Conceito da Solução

### Situação Atual (As-Is)

A mídia existe apenas como `mediaType?`/`mediaUrl?` em `IMessage` (PRD-002, RF-024), renderizada inline pelos bubbles do PRD-011 (`ImageBubble`, `AudioBubble`, `DocumentBubble`). Não há persistência própria, catálogo, galeria, classificação nem governança. Nenhuma feature de mídia existe em `src/features/`.

### Situação Desejada (To-Be)

Uma camada `src/features/media/` que:

1. Expõe um **provider de storage abstrato** (`IMediaStorageProvider`) com a mesma assinatura para Mock (Fase 1) e Supabase Storage (Fase 2).
2. **Persiste toda mídia inbound** como `IMediaAsset` no momento em que chega, simulando na Fase 1 o *download-and-store* que evitará a expiração da URL Meta na Fase 2.
3. Oferece **galeria por conversa** (drawer acessível do header da conversa) e **galeria por cliente** (aba na Ficha do PRD-012), com grid de thumbnails, preview/lightbox, filtros e busca.
4. **Classifica e vincula** a mídia (nota fiscal / peça / chassi-placa / comprovante / outro), sugerindo vínculo a `IVehicle`, `IOrder` ou disparando a identificação de peça (PRD-021) — por regra determinística na Fase 1, por IA na Fase 2.
5. Aplica **governança**: rótulo de sensibilidade, retenção parametrizável e acesso por RBAC (PRD-006), com auditoria das ações sensíveis.

### Alternativas Consideradas

| Alternativa | Por que foi descartada |
|-------------|------------------------|
| Manter mídia só como `mediaUrl` em `IMessage` | Não resolve expiração da URL Meta, não permite galeria/busca/governança; é o problema atual |
| Acoplar storage direto no provider de conversas (PRD-011) | Mistura responsabilidades; o Envio Rápido (PRD-027) e features futuras (catálogo, identificação de peça) também precisam de storage — exige camada própria reutilizável |
| Embutir biblioteca de envio (outbound) neste PRD | Quebra a divisão acordada; outbound é o PRD-027. Este PRD entrega só a fundação de storage + inbound + galeria |
| Implementar OCR/transcrição reais agora | Viola Frontend First; depende de backend (Whisper/OCR). Fica como placeholder com contrato pronto para a Fase 2 |

---

## Escopo

### Incluído

- ✅ Provider `IMediaStorageProvider` (Mock na Fase 1) com operações de `upload`, `get`, `getSignedUrl`, `delete`, `list`, seguindo o Provider Pattern do PRD-005 (troca via `VITE_DATA_SOURCE`)
- ✅ Entidade `IMediaAsset` (DELTA no PRD-002) com metadados, vínculos e governança
- ✅ Persistência simulada de mídia **inbound**: ao chegar mensagem com mídia, criar `IMediaAsset` correspondente (simulando *download-and-store*)
- ✅ Indicador de "URL de origem expira em…" na Fase 1 (simulação visual da regra Meta) e flag `persisted: boolean`
- ✅ **Galeria por conversa**: drawer aberto pelo header da conversa (PRD-011), grid de thumbnails, contagem por tipo
- ✅ **Galeria por cliente**: nova aba na Ficha (PRD-012) agregando mídia de todas as conversas do cliente
- ✅ Tipos suportados: imagem, áudio, documento (PDF/XLSX/DOCX), vídeo
- ✅ Preview/lightbox: imagem em tela cheia, player de áudio (com velocidade 1x/1.5x/2x), viewer/abrir PDF, download
- ✅ Filtros da galeria: por tipo, autor (cliente/vendedor/sdr/sistema), período
- ✅ Busca por conteúdo (placeholder Fase 1): campos `ocrText?` e `transcription?` em `IMediaAsset`, populados com mock; busca textual sobre eles
- ✅ Classificação assistida por **regra determinística** (Fase 1): heurística por tipo/nome/mock → `classification` (`nota_fiscal | peca | chassi_placa | comprovante | catalogo | outro`)
- ✅ Vínculo assistido: sugerir associação a `IVehicle` (PRD-016) / `IOrder` / disparo de identificação de peça (PRD-021); confirmação manual pelo usuário
- ✅ Deduplicação por hash simulado (`contentHash`): não duplicar `IMediaAsset` idêntico na mesma conversa
- ✅ Anotação simples em imagem (marcação de ponto) — overlay salvo como nova versão do asset
- ✅ Governança LGPD: `sensitivity: 'normal' | 'sensitive'`, política de retenção parametrizável (placeholder de configuração), acesso por RBAC
- ✅ Auditoria (PRD-006) das ações sensíveis: visualizar mídia sensível, excluir, baixar nota fiscal
- ✅ Geração de mídia mockada no PRD-004 (DELTA): assets variados por conversa/cliente, incluindo notas e fotos de peça/chassi
- ✅ Tema light/dark obrigatório; responsividade 360–1920px

### Excluído

- ❌ Upload/storage real em Supabase Storage — Fase 2 (PRDs 100-102)
- ❌ OCR real de documentos e transcrição real de áudio — Fase 2 (motor compartilhado com coleta de quilometragem)
- ❌ Classificação por IA/visão computacional real — Fase 2 (Fase 1 é regra determinística)
- ❌ Biblioteca de ativos de envio (outbound) — responsabilidade do PRD-027
- ❌ Edição avançada de imagem (recorte, filtros) — fora do MVP; apenas anotação de ponto
- ❌ Exportar galeria do cliente como ZIP — Fase 2
- ❌ Geração de thumbnail server-side — Fase 1 usa preview client-side/placeholder
- ❌ Versionamento completo de asset (histórico de N versões) — Fase 1 guarda apenas original + 1 anotação
- ❌ Compartilhamento de mídia entre clientes distintos — fora do MVP

---

## Requisitos Funcionais

### Provider e modelo de dados

- **RF-001:** Definir o contrato `IMediaStorageProvider` com operações assíncronas: `upload(file, meta)`, `get(assetId)`, `getSignedUrl(assetId)`, `delete(assetId)`, `list(filter)`. A assinatura deve ser idêntica para Mock e para a futura implementação Supabase Storage.
- **RF-002:** Implementar `MockMediaStorageProvider` que opera sobre os dados gerados no PRD-004, retornando URLs/blobs locais e simulando latência (200–600ms) e falha ocasional (configurável em `src/mocks/config.ts`).
- **RF-003:** Selecionar a implementação ativa via `VITE_DATA_SOURCE`, consistente com o PRD-005. Em `mock`, usar `MockMediaStorageProvider`; em `supabase`, lançar erro explícito de "não implementado na Fase 1".
- **RF-004:** Solicitar DELTA no PRD-002 para a entidade `IMediaAsset` em `src/shared/types/conversation.ts` (ou novo `media.ts`), contendo no mínimo: `id`, `conversationId?`, `customerId?`, `messageId?`, `kind: 'image' | 'audio' | 'document' | 'video'`, `mimeType`, `sizeBytes`, `fileName?`, `authorType: 'customer' | 'seller' | 'sdr' | 'system'`, `direction: 'in' | 'out'`, `createdAt: ISO8601`, `storageRef: string`, `persisted: boolean`, `sourceExpiresAt?: ISO8601`, `contentHash?: string`, `classification?: IMediaClassification`, `linkedVehicleId?`, `linkedOrderId?`, `linkedPartId?`, `ocrText?`, `transcription?`, `sensitivity: 'normal' | 'sensitive'`, `annotations?`.
- **RF-005:** Definir `IMediaClassification` como union literal: `'nota_fiscal' | 'peca' | 'chassi_placa' | 'comprovante' | 'catalogo' | 'outro'`.

### Persistência de inbound

- **RF-006:** Ao renderizar/receber uma `IMessage` com `mediaType` e `mediaUrl` (inbound), garantir a existência de um `IMediaAsset` correspondente, criado via provider. Se já existir (mesmo `messageId` ou mesmo `contentHash` na conversa), não duplicar (deduplicação).
- **RF-007:** Para mídia inbound do provider Meta, popular `sourceExpiresAt` (simulado) e exibir no asset um indicador visual de "origem expira em …"; após persistência simulada, `persisted = true` e o indicador some.
- **RF-008:** A persistência não pode bloquear a renderização da conversa: se o provider falhar, manter o bubble funcional e marcar o asset como `persisted = false` com opção de "tentar novamente".

### Galeria por conversa

- **RF-009:** Adicionar no header da conversa (PRD-011) uma ação "Mídias" que abre um drawer `<ConversationMediaGallery>` listando todos os `IMediaAsset` da conversa em grid de thumbnails.
- **RF-010:** O drawer deve exibir contadores por tipo (ex.: "12 imagens · 3 documentos · 5 áudios") e permitir filtrar por tipo, autor e período.
- **RF-011:** Clique em um item abre o `<MediaLightbox>`: imagem em tela cheia, player de áudio com controle de velocidade (1x/1.5x/2x), documento com botão "abrir/baixar".
- **RF-012:** No lightbox, exibir metadados do asset (autor, data, tamanho), classificação e vínculos; e ações contextuais (anotar imagem, classificar, vincular, baixar, excluir) filtradas por RBAC.

### Galeria por cliente

- **RF-013:** Adicionar na Ficha do cliente (PRD-012) uma aba "Mídias" (`<CustomerMediaGallery>`) que agrega os `IMediaAsset` de **todas** as conversas do cliente, respeitando RBAC e Multi-Loja (via providers).
- **RF-014:** A galeria por cliente deve oferecer os mesmos filtros da galeria por conversa, mais um filtro por classificação (ex.: ver só notas fiscais).
- **RF-015:** Cada item deve indicar de qual conversa veio, com atalho para abrir a conversa de origem (PRD-011) na mensagem correspondente.

### Busca, classificação e vínculo

- **RF-016:** Implementar busca textual na galeria que pesquise em `fileName`, `ocrText` e `transcription`. Na Fase 1, esses campos vêm mockados; a busca deve funcionar sobre eles e destacar o termo.
- **RF-017:** Aplicar classificação automática por regra determinística no momento da criação do asset (heurística por `kind`, `mimeType`, `fileName` e marcação no mock). O resultado é uma **sugestão** editável pelo usuário, nunca um vínculo silencioso e irreversível.
- **RF-018:** Quando a classificação for `chassi_placa`, sugerir vínculo a um `IVehicle` (PRD-016) do cliente; quando `peca`, oferecer ação "Identificar peça" (PRD-021); quando `nota_fiscal`/`comprovante`, sugerir vínculo a um `IOrder`. Toda vinculação exige confirmação do usuário.
- **RF-019:** Permitir ao usuário reclassificar manualmente e editar/remover vínculos; registrar a alteração em auditoria (PRD-006).

### Anotação e governança

- **RF-020:** Permitir anotação simples em imagem (marcação de ponto/seta sobre a imagem) salva como overlay; o asset passa a ter `annotations` e a versão anotada fica disponível para reenvio (consumido pelo PRD-027).
- **RF-021:** Marcar como `sensitivity: 'sensitive'` automaticamente os assets classificados como `nota_fiscal` ou `comprovante`; permitir marcação manual de sensibilidade.
- **RF-022:** Restringir visualização/download de assets `sensitive` conforme RBAC (PRD-006); vendedor sem permadequada vê thumbnail borrado com aviso "conteúdo sensível — acesso restrito".
- **RF-023:** Expor em Configurações (placeholder, sob PRD-019) o parâmetro de **retenção** de mídia (ex.: dias até elegível para expurgo) — na Fase 1 apenas configurável e exibido, sem expurgo efetivo.
- **RF-024:** Registrar em auditoria (PRD-006) as ações: visualizar asset sensível, baixar nota fiscal/comprovante, excluir asset, alterar classificação/vínculo, alterar sensibilidade.

### Mocks (DELTA no PRD-004)

- **RF-025:** Solicitar DELTA no PRD-004 para gerar, com a seed determinística existente, um conjunto realista de `IMediaAsset` distribuídos entre conversas e clientes: fotos de peça, fotos de chassi/placa, notas fiscais (sensíveis), comprovantes, áudios (com `transcription` mockada) e documentos, incluindo alguns `persisted: false` e alguns com `sourceExpiresAt` próximo para demonstrar o fluxo.

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Abrir a galeria (drawer ou aba) e renderizar o grid em < 1s para até 200 assets; usar virtualização do grid quando > 60 itens.
- **RNF-002 (Não bloqueio):** A persistência/classificação de inbound nunca bloqueia a renderização da conversa nem o envio de mensagens.
- **RNF-003 (Tipagem):** Zero `any`; todos os tipos derivados de `IMediaAsset`/`IMediaClassification` do PRD-002.
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; lightbox navegável por teclado (setas, Esc); thumbnails com `alt` descritivo.
- **RNF-005 (Responsividade):** Galeria e lightbox funcionais de 360px a 1920px; em mobile, galeria em tela cheia.
- **RNF-006 (Tema):** Light e dark obrigatórios via CSS variables (Diesel Heavy).
- **RNF-007 (Substituibilidade):** Trocar `MockMediaStorageProvider` por implementação Supabase Storage na Fase 2 não deve exigir alteração nas features consumidoras (galeria, PRD-027).
- **RNF-008 (Privacidade):** Nenhuma credencial ou URL real persistida em `IMediaAsset`; `storageRef` é referência ofuscada, consistente com o padrão de `credentialsRef` do PRD-002.

---

## Critérios de Aceitação

### RF-006/RF-007: Persistência de inbound e expiração simulada

```gherkin
DADO que uma conversa do provider Meta recebe uma nova mensagem com foto da peça
QUANDO a mensagem é renderizada
ENTÃO um IMediaAsset correspondente é criado via provider
  E o asset exibe "origem expira em 29 dias" enquanto persisted = false
  E após a persistência simulada, persisted = true e o indicador desaparece

DADO que a mesma foto (mesmo contentHash) chega novamente na conversa
QUANDO o asset seria criado
ENTÃO o sistema não duplica e mantém um único IMediaAsset
```

### RF-009/RF-013: Galerias

```gherkin
DADO que estou em uma conversa com 12 imagens, 3 documentos e 5 áudios
QUANDO clico em "Mídias" no header
ENTÃO um drawer abre mostrando o grid com os 20 assets
  E vejo os contadores "12 imagens · 3 documentos · 5 áudios"
  E ao filtrar por "documentos", vejo apenas os 3 documentos

DADO que abro a Ficha de um cliente com mídia em 4 conversas distintas
QUANDO acesso a aba "Mídias"
ENTÃO vejo todos os assets agregados das 4 conversas
  E cada item indica a conversa de origem com atalho para abri-la
```

### RF-016: Busca por conteúdo (placeholder)

```gherkin
DADO que existe um áudio com transcription mockada contendo "pastilha dianteira"
QUANDO busco "pastilha" na galeria
ENTÃO o áudio aparece nos resultados com o termo destacado
```

### RF-018/RF-019: Classificação e vínculo

```gherkin
DADO que uma foto recebida foi classificada automaticamente como "chassi_placa"
QUANDO abro o asset no lightbox
ENTÃO vejo a sugestão de vincular a um veículo do cliente (PRD-016)
  E ao confirmar, linkedVehicleId é preenchido
  E a ação é registrada em auditoria

DADO que discordo da classificação automática
QUANDO reclassifico o asset manualmente
ENTÃO a nova classificação é salva e a alteração é auditada
```

### RF-022: Governança de mídia sensível (Cenário de restrição)

```gherkin
DADO que sou Vendedor sem permissão de ver dados de faturamento
QUANDO abro a galeria de um cliente que contém notas fiscais
ENTÃO os thumbnails das notas aparecem borrados com aviso "conteúdo sensível — acesso restrito"
  E tentar abrir gera bloqueio com mensagem clara
  E a tentativa é registrada em auditoria
```

### Cenários de Erro

```gherkin
DADO que o provider de storage falha ao persistir um asset inbound
QUANDO a falha ocorre
ENTÃO o bubble da mensagem continua funcional
  E o asset é marcado como persisted = false com botão "tentar novamente"
  E nenhuma exceção quebra a renderização da conversa

DADO que tento abrir um asset cujo storageRef não resolve
QUANDO o lightbox tenta carregar
ENTÃO exibo placeholder de erro com opção de recarregar
  E não exibo URL técnica nem stack trace ao usuário
```

---

## Fases de Implementação

| Fase | Objetivo | Arquivos Estimados |
|------|----------|-------------------|
| 1 | DELTA de tipos + provider abstrato + mocks | 4-6 |
| 2 | Persistência de inbound + deduplicação + expiração simulada | 3-4 |
| 3 | Galeria por conversa + lightbox | 5-7 |
| 4 | Galeria por cliente + busca + classificação/vínculo | 5-7 |
| 5 | Governança (RBAC/sensibilidade/retenção) + anotação + auditoria + polish | 4-6 |

### Detalhamento das Fases

#### Fase 1: Fundação (tipos, provider, mocks)

**Objetivo:** contrato de storage e dados disponíveis.

**Ações:**
- [ ] Solicitar/aplicar DELTA no PRD-002 (`IMediaAsset`, `IMediaClassification`) e no barrel de tipos
- [ ] Definir `IMediaStorageProvider` e implementar `MockMediaStorageProvider` sobre o PRD-004
- [ ] Integrar seleção via `VITE_DATA_SOURCE` (PRD-005)
- [ ] Solicitar/aplicar DELTA no PRD-004 para gerar assets mockados realistas

**Validação:** `tsc --noEmit` limpo; provider lista assets mockados; seed determinística reproduz o mesmo conjunto.

#### Fase 2: Persistência de inbound

**Objetivo:** todo inbound vira `IMediaAsset` sem duplicar.

**Ações:**
- [ ] Hook/serviço que cria asset a partir de `IMessage` inbound com mídia
- [ ] Deduplicação por `contentHash`/`messageId`
- [ ] Simulação de `sourceExpiresAt` + transição `persisted false → true`
- [ ] Tratamento de falha sem bloquear a conversa

**Validação:** receber mídia cria asset único; falha mantém conversa funcional; indicador de expiração aparece e some.

#### Fase 3: Galeria por conversa + lightbox

**Objetivo:** ver e manipular mídia da conversa.

**Ações:**
- [ ] `<ConversationMediaGallery>` (drawer) com grid virtualizado e contadores
- [ ] Filtros por tipo/autor/período
- [ ] `<MediaLightbox>` com imagem, player de áudio (1x/1.5x/2x), documento
- [ ] Ações contextuais no lightbox

**Validação:** drawer abre do header (PRD-011); filtros funcionam; lightbox navega por teclado.

#### Fase 4: Galeria por cliente + busca + classificação/vínculo

**Objetivo:** visão agregada e inteligência assistida.

**Ações:**
- [ ] Aba "Mídias" na Ficha (PRD-012) agregando conversas do cliente
- [ ] Filtro por classificação + atalho para conversa de origem
- [ ] Busca textual sobre `fileName`/`ocrText`/`transcription`
- [ ] Regra determinística de classificação + sugestão de vínculo (PRD-016/021/Order) com confirmação

**Validação:** agregação respeita RBAC/Multi-Loja; busca destaca termo; vínculos exigem confirmação e são auditados.

#### Fase 5: Governança, anotação e polish

**Objetivo:** segurança, conformidade e acabamento.

**Ações:**
- [ ] Sensibilidade automática/manual + thumbnails borrados sob RBAC
- [ ] Parâmetro de retenção (placeholder) em Configurações (PRD-019)
- [ ] Anotação de ponto em imagem salva como overlay
- [ ] Auditoria (PRD-006) nas ações sensíveis
- [ ] Tema light/dark, responsividade, estados vazios/erro

**Validação:** vendedor restrito não abre nota fiscal; ações sensíveis aparecem na auditoria; anotação persiste; light/dark ok.

---

## Dependências

### PRDs Anteriores

| PRD | Descrição | Status |
|-----|-----------|--------|
| PRD-002 | Modelo Conceitual (requer DELTA: `IMediaAsset`) | ✅ Concluído (DELTA pendente) |
| PRD-004 | Mocks (requer DELTA: geração de assets) | ✅ Concluído (DELTA pendente) |
| PRD-005 | Provider Pattern Mock/Supabase | ✅ Concluído |
| PRD-006 | RBAC e Auditoria | ✅ Concluído |
| PRD-010 | Inbox de Conversas | ✅ Concluído |
| PRD-011 | Conversa Multicanal (header/bubbles) | ✅ Concluído |
| PRD-012 | Ficha do Cliente (aba Mídias) | ✅ Concluído |
| PRD-016 | Veículos (vínculo chassi/placa) | ✅ Concluído |
| PRD-021 | Identificação de Peça (ação "identificar") | ✅ Concluído |

### Serviços Externos

| Serviço | Tipo | Status |
|---------|------|--------|
| Supabase Storage | Storage | A configurar (Fase 2 — PRDs 100-102) |
| OCR / Transcrição (ex.: Whisper) | API | A configurar (Fase 2) |

### Decisões Pendentes

- [ ] Local do tipo: estender `conversation.ts` ou criar `media.ts` dedicado (recomendação: `media.ts` dedicado pela coesão)
- [ ] Política de retenção default (nº de dias) a confirmar com a GALLO
- [ ] Quais perfis RBAC podem ver/baixar mídia `sensitive` (alinhar com PRD-006/PRD-019)

---

## Cadeia de PRDs

Este PRD faz parte do épico **"Central de Atendimento — Camada de Mídia"**.

| Ordem | PRD | Título | Status | Relação |
|-------|-----|--------|--------|---------|
| 1 | **PRD-026** | **Gestão de Mídia (DAM + Galeria)** | **🔄 ATUAL** | Fundação de storage e inbound |
| 2 | PRD-027 | Envio Rápido & Biblioteca de Ativos | ⏳ | Depende do `IMediaStorageProvider` deste PRD |

> **Nota:** Implemente na ordem indicada. O PRD-027 consome o provider de storage entregue aqui.

**Legenda:** ✅ Implementado | 🔄 Atual | ⏳ Pendente

---

## Considerações de Segurança

### Dados Sensíveis

| Dado | Classificação | Proteção |
|------|---------------|----------|
| Nota fiscal / comprovante (CPF/CNPJ, faturamento) | PII / Sensível | `sensitivity: 'sensitive'`, acesso por RBAC, auditoria de visualização/download |
| Foto de chassi/placa | Sensível (identifica veículo/cliente) | Vínculo controlado, acesso por RBAC |
| `storageRef` | Interno | Referência ofuscada; nunca expor URL/credencial real |

### Autenticação e Autorização

Acesso à mídia herda o RBAC do PRD-006 e a filtragem Multi-Loja via providers. Mídia `sensitive` exige permissão específica; ausência resulta em thumbnail borrado + bloqueio de abertura.

### Auditoria

Registrar via PRD-006: visualização de mídia sensível, download de nota/comprovante, exclusão de asset, alteração de classificação/vínculo e alteração de sensibilidade — com autor, timestamp e `assetId`.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — Cliente envia foto da peça

1. Cliente envia foto da peça pelo WhatsApp (inbound)
2. Sistema cria `IMediaAsset` (kind=image), simula `sourceExpiresAt` e persiste (`persisted=true`)
3. Regra determinística classifica como `peca` (sugestão)
4. Vendedor abre "Mídias" no header → vê a foto no grid
5. No lightbox, clica "Identificar peça" → fluxo do PRD-021
6. Foto fica vinculada e localizável na galeria do cliente

### Fluxos de Exceção

- **Classificação errada:** vendedor reclassifica manualmente; alteração auditada.
- **Mídia sensível para perfil restrito:** thumbnail borrado, abertura bloqueada, tentativa auditada.
- **Mesma foto reenviada:** deduplicação evita asset duplicado.

### Fluxos de Erro

- **Falha de persistência:** asset `persisted=false` com "tentar novamente"; conversa segue funcional.
- **`storageRef` não resolve:** lightbox mostra placeholder de erro + recarregar; sem detalhes técnicos ao usuário.

---

### Convenções de Código (Referência Rápida)

> **Consulte a Seção 5 do `guia-prd.md` para a versão completa.**

| Elemento | Convenção | Exemplo |
|----------|-----------|---------|
| **Componentes React** | PascalCase | `ConversationMediaGallery.tsx`, `MediaLightbox.tsx` |
| **Hooks** | camelCase + `use` | `useMediaStorage`, `useConversationMedia` |
| **Provider** | PascalCase + `Provider` | `MockMediaStorageProvider` |
| **Interfaces** | PascalCase + `I` | `IMediaAsset`, `IMediaStorageProvider` |
| **Pasta da feature** | kebab-case | `src/features/media/` |
| **Env vars (frontend)** | `VITE_` prefix | `VITE_DATA_SOURCE` |
| **Ícones** | Iconify (`@iconify/react`) | `<Icon icon="mdi:image-multiple" />` |
| **Tema** | Light + Dark obrigatório | CSS variables (Diesel Heavy) |
| **Git commits** | Conventional Commits | `feat(media): add storage provider and conversation gallery` |

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
> - Renomear este arquivo adicionando `_DONE` ao final (`PRD-026-gestao-midia_DONE.md`)
> - Atualizar a seção "Status de Implementação" (status, data, versão, observações)
> - Atualizar o INDEX de PRDs

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinome sugerido:** "Vault" (preservação e guarda de mídia). 🔗 https://semver.org/

### Guia de Changelog (Keep a Changelog)

Added, Changed, Deprecated, Removed, Fixed, Security. 🔗 https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Não bloquear fluxo principal** | Persistência/classificação de mídia nunca trava a conversa ou o envio |
| **Fail gracefully** | Falha de storage → asset `persisted=false` recuperável; nunca exceção fatal |
| **Preservar evidências** | Inbound é persistido o quanto antes; deduplicar, não descartar |
| **Sugerir, não impor** | Classificação/vínculo são sugestões confirmáveis e reversíveis, sempre auditadas |
| **Substituibilidade** | Manter a assinatura do provider idêntica para Mock e Supabase Storage |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Storage abstrato** | Toda leitura/escrita de mídia passa pelo `IMediaStorageProvider`; features não acessam storage diretamente |
| **Expiração Meta** | Tratar `sourceExpiresAt` como conceito de primeira classe já na Fase 1 (simulado) para a Fase 2 ser drop-in |
| **OCR/Transcrição** | Campos `ocrText`/`transcription` existem na Fase 1 (mock) para a busca já funcionar; motor real é Fase 2 |
| **Governança** | Sensibilidade default automática para nota/comprovante; nunca expor sensível sem checar RBAC |

### O que NÃO Fazer

| ❌ Evitar |
|----------|
| Acessar `mediaUrl` cru sem passar pelo provider de storage |
| Persistir URL/credencial real em `IMediaAsset` (`storageRef` é ofuscado) |
| Vincular asset a veículo/pedido/peça de forma automática sem confirmação do usuário |
| Implementar a biblioteca de envio (outbound) aqui — é o PRD-027 |
| Bloquear a renderização da conversa por causa de persistência/classificação |
| Implementar OCR/transcrição/classificação por IA reais nesta fase |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 04/06/2026 | v1 | Criação inicial |

---

**AILA - Sistemas Inteligentes**
