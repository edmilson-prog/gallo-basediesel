-- PRD-216 (Tally) — lancamento e estorno da nota de entrada (RF-100/RF-101).
--
-- Tudo ou nada: valida, cria as pecas novas, grava o que a conferencia
-- aprendeu, recalcula saldo e custo medio e marca a nota imutavel. Uma unica
-- transacao — meia entrada lancada e pior que entrada nenhuma.
--
-- NAO cria movimentacao: `entrada_compra` continua DERIVADO das notas
-- lancadas em deriveInventoryMovements (RF-102), como as saidas ja sao
-- derivadas dos pedidos.
--
-- A validacao abaixo espelha validateForPosting() de
-- src/features/fiscal-notes/engine/postEffects.ts. As duas precisam concordar:
-- o mock recusa em TypeScript o que esta funcao recusa em SQL.
--
-- Colunas obrigatorias de public.parts verificadas contra producao em
-- 17/08/2026: sku, name, brand e supplier sao NOT NULL sem default.

create or replace function public.post_fiscal_note(p_note_id uuid)
returns public.fiscal_notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note       public.fiscal_notes;
  v_seller     uuid := public.current_seller_id();
  v_supplier   text;
  v_item       public.fiscal_note_items;
  v_pending    integer;
  v_new_part   uuid;
  v_target     uuid;
  v_factor     numeric;
  v_charges    numeric;
  v_qty        numeric;
  v_unit_cost  numeric;
  v_stock      integer;
  v_avg        numeric;
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_note from public.fiscal_notes where id = p_note_id for update;
  if not found then
    raise exception 'fiscal note not found' using errcode = 'P0002';
  end if;

  if v_note.store_id <> public.current_store_id() or not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_note.status <> 'conferencia' then
    raise exception 'nota % nao esta em conferencia', v_note.number using errcode = 'P0001';
  end if;

  select count(*) into v_pending
  from public.fiscal_note_items i
  where i.note_id = p_note_id
    and (
      i.confirmed = false
      or (i.part_id is null and i.new_part_draft is null)
      or (i.conversion_mode <> 'direto' and coalesce(i.conversion_factor, 0) <= 0)
      or (i.conversion_mode = 'frac' and i.conversion_target_part_id is null)
    );
  if v_pending > 0 then
    raise exception 'nota % tem % item(ns) por conferir', v_note.number, v_pending
      using errcode = 'P0001';
  end if;

  select coalesce(trade_name, corporate_name) into v_supplier
  from public.suppliers where id = v_note.supplier_id;

  -- Encargos rateados por valor (RC-01), calculados uma vez para a nota.
  v_charges := coalesce(v_note.freight, 0) + coalesce(v_note.ipi, 0) - coalesce(v_note.discount, 0);

  for v_item in
    select * from public.fiscal_note_items where note_id = p_note_id order by seq
  loop
    -- Peca nova nasce aqui, com NCM e custo da nota. Categoria e preco de
    -- venda ficam para depois, de proposito — como o fornecedor criado do XML.
    if v_item.part_id is null and v_item.new_part_draft is not null then
      insert into public.parts (
        sku, name, brand, supplier, unit_cost, unit_price, margin_percent,
        unit_of_measure, fiscal, stock_available, stock_minimum, division,
        active, store_id
      )
      values (
        'NF-' || v_note.number || '-' || v_item.seq,
        v_item.new_part_draft ->> 'name',
        'A definir',
        coalesce(v_supplier, 'A definir'),
        0, 0, 0,
        coalesce(v_item.new_part_draft ->> 'unitOfMeasure', 'UN'),
        case when v_item.ncm is null then null
             else jsonb_build_object('ncm', v_item.ncm) end,
        0, 0, v_note.division, true, v_note.store_id
      )
      returning id into v_new_part;

      update public.fiscal_note_items set part_id = v_new_part where id = v_item.id;
      v_item.part_id := v_new_part;
    end if;

    v_target := case when v_item.conversion_mode = 'frac'
                     then v_item.conversion_target_part_id
                     else v_item.part_id end;
    if v_target is null then
      continue;
    end if;

    v_factor := case when v_item.conversion_mode = 'direto' then 1
                     else v_item.conversion_factor end;
    v_qty := round(v_item.quantity * v_factor, 2);
    if v_qty = 0 then
      continue;
    end if;

    -- RC-02: custo unitario com rateio, sobre a quantidade convertida. E este
    -- custo que vai para a margem, nunca o vUnCom da nota.
    v_unit_cost := (
      v_item.total_value
      + case when coalesce(v_note.products_total, 0) = 0 then 0
             else v_charges * (v_item.total_value / v_note.products_total) end
    ) / v_qty;

    select coalesce(stock_available, 0), coalesce(average_cost, 0)
      into v_stock, v_avg
    from public.parts where id = v_target for update;

    -- RC-04: media ponderada. Saldo ou media ausentes caem no custo da entrada
    -- — nao ha media a preservar, e ponderar contra saldo negativo daria numero
    -- sem sentido.
    update public.parts
    set stock_available = v_stock + v_qty::integer,
        average_cost = case
          when v_stock <= 0 or v_avg <= 0 then v_unit_cost
          else (v_stock * v_avg + v_qty * v_unit_cost) / (v_stock + v_qty)
        end,
        updated_at = now()
    where id = v_target;

    -- O vinculo aprendido: da proxima nota deste fornecedor aplica sozinho.
    if v_item.part_id is not null then
      insert into public.supplier_part_codes (supplier_id, supplier_code, part_id, created_by)
      values (v_note.supplier_id, v_item.supplier_code, v_item.part_id, v_seller)
      on conflict (supplier_id, supplier_code) do nothing;
    end if;

    -- Modo direto nao tem fator a guardar — a unidade da nota ja e a de estoque.
    if v_item.conversion_mode <> 'direto' and v_item.part_id is not null then
      insert into public.supplier_conversion_rules (
        supplier_id, part_id, mode, from_unit, factor, to_unit, target_part_id, applied_count
      )
      values (
        v_note.supplier_id, v_item.part_id, v_item.conversion_mode, v_item.unit,
        v_item.conversion_factor, coalesce(v_item.conversion_unit, v_item.unit),
        v_item.conversion_target_part_id, 1
      )
      on conflict (supplier_id, part_id, from_unit)
      do update set applied_count = public.supplier_conversion_rules.applied_count + 1,
                    updated_at = now();
    end if;
  end loop;

  update public.fiscal_notes
  set status = 'lancada', posted_at = now(), posted_by = v_seller, updated_at = now()
  where id = p_note_id
  returning * into v_note;

  return v_note;
