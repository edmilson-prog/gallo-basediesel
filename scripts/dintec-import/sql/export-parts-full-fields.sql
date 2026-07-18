-- scripts/dintec-import/sql/export-parts-full-fields.sql
-- Export dos produtos DINTEC ativos e identificáveis (REFERENCIA ou
-- PRODUTOECOMMERCE.DESCRICAO preenchidos) para CSV bruto delimitado por ';'.
-- Rodar via isql embedded (ver docs/db/GUIA-BANCO-TURBO-DIESEL.md §3):
--   isql.exe -user SYSDBA -password masterkey -ch WIN1252 -i export-parts-full-fields.sql "D:\claude\dintec\TURBO_DIESEL.FDB"
SET HEADING OFF;
OUTPUT 'D:\claude\gallo-basediesel\.claude\worktrees\dintec-import-pilot\scratchpad\dintec-parts-raw.txt';
SELECT CAST(
  CAST(p.CODPRO AS VARCHAR(10)) || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.REFERENCIA),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.MARCA),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(e.DESCRICAO),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(g.NOME),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.CUSTO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR3 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC3 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR4 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC4 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR5 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC5 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC2 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.NCM),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.ICMS AS NUMERIC(7,2)) AS VARCHAR(10)),'') || ';' ||
  -- TRIM force o ramo ELSE '' a sair vazio: como '1'/'0' são CHAR(1), o Firebird
  -- unifica o CASE para CHAR(1) e blank-pad o '' num espaço; TRIM remove esse pad.
  TRIM(CASE WHEN p.TIPOSUBST = 1 THEN '1' WHEN p.TIPOSUBST = 0 THEN '0' ELSE '' END) || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(CAST(p.ORIGEM_MERC AS VARCHAR(10))),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.PESO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.ESTMINIMO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.ESTMAXIMO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.APLICACAO),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(f.NOME),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '"'
AS VARCHAR(3000)) AS LINHA
FROM PRODUTO p
LEFT JOIN GRUPO g ON g.COD = p.CODGRUPO
LEFT JOIN PRODUTOECOMMERCE e ON e.CODPRO = p.CODPRO
LEFT JOIN (
  -- Um fornecedor por produto (o primeiro vínculo válido) — PRODUTOFORNECEDOR
  -- tem CODPRO sujo em parte das linhas: com letras/símbolos (ex.: "537/1",
  -- "*28307309") e também códigos de barras EAN só-dígitos de até 18 posições
  -- (ex.: 7896385005470). Como PRODUTO.CODPRO é INTEGER, o JOIN direto coage o
  -- CODPRO textual para número e quebra (SQLSTATE 22018). O CASE...SIMILAR TO
  -- '[0-9]+' guarda o CAST das linhas com símbolos; e o CAST é para BIGINT (não
  -- INTEGER) para não estourar INT32 nos EAN (SQLSTATE 22003). Linhas sujas
  -- viram NULL (não erram) e são descartadas antes do GROUP BY; barcodes viram
  -- um BIGINT que não casa com nenhum CODPRO real e ficam de fora do JOIN.
  SELECT clean.CODPRO, MIN(clean.CODFORNEC) AS CODFORNEC
  FROM (
    SELECT
      CASE WHEN pf.CODPRO SIMILAR TO '[0-9]+' THEN CAST(pf.CODPRO AS BIGINT) END AS CODPRO,
      pf.CODFORNEC
    FROM PRODUTOFORNECEDOR pf
  ) clean
  WHERE clean.CODPRO IS NOT NULL
  GROUP BY clean.CODPRO
) pfmin ON pfmin.CODPRO = p.CODPRO
LEFT JOIN FORNECEDOR f ON f.COD = pfmin.CODFORNEC
WHERE p.ATIVO = 'SIM'
  AND (CHAR_LENGTH(TRIM(COALESCE(p.REFERENCIA,''))) > 0 OR CHAR_LENGTH(TRIM(COALESCE(e.DESCRICAO,''))) > 0)
ORDER BY p.CODPRO;
OUTPUT;
