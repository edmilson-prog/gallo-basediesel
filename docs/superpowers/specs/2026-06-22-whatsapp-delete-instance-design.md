# Excluir instância de WhatsApp — Design

> Data: 2026-06-22 · Feature: `feat/whatsapp-delete-instance` · Escopo: A (bloquear se houver histórico)

## Problema

A tela **Configurações → WhatsApp** (`WhatsAppAccountsPage`) permite criar, editar,
conectar e desconectar contas/instâncias de WhatsApp, mas **não permite excluir**.
Ao criar uma instância de teste (ex.: "Comercial Lucas II"), o usuário fica sem
forma de removê-la — nem da plataforma, nem do servidor Evolution. A memória do
projeto já registrava isso ("plataforma não tem exclusão de conta").

## Comportamento (escopo A)

Exclusão **real e guardada**: remove a instância no servidor Evolution **e** apaga
a linha da conta no banco. A guarda decide o caminho:

- **Instância vazia** (0 conversas vinculadas **e** 0 templates vinculados) → pode
  ser excluída.
- **Instância com histórico** → **bloqueada**. A UI explica o motivo (mostra as
  contagens) e oferece **"Desconectar"** como alternativa, que preserva o
  histórico.

A guarda é verificada **no servidor** (Edge Function), não apenas na UI — assim é
à prova de corrida (algo pode chegar entre o preflight e a confirmação).

### Fora de escopo (decisão do dono)

- **Arquivar** contas mortas que têm histórico (ex.: "GALLO Matriz (Oficial)").
  Não nesta entrega.
- **Exclusão forçada** que apague conversas/mensagens vinculadas. Rejeitada por ser
  destrutiva e irreversível.
- Soft-delete (coluna `deleted_at`) — desnecessário no escopo A.

## Fluxo do usuário (UI)

A fileira de 6 botões do card já está cheia de ações operacionais e frequentes
(Verificar, Mensagem de teste, Importar, Sincronizar fotos, Conectar, Editar). Uma
ação rara e destrutiva **não** entra nessa fileira.

1. **Kebab `⋮`** (`DropdownMenu`) no canto superior direito do card, depois dos
   badges de status/saúde. Item **"Excluir instância"** com estilo destrutivo
   (`text-destructive`), ícone de lixeira, separado por divisória. Vira a casa
   natural de ações raras futuras (renomear, ver auditoria etc.).
2. Clicar roda um **preflight** (no servidor) e o diálogo se ramifica:
   - **Deletável** → `AlertDialog` destrutivo **simples** (sem "digite o nome": a
     guarda server-side já garante que só instâncias vazias chegam aqui). Conteúdo:
     - Título: `Excluir a instância "{label}"?` + subtítulo mudo `{phoneNumber} · {PROVIDER}`.
     - "O que será removido" (lista, adaptada por provider): instância no Evolution
       (`{instanceName}`) desconectada e apagada; cadastro da conta; configurações
       de acesso, cor e failover.
     - Tranquilização: `Conversas vinculadas: 0 · Templates: 0`.
     - Irreversibilidade: `Esta ação é permanente e não pode ser desfeita.`
     - Botões: `Cancelar` (foco inicial) + `Excluir instância` (variant destructive).
   - **Bloqueado** → diálogo **explicativo** (não destrutivo) com as contagens
     (mostra só as > 0) e CTA primário **"Desconectar"** → reaproveita o fluxo
     `openConnect`/logout existente. Botão secundário `Fechar`.
3. **Aviso de failover**: se outra(s) conta(s) usam esta como reserva
   (`failover_account_id` aponta para ela), um callout `severity-warning` **dentro**
   do diálogo de exclusão nomeia as dependentes e avisa que o failover será
   desativado nelas. Informa, **não bloqueia**. Toast pós-exclusão lembra de revisar.
4. **Feedback**: spinner `Excluindo…` no botão (idiom existente), `toast.success` /
   `toast.error` em pt-BR, mensagem distinta para o erro de corrida
   (`A instância recebeu novos dados e não pode mais ser excluída.`), e `refresh()`
   da lista ao final.