end;
$function$;

comment on function public.post_fiscal_note(uuid) is
  'PRD-216 RF-100: lanca a nota numa transacao. NAO cria movimentacao — entrada_compra e derivado das notas lancadas em deriveInventoryMovements.';

create or replace function public.reverse_fiscal_note(p_note_id uuid)
returns public.fiscal_notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note    public.fiscal_notes;
  v_seller  uuid := public.current_seller_id();
  v_item    public.fiscal_note_items;
  v_target  uuid;
  v_factor  numeric;
  v_qty     numeric;
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_note from public.fiscal_notes where id = p_note_id for update;
  if not found then
    raise exception 'fiscal note not found' using errcode = 'P0002';
  end if;

  if v_note.store_id <> public.current_store_id() or not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_note.status <> 'lancada' then
    raise exception 'nota % nao esta lancada', v_note.number using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.fiscal_note_items where note_id = p_note_id order by seq
  loop
    v_target := case when v_item.conversion_mode = 'frac'
                     then v_item.conversion_target_part_id
                     else v_item.part_id end;
    if v_target is null then
      continue;
    end if;

    v_factor := case when v_item.conversion_mode = 'direto' then 1
                     else v_item.conversion_factor end;
    v_qty := round(v_item.quantity * v_factor, 2);

    -- Devolve o saldo. O custo medio NAO volta ao valor anterior: media
    -- ponderada nao tem inversa exata, e reconstruir daria numero falso. O
    -- estorno corrige o saldo; o custo se corrige na proxima entrada.
    update public.parts
    set stock_available = greatest(0, coalesce(stock_available, 0) - v_qty::integer),
        updated_at = now()
    where id = v_target;
  end loop;

  update public.fiscal_notes
  set status = 'conferencia', posted_at = null, posted_by = null, updated_at = now()
  where id = p_note_id
  returning * into v_note;

  return v_note;
end;
$function$;

comment on function public.reverse_fiscal_note(uuid) is
  'PRD-216 RF-101: estorna a nota. Devolve saldo; o custo medio NAO e revertido — media ponderada nao tem inversa exata.';

revoke all on function public.post_fiscal_note(uuid) from public, anon;
revoke all on function public.reverse_fiscal_note(uuid) from public, anon;
grant execute on function public.post_fiscal_note(uuid) to authenticated;
grant execute on function public.reverse_fiscal_note(uuid) to authenticated;
