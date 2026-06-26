# PRD-149: Carrinho Abandonado (Detecção + Recuperação)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, Edge `cart-abandonment-detector` + campanha sobre o 148 + `/loja/carrinho/recuperar/:token`_ |
| **Objetivo** | Fechar o vazamento clássico do e-commerce: o **detector** (cron 30min sobre `storefront.carts`) identifica carrinhos com itens, **identificáveis** (email capturado no checkout ou customer logado), parados além do limiar e sem pedido — e emite `cart.abandoned` no catálogo (008), que inscreve o titular na **campanha especializada** rodando sobre o motor do 148 (régua seed: email em 1h com os itens, email em 24h, HSM marketing opcional em 48h). Cada mensagem leva o **link de recuperação** (`/loja/carrinho/recuperar/:token`) que restaura o carrinho na sessão em um clique. Exits: pedido criado (de qualquer origem), carrinho esvaziado, opt-out. Métrica de **recuperação real** (pedido após clique) no painel da campanha. Categoria marketing — consentimento (147), quiet-hours-reagenda (148/146) e supressões herdados pela porta única, sem uma linha de código nova de governança |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P1 |
| **Épico** | Onda 8 — Notificações Reais (v2.4.0 "Reach") |
| **PRDs Relacionados** | **PRD-148 (motor — bloqueador)**; **PRD-147 (consentimento — bloqueador via 148)**; PRD-064 F1 (checkout/carrinho — origem dos dados + DELTA do momento de captura); PRD-142 (templates de recuperação — DELTA +2); PRD-143 (HSM — DELTA +1 marketing); PRD-008 (`cart.abandoned` no catálogo — DELTA); PRD-101 (schema storefront) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Detector idempotente; recuperação como rota pública com token de capacidade |

### Critérios de Complexidade

> **Justificativa de Média:** o motor pesado (sequência, exits, idempotência, governança) é todo do 148 — aqui é um detector + uma campanha + uma rota. As três sutilezas próprias: (1) **identificável é a palavra-chave** — carrinho de guest sem email é irrecuperável e o detector precisa ignorá-lo sem ruído, o que puxa um DELTA fino no checkout (064): capturar o email **no passo 1**, antes do abandono típico; (2) o **token de recuperação** restaura estado de carrinho numa sessão possivelmente nova — capacidade pública que não pode vazar dados nem ressuscitar carrinho já convertido; (3) **estoque mudou**: o carrinho de ontem pode ter item esgotado hoje — a restauração precisa degradar com honestidade.

---

## Contexto do Problema

Taxa média de abandono de carrinho no e-commerce BR: ~80%. No B2C de peças (compra de necessidade, ticket alto), cada carrinho de R$ 800 abandonado é um cliente que **já escolheu** — só não concluiu (frete, distração, "depois eu vejo"). A régua de recuperação é a feature de maior ROI do varejo digital: e-mails de abandono convertem 8–15% contra ~1% de campanhas frias.

Hoje a /loja (064) tem carrinho persistido — e zero reação ao abandono. Pior: o email do guest só é capturado no **passo 2** do checkout, depois do ponto onde a maioria abandona (carrinho/passo 1). Sem o DELTA de captura antecipada, a régua nasce cega para a maior fatia.

---

## Conceito da Solução

### Detector (cron 30min)

```
cart-abandonment-detector:
SELECT carts WHERE
  items_count > 0
  AND updated_at BETWEEN now()-7d AND now()-:threshold      -- default 1h; janela máx 7d
  AND (customer_id IS NOT NULL OR capture_email IS NOT NULL) -- IDENTIFICÁVEL
  AND abandoned_notified_at IS NULL                          -- idempotência do detector
  AND NOT EXISTS (order do mesmo customer/email desde updated_at)
→ para cada: 
    UPDATE cart SET abandoned_notified_at = now()
    emit 'cart.abandoned' { cartId, recipient, items_snapshot (até 5), total, recoveryToken }
→ o enroller do 148 faz o resto (campanha 'cart-abandoned' active)
```

Migrations aditivas em `storefront.carts`: `capture_email text`, `abandoned_notified_at timestamptz`, `recovered_at timestamptz`.

**DELTA PRD-064 (declarado):** campo de email no **passo 1** do checkout (ou no próprio carrinho, acima do CTA) com microcopy honesta — "Salve seu carrinho e receba o orçamento por email" — gravando `capture_email` no blur (sem submit). Junto, o checkbox de marketing do 147 (RF-043) sobe para o mesmo ponto. Captura antecipada é o que torna a régua útil; sem ela, só logados são recuperáveis.

