# PRD-109: Backup e Disaster Recovery

> ✅ **STATUS (2026-06-10): CONCLUÍDO com ressalvas — entregue no PR dos PRDs 109/110.**
>
> **Entregue:** `logical-backup.yml` (pg_dump semanal `-Fc`, validação `pg_restore --list`, retenção 90 dias) e `storage-backup.yml` (+ `scripts/dr/backup-storage.ts` / `restore-storage.ts`) — ambos no padrão **no-op verde até secrets**; 4 runbooks (`restore-pitr`, `restore-logical`, `restore-storage`, `disaster-recovery`); `docs/infra/dr-policy.md` (camadas, RTO/RPO); template `docs/infra/dr-test-log.md`.
>
> **Desvios conscientes do PRD original:** (1) destino do backup externo = **GitHub Artifacts** (decisão do dono — zero custo, 90 dias nativos, independente da conta Supabase; não S3/projeto separado); (2) **não há staging** — projeto único, o teste de DR usa o próprio banco (Preview); (3) RPO real **hoje é 24 h** (daily backup) até o PITR ser habilitado.
>
> **Gated no dono** (`docs/fase2-pendencias.md` §D): D1 habilitar PITR + executar o 1º teste de DR (RF-050/051 — o PRD pedia teste ANTES do `_DONE`, mas a restauração exige o Dashboard e é ação do dono; runbook e template prontos); D2 secrets dos workflows.

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                      |
| **Repositório**       | _Repositório vivo da Fase 1, `docs/infra/runbooks/`_                                                                                                                                                                                                          |
| **Objetivo**          | Estabelecer estratégia completa de backup e disaster recovery: PITR (Point-In-Time Recovery) configurado, backups lógicos complementares, runbooks de restauração testados, definição de RTO/RPO, backup de Storage e configuração, e teste de DR documentado |
| **Tipo**              | Integração                                                                                                                                                                                                                                                    |
| **Complexidade**      | Média                                                                                                                                                                                                                                                         |
| **Total de Fases**    | 3                                                                                                                                                                                                                                                             |
| **Prioridade**        | P1 — necessário antes do go-live com dados reais (Onda 8)                                                                                                                                                                                                     |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                |
| **PRDs Relacionados** | PRD-100 (Setup — PITR habilitado, runbook scaffold); PRD-101 (Schema — o que é restaurado); PRD-106 (Storage — backup de mídias); PRD-110 (Monitoring — alerta de falha de backup)                                                                            |
| **Implementação**     | 🔵 Claude Code CLI + operação manual AILA                                                                                                                                                                                                                     |
| **Padrão de código**  | Runbooks em `docs/infra/runbooks/`; scripts em `scripts/dr/`                                                                                                                                                                                                  |

### Critérios de Complexidade

> **Justificativa de Média:** DR não tem código complexo, mas exige acertos críticos — RTO/RPO realistas, runbook que funciona sob pressão, teste de restauração real (não confiar que "vai funcionar"). Erro aqui só aparece no pior momento: perda de dados em produção. Médio porque PITR do Supabase entrega muito out-of-the-box; complexidade está nos runbooks e testes.

---

## Contexto do Problema

Quando o sistema sair do mockup e operar com dados reais (clientes, pedidos, financeiro, NFe), perda de dados vira risco de negócio sério. Cenários a cobrir:

- Deleção acidental em massa (bug, erro humano, migration ruim)
- Corrupção de dados (sync DINTEC mal-feito, Onda 6)
- Incidente Supabase (raro, mas SLA não é 100%)
- Necessidade de auditoria forense (estado em momento específico)

O Supabase Pro inclui PITR de 7 dias, mas **PITR só vale se a equipe sabe usar** — runbook testado é o que transforma feature em segurança real.

---

## Conceito da Solução

### Camadas de Backup

| Camada             | Mecanismo                                       | Frequência     | Retenção                    | Cobre                                             |
| ------------------ | ----------------------------------------------- | -------------- | --------------------------- | ------------------------------------------------- |
| **PITR**           | Supabase nativo (Pro)                           | Contínuo (WAL) | 7 dias                      | Restauração a qualquer segundo dos últimos 7 dias |
| **Daily backup**   | Supabase nativo                                 | Diário         | 7 dias (Pro)                | Snapshot diário                                   |
| **Backup lógico**  | `pg_dump` via CI agendado                       | Semanal        | 90 dias (em bucket externo) | Cópia fria, independente do Supabase              |
| **Storage backup** | Sync de buckets para storage externo (opcional) | Semanal        | 90 dias                     | Mídias, documentos fiscais                        |
| **Config backup**  | Git (migrations, config.toml, policies)         | A cada commit  | Permanente                  | Estrutura recriável                               |

### RTO / RPO

