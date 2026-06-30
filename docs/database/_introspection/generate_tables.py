"""
Bootstrap Fase 2 — generate the mechanical skeleton of every table/matview fiche.

Reads the clean JSON dumps (prepare_data.py output) and emits one Markdown fiche
per object under docs/database/tables/, following the canonical anatomy
(BOOTSTRAP-BANCO-EXISTENTE.md §13). The mechanical layer is fully filled from
introspection; context fields carry origin markers (❓ pendente / 🔍 inferido).

Re-runnable: overwrites the fiches. Context added by hand in Fase 3 lives in the
fiches, so after enrichment do NOT re-run blindly (it would clobber). Intended
for the one-shot skeleton pass and for reconciliation diffs.
"""
import json, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.dirname(HERE)
TABLES = os.path.join(DB, "tables")
os.makedirs(TABLES, exist_ok=True)
TODAY = "2026-06-17"

def load(n): return json.load(open(os.path.join(HERE, f"{n}.json"), encoding="utf-8"))
columns = load("columns"); fks = load("fks"); indexes = load("indexes")
constraints = load("constraints"); policies = load("policies")
comments = load("comments"); matcols = load("matview_columns")

# tier / domain / purpose / prds — classification (Fase 1) + inferred one-line purpose
META = {
 "ai_settings":("suporte","ai","Configuração global de IA (singleton). Owner-only; chaves no Vault.","ai"),
 "ai_usage_events":("estrutural","ai","Log append-only de cada chamada real ao LLM.","ai"),
 "asset_combos":("suporte","media","Combos de ativos para envio rápido.","PRD-027"),
 "asset_favorites":("estrutural","media","Junção seller↔ativo (favoritos da biblioteca).","PRD-027"),
 "asset_library_items":("suporte","media","Biblioteca de ativos reutilizáveis.","PRD-027"),
 "asset_send_log":("estrutural","media","Log de envios de ativos da biblioteca.","PRD-027"),
 "audit_logs":("estrutural","access","Trilha de auditoria imutável de mutações.","PRD-006"),
 "carteira_transfers":("suporte","leads","Transferências de carteira (cliente/lead) entre vendedores.","PRD-011"),
 "cash_flow_entries":("suporte","finance","Lançamentos de fluxo de caixa.","PRD-021"),
 "commissions":("suporte","commercial","Comissões de vendas por pedido/vendedor.","PRD-019"),
 "conversation_notes":("suporte","conversations","Notas internas fixadas numa conversa.","PRD-119"),
 "conversation_participants":("estrutural","conversations","Junção conversa↔seller co-responsável (multi-instância).","Switchboard"),
 "conversations":("nucleo","conversations","Conversa de atendimento (WhatsApp), por loja/cliente/número.","PRD-022"),
 "customer_notes":("suporte","crm","Notas da ficha do cliente.","PRD-008"),
 "customer_segments":("suporte","crm","Segmentos de clientes.","PRD-009"),
 "customers":("nucleo","crm","Cliente B2B/B2C — núcleo do CRM.","PRD-008"),
 "departments":("suporte","access","Departamentos: agrupamento de vendedores por loja.","PRD-211"),
 "distribution_traces":("suporte","leads","Rastro da decisão de distribuição/rodízio de uma conversa.","PRD-013/213"),
 "expenses":("suporte","finance","Despesas (com recorrência/série).","PRD-020"),
 "goals":("suporte","finance","Metas de vendas por vendedor/loja.","PRD-017"),
 "integration_logs":("estrutural","integrations","Auditoria de chamadas a provedores externos (WhatsApp/Vault).","PRD-112"),
 "leads":("nucleo","leads","Lead do funil comercial.","PRD-010"),
 "media_assets":("suporte","media","Ativos de mídia (gestão central — Vault).","PRD-026"),
 "message_templates":("suporte","conversations","Catálogo de templates HSM do WhatsApp.","PRD-116"),
 "messages":("nucleo","conversations","Mensagem de uma conversa (in/outbound).","PRD-022"),
 "model_kit_items":("estrutural","catalog","Junção kit↔peça.","PRD-025"),
 "model_kits":("suporte","catalog","Kits de peças por modelo de veículo.","PRD-025"),
 "notification_preferences":("suporte","notifications","Preferências de notificação por vendedor.","PRD-024"),
 "notifications":("suporte","notifications","Central de notificações in-app (parte derivada via pg_cron).","PRD-024"),
 "order_items":("suporte","commercial","Item de um pedido (filho de orders).","PRD-015"),
 "orders":("nucleo","commercial","Pedido de venda.","PRD-015"),
 "parts":("nucleo","catalog","Peça do catálogo (43 colunas).","PRD-014"),
 "processed_events":("estrutural","integrations","Ledger de idempotência de webhook.","PRD-114"),
 "product_indicators":("suporte","catalog","Indicadores/curva de produto por vendedor.","PRD-016"),
 "profiles":("estrutural","access","Espelho de auth.users → papel/loja/seller (fonte do JWT).","PRD-107"),
 "quick_replies":("suporte","media","Respostas rápidas de texto.","PRD-027"),
 "quote_items":("suporte","commercial","Item de um orçamento (filho de quotes).","PRD-012"),
 "quotes":("nucleo","commercial","Orçamento.","PRD-012"),
 "rbac_resources":("suporte","access","Catálogo de recursos protegíveis (RBAC).","PRD-211"),
 "recommendations":("suporte","catalog","Recomendações de produto/ação.","PRD-023"),
 "role_permissions":("suporte","access","Matriz de permissões por papel.","PRD-211"),
 "roles":("suporte","access","Papéis (RBAC) editáveis, com base_role.","PRD-211"),
 "rotation_participants":("suporte","conversations","Participantes da fila de rodízio.","PRD-213"),
 "rotation_queues":("suporte","conversations","Fila de rodízio de atendimento, uma por loja.","PRD-213"),
 "scheduled_sends":("suporte","media","Envios agendados de mensagem/mídia.","Chronicle"),
 "sdr_escalations":("suporte","sdr","Escalonamentos do agente SDR para humano.","PRD-029"),
 "sdr_sessions":("suporte","sdr","Sessões do agente SDR.","PRD-029"),
 "sellers":("nucleo","access","Membro da equipe (staff/externo/representante) — núcleo gravitacional.","PRD-101"),
 "stores":("nucleo","platform","Loja/unidade da plataforma — raiz do escopo multi-loja.","PRD-004"),
 "trackable_links":("suporte","media","Links rastreáveis enviados ao cliente.","PRD-027"),
 "vehicle_models":("suporte","vehicles","Modelos de veículo (catálogo compartilhado).","PRD-025"),
 "vehicles":("suporte","vehicles","Veículo de um cliente.","PRD-007"),
 "whatsapp_account_access_rules":("suporte","conversations","Regras de acesso por número WhatsApp (multi-instância).","Switchboard"),
 "whatsapp_accounts":("nucleo","conversations","Conta/número WhatsApp conectado (com failover).","PRD-111"),
}
MATMETA = {
 "mv_commissions_by_period":("Comissões agregadas por loja/vendedor/período/status.",),
 "mv_executive_kpis":("KPIs executivos mensais por loja (pedidos, receita, clientes, ticket).",),
 "mv_sales_by_seller_month":("Vendas mensais por vendedor (pedidos, receita, desconto, cancelados).",),
}
# tables flagged for usage confirmation in Fase 3/4
USAGE_Q = {"model_kits","model_kit_items","recommendations","product_indicators","asset_combos"}

