# Dry-run — Backfill de DDI 55 em `customers.phone` (2026-07-17)

> Relatório de revisão para o dono. Nenhuma escrita foi executada — todos os números abaixo vêm de SELECTs em produção (2026-07-17, após o deploy do fix de runtime do PR #321). Plano: `docs/superpowers/plans/2026-07-17-customers-phone-country-code-fix.md`.

## Resumo

| Lote | Descrição | Qtde | Ação proposta |
|------|-----------|------|---------------|
| A | Candidatos ao UPDATE (`'+55' \|\| phone_digits`) | **1.387** (452 de 10 díg. + 935 de 11 — todos DINTEC) | UPDATE em massa após OK |
| B | Colisões diretas (o `55`+dígitos já existe em outro cliente da mesma loja) | **20 pares** | **Skip** (fora do UPDATE) — recomendação abaixo |
| C | Anomalias (prefixo não-BR sem `+`, lixo) | **4 + 1** | Fora; triagem manual |
| D | Leads com o mesmo defeito (`leads.phone`, 11 díg., DDD válido, sem `+`) | **67** | Decisão do dono (opcional, mesmo critério) |

Reconciliação: 1.387 (A) + 20 (B) + 4 (C) = 1.411 clientes DINTEC curtos; os 19 não-DINTEC de 11 dígitos vistos no levantamento inicial têm `+` explícito (internacionais legítimos) e ficam automaticamente fora.

## Lote A — critério exato (mesmo predicado do UPDATE)

- `length(phone_digits) IN (10, 11)`
- `phone NOT LIKE '+%'` (quem tem `+` declarou E.164 — nunca tocar)
- `phone_digits NOT LIKE '0%'` (sem zero-tronco)
- 2 primeiros dígitos ∈ DDDs BR válidos (Anatel)
- sem colisão: não existe outro cliente na mesma loja com `phone_digits = '55' || phone_digits`

Amostra (20 primeiros por data de criação):

| phone atual | novo phone | cliente |
|---|---|---|
| 5537511059 | +555537511059 | CEREALISTA RIGON LTDA |
| 5130373000 | +555130373000 | EIXO SUL DISTRIBUIDORA DE PECAS LTDA - MATRIZ |
| 5537444100 | +555537444100 | ELETRICA H W LTDA |
| 5537461177 | +555537461177 | CEREALISTA RIGON E CERETTA LTDA |
| 5537447253 | +555537447253 | ASSIRAL DISTRIB LTDA |
| 5535221361 | +555535221361 | SUL SERRA TRANSPORTES E TURISMO |
| 49999975897 | +5549999975897 | Cliente DINTEC 10 |
| 5537424863 | +555537424863 | COOPER BIO |
| 55996169849 | +5555996169849 | WILLIAN LOCATELLI EIRELI |
| 55999645444 | +5555999645444 | Cliente DINTEC 16 |
| 5537444364 | +555537444364 | EXPREX LOG DISTRIBUICAO LTDA |
| 5130373000 | +555130373000 | SALVINI TRANSPORTES LTDA |
| 5596834324 | +555596834324 | INOVAR TRANSPORTES |
| 5537461844 | +555537461844 | PLANTA SUL INSUMOS AGRICOLAS LTDA |
| 4933298314 | +554933298314 | DAL SANTO TRANSPORTES |
| 5137482271 | +555137482271 | SCALA TRANSPORTE E ADMINISTRACAO LTDA |
| 5516261333 | +555516261333 | TRANSPORTADORA TABORDA LTDA |
| 54999745346 | +5554999745346 | RODOLUPPI TRANSPORTES LTDA |
| 5520102700 | +555520102700 | BRUNA RIBAS |
| 55999716233 | +5555999716233 | PINTO NETO CIA LTDA |

Sentinelas do bug: RODAWE TRANSPORTES (`49988184540` → `+5549988184540`) e GILBERTO FISCHER (`53999511127` → `+5553999511127`) estão no Lote A.

Nota sobre duplicatas internas: 36 grupos de dígitos repetidos entre os próprios curtos (ex.: `5520102700` ×11 — telefone institucional repetido no ERP). O UPDATE não falha (não há unique constraint) e a ambiguidade de suffix-match desses grupos **já existe hoje** — o backfill não a piora nem a melhora.

## Lote B — 20 colisões (recomendação: SKIP)

Padrão claríssimo: **todos os 20 clientes curtos têm 0 conversas**; o registro "longo" (com `+55`) é quem carrega o histórico (0–2 conversas cada). Ou seja: são cadastros DINTEC duplicados de clientes que já existiam via WhatsApp. Recomendação: **não tocar neles no UPDATE** (já estão excluídos pelo predicado) e tratar merge (repontar dados DINTEC para o registro longo + apagar o curto) como follow-up separado, se o dono quiser — sem urgência, pois não há conversa presa neles.

| Cliente curto (DINTEC, 0 convs) | phone curto | Cliente longo (com histórico) | phone longo |
|---|---|---|---|
| 09.300.785 IVANOR LUIZ BUZATTO | 5599728977 | +555599728977 (1 conv) | +555599728977 |
| A L MOLAS | 7581446230 | +557581446230 (1 conv) | +557581446230 |
| ALCARDIO OLEOS LUBRIFICANTES | 21988212442 | +5521988212442 (1 conv) | +5521988212442 |
| Cliente DINTEC 126 | 5537462020 | +555537462020 (1 conv) | +555537462020 |
| Cliente DINTEC 1329 | 4699115126 | Ariel (1 conv) | +554699115126 |
| Cliente DINTEC 195 | 5537462020 | +555537462020 (1 conv) | +555537462020 |
| COM E TRANSPS ARNOLD | 5596177508 | +555596177508 (1 conv) | +555596177508 |
| DANIEL AUGUSTO DE OLIVEIRA | 12988271063 | +5512988271063 (2 convs) | +5512988271063 |
| DIOGO MAZONETTO - DAM TUR | 5599725060 | +555599725060 (1 conv) | +555599725060 |
| ELETROTECH CENTRO DE DIAGNOSTICO | 5599090752 | AUTO ELETRICA PICA FIO (2 convs) | +555599090752 |
| JOSELTON VITAL CAIRES DE SOUZA | 17992180407 | Baiano Diagnósticos (1 conv) | +5517992180407 |
| L R VILLODRE TRANSPS | 5599008111 | Luis (1 conv) | +555599008111 |
| MARTELLI TRANSPORTES | 6681288077 | +556681288077 (1 conv) | +556681288077 |
| MECANICA DIESEL ROANI LTDA | 5537462020 | +555537462020 (1 conv) | +555537462020 |
| MIX PECAS DIESEL LTDA | 3172646969 | +553172646969 (1 conv) | +553172646969 |
| NILLO JOSE BELLENZIER | 5537461083 | COMERCIO DE COMBUSTIVEL SEBERI (0 convs) | +555537461083 |
| RAFAEL FAGAN DA SILVA | 5596666768 | TRANS FAG (0 convs) | +555596666768 |
| REMAC MECANICA DIESEL LTDA | 5496170015 | José Marcos (1 conv) | +555496170015 |
| TEC MAN SERVICOS MECANICOS | 4598076825 | LMN DISTRIBUIDORA (2 convs) | +554598076825 |
| VOLMOC ELETROMECANICA | 3884111307 | JP DIESEL AUTO MECANICA (1 conv) | +553884111307 |

Obs.: 3 curtos (Cliente DINTEC 126/195 e MECANICA DIESEL ROANI) apontam para o **mesmo** longo `+555537462020` — telefone compartilhado/institucional.

## Lote C — anomalias (ficam de fora)

Prefixo não-BR sem `+` (4, todos DINTEC — prováveis internacionais de fronteira ou typo do ERP; triagem manual):

| id | phone | cliente |
|---|---|---|
| bcc06a4a | 57996445339 | LEANDRO CARLOS COBES (57 = Colômbia?) |
| b0deab13 | 59996557765 | GRIEBELER & MOSCON TRANSPS (599?) |
| 3922e404 | 59598352065 | PETHERSON DHIEGO ALEXANDRE (595 = Paraguai) |
| cb37adf0 | 5996902510 | Cliente DINTEC 224 (59?) |

Lixo fora de faixa: 1 registro (`+0`, id fe917e85).

## Lote D — leads (decisão do dono)

`public.leads` tem 80 registros com `phone_digits` de 11 dígitos (nenhum em outras faixas curtas): **67 com DDD BR válido e sem `+`** (mesmo defeito, candidatos ao mesmo UPDATE espelhado) e 13 com DDD inválido (fora). Leads não são usados no discador WAHA hoje, mas o PR #310 (webhook cria Lead) está aberto — recomendo aplicar o mesmo backfill nos 67 junto com o Lote A.

## SQL do UPDATE (Lote A — executar só com OK do dono)

```sql
update customers c
set phone = '+55' || c.phone_digits
where length(c.phone_digits) in (10, 11)
  and c.phone not like '+%'
  and c.phone_digits not like '0%'
  and substring(c.phone_digits, 1, 2) in (
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99')
  and not exists (
    select 1 from customers b
    where b.store_id = c.store_id and b.id <> c.id
      and b.phone_digits = '55' || c.phone_digits);
-- rowcount esperado: 1.387
```

Lote D (se aprovado — mesmo predicado em `leads`, sem a cláusula de colisão por não haver histórico de conversa vinculado por telefone):

```sql
update leads l
set phone = '+55' || l.phone_digits
where length(l.phone_digits) = 11
  and l.phone not like '+%'
  and l.phone_digits not like '0%'
  and substring(l.phone_digits, 1, 2) in (
    '11','12','13','14','15','16','17','18','19','21','22','24','27','28',
    '31','32','33','34','35','37','38','41','42','43','44','45','46','47','48','49',
    '51','53','54','55','61','62','63','64','65','66','67','68','69',
    '71','73','74','75','77','79','81','82','83','84','85','86','87','88','89',
    '91','92','93','94','95','96','97','98','99');
-- rowcount esperado: 67
```

## Segurança (já verificado em código)

- `phone_digits` é generated column — recalcula sozinha no UPDATE (índice trgm junto).
- O suffix-match do webhook usa os últimos 8 dígitos — inalterados pelo prefixo; formato gravado `'+55'+dígitos` sem pontuação segue a convenção do próprio webhook.
- Conversas existentes não são repontadas (o UPDATE toca só `customers.phone`).
- **9º dígito NUNCA é inserido** — dos 452 números de 10 dígitos, os que forem celulares antigos sem o 9 podem ainda não entregar (agora discam um número BR válido sem o 9, em vez da Alemanha). Follow-up opcional: passe de verificação via `check-exists` do WAHA adotando o 9 só quando o WhatsApp confirmar.
