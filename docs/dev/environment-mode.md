# Ambiente & Dados — switch runtime Demonstração ↔ Produção

Tela Owner-only em **Configurações → Avançado → Ambiente & Dados**
(`/app/configuracoes/ambiente`) que alterna as duas fontes do app sem mexer em
env/redeploy.

## Como funciona

O app continua resolvendo as fontes **uma única vez no boot** (`factory.ts` e
`authSource.ts`). O que a tela faz é gravar um **override por navegador** em
`localStorage` e recarregar a página:

| Chave | Sobrescreve |
| --- | --- |
| `gallo-data-source-override` | `VITE_DATA_SOURCE` |
| `gallo-auth-source-override` | `VITE_AUTH_SOURCE` |

Ordem de resolução (em `src/shared/lib/environmentMode.ts`, testada):
**override → env válida → `mock`**. Quando a escolha coincide com o default do
build, a chave é removida (estado "sem override" verdadeiro).

## Presets

- **Produção** = dados `supabase` + login `supabase`
- **Demonstração** = dados `mock` + login `mock`
- **Personalizado** = qualquer combinação mista (ex.: login real + dados mock,
  usada em testes de cutover) — exposta no colapsável "Configuração avançada".

## Comportamentos acoplados

- **Trocar a dimensão de login encerra a sessão**: o espelho síncrono
  `gallo-auth-sync` é limpo antes do reload, então os guards levam para
  `/auth/login`.
- **Faixa de Demonstração** (`DemoModeBanner`, montada no `AppLayout`): visível
  para todos enquanto a fonte de DADOS for `mock`; o link "Gerenciar ambiente"
  só aparece para Owner.
- **Badge no menu do usuário** (`TopBar`) e **badge read-only + link** no
  cabeçalho de `/app/gestao/saude`.

## Segurança

O override **não é fronteira de segurança** — só escolhe qual caminho de código
client-side inicializa. Um visitante que forçar `supabase` no localStorage cai
na tela de login real; RLS e Supabase Auth seguem protegendo os dados de
qualquer forma. A rota da tela é Owner-only (`requireAuth ["Owner"]`).
