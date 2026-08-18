-- PRD-216 (Tally) — rascunho de nota e descarte com liberação da chave.
--
-- Duas mudanças de produto pedidas pelo dono em 17/08:
--
--   1. `rascunho` — nota estacionada fora da fila de conferência, guardando
--      tudo que já foi decidido. Sai dos KPIs e do filtro padrão.
--   2. Descartar uma nota passa a APAGAR de verdade, em vez de marcar
--      'cancelada'. Isso libera a chave de acesso, e o mesmo XML pode ser
--      importado de novo do zero. A trilha passa a viver em `audit_logs`
--      (ação `fiscal_note.delete`), não na tabela.
--
-- Por isso 'cancelada' sai do check: virou valor morto, e valor morto em enum
-- apodrece. Nenhuma linha usa — verificado antes de aplicar.

alter table public.fiscal_notes drop constraint if exists fiscal_notes_status_check;
alter table public.fiscal_notes
  add constraint fiscal_notes_status_check
  check (status in ('rascunho','conferencia','lancada'));

comment on column public.fiscal_notes.status is
  'rascunho = parada fora da fila; conferencia = na fila; lancada = terminal (corrigir e estornar). Descarte APAGA a linha e libera a chave de acesso.';

-- O delete da nota já é coberto pela policy `fiscal_notes_write` (for all), e os
-- filhos somem por ON DELETE CASCADE. Faltava o XML: sem policy de DELETE no
-- bucket, apagar a nota deixaria o arquivo órfão pagando storage para sempre.
drop policy if exists "fiscal_xml_delete" on storage.objects;
create policy "fiscal_xml_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'fiscal-xml'
  and (select public.is_staff())
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
);