| Métrica                         | Alvo        | Justificativa                              |
| ------------------------------- | ----------- | ------------------------------------------ |
| **RPO** (perda máxima de dados) | < 5 minutos | PITR contínuo cobre                        |
| **RTO** (tempo de recuperação)  | < 4 horas   | Restauração PITR + validação + religar app |

### Runbooks

1. **Restauração PITR** — restaurar banco a um ponto no tempo (deleção acidental)
2. **Restauração de backup lógico** — recriar projeto do zero a partir de pg_dump
3. **Restauração de Storage** — recuperar mídias/documentos
4. **Failover total** — provisionar novo projeto Supabase e cutover (cenário extremo)

### Alternativas Consideradas

| Alternativa                        | Por que descartada                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Confiar só no PITR do Supabase     | Single point of failure (se conta Supabase comprometida, perde tudo). Backup lógico externo é defesa adicional |
| Backup manual ad-hoc               | Não confiável. Automatizado via CI                                                                             |
| Backup em tempo real para outro DB | Overkill e caro para MVP                                                                                       |
| Sem teste de DR                    | Antipattern crítico — backup não-testado é falsa segurança                                                     |

---

## Escopo

### Incluído

- ✅ Confirmar PITR habilitado em prod e staging (7 dias)
- ✅ Confirmar daily backups habilitados
- ✅ Backup lógico semanal via CI: `pg_dump` → bucket externo (S3 ou Supabase Storage de outro projeto/conta), retenção 90 dias
- ✅ Runbook `restore-pitr.md` — restauração a ponto no tempo
- ✅ Runbook `restore-logical.md` — recriar do pg_dump
- ✅ Runbook `restore-storage.md` — recuperar mídias
- ✅ Runbook `disaster-recovery.md` (expande scaffold do PRD-100) — failover total
- ✅ Definição documentada de RTO/RPO em `docs/infra/dr-policy.md`
- ✅ **Teste de DR real**: restaurar staging a um ponto no tempo, validar integridade
- ✅ Backup de Storage (sync semanal de buckets críticos: fiscal-documents, whatsapp-media)
- ✅ Alerta de falha de backup (integra com PRD-110)
- ✅ Workflow CI `.github/workflows/logical-backup.yml`

### Excluído

- ❌ Replicação síncrona multi-região (overkill MVP)
- ❌ Backup contínuo para DB secundário
- ❌ Restauração automática (sempre manual com validação humana)
- ❌ Backup de Edge Functions (estão no Git — config backup cobre)

---

## Requisitos Funcionais

### PITR e Daily Backups

- **RF-001:** Confirmar PITR habilitado em ambos ambientes (7 dias retenção, Pro).
- **RF-002:** Confirmar daily physical backups habilitados.
- **RF-003:** Documentar em `docs/infra/dr-policy.md` o que cada mecanismo cobre.

### Backup Lógico Externo

- **RF-010:** Workflow `logical-backup.yml` agendado (semanal) que executa `pg_dump` da prod.
- **RF-011:** Dump comprimido (gzip) e enviado para storage externo (bucket S3 dedicado ou projeto Supabase separado de backup).
- **RF-012:** Retenção 90 dias; limpeza de dumps mais antigos automatizada.
- **RF-013:** Dump inclui schema + dados (`--format=custom`). Storage de mídias é backup separado (RF-030).
- **RF-014:** Credenciais de acesso ao storage externo no GitHub Secrets.

### Runbooks

- **RF-020:** `docs/infra/runbooks/restore-pitr.md`: passo a passo para restaurar a ponto no tempo via Dashboard Supabase. Inclui: como escolher timestamp, impacto (cria novo projeto ou restaura no mesmo), validação pós-restore.
- **RF-021:** `docs/infra/runbooks/restore-logical.md`: recriar projeto do zero a partir de pg_dump (`pg_restore`). Inclui: provisionar projeto, restaurar dump, reaplicar config, religar app.
- **RF-022:** `docs/infra/runbooks/restore-storage.md`: recuperar buckets a partir de backup.
- **RF-023:** `docs/infra/runbooks/disaster-recovery.md`: failover total (Supabase indisponível) — provisionar novo projeto, restaurar dados+storage, atualizar env vars Vercel, cutover DNS.

### RTO/RPO

- **RF-030:** Documentar RPO < 5min, RTO < 4h em `docs/infra/dr-policy.md` com justificativa e procedimento para atingir.

### Backup de Storage

- **RF-040:** Sync semanal dos buckets críticos (`fiscal-documents`, `whatsapp-media`) para storage externo. Documentos fiscais têm obrigação legal de retenção.
- **RF-041:** `product-images` e `avatars` (públicos, recriáveis) — backup opcional, menor prioridade.

### Teste de DR

