# Guia de Consultas — Banco Turbo Diesel (ERP FarolTI)

> **Objetivo:** permitir que qualquer agente, **sem contexto prévio**, conecte ao banco
> `TURBO_DIESEL.FDB` e faça consultas/exportações corretas sem precisar reinvestigar o schema.
> Leia as seções **2 (Ambiente)**, **4 (Regras de ouro)** e **6 (Receitas)** antes de qualquer query.

---

## 1. O que é este banco

- Banco de um **ERP da FarolTI** usado por uma oficina/loja de **diesel e autopeças** ("Turbo Diesel").
- Motor: **Firebird 4.0.0** (ODS 13.0), restaurado de `TURBO_DIESEL.fbk` (backup `gbak` formato 11 = FB4).
- Volume: **654 tabelas de usuário**, ~3.167 clientes, ~8.877 notas fiscais, ~8.373 produtos, ~603 fornecedores, 26 funcionários.
- **Tratar como SOMENTE LEITURA por padrão.** Confirmar com o usuário antes de qualquer `INSERT/UPDATE/DELETE`.

---

## 2. Ambiente e pré-requisitos

| Item | Caminho / valor |
|---|---|
| Banco (cópia de trabalho) | `D:\claude\dintec\TURBO_DIESEL.FDB` |
| Backup original | `D:\claude\dintec\TURBO_DIESEL.fbk` |
| Binários Firebird 4 (isql/gbak) | `C:\Program Files (x86)\Firebird\Firebird_4_0_FarolTI\` |
| Usuário / senha | `SYSDBA` / `masterkey` (**ignorados** em modo embedded) |
| **Charset obrigatório** | `WIN1252` (sem ele os acentos saem corrompidos) |

**Atenção ao ambiente da máquina (3 instalações de Firebird):**
- Porta **3050** = Firebird **2.5** — **NÃO** abre este banco (ODS 13 é de FB4).
- Porta **3060** = Firebird **4.0** FarolTI — instância correta para conexões de rede.
- Use **sempre** o `isql.exe`/`gbak.exe` da pasta `Firebird_4_0_FarolTI`. O `gds32.dll`/cliente 2.5 não serve.
- Existe também o banco do usuário em `D:\Downloads\TURBO_DIESEL\TURBO_DIESEL.FDB` (IBExpert) — **não** mexer nesse a nível de arquivo enquanto em uso. Trabalhe sempre na cópia `D:\claude\dintec\`.

---

## 3. Como rodar uma consulta (passo a passo)

O método mais confiável é **embedded** (sem servidor), via `isql` lendo um script `.sql`:

1. Escreva sua query num arquivo `.sql` (ex.: no scratchpad da sessão). Comece com `SET LIST ON;` para saída legível em formato chave/valor.
2. Execute (Git Bash):

```bash
FIREBIRD="/c/Program Files (x86)/Firebird/Firebird_4_0_FarolTI"
"$FIREBIRD/isql.exe" -user SYSDBA -password masterkey -ch WIN1252 \
  -i "CAMINHO\\DO\\SCRIPT.sql" "D:\\claude\\dintec\\TURBO_DIESEL.FDB" 2>&1
