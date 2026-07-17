# Importação de Clientes DINTEC — Design

> **Status:** aprovado pelo dono em 2026-07-10, pronto para virar plano de execução.
> **Autor:** Claude Code (assistido), a pedido de Edmilson.
> **Relacionado:** PRD-121 (`_DONE`, camada de providers agnóstica de fonte), PRDs 122–126 (deferidos por decisão do dono em 2026-06-10 — CSV/upload/engine formal não serão construídos; este documento formaliza a alternativa decidida: **importação assistida pelo agente desenvolvedor, dry-run + revisão**).
>
> ## ⚠️ ERRATA (2026-07-17) — este documento está SUPERADO, mantido só como registro histórico
>
> Este arquivo é o único conteúdo do **PR #263** (`docs/dintec-import-spec` — esta mesma branch). Ele descreve o **desenho inicial** da importação, aprovado em 2026-07-10 mas nunca colocado em execução a partir desta branch. O trabalho real — implementação, piloto, e as 3 fases de execução — aconteceu inteiramente em **outra branch**, `worktree-dintec-import-pilot` (**PR #266**, `feat: DINTEC customer import — Fase 1 (simulated pilot, zero-write)`), que evoluiu bem além do que este documento previa.
>
> ### O que já aconteceu de verdade (fora desta branch, via PR #266)
>
> - **Fase 1** (piloto simulado, zero-escrita): rodada contra 100 clientes DINTEC estratificados. Resultado: 52 vinculariam a um customer já existente, 48 criariam customer novo; 257 veículos normalizados (46 caíram em `brand="Outra"` — preservados para revisão, nunca descartados). 2 bugs reais achados e corrigidos durante a revisão por task: `ATRON` estava classificado como Mercedes-Benz (é Volkswagen/ex-MAN — a tabela de normalização abaixo neste próprio documento já reflete a correção) e `phoneFinal` caindo no campo errado quando `celular` era truthy-mas-inválido.
> - **Achado de dado real durante o piloto:** `CODCLI=1` no DINTEC é `"***VENDA CONSUMIDOR***"` — um bucket de venda anônima de balcão, não um cliente real, carregando 44 veículos de compradores diferentes. Tratado como decisão de dado, não bug de código.
> - **Fases 2 e 3** (escrita real + rollout completo): **já executadas e validadas em produção em 2026-07-11/12**, com dry-run e revisão adversarial prévios (confirmado por comentário do próprio dono no PR #266). Resultado final: **3.165 clientes** com `dintec_codcli` preenchido (de 7.985 customers totais na plataforma nessa data) — 509 vinculados a customers existentes + 2.557 criados como novos + 99 pulados + 1 excluído. Verificação pós-escrita: 0 inconsistências, 509/509 telefones intactos (nenhum sobrescrito, conforme a regra de "só preenche se vazio" descrita abaixo).
> - A importação **não causou** o bug de visibilidade da tela de Clientes investigado em paralelo (`docs/dev/customers-list-visibility-bug.md`, issue #270) — confirmado por cético adversarial dedicado: o `UPDATE` dos vinculados não escreve `tags`/`status`/`seller_id`/`store_id`, e `customers` não tem triggers não-internos.
>
> ### O conflito comprovado entre este PR (#263) e o #266
>
> O PR #266 contém sua **própria versão, mais evoluída, deste mesmíssimo arquivo** (`docs/superpowers/specs/2026-07-10-dintec-customer-import-design.md`) — atualizada com as correções e achados do piloto real. Testado mecanicamente com `git merge-tree` (dry-run, não altera nada) **nas duas ordens possíveis de merge** (#263→#266 e #266→#263): ambas produzem `CONFLICT (add/add)` neste arquivo. Não é uma suposição — é um conflito certo, comprovado, se qualquer um dos dois PRs for mergeado sem resolver isso primeiro.
>
> Um scan completo dos PRs abertos na época (2026-07-14) confirmou que este é o **único** arquivo em conflito entre #263 e #266 — nenhum outro overlap escondido.
>
> ### Recomendação (ainda não executada — aguardando OK explícito do dono)
>
> **Fechar o PR #263 sem mergear.** Ele não agrega nada que o #266 não tenha (a versão do #266 é estritamente superior — mesmo conteúdo + correções do piloto real) e, do jeito que está, é uma bomba-relógio de conflito esperando alguém mergear um dos dois PRs. A branch/PR pode continuar existindo como registro histórico do desenho original (este documento), mas fechada, não mergeada.
>
> Pendência secundária, também aberta: a **descrição do PR #266 no GitHub está desatualizada** — ainda diz "Fase 1, zero-escrita, fora de escopo Fase 2/3", mas o branch já tem Fase 2/3 completas e aplicadas em produção. Quem ler só a descrição seria enganado.
>
> ### Referências
>
> - `docs/checkpoints/2026-07-14-2046-dintec-conflito-prs-263-266.md` — checkpoint completo desta investigação (achado original, re-verificação adversarial por 10 agentes, pendências detalhadas).
> - PR #263: https://github.com/edmilson-prog/gallo-basediesel/pull/263 (este, aberto, obsoleto)
> - PR #266: https://github.com/edmilson-prog/gallo-basediesel/pull/266 (aberto, mergeable, importação completa já em produção)
> - `docs/db/dintec-phone-match-dryrun.csv` — relatório do dry-run de telefone original (2026-07-07/08) referenciado na seção "Contexto" abaixo.

## Contexto

O DINTEC (ERP FarolTI, banco Firebird `TURBO_DIESEL.FDB`, cópia de trabalho em `D:\claude\dintec\`, guia em `docs/db/GUIA-BANCO-TURBO-DIESEL.md`) não expõe API nem permite acesso direto ao banco de produção. A GALLO tem uma cópia read-only para consulta assistida. A plataforma já tem 5.074 `customers` (majoritariamente originados de conversas WhatsApp reais desde o go-live em 2026-06-10), e o DINTEC tem 3.167 clientes cadastrados (`CLIENTE`, PK `CODCLI`) com até 26 anos de histórico comercial (faturamento, curva ABC, veículos).

Um dry-run anterior (2026-07-07/08) cruzou telefone (`CELULAR` prioritário, fallback `TELEFONE`, normalizados por DDD + 8 dígitos finais ignorando o 9º dígito móvel) entre os dois lados e encontrou **563 customers da plataforma que já são, na prática, o mesmo cliente do DINTEC** (490 alta confiança via celular, 43 média via telefone fixo, 30 ambíguos). Relatório em `docs/db/dintec-phone-match-dryrun.csv`.

Este documento formaliza o desenho da importação completa: os 563 ganham o vínculo (`dintec_codcli`) e são enriquecidos; os ~2.600 restantes viram customers novos na plataforma.

## Objetivo

Trazer o máximo de informação útil do DINTEC para dentro do CRM, sem:
1. Sobrescrever qualquer dado que a plataforma já tenha editado/validado (ex.: telefone verificado por WhatsApp).
2. Misturar dado importado do DINTEC com dado calculado ao vivo pela própria plataforma (ex.: `purchase_stats`, `abc_class` vêm de pedidos reais via MV; não são o mesmo número que a curva ABC do DINTEC).
3. Quebrar nenhuma constraint, fluxo de WhatsApp ou tela existente.

Informação capturada além do estritamente necessário é aceitável agora — poda de campo não utilizado fica para quando o sistema "fechar" (não é objetivo deste projeto).

## Escopo

**Dentro:**
- Todos os 3.167 `CLIENTE` do DINTEC → `customers` da plataforma (matched + novos).
- Veículos de cada cliente, via `VEICULOPROPRIETARIO` (1.643 registros reais) → `vehicles`.
- Schema: novas colunas `dintec_*` em `customers` (migration versionada).
- Piloto simulado de 100 clientes antes de qualquer escrita real (Fase 1 deste documento vira o primeiro task do plano de execução).

**Fora:**
- Tela de upload de CSV / engine genérico de sync (PRDs 122–126, deferidos por decisão do dono).
- `leads` — não faz parte deste import (DINTEC representa clientes com histórico de compra, não leads de marketing).
- NF-e própria, reconciliação de conflito com UI dedicada (PRD-126) — a resolução de conflito aqui é uma regra fixa simples (ver "Casos especiais"), não uma tela.
- Sincronização contínua/futura (o DINTEC não expõe API; isso seria um novo projeto).

## Fonte dos dados (Firebird `TURBO_DIESEL.FDB`)

| Tabela | Linhas | Papel |
|---|---|---|
| `CLIENTE` | 3.167 | cadastro base (sem nome — resolvido via `NOTAFISCAL`/`NFISCAL`/`FANTASIA`) |
| `NOTAFISCAL` | 8.877 (saídas ≈ 8.851) | histórico de venda → LTV, ticket médio, frequência, curva ABC |
| `NFISCAL` | 10.397 | ordens de serviço (não usado neste import além do nome-fallback) |
| `VEICULOPROPRIETARIO` | 1.643 | veículos por `CODCLI` — `PLACA`, `ANO`, `MODELO`, `COR`, `VEICULO` (nome do modelo), `MOTOR` (quase sempre vazio) |
| `FUNCIONARIO` | 26 | resolve nome de vendedor via `CLIENTE.CODFUN` (só ~2/3.167 preenchido) |

Tabelas investigadas e **descartadas** por estarem vazias: `ADICIONAISCLIENTE`, `CLIENTE_DEPENDENTE`, `LISTATELEFONICA`, `VEICULO`, `ADICIONAISVEICULO`.

Telefone recuperado além do cadastro: 14 clientes sem `TELEFONE`/`CELULAR` em `CLIENTE` têm telefone capturado em `NOTAFISCAL`/`ORCAMENTO` (12 + 2, sem overlap) — incluídos.

## Modelo de dados

### Novas colunas em `public.customers`

```sql
alter table public.customers
  add column if not exists dintec_codcli text,
  add column if not exists dintec_ativo boolean,
  add column if not exists dintec_cliente_desde date,
  add column if not exists dintec_credit_limit numeric,
  add column if not exists dintec_vendedor_nome text,
  add column if not exists dintec_frequencia integer,
  add column if not exists dintec_ltv numeric,
  add column if not exists dintec_ticket_medio numeric,
  add column if not exists dintec_primeira_compra date,
  add column if not exists dintec_ultima_compra date,
  add column if not exists dintec_abc_class text,
  add column if not exists dintec_pct_receita numeric,
  add column if not exists dintec_synced_at timestamptz;

create unique index if not exists customers_dintec_codcli_key
  on public.customers (dintec_codcli)
  where dintec_codcli is not null;

alter table public.customers
  add constraint customers_dintec_abc_class_check
  check (dintec_abc_class is null or dintec_abc_class = any (array['A','B','C']));
```

(A migration rascunho `supabase/migrations/20260625130000_customers_dintec_codcli.sql` já cobre `dintec_codcli` + índice — será estendida com as colunas acima em vez de duplicada.)

**Por que colunas `dintec_*` separadas, e não um jsonb único ou reuso de `purchase_stats`/`abc_class`:** ficam independentemente filtráveis/ordenáveis na tela de Clientes e em relatórios, e não competem com o dado que a própria plataforma já calcula a partir de pedidos reais via MV. `recência` não é armazenada — é derivável de `dintec_ultima_compra` a qualquer momento (decai com o tempo; armazenar um número fixo ficaria stale).

Nenhuma coluna nova em `vehicles` — o schema existente (`brand`, `model`, `year`, `engine`, `plate`, `vin`, `current_km`) já cobre o que o DINTEC oferece.

### Mapeamento — campos que já existem na plataforma

Preenchidos **somente quando vazios** (nunca sobrescrevem edição manual ou dado vindo de WhatsApp):

| Coluna `customers` | Fonte DINTEC |
|---|---|
| `nome_fantasia` / `full_name` | `FANTASIA`, ou nome resolvido (`NOTAFISCAL.NOME` → `NFISCAL.NOMECLI` → `FANTASIA`) |
| `cpf` / `cnpj` | `CPF` / `CNPJ` (zeros = vazio) |
| `contact_name` | `CONTATO` (só B2B) |
| `address` (jsonb) | `ENDERECO`, `BAIRRO`, `CIDADE`, `ESTADO`, `CEP` |
| `email` | `EMAIL` |
| `phone` | só em customers **novos** (ver Casos especiais) — nos 563 já vinculados, o telefone da plataforma nunca é tocado |
| `type` | `CPF` preenchido → `B2C`; `CNPJ` preenchido → `B2B` |
| `seller_id` | só em customers novos → você (dono), id a resolver em tempo de execução via `sellers` |
| `store_id` | único store ativo da plataforma (confirmar via `select id from stores` — ambiente é single-tenant) |

## Casos especiais e defaults

| Situação | Quantidade | Regra |
|---|---|---|
| Cliente sem CPF nem CNPJ | 7 | `type='B2C'`, documento nulo |
| Cliente com CPF **e** CNPJ preenchidos | 1 | prioriza CNPJ → `type='B2B'` |
| Sem telefone em nenhuma fonte (`CLIENTE`+`NOTAFISCAL`+`ORCAMENTO`) | ~1.180 | `phone=''` (string vazia — mantém `NOT NULL`, evita ripple de null-check em código WhatsApp que assume string) |
| Match de telefone ambíguo (1 telefone bate em ≥2 `CODCLI`) | 30 | linka o customer existente ao `CODCLI` de **maior `dintec_ltv`** entre os candidatos; os demais `CODCLI` do grupo viram customers novos e independentes (não descartados) |
| `CLIENTE.ATIVO='NAO'` | 13 | importado normalmente; grava em `dintec_ativo=false`; não usado para filtrar escopo nem para setar `customers.status` automaticamente (fica com o default da plataforma) |
| `CODCLI=1` (`"***VENDA CONSUMIDOR***"`) | 1 | **Excluído da importação.** Bucket genérico de venda de balcão anônima do DINTEC — não é um cliente real; carrega 46 veículos que pertencem a compradores diferentes e sem relação entre si. Confirmado via varredura nos 3.167 `CLIENTE` completos (2026-07-10): é o **único** registro desse tipo na base — não há outro `CODCLI` sem documento com volume de veículo desproporcional (≥15), nem outro nome com padrão genérico (`CONSUMIDOR`/`DIVERSOS`/`VENDA BALCAO`/`CLIENTE PADRAO`/`GENERICO`/`AVULSO`/`BALCAO`). Um segundo candidato (`CODCLI=1729`, nome com prefixo `"* - "`) foi investigado e descartado — é uma concessionária real (`SAVARAUTO BOA VISTA VEICULOS LTDA`), o asterisco é uma convenção de nomenclatura do próprio cliente, não um marcador de sistema. |

## Veículos — normalização de marca/modelo

`VEICULOPROPRIETARIO.VEICULO` é texto livre (ex.: `"FH 540 6X4T"`, `"R 440 A6X4"`, `"HILUX CD4X4 SRV"`) sem coluna de marca. `vehicles.brand`/`model`/`year`/`engine` são `NOT NULL`.

**Tabela de normalização (prefixo do texto, case-insensitive, primeiro match vence):**

| Prefixo(s) | Marca |
|---|---|
| `FH`, `FM`, `VM` | Volvo |
| `R `, `P `, `G `, `S ` seguido de número (ex. `R 440`, `P 310`) | Scania |
| `ACTROS`, `ATEGO`, `AXOR`, `ACCELO` | Mercedes-Benz |
| `DAILY`, `STRALISHD`, `STRALIS`, `TECTOR`, `HD` | Iveco — `STRALISHD` cobre exports do DINTEC que colam a linha `STRALIS` direto no trim `HD` sem espaço (ex. `"STRALISHD 19-320"`) |
| número puro tipo `NN.NNN` (ex. `24.280`) ou `CARGO` | Ford Cargo (config numérica) — **atenção:** `NN.NNN` também é convenção VW/MAN; se o texto tiver `CONSTELLATION`/`DELIVERY`/`WORKER` explícito, prioriza Volkswagen |
| `XF`, `CF`, `LF` | DAF |
| `TGX` | MAN |
| `HILUX`, `COROLLA`, `SW4`, `ETIOS` | Toyota |
| `AMAROK`, `ATRON`, `CONSTELLATION`, `DELIVERY`, `GOL`, `SAVEIRO`, `WORKER` | Volkswagen |
| `DUCATO`, `STRADA`, `FIORINO`, `TORO`, `UNO` | Fiat |
| `MASTER`, `KANGOO`, `DUSTER`, `OROCH` | Renault |
| `RANGER` | Ford (picape — marca separada de "Ford Cargo", que é só a linha pesada por prefixo numérico) |
| `FRONTIER` | Nissan |
| `SPRINTER` (em **qualquer posição** do texto, não só como prefixo) | Mercedes-Benz — exceção às demais regras desta tabela: no DINTEC a Sprinter aparece colada a código de motor/carroceria (ex. `"415CDISPRINTERF"`), sem prefixo limpo, então essa regra usa busca por substring em vez de âncora no início |

Não reconhecido → `brand='Outra'`, `model=<texto original completo>` (nunca descartado, sempre marcado pra revisão manual).

`year`: usa `VEICULOPROPRIETARIO.ANO` (24 nulos de 1.643 → `model` como fallback de ano, se numérico; senão descarta o veículo individual, não o cliente).
`engine`: `MOTOR` do DINTEC está vazio em praticamente 100% dos casos → `engine='Não informado'`.
`plate`: `PLACA` direto (0 vazios).
`cadastro_status`: usa o default da plataforma para novo cadastro (mesmo valor que o resto do app usa para veículo recém-criado).

## Execução faseada

### Fase 1 — Piloto simulado (100 clientes, zero escrita)
Amostra estratificada:
- 40 já vinculados por telefone alta-confiança (`celular_alta` no dry-run) — valida visualmente (nome/whatsapp_name/trecho de conversa real × nome/documento DINTEC) se o vínculo pegou o cliente certo.
- 10 dos 30 ambíguos — valida a regra de desempate por LTV.
- 10 com veículo em `VEICULOPROPRIETARIO` — valida normalização de marca/modelo.
- 10 sem telefone em nenhuma fonte — valida o caminho `phone=''`.
- 30 totalmente novos (sem match) — valida criação de customer novo (tipo, seller, dados).

Saída: relatório (CSV/markdown) com o valor final de cada campo para os 100 casos, sem tocar no banco. Revisão do dono antes de prosseguir.

### Fase 2 — Escrita real dos 100 (após aprovação da Fase 1)
Aplica a migration de colunas novas + grava os 100 customers/vínculos/veículos de verdade. Dono inspeciona na tela de Clientes.

### Fase 3 — Rollout dos ~3.067 restantes (após aprovação da Fase 2)
Mesmo script, escopo completo. Transação única, contagens antes/depois, backup local (fora do git, é PII) antes de qualquer escrita.

## Segurança e reversibilidade

- Todo campo já existente na plataforma só é preenchido se estiver vazio — zero risco de apagar edição manual.
- Telefone de customer já existente **nunca** é sobrescrito pelo DINTEC.
- `dintec_codcli` tem índice único parcial — impossível linkar dois customers ao mesmo `CODCLI` por acidente.
- Cada fase é reversível via `DELETE` dos registros criados (todos identificáveis por `dintec_synced_at` e `dintec_codcli`/`dintec_ativo is not null`).
- Nenhuma migration ou escrita em produção acontece sem aprovação explícita entre fases (ver memória do projeto: nunca aplicar migration/deploy sem OK).

## Riscos residuais conhecidos

- A tabela de normalização de marca/modelo é uma heurística, não um mapeamento oficial do DINTEC — pode errar em casos ambíguos (ex.: `NN.NNN` compartilhado entre Ford Cargo e VW/MAN). Mitigado por `brand='Outra'` como fallback seguro e pela revisão manual no piloto.
- O desempate de ambíguos por `dintec_ltv` é uma escolha razoável, não uma certeza — os 30 casos ficam pequenos o bastante para revisão pontual se o dono discordar de algum depois.