5. **A11y**: usar `AlertDialog` (role=alertdialog, focus trap), foco inicial em
   **Cancelar**, e renderizar o diálogo **no nível da página** via estado
   `deleteTarget` (padrão já usado por `connectTarget`/`testTarget`/`importTarget`)
   para não aninhar o dialog dentro do menu item (preserva o retorno de foco ao
   kebab).

## Arquitetura técnica

Segue o padrão dos vizinhos Evolution: as operações de conexão (`connect`,
`logout`, `restart`, `test`) já vivem em `whatsappConnect.ts` (client API) +
Edge Function `whatsapp-connect`, **não** no provider de dados. A exclusão é uma
operação de teardown Evolution + remoção da conta, então segue essa mesma família.

**Não há migration**: a policy RLS de DELETE em `whatsapp_accounts` já existe
(staff + mesma loja); o DELETE da linha é feito pelo `service_role` na Edge (a
autorização é garantida pelo gate `requireCaller` + checagem de loja).

### Componentes

1. **Camada Evolution** — `src/providers/whatsapp/evolution/instance.ts`
   - Nova função `deleteInstance(apiKey, deps, target, traceId?)` →
     `DELETE /instance/delete/{instanceName}` (espelha `logoutInstance`).
   - ⚠️ Regra: mudou `src/providers/whatsapp/` ⇒ rodar `scripts/sync-whatsapp-shared.ts`
     (atualiza o espelho `supabase/functions/_shared/whatsapp/`) + redeploy.

2. **Edge Function** — `supabase/functions/whatsapp-connect/index.ts`
   - Nova ação `delete` (adicionada ao `ACTIONS`) com flag `dryRun`.
   - Gate: `requireCaller(req, STAFF_ROLES)` + a conta tem de pertencer à loja do
     caller (owner cross-store; gestor store-scoped) — padrão existente.
   - **Preflight (`dryRun: true`)**: conta `conversations` e `message_templates`
     vinculados (via `count`) e lista dependentes de failover. Retorna
     `{ deletable, conversationCount, templateCount, failoverDependents }`. Sem mutação.
   - **Execução (`dryRun` ausente/false)**: re-checa as contagens (race-safe); se
     > 0 → erro `HAS_LINKED_DATA` (HTTP 422) com as contagens. Se 0:
     1. **Desativa o failover das dependentes** antes do delete: `UPDATE` set
        `failover_policy='disabled'`, `failover_account_id=NULL`,
        `is_failover_active=false` em toda conta com `failover_account_id = id`.
        Necessário porque a CHECK `whatsapp_accounts_failover_policy_requires_target`
        (`failover_policy = 'disabled' OR failover_account_id IS NOT NULL`)
        violaria com o `ON DELETE SET NULL` se a política não fosse desativada antes.
     2. **Teardown Evolution** (só provider `evolution` com `instanceName`):
        `logout` best-effort → `deleteInstance`. 404/not-found ⇒ segue (já não
        existe). Erro real de servidor ⇒ aborta (mantém a linha; usuário tenta de
        novo). Provider `meta` não tem lado Evolution → pula.
     3. **DELETE da linha** via `service_role` (cascata em
        `whatsapp_account_access_rules`; self-ref `failover_account_id` SET NULL).
     4. **Audita** `whatsapp_account_deleted` (snapshot em `before`: label,
        instanceName, phoneNumber, provider).
     5. Retorna `{ ok: true, traceId }`.

3. **Client API** — `src/features/admin-settings/api/whatsappConnect.ts`
   - `preflightDeleteEvolution(accountId): Promise<IDeletePreflight>`
   - `deleteEvolutionInstance(accountId): Promise<void>`
   - Mapear `HAS_LINKED_DATA` em `CONNECT_ERROR_MESSAGES` (pt-BR).

4. **UI** — `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`
   - Kebab `⋮` no header do card; estado `deleteTarget`.
   - Componente `DeleteInstanceDialog` (novo, em `components/`): roda o preflight no
     open e auto-ramifica deletável/bloqueado; spinner; toasts; `refresh()` no fim.

## Segurança e guardas

- **Autorização**: staff-only (owner + gestor), mesma loja — consistente com a
  escrita de contas que já existe (`whatsapp_accounts_*` policies `is_staff()`).