```

3. Para **exportar para arquivo**, use `OUTPUT` dentro do script (ver Seção 7).

> **Conexão de rede** (alternativa, p/ IBExpert/app): `127.0.0.1/3060:D:\claude\dintec\TURBO_DIESEL.FDB`,
> usuário `SYSDBA`. Em rede a senha **é** exigida (a do SYSDBA da instância FB4). Prefira embedded para automação.

---

## 4. Regras de ouro (armadilhas que vão te pegar)

1. **Acentos:** sempre `-ch WIN1252` no isql. Para gerar arquivos finais, converta para **UTF-8 com BOM** no pós-processamento (Seção 7).
2. **Nome do cliente NÃO está na tabela `CLIENTE`.** Ela não tem coluna de razão social/nome. O nome está **desnormalizado**:
   - `NOTAFISCAL.NOME` (nome do destinatário na nota) — melhor cobertura para quem comprou.
   - `NFISCAL.NOMECLI` (nas ordens de serviço) — fallback.
   - `CLIENTE.FANTASIA` — preenchido em só ~857/3167 (basicamente PJ).
3. **Venda = `NOTAFISCAL` com `ENTSAIDA = 'SAIDA'`.** O campo é uma **string** (`'SAIDA'`/`'ENTRADA'`), **não** `'S'`/`'E'`. Filtre também `CODCLI > 0`. Valor monetário limpo = `TOTALNOTA` (numeric).
4. **Campos preenchidos com ZEROS** em vez de NULL: `CPF`, `CNPJ`, `CEP`, `TELEFONE`, `CELULAR` vêm como `00000000000000` quando não informados. Trate "só zeros" como vazio:
   `CHAR_LENGTH(REPLACE(TRIM(x),'0','')) > 0` → tem valor real. **PJ/PF deve ser derivado disso**, não de "campo não vazio".
5. **Tabelas que parecem úteis mas estão VAZIAS:** `REPRESENTANTECLIENTE`, `VENDACLIENTE`, `ITENSNOTAFISCAL`. Não dependa delas.
6. **Vendedor responsável não é confiável no cadastro:** `CLIENTE.CODFUN` preenchido em só ~2/3167. `NOTAFISCAL` não tem coluna de vendedor. Em OS o vendedor/técnico está em `NFISCAL.CODFUN`. Nome do vendedor → `FUNCIONARIO(CODFUN, NOME)`. Se precisar de vendedor por cliente, terá que **inferir** (ex.: funcionário mais frequente nas OS do cliente).
7. **isql padroniza a largura da linha** (preenche com espaços até a largura da coluna). Ao exportar texto concatenado, faça `TrimEnd()` por linha no PowerShell.
8. **`OUTPUT` só grava o arquivo ao final da query** — durante a execução o arquivo fica com 0 bytes. Não confunda com erro.
9. **Performance:** queries pesadas (window functions + agregações sobre toda a base) podem passar de **2 minutos**. Rode em **background** e aguarde, em vez de foreground (que estoura no timeout de 120s). Evite matar o isql no meio (deixa transação pendente e a próxima query fica lenta por garbage collection).
10. **`NFISCAL.VALOR` é FLOAT** (impreciso). Para dinheiro, prefira `NOTAFISCAL.TOTALNOTA` (numeric).
11. **Datas:** para saída ISO (`YYYY-MM-DD`) e evitar formato local, monte manualmente com `EXTRACT` + `RIGHT('0'||...,2)` (ver receitas).

---

## 5. Mapa das tabelas essenciais

> Para ver TODAS as colunas de uma tabela, use a query de discovery na Seção 8.

### `CLIENTE` — cadastro (PK `CODCLI`) — **sem coluna de nome**
Colunas úteis confirmadas: `CODCLI`, `FANTASIA`, `CPF`, `CNPJ`, `CONTATO`, `ENDERECO`, `BAIRRO`, `CIDADE`,
`ESTADO`, `CEP`, `TELEFONE`, `CELULAR`, `EMAIL`, `ATIVO` (ciclo de vida), `DATACADASTRO` (cliente desde),
`CREDITO` (limite de crédito; preenchido só em parte), `CODFUN` (quase vazio), `COMISSAO`.
`TIPOCLIENTE` existe mas está **vazio** em toda a base.

### `NOTAFISCAL` — notas fiscais / faturamento (a fonte de receita)
Colunas-chave confirmadas: `COD` (PK interno), `DATA`, `CODCLI`, `NOME` (nome do cliente na nota),
`TOTALNOTA` (valor total, numeric), `ENTSAIDA` (`'SAIDA'`/`'ENTRADA'`), `COD_EMPRESA` (multiempresa/loja).
~8.877 linhas; saídas com cliente ≈ 8.851; faturamento total de saídas ≈ R$ 29,5 mi; período ~2022 → atual.

### `NFISCAL` — ordens de serviço / itens de OS (10.397 linhas)
Colunas: `NF`, `CODCLI`, `CODPRO` (produto), `VALOR` (FLOAT), `NOMECLI` (nome do cliente),
`DATAENT`, `DATASAI`, `TECNICO`, `PLACA`, `KM`, `CODFUN`. É a melhor fonte de **nome do cliente** (fallback) e de **itens/produtos por atendimento**.

### `PRODUTO` — cadastro de produtos (PK `CODPRO`, 8.373 itens)
Colunas úteis: `CODPRO`, `REFERENCIA`, `MARCA`, faixas de preço `VALOR3/VALOR4/VALOR5`.
(O nome/descrição do produto está numa coluna própria — confirme via discovery; há `NOMEDCB` entre outras.)

### `FUNCIONARIO` — funcionários/vendedores (PK `CODFUN`, 26)
Colunas: `CODFUN`, `NOME`. Use para resolver o nome de um vendedor/técnico (`NFISCAL.CODFUN`).

### `FORNECEDOR` — fornecedores (603). | `ESTOQUE` — saldos de estoque.

---

## 6. Receitas prontas (copie e adapte)

### 6.1 Nome + cadastro de um cliente
```sql
SET LIST ON;
SELECT c.CODCLI,
       COALESCE(
         (SELECT MIN(n.NOME)    FROM NOTAFISCAL n WHERE n.CODCLI=c.CODCLI AND CHAR_LENGTH(TRIM(n.NOME))>0),
         (SELECT MIN(nf.NOMECLI) FROM NFISCAL nf  WHERE nf.CODCLI=c.CODCLI AND CHAR_LENGTH(TRIM(nf.NOMECLI))>0),
         NULLIF(TRIM(c.FANTASIA),'')
       ) AS NOME,
       c.CPF, c.CNPJ, c.CONTATO, c.CIDADE, c.ESTADO,
       c.CREDITO AS LIMITE_CREDITO, c.DATACADASTRO AS CLIENTE_DESDE, c.ATIVO
