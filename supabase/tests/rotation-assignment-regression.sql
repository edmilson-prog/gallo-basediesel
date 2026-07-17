-- supabase/tests/rotation-assignment-regression.sql
--
-- Regressão de public.assign_next_from_rotation e das funções auxiliares.
-- Roda dentro de uma transação com rollback — nunca persiste dado de teste.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rotation-assignment-regression.sql

begin;

-- Sellers reais da matriz usados como fixture (loja 00000000-0000-0000-0000-000000000001):
--   Tiago  97834e8d-e1b5-4bb7-9f25-2e58e641fdab
--   Ramon  d3ec82e5-f0a4-4d33-972f-13709da5447c
--   Weligton db41c11b-510a-4fff-9dd8-4c86aab8d114
--   Fernando (fallback esperado) 57706ecc-01b5-4a96-b403-0359a4bb767f

create temporary table _scenario_log (scenario text, result uuid);

-- Cenário A: nenhuma rotation_queue para a loja → cai no fallback Fernando.
insert into _scenario_log values (
  'A_no_queue', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'A_no_queue')
     <> '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid then
    raise exception 'A_no_queue: esperava fallback Fernando';
  end if;
end $$;

-- Cenário B: fila direct-mode, 3 participantes, todos online, ponteiro = Tiago
-- → deve selecionar Ramon (próximo na ordem) e avançar o ponteiro.
update public.sellers set availability = 'online' where id in (
  '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 'db41c11b-510a-4fff-9dd8-4c86aab8d114'
);
insert into public.rotation_queues (id, store_id, target_mode, last_assigned_ref_id, skip_offline)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'direct', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', true);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 1, true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 2, true),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', null, 'seller', 'db41c11b-510a-4fff-9dd8-4c86aab8d114', 3, true);

insert into _scenario_log values (
  'B_pointer_tiago', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'B_pointer_tiago')
     <> 'd3ec82e5-f0a4-4d33-972f-13709da5447c'::uuid then
    raise exception 'B_pointer_tiago: esperava Ramon';
  end if;
  if (select last_assigned_ref_id from public.rotation_queues where id = '11111111-1111-1111-1111-111111111111')
     <> 'd3ec82e5-f0a4-4d33-972f-13709da5447c' then
    raise exception 'B_pointer_tiago: ponteiro não avançou para Ramon';
  end if;
end $$;

-- Cenário C: Ramon fica offline → deve pular pra Weligton.
update public.sellers set availability = 'offline' where id = 'd3ec82e5-f0a4-4d33-972f-13709da5447c';
insert into _scenario_log values (
  'C_ramon_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'C_ramon_offline')
     <> 'db41c11b-510a-4fff-9dd8-4c86aab8d114'::uuid then
    raise exception 'C_ramon_offline: esperava Weligton';
  end if;
end $$;

-- Cenário D: todo mundo offline → cai no fallback Fernando de novo.
update public.sellers set availability = 'offline' where id in (
  '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 'db41c11b-510a-4fff-9dd8-4c86aab8d114'
);
insert into _scenario_log values (
  'D_all_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'D_all_offline')
     <> '57706ecc-01b5-4a96-b403-0359a4bb767f'::uuid then
    raise exception 'D_all_offline: esperava fallback Fernando';
  end if;
end $$;

-- Limpa a fila direct-mode antes dos cenários department-mode: rotation_queues
-- tem UNIQUE(store_id) (1 fila por loja, de verdade) — inserir uma segunda fila
-- pra mesma loja sem apagar a primeira violaria essa constraint. Também repõe
-- todos online, já que D deixou todo mundo offline de propósito.
delete from public.rotation_participants where queue_id = '11111111-1111-1111-1111-111111111111';
delete from public.rotation_queues where id = '11111111-1111-1111-1111-111111111111';
update public.sellers set availability = 'online' where id in (
  '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 'db41c11b-510a-4fff-9dd8-4c86aab8d114'
);

-- Cenário E: fila department-mode, 2 departamentos (A: Tiago+Ramon, B: Weligton),
-- ponteiro no departamento A → deve tentar o departamento B a seguir → seleciona
-- Weligton (único membro de B).
insert into public.departments (id, name, store_id) values
  ('dept-test-a', 'Depto A (teste)', '00000000-0000-0000-0000-000000000001'),
  ('dept-test-b', 'Depto B (teste)', '00000000-0000-0000-0000-000000000001');
insert into public.rotation_queues (id, store_id, target_mode, last_assigned_ref_id, skip_offline)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'department', 'dept-test-a', true);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled, last_assigned_member_id)
values
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', null, 'department', 'dept-test-a', 1, true, null),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', null, 'department', 'dept-test-b', 2, true, null);
insert into public.rotation_participants (id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled)
values
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-a', 'seller', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab', 1, true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-a', 'seller', 'd3ec82e5-f0a4-4d33-972f-13709da5447c', 2, true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'dept-test-b', 'seller', 'db41c11b-510a-4fff-9dd8-4c86aab8d114', 1, true);

insert into _scenario_log values (
  'E_dept_pointer_a', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'E_dept_pointer_a')
     <> 'db41c11b-510a-4fff-9dd8-4c86aab8d114'::uuid then
    raise exception 'E_dept_pointer_a: esperava Weligton (departamento B)';
  end if;
end $$;

-- Cenário F: Weligton (único membro do depto B) fica offline → depto B não tem
-- ninguém elegível → pula (dá a volta) pro depto A → ponteiro interno do depto A
-- ainda está null (fresh) → seleciona Tiago (order=1).
update public.sellers set availability = 'offline' where id = 'db41c11b-510a-4fff-9dd8-4c86aab8d114';
insert into _scenario_log values (
  'F_deptB_offline', public.assign_next_from_rotation('00000000-0000-0000-0000-000000000001'::uuid)
);

do $$
begin
  if (select result from _scenario_log where scenario = 'F_deptB_offline')
     <> '97834e8d-e1b5-4bb7-9f25-2e58e641fdab'::uuid then
    raise exception 'F_deptB_offline: esperava Tiago (departamento A, fallback de B)';
  end if;
end $$;

select 'ALL ROTATION ASSIGNMENT TESTS PASSED' as result;

rollback;
