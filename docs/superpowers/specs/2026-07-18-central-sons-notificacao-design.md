# Central de Sons de Notificação — Design Spec

**Data:** 2026-07-18
**Branch:** `worktree-feat+update-notification-sound`
**Status:** Aprovado o design em conversa; pendente revisão da spec escrita.

## 1. Contexto e objetivo

Hoje a plataforma emite **3 sons de notificação**, todos sintetizados via Web Audio API,
cada um com uma persistência de preferência diferente e código de síntese próprio:

| Som | Arquivo de síntese | Disparo | Preferência hoje |
|---|---|---|---|
| Aviso de atualização disponível | `features/version-update/lib/notification-sound.ts` | `VersionUpdatePrompt.tsx` quando o card fica visível | **nenhuma** (hardcoded) |
| Inbox — mensagem na minha conversa (`assigned-mine`) | `features/inbox-alerts/lib/tonePlayer.ts` | `useInboxActivityMonitor` (Realtime) | **por-navegador** (`soundAlertPreferencesStore`, Zustand+localStorage) |
| Inbox — novo cliente na fila (`new-in-queue`) | mesmo `tonePlayer.ts` | `useInboxActivityMonitor` (Realtime) | **por-navegador** (idem) |
| Timeout de sessão (aviso de logout) | `features/session-timeout/lib/beep.ts` | `useSessionTimeout` durante a contagem regressiva | **por-loja** (`IPlatformSettings.sessionTimeout.soundEnabled/soundVolume`) + override por-seller |

**Objetivo:** unificar tudo numa **central de sons configurável nas Configurações**, onde
o Owner escolhe, para cada evento, **qual som toca** (a partir de uma biblioteca de
"templates"), **o volume** e **se está ligado**. O padrão do aviso de atualização passa a
ser a **Marimba** (validada com o dono no estúdio de sons publicado como Artifact).

## 2. Decisões tomadas (aprovadas)

1. **Escopo de persistência: por-loja, Owner define.** A configuração vive em
   `IPlatformSettings` (por-loja), editada numa tela **Owner-only**. Sem escopo
   por-usuário e sem override individual (YAGNI — pode evoluir depois).
2. **Eventos cobertos: os 4** (atualização, inbox×2, timeout de sessão).
3. **Controle pessoal do atendente: removido.** O ícone de som na TopBar
   (`SoundAlertToggle`) e a preferência por-navegador (`soundAlertPreferencesStore`)
   são eliminados; a central por-loja é a única fonte.
4. **Timeout de sessão: mantém a cadência de urgência.** Os beeps continuam ficando
   mais frequentes perto do logout (lógica `shouldBeepAtTick` intacta); só **muda qual
   som toca** e o volume, agora vindos da central. Os *tempos* (idle/aviso) seguem na
   tela de Sessão.
5. **Defaults por evento:** atualização → **Marimba**; "mensagem minha" →
   **Clássico curto**; "novo na fila" → **Clássico fila**; timeout → **Clássico curto**.
   (Clássico curto/fila reproduzem os bips atuais da Inbox, para quem quer o discreto.)

## 3. Arquitetura

Nova feature **`src/features/sound-settings/`**, coesa e com barrel `index.ts`:

```
src/features/sound-settings/
├── engine/
│   ├── soundTemplates.ts       # biblioteca de templates (catálogo + synth por template) — PURO
│   ├── soundTemplates.test.ts
│   ├── soundEvents.ts          # catálogo dos 4 eventos + defaults — PURO
│   └── soundEvents.test.ts
├── lib/
│   └── soundPlayer.ts          # createSoundPlayer(): gerencia AudioContext + unlock + play(eventId, settings)
├── hooks/
│   └── useSoundEventPlayer.ts  # wrapper React: lê settings da loja + devolve play(eventId)
├── pages/
│   └── SoundSettingsPage.tsx   # tela Owner-only (molde: SessionSettingsPage)
├── i18n/
│   └── pt-BR.ts
└── index.ts
```