FROM CLIENTE c
WHERE c.CODCLI = 87;   -- troque pelo CODCLI desejado
```

### 6.2 Métricas de compra de um cliente (LTV, ticket, frequência, recência)
```sql
SET LIST ON;
SELECT COUNT(*)              AS FREQUENCIA,
       SUM(TOTALNOTA)        AS LTV,
       AVG(TOTALNOTA)        AS TICKET_MEDIO,
       MIN(DATA)             AS PRIMEIRA_COMPRA,
       MAX(DATA)             AS ULTIMA_COMPRA,
       CURRENT_DATE - MAX(DATA) AS RECENCIA_DIAS
FROM NOTAFISCAL
WHERE CODCLI = 87 AND ENTSAIDA = 'SAIDA';
```

### 6.3 Curva ABC de toda a base (Pareto por faturamento)
```sql
SET LIST ON;
WITH v AS (
  SELECT CODCLI, SUM(TOTALNOTA) AS LTV
  FROM NOTAFISCAL WHERE ENTSAIDA='SAIDA' AND CODCLI>0 GROUP BY CODCLI
),
a AS (
  SELECT CODCLI, LTV,
         SUM(LTV) OVER (ORDER BY LTV DESC) AS ACUM,
         SUM(LTV) OVER ()                   AS TOT
  FROM v
)
SELECT CODCLI, LTV,
       CAST(100.0*LTV/TOT  AS NUMERIC(7,4)) AS PCT_RECEITA,
       CAST(100.0*ACUM/TOT AS NUMERIC(7,4)) AS PCT_ACUMULADO,
       CASE WHEN 100.0*ACUM/TOT <= 80 THEN 'A'
            WHEN 100.0*ACUM/TOT <= 95 THEN 'B'
            ELSE 'C' END AS CURVA_ABC
