# PRD-106: Storage (Buckets e Mídias)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo da Fase 1, diretórios `supabase/` e `src/providers/supabase/storage/`_ |
| **Objetivo** | Configurar Supabase Storage com buckets organizados por domínio (imagens de produtos, anexos de mensagens, documentos fiscais, avatares), políticas de acesso espelhando RLS, transformações de imagem on-the-fly, limpeza/retenção, e integração transparente ao Provider Pattern para upload/download |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P1 — não-bloqueante para go-live mínimo, mas necessário para WhatsApp mídia (Onda 5), NF PDF (Onda 6) e catálogo com fotos |
| **Épico** | Onda 4 — Backend Supabase Real (v2.0.0 Engine) |
| **PRDs Relacionados** | PRD-100 (Setup — Storage habilitado); PRD-103 (RLS — políticas de bucket espelham padrão); PRD-104 (Provider — integra upload/download); PRD-114/115 (WhatsApp — mídia recebida/enviada); PRD-127B (NFe — PDF/XML armazenados); PRD-063 Fase 1 (Ficha de Produto — exibe imagens) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Buckets em kebab-case; paths estruturados `<entity>/<id>/<filename>`; lógica em `src/providers/supabase/storage/` |

### Critérios de Complexidade

> **Justificativa de Média:** Storage não tem lógica de negócio complexa, mas exige acertos de organização (estrutura de buckets e paths que escalam), segurança (políticas que impedem vazamento de documento fiscal de um cliente para outro), e integração com o Provider Pattern. Transformações de imagem e retenção adicionam nuance. Erro de política de bucket pode expor PDF de NF (dado fiscal sensível) publicamente.

---

## Contexto do Problema

Várias features da Fase 2 precisam armazenar arquivos binários:

| Necessidade | Onda | Tipo de arquivo |
|-------------|------|------------------|
| Fotos de produtos no e-commerce | Fase 1/2 | Imagens (jpg, png, webp) |
| Mídia recebida via WhatsApp (cliente envia foto da peça) | 5 | Imagens, áudio, vídeo, documentos |
| Mídia enviada via WhatsApp (vendedor manda catálogo) | 5 | Imagens, PDFs |
| PDF e XML de NFe | 6 | PDF, XML |
| Avatar de vendedor | Fase 1/2 | Imagens |
| Anexos de orçamento (proposta formatada) | 6 | PDF |
| CSV de import DINTEC | 6 | CSV (temporário) |

Hoje (mockup) imagens vêm de URLs fixas/placeholder. Sem Storage real, nenhuma dessas features funciona.

A complexidade está em **organizar buckets e políticas** de forma que:
1. Imagens de produto sejam públicas (e-commerce precisa servir rápido)
2. PDF de NF de um cliente NÃO seja acessível por outro cliente
3. Mídia de WhatsApp respeite o isolamento de carteira (vendedor A não vê foto enviada para vendedor B)
4. Upload seja simples para o Provider Pattern consumir

---

## Conceito da Solução

### Estrutura de Buckets

| Bucket | Visibilidade | Conteúdo | Path pattern |
|--------|--------------|----------|--------------|
| `product-images` | **Público** | Fotos de produtos (e-commerce) | `parts/<part_id>/<filename>` |
| `whatsapp-media` | **Privado** | Mídia de conversas | `conversations/<conversation_id>/<message_id>/<filename>` |
| `fiscal-documents` | **Privado** | PDF/XML de NFe | `orders/<order_id>/<nf_number>.{pdf,xml}` |
| `quote-documents` | **Privado** | PDFs de orçamentos formatados | `quotes/<quote_id>/<filename>` |
| `avatars` | **Público** | Avatares de vendedores | `sellers/<seller_id>/avatar.<ext>` |
| `imports-temp` | **Privado** | CSVs de import DINTEC (temporário) | `dintec/<timestamp>/<filename>` |

### Políticas de Acesso (espelham RLS)

**Bucket público (`product-images`, `avatars`):**
- SELECT (read): qualquer um (`anon` + `authenticated`)
- INSERT/UPDATE/DELETE: apenas `owner`/`manager` (via JWT autenticado)

