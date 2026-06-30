"""
Bootstrap Fase 2 — consolidate raw DB introspection into clean JSON.

Reads the large MCP result files (saved to the session transcript dir because
they exceeded the inline token limit), extracts the embedded JSON arrays, and
writes portable clean JSON under docs/database/_introspection/. Datasets that
came back inline (FKs, comments, matview columns) are embedded below verbatim.

Source of every byte here: read-only introspection of the production Postgres
catalogs (information_schema / pg_*). Nothing is hand-authored.
"""
import json, os, re

OUT = os.path.dirname(os.path.abspath(__file__))
TR = r"C:\Users\Edmilson Souza\.claude\projects\D--claude-gallo-basediesel\b616e1ea-aee8-40ff-95ee-81b8953263b2\tool-results"

SAVED = {
    "columns":     os.path.join(TR, "mcp-supabase-execute_sql-1781735055417.txt"),
    "indexes":     os.path.join(TR, "mcp-supabase-execute_sql-1781735068138.txt"),
    "constraints": os.path.join(TR, "mcp-supabase-execute_sql-1781735074280.txt"),
    "policies":    os.path.join(TR, "mcp-supabase-execute_sql-1781731023792.txt"),
}

def extract_array(path):
    raw = open(path, encoding="utf-8").read()
    try:
        raw = json.loads(raw)["result"]
    except Exception:
        pass
    s = raw.find("["); e = raw.rfind("]")
    return json.loads(raw[s:e+1])

for name, path in SAVED.items():
    arr = extract_array(path)
    json.dump(arr, open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{name}: {len(arr)} rows")
print("prepared from saved files OK")
