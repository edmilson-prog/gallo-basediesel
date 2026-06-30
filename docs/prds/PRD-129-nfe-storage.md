# PRD-129: NFe Storage (PDF + XML)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/nfe-archive/` + UI_ |
| **Objetivo** | Após NFe ser autorizada (PRD-128), Edge Function `nfe-archive` baixa PDF (DANFE) e XML do provider e persiste em bucket `fiscal-documents` (PRD-106) com paths estruturados. UI no detalhe do pedido (PRD-032) expõe botões "Baixar PDF" e "Baixar XML" via signed URLs com TTL curto. Imutabilidade fiscal (DELETE bloqueado pelo bucket policy). Retenção legal mínima de 5 anos. Opcional: envio automático do PDF para o email do customer ao finalizar emissão |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — cliente exige acesso ao XML/PDF; obrigação fiscal de armazenar |
| **Épico** | Onda 6 — DINTEC via CSV + NFe Própria (v2.2.0 "Anchor") |
| **PRDs Relacionados** | PRD-127 (provider — `downloadXml`/`downloadPdf`); PRD-128 (emissão — produz `nfe_emissions`); PRD-106 (Storage bucket `fiscal-documents`); PRD-141 Onda 8 (Resend — envio de email); PRD-110 (monitoring); PRD-032 Fase 1 (UI pedido) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function `supabase/functions/nfe-archive/index.ts` + helpers; UI extensão do PRD-128 |

### Critérios de Complexidade

> **Justificativa de Média:** lógica não complexa (baixa do provider, sobe no Storage), mas exigências fiscais elevam o risco — XML é fonte da verdade fiscal por 5 anos; perda configura risco compliance. Idempotência (não baixar e re-armazenar se já está lá). Signed URLs com TTL curto (segurança). Retry para falhas transitórias. Notificação por email opcional adiciona dependência cruzada com Onda 8 (Resend).

---

## Contexto do Problema

PRD-128 emite NFe e persiste resultado em `crm.nfe_emissions`. Mas **PDF e XML ficam no provider** (Focus NFe / PlugNotas / eNotas) — URLs temporárias. Para conformidade fiscal:
- **XML é fonte da verdade** e precisa ser preservado por **5 anos** (lei brasileira)
- **PDF (DANFE)** é representação visual exigida em transporte
- Provider pode descontinuar URLs antigas; precisamos cópia local

Cliente também espera UX simples: vendedor ou cliente abre pedido, clica botão, baixa PDF. Cliente B2B pode receber PDF por email automaticamente (PRD-141 Resend depois).

---

## Conceito da Solução

### Trigger Automático

Após `crm.nfe_emissions` ser inserida/atualizada com `status='authorized'`, Edge Function `nfe-archive` é invocada (via trigger pg_cron pequeno ou chamada direta pelo PRD-128). Baixa XML+PDF e persiste.

```
[PRD-128 emite NFe]
   │
   ├── INSERT crm.nfe_emissions status='authorized'
   ├── UPDATE crm.orders nf_chave
   │
   └──▶ Trigger interno chama Edge Function nfe-archive
        │
        ├── Carrega nfe_emission
        ├── provider.downloadXml(emissionRef)
        ├── provider.downloadPdf(emissionRef)
        ├── storage.upload('fiscal-documents', 'orders/<orderId>/<nfNumber>.xml', xml)
        ├── storage.upload('fiscal-documents', 'orders/<orderId>/<nfNumber>.pdf', pdf)
        ├── UPDATE crm.nfe_emissions SET xml_storage_path, pdf_storage_path
        ├── Audit log nfe_documents_archived
        └── Opcional: invoca Resend para enviar PDF ao customer (se config habilita)
```

### Estrutura de Paths no Bucket

```
fiscal-documents/
└── orders/
    └── <order_id>/
        ├── <nf_number>.xml
        ├── <nf_number>.pdf
        └── <nf_number>-cancellation.xml  (futuro PRD-130)
```

Path estruturado facilita política RLS (PRD-106) — owner/manager/seller responsável + cliente B2B dono do order acessam.

### Signed URLs

PDF/XML são privados (PRD-106 RF-004). UI gera signed URL com TTL curto:

```typescript
const url = await storage.getSignedUrl('fiscal-documents', path, 300)  // 5 min
window.open(url, '_blank')
```

### Idempotência

Se nfe_emission já tem `xml_storage_path` e `pdf_storage_path` preenchidos: skip (não rebaixa).

### Envio por Email (Opcional, MVP)

