# Atalho de chave PIX no Atendimento — Design

> **Data:** 2026-08-07
> **Branch:** `worktree-pix-shortcut`
> **Estado:** spec aprovada pendente de revisão do dono
> **Feature folder:** `src/features/pix/`

---

## 1. Problema

Hoje o atendente que precisa mandar a chave PIX da empresa digita a chave à mão em cada
conversa. Isso é lento, e sobretudo é **arriscado**: um dígito errado numa chave PIX manda
dinheiro do cliente para a conta de outra pessoa, sem reversão.

A feature dá um atalho no composer da conversa que envia uma chave PIX previamente
cadastrada, opcionalmente acompanhada de um QR Code.

## 2. Decisões do dono (2026-08-07)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Para quem é o "copiar" | **Ambos** — botão no CRM para o atendente **e** chave em mensagem separada para o cliente |
| D-2 | Dono das chaves | **Só da loja** — Owner/Gestor cadastra, todos os atendentes usam |
| D-3 | Valor na cobrança | **Só chave estática** — sem valor no payload |
| D-4 | Geração do QR | **Biblioteca** — `qrcode-generator` (zero dependências), desenho próprio no canvas |
| D-5 | Onde fica a configuração | **Rota irmã** `/app/configuracoes/pix`, vizinha de Respostas rápidas |
| D-6 | Texto que acompanha | **Padrão configurável por chave + editável no envio** |

## 3. Princípio que governa a feature

> **O QR é complemento; o texto é o produto.**

O cliente está **no celular** olhando a conversa — ele não consegue escanear um QR exibido
na própria tela. O QR só serve no WhatsApp Web, quando ele mostra a tela a outra pessoa, ou
se o banco dele lê QR da galeria. O que sempre funciona é o gesto nativo de tocar e segurar
a mensagem → **Copiar**.

Daí decorrem duas regras que atravessam todo o resto:

1. **A chave vai numa mensagem sozinha, por último, sem prefixo, sem emoji, sem ponto
   final.** Assim o toque longo entrega a chave limpa, pronta para colar. Chave embutida em
   parágrafo é o motivo pelo qual esse tipo de feature vira "manda de novo, só a chave".
2. **O texto vem ligado por padrão; o QR, desligado.** Ligar QR é uma escolha consciente do
   atendente (ex.: cliente no WhatsApp Web).

## 4. Modelo de dados

### 4.1 Tipo de domínio

```ts
// src/shared/types/pix.ts
export type PixKeyType = "cnpj" | "cpf" | "phone" | "email" | "random";

export interface IPixKey {
  id: ID;
  storeId: ID;
  /** Apelido operacional — "Matriz — CNPJ", "Filial Palmeira". */
  alias: string;
  keyType: PixKeyType;
  /** Forma CANÔNICA: só dígitos (cnpj/cpf), E.164 (phone), minúsculas (email),
   *  UUID com hífens (random). É esta que vai para o WhatsApp e para o clipboard. */
  keyValue: string;
  /** Favorecido no BR Code — máx. 25 caracteres, ASCII sem acento. */
  receiverName: string;
  /** Cidade no BR Code — máx. 15 caracteres, ASCII sem acento. */
  receiverCity: string;
  /** Texto padrão que acompanha o envio (D-6); editável na barra staged. */
  defaultContext?: string;
  /** Atalho opcional, ex. "/pix-matriz". Colisão validada contra quick_replies também. */
  shortcut?: string;
  /** Pré-seleção dos toggles ao abrir a barra staged. */
  defaultSendText: boolean;  // padrão de fábrica: true
  defaultSendQr: boolean;    // padrão de fábrica: false
  isDefault: boolean;
  isActive: boolean;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

**`keyValue` canônico vs. display são coisas distintas, de propósito.** A UI mostra
`12.345.678/0001-95`; o clipboard e a mensagem recebem `12345678000195`. O `CopyKeyButton`
recebe sempre o canônico, **nunca** o formatado. Um `display` copiado por engano é um bug de
dinheiro.

### 4.2 Tabela

`pix_keys`, espelhando o padrão de `quick_replies` (`text` PK, FK para `stores`).

```sql
create table if not exists public.pix_keys (
  id text primary key,
  store_id text not null references public.stores (id),
  alias text not null,
  key_type text not null check (key_type in ('cnpj','cpf','phone','email','random')),
  key_value text not null,
  receiver_name text not null,
  receiver_city text not null,
  default_context text,
  shortcut text,
  default_send_text boolean not null default true,
  default_send_qr boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by text not null references public.sellers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pix_keys_store_id_idx on public.pix_keys (store_id);
create index if not exists pix_keys_shortcut_idx on public.pix_keys (shortcut);
```

### 4.3 RLS — leitura ampla, escrita restrita

Consequência direta de D-2. Segue o padrão de `rls_slice3_personal_assets.sql`:

```sql
alter table public.pix_keys enable row level security;

-- Toda a loja LÊ (o atendente precisa da chave para enviar).
create policy pix_keys_select on public.pix_keys
  for select to authenticated
  using (store_id = public.current_store_id());

-- Só staff ESCREVE. INSERT/UPDATE/DELETE com o mesmo predicado.
create policy pix_keys_insert on public.pix_keys
  for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());
