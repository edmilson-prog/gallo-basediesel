# Atalho de chave PIX no Atendimento

> Feature em `src/features/pix/`. Spec: `docs/superpowers/specs/2026-08-07-pix-shortcut-design.md`.

Permite ao atendente enviar uma chave PIX previamente cadastrada direto da conversa,
opcionalmente acompanhada de um QR Code, sem digitar a chave à mão.

## O princípio que governa tudo

> **O QR é complemento; o texto é o produto.**

O cliente está **no celular** olhando a conversa — ele não consegue escanear um QR exibido
na própria tela. O QR só serve no WhatsApp Web, quando ele mostra a tela a outra pessoa, ou
se o banco dele lê QR da galeria. O que sempre funciona é o gesto nativo de **tocar e
segurar → Copiar**.

Disso decorrem duas regras que atravessam o código inteiro:

1. **A chave vai numa mensagem sozinha, por último, crua** — sem prefixo, sem emoji, sem
   ponto final, e **sem a assinatura do atendente**. O toque longo do WhatsApp copia o
   **corpo inteiro** da mensagem; qualquer coisa concatenada ali produz uma string que
   falha ao colar no app do banco.
2. **O texto vem ligado por padrão; o QR, desligado.**

## Arquitetura

| Camada | Onde | Responsabilidade |
|---|---|---|
| Engines (puros, testados) | `src/features/pix/engine/` | formatação de chave, BR Code, texto, geometria do QR, plano de envio, invariante da chave padrão |
| Dados | `pix_keys` + provider em `@/providers/data` | CRUD com RLS store-read / staff-write |
| Configuração | `/app/configuracoes/pix` | cadastro, edição, preview ao vivo |
| Envio | `hooks/useSendPix.ts` | I/O: render do QR, upload, despacho, auditoria |
| Composer | `MessageInput.tsx` | menu de anexo, slash `/pix`, barra de confirmação |

### Por que a decisão de envio mora num engine

`planPixSend` decide **o que** enviar e **em que ordem**, sem tocar em rede. A ordem é a
propriedade mais arriscada da feature: se a chave deixar de ser a última, ou deixar de ir
crua e `unsigned`, o toque-e-segurar do cliente para de funcionar e **ninguém percebe até
alguém tentar pagar**. Por isso ela é testada, não implícita.

⚠️ **A degradação do QR NÃO mora no engine.** `planPixSend` recebe `qrAvailable` como
entrada; quem descobre que o QR falhou (payload inválido, canvas indisponível, `toBlob`
nulo, upload que lança) é o `useSendPix`, e é lá que o `try/catch` do bloco do QR fica. Se
essa lógica for puxada para dentro do engine, duas garantias se perdem — o complemento não
derruba o produto, e um retry nunca reenvia uma chave que já saiu — e se perdem **com a
suíte verde**, que é a pior forma de perder.

## A assinatura do atendente

`useMessageSend.send()` aplica `applyAttendantSignature` em toda mensagem de texto,
prefixando `*Nome:* `. Para a mensagem da chave isso seria fatal: sairia
`*Edmilson:* 12345678000195` e o cliente colaria a assinatura junto no banco.

Por isso `ISendOptions` tem `unsigned?: boolean`. É **aditivo** — o default `undefined`
preserva o comportamento de todos os chamadores — e é usado **exclusivamente** na mensagem
da chave. A legenda continua assinada normalmente (`*Nome:* *Pagamento via PIX*` renderiza
como dois trechos em negrito adjacentes, que é o correto).

## O QR Code

Gerado **no client, sob demanda**: preview no editor desenha localmente sem upload; o envio
desenha num canvas fora de tela → `toBlob("image/png")` → `File` → `prepareAttachment`. Sem
estado derivado no banco, sem invalidação quando a chave é editada, sem órfãos no storage.

### Regras que decidem se um app de banco consegue ler

- **Escala de módulo sempre inteira** (`Math.floor`, `imageSmoothingEnabled = false`, sem
  redimensionar depois). Escala fracionária gera anti-aliasing nas bordas — cinza entre o
  preto e o branco — e é a causa nº 1 de QR que "às vezes lê".
- **Export em 800×600 (4:3), nunca quadrado.** `ImageBubble.tsx:57` renderiza miniaturas em
  `aspect-[4/3] w-[260px]` com `object-cover`. Um PNG quadrado perde 25% em cima e 25%
  embaixo — some a quiet zone e o corte entra nos finder patterns. O ativo se adapta ao
  renderizador; **não** altere o `ImageBubble`.
- **Quiet zone de 4 módulos**, **correção de erro M** (L não sobrevive à recompressão do
  WhatsApp), **PNG sempre** (artefato JPEG numa borda de 1 px destrói a leitura).