Config por store: `nfe_config.autoEmailCustomer: boolean`. Se true e customer tem email válido:
- Após archive, invoca PRD-141 (Resend) — **stub se PRD-141 não pronto**
- Template fixo: "Sua NFe nº <nfNumber> está disponível. PDF anexo."
- Anexo: PDF do bucket (signed URL longa 24h ou attach raw)

Se PRD-141 não estiver implementado: registrar TODO em `crm.audit_logs`, não bloquear archive.

### Imutabilidade

Bucket `fiscal-documents` (PRD-106) já tem política `DELETE` bloqueado. Reforçar em policy RLS.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Não armazenar localmente (sempre buscar do provider) | URL do provider expira; perda fiscal |
| Storage privado por order (bucket por order) | Caro e desnecessário; path estruturado basta |
| PDF gerado internamente (não baixar do provider) | DANFE tem regras específicas; provider gera certo |
| Signed URL longa (1 mês) | Risco de vazamento; TTL curto mais seguro |
| Email síncrono na emissão | Falha de email não pode bloquear archive |
| Sem trigger automático (manual) | Owner esquece; ruim para compliance |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/nfe-archive/index.ts`
- ✅ Lógica de download (XML + PDF) via `provider.downloadXml` / `provider.downloadPdf`
- ✅ Upload para `fiscal-documents` bucket com paths estruturados
- ✅ UPDATE `crm.nfe_emissions` com `xml_storage_path` e `pdf_storage_path`
- ✅ Idempotência: se paths já preenchidos, skip
- ✅ Retry: 3 tentativas com backoff exponencial em falhas transitórias (network, 5xx do provider)
- ✅ Audit log `nfe_documents_archived` + `nfe_documents_archive_failed`
- ✅ Trigger: invocado por PRD-128 ao final da emissão authorized (chamada direta na Edge Function emit)
- ✅ Job de catch-up: pg_cron a cada hora verifica `nfe_emissions WHERE status='authorized' AND xml_storage_path IS NULL` (até 7 dias atrás) — rearchive automático para casos que falharam
- ✅ UI atualização em PRD-128:
  - Card "Documentação Fiscal" no pedido
  - Botões "Baixar PDF" e "Baixar XML" (visíveis se paths preenchidos)
  - Click gera signed URL e abre nova aba
  - Indicador "Documentos sendo arquivados..." enquanto archive não completo
- ✅ Permissão: Owner/Manager + seller responsável + cliente B2B dono podem baixar
- ✅ Stub de envio email automático: hook em config `autoEmailCustomer`; chama Resend se PRD-141 disponível, senão registra TODO em audit
- ✅ Testes: archive idempotente; signed URL gerada; bucket policy bloqueia DELETE
- ✅ Documentação `docs/dev/nfe-storage.md`

### Excluído

- ❌ Geração de PDF interno (provider gera)
- ❌ Compressão/zip de múltiplos PDFs (futuro batch)
- ❌ Watermarking ou edição (XML/PDF são imutáveis)
- ❌ Resend full implementation (PRD-141)
- ❌ Streaming download para arquivos grandes (PDF NFe ~50KB, XML ~10KB — tamanho trivial)
- ❌ XML signing local (provider já assina)
- ❌ Backup separado do bucket (PRD-109 cobre)
- ❌ Visualização inline do PDF na UI (download é suficiente; futuro pode ter preview)

---

## Requisitos Funcionais

### Edge Function

- **RF-001:** Endpoint POST `/functions/v1/nfe-archive`
- **RF-002:** Input: `{ emissionId: string (uuid) }`
- **RF-003:** Pode ser invocado:
  - Diretamente por PRD-128 ao final de emissão authorized
  - Via cron job de catch-up (pg_cron)
  - Manualmente por Owner via UI de admin (rare)
- **RF-004:** Autenticação service_role (chamada interna).

### Idempotência

- **RF-010:** Lê `crm.nfe_emissions` por `id`:
  - Se `xml_storage_path IS NOT NULL AND pdf_storage_path IS NOT NULL` → skip + retorna sucesso
- **RF-011:** `withIdempotency('nfe-archive:' + emissionId)` em PRD-102.

### Download

- **RF-020:** Resolve provider via factory PRD-127 + `nfe_emission.store_id`.
- **RF-021:** Chama `provider.downloadXml(emission.emission_ref)`:
  - Retorna `{ xml: string }`
  - Em falha: AppError INTEGRATION_ERROR
- **RF-022:** Chama `provider.downloadPdf(emission.emission_ref)`:
  - Retorna `{ pdfBuffer: Uint8Array }`
  - Em falha: AppError

### Upload

- **RF-030:** Path estruturado:
  - XML: `orders/<order_id>/<nf_number>.xml`
  - PDF: `orders/<order_id>/<nf_number>.pdf`
- **RF-031:** Upload via service_role:
  - XML: content-type `application/xml`
  - PDF: content-type `application/pdf`
- **RF-032:** UPDATE `crm.nfe_emissions`:
  - `xml_storage_path = <path xml>`
  - `pdf_storage_path = <path pdf>`
  - `updated_at = now()`

### Retry

- **RF-040:** Em falha de network ou 5xx do provider:
  - 3 tentativas com backoff exponencial: 1s, 5s, 15s
  - Após 3 falhas: registra erro em audit; status do nfe_emission permanece `authorized` (XML/PDF NULL) — job catch-up tentará depois

### Job de Catch-Up

- **RF-050:** pg_cron schedule a cada hora:
  - Query `crm.nfe_emissions WHERE status='authorized' AND xml_storage_path IS NULL AND emitted_at > now() - interval '7 days'`
  - Para cada um: invoca `nfe-archive`
- **RF-051:** Para emissões > 7 dias sem archive: registra alerta crítico (PRD-110); Owner investiga manualmente.

### Email Automático (Stub MVP)

- **RF-060:** Após upload bem-sucedido:
  - Lê `store.nfe_config.autoEmailCustomer`
  - Se true E `customer.email IS NOT NULL`:
    - Tenta invocar PRD-141 (Resend) com template fixo
    - Se PRD-141 não disponível (404 da Edge Function): audit log `nfe_email_skipped_no_resend` (não erro)
- **RF-061:** Template:
  - Subject: "NFe nº {{nfNumber}} disponível"
  - Body: "Sua nota fiscal está disponível. Acesse seu pedido em {{portalUrl}} ou veja em anexo."
  - Anexo: PDF (raw buffer ou signed URL)

### UI no Pedido

- **RF-070:** PRD-128 já entrega card "Documentação Fiscal". Aqui adiciona:
  - Botão "Baixar PDF" — habilitado se `pdf_storage_path` preenchido
  - Botão "Baixar XML" — habilitado se `xml_storage_path` preenchido
  - Indicador "Documentos sendo arquivados..." (loading state) se `nfe_emissions.status='authorized' AND xml_storage_path IS NULL`
- **RF-071:** Click no botão:
  - Frontend invoca função no provider (PRD-104 expõe `storage.getSignedUrl`)
  - Recebe signed URL com TTL 5min
  - `window.open(url, '_blank')` para baixar/abrir
- **RF-072:** Permissão (via RLS PRD-106 + check frontend):
  - Owner / Manager
  - Seller responsável pelo order
  - Cliente B2B dono do order (via portal)
- **RF-073:** Em rejected/cancelled: card mostra histórico mas sem botões de download.

### Audit

- **RF-080:** Audit logs:
  - `nfe_documents_archived`: success com paths
  - `nfe_documents_archive_failed`: erro com retry count
  - `nfe_pdf_downloaded`: quando user clica baixar (rastreabilidade)
  - `nfe_email_sent` ou `nfe_email_skipped_no_resend`

### Testes

- **RF-090:** Unitários:
  - Mock provider retorna XML/PDF fictícios
  - Upload acontece com paths esperados
  - UPDATE nfe_emissions com paths
  - Idempotência: 2ª chamada não rebaixar
- **RF-091:** Integração:
  - PRD-128 emite (authorized) → trigger nfe-archive → após 5s paths preenchidos
  - Catch-up job processa emission antiga sem paths
- **RF-092:** UI: tela pedido mostra botões; click gera signed URL; bucket policy bloqueia DELETE direto

### Documentação

- **RF-100:** `docs/dev/nfe-storage.md`:
  - Fluxo de archive
  - Paths estruturados
  - Retenção fiscal (5 anos mínimo)
  - Catch-up job
  - Email automático (config + dep com Resend)
  - Troubleshooting (archive falhou, signed URL não funciona)

---

## Requisitos Não-Funcionais

- **RNF-001 (Imutabilidade fiscal):** DELETE bloqueado no bucket (PRD-106 + reforço aqui).
- **RNF-002 (Retenção):** Documentos permanecem 5+ anos. PRD-109 cobre backup; cleanup futuro respeitará lei.
- **RNF-003 (Performance):** Archive completo em < 10s p95 (download provider + upload).
- **RNF-004 (Segurança):** Signed URLs TTL 5min; jamais permanentes.
- **RNF-005 (Disponibilidade):** Falha em archive não trava order; catch-up resolve.
- **RNF-006 (LGPD):** PDF contém dados pessoais customer; bucket privado + RLS estritos.

---

## Critérios de Aceitação

### RF-030 + RF-032: Archive Bem-Sucedido

```gherkin
DADO nfe_emission E1 com status='authorized', emission_ref='abc', sem paths
QUANDO Edge Function nfe-archive é invocada
ENTÃO provider.downloadXml retorna XML
  E provider.downloadPdf retorna PDF
  E upload em fiscal-documents/orders/O1/000123.xml e .pdf
  E UPDATE E1.xml_storage_path e pdf_storage_path
  E audit nfe_documents_archived