### Campanha Especializada (sobre o 148)

Seed `cart-abandoned` (pausada; Owner ativa junto das demais):

| Step | Delay | Canal | Conteúdo |
|---|---|---|---|
| 1 | 1h | email `cart-recovery-1` | "Seu carrinho está te esperando" — itens (até 3 + "e mais N"), total, **[Recuperar meu carrinho]** |
| 2 | 24h | email `cart-recovery-2` | Tom de utilidade: disponibilidade, frete, canal de dúvida — mesmo CTA |
| 3 | 48h | whatsapp HSM `carrinho_esquecido` (marketing) | Curto, com link — só com opt-in (147 garante via porta única) |

Exits da campanha: `order.created` (**qualquer** pedido do recipient — comprou na loja física? régua para), `cart.emptied` (evento novo emitido pelo 064 ao zerar — DELTA), opt-out (herdado). Reenrollment: `allow=true`, cooldown 14d (carrinho novo abandonado semana que vem é elegível de novo).

**Sem cupom no MVP:** desconto automático no step 2 é a tática clássica — e treina o cliente a abandonar para ganhar cupom. Sem motor de cupons na plataforma ainda; registrado como evolução consciente (decisão pendente do Owner quando existir).

### Recuperação `/loja/carrinho/recuperar/:token`

- Token JWT: `{ cartId, recipientRef }`, exp 7d, assinado (paridade com o guest-context do 133)
- Fluxo: valida → carrega o cart → **revalida estoque/preço item a item** → restaura na sessão atual (merge se a sessão já tem carrinho: soma quantidades, dedupe por SKU) → redireciona ao carrinho com banner:
  - tudo ok → "Seu carrinho foi restaurado!"
  - item esgotado → permanece listado como indisponível com aviso ("O item X esgotou — veja similares") — honestidade > silêncio
  - preço mudou → preço **atual** vale, com aviso discreto da alteração
- Cart já convertido (`order` existente) → "Este carrinho já virou o pedido #PD-XXXX ✓" com link de acompanhamento
- Clique registra `recovery_clicked` (atribuição); pedido subsequente do recipient em 7d → `recovered_at` no cart + métrica

### Métrica de Recuperação

No painel da campanha (148): além do funil padrão, **Recuperados** (carts com `recovered_at`) e **Receita recuperada** (soma dos orders atribuídos) — atribuição simples last-click em 7d (documentada; sem multi-touch).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Motor de sequência próprio | O 148 existe para isto; campanha especializada = zero motor duplicado |
| Detectar por evento de "saiu da página" (beacon) | Frágil e ruidoso; updated_at + threshold é determinístico e suficiente |
| Régua para carrinho anônimo via cookie/push | Sem identificação não há canal; push de customer está adiado (145) — escopo honesto: identificáveis |
| Cupom no step 2 | Treina abandono estratégico; sem motor de cupom; evolução consciente |
| Restaurar substituindo o carrinho atual | Cliente pode ter montado carrinho novo; merge com dedupe preserva os dois |
| Congelar preço do carrinho abandonado | Compromisso comercial sem lastro (preço/estoque mudam); preço atual + aviso é o padrão honesto |

---

## Escopo

### Incluído

- ✅ Migrations aditivas em `storefront.carts` (`capture_email`, `abandoned_notified_at`, `recovered_at`)
- ✅ Edge `cart-abandonment-detector` + cron 30min: query de elegibilidade (identificável, threshold config default 1h, janela 7d, sem pedido), marcação idempotente, emissão `cart.abandoned` com snapshot de itens + token
- ✅ **DELTA 064:** captura de email no passo 1/carrinho (blur, microcopy honesta) + checkbox 147 no mesmo ponto + evento `cart.emptied`
- ✅ **DELTA 008:** `cart.abandoned` e `cart.emptied` no catálogo + regras
- ✅ Campanha seed `cart-abandoned` (pausada) sobre o 148: 3 steps, exits, reenrollment 14d cooldown
- ✅ **DELTA 142:** templates `cart-recovery-1/2` (itens com nome/qtd/preço, total, CTA dominante, layout marketing com descadastro proeminente)
- ✅ **DELTA 143:** HSM `carrinho_esquecido` (marketing, pending_meta_approval)
- ✅ Rota pública de recuperação: validação do token, revalidação estoque/preço, merge com dedupe, banners de degradação (esgotado/preço/já-convertido), `recovery_clicked`
- ✅ Atribuição: pedido do recipient ≤7d pós-clique → `recovered_at` + receita no painel da campanha (last-click documentado)
- ✅ Threshold e janela em config (`storefront_config.cartAbandonment { thresholdMinutes: 60, windowDays: 7 }`)
- ✅ Audit: `cart_abandoned_detected`, `cart_recovery_clicked`, `cart_recovered { orderId }`
- ✅ Testes: elegibilidade (anônimo ignorado, com pedido ignorado, idempotência da marcação), token (válido/expirado/cart convertido), merge com dedupe, item esgotado degrada, exit por order.created entre steps (herda 148), E2E mock: abandono → email 1h → clique → restaura → pedido → recovered + régua encerrada
- ✅ Documentação `docs/dev/cart-abandonment.md`