- **As cores são hex literal de propósito.** São os *bytes de uma imagem* lida por um
  scanner, não superfície de UI — um QR precisa ser preto puro sobre branco puro em qualquer
  tema. Os tokens semânticos governam a **moldura** no CRM, nunca o conteúdo do PNG. Nunca
  aplique `invert`, `opacity` ou filtro de tema ao canvas.

## Chave canônica vs. exibida

São **dois valores diferentes de propósito**:

| Tipo | Canônico (enviado e copiado) | Exibido |
|---|---|---|
| CNPJ | `12345678000195` | `12.345.678/0001-95` |
| CPF | `12345678909` | `123.456.789-09` |
| Telefone | `+5555999999999` | `+55 55 99999-9999` |
| E-mail | minúsculas | idêntico |
| Aleatória | UUID com hífens | idêntico |

O `CopyKeyButton` recebe **sempre** o canônico. Um valor formatado copiado por engano é bug
de dinheiro.

**Chaves não-ASCII são rejeitadas, nunca normalizadas.** O `qrcode-generator` serializa em
Latin-1, então um `ç` gera bytes que alguns leitores decodificam errado. Normalizar
transformaria `joão@` em `joao@` — uma chave **diferente**, possivelmente de outra pessoa.
Rejeitar no cadastro é a única saída segura, e o BACEN restringe chaves de e-mail a ASCII
de qualquer forma.

## BR Code

Payload estático (sem tag `54` — o cliente digita o valor). Favorecido ≤ 25 caracteres,
cidade ≤ 15, ASCII, CRC16-CCITT no fim calculado **incluindo** o próprio cabeçalho `6304`.

Nome ou cidade longos demais são **rejeitados, não truncados**: truncar silenciosamente
gera um payload que *parece* válido e falha só dentro do app do banco. Os contadores da tela
de configuração usam o mesmo medidor (`toAscii`) que o builder usa para rejeitar, então UI e
engine concordam no mesmo limite.

O CRC tem **duas âncoras externas** nos testes: `29B1` (vetor oficial do CRC-16/CCITT-FALSE)
e `1D3D` (checksum publicado com o exemplo real de BR Code). Um teste de checksum cujo valor
esperado sai da própria implementação não prova nada — confirmaria apenas que o código
concorda consigo mesmo, validando o bug junto.

## Acesso

Chave PIX é **da loja**, não do vendedor. RLS: toda a loja **lê** (o atendente precisa da
chave para enviá-la), só `is_staff()` **escreve** — deixar um vendedor cadastrar a própria
chave é superfície de fraude. A rota e o menu são restritos a Owner e Gestor, para não
anunciar uma tela cujas ações falhariam no banco.

⚠️ Consequência conhecida: **SDR e Financeiro não são `is_staff()`**. Eles enviam
normalmente, mas não cadastram.

Todo envio grava trilha via `recordAuditLog` (quem, qual chave, qual conversa). É o que
torna a superfície de fraude investigável depois.

## Só uma chave padrão por loja

Duas camadas. `engine/defaultKey.ts` (`keysToDemote`) resolve o caso comum no client, mas é
best-effort: enxerga uma renderização de chaves, então duas promoções sobrepostas ainda
poderiam deixar duas padrão. Quem **de fato** segura a invariante é o índice único parcial
`pix_keys_one_default_per_store`.

## Armadilhas

1. Corte do `ImageBubble` — exportar em 4:3 resolve sem tocar no componente.
2. Escala fracionária de módulo — causa nº 1 de QR que "às vezes lê".
3. JPEG — nunca; PNG sempre.
4. O cliente não escaneia o próprio QR — texto ligado por padrão.
5. Chave embutida em parágrafo — vira "manda de novo, só a chave".
6. Assinatura do atendente na chave — use `unsigned: true`.
7. Chave errada enviada — a barra de confirmação existe por isso; **nunca envio em 1 clique**.
8. Chave desativada circulando — desative em vez de excluir; o composer lista só as ativas.
9. Colisão de atalho com resposta rápida — o editor cruza os dois conjuntos. Ressalva: uma
   resposta rápida **privada de outro vendedor** nunca aparece nesse conjunto (modelo de
   privacidade do PRD-027), então a detecção é best-effort.
10. Chave copiada com lixo — `trim()` no write e no salvamento.
11. `*` ou `_` no favorecido corrompe o negrito da mensagem inteira — sanitizado.
12. Alguém "corrigir" os hex do canvas para tokens — o comentário explicando fica **em cima
    das constantes**, onde o olho de quem edita realmente passa.

## Smoke em produção

O modo Demonstração **não** exercita o caminho real (o mock não sobe bytes para o bucket).
O teste que prova a feature é:

1. Cadastrar uma chave real em Configurações → Chaves PIX.
2. Enviar numa conversa de teste com QR ligado.
3. **Escanear o QR com o app de um banco de verdade.**
4. Conferir que a chave da 2ª mensagem cola limpa no campo do banco.
5. Testar o toque-e-segurar no celular.