TRIGGERS = {
 "conversation_notes":[("conversation_notes_notify_mentions","AFTER INSERT","notify_conversation_note_mentions()")],
 "parts":[("parts_oem_codes_text_biu","BEFORE INSERT/UPDATE","parts_set_oem_codes_text()")],
 "whatsapp_accounts":[("whatsapp_accounts_notify_connection","AFTER UPDATE","notify_whatsapp_connection_change()")],
}

# ---- indexes by table + group ----
cols_by_t = defaultdict(list)
for c in columns: cols_by_t[c["table_name"]].append(c)
fks_out = defaultdict(list)   # this table's FKs
fks_in = defaultdict(list)    # FKs pointing at this table
for f in fks:
    fks_out[f["table_name"]].append(f)
    fks_in[f["ref_table"]].append(f)
idx_by_t = defaultdict(list)
for i in indexes: idx_by_t[i["tablename"]].append(i)
cons_by_t = defaultdict(list)
for c in constraints: cons_by_t[c["table_name"]].append(c)
pol_by_t = defaultdict(list)
for p in policies: pol_by_t[p["tablename"]].append(p)
tcomment = {c["table_name"]: c["comment"] for c in comments if c["kind"]=="table"}
ccomment = {(c["table_name"], c["col"]): c["comment"] for c in comments if c["kind"]=="column"}
matcols_by = defaultdict(list)
for m in matcols: matcols_by[m["matview"]].append(m)

