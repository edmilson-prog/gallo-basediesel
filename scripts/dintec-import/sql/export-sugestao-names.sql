-- scripts/dintec-import/sql/export-sugestao-names.sql
-- Export dos nomes de produto guardados em SUGESTAO — a fonte do "Nome Produto"
-- que aparece na tela de cadastro do DINTEC e que não existe em PRODUTO.
--
-- Contexto: o design spec de 2026-07-13 deu esse texto como inacessível ("vem de
-- consulta externa"). Ele está aqui, chaveado por CODPRO_SUGESTAO — CODPRO_BUSCA
-- é o produto que estava sendo pesquisado, NÃO o dono do nome. Sem este export,
-- 1.227 produtos ativos e com histórico de venda ficam fora do catálogo.
--
-- As 87.698 linhas cruas viram ~3.251 pares (produto, nome) distintos; a
-- contagem de ocorrências vai junto e serve de peso no desempate feito pela
-- engine pickSugestaoName (só 18 produtos discordam de si mesmos).
--
-- Rodar via isql embedded a partir da RAIZ do projeto (OUTPUT é relativo):
--   isql.exe -user SYSDBA -password masterkey -ch WIN1252 -i scripts/dintec-import/sql/export-sugestao-names.sql "D:\claude\dintec\TURBO_DIESEL.FDB"
SET HEADING OFF;
OUTPUT 'scratchpad/dintec-sugestao-raw.txt';
SELECT CAST(
  CAST(s.CODPRO_SUGESTAO AS VARCHAR(10)) || ';' ||
  '"' || REPLACE(REPLACE(REPLACE(TRIM(s.NOME),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' ') || '";' ||
  -- MAX e não MIN: '' perde para qualquer texto, então o agregado devolve a
  -- marca/aplicação preenchida quando só parte das linhas do nome a tem.
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(MAX(TRIM(s.MARCA)),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(MAX(TRIM(s.APLICACAO)),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  CAST(COUNT(*) AS VARCHAR(10))
AS VARCHAR(2000)) AS LINHA
FROM SUGESTAO s
WHERE CHAR_LENGTH(TRIM(COALESCE(s.NOME,''))) > 0
-- Agrupa só por (produto, nome): a contagem tem de pesar o NOME inteiro, senão
-- um mesmo nome escrito com duas marcas divide o próprio voto no desempate.
GROUP BY s.CODPRO_SUGESTAO,
         TRIM(s.NOME)
ORDER BY s.CODPRO_SUGESTAO;
OUTPUT;
