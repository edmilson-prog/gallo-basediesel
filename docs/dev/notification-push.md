# Web Push — notificação com o app fechado

Fatia mínima do PRD-145, entregue junto com o PWA de atendimento (`/atendimento`).
Cobre **apenas** o caso "chegou mensagem numa conversa que é sua". O canal genérico de
notificações (PRD-141: dispatch, deliveries, matriz de roteamento por severidade) continua
pendente — este caminho foi desenhado para ser absorvido por ele, não para substituí-lo.

## Peças

| Peça                           | Onde                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| Tabela de assinaturas          | `supabase/migrations/20260811160000_push_subscriptions.sql`    |
| Gatilho na chegada da mensagem | `supabase/migrations/20260811160100_messages_push_trigger.sql` |
| Envio (VAPID + AES128GCM)      | `supabase/functions/_shared/webpush.ts`                        |
| Função de despacho             | `supabase/functions/push-dispatch/index.ts`                    |
| Handlers do service worker     | `public/sw.js` (`push`, `notificationclick`)                   |
| Registro no navegador          | `src/features/pwa-atendimento/hooks/usePushSubscription.ts`    |
| Momento do pedido de permissão | `src/features/pwa-atendimento/engine/pushOptIn.ts`             |
| Resolução do destinatário      | `supabase/functions/push-dispatch/recipient.ts`                |

## Caminho de uma notificação

```
cliente manda mensagem
  → webhook grava em public.messages
  → trigger messages_push_dispatch (só direction = 'in')
  → pg_net POST /functions/v1/push-dispatch   (fire-and-forget)
  → push-dispatch:
       conversa tem responsável?  não → ignora (ver "Fila", abaixo)
       login do responsável:      profiles.seller_id → sellers.auth_user_id
                                  nenhum dos dois → ignora (ver "O incidente do vínculo")
       assinaturas do responsável → nenhuma → NO_SUBSCRIPTION
       para cada endpoint: VAPID JWT + payload cifrado → push service
         2xx      → last_used_at atualizado
         404/410  → linha apagada na hora
  → service worker exibe a notificação
  → toque foca a aba aberta ou abre /atendimento/conversa/<id>
```

O gatilho é **downstream da escrita**: nada no caminho de push pode atrasar ou derrubar a
ingestão de mensagem. Por isso ele não vive dentro de `waha-webhook`/`whatsapp-webhook`.

## Antes de ligar

Três coisas dependem do dono e **não** acontecem ao mergear o PR:

1. **Gerar o par VAPID e o segredo do worker.** ⚠️ **Cada segredo mora num lugar diferente, e
   confundir isso custou quatro rodadas de verificação:**

   | Segredo                       | Onde                             | Por quê                                                                                               |
   | ----------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
   | `VAPID_PRIVATE_KEY`           | Supabase → Edge Function Secrets | o Deno lê do env; o resolvedor é Vault-first com fallback pra env                                     |
   | `VAPID_PUBLIC_KEY`            | Supabase → Edge Function Secrets | idem                                                                                                  |
   | `VAPID_SUBJECT`               | Supabase → Edge Function Secrets | opcional; default `mailto:suporte@gallobasediesel.com.br`                                             |
   | `VITE_VAPID_PUBLIC_KEY`       | **Vercel**, Production           | o prefixo `VITE_` só existe para o Vite; no Supabase é inerte. Exige redeploy — o Vite grava no build |
   | `PUSH_DISPATCH_WORKER_SECRET` | **Vault**, obrigatoriamente      | o guard do gatilho roda em SQL (`integration_secret_get`) e **não tem fallback pra env**              |

   Gerar o segredo do worker dentro do banco é o caminho mais limpo:
   `select encode(gen_random_bytes(32), 'hex');` — pgcrypto está instalado.

   Chave privada: escalar de 32 bytes em base64url. Pública: ponto não comprimido de 65 bytes
   em base64url. Par trocado só aparece na **entrega** (o serviço devolve 403), nunca antes.

2. **Publicar a chave pública no build**: `VITE_VAPID_PUBLIC_KEY` no ambiente da Vercel.
   Sem ela o app ainda pede permissão (para capturar a resposta do sistema), mas não
   registra endpoint nenhum.

   > Como provar sem ver o valor: se a variável não existir no build, o Vite troca por
   > `undefined`, o `if (!vapidKey)` vira sempre verdadeiro e o minificador **elimina como
   > código morto** o `pushManager.subscribe` — somem `applicationServerKey`,
   > `userVisibleOnly` e `onConflict` do chunk. A presença desses símbolos prova que a chave
   > entrou. Dá para confrontar os dois lados comparando o SHA256 do valor extraído do bundle
   > com o digest que o painel de Edge Secrets mostra.

