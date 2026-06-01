#!/usr/bin/env python3
"""Offline converter: UFI supplier .xlsx -> src/mocks/data/ufiPartsRaw.ts.

Reads the "Cotação Turbo Diesel" sheet, selects ~150 representative + rich
filter rows, normalizes them, and emits a TypeScript module of IUfiPartRow[].
Pure Python stdlib (zipfile + xml) — no third-party deps. Run from repo root:

    python3 scripts/import-ufi-parts.py
"""
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx"
OUT = ROOT / "src/mocks/data/ufiPartsRaw.ts"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

TARGET_TOTAL = 150
YEAR_CAP = 2025
HEADER_ROW = 3  # 1-based
FORCE_INCLUDE = {"23.290.00"}  # already validated in commit 94c2153

# Column indices (0-based) of the "Cotação Turbo Diesel" sheet.
COL = {
    "code": 0, "desc": 1, "segment": 2, "family": 3, "origUfi": 4, "origin": 5,
    "multiple": 6, "ncm": 7, "cst": 8, "gtin": 12, "weight": 13, "app": 16,
    "oe": 17, "price": 29,
}
BRAND_COLS = {
    18: "Mann", 19: "Hengst", 20: "Mahle", 21: "Tecfil", 22: "Vox", 23: "Fram",
    24: "Wega", 25: "Fleetguard", 26: "Parker", 27: "Donaldson",
}

# Family quotas (normalized subcategory -> share). Sums to 1.0.
FAMILY_QUOTA = {
    "ar": 0.33, "óleo": 0.19, "combustível": 0.17, "hidráulico": 0.13,
    "cabine": 0.11, "_other": 0.07,
}
SEGMENT_CANON = {
    "off road": "Off Road", "on road": "On Road",
    "linha leve": "Linha Leve", "linha pesada": "Linha Pesada",
    "linha pesada / off road": "Linha Pesada / Off Road",
}


def col_ref(ref):
    m = re.match(r"([A-Z]+)(\d+)", ref or "")
    if not m:
        raise ValueError(f"Unexpected cell ref: {ref!r}")
    c = 0
    for ch in m.group(1):
        c = c * 26 + (ord(ch) - 64)
    return c - 1, int(m.group(2))