```

### RF-010: Idempotência

```gherkin
DADO E1 com paths já preenchidos
QUANDO nfe-archive invocada novamente
ENTÃO retorna sucesso imediato (skip)
  E NÃO faz download novo do provider
  E NÃO sobrescreve no bucket
```

### RF-070 + RF-071: UI de Download

```gherkin
DADO order O1 com nfe_emission E1 status='authorized', paths preenchidos
QUANDO seller responsável abre tela do pedido
ENTÃO card "Documentação Fiscal" mostra:
  - nf_number, chave, authorized_at
  - Botão "Baixar PDF" habilitado
  - Botão "Baixar XML" habilitado
QUANDO clica "Baixar PDF"
ENTÃO frontend gera signed URL com TTL 5min
  E nova aba abre baixando o PDF
  E audit nfe_pdf_downloaded
```

### RF-040: Retry e Catch-Up

```gherkin
DADO archive falhou 3 vezes (provider 500)
QUANDO catch-up job roda 1h depois
ENTÃO consulta nfe_emissions com authorized + sem paths + emitted_at < 1h
  E re-invoca nfe-archive
  E em sucesso: paths preenchidos

DADO emission > 7 dias sem archive
QUANDO catch-up roda
ENTÃO alerta crítico em PRD-110 monitoring
```

---

## Fases de Implementação

### Fase 1 — Edge Function + Upload (1.5 dias)
- Estrutura, withIdempotency
- Download (XML + PDF)
- Upload no bucket
- UPDATE paths

### Fase 2 — Retry + Job Catch-Up (1 dia)
- Retry com backoff
- pg_cron schedule
- Alerta para emissões antigas sem archive

### Fase 3 — UI Botões Download (1 dia)
- Card "Documentação Fiscal" estendido
- Signed URL helper
- Permissão check + RLS

### Fase 4 — Email Stub + Docs (1 dia)
- Hook config autoEmailCustomer
- Stub Resend integration
- docs/dev/nfe-storage.md
- E2E: emit → archive → download
- `_DONE`

---

## Dependências

- **Depende de:** PRD-127 (interface), PRD-128 (emission), PRD-101 (nfe_emissions), PRD-106 (Storage bucket), PRD-102 (Edge infra), PRD-110 parcial (alerta), PRD-141 opcional (Resend; stub aceitável)
- **Bloqueia:** Onda 6 declarada "fiscal sólido"
- **Decisões Pendentes:**
  - TTL signed URL (5min sugerido)
  - Auto-email default ON ou OFF? (sugerido OFF — Owner habilita explicitamente)
  - Path com nf_number ou com emission_ref? (sugerido nf_number — humano-legível)

---

## Considerações de Segurança

- Bucket privado; signed URLs TTL curto
- DELETE bloqueado a nível de bucket policy (PRD-106 RF-025)
- PDF contém PII; RLS estrito
- Audit em todo download (rastreabilidade de acesso)
- service_role apenas em Edge Function archive

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.2.0-rc.9; CHANGELOG; renomear `PRD-129-nfe-storage_DONE.md`; teste E2E manual com MockProvider documentado.

| Princípio | Descrição |
|-----------|-----------|
| **XML é fonte da verdade** | 5 anos garantidos |
| **TTL curto, sempre** | Signed URL 5min, nunca permanente |
| **Idempotência preserva** | 2ª invocação não duplica |
| **Catch-up resgata** | Falha temporária não perde documento |
| **Audit em download** | Rastreabilidade de acesso |

| ❌ Evitar |
|-----------|
| Permitir DELETE no bucket fiscal |
| Signed URL > 5min para fiscal sensível |
| Esquecer catch-up (perda silenciosa) |
| Bloquear emissão se archive falha |
| Logar PDF/XML inteiro (tamanho + PII) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 3c do Lote 3 (Onda 6) |

---

**AILA - Sistemas Inteligentes**