- **Guarda de histórico**: verificada no servidor, re-checada na execução
  (race-safe). A UI só pré-exibe.
- **CHECK de failover**: dependentes têm o failover desativado antes do delete.
- **Teardown ordenado**: Evolution primeiro, depois a linha. Falha de servidor no
  Evolution aborta sem orfanizar a linha.
- **Não é fronteira de segurança nova**: RLS/Auth seguem governando; a Edge usa
  `service_role` apenas após o gate.

## Testes e gates

- **TDD** na função pura `deleteInstance` (método HTTP / URL / headers / traceId),
  espelhando `instance.test.ts`.
- Teste do mapeamento `HAS_LINKED_DATA` → mensagem pt-BR.
- Gates: `bun run test` (Vitest) + `bun run build` (Vite). `tsc` tem baseline de
  erros pré-existentes — avaliar apenas o delta dos arquivos novos.

## Deploy

- **Frontend + fonte da Edge + migration** num PR (sem merge sem autorização do dono).
- **Aplicar a migration `20260622120000_whatsapp_delete_account_rpc.sql` em produção**
  e **redeploy da Edge `whatsapp-connect`** — passos separados, executados **somente
  com OK explícito** do dono (regra: confirmar migration/deploy em prod). Os dois
  vão juntos: a Edge chama o RPC `delete_whatsapp_account`, que só existe após a migration.

---

## Revisão adversarial (2026-06-22) — mudanças sobre o design original

Uma revisão multi-agente encontrou bugs reais de correção no primeiro recorte
(handler `delete` multi-passo na Edge). As correções aplicadas:

- **Atomicidade (era o ponto mais grave):** a exclusão virou um **RPC
  `delete_whatsapp_account(uuid)` SECURITY DEFINER** que, em **uma transação**,
  re-checa vínculos → desabilita o failover das dependentes → deleta a linha. Isso
  elimina três defeitos do recorte inline: (a) `countLinkedData`/`findFailoverDependents`
  **falhavam ABERTO** (query transitória → `count null ?? 0` → `deletable=true`); (b)
  o failover das dependentes ficava **órfão sem rollback** se um passo posterior
  falhasse; (c) a ordem teardown-antes-do-DELETE permitia **conta meio-excluída**
  (instância Evolution destruída, linha presa por FK numa corrida com o webhook).
- **Ordem invertida:** o **DELETE (RPC) roda ANTES** do teardown Evolution. O teardown
  virou **best-effort puro** (loga e segue): com a linha já removida, o pior caso é
  uma instância órfã no servidor Evolution (logada), nunca uma conta quebrada.
- **Fail-closed no preflight:** `countLinkedData` lança em erro de query (não mascara
  como 0). Dependentes seguem cosméticos (só o aviso do dryRun).
- **Owner-only:** o handler `delete` exige `caller.role === "owner"` (a rota da tela
  já é Owner-only). Isso também fecha os achados cross-store (um gestor não alcança
  mais o delete).
- **Auditoria exata:** o RPC retorna `boolean` (linha removida?); a auditoria só grava
  quando `true` (evita duplicata em corrida de exclusão concorrente).
- **UI:** o CTA "Desconectar" do estado bloqueado só aparece para conta **Evolution
  conectada** (Meta e desconectada levariam a um dead-end de QR); foco a11y restaurado
  para o container da página após a exclusão.

### Lows conhecidos e aceitos (documentados, não corrigidos)

- **Failover cross-store** no RPC (UPDATE sem filtro de loja): **latente** — hoje há
  loja única e o delete é owner-only (owner é cross-store por design). Reavaliar ao
  habilitar multi-loja real.
- **Auditoria sem `actorId`:** se o caller staff não tiver `seller_id` vinculado, a
  exclusão ocorre sem trilha (padrão herdado de `bestEffortAudit`, que pula em
  `actor_id` nulo por causa do FK NOT NULL → sellers). O owner real tem seller.
- **Snapshot de `deleteTarget`:** o dialog mostra label/instanceName capturados na
  abertura; a exclusão é por `id` (sempre correta), só o texto pode ficar defasado se
  a conta for renomeada em outra aba enquanto o dialog está aberto.