TYPEMAP = {"timestamp with time zone":"timestamptz","timestamp without time zone":"timestamp",
           "character varying":"varchar","double precision":"double precision","USER-DEFINED":None,"ARRAY":None}
def fmt_type(dt, udt):
    if dt == "ARRAY": return udt.lstrip("_") + "[]"
    if dt == "USER-DEFINED": return udt
    return TYPEMAP.get(dt, dt) or dt

def pk_cols(table):
    for i in idx_by_t[table]:
        if i["indexname"].endswith("_pkey"):
            m = re.search(r"USING \w+ \(([^)]*)\)", i["indexdef"])
            if m: return [c.strip().strip('"') for c in m.group(1).split(",")]
    return []

def clean(expr):
    if expr is None: return None
    return re.sub(r"\s+", " ", expr).strip()

def real_checks(table):
    out = []
    for c in cons_by_t[table]:
        if c["ctype"] != "CHECK": continue
        cc = clean(c.get("check_clause"))
        if not cc: continue
        # drop auto NOT NULL checks
        if re.fullmatch(r"\(*\s*[\w\"]+\s+IS NOT NULL\s*\)*", cc, re.I): continue
        out.append((c["constraint_name"], cc))
    return out

def uniques(table):
    out = []
    for c in cons_by_t[table]:
        if c["ctype"] == "UNIQUE": out.append(c["constraint_name"])
    return out