**Bucket privado (`whatsapp-media`):**
- SELECT: vendedor responsável pela conversa OU owner/manager (policy usa join via path → conversation → seller_id)
- INSERT: vendedor responsável + Edge Function de webhook (service_role)
- DELETE: bloqueado (mídia de conversa é histórico)

**Bucket privado (`fiscal-documents`):**
- SELECT: owner/manager + cliente dono do pedido (B2B portal) + vendedor responsável
- INSERT: apenas Edge Function de emissão NFe (service_role)
- DELETE: bloqueado (documento fiscal é imutável por lei)

**Bucket privado (`imports-temp`):**
- Tudo: apenas owner/manager + service_role
- Retenção: limpeza automática após 30 dias (arquivos temporários)

### Transformações de Imagem

Supabase Storage oferece transformação on-the-fly via query params (`?width=400&quality=75`). Usado para:
- Thumbnails de produto no e-commerce (não servir imagem full-size)
- Avatar redimensionado
- Preview de mídia WhatsApp

O provider expõe helper `getImageUrl(bucket, path, { width, height, quality })`.

### Integração com Provider Pattern

```typescript
// src/providers/supabase/storage/StorageProvider.ts
export interface IStorageProvider {
  upload(bucket: string, path: string, file: File): Promise<{ path: string }>
  getPublicUrl(bucket: string, path: string): string
  getSignedUrl(bucket: string, path: string, expiresInSec: number): Promise<string>
  getImageUrl(bucket: string, path: string, transform?: ImageTransform): string
  remove(bucket: string, paths: string[]): Promise<void>
  list(bucket: string, prefix: string): Promise<StorageFile[]>
}
```

Mock provider (Fase 1) já tem stub; este PRD implementa a versão Supabase.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| AWS S3 direto | Supabase Storage já é S3-compatible, integrado com Auth/RLS. Sem ganho em ir direto |
| Cloudinary para imagens | Custo adicional; Supabase transform cobre o necessário no MVP |
| Único bucket para tudo | Políticas de acesso ficariam complexas. Buckets por domínio é mais claro |
| Armazenar imagens como base64 no banco | Infla o banco, péssima performance. Storage é o lugar certo |
| URLs assinadas para tudo (inclusive público) | Imagens de produto são públicas por natureza; assinar adiciona latência sem ganho |

---

## Escopo

### Incluído

- ✅ Criação dos 6 buckets via migration ou config: `product-images`, `whatsapp-media`, `fiscal-documents`, `quote-documents`, `avatars`, `imports-temp`
- ✅ Políticas de Storage (RLS de Storage) para cada bucket conforme matriz acima
- ✅ `IStorageProvider` interface + implementação Supabase em `src/providers/supabase/storage/`
- ✅ Mock storage provider (atualizar stub Fase 1 se necessário)
- ✅ Helper de transformação de imagem (`getImageUrl` com width/height/quality)
- ✅ Helper de signed URLs para buckets privados (expiração configurável)
- ✅ Limpeza automática de `imports-temp` (job pg_cron ou Edge Function agendada, retenção 30 dias)
- ✅ Validação de tipo e tamanho de arquivo no upload (client-side + bucket config)
- ✅ Integração na Ficha de Produto (PRD-063) para exibir imagens reais
- ✅ Integração no upload de avatar de vendedor
- ✅ Documentação `docs/dev/storage.md`: buckets, políticas, como fazer upload, transformações
- ✅ Testes: upload/download em bucket público e privado, signed URL expira, política bloqueia acesso cruzado

### Excluído

- ❌ Upload de mídia WhatsApp (vai no PRD-115 — usa este storage)
- ❌ Geração de PDF de NFe (vai no PRD-127B — armazena aqui)
- ❌ Geração de PDF de orçamento (vai em PRD da Onda 6)
- ❌ CDN customizado (Supabase já serve via CDN próprio)
- ❌ Versionamento de arquivos (sobrescrita simples no MVP)
- ❌ Compressão de vídeo (apenas armazena; transcoding fora de escopo)
- ❌ Antivírus scan de uploads (avaliar em Onda 13 Compliance)
- ❌ Backup separado de Storage (PITR do Supabase cobre; PRD-109 detalha)

