# PRD-140B: Migração de Stubs Pagamento + Operacionalização

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo — varredura transversal + `src/features/payment-config/`_ |
| **Objetivo** | Fechar a Onda 7 em dois movimentos. **(1) Migração:** inventário e substituição dos últimos placeholders de pagamento da Fase 1 — passo 3 do checkout (PRD-064) vira seleção real de métodos condicionada por capability/config, banners "modo demonstração" condicionados ao mock, placeholders do pedido (PRD-032) e do portal (PRD-071) ligados aos fluxos reais. **(2) Operacionalização** (paridade exata com o PRD-131 da NFe): tela `/app/configuracoes/pagamentos` para o Owner — provider default, credenciais ao Vault, parcelamento/fraude/taxas, URLs de webhook prontas para copiar, e **checklist sandbox→produção** com cobrança de teste obrigatória. E2E suite da onda inteira + regressão mock garantida. Bump final **v2.3.0 "Cash"** |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem isto a onda está construída mas inutilizável (mesma lição do PRD-131) |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") — **fecha a onda** |
| **PRDs Relacionados** | Toda a onda (132–140); PRD-064/032/071 F1 (hosts dos placeholders); PRD-131 (padrão de operacionalização espelhado); PRD-100 (Vault); PRD-119 (padrão de migração de stubs espelhado); PRD-020 F1 (Simulação SDR permanece mock-only, paridade com a decisão do 119) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Config UI em feature própria; migração como varredura guiada por inventário com checklist verificável |

### Critérios de Complexidade

> **Justificativa de Alta:** é o PRD que transforma 9 PRDs de engenharia em operação — e o ponto onde os erros são de **integração fina**, não de lógica nova: um banner demo que persiste em produção mina a confiança do comprador; um método exibido sem capability (cartão com Asaas reprovado no gate do 136) quebra no clique; credencial de produção colada no campo de sandbox cobra cliente real em teste. O checklist sandbox→produção com cobrança de teste obrigatória existe porque a Onda 6 provou o valor desse gate (PRD-131): ninguém promove para produção sem ter visto o fluxo inteiro funcionar.

---

## Contexto do Problema

Estado ao final do PRD-140: toda a engenharia existe, mas —

1. O passo 3 do checkout ainda renderiza os **3 radios placeholder** do PRD-064 com os textos de 2025 ("Integração disponível na Fase 2")
2. O banner "Pedido em modo demonstração" aparece **incondicionalmente**
3. `payment_config` é um jsonb que só o Claude Code CLI sabe preencher — Owner não tem tela
4. As URLs de webhook (PRD-134) precisam ser copiadas para os painéis dos gateways — ninguém documentou onde clicar
5. Não há gate: nada impede `environment='production'` sem nunca ter testado uma cobrança

O PRD-119 (WhatsApp) e o PRD-131 (NFe) estabeleceram o padrão das duas metades — migração de stubs e operacionalização com checklist. Este PRD o aplica a pagamentos e **fecha a onda**.

---

## Conceito da Solução

### Metade 1 — Inventário de Migração

| # | Placeholder (Fase 1) | Origem | Destino (Onda 7) |
|---|----------------------|--------|------------------|
| M1 | Radios PIX/Boleto/Cartão com disclaimers estáticos | PRD-064 RF-025/026 | Seleção real condicionada: PIX sempre (132/133); Boleto se endereço ok (135); Cartão **somente** se capability do gate 136 (Asaas reprovado → some ou roteia `cardVia`) |
| M2 | Banner "modo demonstração" no checkout e confirmação | PRD-064 RF-028/037 | Renderiza **apenas** com provider mock ativo (`isMockMode() \|\| !payment_config`) |
| M3 | "Você receberá o código PIX após confirmação" | PRD-064 RF-026 | `PixPaymentPanel` no mount (já entregue no 133 — verificação de que o texto morto saiu) |
| M4 | "Boleto será enviado por email" | PRD-064 RF-026 | `BoletoPaymentPanel` (135) + stub de email auditado |
| M5 | Botão "Refund" placeholder | PRD-032 | `RefundDialog` real (138 — verificação) |
| M6 | "Marcar como pago" sem guarda | PRD-032 | Mantido + confirm quando há charge viva (133 RF-093 — verificação) |
| M7 | Status de pagamento estáticos no portal | PRD-071 | Estados reais incl. `partially_paid` (137) e estornos (138) em leitura |
| M8 | Textos de pagamento na Simulação SDR | PRD-020 | **Permanece mock-only** (paridade com a decisão do PRD-119 — simulação é ambiente didático) |