3. **Aplicar as migrations e deployar a função**, nesta ordem:
   ```
   # 1. schema
   supabase/migrations/20260811160000_push_subscriptions.sql
   # 2. função  — a flag NÃO é opcional (ver abaixo)
   npx supabase functions deploy push-dispatch --no-verify-jwt
   # 3. só então o gatilho
   supabase/migrations/20260811160100_messages_push_trigger.sql
   ```
   O gatilho é seguro fora de ordem — ele desiste em silêncio enquanto o segredo não existe
   no Vault —, mas a ordem acima evita ruído de 401 no log.

⚠️ **`--no-verify-jwt` é obrigatório.** O gatilho manda apenas `x-worker-secret`, sem
`Authorization`. Com `verify_jwt` ligado o gateway rejeita **antes** de o código rodar, e o
sintoma é um 401 que parece erro de segredo. A função faz a própria autenticação com compare de
tempo constante (`_shared/workerAuth.ts`). Mesmo padrão de `sdr-respond`,
`scheduled-send-worker`, `*-tick` e dos webhooks.

### Deploy sem a CLI

Se a máquina não tiver `supabase/config.toml` nem `SUPABASE_ACCESS_TOKEN`, `npx supabase
functions deploy` exigiria login interativo. Alternativa pelo MCP:

1. `get_edge_function('push-dispatch')` → devolve o **layout exato** de arquivos do deploy atual
   (no último: 11 arquivos — a função + `_shared`);
2. `deploy_edge_function` com **todos** os arquivos relativos e
   **`verify_jwt: false` explícito** — o default do MCP é `true` e quebraria o gatilho;
3. confirme depois: `curl` sem segredo deve devolver `401 {"error":"unauthorized"}` — essa
   mensagem é do **nosso** código, o que prova que o gateway deixou passar.

## Rotação da chave VAPID

Trocar o par **invalida todas as assinaturas existentes**: cada dispositivo precisa aceitar
de novo. É um evento raro e consciente. O roteiro:

1. gerar o novo par e gravar no Vault;
2. publicar a nova `VITE_VAPID_PUBLIC_KEY` e fazer o deploy do front;
3. `delete from public.push_subscriptions;` — as linhas antigas só produziriam entrega
   fantasma;
4. avisar a equipe que o aviso volta a pedir permissão.

## Permissão é capital

O pedido nunca aparece no carregamento. A regra está em `engine/pushOptIn.ts` e é testada:

- só quando o navegador ainda não decidiu (`permission === "default"`);
- `requestPermission` só sob toque do usuário, depois do aviso suave;
- recusa grava um carimbo e compra **14 dias** de silêncio;
- "Bloquear" do navegador é irreversível do nosso lado — a folha de notificações passa a
  explicar como desbloquear nas configurações do site.

## Fila: por que ninguém é avisado

Conversa sem responsável **não** dispara push. Avisar todo mundo da loja a cada mensagem no
pool é a mesma forma do incidente de disparo em massa do SDR. Ligar isso exige decisão
explícita do dono e, provavelmente, um limite por janela de tempo — não é um `if` a menos.

## O incidente do vínculo (12/08/2026) — leia antes de duvidar da criptografia

Por semanas o push esteve **inerte para a equipe inteira** e nada avisava.

`push-dispatch` resolvia o login do atendente por `sellers.auth_user_id`. Medido em produção:
dos 8 vendedores ativos, **só `admin@ailainteligente.com` tinha a coluna preenchida**. Todos os
atendentes reais estavam nulos — inclusive o que segurava 619 conversas abertas — enquanto
`profiles.seller_id` apontava certo o tempo todo. Toda conversa atribuída a uma pessoa caía no
`skipped: "assignee has no login"` **antes** de a função sequer consultar `push_subscriptions`.

Pior: o primeiro teste de entrega que passou (`{"sent":1}`) rodou numa conversa do **admin** — o
único vendedor para quem o caminho podia funcionar. O verde escondeu a falha.

Corrigido em duas metades, porque cada uma sozinha deixa uma armadilha:

