import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type {
  IPlatformSettings,
  ISdrQuoteTemplates,
  ISdrTemplate,
  SdrTemplateTrigger,
} from "@/shared/types";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "@/features/sdr-quote/templates/defaults";
import { SdrTemplateEditor } from "../SdrTemplateEditor";
import { SDR_TEMPLATE_GROUPS } from "../../config/groups";

export interface ISdrTemplatesTabProps {
  settings: IPlatformSettings | null;
  loading: boolean;
  saving: boolean;
  update: (
    patch: Partial<IPlatformSettings>,
    auditAction?: string,
  ) => Promise<IPlatformSettings | null>;
  canEdit: boolean;
}

const TRIGGER_TITLE: Record<SdrTemplateTrigger, string> = {
  saudacao: "Saudação inicial",
  identificacao_nome: "Identificação — nome",
  identificacao_empresa: "Identificação — empresa",
  pergunta_necessidade: "Pergunta de necessidade",
  faq_horario: "FAQ — horário",
  faq_entrega: "FAQ — entrega",
  escalacao_humano: "Escalação para humano",
  despedida: "Despedida",
};

const PREVIEW_VARS_CORE: Record<string, string> = {
  nome: "João",
  empresa: "Frota Express",
};

const PREVIEW_VARS_QUOTE: Record<string, string> = {
  cliente_nome: "João",
  cliente_nome_separador: ", ",
  peca_nome: "Filtro de óleo Volvo",
  peca_codigo: "VL-21317781",
  peca_tipo: "Original",
  quantidade: "1",
  valor_unitario: "145,00",
  subtotal: "145,00",
  desconto: "0,00",
  frete_formatado: "R$ 28,00",
  total: "173,00",
  validade: "01/06/2026",
};

const PREVIEW_VARS_ESCALATION: Record<string, string> = {
  saudacao_nome: ", João",
  nome: "João",
  resumo_curto: "• Filtro de óleo Volvo\n• Veículo: Volvo R450 2022\n• Orçamento: R$ 173,00",
};

type QuoteSlot = keyof ISdrQuoteTemplates;

const QUOTE_TITLES: Record<QuoteSlot, string> = {
  generation: "Orçamento — geração",
  accept: "Orçamento — cliente aceita",
  reject: "Orçamento — cliente recusa",
  escalate: "Orçamento — cliente negocia",
};