def fiche_table(table):
    tier, domain, purpose, prds = META[table]
    cols = sorted(cols_by_t[table], key=lambda c: c["pos"])
    pks = pk_cols(table)
    fkmap = {f["col"]: f for f in fks_out[table]}
    tcm = tcomment.get(table)
    fonte = "inferido" if tcm else "pendente"
    L = []
    L.append("---")
    L.append(f"objeto: {table}")
    L.append("tipo: tabela")
    L.append("schema: public")
    L.append("status: existente")
    L.append(f"tier: {tier}")
    L.append(f"dominio: {domain}")
    L.append("rls_enabled: true")
    L.append(f"colunas: {len(cols)}")
    L.append("edge_functions: []")
    L.append(f"prds_relacionados: [{prds}]")
    L.append(f"atualizado_em: {TODAY}")
    L.append(f"fonte_contexto: {fonte}")
    L.append("---")
    L.append("")
    L.append(f"# `{table}`")
    L.append("")
    L.append(f"> {purpose} `🔍 inferido (nome + CLAUDE.md/PRD)`")
    L.append("")
    L.append(f"**Status:** existente · **Tier:** {tier} · **Domínio:** {domain} · **RLS:** habilitada")
    L.append("")
    # 2. Descrição
    L.append("## Descrição da entidade")
    L.append("")
    if tcm:
        L.append(f"`🔍 inferido (fonte: COMMENT ON {table}, no próprio banco)`")
        L.append("")
        L.append(f"> {tcm}")
    else:
        L.append("`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.")
    L.append("")
    # 3. Colunas
    L.append("## Colunas `[mecânico]`")
    L.append("")
    L.append("| # | coluna | tipo | nulo | default | observação |")
    L.append("|--:|--------|------|:----:|---------|------------|")
    for c in cols:
        t = fmt_type(c["data_type"], c["udt_name"])
        nn = "" if c["is_nullable"]=="YES" else "NOT NULL"
        dflt = clean(c["column_default"]) or ""
        if len(dflt) > 48: dflt = dflt[:45] + "…"
        obs = []
        if c["col"] in pks: obs.append("**PK**")
        if c["col"] in fkmap:
            f = fkmap[c["col"]]
            rule = "" if f["delete_rule"]=="NO ACTION" else f" ‹on delete {f['delete_rule'].lower()}›"
            obs.append(f"FK → `{f['ref_table']}.{f['ref_col']}`{rule}")
        cm = ccomment.get((table, c["col"]))
        if cm: obs.append(cm)
        L.append(f"| {c['pos']} | `{c['col']}` | {t} | {'sim' if c['is_nullable']=='YES' else 'não'} | {('`'+dflt+'`') if dflt else '—'} | {' · '.join(obs) if obs else '—'} |")
    L.append("")
    # 4. Relacionamentos
    L.append("## Relacionamentos `[mecânico]`")
    L.append("")
    outs = fks_out[table]
    L.append("**Saindo (esta tabela referencia):**")
    L.append("")
    if outs:
        for f in sorted(outs, key=lambda x: x["col"]):
            rule = "" if f["delete_rule"]=="NO ACTION" else f" — on delete `{f['delete_rule']}`"
            L.append(f"- `{f['col']}` → `{f['ref_table']}.{f['ref_col']}`{rule}")
    else:
        L.append("- _nenhuma_")
    L.append("")
    ins = fks_in[table]
    L.append("**Entrando (referenciam esta tabela):**")
    L.append("")
    if ins:
        for f in sorted(ins, key=lambda x: (x["table_name"], x["col"])):
            L.append(f"- `{f['table_name']}.{f['col']}` → `{table}.{f['ref_col']}`")
    else:
        L.append("- _nenhuma_")
    L.append("")
    # 5. RLS
    L.append("## RLS — Row Level Security `[regra: mecânico]`")
    L.append("")
    pls = pol_by_t[table]
    if pls:
        for p in sorted(pls, key=lambda x: (x["cmd"], x["policyname"])):
            L.append(f"### `{p['policyname']}` — {p['cmd']} · roles: `{p['roles']}`")
            u = clean(p.get("using_expr")); ch = clean(p.get("check_expr"))
            if u: L.append(f"- **USING:** `{u}`")
            if ch: L.append(f"- **WITH CHECK:** `{ch}`")
            L.append("")
        L.append("**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).")
    else:
        L.append("- **Sem policies.** `❓ pendente` — RLS habilitada mas sem policy ⇒ nega tudo a não-service_role. Confirmar se é intencional (acesso só por service_role).")
    L.append("")
    # 6. Índices
    L.append("## Índices `[mecânico]`")
    L.append("")
    ix = idx_by_t[table]
    if ix:
        for i in sorted(ix, key=lambda x: x["indexname"]):
            L.append(f"- `{i['indexname']}` — `{clean(i['indexdef'])}`")
    else:
        L.append("- _nenhum_")
    uq = uniques(table)
    if uq:
        L.append("")
        L.append("**Constraints UNIQUE:** " + ", ".join(f"`{u}`" for u in uq))
    L.append("")
    # 7. Triggers
    L.append("## Triggers `[mecânico]`")
    L.append("")
    trs = TRIGGERS.get(table)
    if trs:
        for name, when, fn in trs:
            L.append(f"- `{name}` — {when} → `{fn}`")
    else:
        L.append("- _nenhum_")
    L.append("")
    # 8. Regras de negócio
    L.append("## Regras de negócio")
    L.append("")
    rc = real_checks(table)
    if rc:
        L.append("**CHECK constraints (regras explícitas no banco) `[mecânico]`:**")
        L.append("")
        for name, cc in rc:
            L.append(f"- `{name}`: `{cc}`")
        L.append("")
    L.append("`❓ pendente` — regras de negócio narrativas (o \"porquê\") a inferir na Fase 3 / confirmar com o humano.")
    L.append("")
    # 9. Perguntas pendentes
    L.append("## Perguntas pendentes")
    L.append("")
    qs = []
    if table in USAGE_Q:
        qs.append(f"❓ A tabela `{table}` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)")
    if not pls:
        qs.append(f"❓ `{table}` tem RLS habilitada e nenhuma policy — acesso é exclusivamente via `service_role`/RPC? Confirmar.")
    if qs:
        for q in qs: L.append(f"- {q}")
    else:
        L.append("- _(nenhuma registrada ainda)_")
    L.append("")
    # 10. Histórico
    L.append("## Histórico")
    L.append("")
    L.append("| data | evento |")
    L.append("|------|--------|")
    L.append(f"| {TODAY} | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |")
    L.append("")
    return "\n".join(L)