def read_rows():
    if not XLSX.exists():
        raise SystemExit(f"[import-ufi-parts] xlsx not found: {XLSX}")
    with zipfile.ZipFile(XLSX) as z:
        try:
            shared = ["".join(t.text or "" for t in si.iter(f"{NS}t"))
                      for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si")]
        except KeyError:
            shared = []
        rows = {}
        for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(f"{NS}row"):
            for c in row.findall(f"{NS}c"):
                t = c.get("t")
                v = c.find(f"{NS}v")
                inl = c.find(f"{NS}is")
                val = ""
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr" and inl is not None:
                    val = "".join(x.text or "" for x in inl.iter(f"{NS}t"))
                elif v is not None:
                    val = v.text
                ci, ri = col_ref(c.get("r"))
                rows.setdefault(ri, {})[ci] = val
    return [r for ri, r in sorted(rows.items()) if ri > HEADER_ROW and (r.get(0, "") or "").strip()]


def g(row, col):
    return (row.get(COL[col], "") or "").strip()


def norm_family(family):
    f = family.lower()
    if "air" in f:
        return "ar"
    if "oil" in f:
        return "óleo"
    if "fuel" in f:
        return "combustível"
    if "cabin" in f:
        return "cabine"
    if "hydraulic" in f:
        return "hidráulico"
    if "separator" in f or "water" in f:
        return "separador"
    return None


def norm_segment(seg):
    return SEGMENT_CANON.get(seg.strip().lower(), seg.strip())


def fmt_ncm(raw):
    d = re.sub(r"\D", "", raw)
    if len(d) != 8:
        return None
    return f"{d[0:4]}.{d[4:6]}.{d[6:8]}"


def derive_st(cst):
    digits = re.sub(r"\D", "", cst)
    if not digits:
        return None
    trib = digits.zfill(3)[-2:]
    return trib in {"10", "30", "60", "70", "90"}


def parse_number(raw):
    raw = (raw or "").strip().replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_oe(raw):
    if not raw or raw.strip() in ("-", "N/C"):
        return []
    parts = re.split(r"[;/\n]", raw)
    out = []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip()
        if p and p != "-":
            out.append(p)
    seen, dedup = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            dedup.append(p)
    return dedup[:8]


def parse_applications(raw, cap=60):
    raw = (raw or "").strip()
    apps = []
    for grp in raw.split(" / "):
        grp = grp.strip().rstrip(".")
        if ":" not in grp:
            continue
        brand, rest = grp.split(":", 1)
        brand = brand.strip().title()
        if not brand:
            continue
        for ent in rest.split(";"):
            ent = ent.strip()
            if not ent:
                continue
            m = re.search(r"\((\d{4})\s*-\s*(>|\d{4})\)", ent)
            if m:
                ys = int(m.group(1))
                ye = YEAR_CAP if m.group(2) == ">" else int(m.group(2))
                model = ent[:m.start()].strip()
            else:
                model = ent
                ys, ye = 1990, YEAR_CAP
            model = re.sub(r"\s+", " ", model).strip()
            if not model:
                continue
            apps.append({"vehicleBrand": brand, "vehicleModel": model,
                         "yearStart": ys, "yearEnd": min(ye, YEAR_CAP)})
            if len(apps) >= cap:
                return apps
    return apps


def richness(row):
    score = 0
    for c in BRAND_COLS:
        if (row.get(c, "") or "").strip() not in ("", "-"):
            score += 1
    if g(row, "gtin") not in ("", "-"):
        score += 5
    if g(row, "oe") not in ("", "-", "N/C"):
        score += 3
    score += min(len(g(row, "app")) / 40, 10)
    return score


def normalize(row):
    cross = []
    for c, brand in BRAND_COLS.items():
        code = (row.get(c, "") or "").strip()
        if code and code != "-":
            cross.append({"brand": brand, "code": code})
    gtin = g(row, "gtin")
    weight = parse_number(g(row, "weight"))
    mult = parse_number(g(row, "multiple"))
    orig_ufi = g(row, "origUfi")
    oe = parse_oe(g(row, "oe"))
    reference = orig_ufi if orig_ufi not in ("", "-") else (oe[0] if oe else None)
    app_raw = g(row, "app")
    data = {
        "commercialCode": g(row, "code"),
        "description": g(row, "desc").title(),
        "segment": norm_segment(g(row, "segment")),
        "subcategory": norm_family(g(row, "family")),
        "origin": g(row, "origin"),
        "multiple": int(mult) if mult and mult > 0 else 1,
        "ncm": fmt_ncm(g(row, "ncm")),
        "taxSubstitution": derive_st(g(row, "cst")),
        "gtin": gtin if gtin not in ("", "-") else None,
        "weightKg": weight if weight and weight > 0 else None,
        "reference": reference,
        "oemCodes": oe,
        "crossReferences": cross,
        "applications": parse_applications(app_raw),
        "applicationNotes": re.sub(r"[ \t]+", " ", app_raw).strip(),
        "unitCost": round(parse_number(g(row, "price")) or 0, 2),
    }
    # Drop None-valued keys so the emitted TS omits them (absent -> undefined),
    # never `null` (which is not assignable to optional `T | undefined` under strict).
    # `False` is kept (only `None` is dropped).
    return {k: v for k, v in data.items() if v is not None}


def select(rows):
    valid = [r for r in rows if g(r, "code") and g(r, "desc") and (parse_number(g(r, "price")) or 0) > 0]
    by_family = {}
    for r in valid:
        fam = norm_family(g(r, "family")) or "_other"
        by_family.setdefault(fam if fam in FAMILY_QUOTA else "_other", []).append(r)
    chosen, codes = [], set()
    for fam, share in FAMILY_QUOTA.items():
        bucket = sorted(by_family.get(fam, []), key=richness, reverse=True)
        quota = round(TARGET_TOTAL * share)
        # Stratify by segment: round-robin across segments by descending score.
        by_seg = {}
        for r in bucket:
            by_seg.setdefault(norm_segment(g(r, "segment")), []).append(r)
        order = sorted(by_seg.values(), key=len, reverse=True)
        picked = []
        idx = 0
        while len(picked) < quota and any(idx < len(s) for s in order):
            for s in order:
                if idx < len(s) and len(picked) < quota:
                    picked.append(s[idx])
            idx += 1
        for r in picked:
            code = g(r, "code")
            if code not in codes:
                codes.add(code)
                chosen.append(r)
    # Force-include validated SKUs.
    for r in valid:
        code = g(r, "code")
        if code in FORCE_INCLUDE and code not in codes:
            codes.add(code)
            chosen.append(r)
    return chosen


def emit(parts):
    parts.sort(key=lambda p: p["commercialCode"])
    lines = [
        "// AUTO-GENERATED by scripts/import-ufi-parts.py — do not edit by hand.",
        '// Source: docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx (aba "Cotação Turbo Diesel").',
        '// Regenerate: python3 scripts/import-ufi-parts.py',
        'import type { IUfiPartRow } from "../generators/ufiPart";',
        "",
        f"export const UFI_PARTS_RAW: IUfiPartRow[] = {json.dumps(parts, ensure_ascii=False, indent=2)};",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")


def report(parts):
    fam = Counter(p.get("subcategory") or "(outros)" for p in parts)
    seg = Counter(p.get("segment") or "(?)" for p in parts)
    gtin = sum(1 for p in parts if p.get("gtin"))
    cross = sum(len(p["crossReferences"]) for p in parts) / max(len(parts), 1)
    apps = sum(len(p["applications"]) for p in parts) / max(len(parts), 1)
    print(f"=== SANITY REPORT: {len(parts)} parts ===")
    print("Por família:", dict(fam))
    print("Por segmento:", dict(seg))
    print(f"Com GTIN: {gtin} ({100 * gtin / max(len(parts),1):.0f}%)")
    print(f"Média cross-refs/peça: {cross:.1f}")
    print(f"Média aplicações/peça: {apps:.1f}")


def main():
    rows = read_rows()
    chosen = select(rows)
    parts = [normalize(r) for r in chosen]
    emit(parts)
    report(parts)
    print(f"\nWrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
