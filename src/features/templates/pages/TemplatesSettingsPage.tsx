import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IMessageTemplate, MessageTemplateMetaStatus } from "@/shared/types";
import { useMessageTemplatesProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/Icon";
import { countTemplateVariables, renderTemplate } from "../engine/render";

const STATUS_BADGES: Record<MessageTemplateMetaStatus, { label: string; className: string }> = {
  approved: { label: "Aprovado", className: "bg-severity-success/15 text-severity-success" },
  pending: { label: "Em análise", className: "bg-severity-warning/15 text-severity-warning" },
  rejected: { label: "Rejeitado", className: "bg-severity-critical/15 text-severity-critical" },
  paused: { label: "Pausado", className: "bg-severity-warning/15 text-severity-warning" },
  unknown: { label: "Desconhecido", className: "bg-muted text-muted-foreground" },
};

const META_STATUS_OPTIONS: MessageTemplateMetaStatus[] = [
  "approved",
  "pending",
  "rejected",
  "paused",
  "unknown",
];

interface IFormState {
  displayName: string;
  description: string;
  whatsappAccountId: string;
  metaTemplateName: string;
  metaLanguageCode: string;
  metaCategory: IMessageTemplate["metaCategory"];
  metaStatus: MessageTemplateMetaStatus;
  bodyTemplate: string;
  variableLabels: string[];
}

const EMPTY_FORM: IFormState = {
  displayName: "",
  description: "",
  whatsappAccountId: "",
  metaTemplateName: "",
  metaLanguageCode: "pt_BR",
  metaCategory: "utility",
  metaStatus: "approved",
  bodyTemplate: "",
  variableLabels: [],
};

/**
 * /app/configuracoes/templates-whatsapp — HSM template catalog management
 * (PRD-116, staff-only). Mirrors what was approved in the Meta Business
 * Manager; body/meta fields are immutable after creation by design.
 */
export function TemplatesSettingsPage() {
  const provider = useMessageTemplatesProvider();
  const accountsProvider = useWhatsAppAccountsProvider();
  const { currentStoreId: activeStoreId } = useCurrentStore();
  const queryClient = useQueryClient();

  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IMessageTemplate | null>(null);
  const [form, setForm] = useState<IFormState>(EMPTY_FORM);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["message-templates", activeStoreId],
    queryFn: () => provider.list({ storeId: activeStoreId ?? undefined }),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["whatsapp-accounts", activeStoreId],
    queryFn: () => accountsProvider.list({ storeId: activeStoreId ?? undefined }),
  });

  const visible = useMemo(
    () => templates.filter((template) => showInactive || template.isActive),
    [templates, showInactive],
  );

  const detectedCount = countTemplateVariables(form.bodyTemplate);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["message-templates", activeStoreId] });

  const createMutation = useMutation({
    mutationFn: () =>
      provider.create({
        storeId: activeStoreId ?? undefined,
        whatsappAccountId: form.whatsappAccountId || undefined,
        metaTemplateName: form.metaTemplateName.trim(),
        metaLanguageCode: form.metaLanguageCode.trim() || "pt_BR",
        metaCategory: form.metaCategory,
        metaStatus: form.metaStatus,
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        bodyTemplate: form.bodyTemplate,
        variableLabels: form.variableLabels,
      }),
    onSuccess: () => {
      toast.success("Template cadastrado");
      setFormOpen(false);
      void invalidate();
    },
    onError: (error: Error) => toast.error(`Falha ao salvar: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: (template: IMessageTemplate) =>
      provider.update(template.id, {
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        metaStatus: form.metaStatus,
        variableLabels: form.variableLabels,
      }),
    onSuccess: () => {
      toast.success("Template atualizado");
      setFormOpen(false);
      void invalidate();
    },
    onError: (error: Error) => toast.error(`Falha ao salvar: ${error.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (template: IMessageTemplate) =>
      provider.update(template.id, { isActive: !template.isActive }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(`Falha ao alterar: ${error.message}`),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(template: IMessageTemplate) {
    setEditing(template);
    setForm({
      displayName: template.displayName,
      description: template.description ?? "",
      whatsappAccountId: template.whatsappAccountId ?? "",
      metaTemplateName: template.metaTemplateName,
      metaLanguageCode: template.metaLanguageCode,
      metaCategory: template.metaCategory,
      metaStatus: template.metaStatus,
      bodyTemplate: template.bodyTemplate,
      variableLabels: [...template.variableLabels],
    });
    setFormOpen(true);
  }

  function syncVariableLabels(bodyTemplate: string) {
    const count = countTemplateVariables(bodyTemplate);
    setForm((prev) => ({
      ...prev,
      bodyTemplate,
      variableLabels: Array.from({ length: count }, (_, i) => prev.variableLabels[i] ?? ""),
    }));
  }

  const formValid =
    form.displayName.trim().length > 0 &&
    form.metaTemplateName.trim().length > 0 &&
    form.bodyTemplate.trim().length > 0 &&
    form.variableLabels.length === detectedCount &&
    form.variableLabels.every((label) => label.trim().length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Templates WhatsApp (HSM)</h1>
          <p className="text-sm text-muted-foreground">
            Espelho dos templates aprovados no Meta Business Manager — obrigatórios para iniciar
            conversa fora da janela de 24h.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar inativos
          </label>
          <Button onClick={openCreate}>
            <Icon icon="mdi:plus" size={16} />
            Novo template
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Template Meta</TableHead>
              <TableHead>Idioma</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status Meta</TableHead>
              <TableHead className="text-center">Variáveis</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhum template cadastrado. Aprove no Business Manager e espelhe aqui.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((template) => {
                const badge = STATUS_BADGES[template.metaStatus];
                return (
                  <TableRow key={template.id} className={template.isActive ? "" : "opacity-50"}>
                    <TableCell className="font-medium">{template.displayName}</TableCell>
                    <TableCell className="font-mono text-xs">{template.metaTemplateName}</TableCell>
                    <TableCell>{template.metaLanguageCode}</TableCell>
                    <TableCell className="capitalize">{template.metaCategory}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{template.variableCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(template)}>
                          <Icon icon="mdi:pencil-outline" size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate(template)}
                          title={template.isActive ? "Desativar" : "Reativar"}
                        >
                          <Icon
                            icon={template.isActive ? "mdi:archive-outline" : "mdi:restore"}
                            size={16}
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Conteúdo e metadados Meta são imutáveis — mudou na Meta? Cadastre um novo."
                : "Cole exatamente como aprovado no Business Manager — nome, idioma e corpo precisam bater."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-display">Nome de exibição</Label>
                <Input
                  id="tpl-display"
                  value={form.displayName}
                  onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="Boas-vindas"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Nome na Meta</Label>
                <Input
                  id="tpl-name"
                  value={form.metaTemplateName}
                  onChange={(e) => setForm((p) => ({ ...p, metaTemplateName: e.target.value }))}
                  placeholder="boas_vindas_v1"
                  disabled={Boolean(editing)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-lang">Idioma</Label>
                <Input
                  id="tpl-lang"
                  value={form.metaLanguageCode}
                  onChange={(e) => setForm((p) => ({ ...p, metaLanguageCode: e.target.value }))}
                  disabled={Boolean(editing)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.metaCategory}
                  onValueChange={(value) =>
                    setForm((p) => ({ ...p, metaCategory: value as IFormState["metaCategory"] }))
                  }
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utility">Utility</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status na Meta</Label>
                <Select
                  value={form.metaStatus}
                  onValueChange={(value) =>
                    setForm((p) => ({ ...p, metaStatus: value as MessageTemplateMetaStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {META_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_BADGES[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Conta WhatsApp (onde foi aprovado)</Label>
              <Select
                value={form.whatsappAccountId || "none"}
                onValueChange={(value) =>
                  setForm((p) => ({ ...p, whatsappAccountId: value === "none" ? "" : value }))
                }
                disabled={Boolean(editing)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">
                Corpo do template{" "}
                <span className="text-xs text-muted-foreground">
                  (use {"{{1}}"}, {"{{2}}"}… — detectadas: {detectedCount})
                </span>
              </Label>
              <Textarea
                id="tpl-body"
                rows={3}
                value={form.bodyTemplate}
                onChange={(e) => syncVariableLabels(e.target.value)}
                disabled={Boolean(editing)}
                placeholder="Olá {{1}}! Seu pedido {{2}} está pronto."
              />
            </div>

            {form.variableLabels.length > 0 && (
              <div className="space-y-1.5">
                <Label>Rótulos das variáveis (exibidos no picker)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {form.variableLabels.map((label, i) => (
                    <Input
                      key={i}
                      value={label}
                      placeholder={`Variável {{${i + 1}}}`}
                      onChange={(e) =>
                        setForm((p) => {
                          const labels = [...p.variableLabels];
                          labels[i] = e.target.value;
                          return { ...p, variableLabels: labels };
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Descrição interna (opcional)</Label>
              <Input
                id="tpl-desc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {formValid && form.bodyTemplate && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Pré-visualização</p>
                {
                  renderTemplate(
                    {
                      ...(editing ?? {
                        id: "preview",
                        metaTemplateName: form.metaTemplateName,
                        metaLanguageCode: form.metaLanguageCode,
                        metaCategory: form.metaCategory,
                        metaStatus: form.metaStatus,
                        displayName: form.displayName,
                        isActive: true,
                        createdAt: "",
                        updatedAt: "",
                      }),
                      bodyTemplate: form.bodyTemplate,
                      variableCount: detectedCount,
                      variableLabels: form.variableLabels,
                    },
                    form.variableLabels.map((label, i) => `[${label || `var ${i + 1}`}]`),
                  ).text
                }
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!formValid || createMutation.isPending || updateMutation.isPending}
              onClick={() => (editing ? updateMutation.mutate(editing) : createMutation.mutate())}
            >
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