Cada item vira um check verificável na PR (inventário é o contrato de aceite da migração).

### Metade 2 — Tela `/app/configuracoes/pagamentos` (Owner only)

```
┌─────────────────────────────────────────────────────────────┐
│ Configuração de Pagamentos — Loja Matriz                     │
│                                                              │
│ [ Provider default ]  ◉ Asaas   ○ Mercado Pago               │
│ [ Ambiente ]          ◉ Sandbox ⚠️   ○ Produção              │
│                                                              │
│ ── Credenciais (Vault) ────────────────────────────────────  │
│ Asaas API Key:        ✅ configurada     [Atualizar]         │
│ Asaas Webhook Token:  ⚠️ pendente        [Configurar]        │
│ MP Access Token:      ⚠️ pendente        [Configurar]        │
│ MP Webhook Secret:    ⚠️ pendente        [Configurar]        │
│ MP Public Key:        [ TEST-abc123...            ]  (jsonb) │
│                                                              │
│ ── Webhooks (copiar nos painéis) ──────────────────────────  │
│ Asaas: https://<proj>.functions.supabase.co/payment-webhook/ │
│        asaas/0f3a-...                            [Copiar]    │
│ MP:    .../mercadopago/0f3a-...                  [Copiar]    │
│                                                              │
│ ── Parâmetros ─────────────────────────────────────────────  │
│ PIX expiração (min): [30]   Boleto vencimento (dias): [3]    │
│ Multa %: [2,0]  Juros a.m. %: [1,0]                          │
│ Parcelamento cartão: máx [12] · sem juros até [3] · [1,99]%  │
│ Carnê boleto: máx [6] parcelas · mín R$ [100,00]             │
│ Antifraude: valor alto R$ [2.000] · recusas [2] · guest [3]  │
│                                                              │
│ ── Validação para Produção ────────────────────────────────  │
│ 1. ☑ Credenciais do provider default configuradas            │
│ 2. ☑ Webhook cadastrado no painel (token/secret salvos)      │
│ 3. ☐ Cobrança PIX de teste criada e CONFIRMADA via webhook   │
│ 4. ☐ Estorno de teste concluído                              │
│                                                              │
│ [ Salvar ]                    [ Migrar para Produção ] 🔒    │
└─────────────────────────────────────────────────────────────┘
```

Paridades deliberadas com o PRD-131: credenciais sob demanda ao Vault via Edge dedicada (`payment-credentials-upload` — nunca trafegam pelo UPDATE comum do jsonb); checklist trava a promotion; **o item 3 exige o ciclo completo** (criar cobrança sandbox → pagar no simulador do gateway → webhook confirmar → painel transicionar) — valida criação **e** webhook de uma vez; promotion com modal de confirmação + audit `payment_promoted_to_production`; pós-produção o toggle vira read-only com aviso.

Diferença consciente vs 131: pagamento tem **dois** providers simultâneos — checklist avalia o default; o secundário pode ficar sandbox/incompleto (badge "parcial") sem travar a promotion do principal.

### E2E Suite da Onda + Regressão Mock

