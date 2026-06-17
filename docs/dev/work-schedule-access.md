# Horário de Atendimento + Gate de Acesso (PRD-212)

> Codinome de release: a definir no fechamento. Feature da cadeia **Pessoas & Acesso** (PRD-211 → **212** → 213).

Dá a cada usuário uma **agenda semanal de atendimento** (`workSchedule`) que controla o **acesso à plataforma**. Papéis operacionais só entram dentro do turno; Owner/Gestor são isentos; quem está logado quando a janela fecha é apenas avisado; fora do turno o usuário fica `offline` e sai do rodízio.

## Dois horários distintos — não confundir

| Conceito | Tipo | Controla | Onde |
|----------|------|----------|------|
| **Horário comercial da loja** | `IDistributionSettings.businessHours` (PRD-013) | distribuição/SDR da loja | engine de distribuição |
| **Horário de atendimento do usuário** | `ISeller.workSchedule` (PRD-212) | **acesso do usuário** à plataforma | feature `access` |

São entidades independentes. O PRD-212 **não** altera o `businessHours` da loja.

## Modelo de dados (`@/shared/types`)

- `IWorkScheduleWindow` — `{ weekday: 0-6; openAt: "HH:mm"; closeAt: "HH:mm"; enabled: boolean }` (mesma forma do `IBusinessHoursWindow`, mas por usuário; weekday/horário no calendário de São Paulo).
- `IWorkSchedule = IWorkScheduleWindow[]` — **ausente/vazio ⇒ sem restrição** (acesso livre).
- `IScheduleOverride` — `{ date: "YYYY-MM-DD"; type: "block"|"allow"; reason?; openAt?; closeAt? }` — exceção por data, tem precedência sobre a regra semanal.
- `IAccessGrant` — `{ grantedBy; grantedAt; expiresAt; reason? }` — liberação temporária de emergência.

Persistidos em `public.sellers` como 3 colunas jsonb (`work_schedule`, `schedule_overrides`, `access_grant`) — migration `20260616170000_sellers_work_schedule.sql`. O mock (`provider.update`) já propaga os campos; o mapper Supabase (`impl/supabase/sellers.ts`) faz o snake↔camel.

> ⚠️ A migration é **versionada** no repo. A aplicação em produção é feita **somente sob autorização nominal do dono** (padrão do projeto — `.env.local` aponta para prod).

## Timezone — `America/Sao_Paulo` por offset fixo

O Brasil **não tem horário de verão desde 2019**, então São Paulo é fixo em **UTC−03:00**. Em vez de `date-fns-tz`, os helpers usam o offset fixo (180 min) — trivial, sem dependência nova, determinístico. `src/features/access/engine/workSchedule.ts`:

- `saoPauloParts(date)` → `{ weekday, minutes, ymd }` no relógio de Brasília, independente do fuso do dispositivo.
- `isWithinWorkSchedule(source, date)` → dentro da janela? (considera regra semanal **e** overrides; janelas que cruzam a meia-noite **não** são suportadas, como no editor de horário comercial).
- `getNextOpenAt(source, date)` → ISO do próximo início de janela (para a mensagem "acesso liberado a partir de…"); `null` quando não há agenda.
- `validateWorkSchedule(schedule)` → erros pt-BR (closeAt ≤ openAt; janelas sobrepostas no mesmo dia).

> Se o Brasil reinstaurar o horário de verão, este módulo precisa mudar (é o único ponto acoplado ao offset fixo).

## Regra assimétrica de enforcement (`engine/accessGate.ts`)

`evaluateAccess({ role, active, workSchedule?, scheduleOverrides?, accessGrant?, now })` → `{ allowed, reason, nextOpenAt }`. Ordem:

1. **suspenso/inativo** (`active === false`) ⇒ bloqueado (`reason: "suspended"`) — prevalece sobre horário (RF-009).
2. **não-operacional** (Owner, Gestor, Cliente) ⇒ liberado (isento de horário).
3. **sem agenda** ⇒ liberado (acesso livre).
4. **liberação ativa** (`accessGrant.expiresAt > now`) ⇒ liberado.
5. dentro da janela ⇒ liberado; senão ⇒ bloqueado (`reason: "outside_hours"`, `nextOpenAt`).

| Momento | Operacional (Vendedor, Vendedor Externo, SDR, Financeiro) | Owner / Gestor | Cliente |
|---------|---|---|---|
| Login fora da janela | 🚫 bloqueado (msg + próximo horário + pedir liberação) | ✅ sempre | N/A |
| Janela fecha na sessão | ⚠️ só avisa (banner) | sem efeito | N/A |
| Fora da janela | 🟤 `offline` automático + fora do rodízio | sem efeito | N/A |