### Excluído

- ❌ Cupom/incentivo automático (evolução consciente — registrada)
- ❌ Recuperação de anônimos (push/retargeting) — depende de 145-customer (Onda 11) e frente ads (fora)
- ❌ Multi-touch attribution (last-click 7d documentado basta)
- ❌ Congelamento de preço/reserva de estoque do carrinho abandonado
- ❌ Recomendação de similares no email (link para a categoria cobre; recomendação é Onda 9/IA)

---

## Requisitos Funcionais

### Detector

- **RF-001:** Elegibilidade conforme conceito; carrinho anônimo sem `capture_email` é silenciosamente ignorado (sem audit por item — volume).
- **RF-002:** Marcação `abandoned_notified_at` na mesma transação da emissão — reexecução do cron jamais re-emite para o mesmo abandono.
- **RF-003:** Snapshot no payload: até 5 itens (nome, qtd, preço), total, `recoveryToken` — o template não consulta o cart vivo (consistência do email com o momento do abandono).
- **RF-004:** Threshold/janela da config; mudança vale para detecções futuras.

### Captura (DELTA 064)

- **RF-010:** Campo de email no passo 1/carrinho: opcional, validação de formato, grava no blur via endpoint guest-safe (rate-limited); preenchido → cart identificável.
- **RF-011:** Customer logado: identificável por definição; `capture_email` ignorado se divergente (o cadastro vence).
- **RF-012:** Checkbox de marketing (147 RF-043) posicionado junto — captura de email **não** é opt-in de marketing (bases distintas: a régua de abandono roda como marketing e **precisa** do opt-in; sem ele, o enrollment existe e o dispatch barra — comportamento correto e auditável). *Nota de produto:* a microcopy do checkbox menciona explicitamente "ofertas e lembretes de carrinho" — alinhar texto com o jurídico (147).

### Recuperação

- **RF-020:** Token: assinatura+exp; inválido → página neutra "Link expirado" com CTA para a loja (anti-enumeração: nunca revela se o cart existiu).
- **RF-021:** Cart convertido → mensagem com nº do pedido (dado do próprio titular — token prova capacidade) + link de acompanhamento.
- **RF-022:** Restauração: revalida cada item (estoque/preço atuais); merge com carrinho da sessão (soma por SKU); banners de degradação conforme conceito.
- **RF-023:** `recovery_clicked` registrado uma vez por token (cliques repetidos não inflam métrica).

### Campanha e Métricas

- **RF-030:** Seed com steps/exits/reenrollment do conceito; ativação pelo Owner com o confirm padrão do 148.
- **RF-031:** Atribuição: order do recipient com `created_at ≤ recovery_clicked + 7d` → `recovered_at` + vínculo; painel exibe Recuperados e Receita recuperada.
- **RF-032:** Exit `order.created` herda do 148 (qualquer pedido encerra — inclusive venda assistida no /app: o cliente comprou, a régua cala).

### Testes/Docs

- **RF-040:** Suites do escopo; E2E completo com clock mock.
- **RF-041:** `cart-abandonment.md`: elegibilidade, fluxo do token, degradações, atribuição, decisão sem-cupom.

---

## Requisitos Não-Funcionais

- **RNF-001 (Identificável ou nada):** zero tentativas de contato sem canal legítimo.
- **RNF-002 (Um abandono, uma régua):** idempotência do detector + dedupe do 148.
- **RNF-003 (Honestidade na restauração):** esgotado/preço novo sempre comunicados; nunca checkout silenciosamente diferente do email.
- **RNF-004 (Governança herdada):** consentimento, quiet-hours-reagenda e supressões 100% pela porta única do 148/141 — este PRD não adiciona nem remove guardas.
- **RNF-005 (Métrica defensável):** recuperação só com clique atribuído; sem inflar com coincidências.