FROM a ORDER BY LTV DESC;
-- Distribuição típica: A=375 clientes (80% receita), B=523 (15%), C=1027 (5%).
```

### 6.4 Evolução mensal de compras (últimos 12 meses) de um cliente
```sql
SET LIST ON;
SELECT EXTRACT(YEAR FROM DATA) AS ANO, EXTRACT(MONTH FROM DATA) AS MES,
       COUNT(*) AS NOTAS, SUM(TOTALNOTA) AS VALOR
FROM NOTAFISCAL
WHERE CODCLI=87 AND ENTSAIDA='SAIDA' AND DATA >= DATEADD(-12 MONTH TO CURRENT_DATE)
GROUP BY 1,2 ORDER BY 1,2;
```

### 6.5 Top clientes por faturamento
```sql
SET LIST ON;
SELECT FIRST 20 n.CODCLI, COUNT(*) AS NOTAS, SUM(n.TOTALNOTA) AS LTV, MAX(n.DATA) AS ULTIMA
FROM NOTAFISCAL n
WHERE n.ENTSAIDA='SAIDA' AND n.CODCLI>0
GROUP BY n.CODCLI ORDER BY 3 DESC;
```

---

## 7. Exportar para CSV (técnica completa, pronta para importar em outra plataforma)

Padrão validado que gerou `D:\claude\dintec\clientes_enriquecidos.csv` (2.410 clientes, cadastro + métricas + curva ABC).

**Passo A — script SQL** que monta cada linha como texto delimitado (`;`), escapando aspas (`"`→`""`)
e removendo CR/LF, e grava em arquivo bruto via `OUTPUT`. Modelo da estrutura:

```sql
SET HEADING OFF;
OUTPUT 'C:\caminho\scratchpad\saida_raw.txt';
WITH v AS (
  SELECT CODCLI, COUNT(*) AS NOTAS, SUM(TOTALNOTA) AS LTV, AVG(TOTALNOTA) AS TICKET,
         MIN(DATA) AS PRIMEIRA, MAX(DATA) AS ULTIMA, MIN(NOME) AS NOMENF
  FROM NOTAFISCAL WHERE ENTSAIDA='SAIDA' AND CODCLI>0 GROUP BY CODCLI
),
abc AS (
  SELECT CODCLI, LTV, SUM(LTV) OVER (ORDER BY LTV DESC) AS ACUM, SUM(LTV) OVER () AS TOT FROM v
),
nm AS (
  SELECT CODCLI, MIN(NOMECLI) AS NOMECLI FROM NFISCAL WHERE CHAR_LENGTH(TRIM(NOMECLI))>0 GROUP BY CODCLI
)
SELECT CAST(
  CAST(c.CODCLI AS VARCHAR(10)) || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(v.NOMENF, nm.NOMECLI, c.FANTASIA)),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  -- ... demais colunas no mesmo padrão ...
  -- limpeza de zeros:        (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CPF,'')),'0','')) > 0 THEN TRIM(c.CPF) ELSE '' END)
  -- PJ/PF:                   (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CNPJ,'')),'0','')) > 0 THEN 'PJ'
  --                                WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CPF,'')),'0','')) > 0 THEN 'PF' ELSE '' END)
  -- data ISO:               COALESCE(CAST(EXTRACT(YEAR FROM c.DATACADASTRO) AS VARCHAR(4))||'-'||RIGHT('0'||CAST(EXTRACT(MONTH FROM c.DATACADASTRO) AS VARCHAR(2)),2)||'-'||RIGHT('0'||CAST(EXTRACT(DAY FROM c.DATACADASTRO) AS VARCHAR(2)),2),'')
  -- número 2 casas:         CAST(CAST(COALESCE(v.LTV,0) AS NUMERIC(15,2)) AS VARCHAR(20))
  -- curva ABC:              CASE WHEN a.LTV IS NULL THEN '' WHEN 100.0*a.ACUM/a.TOT<=80 THEN 'A' WHEN 100.0*a.ACUM/a.TOT<=95 THEN 'B' ELSE 'C' END
  ''
AS VARCHAR(1500)) AS LINHA
FROM CLIENTE c
LEFT JOIN v   ON v.CODCLI=c.CODCLI
LEFT JOIN abc a ON a.CODCLI=c.CODCLI
LEFT JOIN nm  ON nm.CODCLI=c.CODCLI
WHERE CHAR_LENGTH(TRIM(COALESCE(v.NOMENF, nm.NOMECLI, c.FANTASIA, ''))) > 0
ORDER BY COALESCE(v.LTV,0) DESC, c.CODCLI;
OUTPUT;
```
> O script completo e funcional desta exportação está versionado no scratchpad da sessão que o criou
> (`export_clientes.sql`). Reaproveite-o como base.

