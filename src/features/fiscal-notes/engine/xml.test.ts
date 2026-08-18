import { describe, expect, it } from "vitest";
import { child, children, num, parseXml, text } from "./xml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <!-- comentário deve ser ignorado -->
  <NFe>
    <infNFe Id="NFe35260804887213000190550010000301291000301298" versao="4.00">
      <ide><nNF>30129</nNF><serie>1</serie><dhEmi>2026-08-14T09:12:00-03:00</dhEmi></ide>
      <emit>
        <CNPJ>04887213000190</CNPJ>
        <xNome><![CDATA[DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA]]></xNome>
        <xFant>Dieseltec &amp; Cia</xFant>
        <enderEmit><xLgr>Av. Brasil Oeste</xLgr><nro>2840</nro></enderEmit>
      </emit>
      <det nItem="1"><prod><cProd>RC-R60T</cProd><qCom>2.0000</qCom></prod></det>
      <det nItem="2"><prod><cProd>BI-0445120212</cProd><qCom>4.0000</qCom></prod></det>
      <total><ICMSTot><vFrete>182.20</vFrete><vDesc>0.00</vDesc></ICMSTot></total>
      <infAdic/>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseXml", () => {
  it("builds a tree and strips the namespace prefix from tags", () => {
    const root = parseXml(SAMPLE);
    expect(root.children[0]?.tag).toBe("nfeProc");
  });

  it("reads attributes", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(inf?.attrs.Id).toBe("NFe35260804887213000190550010000301291000301298");
    expect(inf?.attrs.versao).toBe("4.00");
  });

  it("ignores comments and the XML declaration", () => {
    const proc = child(parseXml(SAMPLE), "nfeProc");
    expect(proc?.children.map((c) => c.tag)).toEqual(["NFe"]);
  });

  it("reads CDATA as plain text", () => {
    const root = parseXml(SAMPLE);
    expect(text(root, "nfeProc", "NFe", "infNFe", "emit", "xNome")).toBe(
      "DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA",
    );
  });

  it("decodes entities", () => {
    const root = parseXml(SAMPLE);
    expect(text(root, "nfeProc", "NFe", "infNFe", "emit", "xFant")).toBe("Dieseltec & Cia");
  });

  it("handles self-closing tags without corrupting the stack", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(inf?.children.map((c) => c.tag)).toEqual([
      "ide",
      "emit",
      "det",
      "det",
      "total",
      "infAdic",
    ]);
  });

  it("returns every repeated child with children()", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    const dets = children(inf!, "det");
    expect(dets).toHaveLength(2);
    expect(text(dets[1], "prod", "cProd")).toBe("BI-0445120212");
  });

  it("reads numbers, defaulting missing nodes to zero", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(num(inf, "total", "ICMSTot", "vFrete")).toBe(182.2);
    expect(num(inf, "total", "ICMSTot", "vST")).toBe(0);
  });

  it("returns empty string for a missing path instead of throwing", () => {
    expect(text(parseXml(SAMPLE), "nfeProc", "nope", "nada")).toBe("");
  });
});