Suíte `payments-wave.e2e` (mock provider): PIX guest fim-a-fim · boleto com overdue→paid · carnê 3x até `paid` · cartão tok_approve/tok_decline · refund parcial e total · item de conciliação resolvido · flag de fraude criado e cleared. Mais o **teste de regressão demo**: `VITE_DATA_SOURCE=mock` percorre checkout completo sem nenhuma chamada externa e **com** os banners demo visíveis (o modo demonstração é feature, não resto).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Config via SQL/CLI (sem tela) | Owner não opera; lição do 131: operacionalização é metade do valor |
| Promotion sem cobrança de teste | O gate do 131 evitou NFe em produção sem homologação; aqui o equivalente é dinheiro real |
| Checklist exigindo os DOIS providers prontos | Trava o go-live por gateway secundário; default pronto basta, secundário evolui |
| Remover os banners demo do código | Demo permanece produto vivo (Vercel Preview, decisão de arquitetura) — condicionar, não remover |
| Migrar Simulação SDR para pagamento real | Ambiente didático por design (decisão do 119 mantida) |

---

## Escopo

### Incluído

- ✅ Migração M1–M8 conforme inventário, cada item com verificação na PR
- ✅ M1 com lógica de disponibilidade por método: `getAvailableMethods(store)` → PIX (config ok) / Boleto (config ok) / Cartão (capability do gate 136: tokenizer disponível para o provider efetivo — considerando `cardVia`)
- ✅ Tela `/app/configuracoes/pagamentos` (Owner): provider default, ambiente, credenciais ao Vault via Edge `payment-credentials-upload` (validação de formato por credencial + teste de autenticação `healthCheck` antes de salvar), MP public key no jsonb (RF do 136 — não é segredo), parâmetros (PIX/boleto/parcelamento 137/fraude 140/feeEstimates 139) com Zod
- ✅ Seção Webhooks: URLs montadas por store com botão copiar + link para o passo-a-passo de cada painel (docs do 134)
- ✅ Checklist de produção (4 itens) com verificação automática: item 3 dispara `payment-test-charge` (Edge: cria PIX sandbox de R$ 1,00 num order de teste sintético, aguarda webhook até 5min, marca ✓ na confirmação); item 4 estorna a mesma cobrança
- ✅ "Migrar para Produção": habilitado só com checklist completo; modal de confirmação com aviso de dinheiro real; audit; pós-produção read-only com fluxo de reversão documentado
- ✅ Badge "parcial" para provider secundário incompleto (não trava)
- ✅ E2E suite `payments-wave` + teste de regressão demo (mock puro, banners presentes)
- ✅ Runbook `docs/operations/payments-runbook.md` (Owner): contratar/configurar cada gateway, sandbox→produção, operação diária (estornos, conciliação, fraude), troubleshooting
- ✅ **Bump final v2.3.0 "Cash"** + CHANGELOG consolidado da onda (132–140B) + tag + demo Edmilson (setup completo em staging: config → teste sandbox → promotion → cobrança real de R$ 1)
- ✅ Audit: `payment_config_updated`, `payment_credentials_uploaded`, `payment_test_charge_completed`, `payment_promoted_to_production`

### Excluído

- ❌ Novas capacidades de pagamento (a onda está fechada — isto integra e operacionaliza)
- ❌ Migração da Simulação SDR (M8 — permanece mock por decisão)
- ❌ Multi-conta por provider na mesma store (1 conta/provider/store no MVP)
- ❌ Rotação automática de credenciais (manual via tela)
- ❌ Onboarding self-service dos gateways (contratação é processo comercial externo — runbook orienta)

---

## Requisitos Funcionais

### Migração

- **RF-001:** `getAvailableMethods(store)`: PIX/boleto por config presente; cartão por capability efetiva (tokenizer do provider de cartão — `defaultProvider` ou `cardVia`); retorno tipado consumido pelo passo 3 (064) e pelo payment-link (136 RF-062).
- **RF-002:** Passo 3 do checkout: radios gerados de `getAvailableMethods`; método indisponível **não renderiza** (sem radio desabilitado com promessa); zero textos placeholder remanescentes (grep no CI: `"disponível na Fase 2"` → build falha).
- **RF-003:** Banners demo (M2): componente `DemoBanner` único condicionado a `isMockMode() || !payment_config`; os pontos do 064 passam a usá-lo.
- **RF-004:** Verificações M5–M7: testes de presença (placeholder ausente, fluxo real respondendo) — a PR só fecha com o inventário 100% verificado.

### Tela de Configuração

