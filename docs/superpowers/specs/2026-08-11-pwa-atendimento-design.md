# GALLO Atendimento — PWA de conversas

> Spec de design · 11/08/2026 · origem: `ui_kits/pwa-atendimento/` no projeto
> claude.ai/design "GALLO Base Diesel — Design System" (`0dddcf0e-782d-4f2e-be6c-0a094c427bbe`).

## 1. O que é

App mobile instalável, **só de troca de mensagens**, para quem acompanha o atendimento fora
do balcão. Recorte herdado do kit: sem fila/assumir, sem transferência, sem tags, sem notas
internas, sem templates HSM. Quem usa é o gestor que responde eventualmente — não o atendente
que vive na Inbox de desktop.

Vive em `/atendimento`, uma árvore de rotas própria: fora do shell do SaaS (`/app/*`) e fora
do PWA do vendedor externo (`/pwa/*`), que tem outra função, outra navegação e uma auth mock
que não serve para conversa real sob RLS.

## 2. Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Rota | `/atendimento`, árvore própria | app distinto, com nav e auth próprias |
| Dados | Provider Pattern, dados reais | é app de produção, não vitrine |
| Auth | tela própria + `signInWithPassword` real | estética mobile do kit, sessão do SaaS |
| Tema | escuro fixo, só tokens semânticos | o kit só existe no escuro; hex nunca entra no código |
| Push | caminho próprio e enxuto | PRD-141 (dispatch) não existe — ver §7 |

## 3. Rotas

```
src/routes/
  atendimento.tsx                       shell: modo escuro, manifest, theme-color,
                                        safe-area, splash na primeira montagem
  atendimento.index.tsx                 redirect → conversas | entrar
  atendimento.instalar.tsx              "adicionar à tela de início" (3 passos)
  atendimento.entrar.tsx                login + desafio TOTP
  atendimento.conversas.tsx             lista, busca, filtros
  atendimento.espera.tsx                fila por tempo de espera + contadores
  atendimento.conversa.$id.tsx          thread + composer
  atendimento.conversa.$id.midias.tsx   grade de mídias
```

Splash e as seis folhas (Conta, Status, Anexar, Enviar produto, Mais ações, Notificações) são
overlays, não rotas — como no kit. A barra inferior de duas abas (Conversas · Espera) aparece
só nas duas listas.

`atendimento.tsx` roda um guard: sem sessão → `/atendimento/entrar`. Com sessão e sem push
decidido → soft-ask depois do primeiro carregamento da lista.

## 4. Feature folder

```
src/features/pwa-atendimento/
  components/   primitivas do kit traduzidas para tokens
  pages/        uma página por rota
  hooks/        usePwaConversations, usePwaThread, usePushSubscription,
                useNotificationPrefs, useInstallPrompt, useOnlineStatus
  engine/       regras puras, testadas no Vitest
  i18n/pt-BR.ts textos
  index.ts      barrel
```

`engine/` recebe o que é regra e não pintura:

- `queueOrder.ts` — ordenação da espera e os três contadores (>30 min, >10 min, na espera);
- `pwaFilters.ts` — composição dos filtros, incluindo a regra de que **a busca ignora os
  demais filtros** (mesmo comportamento da Inbox de desktop);
- `pushOptIn.ts` — elegibilidade do soft-ask e cooldown de 14 dias após recusa.

## 5. Dados

Nada de `src/mocks/`. Tudo via `@/providers/data` e pelos hooks que a Inbox já usa:

| Tela | Origem |
|---|---|
| Conversas | `useConversationsList` (paginação, realtime, `markItemRead`) |
| Identidade e prévia da linha | `useRelatedEntities` (contatos + últimas mensagens da página) |
| Espera | mesma lista, ordenada por `queuedAt`, com `useTimeTick` |
| Semáforo | `engine/waitTime.ts` — `waitSeverity` / `formatWaitTime`, 10 min e 30 min |
| Conversa | `useMessages` dentro de `<ConversationProvider>` |
| Envio | `useMessageSend` (funciona sem adaptação dentro do provider acima) |
| Ticks | `utils/messageDisplay.statusVisual` |
| Status | `useConversationStatusActions` |
| Mídias | `useConversationMessageMedia` |
| Nota de voz | `useAudioRecorder` + `useAttachmentUpload` |
| Enviar produto | `features/part-lookup` (consultor de peças) + `partInsertText` |