**Fluxo:** um consumidor chama `play(eventId)`. O player resolve
`config = settings.sound.events[eventId] ?? DEFAULT`; se `!config.enabled`, não faz nada;
senão pega `template = SOUND_TEMPLATES[config.templateId]` e chama
`template.synth(audioCtx, audioCtx.currentTime, config.volume)`. O `AudioContext` é
reutilizado por player (não um por play) e destravado via `useAudioUnlock`.

### Princípio de isolamento

- **`soundTemplates.ts`** — única fonte de síntese de áudio da plataforma. Não conhece
  settings nem eventos; só sabe transformar `(templateId, ctx, when, volume)` em som.
- **`soundEvents.ts`** — catálogo dos eventos e defaults; não sabe sintetizar.
- **`soundPlayer.ts`** — cola: settings + evento → template. Gerencia o ciclo do `AudioContext`.
- Cada consumidor (version-update, inbox, session-timeout) só depende de `play(eventId)`.

## 4. Modelo de dados

Definido em **`src/shared/types/sound.ts`** (novo) e reexportado pelo barrel
`src/shared/types/index.ts`. Fica em `shared/types` (não na feature) para que
`IPlatformSettings` possa referenciá-lo sem inverter a dependência
(shared/types nunca importa de `features/`).

```ts
export type SoundTemplateId =
  | "marimba" | "diesel" | "buzina" | "sino" | "powerup" | "fanfarra"
  | "classic-short" | "classic-queue";

export type SoundEventId =
  | "updateAvailable" | "inboxAssignedMine" | "inboxNewInQueue" | "sessionTimeout";

export interface ISoundEventConfig {
  enabled: boolean;
  templateId: SoundTemplateId;
  volume: number; // 0..1
}

export interface ISoundSettings {
  events: Record<SoundEventId, ISoundEventConfig>;
}

export const DEFAULT_SOUND_SETTINGS: ISoundSettings = {
  events: {
    updateAvailable:   { enabled: true, templateId: "marimba",       volume: 0.7 },
    inboxAssignedMine: { enabled: true, templateId: "classic-short", volume: 0.5 },
    inboxNewInQueue:   { enabled: true, templateId: "classic-queue", volume: 0.6 },
    sessionTimeout:    { enabled: true, templateId: "classic-short", volume: 0.6 },
  },
};
```

Em `IPlatformSettings` (`src/shared/types/platform.ts`), novo campo **opcional**:

```ts
sound?: ISoundSettings;
```

Segue o padrão dos blocos recentes (`idleAlerts?`, `conversationRescue?`): opcional +
`DEFAULT_*` + fallback `settings.sound ?? DEFAULT_SOUND_SETTINGS` nos consumidores.

### Persistência — SEM migration

`IPlatformSettings` **não é tabela**: vive no `jsonb stores.settings`
(`impl/supabase/settings.ts`). `update({ sound })` faz shallow-merge do top-level `sound`
no blob. **Nenhuma migration SQL é necessária.** Lojas existentes sem a chave `sound`
resolvem no `?? DEFAULT_SOUND_SETTINGS` até a primeira gravação pela tela.
`buildDefaultSettings.ts` passa a incluir `sound: structuredClone(DEFAULT_SOUND_SETTINGS)`
para lojas novas.

## 5. Biblioteca de templates

8 templates. Os 6 criativos vêm do estúdio validado; os 2 "clássicos" preservam os bips
atuais da Inbox (compatibilidade / opção discreta):

| id | Nome (UI) | Personalidade | Origem |
|---|---|---|---|
| `marimba` | Marimba | 3 notas alegres, leve | estúdio ⭐ padrão de atualização |
| `diesel` | Ignição Diesel | motor dando partida, on-brand | estúdio |
| `buzina` | Buzina de Estrada | buzina de caminhão, forte | estúdio |
| `sino` | Sino Premium | sino FM com eco, elegante | estúdio |
| `powerup` | Power-Up | arpejo de videogame | estúdio |
| `fanfarra` | Fanfarra | mini fanfarra celebrativa | estúdio |
| `classic-short` | Clássico curto | 1 tom curto (520 Hz sine) | `tonePlayer` `assigned-mine` atual |
| `classic-queue` | Clássico fila | 2 tons 660→880 Hz sine | `tonePlayer` `new-in-queue` atual |