---

## Requisitos Funcionais

### Criação de Buckets

- **RF-001:** Criar bucket `product-images` como **público**. Limite de arquivo 5MB. MIME types permitidos: `image/jpeg`, `image/png`, `image/webp`.
- **RF-002:** Criar bucket `avatars` como **público**. Limite 2MB. MIME: imagens.
- **RF-003:** Criar bucket `whatsapp-media` como **privado**. Limite 16MB (limite do WhatsApp). MIME: imagens, áudio, vídeo, PDF, documentos comuns.
- **RF-004:** Criar bucket `fiscal-documents` como **privado**. Limite 5MB. MIME: `application/pdf`, `application/xml`, `text/xml`.
- **RF-005:** Criar bucket `quote-documents` como **privado**. Limite 5MB. MIME: `application/pdf`.
- **RF-006:** Criar bucket `imports-temp` como **privado**. Limite 50MB. MIME: `text/csv`, `application/vnd.ms-excel`.
- **RF-007:** Buckets criados via migration SQL (`storage.buckets` insert) ou via `supabase/config.toml`, versionado no Git.

### Políticas de Storage — Buckets Públicos

- **RF-010:** `product-images` SELECT: público (`anon` + `authenticated`).
- **RF-011:** `product-images` INSERT/UPDATE/DELETE: apenas `owner`/`manager` (via `auth.jwt() app_metadata role`).
- **RF-012:** `avatars` SELECT: público.
- **RF-013:** `avatars` INSERT/UPDATE: próprio vendedor (path `sellers/<own_seller_id>/`) + owner/manager.

### Políticas de Storage — Buckets Privados

- **RF-020:** `whatsapp-media` SELECT: derivar acesso do path. Path contém `conversations/<conversation_id>/`. Política valida que `conversation_id` pertence a conversa acessível pelo usuário (via função SQL que checa `crm.conversations` RLS). Owner/manager acessam tudo da store.
- **RF-021:** `whatsapp-media` INSERT: vendedor responsável + service_role (webhook).
- **RF-022:** `whatsapp-media` DELETE: bloqueado.
- **RF-023:** `fiscal-documents` SELECT: owner/manager + vendedor do pedido + cliente B2B dono. Path `orders/<order_id>/`. Política valida acesso ao order.
- **RF-024:** `fiscal-documents` INSERT: apenas service_role (Edge Function emissão NFe).
- **RF-025:** `fiscal-documents` DELETE: bloqueado (imutável por lei fiscal).
- **RF-026:** `quote-documents` SELECT/INSERT: vendedor responsável + owner/manager + cliente B2B dono.
- **RF-027:** `imports-temp` SELECT/INSERT/DELETE: owner/manager + service_role apenas.

### Storage Provider

- **RF-030:** Interface `IStorageProvider` com métodos: `upload`, `getPublicUrl`, `getSignedUrl`, `getImageUrl`, `remove`, `list`.
- **RF-031:** Implementação `SupabaseStorageProvider` em `src/providers/supabase/storage/`.
- **RF-032:** `upload(bucket, path, file)`: valida MIME e tamanho client-side antes de enviar; retorna `{ path }`; lança AppError em falha (mapeia erros Storage).
- **RF-033:** `getPublicUrl(bucket, path)`: retorna URL pública (para buckets públicos). Síncrono.
- **RF-034:** `getSignedUrl(bucket, path, expiresInSec)`: retorna URL assinada com expiração (para buckets privados). Default expiração 3600s (1h).
- **RF-035:** `getImageUrl(bucket, path, { width, height, quality })`: retorna URL com transform params. Para público, URL direta com query. Para privado, signed URL com transform.
- **RF-036:** `remove(bucket, paths)`: remove arquivos (respeitando políticas — DELETE bloqueado em fiscal/whatsapp).
- **RF-037:** `list(bucket, prefix)`: lista arquivos sob um prefixo (ex: todas as imagens de um produto).
- **RF-038:** Provider Factory (PRD-104) também expõe `getStorageProvider()` retornando mock ou supabase conforme `VITE_DATA_SOURCE`.