- **dado** — `20260811230000_backfill_sellers_auth_user_id.sql`, backfill a partir de `profiles`;
- **código** — `recipient.ts` pergunta ao `profiles` primeiro e mantém a coluna como fallback.

⚠️ **Ao criar ou re-vincular um usuário, mantenha as duas direções em dia.** O app mantém
`profiles.seller_id`; `sellers.auth_user_id` é espelho reverso e nada o sincroniza sozinho.
Em 12/08/2026 os **7 vendedores ativos** estão vinculados. Vendedor inativo pode ficar sem
vínculo sem prejuízo — não recebe push porque não atende.

⚠️ **Mas desativar um vendedor não redistribui as conversas dele.** Hoje há 84 conversas
abertas atribuídas a um vendedor `active = false`: ninguém é notificado e ninguém está
atendendo. Ao desligar alguém, transfira a carteira e as conversas abertas antes.

## iOS

O iPhone só entrega push a PWA **instalado** na tela de início, e a instalação confiável sai do
**Safari**. Aba aberta, em qualquer navegador, não tem `PushManager`. As regras completas —
incluindo por que trocar manifest por script não funciona no WebKit e por que a permissão tem
que ser pedida antes de qualquer `await` — estão em **`docs/dev/pwa-apps.md`**.

Estado em 12/08/2026: entrega confirmada no iPhone do dono via `web.push.apple.com`
(`{"sent":1,"expired":0,"failed":0}`), além do FCM no desktop. Os dois serviços aceitam o mesmo
par VAPID.

## Disparar um push de teste sem tocar em dado nem ver segredo

Dá para exercitar a cadeia inteira a partir do SQL, do mesmo jeito que o gatilho faz — o
segredo nunca sai do banco:

```sql
select net.http_post(
  url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/push-dispatch',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-worker-secret', public.integration_secret_get('PUSH_DISPATCH_WORKER_SECRET')
  ),
  body := jsonb_build_object('messageId', '<uuid>', 'conversationId', '<uuid>'),
  timeout_milliseconds := 15000
) as request_id;

-- pg_net é assíncrono: a resposta chega depois
select status_code, content, error_msg from net._http_response where id = <request_id>;
```

Use uma mensagem `direction = 'in'` **real**, de conversa aberta e atribuída a quem você quer
notificar. Como ler o resultado:

| Resposta                              | Significa                                                          |
| ------------------------------------- | ------------------------------------------------------------------ |
| `{"sent":1,...}`                      | entrega aceita pelo serviço de push — a cadeia inteira funcionou   |
| `{"skipped":"NO_SUBSCRIPTION"}`       | roteamento OK; falta o aparelho se inscrever                       |
| `{"skipped":"assignee has no login"}` | vínculo quebrado — ver "O incidente do vínculo"                    |
| `{"skipped":"pool conversation"}`     | conversa sem responsável, por decisão de segurança                 |
| `401 {"error":"unauthorized"}`        | segredo divergente — mas o gateway deixou passar (`verify_jwt` OK) |
| `503 VAPID keys not provisioned`      | falta chave nos Edge Secrets                                       |

⚠️ **Leia o texto da mensagem antes de disparar.** O corpo vai para a tela de bloqueio, e há
conversas em produção com credencial em texto puro no histórico.

## Roteiro de teste manual

Push real exige navegador de verdade; não há como cobrir isso no Vitest.

1. Abrir `/atendimento` e instalar. **No Android:** Chrome, pela tela de instalação ou pela
   folha de Conta. **No iPhone: obrigatoriamente Safari** → Compartilhar → Adicionar à Tela de
   Início; e apague antes qualquer atalho antigo, porque o atalho fica preso ao que foi
   declarado na instalação. Depois, abra **pelo ícone** — aba de navegador não recebe push.
2. Aceitar o aviso suave e depois o diálogo do sistema.
3. Conferir a linha em `push_subscriptions` (`recipient_id` = `auth.uid()` do usuário).
4. Fechar o app. Mandar uma mensagem de um número cujo atendimento esteja atribuído a esse
   usuário.
5. A notificação deve aparecer com o nome do contato no título; o toque abre a conversa.
6. Repetir com o app aberto em OUTRA conversa — aí a faixa dentro do app é que deve aparecer.
7. Desinstalar o app e mandar outra mensagem: o endpoint responde 410 e a linha some sozinha
   da tabela.
