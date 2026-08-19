// scripts/backfill-ad-touches.ts
// PRD-217 (Provenance) Fase 2 — reconstrução do histórico de toques de anúncio.
//
// Duas passadas, nesta ordem (a segunda depende da primeira):
//   A. PRECISA      — webhook_deliveries (retenção desde 19/07/2026). Data real
//                     do clique, mensagem casada. origin='backfill_delivery'.
//   B. APROXIMADA   — conversations.ad_referral, só para conversas que ficaram
//                     SEM nenhum toque. Data da conversa, não do clique.
//                     origin='backfill_conversation' (aviso da RN-06).
//
// Idempotente: record_ad_touch grava com `on conflict do nothing` sobre os dois
// índices únicos da Fase 1 (message_id; conversation_id+ad_id+occurred_at).
// Rodar de novo não duplica — devolve null e o script conta como "já existia".
//
// Simulação (ZERO escrita):
//   POSIX:      AD_BACKFILL_DRY_RUN=yes bun run scripts/backfill-ad-touches.ts
//   PowerShell: $env:AD_BACKFILL_DRY_RUN="yes"; bun run scripts/backfill-ad-touches.ts
// Escrita real (atrás do gate do dono):
//   POSIX:      AD_BACKFILL_CONFIRM_WRITE=yes bun run scripts/backfill-ad-touches.ts
//   PowerShell: $env:AD_BACKFILL_CONFIRM_WRITE="yes"; bun run scripts/backfill-ad-touches.ts
//
// Flags: --from ISO  --to ISO  --window-hours N  --phase delivery|conversation|all
// --phase conversation sozinho pode duplicar toques (nenhum índice de dedupe
// colapsa o par precisa+aproximada) — exige AD_BACKFILL_ALLOW_CONVERSATION_ONLY=yes.
//
// Gate: a migration 20260819000000_ad_provenance_phase2.sql TEM de estar
// aplicada antes da escrita real — as duas RPCs de leitura nascem lá.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { adReferralFromStoredNode } from "../src/features/ads/engine/storedAdPayload";

// ===== Safety latch ==========================================================

const DRY_RUN = process.env.AD_BACKFILL_DRY_RUN === "yes";
const CONFIRM_WRITE = process.env.AD_BACKFILL_CONFIRM_WRITE === "yes";
if (!DRY_RUN && !CONFIRM_WRITE) {
  throw new Error(
    "Trava de segurança: rode com AD_BACKFILL_DRY_RUN=yes (simulação) ou AD_BACKFILL_CONFIRM_WRITE=yes (escrita real).",
  );
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..");
const SCRATCHPAD = join(ROOT, "scratchpad");
const STORE_MATRIZ = "00000000-0000-0000-0000-000000000001";
const AUDIT_ACTOR = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador)

// PostgREST devolve no máximo 1.000 linhas por resposta, mesmo com a service
// role key — é teto do servidor, não da chave. A passada aproximada já está em
// 969 linhas hoje (2026-08-18) e cresce a cada conversa nova por anúncio: sem
// paginar, o corte é SILENCIOSO (sem erro, relatório limpo, toques faltando).
// 500 dá margem folgada para crescer sem estourar de novo tão cedo.
const PAGE_SIZE = 500;

// ===== Args ==================================================================

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const WINDOW_HOURS = Number(flag("window-hours") ?? 24);
if (!Number.isFinite(WINDOW_HOURS) || WINDOW_HOURS <= 0) {
  throw new Error("--window-hours precisa ser um número positivo.");
}
const PHASE = flag("phase") ?? "all";
if (!["all", "delivery", "conversation"].includes(PHASE)) {
  throw new Error("--phase aceita: all | delivery | conversation");
}
// Rodar só a passada aproximada sem a precisa antes cria toques duplicados:
// nenhum dos dois índices únicos de dedupe da Fase 1 colapsa esse par (um é
// parcial em message_id, que o toque aproximado não tem; o outro depende de
// occurred_at, que difere entre o clique real e a data da conversa). E o gate
// reportaria sucesso mesmo assim. Exige confirmação explícita e separada.
if (PHASE === "conversation" && process.env.AD_BACKFILL_ALLOW_CONVERSATION_ONLY !== "yes") {
  throw new Error(
    "Passada aproximada isolada pode duplicar toques (ver comentário acima do parse de --phase). " +
      "Rode --phase all (ordem correta: precisa → aproximada) ou, se tiver certeza de que a passada " +
      "precisa já cobriu esta janela, confirme com AD_BACKFILL_ALLOW_CONVERSATION_ONLY=yes.",
  );
}