- **RF-010:** Rota Owner-only (guarda + RLS); estrutura em seções colapsáveis; "Salvar" só com diff; Zod completo.
- **RF-011:** Edge `payment-credentials-upload`: Owner only; valida formato (Asaas key `$a...`/UUID-like; MP token `APP_USR-`/`TEST-`; coerência token×ambiente — `TEST-` em produção → erro claro); executa `healthCheck` do provider com a credencial **antes** de persistir no Vault; sucesso → Vault entry + ref no jsonb + audit (sem o valor).
- **RF-012:** Status visual por credencial (configurada/pendente/inválida) sem jamais exibir valores.
- **RF-013:** URLs de webhook por provider×store com copiar + link de instruções.
- **RF-014:** Parâmetros com defaults dos PRDs de origem (133/135/137/139/140) e validação cruzada (ex.: `interestFreeUpTo ≤ maxInstallments`).

### Checklist e Promotion

- **RF-020:** Itens 1–2 verificados automaticamente (credenciais válidas + tokens de webhook salvos).
- **RF-021:** Item 3 — `payment-test-charge`: order sintético interno (flag `is_test=true`, invisível nas listagens), cobrança PIX sandbox R$ 1,00, aguarda confirmação via webhook (polling do checklist até 5min); confirmou → ✓ + audit. Timeout → diagnóstico ("cobrança criada, webhook não chegou — confira a URL no painel").
- **RF-022:** Item 4 — estorno da cobrança de teste via fluxo do 138; concluído → ✓.
- **RF-023:** Promotion: habilitado com 4/4; modal de aviso (dinheiro real); `environment='production'`; audit; toggle read-only + procedimento de reversão no runbook.
- **RF-024:** Provider secundário incompleto → badge "parcial"; promotion do default não bloqueada; cartão roteado (`cardVia`) exige o provider de cartão completo.

### E2E e Release

- **RF-030:** Suíte `payments-wave.e2e` (7 fluxos do conceito) verde como gate de merge.
- **RF-031:** Regressão demo: mock puro, zero rede externa, banners presentes.
- **RF-032:** Bump **v2.3.0** (sai dos RCs), CHANGELOG consolidado 132→140B, tag, demo roteirizada com Edmilson em staging.

### Documentação

- **RF-040:** `payments-runbook.md` (Owner, não-técnico): contratação, credenciais, webhooks com prints, checklist, operação diária, troubleshooting.
- **RF-041:** `docs/dev/payments-wave-overview.md`: mapa da onda (diagrama 132→140B), decisões transversais (escritores de paid, uma-cobrança-viva, grupos, manual de boleto), índice das docs específicas.

---

## Requisitos Não-Funcionais

- **RNF-001 (Zero placeholder em produção):** grep de CI + inventário verificado — texto morto quebra o build.
- **RNF-002 (Credencial nunca exposta):** upload via Edge dedicada, healthCheck pré-persistência, status sem valor, Vault como único repouso.
- **RNF-003 (Promotion gated):** impossível produção sem ciclo completo testado (criação+webhook+estorno).
- **RNF-004 (Demo é produto):** modo mock permanece íntegro e visivelmente demo.
- **RNF-005 (Setup < 45min):** Owner com credenciais em mãos completa sandbox→produção guiado pelo runbook.

---

## Critérios de Aceitação

### RF-002: Métodos Reais Condicionados

```gherkin
DADO store com Asaas default, gate do 136 reprovado e sem cardVia
QUANDO cliente chega ao passo 3
ENTÃO radios: PIX e Boleto — cartão AUSENTE (não desabilitado)
  E nenhum texto "disponível na Fase 2" em parte alguma (CI garante)

DADO cardVia='mercado_pago' configurado e MP completo
ENTÃO cartão presente, tokenizando via MP
```

### RF-021: Gate do Ciclo Completo

```gherkin
DADO credenciais sandbox válidas e webhook cadastrado no painel
QUANDO Owner dispara o item 3
ENTÃO cobrança PIX de R$ 1,00 criada em order de teste invisível
QUANDO Owner paga no simulador do gateway
ENTÃO webhook confirma → checklist marca ✓ automaticamente
  E "Migrar para Produção" segue travado até o item 4 (estorno) concluir
```