O kit desenha `assignee`, `preview` e `phone` direto na conversa; no domínio real esses campos
não moram em `IConversation` — vêm de `useRelatedEntities` e do fiche. A tradução acontece numa
camada de view-model dentro de `hooks/usePwaConversations.ts`, não espalhada pelos componentes.

## 6. Tema

A rota fixa `data-mode="dark"` + classe `.dark` no `<html>` enquanto montada, e restaura o valor
anterior ao sair. Essa é a mecânica real do projeto — `data-theme` é a dimensão de submarca, não
de claro/escuro.

Mapa do kit para tokens semânticos:

| Kit | Token |
|---|---|
| ouro `#C79C2C` (ação primária, régua da bolha de saída) | `primary` |
| fundo `#141011`, painel, card | `background`, `card`, `popover` |
| papel `#ECEDEE` (bolha de entrada) | `card` invertido via `foreground`/`background` do balão |
| verde de resolvida | `severity-success` |
| âmbar de 10 min | `severity-warning` |
| vermelho de 30 min e de falha | `severity-critical` |
| azul do tick "lida" | o mesmo do desktop (`statusVisual`) |

Nenhum `--gallo-*` e nenhum hex do kit entra no código.

## 7. Push web

`docs/prds/PRD-145-push-web.md` existe e está **pendente**, e depende do PRD-141 (dispatch +
deliveries), que também não existe — não há `_shared/channels/` nas Edge Functions. Construir o
dispatch genérico antes dobraria a entrega, então este PR abre um caminho próprio, estreito e
desenhado para o PRD-141/171 absorver depois.

- **Schema** — `public.push_subscriptions` (`recipient_id`, `recipient_type`, `endpoint` único,
  `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`). RLS: o dono gerencia as
  próprias; o envio usa `service_role`.
- **Envio** — Edge Function `push-dispatch`: VAPID JWT + payload AES128GCM, ≤3 KB. `410`/`404`
  apaga a subscription na hora, com trilha de auditoria.
- **Gatilho** — trigger em `messages` (inbound) → `pg_net` → `push-dispatch`. Deliberadamente
  **não** altera `waha-webhook`/`whatsapp-webhook`, que estão em produção; o repositório já usa
  esse padrão de trigger em quatro migrations.
- **Service worker** — dois handlers aditivos no `public/sw.js` existente (`push`,
  `notificationclick`, que foca a aba aberta ou abre `/atendimento/conversa/<id>`), com bump do
  `CACHE_VERSION`.
- **Manifest** — `/atendimento.webmanifest` próprio (`scope` e `start_url` em `/atendimento`);
  o atual é do "GALLO Vendedor", escopo `/pwa`. A rota troca o `<link rel="manifest">` em runtime.
- **Permissão** — soft-ask depois do login, nunca no load; `requestPermission` só sob gesto do
  usuário; recusa gera cooldown de 14 dias em `localStorage`; quando o browser bloqueia, as
  preferências mostram como desbloquear.

**Fora do alcance deste PR, dependem do dono:** gerar e guardar a chave VAPID no Vault, aplicar
a migration e deployar a Edge Function. O PR entrega o código; a aplicação em produção é manual
e exige OK explícito.

iOS só entrega push a PWA **instalado** — é o motivo de a tela de instalação vir antes do login.

## 8. Divergências herdadas do kit

Ficam como estão, foram escolhas do dono na revisão do kit:

- `em_andamento` é branco, não ouro — o ouro fica reservado à ação primária;
- sem emoji nas prévias: ícone + rótulo;
- bolhas quadradas (raio 3px) com régua de cor: entrada em papel com régua grafite à esquerda,
  saída em grafite com régua ouro à direita;
- conta e sair no avatar do cabeçalho, não numa aba.

O kit usa placeholders listrados no lugar de foto. No app real as imagens vêm das mensagens, então
o placeholder some — sobra só como estado de carregamento e de mídia expirada.

## 9. Fases

1. Shell, tema, rotas, splash e tela de instalação
2. Login real com desafio TOTP
3. Conversas e Espera
4. Conversa: bolhas, composer, nota de voz, produto, mídias
5. Offline, faixa heads-up in-app e preferências de notificação
6. Push web ponta a ponta (código; aplicação gated)
7. Testes, changelog e bump

## 10. O que fica de fora

Assumir conversa, transferir, tags, notas internas, templates HSM, copiloto, ficha do cliente
completa e push para cliente final (loja/portal). Todos existem no desktop e continuam lá — o
recorte deste app é troca de mensagens.
