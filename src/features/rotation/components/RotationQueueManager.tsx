import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCurrentStore } from "@/features/multistore";
import {
  useDepartmentsProvider,
  useRotationParticipantsProvider,
  useRotationQueuesProvider,
  useSellersProvider,
} from "@/providers/data";
import type { RotationTargetMode } from "@/shared/types";
import { useRotationQueueState } from "../hooks/useRotationQueueState";
import { useRotationLivePreview } from "../hooks/useRotationLivePreview";
import { SortableParticipantRow } from "./SortableParticipantRow";
import { RotationLiveView } from "./RotationLiveView";

/**
 * Owner/Gestor screen to manage the per-store attendance rotation (PRD-213):
 * targetMode selector, drag-and-drop participant ordering, enable toggle,
 * add/remove, the `department` two-level navigation, and the live "who's next"
 * view.
 */
export function RotationQueueManager() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "";
  const queuesProvider = useRotationQueuesProvider();
  const participantsProvider = useRotationParticipantsProvider();
  const sellersProvider = useSellersProvider();
  const queryClient = useQueryClient();

  const stateQuery = useRotationQueueState(storeId);
  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    enabled: Boolean(storeId),
  });

  const departmentsProvider = useDepartmentsProvider();
  const departmentsQuery = useQuery({
    queryKey: ["departments", storeId],
    queryFn: () => departmentsProvider.list({ storeId }),
    enabled: Boolean(storeId),
  });

  const state = stateQuery.data;
  const sellers = sellersQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const nameById = useMemo(
    () => Object.fromEntries(sellers.map((s) => [s.id, s.fullName])),
    [sellers],
  );
  const deptNameById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );
  const [openDept, setOpenDept] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["rotation-queue-state", storeId] });

  const setMode = useMutation({
    mutationFn: (targetMode: RotationTargetMode) => queuesProvider.update(storeId, { targetMode }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível trocar o modo", { description: e.message }),
  });

  const setEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      participantsProvider.setEnabled(id, enabled),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível atualizar", { description: e.message }),
  });

  const addParticipant = useMutation({
    mutationFn: (refId: string) => {
      if (!state) throw new Error("Fila indisponível.");
      return participantsProvider.add({ queueId: state.queue.id, refType: "seller", refId });
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível adicionar", { description: e.message }),
  });

  const addDepartment = useMutation({
    mutationFn: (refId: string) => {
      if (!state) throw new Error("Fila indisponível.");
      return participantsProvider.add({ queueId: state.queue.id, refType: "department", refId });
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível adicionar", { description: e.message }),
  });

  const addMember = useMutation({
    mutationFn: ({ deptId, sellerId }: { deptId: string; sellerId: string }) => {
      if (!state) throw new Error("Fila indisponível.");
      return participantsProvider.add({
        queueId: state.queue.id,
        scopeDepartmentId: deptId,
        refType: "seller",
        refId: sellerId,
      });
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível adicionar", { description: e.message }),
  });

  const removeParticipant = useMutation({
    mutationFn: (id: string) => participantsProvider.remove(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => participantsProvider.reorder(ids),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível reordenar", { description: e.message }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!state) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = state.topParticipants.map((p) => p.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorder.mutate(arrayMove(ids, oldIndex, newIndex));
  }

  function handleMemberDragEnd(deptId: string, event: DragEndEvent) {
    if (!state) return;
    const ids = (state.membersByDepartment[deptId] ?? []).map((m) => m.id);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorder.mutate(arrayMove(ids, oldIndex, newIndex));
  }

  const preview = useRotationLivePreview(storeId, state);

  const presentIds = new Set((state?.topParticipants ?? []).map((p) => p.refId));
  const addable = sellers.filter((s) => !presentIds.has(s.id));

  // Department-mode helpers.
  const addableDepartments = departments.filter((d) => !presentIds.has(d.id));
  const openMembers = openDept ? (state?.membersByDepartment[openDept] ?? []) : [];
  const memberPresentIds = new Set(openMembers.map((m) => m.refId));
  const addableMembers = openDept
    ? sellers.filter((s) => s.departmentId === openDept && !memberPresentIds.has(s.id))
    : [];

  if (!storeId || stateQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando rodízio…</div>;
  }
  if (!state) {
    return (
      <div className="p-6 text-sm text-severity-critical">Não foi possível carregar a fila.</div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-6">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Rodízio de atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Define a fila que distribui as conversas de rotina. Quem está offline ou fora do horário é
          pulado automaticamente.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Direcionamento</h2>
        <RadioGroup
          value={state.queue.targetMode}
          onValueChange={(v) => setMode.mutate(v as RotationTargetMode)}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <RadioGroupItem value="direct" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Por usuário</span>
              <span className="block text-xs text-muted-foreground">
                A fila reveza diretamente entre os usuários.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <RadioGroupItem value="department" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-foreground">Por departamento</span>
              <span className="block text-xs text-muted-foreground">
                A fila reveza entre departamentos e, dentro de cada um, entre os membros.
              </span>
            </span>
          </label>
        </RadioGroup>
      </section>

      {state.queue.targetMode === "direct" && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Participantes</h2>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={state.topParticipants.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-2">
                {state.topParticipants.map((p) => (
                  <SortableParticipantRow
                    key={p.id}
                    id={p.id}
                    label={nameById[p.refId] ?? p.refId}
                    enabled={p.enabled}
                    onToggle={(enabled) => setEnabled.mutate({ id: p.id, enabled })}
                    onRemove={() => removeParticipant.mutate(p.id)}
                  />
                ))}
                {state.topParticipants.length === 0 && (
                  <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    Nenhum participante. Adicione usuários abaixo.
                  </li>
                )}
              </ul>
            </SortableContext>
          </DndContext>

          {addable.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                key={state.topParticipants.length}
                onValueChange={(refId) => addParticipant.mutate(refId)}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Adicionar usuário ao rodízio" />
                </SelectTrigger>
                <SelectContent>
                  {addable.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>
      )}

      {state.queue.targetMode === "department" && (
        <section className="space-y-4">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Departamentos na fila</h2>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={state.topParticipants.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {state.topParticipants.map((p) => (
                    <SortableParticipantRow
                      key={p.id}
                      id={p.id}
                      label={deptNameById[p.refId] ?? p.refId}
                      enabled={p.enabled}
                      onToggle={(enabled) => setEnabled.mutate({ id: p.id, enabled })}
                      onRemove={() => removeParticipant.mutate(p.id)}
                      onManage={() => setOpenDept(openDept === p.refId ? null : p.refId)}
                      manageActive={openDept === p.refId}
                    />
                  ))}
                  {state.topParticipants.length === 0 && (
                    <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhum departamento na fila. Adicione abaixo.
                    </li>
                  )}
                </ul>
              </SortableContext>
            </DndContext>

            {addableDepartments.length > 0 && (
              <div className="flex items-center gap-2">
                <Select
                  key={`dept-${state.topParticipants.length}`}
                  onValueChange={(refId) => addDepartment.mutate(refId)}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Adicionar departamento à fila" />
                  </SelectTrigger>
                  <SelectContent>
                    {addableDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {openDept && (
            <div className="space-y-3 rounded-md border border-border bg-muted/10 p-4">
              <h3 className="text-sm font-medium text-foreground">
                Membros — {deptNameById[openDept] ?? openDept}
              </h3>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleMemberDragEnd(openDept, e)}
              >
                <SortableContext
                  items={openMembers.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-2">
                    {openMembers.map((m) => (
                      <SortableParticipantRow
                        key={m.id}
                        id={m.id}
                        label={nameById[m.refId] ?? m.refId}
                        enabled={m.enabled}
                        onToggle={(enabled) => setEnabled.mutate({ id: m.id, enabled })}
                        onRemove={() => removeParticipant.mutate(m.id)}
                      />
                    ))}
                    {openMembers.length === 0 && (
                      <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                        Nenhum membro neste departamento. Adicione abaixo.
                      </li>
                    )}
                  </ul>
                </SortableContext>
              </DndContext>

              {addableMembers.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    key={`member-${openDept}-${openMembers.length}`}
                    onValueChange={(sellerId) => addMember.mutate({ deptId: openDept, sellerId })}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Adicionar membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableMembers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {preview && (
        <RotationLiveView
          result={preview.result}
          sellersById={preview.sellersById}
          departmentNameById={deptNameById}
        />
      )}
    </div>
  );
}