-- (update com using + with check; delete com using — idem)
```

> ⚠️ **Consequência conhecida e aceita:** pela arquitetura de papéis do projeto,
> **SDR e Financeiro não são `is_staff()`** — eles poderão enviar PIX, mas não cadastrar
> chave. Se o dono quiser que o Financeiro cadastre, isso exige mexer em `is_staff()` ou
> criar um predicado próprio, e **não** está nesta spec.

### 4.4 Provider

`IPixKeyProvider` em `src/shared/types/pix.ts`, contrato re-exportado por
`providers/data/contracts/pixKey.ts`, implementações em `impl/mock/` e `impl/supabase/`,
hook `usePixKeyProvider()` exposto **só** pelo barrel `@/providers/data`. As fronteiras do
ESLint valem integralmente: nenhuma feature importa `@/mocks` ou `impl/*` direto.

```ts
export interface IPixKeyProvider {
  list(params: { storeId?: ID; activeOnly?: boolean }): Promise<IPixKey[]>;
  get(id: ID): Promise<IPixKey | null>;
  create(input: Omit<IPixKey, "id" | "storeId" | "createdAt" | "updatedAt">): Promise<IPixKey>;
  update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey>;
  delete(id: ID): Promise<IPixKey>;
}
```

⚠️ O `create` do supabase precisa receber `storeId` explicitamente — é a armadilha já
documentada do projeto (`supabase-create-store-scope`): o mock injeta, o supabase não.

## 5. Engine — lógica pura, testada com Vitest

Três módulos em `src/features/pix/engine/`, todos sem React e sem I/O.

### 5.1 `pixKeyFormat.ts`

Validação e formatação por tipo. Um par de funções por tipo: `toCanonical` e `toDisplay`.

| Tipo | Canônico | Display | Validação |
|---|---|---|---|
| CNPJ | `12345678000195` | `12.345.678/0001-95` | 14 dígitos + dígito verificador |
| CPF | `12345678900` | `123.456.789-00` | 11 dígitos + dígito verificador |
| Telefone | `+5555999999999` | `+55 55 99999-9999` | E.164, DDI obrigatório |
| E-mail | minúsculas | idêntico | regex + comprimento |
| Aleatória | UUID com hífens | agrupado 8-4-4-4-12 | formato UUID v4 |

### 5.2 `pixBrCode.ts` — o payload EMV

Monta o BR Code **estático** (sem valor, por D-3) e fecha com **CRC16-CCITT**
(polinômio `0x1021`, init `0xFFFF`).

Regras que o builder impõe e que os testes cobrem:

- **Favorecido ≤ 25 caracteres, cidade ≤ 15.** Estourar gera payload que *parece* válido e
  falha só no app do banco.
- **Normalização ASCII obrigatória.** Não é preciosismo: o `stringToBytes` padrão do
  `qrcode-generator` é Latin-1, então um `ç` no nome do favorecido produz bytes que alguns
  leitores decodificam errado. O padrão BR Code já exige ASCII — as duas exigências se
  resolvem na mesma função.
- **Teste com CRC conhecido** — um payload de referência com o checksum esperado fixado no
  teste, para pegar regressão no cálculo.

### 5.3 `drawPixQr.ts` — canvas

```ts
// ⚠️ As cores abaixo são hex literal DE PROPÓSITO e NÃO violam a regra de tokens
// semânticos: não são superfície de UI, são os BYTES de uma imagem que sai do app
// e é lida por um scanner. Um QR precisa ser preto puro sobre branco puro em
// qualquer tema — tematizar aqui quebraria a leitura. Os tokens governam a MOLDURA
// no CRM (bg-muted, border-border), nunca o conteúdo do PNG.
const MODULE_COLOR = "#000000";
const BG_COLOR = "#FFFFFF";
const QUIET_MODULES = 4;
```

> O comentário fica **em cima das constantes**, não no topo do arquivo. É a regressão mais
> provável desta feature: um revisor vê `#000000` e "corrige" para `bg-foreground`.

**Especificação de pixel:**

| Grandeza | Valor | Motivo |
|---|---|---|
| Correção de erro | **M** (15%) | L não sobrevive à recompressão do WhatsApp; Q/H inflam sem contrapartida (não há logo) |
| `typeNumber` | `0` (auto) | payload típico 100–130 chars → versão 7–8 → 45–49 módulos |
| **PNG exportado** | **800 × 600 (4:3)** | ver §5.4 |
| Caixa do QR | alvo 512 px | sobra ≥ 44 px de branco em cima e embaixo |
| Quiet zone | 4 módulos por lado | mínimo da norma |
| Escala do módulo | `Math.floor(box / (count + 8))` | **sempre inteiro** |
| Formato | **PNG** | JPEG cria artefato nas bordas de 1 px e derruba a leitura |

**A escala inteira é a regra que mais importa.** Escala fracionária produz anti-aliasing nas
bordas dos módulos — cinza entre preto e branco — e é a causa nº 1 de QR que "às vezes lê".
Daí `Math.floor` na escala, `Math.round` na origem, `imageSmoothingEnabled = false`, e nunca
redimensionar o canvas depois de desenhado.

### 5.4 Por que 4:3 e não quadrado — achado verificado

`ImageBubble.tsx:57` renderiza a miniatura em `aspect-[4/3] w-[260px]` e a `<img>` na linha
67 usa `object-cover`. **Um PNG quadrado entra ali e é cortado 25% em cima e 25% embaixo** —
some a quiet zone inteira e o corte entra nos finder patterns.

O cliente receberia o QR intacto (o WhatsApp não corta), mas **o atendente veria um QR
visivelmente quebrado na própria conversa** e reportaria como bug.

A saída **não mexe no `ImageBubble`** (área sensível): exportar o PNG já em 4:3, 800×600,
com o QR quadrado centralizado sobre branco. Em 4:3 o `object-cover` não corta nada. O ativo
se adapta ao renderizador, não o contrário.

### 5.5 Geração sob demanda, nunca persistida

O QR é gerado **no client, na hora**: preview no editor = canvas local sem upload; envio =
canvas fora de tela → `toBlob("image/png")` → `File` → `prepareAttachment`. Sem estado
derivado no banco, sem invalidação quando a chave é editada, sem órfãos no storage.

```ts
const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
if (!blob) { toast.error(PIX_STRINGS.errors.qrRenderFailed); return; }
// Nome descritivo: desce até o downloadFileName do ImageBubble.
const file = new File([blob], `pix-${slug(pixKey.alias)}.png`, { type: "image/png" });
const payload = await prepareAttachment(file, "image", caption);
if (payload) await send(payload);
```

**Sem logo no centro** (exigiria nível H + mais módulos; somado à recompressão do WhatsApp é
receita de QR que às vezes lê) e **sem legenda queimada na imagem** (texto queimado não é
copiável, não é ampliável, não é lido por leitor de tela — vai na legenda da mensagem).

## 6. O que chega no cliente

No máximo **duas** mensagens. Nunca três.

**Caso padrão (texto ligado, QR desligado):**
```
msg 1 → *Pagamento via PIX*
        Favorecido: GALLO BASE DIESEL
        Chave (CNPJ) na próxima mensagem — é só tocar e segurar para copiar.

msg 2 → 12345678000195
```

**Com QR ligado:** o contexto vira **legenda da imagem** do QR (os motores WAHA/Evolution
aceitam caption), e a chave continua sozinha por último. Continua sendo 2 mensagens.

**Só QR:** 1 mensagem (imagem + legenda).

A frase "é só tocar e segurar para copiar" é a única instrução necessária: é curta, é
verdadeira nos dois sistemas operacionais, e transforma um gesto que muita gente não conhece
em algo óbvio.

**Sanitizar `*` e `_` no nome do favorecido** ao montar o texto — senão um deles corrompe o
negrito da mensagem inteira.

## 7. Atalho no composer

### 7.1 Entrada

Duas portas, nenhum botão novo no toolbar (ele já tem cinco):

1. Menu de anexo → **nova seção "Pagamento"** → item "Chave PIX", com o hint `/pix`.
2. Slash `/pix` no `SlashMenu` que já existe, mais o `shortcut` opcional de cada chave.

### 7.2 Escolha da chave — adaptativa

| Chaves ativas | Comportamento |
|---|---|
| 0 | Item desabilitado, com `title` apontando para Configurações |
| 1 | **Pula a escolha** — vai direto para a barra staged |
| 2+ | `DropdownMenuSub` com as chaves; a `isDefault` no topo |

> Uma variante com `CommandDialog` de busca foi considerada para 9+ chaves e **descartada
> por YAGNI**: uma loja não tem 9 chaves PIX, e o Radix já dá scroll no submenu. Se um dia
> passar disso, a busca entra numa iteração própria.

`aria-label` completo em cada item: `"Chave PIX Matriz, CNPJ, 12.345.678/0001-95"`. Só o
apelido não permite decidir às cegas — e "às cegas" aqui inclui o atendente apressado.

### 7.3 Barra staged — a trava de segurança

**Nunca envio em um clique.** Dinheiro na conta errada é o pior erro possível desta feature,
então há sempre um passo de confirmação com a chave visível.

A barra é gêmea do `ComposerStagedAsset`: mesma moldura
(`flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2`), mesmo ícone
`h-8 w-8`, mesmos botões `h-8`. Elas podem aparecer no mesmo dia e qualquer diferença de
altura seria percebida como bug.

Conteúdo, em **uma linha só**:

- Ícone `mdi:qrcode` com o favorecido no `Tooltip` e no `aria-label`.
- Linha 1: apelido + `Badge` do tipo + **a chave em `font-mono tabular-nums`**. O
  discriminador de segurança entre matriz e filial é **a chave**, não o favorecido (que é
  quase sempre o mesmo) — por isso ela é que fica visível. O favorecido aparece inline só em
  `lg:`, quando sobra espaço.
- Linha 2: campo de contexto editável (D-6), Enter envia, Esc cancela.
- Dois chips de opção (Chave / QR), `aria-pressed`, **estado nunca só por cor**: o ícone
  troca de outline para preenchido e ganha um check.
- Botão de trocar de chave — **só existe quando `keyCount > 1`**.
- Enviar + cancelar.

**Trava:** desmarcar os dois chips desabilita o Enviar **e** o Enter, com o motivo no
`title` — mesma gramática do `sendDisabledReason` que já existe em `MessageInput.tsx:332`.

## 8. Tela de configuração — `/app/configuracoes/pix`

Rota irmã de Respostas rápidas (D-5), no mesmo grupo do `SettingsLayout`, label
**"Chaves PIX"**, ícone `mdi:qrcode`, `roles: ["Owner", "Gestor"]`.

> Por que não virou 3ª aba de `QuickRepliesPage`: as abas de lá são "Minhas"/"Da loja" —
> o eixo é **escopo**. Enfiar "Chaves PIX" ali mistura escopo com tipo de conteúdo e faz a
> busca e o botão "Nova resposta" significarem coisas diferentes por aba.

Mesma gramática visual da tela vizinha: lista à esquerda + editor à direita, `Sheet` no
mobile.

### 8.1 Os 5 tipos sem virar arco-íris

**Um só canal de cor na tela.** Os tipos se diferenciam por **ícone + rótulo** em
`text-muted-foreground` dentro de um `Badge variant="secondary"` neutro. Cor fica reservada
para **estado** (padrão, inativa, erro) — e mesmo "padrão" usa `text-primary`.

Cinco cores para cinco tipos falharia por três motivos: nenhuma paleta de 5 cores sobrevive
aos temas × modos deste projeto com contraste garantido; cor como canal único é problema de
acessibilidade; e tipo de chave não tem semântica de severidade — pintar `severity-*` nele
seria abuso de token, ainda mais com a migração de severidades em curso.

| Tipo | Ícone | Rótulo |
|---|---|---|
| CNPJ | `mdi:office-building-outline` | CNPJ |
| CPF | `mdi:card-account-details-outline` | CPF |
| Telefone | `mdi:phone-outline` | Telefone |
| E-mail | `mdi:email-outline` | E-mail |
| Aleatória | `mdi:shuffle-variant` | Aleatória |

Os cinco são distintos **à distância** — prédio, cartão, telefone, envelope, setas cruzadas.
A discriminação é de **forma**, que funciona em qualquer tema e em qualquer visão de cor.

Botões de ação da linha em `h-9 w-9` (36 px), não `h-8 w-8` como no `ReplyRow` — 32 px fica
abaixo do alvo de toque mínimo e não vale replicar a dívida numa tela nova.

### 8.2 Editor + preview ao vivo

Campos: apelido, tipo, chave, favorecido (contador 25), cidade (contador 15), texto padrão,
atalho opcional, pré-seleção dos toggles, "chave padrão", "ativa".

O preview mostra **exatamente as duas mensagens**, na ordem real, dentro da **mesma caixa
`aspect-[4/3] w-[260px]` do `ImageBubble`** — se o QR cortar, corta no editor, e o erro
aparece antes de produção. Usa o `WhatsAppText` que já existe, então o `*negrito*` renderiza
de verdade (e um `*` mal colocado no favorecido aparece estragado, que é o desejado).

`break-all` no balão da chave: uma aleatória de 36 caracteres em mono estoura o
`max-w-[78%]` e o preview precisa mostrar essa quebra, porque ela também acontece no
WhatsApp. **Nunca `truncate` no meio de uma chave** — chave meio visível é pior que nenhuma,
porque parece conferível e não é. **Nunca mascarar com `•••`**: o atendente precisa conferir
o que está enviando; mascarar chave PIX é segurança teatral que remove justamente a
verificação que importa.

Desligar os dois toggles esvazia o preview. É feedback correto: não há mensagem.

## 9. O botão de copiar

Um componente, **dois** lugares: linha da lista (conferir/copiar sem abrir o editor) e barra
staged (conferir antes de mandar).

> Um terceiro lugar — o rodapé da bolha já enviada, reaproveitando o slot `footer` do
> `BubbleChrome` — foi considerado e **fica fora desta iteração**: reconhecer que uma bolha
> de texto contém uma chave PIX exigiria um discriminador persistido na mensagem (uma coluna
> nova, como o `media_type: "payment"` do PR #352), o que é escopo bem maior que o benefício.

**Feedback inline, não toast.** O atendente copia dezenas de vezes por turno; toast viraria
ruído empilhado sobre a conversa. O toast fica reservado para a **falha** — que é o caso em
que ele precisa mesmo ser interrompido. Isso diverge do `ContactBubble` de propósito: lá é
ação ocasional, aqui é repetitiva.

**O guard, e o que corrigir nele.** O `?.` de `navigator.clipboard?.writeText` está certo e
fica. O `.catch(() => undefined)` do `ContactBubble.tsx:33` **não** se repete: numa chave
PIX, clicar e não acontecer nada é pior que num telefone, porque o atendente pode achar que
copiou e colar a chave anterior. Falha sempre toasta.

**Reset em 1600 ms.** Abaixo de ~1200 ms o olho perde a confirmação se estiver olhando outro
ponto da tela; acima de ~2500 ms o botão passa a mentir. O timeout é re-armado a cada
clique, não empilhado, e limpo no desmonte.

Detalhes que separam esse botão do genérico:

- **`w-4` fixo no ícone** — sem isso "Copiar"→"Copiado" muda a largura e o botão pula.
- **`value.trim()`** — um `\n` invisível vindo do formulário derruba o campo do banco sem
  erro nenhum. É a falha mais chata de diagnosticar da feature inteira.
- **`transition-colors`, nunca `transition-all`** — `all` anima o `width` e produz o pulo
  que o `w-4` foi corrigir.
- **Só `text-severity-success`**, sem trocar fundo nem borda — flash verde numa linha de
  lista chama mais atenção do que a ação merece.
- **`aria-live="polite"` fora do botão** — `aria-label` mutável é lido de forma
  inconsistente entre leitores de tela.

Do lado do cliente **não existe API**: o WhatsApp não garante botão interativo no WAHA,
`pix:` não tem suporte universal, link não copia texto. Toda a alavanca está em **como a
mensagem é montada** — §6.

## 10. Tratamento de erro

| Situação | Comportamento |
|---|---|
| Payload inválido (chave incompleta) | Chip "QR" desabilitado com `title`; preview mostra só a chave. **Nunca um QR pela metade.** |
| `toBlob` retorna null | `toast.error` e o envio segue em modo texto, se "Chave" estiver ligado. O complemento nunca derruba o principal. |
| Upload falha | `runAttachmentPipeline` já toasta; a barra staged **permanece aberta** com o contexto preservado, para tentar de novo sem redigitar. |
| 2ª mensagem falha | `retry` manual pela bolha (`isReprocessable`). **Sem retry automático** — reenviar uma chave PIX do nada confunde o cliente. |
| Janela de 24h fechada | Respeita `canSendFreeText` como todo o resto. PIX não é template HSM. |
| Clipboard indisponível | `toast.error`; a chave continua selecionável na tela. |

## 11. Acessibilidade e mobile

- Foco visível preservado nos chips customizados (`focus-visible:ring-2 focus-visible:ring-ring`).
- Estado nunca só por cor (ícone outline → preenchido + check).
- `role="img"` + `aria-label` no canvas do preview; `alt` descritivo no envio
  (`"QR Code do PIX — Matriz"`) — é o que a pessoa cega do outro lado vai ouvir.
- Apelido e chave em `text-foreground`, **nunca** `text-muted-foreground`: a chave é o dado
  crítico da tela e não pode estar em contraste de metadado.
- Ordem de tab na barra staged = ordem visual: contexto → chips → trocar → enviar → cancelar.
- Mobile: chips perdem o rótulo abaixo de `sm` e viram ícone puro; "trocar" some com 1
  chave; cabe em 360 px. `Sheet side="bottom"` no editor, canvas a `cssSize: 180`.
- Animação: só 150 ms na cor do ícone de copiar e no hover dos chips, com
  `motion-reduce:transition-none`. **Zero animação no QR** — fade-in faz o atendente tentar
  ler durante a transição e concluir que está borrado.

## 12. Auditoria

Todo envio de PIX registra trilha via `auditLogger`: quem enviou, qual chave, qual conversa.
É superfície de fraude interna real, e a trilha é o que permite investigar depois.

> **Ponto para o dono decidir depois:** todo atendente pode enviar PIX, ou isso deve ser
> papel-gated? Esta spec assume **todos podem**, com auditoria. Mudar isso é uma linha no
> gate do menu.

## 13. Armadilhas registradas

1. **Corte do `ImageBubble`** — §5.4. Verificado no código, não suposto.
2. **Escala fracionária de módulo** — causa nº 1 de QR que "às vezes lê".
3. **JPEG** — artefato em borda de 1 px destrói a leitura. PNG sempre.
4. **O cliente não escaneia o próprio QR** — §3.
5. **Chave embutida em parágrafo** — §3.
6. **Limites e acentos do BR Code** — 25/15/ASCII/CRC16. Estourar gera payload que *parece*
   válido e falha só no app do banco.
7. **Chave errada enviada** — trava de confirmação + chave visível + auditoria.
8. **Chave desativada continua circulando** — por isso `isActive` (desativar, não excluir,
   para não quebrar o histórico) e o composer lista só as ativas.
9. **Colisão de atalho** com resposta rápida — o aviso do editor cruza **os dois conjuntos**.
10. **Duas mensagens, duas chances de falhar** — sequencial, chave por último, retry manual.
11. **Chave copiada com lixo** — `trim()` no `writeText` e no salvamento.
12. **`*`/`_` no favorecido** corrompe o negrito da mensagem inteira — sanitizar.
13. **Alguém "corrigir" os hex do canvas para tokens** — comentário em cima das constantes.
14. **CNPJ formatado ou só dígitos na mensagem?** Bancos normalizam pontuação, mas isso é
    suposição até ser testado. Guardar canônico, exibir formatado, e **validar com os dois
    bancos que o cliente usa** antes de fechar.
15. **Placeholders** — se o campo de contexto reusar `SnippetField`, um `{{...}}` não
    resolvido cai no gate de `hasUnresolvedPlaceholders` e bloqueia o envio. É o
    comportamento certo, mas precisa ser decidido de propósito e refletido no
    `sendDisabledReason`.

## 14. Fora de escopo

- PIX com valor / cobrança dinâmica (D-3).
- Conciliação de pagamento, baixa de título, webhook de banco.
- Chave por vendedor (D-2).
- Card de PIX **recebido** — isso é o PR #352, independente desta feature.
- Botão interativo de copiar no lado do WhatsApp — não existe API.

## 15. Gate de validação

- `bun run test` — engine (`pixBrCode`, `pixKeyFormat`) com CRC de referência fixado.
- `bun run build` — gate prático de CI.
- `bunx tsc --noEmit` avaliado **por delta** (há baseline pré-existente).
- `bun run lint` — fronteiras de import do Provider Pattern.
- **Smoke do dono em produção**, com escaneamento real do QR por um app de banco.
- Migration exportada para `supabase/migrations/` no mesmo PR; **aplicação em produção é
  manual e exige OK explícito do dono**.

## 16. Dependência nova

`qrcode-generator` — **zero dependências**, versão 2.0.4 (publicada em 2025-08-07, bem
acima do guard de 24 h do `bunfig.toml`, portanto sem necessidade de
`minimumReleaseAgeExcludes`). Faz só o encoding; o desenho é nosso, o que dá controle total
do visual e permite a especificação de pixel da §5.3.

Descartada: `qrcode`, que puxa `yargs` (CLI) e `pngjs` como dependências.

⚠️ Verificar na implementação se o pacote traz `.d.ts` próprio ou se é preciso um
`declare module`.
