# Runbook — Restauração de Storage (mídias e documentos)

> **Cenário:** objetos deletados/corrompidos nos buckets críticos, ou repovoar o
> Storage de um projeto novo após `restore-logical.md`.
> **Fonte:** artifact `gallo-storage-backup-<stamp>.tar.gz` do workflow
> **Storage backup** (GitHub → Actions → Storage backup → run mais recente →
> Artifacts). Retenção: 90 dias. Cobre `fiscal-documents` e `whatsapp-media`.
> `product-images`/`avatars` são públicos e recriáveis (sem backup — RF-041).

## 1. Baixar e extrair o backup

```bash
gh run list --workflow=storage-backup.yml --limit 5
gh run download <run-id>
mkdir -p storage-backup && tar -xzf gallo-storage-backup-<stamp>.tar.gz -C storage-backup
# estrutura: storage-backup/<bucket>/<store_id>/<arquivo>
```

## 2. Garantir que os buckets existem

Em projeto novo, os buckets nascem do replay das migrations
(`20260610014819_storage_106_buckets_policies.sql`). Conferir:

```sql
select id, public from storage.buckets order by id;
```

## 3. Subir os objetos

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service role key> \
bun run scripts/dr/restore-storage.ts ./storage-backup
```

O script faz upload com `upsert: true` — é idempotente e seguro re-rodar.
Para restaurar **um único arquivo**, o upload manual pelo Dashboard
(Storage → bucket → Upload) também serve; mantenha o mesmo caminho
(`<store_id>/<uuid>.<ext>`) para que o `media_assets.storage_ref` continue válido.

## 4. Validação

1. Contagem por bucket:
   ```sql
   select bucket_id, count(*) from storage.objects group by bucket_id;
   ```
   Comparar com o resumo impresso pelo script (e com o log do workflow de backup).
2. Consistência com o metadata layer: amostrar `media_assets.storage_ref` do tipo
   `whatsapp-media/<path>` e abrir a mídia pela galeria (signed URL de 5 min) — se a
   galeria renderiza, o caminho bate.
3. Registrar em `docs/infra/dr-test-log.md` quando executado como teste de DR.

## Observações

- O backup é **semanal**: objetos enviados depois do último run não estão no artifact
  (perda máxima de 7 dias para Storage). Documentos fiscais que não podem esperar o
  ciclo semanal devem disparar o workflow manualmente (Actions → Storage backup →
  Run workflow) após uploads críticos.
- `imports-temp` é descartável e `quote-documents` é regenerável a partir dos
  orçamentos — fora do escopo de backup por decisão do PRD.