def fiche_matview(mv):
    purpose = MATMETA[mv][0]
    cols = sorted(matcols_by[mv], key=lambda c: c["pos"])
    L = []
    L += ["---", f"objeto: {mv}", "tipo: materialized_view", "schema: public",
          "status: existente", "tier: suporte", "dominio: bi", "rls_enabled: false",
          f"colunas: {len(cols)}", f"edge_functions: []", "prds_relacionados: [PRD-018]",
          f"atualizado_em: {TODAY}", "fonte_contexto: inferido", "---", ""]
    L.append(f"# `{mv}` (materialized view)")
    L.append("")
    L.append(f"> {purpose} `🔍 inferido (nome das colunas + RPC de leitura)`")
    L.append("")
    L.append("**Status:** existente · **Tier:** suporte · **Domínio:** bi (BI/analytics)")
    L.append("")
    L.append("## Descrição")
    L.append("")
    L.append(f"Materialized view de BI. Lida pela aplicação **somente via RPC `SECURITY DEFINER`** "
             f"`{mv}_read()` (escopo por loja aplicado na RPC); refresh agendado por `pg_cron`. "
             f"`🔍 inferido (factory.ts / CLAUDE.md — MVs lidas via RPCs scoped)`")
    L.append("")
    L.append("## Colunas `[mecânico]`")
    L.append("")
    L.append("| # | coluna | tipo |")
    L.append("|--:|--------|------|")
    for c in cols:
        L.append(f"| {c['pos']} | `{c['col']}` | {c['type']} |")
    L.append("")
    L.append("## Perguntas pendentes")
    L.append("")
    L.append(f"- ❓ Confirmar a definição/joins de origem de `{mv}` e a periodicidade do refresh (`pg_cron`).")
    L.append("")
    L.append("## Histórico")
    L.append("")
    L.append("| data | evento |")
    L.append("|------|--------|")
    L.append(f"| {TODAY} | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção. |")
    L.append("")
    return "\n".join(L)

n = 0
for table in META:
    open(os.path.join(TABLES, f"TABLE-{table}.md"), "w", encoding="utf-8").write(fiche_table(table))
    n += 1
for mv in MATMETA:
    open(os.path.join(TABLES, f"MATVIEW-{mv}.md"), "w", encoding="utf-8").write(fiche_matview(mv))
    n += 1
print(f"generated {n} fiches into {TABLES}")
# sanity: every public table has META
allpub = set(c["table_name"] for c in columns)
missing = allpub - set(META)
extra = set(META) - allpub
print("tables w/o META (should be empty):", sorted(missing))
print("META w/o table (should be empty):", sorted(extra))
