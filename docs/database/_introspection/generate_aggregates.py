"""
Bootstrap Fase 2 — generate aggregate outputs from the introspection dumps:
  - MODELO-DADOS-gallo-base-diesel.md  (master hierarchical index, by domain)
  - RLS-PANORAMA.md                    (consolidated access map)
  - ER-DOMINIOS.md                     (domain map + per-domain ER, mermaid)
All data-driven; no hand transcription.
"""
import json, os, re
from collections import defaultdict, OrderedDict
from generate_tables import (META, MATMETA, fks, policies, cols_by_t, clean)

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.dirname(HERE)
TODAY = "2026-06-17"

DOMAIN_LABEL = OrderedDict([
 ("platform","Plataforma & Multi-loja"),
 ("access","Pessoas & Acesso (RBAC)"),
 ("crm","CRM / Clientes"),
 ("vehicles","Veículos"),
 ("leads","Leads & Carteira"),
 ("conversations","Atendimento / WhatsApp"),
 ("sdr","SDR"),
 ("commercial","Comercial (pedidos/orçamentos)"),
 ("catalog","Catálogo (peças/kits)"),
 ("media","Mídia & Envio rápido"),
 ("finance","Financeiro"),
 ("notifications","Notificações"),
 ("ai","Inteligência artificial"),
 ("integrations","Integrações & Infra"),
 ("bi","BI / Analytics"),
])

bydom = defaultdict(list)
for t,(tier,dom,purpose,prds) in META.items():
    bydom[dom].append((t,tier,purpose,prds))
for mv,(p,) in MATMETA.items():
    bydom["bi"].append((mv,"suporte",p,"PRD-018"))

# ---------------- MASTER INDEX ----------------
def master():
    L = []
    L.append("# MODELO DE DADOS — GALLO BASE DIESEL")
    L.append("")
    L.append("> Índice mestre **hierárquico** (índice-de-índices por domínio) do schema `public`.")
    L.append("> Gerado pelo bootstrap (`docs/integracoes/BOOTSTRAP-BANCO-EXISTENTE.md`).")
    L.append(f"> Banco: Supabase `njizaasajkdqptlxddqn` (produção) · atualizado em {TODAY}.")
    L.append("")
    L.append("## Como navegar")
    L.append("")
    L.append("- **Ficha de tabela:** `tables/TABLE-<nome>.md` (o nome é o endereço).")
    L.append("- **Materialized view:** `tables/MATVIEW-<nome>.md`.")
    L.append("- **Funções (RPC/helper/trigger/cron):** `functions/CATALOG-db-functions.md`.")
    L.append("- **Edge Functions:** `functions/CATALOG-edge-functions.md`.")
    L.append("- **Segurança (RLS):** `RLS-PANORAMA.md`.")
    L.append("- **Diagramas:** `ER-DOMINIOS.md` (mapa de domínios + ER por domínio).")
    L.append("- **Contrato de completude / progresso:** `_MANIFESTO-BOOTSTRAP.md`.")
    L.append("")
    total_t = len(META); total_mv = len(MATMETA)
    L.append(f"## Domínios ({len(DOMAIN_LABEL)})")
    L.append("")
    L.append("| domínio | objetos | núcleo |")
    L.append("|---------|--------:|--------|")
    for dom,label in DOMAIN_LABEL.items():
        items = bydom.get(dom,[])
        nucleos = [t for t,tier,_,_ in items if tier=="nucleo"]
        L.append(f"| [{label}](#{dom}) | {len(items)} | {', '.join(f'`{n}`' for n in nucleos) if nucleos else '—'} |")
    L.append("")
    L.append(f"**Total:** {total_t} tabelas + {total_mv} materialized views.")
    L.append("")
    for dom,label in DOMAIN_LABEL.items():
        items = sorted(bydom.get(dom,[]), key=lambda x: (0 if x[1]=="nucleo" else 1, x[0]))
        L.append(f"## {label}")
        L.append(f'<a id="{dom}"></a>')
        L.append("")
        L.append("| objeto | tier | propósito | PRD |")
        L.append("|--------|------|-----------|-----|")
        for name,tier,purpose,prds in items:
            ismv = name.startswith("mv_")
            fiche = f"tables/{'MATVIEW' if ismv else 'TABLE'}-{name}.md"
            badge = {"nucleo":"**núcleo**","suporte":"suporte","estrutural":"estrutural","suspeita-morta":"⚠ suspeita-morta"}.get(tier,tier)
            L.append(f"| [`{name}`]({fiche}) | {badge} | {purpose} | {prds} |")
        L.append("")
    return "\n".join(L)