**Passo B — pós-processamento PowerShell** (remove padding do isql, adiciona cabeçalho, grava UTF-8 BOM):

```powershell
$raw = "C:\caminho\scratchpad\saida_raw.txt"
$out = "D:\claude\dintec\saida.csv"
$header = "COL1;COL2;COL3"   # cabeçalho com os nomes das colunas
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$lines = [System.IO.File]::ReadAllLines($raw, $enc1252)
$clean = $lines | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ -ne '' }
$final = ,$header + $clean
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($out, $final, $utf8Bom)
```

**Convenções do CSV gerado:** separador `;`, texto entre aspas, datas ISO `YYYY-MM-DD`,
decimais com **ponto** (`.`), UTF-8 com BOM (abre direto no Excel pt-BR).

---

## 8. Como descobrir o que não está documentado

**Listar colunas de uma tabela:**
```sql
SELECT TRIM(rf.RDB$FIELD_NAME) AS COL, TRIM(f.RDB$FIELD_TYPE) AS TIPO, f.RDB$FIELD_LENGTH AS TAM
FROM RDB$RELATION_FIELDS rf
JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
WHERE rf.RDB$RELATION_NAME = 'NOME_DA_TABELA'
ORDER BY rf.RDB$FIELD_POSITION;
```

**Procurar tabelas por palavra-chave:**
```sql
SELECT TRIM(rdb$relation_name) FROM rdb$relations
WHERE rdb$system_flag=0 AND rdb$relation_name LIKE '%PALAVRA%' ORDER BY 1;
```

**Procurar colunas por palavra-chave em toda a base:**
```sql
SELECT TRIM(rf.RDB$RELATION_NAME), TRIM(rf.RDB$FIELD_NAME)
FROM RDB$RELATION_FIELDS rf JOIN RDB$RELATIONS r ON r.RDB$RELATION_NAME=rf.RDB$RELATION_NAME
WHERE r.RDB$SYSTEM_FLAG=0 AND rf.RDB$FIELD_NAME LIKE '%PALAVRA%' ORDER BY 1,2;
```

> Antes de assumir que uma tabela tem dados, faça `SELECT COUNT(*)` — várias tabelas existem mas estão vazias.

---

## 9. Restaurar o banco do zero (se necessário)

```bash
FIREBIRD="/c/Program Files (x86)/Firebird/Firebird_4_0_FarolTI"
"$FIREBIRD/gbak.exe" -c -user SYSDBA -password masterkey \
  "D:\\claude\\dintec\\TURBO_DIESEL.fbk" "D:\\claude\\dintec\\TURBO_DIESEL.FDB"
```
(`-c` = create/restore. Use o `gbak` do FB4 FarolTI — o de FB2.5 não restaura ODS 13.)

---

*Última revisão do schema: sessão de investigação que mapeou CLIENTE/NOTAFISCAL/NFISCAL, métricas de cliente, curva ABC e a exportação enriquecida.*