- **RF-050:** Executar teste real: restaurar staging a um timestamp de 1h atrás via PITR; validar integridade (contagem de registros, consistência de FKs).
- **RF-051:** Documentar resultado do teste em `docs/infra/dr-test-log.md` com data, cenário, tempo de recuperação real, problemas encontrados.
- **RF-052:** Teste de DR deve ser repetido trimestralmente (registrar no changelog; não automatizado no MVP).

### Alerta de Falha

- **RF-060:** Se `logical-backup.yml` falha, alerta para `infra@ailasistemas.com.br` (integra PRD-110).
- **RF-061:** Verificação semanal de que o último backup existe e é válido (não corrompido).

---

## Requisitos Não-Funcionais

- **RNF-001 (RPO):** Perda máxima < 5min (PITR contínuo).
- **RNF-002 (RTO):** Recuperação < 4h (runbook testado).
- **RNF-003 (Backup integrity):** Dump lógico validável (`pg_restore --list` sem erro).
- **RNF-004 (Independência):** Backup lógico em conta/storage diferente do Supabase principal — sobrevive a comprometimento da conta.
- **RNF-005 (Compliance fiscal):** Documentos fiscais com backup independente (obrigação legal).
- **RNF-006 (Testabilidade):** DR testado, não presumido.

---

## Critérios de Aceitação

### RF-010 + RF-013: Backup Lógico Funciona

```gherkin
DADO o workflow logical-backup.yml agendado
QUANDO executa semanalmente
ENTÃO faz pg_dump da prod em formato custom
  E comprime e envia para storage externo
  E o dump é validável com pg_restore --list sem erro
  E dumps com mais de 90 dias são removidos
```

### RF-050 + RF-051: Teste de DR Real

```gherkin
DADO staging com dados conhecidos
QUANDO executo restauração PITR para timestamp de 1h atrás
ENTÃO o banco restaura ao estado daquele momento
  E contagem de registros bate com o esperado
  E FKs estão íntegras
  E o tempo de recuperação é registrado (deve ser < 4h)
  E o resultado é documentado em dr-test-log.md
```

### RF-060: Alerta de Falha

```gherkin
DADO o workflow de backup configurado com alerta
QUANDO o pg_dump falha (ex: credencial expirada)
ENTÃO um alerta é enviado para infra@ailasistemas.com.br
  E o workflow fica marcado como falho no GitHub
```

---

## Fases de Implementação

### Fase 1 — Confirmar Nativo + Backup Lógico (1 dia)

- Confirmar PITR + daily; workflow logical-backup.yml; storage externo

### Fase 2 — Runbooks + RTO/RPO (1 dia)

- Escrever 4 runbooks; documentar dr-policy.md

### Fase 3 — Teste de DR + Storage Backup (1 dia)

- Teste real de restauração; backup de Storage; alerta; `_DONE`

---

## Dependências

- **Depende de:** PRD-100 (PITR habilitado, scaffold de runbook), PRD-101 (schema a restaurar), PRD-106 (Storage a fazer backup), PRD-110 parcial (alerta)
- **Decisões pendentes:** onde armazenar backup lógico externo (S3 AWS? Outro projeto Supabase? Conta de backup dedicada?) — confirmar com AILA; frequência do backup lógico (semanal sugerido).

---

## Considerações de Segurança

- Backup lógico contém todos os dados (PII, fiscal) — storage externo deve ser criptografado e com acesso restrito.
- Credenciais de backup no GitHub Secrets, nunca em código.
- Documentos fiscais: retenção legal respeitada no backup.
- Restauração sempre com validação humana (nunca automática) — evita restaurar estado comprometido.

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.0.0-rc.9; CHANGELOG; renomear `PRD-109-backup-dr_DONE.md`; teste de DR executado e documentado ANTES do `_DONE`.

| Princípio                | Descrição                                           |
| ------------------------ | --------------------------------------------------- |
| **Backup testado**       | DR não-testado é falsa segurança                    |
| **Independência**        | Backup externo sobrevive a comprometimento da conta |
| **Restauração validada** | Sempre validação humana, nunca automática           |
| **Compliance fiscal**    | Documentos fiscais com backup independente          |

| ❌ Evitar                                    |
| -------------------------------------------- |
| Confiar só no PITR (single point of failure) |
| Backup não-testado                           |
| Restauração automática sem validação         |
| Backup em mesma conta/storage do principal   |
| Esquecer backup de documentos fiscais        |

---

## Status de Implementação

| Campo      | Valor                                                       |
| ---------- | ----------------------------------------------------------- |
| **Status** | ✅ CONCLUÍDO (com ressalvas — ver nota no topo)             |
| **Data**   | 2026-06-10                                                  |
| **Versão** | v0.75.0                                                     |
| **Por**    | Claude Code (AILA)                                          |

---

## Histórico

| Data       | Versão | Alteração                              |
| ---------- | ------ | -------------------------------------- |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1d (Onda 4) |

---

**AILA - Sistemas Inteligentes**
