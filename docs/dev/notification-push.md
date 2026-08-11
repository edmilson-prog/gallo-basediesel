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

## Caminho de uma notificação

```
cliente manda mensagem
  → webhook grava em public.messages
  → trigger messages_push_dispatch (só direction = 'in')
  → pg_net POST /functions/v1/push-dispatch   (fire-and-forget)
  → push-dispatch:
       conversa tem responsável?  não → ignora (ver "Fila", abaixo)
       responsável tem login?     não → ignora
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

1. **Gerar o par VAPID** e guardar no Vault:
   - `VAPID_PRIVATE_KEY` — escalar privado de 32 bytes, base64url
   - `VAPID_PUBLIC_KEY` — ponto público não comprimido de 65 bytes, base64url
   - `VAPID_SUBJECT` — opcional; default `mailto:suporte@gallobasediesel.com.br`
   - `PUSH_DISPATCH_WORKER_SECRET` — segredo compartilhado do gatilho
2. **Publicar a chave pública no build**: `VITE_VAPID_PUBLIC_KEY` no ambiente da Vercel.
   Sem ela o app ainda pede permissão (para capturar a resposta do sistema), mas não
   registra endpoint nenhum.
3. **Aplicar as migrations e deployar a função**, nesta ordem:
   ```
   # 1. schema
   supabase/migrations/20260811160000_push_subscriptions.sql
   # 2. função
   npx supabase functions deploy push-dispatch
   # 3. só então o gatilho
   supabase/migrations/20260811160100_messages_push_trigger.sql
   ```
   O gatilho é seguro fora de ordem — ele desiste em silêncio enquanto o segredo não existe
   no Vault —, mas a ordem acima evita ruído de 401 no log.

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

## iOS

O iPhone só entrega push a PWA **instalado** na tela de início. É por isso que a tela de
instalação vem antes do login no `/atendimento`.

## Roteiro de teste manual

Push real exige navegador de verdade; não há como cobrir isso no Vitest.

1. Abrir `/atendimento` no Chrome Android, instalar pela tela de instalação, entrar.
2. Aceitar o aviso suave e depois o diálogo do sistema.
3. Conferir a linha em `push_subscriptions` (`recipient_id` = `auth.uid()` do usuário).
4. Fechar o app. Mandar uma mensagem de um número cujo atendimento esteja atribuído a esse
   usuário.
5. A notificação deve aparecer com o nome do contato no título; o toque abre a conversa.
6. Repetir com o app aberto em OUTRA conversa — aí a faixa dentro do app é que deve aparecer.
7. Desinstalar o app e mandar outra mensagem: o endpoint responde 410 e a linha some sozinha
   da tabela.