---

## Critérios de Aceitação

### RF-002 + RF-032: Detecção e Encerramento

```gherkin
DADO cart identificado com 3 itens parado há 65min (threshold 60)
QUANDO o detector roda
ENTÃO cart.abandoned emitido UMA vez (reexecuções ignoram)
  E enrollment criado na campanha (148)

DADO o cliente compra por WhatsApp com o vendedor (pedido no /app) antes do step 2
QUANDO o runner processa
ENTÃO exited_goal — o email de 24h NUNCA sai
```

### RF-022: Restauração Honesta

```gherkin
DADO carrinho abandonado com itens A (em estoque) e B (esgotou ontem)
  E a sessão atual já tem 1× item A
QUANDO o cliente clica em recuperar
ENTÃO carrinho da sessão: A com quantidade somada; B listado indisponível com aviso e link de similares
  E banner "carrinho restaurado" com a ressalva do item B
  E recovery_clicked registrado
```

### RF-012: Email ≠ Opt-in

```gherkin
DADO guest que deixou o email no passo 1 SEM marcar o checkbox de marketing
QUANDO a régua tenta o step 1
ENTÃO dispatch → skipped_no_consent (147)
  E enrollment → exited_optout (148 RF-013)
  E zero emails enviados — captura de email não autoriza marketing
```

### RF-031: Atribuição

```gherkin
DADO recovery_clicked ontem e pedido criado hoje pelo mesmo recipient
ENTÃO cart.recovered_at marcado e receita atribuída no painel

DADO pedido 9 dias após o clique
ENTÃO sem atribuição (janela 7d) — métrica não infla
```

---

## Fases de Implementação

### Fase 1 — Detector + Schema (1 dia)
Migrations, query de elegibilidade, marcação idempotente, emissão com snapshot.

### Fase 2 — Captura + Catálogo (1 dia)
DELTA 064 (email passo 1 + cart.emptied + checkbox 147), DELTA 008 (eventos).

### Fase 3 — Recuperação + Campanha (1.5 dias)
Rota do token (revalidação, merge, degradações), seed da campanha, templates (DELTAs 142/143), atribuição.

### Fase 4 — Testes + Docs (1 dia)
E2E clock mock, cart-abandonment.md; `_DONE`.

---

## Dependências

- **Depende de:** **PRD-148** (motor), **PRD-147** (via 148), PRD-064 (DELTA), PRD-142/143 (DELTAs), PRD-008 (DELTA catálogo)
- **Bloqueia:** PRD-150
- **DELTAs declarados:** 064 (captura+evento+checkbox), 008 (+2 eventos), 142 (+2 templates), 143 (+1 HSM)
- **Decisões Pendentes:** threshold 60min (validar com dados reais pós-go-live); cupom como evolução (Owner, quando houver motor); ativação da campanha (Owner)

---

## Considerações de Segurança

- Token de recuperação = capacidade sobre UM cart; nunca autentica nem expõe outros dados
- Endpoint de captura guest rate-limited (anti-harvest reverso)
- Página de token inválido neutra (anti-enumeração, paridade 147)
- Snapshot nos emails evita vazamento de estado futuro do carrinho

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.4.0-rc.9; CHANGELOG; renomear `PRD-149-carrinho-abandonado_DONE.md`; anotar DELTAs (064/008/142/143); submissão Meta do HSM junto ao lote do 148.

| Princípio | Descrição |
|-----------|-----------|
| **Identificável ou invisível** | Sem canal legítimo, sem régua |
| **Email capturado ≠ consentimento** | O 147 decide; a régua respeita |
| **Restaurar com a verdade** | Esgotado e preço novo sempre avisados |
| **Qualquer compra cala a régua** | Inclusive a venda assistida |
| **Métrica com clique** | Recuperação atribuída, nunca coincidência |

| ❌ Evitar |
|-----------|
| Régua para anônimo |
| Re-emissão no mesmo abandono |
| Substituir o carrinho da sessão |
| Preço do email divergindo silenciosamente do checkout |
| Cupom improvisado sem motor |
| Atribuição sem clique |

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
| 10/06/2026 | v1 | Criação inicial — Sub-lote 5c do Lote 5 (Onda 8) |

---

**AILA - Sistemas Inteligentes**