// Validados aqui — antes de qualquer I/O, junto das outras flags — para que um
// erro de digitação (ex.: --from ontem) aborte sem tocar em nada. Se essa
// checagem morasse dentro do try de main() (como estava), o catch de lá
// registraria a falha como interrupção e gravaria uma linha em audit_logs sem
// nenhuma escrita real ter sido tentada.
const FROM_FLAG = flag("from");
const TO_FLAG = flag("to");
if (FROM_FLAG !== undefined && Number.isNaN(new Date(FROM_FLAG).getTime())) {
  throw new Error(`--from inválido: "${FROM_FLAG}" não é uma data ISO.`);
}
if (TO_FLAG !== undefined && Number.isNaN(new Date(TO_FLAG).getTime())) {
  throw new Error(`--to inválido: "${TO_FLAG}" não é uma data ISO.`);
}
if (FROM_FLAG !== undefined && TO_FLAG !== undefined && new Date(FROM_FLAG) >= new Date(TO_FLAG)) {
  throw new Error("--from precisa ser anterior a --to.");
}
// --to omitido cai no padrão "agora" dentro de main() — e esse padrão não
// depende de I/O (diferente do padrão de --from, que só é resolvido depois
// de consultar webhook_deliveries). Por isso dá para fechar aqui, sem I/O,
// o caso de --from bem-formado mas já no futuro/presente: sem esta checagem,
// um --from digitado errado (ex.: ano trocado) só falharia dentro do try de
// main() e geraria uma linha de audit_logs sem nenhuma escrita tentada — o
// mesmo ruído que a validação acima já existe para evitar.
if (FROM_FLAG !== undefined && TO_FLAG === undefined && new Date(FROM_FLAG) >= new Date()) {
  throw new Error("--from precisa ser anterior a agora (--to não informado usa o padrão 'agora').");
}

// ===== Row shapes ============================================================

interface DeliveryRow {
  message_id: string;
  conversation_id: string;
  occurred_at: string;
  external_ad_reply: unknown;
}

interface OrphanRow {
  conversation_id: string;
  occurred_at: string;
  referral: unknown;
}

interface PassCounters {
  scanned: number;
  unparseable: number;
  inserted: number;
  alreadyThere: number;
  failed: number;
}

const emptyCounters = (): PassCounters => ({
  scanned: 0,
  unparseable: 0,
  inserted: 0,
  alreadyThere: 0,
  failed: 0,
});

const failures: string[] = [];

// ===== Escrita ===============================================================

/**
 * record_ad_touch devolve o uuid do toque criado, ou null quando o toque já
 * existia (redelivery ou re-execução do backfill) — null é sucesso, não erro.
 *
 * `dryRunCoveredByDelivery`, quando passado, recebe o conversation_id de toda
 * chamada em modo simulação — usado só pela passada precisa (ver seu uso em
 * runConversationPass) para a passada aproximada não projetar em cima do que
 * a precisa já teria coberto num run real.
 */
async function recordTouch(
  counters: PassCounters,
  args: {
    conversationId: string;
    messageId: string | null;
    occurredAt: string;
    referral: unknown;
    origin: "backfill_delivery" | "backfill_conversation";
  },
  dryRunCoveredByDelivery?: Set<string>,
): Promise<void> {
  if (DRY_RUN) {
    counters.inserted += 1;
    dryRunCoveredByDelivery?.add(args.conversationId);
    return;
  }
  const { data, error } = await sb.rpc("record_ad_touch", {
    p_conversation_id: args.conversationId,
    p_message_id: args.messageId,
    p_occurred_at: args.occurredAt,
    p_referral: args.referral,
    p_origin: args.origin,
  });
  if (error) {
    counters.failed += 1;
    failures.push(`${args.origin} ${args.conversationId}: ${error.message}`);
    return;
  }
  if (data) counters.inserted += 1;
  else counters.alreadyThere += 1;
}

// ===== Passada A — fonte precisa ============================================

