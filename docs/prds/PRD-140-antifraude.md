# PRD-140: Anti-Fraude Básico

> **Perfil E (esqueleto enxuto)** — requisitos essenciais sem detalhamento exaustivo; profundidade D será aplicada se o cliente priorizar na implementação.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/fraud/` + extensão do handler card_ |
| **Objetivo** | Camada **complementar** de proteção contra fraude de cartão (os gateways já têm antifraude próprio — esta camada protege o **fulfillment**, não o pagamento): regras simples e configuráveis sobre os sinais que o PRD-136 já emite (recusas por IP/pedido, throttle) mais dois detectores próprios (documento do titular ≠ documento do cliente; valor anômalo). Detecção gera `crm.fraud_flags`; pedido flagado ganha badge "⚠ Revisar antes de enviar" — **nunca** bloqueia o pagamento nem cancela nada automaticamente. Revisão manual integrada à tela de conciliação (PRD-139) |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P2 |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-136 (sinais: `v_card_failure_signals`, `card_retry_throttled`); PRD-134 (chargeback — desfecho que estas regras tentam prevenir); PRD-138 (fraude confirmada → cancelar+estornar); PRD-139 (tela hospedeira da revisão); PRD-110 (alerta) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Regras como funções puras em `src/features/fraud/rules/`; avaliação no pós-pagamento de cartão |

### Critérios de Complexidade

> **Justificativa de Média (com perfil E):** as regras em si são triviais; o risco do PRD é de **postura** — antifraude amador que bloqueia pagamento legítimo causa mais prejuízo que a fraude que evita. Por isso o desenho inteiro é não-bloqueante: o gateway (que tem ML, rede de dados e responsabilidade contratual) decide o pagamento; nós decidimos apenas se o pacote sai do estoque antes de um humano olhar.

---

## Contexto do Problema

Fraude de cartão no e-commerce de autopeças tem padrão conhecido: cartão clonado testa compras pequenas (card-testing — o throttle do 136 já morde), depois compra de valor alto com entrega expressa; o portador real contesta; chargeback chega 30-60 dias depois (PRD-134 alerta) — quando a peça já foi entregue e o prejuízo é total (mercadoria + valor + multa).

A janela de defesa real é **entre o pagamento aprovado e o envio**. É exatamente onde esta camada atua: flagar para revisão humana os pedidos que combinam sinais de risco, sem jamais atrapalhar o cliente legítimo.

---

## Conceito da Solução

### Regras (avaliadas no pós-pagamento de cartão — hook do `payment-cascade`)

| Regra | Sinal | Default | Severity |
|-------|-------|---------|----------|
| `velocity_failures` | ≥ N recusas no mesmo pedido/IP antes da aprovação (via `v_card_failure_signals`) | N=2 | warning |
| `document_mismatch` | CPF/CNPJ do titular do cartão ≠ documento do customer do pedido | — | warning |
| `high_value_first_order` | Pedido cartão > valor X **e** primeiro pedido do customer | X=R$ 2.000 | warning |
| `guest_velocity` | ≥ N pedidos cartão guest do mesmo IP em 24h | N=3 | critical |

Combinação: 2+ regras no mesmo pedido elevam para `critical`. Thresholds em `payment_config.fraud` (Zod, defaults acima). Regras são funções puras `(signals, order, config) → FraudFlag | null` — testáveis isoladamente, novas regras = novo arquivo.

### Tabela e Efeito

```sql
CREATE TABLE crm.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES crm.orders(id),
  store_id uuid NOT NULL REFERENCES crm.stores(id),
  rule text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','cleared','confirmed')),
  details jsonb NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES crm.sellers(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm.fraud_flags (store_id, status);
-- RLS: Owner/Manager; seller responsável vê (leitura) o flag dos próprios pedidos
```

**Efeito do flag aberto:** badge "⚠ Revisar antes de enviar" no pedido (/app, PRD-032) + os botões de transição de fulfillment exibem confirm extra ("Pedido com alerta de fraude aberto — prosseguir mesmo assim?"). **Nada é bloqueado**: confirm + audit, decisão humana.

**Revisão** (seção "Antifraude" na tela do PRD-139): `cleared` (nota opcional) remove o badge; `confirmed` (nota obrigatória) sugere o fluxo cancelar pedido + estornar (PRD-138) com CTA direto — não executa sozinho.

### Fora de escopo explícito

Score dos gateways (MP/Asaas expõem análise própria — consumir é evolução natural pós-MVP), device fingerprint, ML, listas externas, bloqueio de pagamento, blocklist de IP/documento (a regra `guest_velocity` cobre o agudo; blocklist persistente é P3).

---

## Requisitos Funcionais (essenciais)

- **RF-001:** Avaliação das 4 regras no hook pós-pagamento quando `method='card'` (extensão de `runPostPaymentHooks`, try/catch isolado — falha da avaliação jamais afeta o pagamento).
- **RF-002:** Regras puras com thresholds de `payment_config.fraud` (defaults documentados); flag dedupe por `(order_id, rule)`.
- **RF-003:** 2+ flags abertos no pedido → severity efetiva `critical` + alerta Owner (PRD-110).
- **RF-004:** Badge + confirm extra nas transições de fulfillment enquanto houver flag `open`; audit `fulfillment_proceeded_with_fraud_flag` quando o humano prossegue.
- **RF-005:** Seção "Antifraude" na tela `/app/financeiro/conciliacao` (PRD-139): fila de flags `open`, detalhes (regra, sinais), ações `cleared`/`confirmed`.
- **RF-006:** `confirmed` → CTA "Cancelar pedido e estornar" pré-configurando o fluxo do PRD-138 (execução manual).
- **RF-007:** `document_mismatch`: comparação normalizada (dígitos) entre `holderDocument` (136) e `customer.document`; guest placeholder sem documento → regra não dispara.
- **RF-008:** Audit: `fraud_flag_created`, `fraud_flag_cleared`, `fraud_flag_confirmed`.
- **RF-009:** Testes: cada regra (dispara/não dispara nos limiares), dedupe, escalada para critical, confirm de fulfillment, isolamento de falha (regra lança → pagamento intacto).
- **RF-010:** Documentação `docs/dev/fraud-rules.md`: postura não-bloqueante, regras e thresholds, como adicionar regra, roadmap (scores dos gateways).

---

## Critérios de Aceitação (núcleo)

```gherkin
DADO pedido cartão aprovado após 2 recusas e titular com CPF ≠ customer
QUANDO os hooks pós-pagamento rodam
ENTÃO flags velocity_failures + document_mismatch criados
  E severity efetiva critical (2 regras) + alerta Owner
  E pedido exibe "⚠ Revisar antes de enviar"
  E o PAGAMENTO permanece paid, intocado

DADO seller tenta mover fulfillment com flag aberto
QUANDO confirma o aviso extra
ENTÃO transição ocorre + audit fulfillment_proceeded_with_fraud_flag

DADO Manager marca confirmed com nota
QUANDO usa o CTA
ENTÃO fluxo cancelar+estornar (138) abre pré-configurado — execução manual
```

---

## Fases de Implementação

### Fase 1 — Regras + Schema (1 dia)
Funções puras, thresholds Zod, migration + RLS, hook isolado.

### Fase 2 — Badge + Revisão (1 dia)
Badge/confirm no PRD-032; seção na tela do 139; ações + CTA 138.

### Fase 3 — Testes + Docs (0.5 dia)
Bateria das regras + isolamento; fraud-rules.md; `_DONE`.

---

## Dependências

- **Depende de:** PRD-136 (sinais), PRD-134/136 (`runPostPaymentHooks`), PRD-139 (tela hospedeira), PRD-138 (CTA), PRD-110 (alerta)
- **Bloqueia:** PRD-140B
- **Decisões Pendentes:** thresholds defaults (R$ 2.000 / N=2 / N=3) — confirmar com Owner; consumo dos scores nativos dos gateways — backlog pós-MVP

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.10; CHANGELOG; renomear `PRD-140-antifraude.md` → `_DONE`.

| Princípio | Descrição |
|-----------|-----------|
| **Nunca bloquear pagamento** | Gateway decide o dinheiro; nós, o envio |
| **Humano decide, sistema sinaliza** | Confirm + audit, jamais cancelamento automático |
| **Regras puras e plugáveis** | Nova regra = novo arquivo + teste |
| **Falha da regra é invisível** | Isolamento total do fluxo de pagamento |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 10/06/2026 | v1 | Criação inicial — Sub-lote 4d do Lote 4 (Onda 7), perfil E |

---

**AILA - Sistemas Inteligentes**
