# Multi-loja — Filosofia e Operação

> **Origem:** PRD-007 (Bloco 0 — Fundação) · **Versão da plataforma:** 0.6.0+
>
> Multi-loja é **transversal**: cada agregado comercial carrega `storeId` e cada
> listagem é filtrada de forma implícita pela loja ativa. Este doc é o mapa
> mental do que está modelado, o que está operando no MVP e o que fica para a
> Fase 2.

---

## TL;DR

- O modelo de dados já trata loja como entidade de primeira classe (`IStore`).
- Toda entidade comercial (cliente, lead, pedido, comissão, …) carrega `storeId`.
- O usuário tem uma **loja ativa** persistida em `localStorage`
  (`gallo-current-store-id`) com fallback para a loja primária.
- O `<StoreSwitcher>` está sempre visível na `<TopBar>`; no MVP só há a matriz,
  então o dropdown mostra 1 item e indica que filiais/parceiras virão na Fase 2.
- A função `withStoreScope()` injeta `storeId = currentStoreId` em toda query
  de listagem dos providers, exceto quando o usuário tem `scope: 'all'` (Owner).
- Todas as mutations `create` preenchem `storeId` automaticamente; `update`
  bloqueia alteração de `storeId` no MVP.

---

## Distinção crítica: modelagem vs operação

| Aspecto                              | MVP (Fase 1)                     | Fase 2                                  |
| ------------------------------------ | -------------------------------- | --------------------------------------- |
| Quantas lojas                        | 1 (matriz)                       | N (matriz + filiais + parceiras)        |
| `IStore` modelado                    | ✅                               | ✅                                      |
| `storeId` em entidades transacionais | ✅ (preenchido sempre)           | ✅                                      |
| Seletor visual (`<StoreSwitcher>`)   | ✅ (dropdown com 1 item)         | ✅ (dropdown com N itens)               |
| Persistência em `localStorage`       | ✅                               | ✅                                      |
| Audit log de troca                   | ✅ (apenas exercitado em testes) | ✅                                      |
| CRUD de lojas via UI                 | ❌                               | ✅                                      |
| Transferência de cliente entre lojas | ❌ (`storeId` imutável)          | ✅ (fluxo dedicado com aprovação)       |
| Consolidação cross-store (BI)        | ❌                               | ✅ (Onda 2 — Visão Executiva, PRD-040)  |
| Supabase RLS por loja                | n/a (mock frontend)              | ✅ (policies espelham `withStoreScope`) |

A filosofia é **"modelar agora, operar depois"**: quando a primeira filial
entrar, a equipe técnica precisa apenas inserir um novo `IStore` + ajustar
`accessibleStoreIds` dos vendedores autorizados. Nenhuma feature precisa ser
refatorada.

---

## Tipos

```typescript
interface IStore {
  id: ID;
  name: string;
  type: "matriz" | "filial" | "parceira";
  address: string;
  cnpj: string;
  settings: IPlatformSettings;
  activeDivisions: Division[]; // MVP: ['parts']
  createdAt: ISO8601;
}

interface ISeller {
  // ... outros campos
  storeId: ID;
  /** Lojas em que o vendedor opera. Omitir = apenas a loja primária. */
  accessibleStoreIds?: ID[];
}
```

| Tipo       | Descrição                                                                |
| ---------- | ------------------------------------------------------------------------ |
| `matriz`   | Sede administrativa, consolida BI cross-store na Onda 2                  |
| `filial`   | Loja própria da rede, mesma razão social ou grupo                        |
| `parceira` | Revendedor autorizado, razão social separada, contrato comercial próprio |

---

## Loja ativa (current store)

```typescript
const { currentStore, accessibleStores, setCurrentStore, canSwitchStore } = useCurrentStore();
```

Resolução, em ordem de preferência:

1. Valor em `localStorage` (`gallo-current-store-id`), **se ainda for acessível**
2. `currentUser.storeId` (loja primária), **se acessível**
3. Primeira loja em `accessibleStores`
4. `null` (sem usuário ou sem lojas)