### RF-031: Demo Intacta

```gherkin
DADO VITE_DATA_SOURCE=mock
QUANDO o E2E demo percorre checkout PIX completo
ENTÃO zero chamadas de rede externa
  E banner "modo demonstração" visível no passo 3 e na confirmação
  E o fluxo conclui com o mock provider
```

### RF-023: Promotion Auditada

```gherkin
DADO checklist 4/4
QUANDO Owner confirma a promotion no modal de aviso
ENTÃO environment='production' + audit payment_promoted_to_production
  E o toggle vira read-only com aviso
  E a próxima cobrança real usa as credenciais de produção
```

---

## Fases de Implementação

### Fase 1 — Migração M1–M8 (1.5 dias)
- getAvailableMethods + passo 3 real + DemoBanner condicionado
- Verificações M5–M7 + grep de CI

### Fase 2 — Tela + Credenciais (2 dias)
- UI completa + Zod cruzado
- Edge payment-credentials-upload (formato + healthCheck + Vault)
- Seção webhooks

### Fase 3 — Checklist + Promotion (1.5 dias)
- payment-test-charge (order sintético + espera de webhook)
- Estorno de teste; gates; promotion + read-only

### Fase 4 — E2E + Regressão (1.5 dias)
- Suíte payments-wave (7 fluxos)
- Regressão demo

### Fase 5 — Release "Cash" (1 dia)
- Runbook + overview da onda
- **Bump v2.3.0** + CHANGELOG consolidado + tag
- Demo Edmilson em staging
- `_DONE` — **Onda 7 fechada**

---

## Dependências

- **Depende de:** PRDs 132–140 completos (integra todos), PRD-100 (Vault), PRD-131 (padrão espelhado), PRD-064/032/071 F1 (hosts)
- **Fecha:** Onda 7 → **v2.3.0 "Cash"**
- **Decisões Pendentes (consolidadas da onda, para o Owner antes do go-live):**
  - Contas: produção Asaas + MP da Turbo Diesel (credenciais em mãos)
  - Cartão P0 vs P1 + resultado do gate Asaas (136)
  - Defaults comerciais: parcelamento (137), encargos de boleto (135), thresholds de fraude (140) e feeEstimates (139) — sessão única com o financeiro GALLO resolve os quatro
  - Domínio do email placeholder MP (132B)

---

## Considerações de Segurança

- Credenciais: Edge dedicada + healthCheck pré-persistência + Vault + status sem valor + coerência ambiente×token (TEST- em produção barrado)
- Order de teste sintético invisível e marcado — jamais polui métricas/comissões
- Promotion: aviso explícito de dinheiro real + audit + read-only
- Grep de CI como guarda permanente contra regressão de placeholders

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump final **v2.3.0 "Cash"** (sai dos RCs); CHANGELOG consolidado da Onda 7 (PRDs 132–140B); renomear `PRD-140B-migracao-stubs-pagamento_DONE.md`; demo end-to-end com o Owner em staging (config → teste → promotion → cobrança real de R$ 1). **Fecha a Onda 7.**

| Princípio | Descrição |
|-----------|-----------|
| **Inventário é o contrato** | M1–M8 verificados, ou a PR não fecha |
| **Método indisponível não aparece** | Nada de radio desabilitado prometendo futuro |
| **Ciclo completo antes de produção** | Criação + webhook + estorno testados |
| **Demo é produto** | Mock íntegro, banner presente, zero rede |
| **Paridade com o 131** | O padrão de operacionalização agora é lei da casa |

| ❌ Evitar |
|-----------|
| Placeholder sobrevivente (CI pega) |
| Credencial validada só no formato (healthCheck obrigatório) |
| Promotion com checklist incompleto |
| TEST- em produção |
| Order de teste visível em listagens/metas |
| Quebrar o modo demo |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |
| **Observações** | Fecha a Onda 7 → v2.3.0 Cash |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 4d do Lote 4 (fecha a Onda 7) |

---

**AILA - Sistemas Inteligentes**
