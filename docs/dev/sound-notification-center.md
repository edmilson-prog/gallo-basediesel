# Central de Sons de Notificação

> Unifica os 3 sons de notificação da plataforma (atualização disponível, Inbox e
> timeout de sessão) numa **única fonte de configuração por-loja**, editável pelo
> Owner. Antes cada consumidor tinha sua própria síntese Web Audio e sua própria
> preferência (hardcoded, por-navegador ou por-loja). Spec:
> `docs/superpowers/specs/2026-07-18-central-sons-notificacao-design.md`. Plano
> (11 tarefas): `docs/superpowers/plans/2026-07-18-central-sons-notificacao.md`.

## Onde vive

| Peça | Local |
| --- | --- |
| Modelo de dados | `src/shared/types/sound.ts` — `SoundTemplateId`, `SoundEventId`, `ISoundEventConfig`, `ISoundSettings`, `DEFAULT_SOUND_SETTINGS`. Reexportado por `src/shared/types/index.ts`. |
| Campo em settings | `IPlatformSettings.sound?: ISoundSettings` (`src/shared/types/platform.ts`) — **opcional**, vive no `jsonb stores.settings`. **Sem migration.** `buildDefaultSettings.ts` semeia `DEFAULT_SOUND_SETTINGS` para lojas novas; lojas existentes caem no fallback `settings.sound ?? DEFAULT_SOUND_SETTINGS` até a primeira gravação pela tela. |
| Biblioteca de templates | `src/features/sound-settings/engine/soundTemplates.ts` — `SOUND_TEMPLATES` / `SOUND_TEMPLATE_LIST`, 8 presets sintetizados via Web Audio (nenhum arquivo de áudio). |
| Catálogo de eventos | `src/features/sound-settings/engine/soundEvents.ts` — `SOUND_EVENTS` (4 eventos) + `resolveEventConfig(settings, eventId)` (fallback para default em settings ausente/evento ausente/templateId inválido/volume fora de faixa). |
| Player central | `src/features/sound-settings/lib/soundPlayer.ts` — `createSoundPlayer()` gerencia um `AudioContext` reutilizado, `unlock()` e `play(eventId, settings)` / `playTemplate(templateId, volume)`. Nunca lança (silencioso se Web Audio indisponível). |
| Hook de consumo | `src/features/sound-settings/hooks/useSoundEventPlayer.ts` — wrapper React: lê `settings.sound` da loja atual e devolve `play(eventId)`. |
| Tela Owner-only | `src/features/sound-settings/pages/SoundSettingsPage.tsx` — rota `/app/configuracoes/sons` (`src/routes/app.configuracoes.sons.tsx`, `requireAuth(..., ["Owner"])`). Registrada em `SettingsLayout.tsx`, grupo **Operação**, item **"Sons de notificação"** (`roles: ["Owner"]`). |
| i18n | `src/features/sound-settings/i18n/pt-BR.ts`. |
| Infra compartilhada | `src/shared/hooks/useAudioUnlock.ts` (movido de `features/session-timeout/hooks/`, reusado pelos 3 consumidores para destravar o `AudioContext` no primeiro gesto do usuário). |

### Os 4 eventos configuráveis

| `SoundEventId` | Rótulo na tela | Disparado por | Default |
| --- | --- | --- | --- |
| `updateAvailable` | Atualização disponível | `VersionUpdatePrompt.tsx` quando o card de nova versão aparece | Marimba, vol. 0.7 |
| `inboxAssignedMine` | Mensagem na minha conversa | `useInboxActivityMonitor` (Realtime) — mensagem nova numa conversa já minha | Clássico curto, vol. 0.5 |
| `inboxNewInQueue` | Novo cliente na fila | `useInboxActivityMonitor` (Realtime) — conversa nova sem dono | Clássico fila, vol. 0.6 |
| `sessionTimeout` | Aviso de inatividade | `useSessionTimeout` durante a contagem regressiva antes do logout automático | Clássico curto, vol. 0.6 |

### Os 8 templates de som

`marimba` (padrão de atualização), `diesel` (ignição, on-brand), `buzina` (buzina de
estrada), `sino` (sino premium com eco), `powerup` (arpejo de videogame), `fanfarra`
(mini fanfarra), `classic-short` (1 tom curto — bip antigo da Inbox `assigned-mine`) e
`classic-queue` (2 tons — bip antigo da Inbox `new-in-queue`). Todos 100% sintetizados
(sem upload de arquivo).

## Comportamento por evento (por-loja, sem override individual)

Cada evento tem `enabled` (switch), `templateId` (select) e `volume` (slider 0–1,
passo 0.05) editáveis pelo Owner na tela. O botão **Testar** toca o template
selecionado no volume do rascunho (sem salvar) via `createSoundPlayer().playTemplate()`.
Salvar grava `update({ sound: draft }, "settings.sound.update")` e invalida a query
`["settings", storeId]`.

Removido nesta entrega: o ícone de som da TopBar (`SoundAlertToggle`) e a
preferência por-navegador (`soundAlertPreferencesStore`) — a central por-loja é agora
a única fonte. Na tela de Sessão (`SessionSettingsPage`), os controles antigos de som
("Emitir beeps" + slider de intensidade) foram removidos e substituídos por um link
para `/app/configuracoes/sons`; os **tempos** de idle/aviso continuam lá (não fazem
parte da central de sons).

## Checklist de smoke manual (o dono ouve)

Áudio não é unit-testável de forma útil — as verificações a seguir precisam ser
feitas manualmente, ouvindo o resultado:

- [ ] Acessar `Configurações → Operação → Sons de notificação` logado como **Owner**:
      a tela aparece, e cada um dos 4 eventos mostra switch, select de som, slider de
      volume e botão **Testar**.
- [ ] Clicar em **Testar** num evento: toca o template selecionado, no volume
      selecionado (testar em volumes bem diferentes, ex. 0.1 vs 1.0, para confirmar
      que o slider realmente afeta o volume ouvido).
- [ ] Trocar o som/volume de um evento, **Salvar alterações**, recarregar a página
      (F5): a escolha persiste (não volta ao default).
- [ ] Deslogar e entrar com um usuário **não-Owner** (ex. Vendedor): acessar
      `/app/configuracoes/sons` diretamente pela URL deve **bloquear** (redirect/erro
      de permissão), e o item não aparece no menu de Configurações.
- [ ] Confirmar que o **ícone de som sumiu da TopBar** (não há mais toggle de som
      por-navegador).
- [ ] Abrir `Configurações → Sessão`: não há mais os controles de som antigos
      ("Emitir beeps"/intensidade); há um link de texto para "Sons de notificação"
      apontando para a central.

## Fora de escopo (YAGNI, por decisão do plano §10)

- Preferência por-usuário / override individual de som (a central é 100% por-loja).
- Upload de arquivo de áudio próprio — a central é 100% síntese Web Audio.
- Novos eventos sonoros além dos 4 atuais (a arquitetura suporta adicionar mais,
  mas não foi feito agora).
- Remoção física dos campos legados `soundEnabled`/`soundVolume` de
  `ISessionTimeoutSettings` (deprecados, não lidos/escritos para som; cleanup físico
  fica para depois).