Trocar loja:

- Valida que a loja está em `accessibleStores` — caso contrário lança `Error`.
- Atualiza estado React + holder externo (`multistoreStore`) + `localStorage`.
- Dispara `auditLog({ action: 'switch_store', before, after })`.

---

## Helpers

### `withStoreScope(params, ctx)`

Adiciona filtro implícito de `storeId` em queries de listagem.

```typescript
function withStoreScope<T extends Record<string, unknown>>(
  params: T,
  context: { user: ISeller | null; currentStoreId: ID | null; resource: ResourceName },
): T & { storeId?: ID };
```

| Caso                                  | Resultado                                       |
| ------------------------------------- | ----------------------------------------------- |
| Usuário não autenticado               | `storeId = '__no_user__'` → listagem vazia      |
| Usuário com `scope: 'all'` no recurso | Params sem filtro extra (cross-store)           |
| Demais usuários                       | `storeId = currentStoreId` (ou sentinela vazio) |

### `getCurrentContext()`

Acesso síncrono ao usuário + loja ativa **fora de componentes React** — usado
pelos mock providers (que executam dentro de selectors). Lê do
`readCurrentUserSync()` e do holder externo `multistoreStore`.

### `getStoreForUser(user)` / `isStoreAccessible(user, storeId)`

- `getStoreForUser`: retorna `user.storeId ?? null`.
- `isStoreAccessible`: respeita `scope: 'all'` → senão `accessibleStoreIds` →
  senão `user.storeId === storeId`. Anônimos sempre `false`.

### `scopedListParams(params, resource)` (interno aos mock providers)

Embrulha `withStoreScope` puxando o contexto via `getCurrentContext()`. Cada
mock provider chama isso em `list()`:

```typescript
list: (params) => customersApi.list(scopedListParams(params, "customer"));
```

### `withCreateStoreId(input)` / `assertImmutableStoreId(before, patch)`

- `withCreateStoreId`: preenche `storeId` na entrada de `create` quando o
  chamador omitir — usa a loja ativa.
- `assertImmutableStoreId`: lança `MockValidationError` quando uma mutação
  `update` tenta alterar `storeId`. No MVP `storeId` é imutável após criação;
  a transferência entre lojas é fluxo dedicado da Fase 2.

---

## UI

### `<StoreSwitcher>`

Componente do TopBar. Sempre visível em qualquer página `/app/*` para usuários
autenticados. Hidden no `<LojaHeader>` (vitrine pública).

- Trigger: nome curto + `<StoreBadge type>` + chevron.
- Dropdown: lista de `accessibleStores`, marcando a ativa.
- `canSwitchStore` é `false` quando há apenas 1 loja → cursor `default`, sem
  hover, mostra mensagem "Filiais e parceiras serão habilitadas na Fase 2".
- Erros em `setCurrentStore` viram toast (sonner).

### `<StoreBadge store>`

Pill compacta com a cor associada ao tipo (`matriz`/`filial`/`parceira`),
montada sobre tokens semânticos (`bg-primary/10`, `bg-accent`, `bg-muted`) para
se adaptar aos temas GALLO.

### `/app/configuracoes/lojas`

Página read-only protegida por `requireAuth(..., { resource: 'store', action: 'view' })`
— acessível a Owner, Gestor (`scope: 'own'`) e Financeiro. Mostra um card por
loja acessível com CNPJ, endereço, divisões ativas, número de vendedores e
clientes. Sem CRUD: rótulo "Somente leitura · gestão na Fase 2".

---

## Integração com RBAC

`withStoreScope` consulta `hasPermission(user, resource, 'view', 'all')`. Esse
caminho é o único que libera leitura cross-store. Todas as outras combinações
de scope (`own`, `team`, `store`) ficam restritas à loja ativa.

