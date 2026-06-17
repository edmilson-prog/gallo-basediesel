import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useCurrentStore } from "@/features/multistore";
import {
  useRotationParticipantsProvider,
  useRotationQueuesProvider,
  useSellersProvider,
} from "@/providers/data";
import type { RotationTargetMode } from "@/shared/types";
import { useRotationQueueState } from "../hooks/useRotationQueueState";

/**
 * Owner/Gestor screen to manage the per-store attendance rotation (PRD-213).
 * This base version covers the targetMode selector and the `direct` participant
 * list (toggle + add/remove). Drag-and-drop ordering (Task 12) and the live
 * view + department two-level navigation (Task 13) build on top of this.
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

  const state = stateQuery.data;
  const sellers = sellersQuery.data ?? [];
  const nameById = useMemo(
    () => Object.fromEntries(sellers.map((s) => [s.id, s.fullName])),
    [sellers],
  );

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

  const removeParticipant = useMutation({
    mutationFn: (id: string) => participantsProvider.remove(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const presentIds = new Set((state?.topParticipants ?? []).map((p) => p.refId));
  const addable = sellers.filter((s) => !presentIds.has(s.id));

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
          <ul className="space-y-2">
            {state.topParticipants.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-sm text-foreground">{nameById[p.refId] ?? p.refId}</span>
                <span className="flex items-center gap-3">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(enabled) => setEnabled.mutate({ id: p.id, enabled })}
                    aria-label={`Participação de ${nameById[p.refId] ?? p.refId}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover do rodízio"
                    onClick={() => removeParticipant.mutate(p.id)}
                  >
                    <Icon icon="mdi:close" size={16} />
                  </Button>
                </span>
              </li>
            ))}
            {state.topParticipants.length === 0 && (
              <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum participante. Adicione usuários abaixo.
              </li>
            )}
          </ul>

          {addable.length > 0 && (
            <div className="flex items-center gap-2">
              <Select onValueChange={(refId) => addParticipant.mutate(refId)}>
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
        <section className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          A gestão por departamento (dois níveis) chega na próxima etapa.
        </section>
      )}
    </div>
  );
}
