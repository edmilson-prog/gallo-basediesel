# Épico "Gestão de Pessoas & Acesso" — Roteiro de Implantação (PRD-211 → 212 → 213)

> **Status:** roteiro aprovado em 2026-06-16. Plano formal task-by-task escrito apenas para o **PRD-211** (`2026-06-16-prd-211-papeis-editaveis-plano.md`). Os PRDs 212 e 213 serão detalhados quando chegar a vez deles, já com as premissas reais do 211 implementado.

**Objetivo do épico:** transformar o RBAC hardcoded/read-only em um sistema de papéis persistido e editável, ativar o Departamento (`ITeam`), aprofundar o cadastro de usuário, e sobre essa fundação entregar horário de atendimento por usuário e a fila de rodízio.

---

## Sequência (forçada pela cadeia de dependências)

```
PRD-211 (fundação)  ──┬──▶  PRD-212 (horário)  ──┐
  papéis/permissões   │       workSchedule + gate │
  recursos como dado  │                           ├──▶  PRD-213 (rodízio)
  Departamento(ITeam) │                           │       fila por loja, targetMode,
  gestão de usuários  └───────────────────────────┘       @dnd-kit, pulo de offline
```

| # | PRD | Entrega | Release |
|---|-----|---------|---------|
| 1 | **211** | Papéis editáveis + recursos como dado + Departamento + usuários + propagação enforcement | MINOR, codinome novo (ver nota) |
| 2 | **212** | `workSchedule` por usuário + gate assimétrico de acesso | MINOR, codinome novo |
| 3 | **213** | Fila de rodízio por loja + `targetMode` + drag-and-drop | MINOR, codinome novo |

> **Nota de codinomes:** os sugeridos nos PRDs colidem com releases já feitas (`Relay` = v0.83.0, `Keyring` = v0.85.0). Escolher codinomes inéditos no momento do versionamento de cada PRD.

## Decisões transversais aprovadas

1. **Camada de dados:** cada PRD entrega **mock + Supabase + RLS no mesmo ciclo** (a Fase 2 já chegou — produção roda `supabase`). O padrão drop-in continua: implementa mock (validação rápida/testável) e a camada Supabase real para ir a produção.
2. **Schema `public`** (não `crm` como citam os PRDs) — alinhado ao resto do projeto.
3. **Enforcement (decisão central do 211):** fonte da verdade nas tabelas `roles`/`role_permissions`; a **UI** lê a matriz persistida via cache em memória (assinatura síncrona de `hasPermission` preservada); a **RLS** continua governada pelo **papel base** já no JWT (Custom Access Token Hook). Todo papel customizado carrega um **`base_role`** (um dos 7 de sistema) que a RLS enxerga — nenhuma policy RLS é reescrita e não há brecha (o `base_role` nunca concede além do papel de sistema; a matriz fina apenas refina UI/navegação por cima dele).
4. **`@dnd-kit` aprovado** para a Tela de Rodízio (PRD-213) — respeitando o guard de supply-chain de 24h do `bunfig.toml`. Só entra no 213.
5. **Processo git:** épico parte da `main`; uma branch por PRD (`feat/prd-211-papeis` → `feat/prd-212-horario` → `feat/prd-213-rodizio`). A branch `feat/whatsapp-multi-instancia` (outro épico) deve ser fechada/mergeada antes de abrir a do 211, para não cruzar escopos. Migrations aplicadas em produção **somente com autorização explícita do dono** e espelhadas em `supabase/migrations/` no mesmo PR (regra do projeto).

## Marcos de validação por PRD

- **211:** seed fiel (diff vazio matriz persistida × constante); testes do PRD-006 continuam passando; editor cria/edita papéis com proteções; Departamento dá significado real ao scope `team`; tela de usuários CRUD com abas placeholder Horário/Rodízio.
- **212:** `isWithinWorkSchedule`/`getNextOpenAt` puros e testados (timezone `America/Sao_Paulo`); gate bloqueia operacional fora da janela, isenta Owner/Gestor, só avisa no meio da sessão; override de emergência auditado; gate validado server-side (Edge Function) na camada Supabase.
- **213:** `selectNextFromRotation` puro e determinístico (sem `Math.random()`); pulo de offline com avanço de ponteiro; contrato de fronteira com PRD-013 (uma atribuição por conversa); tela com drag-and-drop acessível e visão ao vivo; integração com horário (212).

## Reconciliação com a Onda 12 (PRDs 184–189)

O PRD-211 **antecipa** a ativação de `ITeam` (originalmente PRD-184) e a edição de permissões (afim ao PRD-189). Ao concluir o 211, reconciliar o `INDEX-PRDs` e reduzir/absorver o escopo de 184/189.

---

**AILA — Sistemas Inteligentes**