A matriz do PRD-006 já cobre o recurso `store`:

| Papel      | Ações sobre `store`     | Scope |
| ---------- | ----------------------- | ----- |
| Owner      | view/create/edit/delete | all   |
| Gestor     | view                    | own   |
| Financeiro | view                    | own   |
| Demais     | —                       | —     |

Vendedor, SDR e Cliente não conseguem abrir `/app/configuracoes/lojas` — o
`requireAuth` redireciona para `/sem-permissao`.

---

## Mapeamento futuro para Supabase RLS

A estrutura de `withStoreScope` foi desenhada para ser traduzida 1:1 em
policies RLS. Esqueleto previsto:

```sql
-- Vendedor / Gestor só veem registros da loja onde têm acesso
CREATE POLICY "store_scoped_select"
  ON customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM sellers s
      WHERE s.id = auth.uid()
        AND customers.store_id = ANY (
          COALESCE(s.accessible_store_ids, ARRAY[s.store_id])
        )
    )
  );

-- Owner com scope 'all' bypassa via role personalizada (`gallo_owner`)
CREATE POLICY "owner_cross_store_select"
  ON customers FOR SELECT
  TO gallo_owner
  USING (true);
```

A função `withCreateStoreId` mapeia para um `BEFORE INSERT` trigger que
preenche `store_id` quando o cliente não envia o campo. A regra de
imutabilidade vira `BEFORE UPDATE` que aborta quando `NEW.store_id <> OLD.store_id`.

---

## Adicionar uma nova loja (passo a passo Fase 2)

> **Pré-condição:** Supabase já está em produção; a tabela `stores` existe e
> `accessible_store_ids` em `sellers` é `text[]`.

1. **Cadastrar a `IStore`** — `INSERT INTO stores (id, name, type, address, cnpj, settings, active_divisions, created_at)`.
2. **Configurar `IPlatformSettings`** — uma linha por loja em `platform_settings`
   (lifecycle thresholds, pipeline stages, tag suggestions, etc.) — ou copiar
   da matriz como ponto de partida.
3. **Atribuir vendedores** — `UPDATE sellers SET accessible_store_ids = array_append(accessible_store_ids, '<novo-store-id>') WHERE id IN (...)`.
4. **(Opcional) Transferir carteiras** — para clientes/leads que migram à nova
   loja, usar o fluxo de transferência dedicado (PRD da Fase 2 — gera audit
   log próprio e atualiza `storeId`).
5. **Verificar Visão Executiva (Onda 2)** — confirmar que a nova loja aparece
   na consolidação cross-store.

Nenhuma alteração de código deve ser necessária — toda a infraestrutura é
data-driven.

---

## Cenários de erro

| Cenário                                                          | Comportamento esperado                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `localStorage` aponta para loja inacessível ou removida          | Cai silenciosamente para a loja primária; limpa a entrada inválida                          |
| `setCurrentStore` chamado com loja fora de `accessibleStores`    | Lança `Error`; toast no `<StoreSwitcher>`; `currentStoreId` não muda                        |
| Mutation `create` sem `storeId` e sem loja ativa                 | `MockValidationError("Não é possível criar o registro sem uma loja ativa.")`                |
| Mutation `update` tentando alterar `storeId`                     | `MockValidationError("O campo storeId é imutável no MVP — ...")`                            |
| Provider list chamado durante hidratação (currentStoreId = null) | Filtro vira `storeId = '__no_user__'` → resultado vazio até `<MultistoreProvider>` resolver |

---

## Considerações LGPD (Fase 2)

Quando houver parceiras com razão social separada, considerar:

- Cada loja como **controlador de dados** distinto sob LGPD.
- Transferência de cliente entre lojas exige consentimento explícito.
- Owner cross-store gera audit log a cada acesso a dados de outra loja
  (`switch_store` + acessos posteriores).

Esses pontos ficam endereçados em PRDs específicos da Fase 2 quando o cenário
real materializar.