Cada template: `{ id, label, description, synth(ctx, when, volume) }`. `synth` recebe o
volume 0..1 e aplica seu próprio headroom/envelope. As implementações de síntese são
portadas de `notification-sound.ts` (novo padrão marimba), `tonePlayer.ts` (clássicos) e
das funções do estúdio (demais).

## 6. Mudanças por consumidor

### 6a. version-update (novo — risco baixo)
`VersionUpdatePrompt.tsx`: troca `playUpdateAvailableSound()` por
`play("updateAvailable")` do `useSoundEventPlayer()`. `notification-sound.ts` é removido
(sua síntese vira o template `marimba`). O card está no `AppLayout` (logado), então tem
acesso a settings da loja.

### 6b. inbox-alerts (risco médio — adjacente ao Realtime)
`useInboxActivityMonitor.ts`: hoje lê `soundAlertPreferencesStore` (per-browser) e chama
`tonePlayer.play(kind, volume)`. Passa a usar `play("inboxAssignedMine")` /
`play("inboxNewInQueue")` do player central, lendo a config da loja.

> ⚠️ **Restrição dura:** o monitor faz parte da zona de Realtime/cache do atendimento que
> tratamos como **congelada**. A mudança se limita a **trocar a fonte do som** — a
> config da loja é lida via `ref` atualizado (mesmo padrão de `prefs` hoje), **sem
> alterar** subscriptions de canais, query keys, ou a lógica de disparo. Nada de tocar em
> `messages`/`conversations` realtime, RPC gated-once, ou signing de mídia.

Remoções: `SoundAlertToggle.tsx` (e seu uso em `TopBar.tsx`), `soundAlertPreferencesStore.ts`,
`tonePlayer.ts` (migrado para os templates `classic-*`).

### 6c. session-timeout (risco médio-alto — maior refator)
`useSessionTimeout.ts`: no ramo de beep (`:144-153`), quando `decision.beep`, passa a
tocar o **template** do evento `sessionTimeout` no volume da central, em vez de
`beeperRef.beep(volume, urgency)`. A **cadência** (`shouldBeepAtTick`) fica **intacta**;
o parâmetro `urgency` deixa de modular o timbre (a urgência é comunicada pela frequência
de repetição, não pelo pitch).

O som do timeout passa a ser governado pela central:
- Fonte de `enabled`/`volume`/`template` do som = `settings.sound.events.sessionTimeout`.
- `ISessionTimeoutSettings.soundEnabled` / `soundVolume` e o override por-seller
  **deixam de ser lidos/escritos** para tocar som. Ficam no tipo como opcionais
  (compat com blobs existentes); `resolveSessionTimeout` para de resolvê-los.
  Remoção física dos campos = follow-up de limpeza (fora do escopo).