### Transformações de Imagem

- **RF-040:** `getImageUrl` aceita `{ width?, height?, quality?, resize?: 'cover'|'contain'|'fill' }`.
- **RF-041:** Thumbnails de produto no e-commerce usam `width=400, quality=75`.
- **RF-042:** Avatar usa `width=128, height=128, resize=cover`.
- **RF-043:** Imagem full em ficha de produto usa original ou `width=1200, quality=85`.

### Upload Validation

- **RF-050:** Validação client-side antes do upload: tamanho (por bucket), MIME type (por bucket).
- **RF-051:** Mensagens de erro claras: "Arquivo muito grande (máx 5MB)", "Tipo não permitido (apenas JPG, PNG, WEBP)".
- **RF-052:** Nome de arquivo sanitizado: remover caracteres especiais, espaços viram hífen, lowercase.
- **RF-053:** Path estruturado conforme padrão do bucket — nunca permitir path traversal (`../`).

### Limpeza e Retenção

- **RF-060:** Job de limpeza de `imports-temp`: arquivos com mais de 30 dias são removidos. Implementar via `pg_cron` (chama Edge Function) ou Edge Function agendada.
- **RF-061:** Documentar política de retenção em `docs/dev/storage.md`.

### Integração nas Telas

- **RF-070:** Ficha de Produto (PRD-063): exibe imagens reais do bucket `product-images` com transform para thumbnail + full.
- **RF-071:** Admin Storefront (PRD-066): permite upload de imagens de produto (owner/manager).
- **RF-072:** Perfil de vendedor: upload de avatar.

### Documentação

- **RF-080:** `docs/dev/storage.md` com: estrutura de buckets, políticas, como fazer upload via provider, transformações de imagem, signed URLs, retenção.

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança):** Documento fiscal (`fiscal-documents`) jamais acessível por cliente que não é dono do pedido. Validado por teste de política.
- **RNF-002 (Performance):** Imagens públicas servidas via CDN Supabase < 100ms. Thumbnails transformados cacheados.
- **RNF-003 (Custo):** Storage no plano Pro = 100GB inclusos. Monitorar via PRD-110. Imagens otimizadas (webp, transform) reduzem footprint.
- **RNF-004 (LGPD):** Mídia de WhatsApp pode conter PII. Soft delete + política de retenção avaliadas em PRD-191.
- **RNF-005 (Reprodutibilidade):** Buckets e políticas versionados em migration/config. Recriar projeto recria buckets.
- **RNF-006 (Validação):** Upload sempre valida MIME e tamanho — client-side (UX) + bucket config (segurança).

---

## Critérios de Aceitação

### RF-010 + RF-011: Bucket Público de Produto

```gherkin
DADO o bucket product-images configurado como público
QUANDO anônimo acessa a URL pública de uma imagem de produto
ENTÃO recebe a imagem (200 OK)

QUANDO anônimo tenta fazer upload no bucket
ENTÃO recebe 403 (apenas owner/manager fazem upload)

QUANDO owner faz upload de uma imagem JPG de 3MB
ENTÃO upload sucede e retorna o path
```

### RF-023 + RNF-001: Documento Fiscal Isolado

```gherkin
DADO um PDF de NFe em fiscal-documents/orders/<O1>/nf123.pdf
  E o pedido O1 pertence ao cliente C1
QUANDO cliente B2B C2 (outro cliente) tenta acessar o PDF via signed URL forjada
ENTÃO recebe 403 (política bloqueia — order não pertence a C2)

QUANDO cliente B2B C1 (dono) solicita signed URL via portal
ENTÃO recebe URL válida e acessa o PDF
```

### RF-020: WhatsApp Media Respeita Carteira

```gherkin
DADO uma imagem em whatsapp-media/conversations/<conv1>/...
  E a conversa conv1 pertence ao vendedor S1
QUANDO vendedor S2 tenta acessar a imagem
ENTÃO recebe 403 (conversa não acessível por S2)

QUANDO vendedor S1 acessa
ENTÃO recebe a imagem via signed URL
```