# ---------------- RLS PANORAMA ----------------
def classify(q):
    if q is None: return set()
    ql = q.lower(); s=set()
    if "is_staff" in ql: s.add("staff")
    if "current_seller_id" in ql: s.add("seller")
    if "current_store_id" in ql: s.add("store")
    if "can_access_conversation" in ql: s.add("conv")
    if "seller_handles" in ql: s.add("handles")
    if "current_app_role" in ql: s.add("owner?")
    if "accessible_account" in ql: s.add("acct")
    if "auth.uid" in ql: s.add("self")
    if q.strip().lower()=="true": s.add("OPEN")
    if q.strip().lower()=="false": s.add("DENY")
    if "active = true" in ql: s.add("anon-active")
    return s
pol_by_t = defaultdict(list)
for p in policies: pol_by_t[p["tablename"]].append(p)

def rls_panorama():
    L = []
    L.append("# Panorama de RLS — GALLO BASE DIESEL")
    L.append("")
    L.append("> Mapa consolidado de Row Level Security do schema `public` — a história de segurança do")
    L.append(f"> banco em um lugar. Regras = `[mecânico]` (introspecção de `pg_policies`). Gerado {TODAY}.")
    L.append("")
    L.append("## Helpers de escopo (SQL functions) `🔍 inferido (uso nas policies + CLAUDE.md)`")
    L.append("")
    L.append("As policies não repetem lógica: delegam a funções helper. **Toda tabela de negócio é")
    L.append("isolada por loja**; staff e dono ampliam; conversas têm regra própria.")
    L.append("")
    L.append("| helper | retorna | papel |")
    L.append("|--------|---------|-------|")
    L.append("| `current_store_id()` | uuid | loja do usuário logado (claim do JWT) — base do isolamento multi-loja |")
    L.append("| `current_seller_id()` | uuid | seller do usuário logado |")
    L.append("| `current_app_role()` | text | papel base do JWT (`owner`/`manager`/…) |")
    L.append("| `is_staff()` | boolean | papel é staff (amplia escopo dentro da loja) |")
    L.append("| `can_access_conversation(uuid)` | boolean | SD — acesso a conversa/mensagens (multi-instância: atribuído, participante, regras por número) |")
    L.append("| `seller_handles_customer/lead(uuid)` | boolean | SD — atendente lê cliente/lead vinculado por conversa sem ter a carteira |")
    L.append("")
    L.append("## Padrão por tabela `[mecânico]`")
    L.append("")
    L.append("Sinais: **store** (isolado por loja) · **seller** (dono/escopo próprio) · **staff** (staff amplia) ·")
    L.append("**conv** (`can_access_conversation`) · **handles** (`seller_handles_*`) · **owner?** (`current_app_role`) ·")
    L.append("**self** (`auth.uid`) · **OPEN** (leitura aberta a autenticados) · **anon-active** (leitura anônima de ativos).")
    L.append("")
    SIGN = {"DELETE":"D","INSERT":"I","SELECT":"S","UPDATE":"U","ALL":"ALL"}
    for dom,label in DOMAIN_LABEL.items():
        tabs = sorted([t for (t,_,_,_) in bydom.get(dom,[]) if not t.startswith("mv_")])
        if not tabs: continue
        L.append(f"### {label}")
        L.append("")
        L.append("| tabela | policies | SELECT | escrita (I/U/D) | notas |")
        L.append("|--------|---------:|--------|-----------------|-------|")
        for t in tabs:
            pls = pol_by_t.get(t,[])
            sel = set(); wr = set(); notes=[]
            for p in pls:
                sig = classify(p.get("using_expr")) | classify(p.get("check_expr"))
                if p["cmd"] in ("SELECT","ALL"): sel |= classify(p.get("using_expr"))
                if p["cmd"] in ("INSERT","UPDATE","DELETE","ALL"): wr |= sig
                if p["cmd"]=="DELETE" and clean(p.get("using_expr"))=="false": notes.append("delete bloqueado")
                if p["cmd"]=="UPDATE" and clean(p.get("using_expr"))=="false": notes.append("update bloqueado")
                if "anon-active" in classify(p.get("using_expr")): notes.append("leitura anônima (vitrine)")
            if not pls: notes.append("**sem policy** (só service_role)")
            def fmt(s): return ", ".join(sorted(s)) if s else "—"
            L.append(f"| `{t}` | {len(pls)} | {fmt(sel)} | {fmt(wr)} | {'; '.join(sorted(set(notes))) if notes else '—'} |")
        L.append("")
    L.append("## Leituras de destaque `🔍 inferido`")
    L.append("")
    L.append("- **Imutabilidade da auditoria:** `audit_logs` bloqueia UPDATE/DELETE (USING `false`) — só INSERT/SELECT.")
    L.append("- **Vitrine pública:** `parts` tem policy extra `parts_select_anon` (leitura anônima de `active = true`).")
    L.append("- **Owner-only:** `ai_settings`, `ai_usage_events`, `integration_logs` restritas via `current_app_role()`.")
    L.append("- **Conversas:** `conversations`/`messages` não usam store direto no SELECT — delegam a `can_access_conversation()` (multi-instância).")
    L.append("- **Leitura aberta a autenticados:** `roles`, `role_permissions`, `rbac_resources`, `departments`, `rotation_queues`, `rotation_participants`, `vehicle_models` (escrita restrita a staff/owner).")
    L.append("- **`processed_events`:** RLS habilitada e **sem policy** ⇒ acessível só por `service_role` (webhook). Confirmar intenção.")
    L.append("")
    return "\n".join(L)

