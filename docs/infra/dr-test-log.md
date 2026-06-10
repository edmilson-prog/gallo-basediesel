# Log de testes de Disaster Recovery (PRD-109, RF-051)

> Todo teste de DR (ou incidente real) deve ser registrado aqui — data, cenário,
> tempo de recuperação medido e problemas encontrados. Frequência mínima:
> **trimestral** (ver `dr-policy.md` § Agenda de testes).

## Template (copiar para cada execução)

```markdown
## YYYY-MM-DD — <cenário> (<teste|incidente real>)

| Campo | Valor |
| --- | --- |
| **Executor** | <nome> |
| **Runbook usado** | restore-pitr / restore-logical / restore-storage / disaster-recovery |
| **Timestamp alvo** | YYYY-MM-DD HH:MM UTC |
| **Início** | HH:MM |
| **Fim (validação OK)** | HH:MM |
| **RTO medido** | Xh Ym (alvo < 4h) |
| **Dados perdidos (RPO real)** | <nenhum / janela> |
| **RLS regression** | PASSED / FAILED |
| **Contagens validadas** | <tabelas e resultado> |

**Problemas encontrados:**
- <problema + como foi contornado>

**Ações de melhoria (issues abertas):**
- <#NN — descrição>
```

---

## Execuções

_Nenhum teste executado ainda. O primeiro teste (restauração PITR com validação de
integridade) está gated na issue de ativação de DR & Observabilidade — exige PITR
habilitado no Dashboard (ação do dono)._