### RF-040 + RF-041: Transformação de Imagem

```gherkin
DADO uma imagem de produto de 2000×2000px
QUANDO getImageUrl(bucket, path, { width: 400, quality: 75 }) é chamado
ENTÃO retorna URL com transform params
  E ao acessar, recebe imagem redimensionada para 400px de largura
  E tamanho do arquivo servido é menor que o original
```

### RF-050 + RF-051: Validação de Upload

```gherkin
DADO o usuário tenta upload de um arquivo de 10MB em product-images (limite 5MB)
QUANDO o upload é iniciado
ENTÃO validação client-side bloqueia antes de enviar
  E exibe "Arquivo muito grande (máx 5MB)"

DADO o usuário tenta upload de um .exe em product-images
QUANDO validado
ENTÃO bloqueia com "Tipo não permitido (apenas JPG, PNG, WEBP)"
```

---

## Fases de Implementação

### Fase 1 — Buckets + Políticas (1 dia)

- Migration criando os 6 buckets com config (limite, MIME)
- Políticas de Storage por bucket
- Validação manual via Dashboard

### Fase 2 — Storage Provider (1 dia)

- `IStorageProvider` interface
- `SupabaseStorageProvider` implementação
- Integração ao ProviderFactory
- Helpers: signed URL, image transform

### Fase 3 — Integração + Validação (1 dia)

- Ficha de Produto com imagens reais
- Upload de avatar
- Testes de política (acesso cruzado bloqueado)

### Fase 4 — Limpeza + Docs (meio dia)

- Job de limpeza imports-temp (pg_cron ou Edge Function)
- Documentação `docs/dev/storage.md`
- Demo + marcar `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-115 (WhatsApp envio/recebimento mídia), PRD-127B (NFe PDF), PRD-066 (Admin Storefront upload)
- **Depende de:** PRD-100 (Storage habilitado), PRD-103 (padrão RLS), PRD-104 (Provider Factory), PRD-107 parcial (políticas usam `app_metadata.role`)

### Decisões Pendentes

- **Retenção de mídia WhatsApp:** 30 dias? 1 ano? Indefinido? Avaliar com cliente (custo vs valor histórico). MVP: indefinido.
- **Antivírus scan:** avaliar em Onda 13.

---

## Considerações de Segurança

- **Buckets privados por default** para qualquer coisa com PII ou dado fiscal.
- **Path traversal mitigado:** sanitização de filename + path estruturado.
- **Signed URLs com expiração curta** (1h default) para documentos sensíveis.
- **Políticas espelham RLS:** acesso a fiscal-document deriva do acesso ao order.
- **MIME validation:** dupla camada (client UX + bucket config segurança).
- **Documento fiscal imutável:** DELETE bloqueado por lei.

---

## Notas para o Agente Desenvolvedor

### Esclarecimento de Dúvidas

> 💬 Confirme: retenção de mídia WhatsApp (sugerido indefinido no MVP); se imagens de produto precisam de múltiplos tamanhos pré-gerados ou transform on-the-fly basta (sugerido on-the-fly).

### Instruções Obrigatórias

> ⚠️ **APÓS IMPLEMENTAR:** Bump v2.0.0-rc.6; CHANGELOG; renomear `PRD-106-storage_DONE.md`; documentação completa; testes de política passando.

### Princípios

| Princípio | Descrição |
|-----------|-----------|
| **Privado por default** | Qualquer dado sensível em bucket privado |
| **Path estruturado** | `<entity>/<id>/<file>` — facilita políticas |
| **Transform on-the-fly** | Não pré-gerar thumbnails; usar query params |
| **Política espelha RLS** | Acesso a arquivo deriva do acesso à entidade |

### O que NÃO Fazer

| ❌ Evitar |
|-----------|
| Bucket público para documento fiscal ou mídia de conversa |
| Path sem estrutura (dificulta política) |
| Armazenar binário no banco (use Storage) |
| Signed URL com expiração longa para dado sensível |
| Esquecer validação de MIME/tamanho |
| Permitir DELETE em fiscal-documents |

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
| 27/05/2026 | v1 | Criação inicial — Sub-lote 1c do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