# ---------------- ER PER DOMAIN ----------------
def er():
    dom_of = {t:dom for t,(_,dom,_,_) in META.items()}
    L = []
    L.append("# Diagramas ER por domínio — GALLO BASE DIESEL")
    L.append("")
    L.append(f"> Mapa de domínios + ER por domínio (mermaid). Gerado de FKs reais ({TODAY}).")
    L.append("> Um único ER de 54 tabelas seria ilegível — o detalhe mora em cada domínio.")
    L.append("")
    # domain map: cross-domain edges
    cross = defaultdict(int)
    for f in fks:
        a = dom_of.get(f["table_name"]); b = dom_of.get(f["ref_table"])
        if a and b and a!=b: cross[(a,b)] += 1
    L.append("## Mapa de domínios")
    L.append("")
    L.append("```mermaid")
    L.append("flowchart LR")
    for dom,label in DOMAIN_LABEL.items():
        L.append(f'  {dom}["{label}"]')
    for (a,b),n in sorted(cross.items(), key=lambda x:-x[1]):
        L.append(f"  {a} --> {b}")
    L.append("```")
    L.append("")
    L.append("_Seta A → B = alguma tabela do domínio A referencia (FK) uma do domínio B._")
    L.append("")
    # per-domain ER
    for dom,label in DOMAIN_LABEL.items():
        tabs = [t for t,(_,d,_,_) in META.items() if d==dom]
        if not tabs: continue
        tabset = set(tabs)
        L.append(f"## {label}")
        L.append("")
        L.append("```mermaid")
        L.append("flowchart TD")
        for t in sorted(tabs):
            L.append(f'  {t}["{t}"]')
        # edges where source in domain (incl crossing out), label = col
        seen=set()
        for f in fks:
            if f["table_name"] in tabset:
                key=(f["table_name"],f["ref_table"],f["col"])
                if key in seen: continue
                seen.add(key)
                tgt = f["ref_table"]
                if tgt not in tabset:
                    L.append(f'  {tgt}["{tgt} ⟨{dom_of.get(tgt,"?")}⟩"]')
                L.append(f'  {f["table_name"]} -->|{f["col"]}| {tgt}')
        L.append("```")
        L.append("")
    return "\n".join(L)

open(os.path.join(DB,"MODELO-DADOS-gallo-base-diesel.md"),"w",encoding="utf-8").write(master())
open(os.path.join(DB,"RLS-PANORAMA.md"),"w",encoding="utf-8").write(rls_panorama())
open(os.path.join(DB,"ER-DOMINIOS.md"),"w",encoding="utf-8").write(er())
print("aggregates: MODELO-DADOS, RLS-PANORAMA, ER-DOMINIOS written")