- Na **tela de Sessão** (`SessionSettingsPage`), os 2 controles de som (switch "Emitir
  beeps" + slider "Intensidade") são **removidos**, com uma linha apontando: *"O som do
  aviso é configurado em Configurações → Sons de notificação"*. Os **tempos** (idle/aviso)
  permanecem lá.

Remoção: `beep.ts` (migrado para templates).

### 6d. Infra compartilhada
`useAudioUnlock` (hoje em `features/session-timeout/hooks/`, já reusado pela inbox)
**move para `src/shared/hooks/useAudioUnlock.ts`** — é infra genuinamente compartilhada
pelos 3 consumidores. Atualizar os 2 imports existentes. (Alternativa de menor mexida:
manter onde está e importar de lá; preferimos mover por clareza.)

## 7. Tela de Configurações

`SoundSettingsPage` (Owner-only), molde = `SessionSettingsPage`:
`usePlatformSettings(storeId)` → draft → dirty por `JSON.stringify` →
`update({ sound: draft }, "settings.sound.update")` + `invalidateQueries(["settings", storeId])`.

Layout: uma linha por evento (nome amigável + descrição curta), com:
- **Switch** liga/desliga.
- **Select** de template (os 8, com label + descrição).
- **Slider** de volume (0..1, passo 0.05).
- Botão **▶ Testar** — instancia um `soundPlayer`, faz `unlock()` e toca o template do
  draft no volume do draft (ouve na hora, sem salvar).

**Navegação:** registrar em `SETTINGS_GROUPS` (`SettingsLayout.tsx`), grupo **Operação**,
rótulo **"Sons de notificação"**, ícone `mdi:music-note` (ou similar), gate `roles: ["Owner"]`.
**Rota:** `src/routes/app.configuracoes.sons.tsx` → `requireAuth(location.pathname, ["Owner"])`
→ `<SettingsLayout><SoundSettingsPage/></SettingsLayout>`.

**i18n:** `sound-settings/i18n/pt-BR.ts` com nomes de eventos, nomes/descrições de
templates e labels da tela (pt-BR com acentos corretos).

## 8. Testes (Vitest)

Engine pura, co-localizada:
- `soundTemplates.test.ts`: todo `SoundTemplateId` do type existe no catálogo e vice-versa;
  cada template tem `label`/`description` não vazios e `synth` é função.
- `soundEvents.test.ts`: `DEFAULT_SOUND_SETTINGS` cobre exatamente os 4 `SoundEventId`;
  todo `templateId` default referencia um template existente; volumes em [0,1].
- Resolução `resolveEventConfig(settings, eventId)`: retorna a config quando presente;
  cai no default quando `settings.sound` ausente, quando o evento falta, ou quando o
  `templateId` salvo é inválido (fallback ao template default do evento).

A síntese em si (Web Audio) não é unit-testável de forma útil — validação é **ouvindo**
(a plataforma testa UI/áudio manualmente).

## 9. Ordem de implementação sugerida (para o plano)

Incremental, do menor risco ao maior — cada passo compila/testa isolado:
1. **Fundação:** `shared/types/sound.ts` + barrel + `sound?` em `IPlatformSettings` +
   `DEFAULT_SOUND_SETTINGS` em `buildDefaultSettings.ts`.
2. **Engine + player:** `soundTemplates.ts` (portando as sínteses), `soundEvents.ts`,
   `soundPlayer.ts`, `useSoundEventPlayer.ts` + testes.
3. **Mover** `useAudioUnlock` para `shared/hooks/`.
4. **Tela** `SoundSettingsPage` + rota + registro em `SETTINGS_GROUPS` + i18n.
5. **Consumidor 1 (baixo risco):** version-update → central; remover `notification-sound.ts`.
6. **Consumidor 2:** inbox → central; remover `SoundAlertToggle`, `soundAlertPreferencesStore`,
   `tonePlayer.ts` (com a restrição de Realtime).
7. **Consumidor 3:** session-timeout → central; ajustar `SessionSettingsPage`,
   `resolveSessionTimeout`, remover `beep.ts`.
8. **Gate final:** `bun run build` + `bun run test` + `bunx tsc --noEmit` (delta) verdes.

## 10. Fora de escopo (YAGNI)

- Preferência por-usuário / override individual de sons.
- Upload de arquivo de áudio próprio (a central é 100% síntese).
- Novos eventos sonoros além dos 4 (a arquitetura suporta; não implementamos agora).
- Remoção física dos campos `soundEnabled/soundVolume` de `ISessionTimeoutSettings`
  (deprecados agora, cleanup depois).
- Migração de dados de preferências per-browser existentes (serão simplesmente descartadas
  ao remover o store; os defaults por-loja assumem).

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Mexer perto do Realtime da Inbox | Trocar só a fonte do som via `ref`; não tocar em subscriptions/query keys/RPC/signing. |
| Refator do session-timeout quebrar o logout | Manter `shouldBeepAtTick`/`computeIdlePhase` intactos; só troca a função de som. Testar a cadência. |
| Template longo (sino 1,4s) no timeout sobrepondo nos ticks finais | Aceitável (Web Audio soma); default do timeout é `classic-short`. |
| Autoplay policy bloqueando áudio | Reusar `useAudioUnlock` (resume em gesto qualificado), como hoje. |
| Lojas existentes sem `sound` no blob | Fallback `?? DEFAULT_SOUND_SETTINGS` em todos os consumidores. |
