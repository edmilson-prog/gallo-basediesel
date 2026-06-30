"""Fase 2 closeout — update the manifesto: correct table count (54), flip object
statuses to gerado/catalogado, repoint function rows to the catalogs."""
import os, re
DB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(DB, "_MANIFESTO-BOOTSTRAP.md")
t = open(p, encoding="utf-8").read()

# count fix
t = t.replace("| Tabelas `public` | 55 |", "| Tabelas `public` | 54 |")
t = t.replace("## Tabelas — schema `public` (55)", "## Tabelas — schema `public` (54)")
t = t.replace("**Núcleo (10):**", "**54 tabelas · Núcleo (10):**")

out = []
for line in t.split("\n"):
    if ("tables/TABLE-" in line or "tables/MATVIEW-" in line) and "| pendente |" in line:
        line = line.replace("| pendente |", "| gerado |")
    elif "functions/FUNCTION-edge-" in line:
        line = re.sub(r"functions/FUNCTION-edge-[^ |]+\.md", "functions/CATALOG-edge-functions.md", line)
        line = line.replace("| pendente |", "| catalogado |")
    elif "functions/FUNCTION-" in line:
        line = re.sub(r"functions/FUNCTION-[^ |]+\.md", "functions/CATALOG-db-functions.md", line)
        line = line.replace("| pendente |", "| catalogado |")
    out.append(line)
t = "\n".join(out)

# progress: mark Fase 2 done
t = t.replace(
"- [ ] **Fase 2 — Esqueleto mecânico**: gerar fichas (colunas/FKs/índices/constraints/triggers/RLS)\n      + índice mestre hierárquico + ER por domínio + panorama de RLS + catálogo de edge functions.",
"- [x] **Fase 2 — Esqueleto mecânico** (2026-06-17): 54 fichas de tabela + 3 de matview geradas por\n      script (`_introspection/`); índice mestre (`MODELO-DADOS-gallo-base-diesel.md`), panorama de RLS\n      (`RLS-PANORAMA.md`), ER por domínio (`ER-DOMINIOS.md`), catálogos de funções DB e Edge.")

open(p, "w", encoding="utf-8").write(t)
print("manifesto updated")