/**
 * `counters` é mutado in-place (em vez de retornado) para que, se uma janela
 * lançar (ex.: statement_timeout), o progresso das janelas já processadas
 * continue visível no relatório e no audit_logs escritos pelo catch em main().
 */
async function runDeliveryPass(
  from: Date,
  to: Date,
  counters: PassCounters,
  dryRunCoveredByDelivery: Set<string>,
): Promise<void> {
  const stepMs = WINDOW_HOURS * 3600 * 1000;

  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += stepMs) {
    const windowFrom = new Date(cursor);
    const windowTo = new Date(Math.min(cursor + stepMs, to.getTime()));

    // Pagina DENTRO da janela: o conjunto de origem (webhook_deliveries) é
    // histórico e não muda enquanto lemos, então .range() em cima da RPC é
    // seguro aqui (diferente da passada B — ver comentário lá).
    let offset = 0;
    // Sentinela: não há precedente neste repo de .rpc() paginada (os fetchAll
    // da casa só paginam .from().select()), e essa combinação nunca foi
    // exercitada contra este deployment. Se limit/offset não forem aplicados
    // a esta chamada de RPC, a página não avança e o for(;;) abaixo seria
    // ilimitado, martelando produção com as mesmas linhas. message_id é PK
    // com ordem total, então duas páginas não-vazias consecutivas só têm a
    // mesma primeira chave se a paginação não tiver avançado de fato.
    let previousFirstKey: string | null = null;
    for (;;) {
      const { data, error } = await sb
        .rpc("ad_backfill_delivery_window", {
          p_from: windowFrom.toISOString(),
          p_to: windowTo.toISOString(),
        })
        .order("message_id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        throw new Error(
          `Janela ${windowFrom.toISOString()} → ${windowTo.toISOString()} (offset ${offset}) falhou: ${error.message}. ` +
            `Se for statement_timeout, reduza --window-hours e rode de novo (é idempotente).`,
        );
      }

      const rows = (data ?? []) as DeliveryRow[];
      // rows[0] é `DeliveryRow | undefined` sob noUncheckedIndexedAccess — o
      // encadeamento opcional evita o TS2532 sem perder a checagem de página
      // vazia (firstKey só fica undefined quando rows está vazio).
      const firstKey = rows[0]?.message_id;
      if (firstKey !== undefined && firstKey === previousFirstKey) {
        throw new Error(
          `Janela ${windowFrom.toISOString()} → ${windowTo.toISOString()} (offset ${offset}): a paginação não ` +
            `avançou — a página nova veio com a mesma primeira linha (message_id=${firstKey}) da anterior. ` +
            `limit/offset aparentemente não foram aplicados a esta chamada de RPC; abortando para não ` +
            `reprocessar as mesmas linhas indefinidamente.`,
        );
      }
      if (firstKey !== undefined) previousFirstKey = firstKey;
      counters.scanned += rows.length;

      for (const row of rows) {
        const referral = adReferralFromStoredNode(row.external_ad_reply);
        if (!referral) {
          counters.unparseable += 1;
          continue;
        }
        await recordTouch(
          counters,
          {
            conversationId: row.conversation_id,
            messageId: row.message_id,
            occurredAt: row.occurred_at,
            referral,
            origin: "backfill_delivery",
          },
          dryRunCoveredByDelivery,
        );
      }

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(
      `  [precisa] ${windowFrom.toISOString().slice(0, 10)} — ` +
        `${counters.scanned} mensagens varridas até aqui, ${counters.inserted} toques novos até aqui`,
    );
  }
}

// ===== Passada B — fonte aproximada =========================================

/**
 * Pagina a RPC até o fim e acumula tudo num array ANTES de devolver. A RPC
 * filtra por "não existe toque ainda", então qualquer gravação nossa encolhe
 * o conjunto de origem — paginar enquanto grava pularia registros na página
 * seguinte (o offset avançaria sobre um conjunto que já mudou). Esse bug é
 * pior que truncar: parece funcionar e some silenciosamente com uma fatia.
 */
