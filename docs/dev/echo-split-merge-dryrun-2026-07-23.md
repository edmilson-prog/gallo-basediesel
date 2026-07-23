# Dry-run — merge das conversas divididas (2026-07-23)

> Plano de backfill para unificar os threads partidos historicamente (classe eco-pós-encerramento +
> cascas arquivadas pela limpeza do índice). **Somente leitura até aqui — nada foi executado.**
> Execução gated no OK do dono. Contexto: `conversation-split-echo-after-close.md`.

## 1. Números do plano (recomputados em 23/07)

| Métrica | Valor |
|---|---|
| Grupos (mesma âncora + instância, >1 conversa) | **104** |
| Conversas-fonte (mescladas e viram casca) | **129** — 117 `resolvida` + 12 `arquivada`, **0 abertas** |
| Mensagens a mover | **31.077** |
| `media_assets` a mover junto | 48 |
| Fontes com `last_message_at` > winner | **0** (nenhum bump necessário) |
| Dados satélites nas fontes | 1 nota de conversa · 1 `sdr_session` · 5 fontes com tags · 0 pedidos/orçamentos/agendamentos/participantes |

## 2. Regras do merge

- **Winner por grupo**: a conversa **aberta**, se existir; senão a mais recente por `last_message_at`.
  (Pós-índice, cada grupo tem no máximo 1 aberta.)
- **Move para o winner**: `messages` (UPDATE set-based de `conversation_id`), `media_assets`,
  `conversation_notes` (1 caso) e as **tags** das fontes (união com as do winner; 5 casos).
- **Fica na casca**: `conversation_activity` (ciclos de atendimento históricos — é o que alimenta a
  aba Histórico da ficha), `distribution_traces`, `sdr_sessions` (1 caso, histórico).
- **Casca ao final**: `status = 'arquivada'` (as 117 `resolvida` saem da lista padrão da Inbox; o
  trigger `conversations_maintain_closed_at` estampa `closed_at`).
- **Mídia continua acessível**: os paths de storage carregam o convId original; a policy resolve o
  acesso pelo path e a casca continua existindo — signed URLs seguem funcionando.

## 3. Caso-piloto VOLTECH

| | Fonte | Winner |
|---|---|---|
| Conversa | `a5081f8f` (612 msgs, `resolvida`) | `2a9dcfb4` (`em_andamento`, Tiago) |
| Resultado | vira casca arquivada | thread único com ~651 mensagens |

## 4. Maiores grupos (top 8 por mensagens movidas)

| Contato | Fonte → Winner | Msgs |
|---|---|---|
| LUCAS MACHADO COSTA | `c355a84c` → `595a4994` | 2.726 |
| Gustavo Silva - Motormac | `3ac1b9a8` → `dc20461d` | 2.374 |
| Marcelo Marques | `86e3b506` → `296280c2` | 1.825 |
| metalúrgica Fk | `f846aeb9` → `93182d68` | 1.392 |
| Bulegon | `a45aca91` → `0582c10a` | 1.161 |
| Yuri Gonçalves | `55aa9613` → `f2f72497` | 1.149 |
| RAMON SCHMIDT | `399a68cf` → `433fcfe4` | 1.095 |
| +554888553991 | `978712fa` → `1ce39f7b` | 965 |

## 5. Fora do escopo deste merge

- Os **2 grupos de 9º dígito** (mesmo número real, 2 registros de lead distintos) — exigem dedup dos
  leads antes (item 5 do plano); mesclar conversas de âncoras diferentes sem resolver o lead deixaria
  o cadastro inconsistente.
- Consolidação das `conversation_activity` das cascas (ficam como ciclos históricos por design).

## 6. Execução (quando aprovada)

Set-based, uma transação por lote (ou única — ~31k rows é tranquilo), fora do horário de pico:

1. `UPDATE messages SET conversation_id = winner WHERE conversation_id IN (fontes do grupo)`
2. Idem `media_assets`, `conversation_notes`; tags = união no winner.
3. `UPDATE conversations SET status='arquivada' WHERE id IN (fontes) AND status <> 'arquivada'`.
4. Verificação: 0 grupos com >1 não-casca; contagem de mensagens por winner = soma esperada;
   spot-check VOLTECH + top 8 na UI.

Efeitos colaterais esperados e aceitos: sessões com o thread aberto no momento recebem uma rajada de
eventos Realtime (executar fora de pico); caches de mensagens por conversa ficam stale até reload.
Rollback: as fontes de cada mensagem movida ficam registradas pelo próprio plano (grupo → winner), e
um snapshot `(message_id, conversation_id)` das 31k linhas é salvo em tabela `_backup` antes do UPDATE.