export function SdrTemplatesTab({
  settings,
  loading,
  saving,
  update,
  canEdit,
}: ISdrTemplatesTabProps) {
  const [coreDrafts, setCoreDrafts] = useState<Record<string, string>>({});
  const [quoteDrafts, setQuoteDrafts] = useState<Partial<ISdrQuoteTemplates>>({});
  const [escalationDraft, setEscalationDraft] = useState<string | null>(null);

  useEffect(() => {
    setCoreDrafts({});
    setQuoteDrafts({});
    setEscalationDraft(null);
  }, [settings?.storeId]);

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const getCoreText = (template: ISdrTemplate) => coreDrafts[template.id] ?? template.text;

  const saveCoreTemplate = async (template: ISdrTemplate) => {
    const nextText = getCoreText(template);
    const used = [...nextText.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    const variables = [...new Set(used)];
    const next = settings.sdrTemplates.map((t) =>
      t.id === template.id ? { ...t, text: nextText, variables } : t,
    );
    try {
      await update({ sdrTemplates: next }, "sdr.templates.update");
      toast.success(`Template "${TRIGGER_TITLE[template.trigger]}" atualizado.`);
      setCoreDrafts((prev) => {
        const copy = { ...prev };
        delete copy[template.id];
        return copy;
      });
    } catch {
      toast.error("Falha ao salvar o template.");
    }
  };

  const resetCoreTemplate = async (template: ISdrTemplate) => {
    const original = DEFAULT_SDR_TEMPLATES.find(
      (t) => t.id === template.id || t.trigger === template.trigger,
    );
    if (!original) return;
    const next = settings.sdrTemplates.map((t) =>
      t.id === template.id ? { ...t, text: original.text, variables: original.variables } : t,
    );
    try {
      await update({ sdrTemplates: next }, "sdr.templates.reset");
      toast.success(`Template "${TRIGGER_TITLE[template.trigger]}" restaurado.`);
      setCoreDrafts((prev) => {
        const copy = { ...prev };
        delete copy[template.id];
        return copy;
      });
    } catch {
      toast.error("Falha ao restaurar o template.");
    }
  };

  const saveQuoteTemplate = async (slot: QuoteSlot) => {
    const next: ISdrQuoteTemplates = {
      ...settings.sdrQuoteTemplates,
      [slot]: quoteDrafts[slot] ?? settings.sdrQuoteTemplates[slot],
    };
    try {
      await update({ sdrQuoteTemplates: next }, "sdr.quote.templates.update");
      toast.success(`Template "${QUOTE_TITLES[slot]}" atualizado.`);
      setQuoteDrafts((prev) => {
        const copy = { ...prev };
        delete copy[slot];
        return copy;
      });
    } catch {
      toast.error("Falha ao salvar o template.");
    }
  };

  const resetQuoteTemplate = async (slot: QuoteSlot) => {
    const next: ISdrQuoteTemplates = {
      ...settings.sdrQuoteTemplates,
      [slot]: DEFAULT_SDR_QUOTE_TEMPLATES[slot],
    };
    try {
      await update({ sdrQuoteTemplates: next }, "sdr.quote.templates.reset");
      toast.success(`Template "${QUOTE_TITLES[slot]}" restaurado.`);
      setQuoteDrafts((prev) => {
        const copy = { ...prev };
        delete copy[slot];
        return copy;
      });
    } catch {
      toast.error("Falha ao restaurar o template.");
    }
  };

  const saveEscalationTemplate = async () => {
    const nextText = escalationDraft ?? settings.escalationCustomerHandoffTemplate;
    try {
      await update(
        { escalationCustomerHandoffTemplate: nextText },
        "sdr.escalation.handoff.update",
      );
      toast.success("Template de escalação atualizado.");
      setEscalationDraft(null);
    } catch {
      toast.error("Falha ao salvar o template.");
    }
  };

  const resetEscalationTemplate = async () => {
    try {
      await update(
        {
          escalationCustomerHandoffTemplate: ESCALATION_HANDOFF_DEFAULT,
        },
        "sdr.escalation.handoff.reset",
      );
      toast.success("Template de escalação restaurado.");
      setEscalationDraft(null);
    } catch {
      toast.error("Falha ao restaurar o template.");
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="rounded-md border border-amber-200/40 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/30 dark:bg-amber-500/10 dark:text-amber-100">
          <span className="inline-flex items-center gap-2">
            <Icon icon="mdi:shield-lock-outline" size={14} />
            Edição requer permissão de Owner. Você está visualizando os templates em modo leitura.
          </span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Estes textos não alimentam o SDR real hoje — o prompt real é configurado em
          Configurações → Inteligência artificial → Funcionalidades.
        </span>
      </div>

      <Accordion type="multiple" defaultValue={["greeting"]} className="space-y-3">
        {SDR_TEMPLATE_GROUPS.map((group) => (
          <AccordionItem key={group.id} value={group.id} className="rounded-md border bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon icon={group.icon} size={16} className="text-primary" />
                {group.label}
                <span className="text-xs text-muted-foreground">· {group.description}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-4 pb-4">
              {group.triggers.map((trigger) => {
                const template = settings.sdrTemplates.find((t) => t.trigger === trigger);
                if (!template) return null;
                const defaultText =
                  DEFAULT_SDR_TEMPLATES.find(
                    (t) => t.id === template.id || t.trigger === template.trigger,
                  )?.text ?? template.text;
                return (
                  <SdrTemplateEditor
                    key={template.id}
                    id={template.id}
                    title={TRIGGER_TITLE[template.trigger]}
                    triggerCode={template.trigger}
                    text={getCoreText(template)}
                    defaultText={defaultText}
                    saving={saving}
                    readOnly={!canEdit}
                    previewVariables={PREVIEW_VARS_CORE}
                    onChange={(text) => setCoreDrafts((prev) => ({ ...prev, [template.id]: text }))}
                    onSave={() => void saveCoreTemplate(template)}
                    onReset={() => void resetCoreTemplate(template)}
                  />
                );
              })}
            </AccordionContent>
          </AccordionItem>
        ))}

        <AccordionItem value="quote" className="rounded-md border bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon icon="mdi:file-document-outline" size={16} className="text-primary" />
              Orçamento (PRD-022)
              <span className="text-xs text-muted-foreground">
                · Mensagens das 4 etapas do orçamento
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4 pb-4">
            {(Object.keys(QUOTE_TITLES) as QuoteSlot[]).map((slot) => {
              const text = quoteDrafts[slot] ?? settings.sdrQuoteTemplates[slot];
              return (
                <SdrTemplateEditor
                  key={`quote-${slot}`}
                  id={`quote-${slot}`}
                  title={QUOTE_TITLES[slot]}
                  triggerCode={`quote.${slot}`}
                  text={text}
                  defaultText={DEFAULT_SDR_QUOTE_TEMPLATES[slot]}
                  saving={saving}
                  readOnly={!canEdit}
                  previewVariables={PREVIEW_VARS_QUOTE}
                  onChange={(next) => setQuoteDrafts((prev) => ({ ...prev, [slot]: next }))}
                  onSave={() => void saveQuoteTemplate(slot)}
                  onReset={() => void resetQuoteTemplate(slot)}
                />
              );
            })}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="escalation" className="rounded-md border bg-card">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon icon="mdi:account-arrow-right-outline" size={16} className="text-primary" />
              Escalação para humano (PRD-023)
              <span className="text-xs text-muted-foreground">
                · Mensagem de handoff enviada ao cliente
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4 pb-4">
            <SdrTemplateEditor
              id="escalation-handoff"
              title="Handoff para vendedor"
              triggerCode="escalation.customer_handoff"
              text={escalationDraft ?? settings.escalationCustomerHandoffTemplate}
              defaultText={ESCALATION_HANDOFF_DEFAULT}
              saving={saving}
              readOnly={!canEdit}
              previewVariables={PREVIEW_VARS_ESCALATION}
              onChange={(text) => setEscalationDraft(text)}
              onSave={() => void saveEscalationTemplate()}
              onReset={() => void resetEscalationTemplate()}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

const ESCALATION_HANDOFF_DEFAULT = [
  "Tudo certo{{saudacao_nome}}! Vou te conectar com um vendedor especialista que continua daqui.",
  "",
  "Resumo do que conversamos:",
  "{{resumo_curto}}",
  "",
  "Aguarde só um instante. 🤝",
].join("\n");