`OPERATIONAL_ROLES = [Vendedor, VendedorExterno, SDR, Financeiro]`. **Owner/Gestor nunca são bloqueados** (RNF-001); o gate **falha aberto** para operacionais em erro de leitura.

## Gate de login — client-side (server-side DEFERIDO)

O login é 100% client-side (`supabase.auth.signInWithPassword` direto do browser) — **não existe Edge Function de login**. O gate roda **na rota de login** (`src/routes/auth.login.tsx`), via `useAccessGate().evaluateForProfile(profile)`, porque a camada de auth não pode importar `@/mocks`/factory (ESLint) e a rota tem acesso aos hooks de provider.

- Fluxo: autentica → avalia o horário → se bloqueado, `signOut()` (encerra a sessão recém-criada) + `AccessBlockedNotice` (próximo horário + CTA "solicitar liberação").
- **Sessão restaurada (`getSession`) NÃO é bloqueada** — só o login explícito; sessão em andamento recebe o banner (princípio "não expulsar no meio").

> **Enforcement server-side real está DEFERIDO** por decisão do dono. No client-side, um login bloqueado cria sessão por um instante (encerrada na sequência) e é contornável por manipulação de client. O fix real exige um Auth Hook em produção (risco de trancar acesso) — tarefa própria, com decisão dedicada. RNF-004 fica em aberto até lá.

## Sessão: banner + auto-offline (RF-010/011/012)

`useOutsideHoursWatcher` (montado via `<OutsideHoursBanner/>` no `AppLayout`) verifica a cada 60s, para o usuário operacional com agenda, se está fora da janela. Na transição dentro→fora: marca `availability: "offline"` **uma vez** (re-armado ao reabrir) — **nunca** força `online` de volta. O banner é persistente, não desloga nem bloqueia ações. O `AvailabilityToggle` rotula "offline — fora do horário" quando aplicável.

**Integração com o rodízio (PRD-213):** o seletor de rodízio já considera só `availability === "online"` (`getOnlineSellers`), então o auto-offline tira o usuário do rodízio naturalmente — sem acoplamento extra. O 213 refina a partir daqui.

## Override de emergência (RF-013/014/015)

`GrantAccessDialog` (acionado na aba "Horário", Owner-only hoje) concede liberação "por N horas" ou "até HH:mm de hoje" (Brasília). Grava `accessGrant` no seller, audita `access_grant_created`. Enquanto válido, o login passa mesmo fora da janela; ao expirar, a regra normal volta (sem cron — `evaluateAccess` checa `expiresAt`). Revogar grava `accessGrant: null` e audita `access_grant_revoked`. `canGrantAccess(actor, target)` já prevê Gestor-no-departamento para quando a tela abrir a Gestor.

## Arquivos

```
src/features/access/
├── engine/workSchedule.ts        # timezone + dentro-da-janela + próximo-início + validação (puro, testado)
├── engine/workSchedule.test.ts
├── engine/accessGate.ts          # evaluateAccess + canGrantAccess + OPERATIONAL_ROLES (puro, testado)
├── engine/accessGate.test.ts
├── hooks/useAccessGate.ts        # orquestra a decisão na rota de login (busca o seller)
├── hooks/useOutsideHoursWatcher.ts  # timer de sessão + auto-offline
├── components/WorkScheduleTab.tsx   # editor da aba "Horário" (CONTROLADO — agenda/exceções salvas pelo form pai; grant à parte)
├── components/AccessBlockedNotice.tsx
├── components/OutsideHoursBanner.tsx
├── components/GrantAccessDialog.tsx
└── index.ts                      # barrel
```
Tocados fora da feature: `shared/types/people.ts` + barrel, `providers/data/impl/supabase/sellers.ts`, `features/auth/authContext.ts`, `features/admin-settings/components/SellerFormDialog.tsx`, `routes/auth.login.tsx`, `features/shell/layouts/AppLayout.tsx`, `features/distribution/components/AvailabilityToggle.tsx`.

## Limitações conhecidas / follow-ups

- **Server-side gate** (RF-020) deferido — ver acima.
- **Expiração de grant não é auditada** ativamente (sem tick server-side); só a criação/revogação são. A liberação simplesmente deixa de valer quando `expiresAt` passa.
- Overrides com **janela parcial** (`openAt`/`closeAt`) são suportados pelo engine, mas o editor (`ScheduleOverridesEditor`) só expõe "fechar dia" / "liberar dia" inteiro nesta versão.
- "Solicitar liberação ao gestor" na tela de bloqueio é um CTA informativo (sem backend de solicitação).
