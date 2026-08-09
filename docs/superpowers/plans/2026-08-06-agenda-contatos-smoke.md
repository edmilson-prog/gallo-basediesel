# Agenda — roteiro de smoke (Fase 1)

Branch `feat/agenda-contatos`. Este roteiro cobre o que **não dá para verificar
por código**: renderização, interação e o comportamento sob RLS real.

> ⚠️ **Nada disso funciona antes das migrations serem aplicadas.** Ver §0.

---

## 0. Antes de tudo — aplicar as duas migrations

A Agenda lê da tabela `contacts`, que **ainda não existe em produção**.
Verificado três vezes durante o desenvolvimento: nenhuma migration foi aplicada.

```
supabase/migrations/20260806120000_create_contacts_table.sql   -- tabela + RLS
supabase/migrations/20260806120100_backfill_contacts.sql       -- ~5.400 linhas
```

Ambas passaram por revisão de segurança com veredito **"seguro para aplicar"**.
A primeira leva a correção da injeção cross-carteira (guard de `customer_id`).

Conferência depois de aplicar:

```sql
select
  count(*)                                        as total,
  count(*) filter (where customer_id is not null) as vinculados,
  count(*) filter (where customer_id is null)     as soltos,
  count(*) filter (where coalesce(phone_digits,'') = '') as sem_digitos,
  count(*) filter (where ignored_at is not null)  as ja_ignorados
from public.contacts;
```

Esperado: `total ≈ 5.400`, `vinculados ≈ 1.978`, `soltos ≈ 3.400+`,
`sem_digitos = 0`, `ja_ignorados = 0`.

Os totais são aproximados **de propósito**: a base é viva — durante o
desenvolvimento os leads subiram de 3.386 para 3.416 pelo webhook de produção.

---

## 1. Listagem e paginação

- [ ] `/app/agenda` abre e lista contatos
- [ ] O rodapé mostra "Mostrando 1–15 de N" com o N real
- [ ] Trocar de página troca as linhas; a última página termina exatamente em N
- [ ] Trocar "Por página" para 60 volta para a página 1

## 2. Busca

- [ ] Pressionar `/` em qualquer lugar da página foca a busca
- [ ] Digitar `/` **dentro** da busca insere o caractere, não re-foca
- [ ] `Escape` desfoca
- [ ] Buscar um telefone **com** formatação (`99712-4488`) encontra
- [ ] Buscar o **mesmo** telefone só com dígitos (`997124488`) encontra o mesmo contato
- [ ] Buscar sem acento (`irai`) encontra o acentuado (`Iraí`)
- [ ] Buscar o nome de uma **empresa** encontra os contatos dela

## 3. Escopos e filtros

- [ ] Os quatro chips mostram contagens coerentes
- [ ] **Vinculados + Sem cliente = Todos**, mas **Opt-out não entra nessa soma** — ele cruza os dois (é o esperado, não um bug)
- [ ] Trocar um filtro pinta o seletor de dourado
- [ ] Trocar qualquer filtro volta para a página 1
- [ ] "Limpar filtros" some quando não há filtro ativo

## 4. Cards e tabela

- [ ] Um contato **sem cliente** mostra a caixa tracejada azul com "Vincular"
- [ ] Um contato em **opt-out** mostra a barra vermelha à esquerda
- [ ] Contatos cujo nome é um telefone mostram **`#`** no avatar — isso é esperado: **1.437 dos 3.411 soltos** vieram do import de WhatsApp sem nome de perfil
- [ ] Alternar para tabela mantém os mesmos contatos
- [ ] **Clique-direito no cabeçalho** abre "Colunas visíveis"
- [ ] Ocultar uma coluna a remove; "Exibir todas" traz de volta
- [ ] Arrastar a borda de uma coluna redimensiona, e **a largura sobrevive ao reload**
- [ ] As linhas verticais aparecem **só no cabeçalho**, não no corpo

## 5. Gaveta de detalhe

- [ ] Clicar num card abre a gaveta
- [ ] O ícone de **agendar** no card abre a gaveta com a seção de retorno destacada
- [ ] Em contato com opt-out, **"Abrir conversa" está desabilitado**
- [ ] Remover uma etiqueta some da gaveta e do card
- [ ] Agendar um retorno grava e passa a mostrar a data

## 6. Vincular (o fluxo central)

- [ ] Em um contato solto, "Vincular a cliente" abre a busca
- [ ] Digitar 2+ caracteres lista clientes com documento e cidade
- [ ] Vincular move o contato de "Sem cliente" para "Vinculados" e atualiza as contagens
- [ ] Na gaveta, "Desvincular" faz o caminho inverso

## 7. LGPD

- [ ] A chave de opt-out muda o card imediatamente
- [ ] Ao marcar opt-out, "Abrir conversa" **fica desabilitado**
- [ ] A ação aparece em Auditoria com autor e data

## 8. Ações em massa

- [ ] Selecionar dois cards abre a barra
- [ ] "Selecionar todos os N filtrados" seleciona o conjunto inteiro, não só a página
- [ ] Aplicar etiqueta atualiza os selecionados
- [ ] **Se algum contato não puder ser alterado**, a mensagem diz quantos foram — não deve dizer sucesso total
- [ ] Opt-out em massa aplica a barra vermelha nos selecionados

## 9. Isolamento por vendedor — o mais importante

Entrar como um **vendedor não-staff**:

- [ ] Só aparecem contatos que ele possui ou cujos clientes estão na carteira dele
- [ ] Tentar editar um contato que ele vê apenas pela carteira **mostra mensagem de erro**, não "salvo" silencioso
- [ ] Ao vincular, a busca de clientes só oferece clientes que ele alcança

## 10. Temas

- [ ] A tela funciona no tema **Black Gold** (padrão) — foi nele que o kit foi desenhado
- [ ] Trocar para outro tema não quebra o layout nem deixa texto ilegível

---

## O que **não** está nesta fase

Ausentes de propósito, com a infraestrutura em fases posteriores:

| Elemento do kit | Fase |
|---|---|
| Tela de **Triagem** | 2 |
| Importar CSV | 3 |
| Mesclar duplicados | 3 |
| Envio em massa | 4 |
| Sincronizar WhatsApp | 4 |

Também pendente: o painel de reset do design-system promete refazer o dataset
mock e **não refaz** para contatos — ou se conecta, ou se corrige o texto.