async function fetchAllOrphanConversations(): Promise<OrphanRow[]> {
  const rows: OrphanRow[] = [];
  let offset = 0;
  // Sentinela: mesma razão da passada A (ver comentário lá) — sem precedente
  // de .rpc() paginada neste repo, nunca exercitado contra este deployment.
  // conversation_id é PK com ordem total, então duas páginas não-vazias
  // consecutivas só repetem a primeira chave se limit/offset não tiverem
  // sido aplicados a esta chamada de RPC.
  let previousFirstKey: string | null = null;
  for (;;) {
    const { data, error } = await sb
      .rpc("ad_backfill_orphan_conversations")
      .order("conversation_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Fonte aproximada falhou ao paginar (offset ${offset}): ${error.message}`);
    }
    const page = (data ?? []) as OrphanRow[];
    // page[0] é `OrphanRow | undefined` sob noUncheckedIndexedAccess — mesma
    // razão do comentário na passada A.
    const firstKey = page[0]?.conversation_id;
    if (firstKey !== undefined && firstKey === previousFirstKey) {
      throw new Error(
        `Fonte aproximada (offset ${offset}): a paginação não avançou — a página nova veio com a mesma ` +
          `primeira linha (conversation_id=${firstKey}) da anterior. limit/offset aparentemente não foram ` +
          `aplicados a esta chamada de RPC; abortando para não reprocessar as mesmas linhas indefinidamente.`,
      );
    }
    if (firstKey !== undefined) previousFirstKey = firstKey;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function runConversationPass(
  counters: PassCounters,
  dryRunCoveredByDelivery: Set<string>,
): Promise<void> {
  const allRows = await fetchAllOrphanConversations();

  // Em simulação, a passada precisa não grava nada de verdade — então esta
  // consulta ainda vê como órfã toda conversa que a precisa projetou cobrir.
  // Descontamos aqui para a contagem refletir o que o run REAL produziria.
  const rows =
    DRY_RUN && PHASE === "all"
      ? allRows.filter((row) => !dryRunCoveredByDelivery.has(row.conversation_id))
      : allRows;
  counters.scanned = rows.length;

  for (const [index, row] of rows.entries()) {
    // conversations.ad_referral JÁ é um IAdReferral (o webhook grava o objeto
    // do domínio, não o nó cru do provider): passa direto, sem parser.
    const referral = row.referral as { sourceId?: string } | null;
    if (!referral?.sourceId?.trim()) {
      counters.unparseable += 1;
      continue;
    }
    await recordTouch(counters, {
      conversationId: row.conversation_id,
      messageId: null,
      occurredAt: row.occurred_at,
      referral,
      origin: "backfill_conversation",
    });
    if ((index + 1) % 100 === 0) {
      console.log(`  [aproximada] ${index + 1}/${rows.length}…`);
    }
  }
}

// ===== Contagens de conferência =============================================

async function countTable(table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countOrphanConversations(): Promise<number> {
  return (await fetchAllOrphanConversations()).length;
}

// ===== Main ==================================================================

async function main(): Promise<void> {
  console.log(
    `\nBackfill de toques de anúncio — modo ${DRY_RUN ? "SIMULAÇÃO (nada é gravado)" : "ESCRITA REAL"}\n`,
  );

  const before = {
    touches: await countTable("ad_touches"),
    ads: await countTable("ads"),
    orphanConversations: await countOrphanConversations(),
  };
  console.log(
    `Antes: ${before.touches} toques, ${before.ads} anúncios, ` +
      `${before.orphanConversations} conversas com anúncio e sem toque.\n`,
  );

  const delivery = emptyCounters();
  const conversation = emptyCounters();
  const dryRunCoveredByDelivery = new Set<string>();
  let runError: unknown = null;

  // As duas passadas ficam num try/catch (em vez de deixar uma janela ruim
  // derrubar o processo sem rastro): se algo lançar no meio — ex.: janela 12
  // de 31 estoura statement_timeout —, capturamos aqui, seguimos para o
  // relatório e o audit_logs com o progresso PARCIAL já acumulado nos
  // counters (mutados in-place pelas duas funções acima) e relançamos no
  // final, depois de registrar, para o operador ver a falha.
  try {
    if (PHASE === "all" || PHASE === "delivery") {
      // A retenção real de webhook_deliveries manda: sem --from/--to, varre da
      // entrega mais antiga até agora.
      const { data: bounds, error: boundsErr } = await sb
        .from("webhook_deliveries")
        .select("created_at")
        .order("created_at", { ascending: true })
        .limit(1);
      if (boundsErr) throw boundsErr;

      // FROM_FLAG/TO_FLAG, quando informados, já foram validados como data ISO
      // antes de qualquer I/O (ver comentário junto do parse de --phase). Esta
      // checagem aqui é só para o padrão resolvido via I/O (bounds da tabela,
      // ou "agora" para --to) — ex.: banco vazio, sem nenhuma webhook_delivery.
      const from = new Date(FROM_FLAG ?? bounds?.[0]?.created_at ?? new Date().toISOString());
      const to = new Date(TO_FLAG ?? new Date().toISOString());
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        throw new Error(
          "--from/--to inválidos após resolver o padrão de webhook_deliveries: precisam ser ISO e --from anterior a --to.",
        );
      }

      console.log(
        `Passada PRECISA: ${from.toISOString()} → ${to.toISOString()}, ` +
          `janelas de ${WINDOW_HOURS}h`,
      );
      await runDeliveryPass(from, to, delivery, dryRunCoveredByDelivery);
      console.log("");
    }

    if (PHASE === "all" || PHASE === "conversation") {
      console.log("Passada APROXIMADA (data da conversa, não do clique — RN-06)");
      await runConversationPass(conversation, dryRunCoveredByDelivery);
      console.log("");
    }
  } catch (err) {
    runError = err;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✖ Execução interrompida: ${message}\n`);
  }

  // Espelha o try/catch das duas passadas acima (mesmo raciocínio do I2): a
  // conferência final reexecuta countOrphanConversations() — que pagina
  // conversations com anti-join em ad_touches — sob a MESMA carga que pode ter
  // acabado de derrubar uma janela com statement_timeout. Sem este try/catch,
  // essa consulta lançaria FORA de qualquer guarda, matando o processo depois
  // de toques já commitados em produção, sem relatório e sem audit_logs — a
  // exata lacuna que o I2 existia para fechar, com o mesmo gatilho.
  let afterError: unknown = null;
  let after = { touches: -1, ads: -1, orphanConversations: -1 };
  try {
    after = {
      touches: await countTable("ad_touches"),
      ads: await countTable("ads"),
      orphanConversations: await countOrphanConversations(),
    };
  } catch (err) {
    afterError = err;
    console.error(
      `\n✖ Conferência final (contagens "depois") falhou: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
    // Sem a conferência final não dá para afirmar que o gate passou — mesmo
    // que as passadas acima tenham terminado limpas.
    process.exitCode = 1;
  }

  // ----- Relatório -----------------------------------------------------------
  const interruptedSection = runError
    ? [
        `## ⚠️ Execução interrompida`,
        ``,
        `Os números abaixo são **parciais** — a execução abortou antes de terminar.`,
        ``,
        `Erro: ${runError instanceof Error ? runError.message : String(runError)}`,
        ``,
      ]
    : [];
  const afterErrorSection = afterError
    ? [
        `## ⚠️ Conferência final não pôde ser lida`,
        ``,
        `As contagens "Depois" na tabela abaixo estão como \`-1\` — a leitura de conferência ` +
          `(ad_touches, ads, conversas órfãs) falhou depois das passadas.`,
        ``,
        `Erro: ${afterError instanceof Error ? afterError.message : String(afterError)}`,
        ``,
      ]
    : [];
  const dryRunProjectionNote =
    DRY_RUN && PHASE === "all" && dryRunCoveredByDelivery.size > 0
      ? [
          `> ℹ️ Simulação: esta contagem já é uma projeção líquida — desconta as ` +
            `${dryRunCoveredByDelivery.size} conversas que a passada precisa projetou cobrir ` +
            `(num run real a passada aproximada não as veria mais como órfãs).`,
          ``,
        ]
      : [];
  const md = [
    ...interruptedSection,
    ...afterErrorSection,
    `# Backfill de toques de anúncio (PRD-217 Fase 2)`,
    ``,
    `Execução: ${new Date().toISOString()} — modo **${DRY_RUN ? "simulação" : "escrita real"}**`,
    ``,
    `| Contagem | Antes | Depois |`,
    `|---|---:|---:|`,
    `| Toques (\`ad_touches\`) | ${before.touches} | ${after.touches} |`,
    `| Anúncios (\`ads\`) | ${before.ads} | ${after.ads} |`,
    `| Conversas com anúncio **sem toque** | ${before.orphanConversations} | ${after.orphanConversations} |`,
    ``,
    `## Passada precisa (\`backfill_delivery\`)`,
    ``,
    `- mensagens varridas: ${delivery.scanned}`,
    `- toques novos: ${delivery.inserted}`,
    `- já existiam: ${delivery.alreadyThere}`,
    `- nó ilegível / sem sourceId: ${delivery.unparseable}`,
    `- falhas: ${delivery.failed}`,
    ``,
    `## Passada aproximada (\`backfill_conversation\`)`,
    ``,
    `> ⚠️ RN-06: a data destes toques é a da **conversa**, não a do clique.`,
    ``,
    ...dryRunProjectionNote,
    `- conversas varridas: ${conversation.scanned}`,
    `- toques novos: ${conversation.inserted}`,
    `- já existiam: ${conversation.alreadyThere}`,
    `- \`ad_referral\` sem sourceId: ${conversation.unparseable}`,
    `- falhas: ${conversation.failed}`,
    ``,
    ...(failures.length ? [`## Falhas`, ``, ...failures.map((f) => `- ${f}`), ``] : []),
  ].join("\n");
  console.log(md);
  // mkdirSync/writeFileSync num try/catch próprio: uma falha de disco (sem
  // espaço, permissão, etc.) não pode impedir a linha de audit_logs logo
  // abaixo — o console.log acima já garante que o relatório apareceu no
  // terminal mesmo que a gravação em arquivo falhe. Loga e SEGUE.
  let reportWritten = false;
  try {
    mkdirSync(SCRATCHPAD, { recursive: true });
    writeFileSync(join(SCRATCHPAD, "ad-touches-backfill-report.md"), md + "\n", "utf8");
    reportWritten = true;
  } catch (err) {
    console.error(
      `\n✖ Falha ao gravar o relatório em disco (seguindo mesmo assim, para não perder o audit_logs): ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  if (reportWritten) {
    console.log(`\nRelatório: scratchpad/ad-touches-backfill-report.md`);
  }

  if (DRY_RUN) {
    console.log("\nSimulação: nada foi gravado. Para valer, use AD_BACKFILL_CONFIRM_WRITE=yes.");
    if (runError) {
      process.exitCode = 1;
      throw runError;
    }
    return;
  }

  // ----- Audit ---------------------------------------------------------------
  // Escrito também quando a execução acima abortou (runError setado): é
  // exatamente o cenário do I2 — toques já gravados em produção antes do
  // erro não podem ficar sem rastro de auditoria.
  const auditRows = [
    {
      id: crypto.randomUUID(),
      store_id: STORE_MATRIZ,
      actor_id: AUDIT_ACTOR,
      action: "ad_touches_backfill",
      resource: "ad_touches",
      resource_id: STORE_MATRIZ,
      timestamp: new Date().toISOString(),
      before,
      after: {
        ...after,
        delivery,
        conversation,
        phase: PHASE,
        window_hours: WINDOW_HOURS,
        interrupted: Boolean(runError),
        interruption_reason: runError instanceof Error ? runError.message : (runError ?? null),
        after_read_failed: Boolean(afterError),
        after_read_error: afterError instanceof Error ? afterError.message : (afterError ?? null),
      },
    },
  ];
  const { error: auditErr } = await sb.from("audit_logs").insert(auditRows);
  if (auditErr) {
    console.error("FALHA NO AUDIT — replay manual:", JSON.stringify(auditRows));
    process.exitCode = 1;
    if (runError) {
      throw new Error(
        `${auditErr.message} (a execução já havia abortado antes com: ` +
          `${runError instanceof Error ? runError.message : String(runError)})`,
      );
    }
    throw auditErr;
  }

  if (after.orphanConversations > 0) {
    console.warn(
      `\n⚠️ Ainda restam ${after.orphanConversations} conversas com anúncio e sem toque — ` +
        `o gate da Fase 2 pede ZERO. Investigue antes de fechar.`,
    );
    process.exitCode = 1;
  }
  if (failures.length) {
    console.warn(`\n⚠️ ${failures.length} falhas — o script é idempotente, pode rodar de novo.`);
    process.exitCode = 1;
  }

  if (runError) {
    process.exitCode = 1;
    throw runError;
  }
}

await main();
