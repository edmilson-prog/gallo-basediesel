import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { THEMES } from "@/config/themes";
import { useTheme } from "@/hooks/useTheme";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { Container, Grid, Inline, Stack } from "@/components/layout";
import { contrastRatio, resolveCssVar, wcagLevel } from "@/lib/contrast";
import { useResetMocks } from "@/mocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notificationBus, type INotificationEvent } from "@/providers/notifications/bus";
import { useNotifications, useUnreadCount } from "@/providers/notifications";
import { useAuth } from "@/features/auth/useAuth";

export const Route = createFileRoute("/design-system")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: DesignSystemPage,
});

const PRIMITIVES: { group: string; tokens: { name: string; var: string }[] }[] = [
  {
    group: "Institucional",
    tokens: [
      { name: "Preto absoluto", var: "--gallo-black-pure" },
      { name: "Preto técnico", var: "--gallo-black-tech" },
      { name: "Cinza estrutural", var: "--gallo-gray-structural" },
    ],
  },
  {
    group: "Cromia óleo diesel",
    tokens: [
      { name: "Light", var: "--gallo-diesel-light" },
      { name: "Medium", var: "--gallo-diesel-medium" },
      { name: "Dark", var: "--gallo-diesel-dark" },
    ],
  },
  {
    group: "PARTS (verde RS)",
    tokens: [
      { name: "Light", var: "--gallo-parts-light" },
      { name: "Medium", var: "--gallo-parts-medium" },
      { name: "Dark", var: "--gallo-parts-dark" },
    ],
  },
  {
    group: "SERVICE (vermelho RS)",
    tokens: [
      { name: "Light", var: "--gallo-service-light" },
      { name: "Medium", var: "--gallo-service-medium" },
      { name: "Dark", var: "--gallo-service-dark" },
    ],
  },
  {
    group: "INDUSTRIAL (amarelo RS)",
    tokens: [
      { name: "Light", var: "--gallo-industrial-light" },
      { name: "Medium", var: "--gallo-industrial-medium" },
      { name: "Dark", var: "--gallo-industrial-dark" },
    ],
  },
  {
    group: "Escala neutra",
    tokens: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => ({
      name: `Neutral ${n}`,
      var: `--gallo-neutral-${n}`,
    })),
  },
  {
    group: "Semânticas funcionais",
    tokens: [
      { name: "Success", var: "--gallo-success-medium" },
      { name: "Warning", var: "--gallo-warning-medium" },
      { name: "Danger", var: "--gallo-danger-medium" },
      { name: "Info", var: "--gallo-info-medium" },
    ],
  },
];

const SEMANTICS: { name: string; var: string; description: string }[] = [
  { name: "background", var: "--background", description: "Fundo da página" },
  { name: "foreground", var: "--foreground", description: "Texto principal" },
  { name: "card", var: "--card", description: "Fundo de card" },
  { name: "card-foreground", var: "--card-foreground", description: "Texto em card" },
  { name: "popover", var: "--popover", description: "Fundo de popover/dropdown" },
  { name: "popover-foreground", var: "--popover-foreground", description: "Texto em popover" },
  { name: "primary", var: "--primary", description: "Ação primária (accent do tema)" },
  { name: "primary-foreground", var: "--primary-foreground", description: "Texto sobre primary" },
  { name: "secondary", var: "--secondary", description: "Botão/ação secundária" },
  {
    name: "secondary-foreground",
    var: "--secondary-foreground",
    description: "Texto sobre secondary",
  },
  { name: "muted", var: "--muted", description: "Fundo muted" },
  { name: "muted-foreground", var: "--muted-foreground", description: "Texto auxiliar" },
  { name: "accent", var: "--accent", description: "Hover/destaque" },
  { name: "accent-foreground", var: "--accent-foreground", description: "Texto sobre accent" },
  { name: "destructive", var: "--destructive", description: "Ação destrutiva" },
  { name: "border", var: "--border", description: "Borda padrão" },
  { name: "input", var: "--input", description: "Borda de input" },
  { name: "ring", var: "--ring", description: "Focus ring" },
  { name: "brand-diesel", var: "--brand-diesel", description: "Marca diesel (chips/badges)" },
  { name: "brand-parts", var: "--brand-parts", description: "Marca parts (chips/badges)" },
  { name: "brand-service", var: "--brand-service", description: "Marca service (chips/badges)" },
  {
    name: "brand-industrial",
    var: "--brand-industrial",
    description: "Marca industrial (chips/badges)",
  },
];

const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
const RADII = [
  { name: "none", cls: "rounded-none" },
  { name: "sm", cls: "rounded-sm" },
  { name: "md", cls: "rounded-md" },
  { name: "lg", cls: "rounded-lg" },
  { name: "xl", cls: "rounded-xl" },
  { name: "2xl", cls: "rounded-2xl" },
  { name: "full", cls: "rounded-full" },
];
const SHADOWS = [
  { name: "sm", cls: "shadow-sm" },
  { name: "md", cls: "shadow-md" },
  { name: "lg", cls: "shadow-lg" },
  { name: "xl", cls: "shadow-xl" },
  { name: "2xl", cls: "shadow-2xl" },
];
const RECOMMENDED_ICONS = [
  { ctx: "Cliente", icon: "mdi:account" },
  { ctx: "Vendedor", icon: "mdi:account-tie" },
  { ctx: "Peça", icon: "mdi:cog" },
  { ctx: "Pedido", icon: "mdi:clipboard-list" },
  { ctx: "Conversa", icon: "mdi:message-text" },
  { ctx: "Veículo", icon: "mdi:truck" },
  { ctx: "Alerta", icon: "mdi:alert" },
  { ctx: "Loja", icon: "mdi:store" },
  { ctx: "Pagamento", icon: "mdi:credit-card" },
  { ctx: "Configuração", icon: "mdi:cog-outline" },
  { ctx: "Busca", icon: "mdi:magnify" },
  { ctx: "Dashboard", icon: "mdi:view-dashboard" },
];

const CONTRAST_PAIRS: { fg: string; bg: string; label: string }[] = [
  { fg: "--foreground", bg: "--background", label: "Texto principal sobre fundo" },
  { fg: "--card-foreground", bg: "--card", label: "Texto em card" },
  { fg: "--primary-foreground", bg: "--primary", label: "Texto sobre primary" },
  { fg: "--secondary-foreground", bg: "--secondary", label: "Texto sobre secondary" },
  { fg: "--muted-foreground", bg: "--muted", label: "Texto muted" },
  { fg: "--accent-foreground", bg: "--accent", label: "Texto sobre accent" },
  { fg: "--destructive-foreground", bg: "--destructive", label: "Texto sobre destructive" },
];

function useResolvedVar(varName: string): string {
  const { theme, resolvedMode } = useTheme();
  const [value, setValue] = useState("");
  useEffect(() => {
    // tick após o paint para garantir CSS atualizado
    const id = requestAnimationFrame(() => setValue(resolveCssVar(varName)));
    return () => cancelAnimationFrame(id);
  }, [varName, theme, resolvedMode]);
  return value;
}

function Swatch({ varName }: { varName: string }) {
  const value = useResolvedVar(varName);
  return (
    <div className="flex items-center gap-3">
      <div
        className="size-10 rounded-md border border-border shadow-sm"
        style={{ backgroundColor: `var(${varName})` }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <code className="block truncate font-mono text-xs">{varName}</code>
        <code className="block truncate font-mono text-[10px] text-muted-foreground">
          {value || "—"}
        </code>
      </div>
    </div>
  );
}

function ContrastRow({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  const fgVal = useResolvedVar(fg);
  const bgVal = useResolvedVar(bg);
  const ratio = fgVal && bgVal ? contrastRatio(fgVal, bgVal) : null;
  const level = ratio ? wcagLevel(ratio) : "FAIL";
  const pass = level !== "FAIL";

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
      style={{ backgroundColor: `var(${bg})`, color: `var(${fg})` }}
    >
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs opacity-80">
          {fg} on {bg}
        </span>
      </div>
      <Badge
        variant={pass ? "default" : "destructive"}
        className="font-mono"
        style={{
          backgroundColor: pass ? "var(--gallo-success-medium)" : undefined,
          color: pass ? "#fff" : undefined,
        }}
      >
        {ratio ? ratio.toFixed(2) + "× · " + level : "—"}
      </Badge>
    </div>
  );
}

function DesignSystemPage() {
  const { theme } = useTheme();
  const meta = THEMES[theme];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <Container size="xl">
            <Inline justify="between" className="h-16">
              <Inline gap={3}>
                <Logo variant="horizontal" className="h-7 w-auto" />
                <Separator orientation="vertical" className="h-6" />
                <span className="font-display text-lg font-semibold tracking-wide">
                  Design System
                </span>
                <Badge variant="outline" className="font-mono">
                  v0.7.0 · Hub
                </Badge>
              </Inline>
              <ThemeSwitcher />
            </Inline>
          </Container>
        </header>

        <Container size="xl" className="py-10">
          <Stack gap={10}>
            {/* Intro */}
            <section>
              <h1 className="font-display text-4xl font-bold tracking-tight">GALLO BASE DIESEL</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Identidade visual e design system base. Tema ativo:{" "}
                <strong className="text-foreground">{meta.uiLabel}</strong>. Use o seletor no canto
                superior direito para alternar entre as 8 combinações tema × modo.
              </p>
            </section>

            {/* Tokens primitivos */}
            <Section
              title="Tokens primitivos"
              description="Paleta GALLO bruta. Nunca consumir diretamente em componentes."
            >
              <Stack gap={6}>
                {PRIMITIVES.map((g) => (
                  <div key={g.group}>
                    <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.group}
                    </h3>
                    <Grid cols={4} gap={3}>
                      {g.tokens.map((t) => (
                        <Swatch key={t.var} varName={t.var} />
                      ))}
                    </Grid>
                  </div>
                ))}
              </Stack>
            </Section>

            {/* Tokens semânticos */}
            <Section
              title="Tokens semânticos"
              description="Camada consumida pelos componentes. Valores resolvidos para o tema/modo ativo."
            >
              <Grid cols={3} gap={3}>
                {SEMANTICS.map((s) => (
                  <Card key={s.var}>
                    <CardContent className="pt-4">
                      <Swatch varName={s.var} />
                      <p className="mt-2 text-xs text-muted-foreground">{s.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </Grid>
            </Section>

            {/* Tipografia */}
            <Section
              title="Tipografia"
              description="Saira Condensed (display) · Inter (UI) · JetBrains Mono (códigos)"
            >
              <Stack gap={4}>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    Display · Saira Condensed
                  </p>
                  <p className="font-display text-5xl font-bold">A força do diesel.</p>
                  <p className="font-display text-3xl font-semibold">Robustez técnica.</p>
                  <p className="font-display text-xl">Presença industrial.</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Body · Inter</p>
                  <p className="text-base">
                    A GALLO BASE DIESEL atende as principais marcas do mercado pesado, com peças
                    genuínas e equipe técnica especializada.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Texto auxiliar — densidade legível em uso intenso.
                  </p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Mono · JetBrains Mono</p>
                  <code className="block font-mono text-sm">
                    OEM 4N9618 · SKU 24V-DEN-001 · pedido #2847
                  </code>
                </div>
              </Stack>
            </Section>

            {/* Espaçamento */}
            <Section title="Espaçamento" description="Sistema 4pt (base Tailwind)">
              <Stack gap={2}>
                {SPACING.map((n) => (
                  <Inline key={n} gap={3}>
                    <code className="w-12 font-mono text-xs text-muted-foreground">
                      {n} · {n * 4}px
                    </code>
                    <div className="h-3 rounded-sm bg-primary" style={{ width: `${n * 4}px` }} />
                  </Inline>
                ))}
              </Stack>
            </Section>

            {/* Raios e sombras */}
            <Grid cols={2} gap={6}>
              <Section title="Raios de borda">
                <Grid cols={4} gap={3}>
                  {RADII.map((r) => (
                    <div key={r.name} className="flex flex-col items-center gap-2">
                      <div className={`size-16 border border-border bg-primary ${r.cls}`} />
                      <code className="font-mono text-xs">{r.name}</code>
                    </div>
                  ))}
                </Grid>
              </Section>
              <Section title="Sombras">
                <Grid cols={3} gap={3}>
                  {SHADOWS.map((s) => (
                    <div key={s.name} className="flex flex-col items-center gap-2">
                      <div className={`size-16 rounded-md bg-card ${s.cls} border border-border`} />
                      <code className="font-mono text-xs">{s.name}</code>
                    </div>
                  ))}
                </Grid>
              </Section>
            </Grid>

            {/* Logo */}
            <Section
              title="Logo"
              description="Variantes — placeholders tipográficas (substituir pelos oficiais)"
            >
              <Grid cols={3} gap={4}>
                <Card>
                  <CardContent className="flex items-center justify-center p-8">
                    <Logo variant="horizontal" className="h-10" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center justify-center p-8">
                    <Logo variant="vertical" className="h-32" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center justify-center p-8">
                    <Logo variant="mark" className="size-20" />
                  </CardContent>
                </Card>
              </Grid>
            </Section>

            {/* Ícones */}
            <Section
              title="Ícones (Iconify)"
              description="Carregados sob demanda. Sets: mdi, lucide, phosphor."
            >
              <Grid cols={6} gap={3}>
                {RECOMMENDED_ICONS.map((i) => (
                  <Card key={i.ctx} className="text-center">
                    <CardContent className="flex flex-col items-center gap-2 p-4">
                      <Icon icon={i.icon} size={32} ariaLabel={i.ctx} />
                      <span className="text-xs">{i.ctx}</span>
                      <code className="font-mono text-[10px] text-muted-foreground">{i.icon}</code>
                    </CardContent>
                  </Card>
                ))}
              </Grid>
            </Section>

            {/* Componentes */}
            <Section
              title="Componentes"
              description="Galeria de componentes base nos tokens semânticos do tema ativo."
            >
              <Stack gap={6}>
                {/* Buttons */}
                <Card>
                  <CardHeader>
                    <CardTitle>Buttons</CardTitle>
                    <CardDescription>Variants × states</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Inline gap={2} wrap>
                      <Button>Default</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="link">Link</Button>
                      <Button variant="destructive">Destructive</Button>
                      <Button disabled>Disabled</Button>
                      <Button size="sm">Small</Button>
                      <Button size="lg">Large</Button>
                      <Button size="icon" aria-label="settings">
                        <Icon icon="mdi:cog" size={18} />
                      </Button>
                    </Inline>
                  </CardContent>
                </Card>

                {/* Form */}
                <Card>
                  <CardHeader>
                    <CardTitle>Formulários</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Grid cols={2} gap={4}>
                      <Stack gap={3}>
                        <div>
                          <Label htmlFor="ds-input">Nome do cliente</Label>
                          <Input id="ds-input" placeholder="ex.: Transportadora RS" />
                        </div>
                        <div>
                          <Label htmlFor="ds-input-err">Com erro</Label>
                          <Input id="ds-input-err" aria-invalid placeholder="OEM inválido" />
                        </div>
                        <div>
                          <Label htmlFor="ds-textarea">Observações</Label>
                          <Textarea id="ds-textarea" placeholder="Notas técnicas…" />
                        </div>
                        <div>
                          <Label>Submarca</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="parts">Parts</SelectItem>
                              <SelectItem value="service">Service</SelectItem>
                              <SelectItem value="industrial">Industrial</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </Stack>
                      <Stack gap={3}>
                        <Inline gap={2}>
                          <Checkbox id="ds-cb" defaultChecked />
                          <Label htmlFor="ds-cb">Aceitar termos</Label>
                        </Inline>
                        <Inline gap={2}>
                          <Switch id="ds-sw" defaultChecked />
                          <Label htmlFor="ds-sw">Notificações</Label>
                        </Inline>
                        <RadioGroup defaultValue="a">
                          <Inline gap={2}>
                            <RadioGroupItem value="a" id="ds-r-a" />
                            <Label htmlFor="ds-r-a">Opção A</Label>
                          </Inline>
                          <Inline gap={2}>
                            <RadioGroupItem value="b" id="ds-r-b" />
                            <Label htmlFor="ds-r-b">Opção B</Label>
                          </Inline>
                        </RadioGroup>
                        <Progress value={62} />
                      </Stack>
                    </Grid>
                  </CardContent>
                </Card>

                {/* Badges / brand chips */}
                <Card>
                  <CardHeader>
                    <CardTitle>Badges &amp; brand chips</CardTitle>
                    <CardDescription>
                      As submarcas viram badges semânticos — distintos das cores funcionais.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Inline gap={2} wrap>
                      <Badge>Default</Badge>
                      <Badge variant="secondary">Secondary</Badge>
                      <Badge variant="outline">Outline</Badge>
                      <Badge variant="destructive">Destructive</Badge>
                      <Badge style={{ backgroundColor: "var(--brand-diesel)", color: "#000" }}>
                        Diesel
                      </Badge>
                      <Badge style={{ backgroundColor: "var(--brand-parts)", color: "#fff" }}>
                        Parts
                      </Badge>
                      <Badge style={{ backgroundColor: "var(--brand-service)", color: "#fff" }}>
                        Service
                      </Badge>
                      <Badge style={{ backgroundColor: "var(--brand-industrial)", color: "#000" }}>
                        Industrial
                      </Badge>
                    </Inline>
                  </CardContent>
                </Card>

                {/* Alert / Skeleton */}
                <Grid cols={2} gap={4}>
                  <Alert>
                    <AlertTitle>Atenção</AlertTitle>
                    <AlertDescription>
                      OEM informado pertence a duas peças distintas. Confirme antes de prosseguir.
                    </AlertDescription>
                  </Alert>
                  <Card>
                    <CardContent className="space-y-3 pt-6">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                </Grid>

                {/* Tabs */}
                <Card>
                  <CardContent className="pt-6">
                    <Tabs defaultValue="resumo">
                      <TabsList>
                        <TabsTrigger value="resumo">Resumo</TabsTrigger>
                        <TabsTrigger value="historico">Histórico</TabsTrigger>
                        <TabsTrigger value="notas">Notas</TabsTrigger>
                      </TabsList>
                      <TabsContent value="resumo" className="pt-3 text-sm">
                        Cliente fiel, 14 pedidos nos últimos 6 meses.
                      </TabsContent>
                      <TabsContent value="historico" className="pt-3 text-sm">
                        Histórico de compras…
                      </TabsContent>
                      <TabsContent value="notas" className="pt-3 text-sm">
                        Sem notas.
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Tabela</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>OEM</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Submarca</TableHead>
                          <TableHead className="text-right">Estoque</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-mono">4N9618</TableCell>
                          <TableCell>Bico injetor</TableCell>
                          <TableCell>
                            <Badge>Parts</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">23</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-mono">24V-DEN-001</TableCell>
                          <TableCell>Alternador 24V</TableCell>
                          <TableCell>
                            <Badge variant="secondary">Service</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">4</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Avatar / Tooltip */}
                <Card>
                  <CardContent className="pt-6">
                    <Inline gap={3}>
                      <Avatar>
                        <AvatarFallback>GA</AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback>RB</AvatarFallback>
                      </Avatar>
                      <Avatar>
                        <AvatarFallback>MS</AvatarFallback>
                      </Avatar>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm">
                            Hover me
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Tooltip no tema {meta.codename}</TooltipContent>
                      </Tooltip>
                    </Inline>
                  </CardContent>
                </Card>
              </Stack>
            </Section>

            {/* Mocks — PRD-004 */}
            <Section
              title="Mocks (dev only)"
              description="Camada de dados fictícios determinísticos. Resetar reconstrói todo o dataset com a seed informada."
            >
              <MocksPanel />
            </Section>

            {/* Notifications Harness — PRD-008 */}
            <Section
              title="Harness de Notificações (dev only)"
              description="Dispara eventos de domínio reais no bus de notificações e observa roteamento e entrega."
            >
              <NotificationsHarnessPanel />
            </Section>

            {/* WCAG */}
            <Section
              title="Validador de contraste WCAG 2.1"
              description="Pares texto/fundo no tema/modo ativo. AA = 4.5× (texto normal), AA-large = 3×, AAA = 7×."
            >
              <Stack gap={2}>
                {CONTRAST_PAIRS.map((p) => (
                  <ContrastRow key={p.fg + p.bg} {...p} />
                ))}
              </Stack>
            </Section>

            <p className="py-6 text-center text-xs text-muted-foreground">
              GALLO BASE DIESEL — Design System v0.7.0 · Hub
            </p>
          </Stack>
        </Container>
      </div>
    </TooltipProvider>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notifications Harness Panel — PRD-008 (dev only)
// ---------------------------------------------------------------------------

/** Max log entries kept in state (newest-first). */
const MAX_LOG_ENTRIES = 20;

/** Sample ids used when the event requires ids the current user doesn't own. */
const SAMPLE_STORE_ID = "store-matriz";
const SAMPLE_MANAGER_IDS = ["seller-marina-cardoso"];
const SAMPLE_OWNER_IDS = ["seller-joao-gallo"];
const SAMPLE_CUSTOMER_ID = "customer-001";
const FALLBACK_SELLER_ID = "seller-0001";

interface ILogEntry {
  id: string;
  occurredAt: string;
  type: string;
  recipientSummary: string;
}

/** Build a compact summary of which recipient ids are present in a payload. */
function summarisePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "(no payload)";
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (p.sellerId) parts.push(`seller:${String(p.sellerId)}`);
  if (Array.isArray(p.managerIds) && p.managerIds.length > 0)
    parts.push(`managers:[${(p.managerIds as string[]).join(",")}]`);
  if (Array.isArray(p.ownerIds) && p.ownerIds.length > 0)
    parts.push(`owners:[${(p.ownerIds as string[]).join(",")}]`);
  if (p.customerId) parts.push(`customer:${String(p.customerId)}`);
  if (p.storeId) parts.push(`store:${String(p.storeId)}`);
  return parts.length ? parts.join(" · ") : "(sem destinatários)";
}

function NotificationsHarnessPanel() {
  const { currentUser } = useAuth();
  // Prefer the underlying domain seller id so RBAC scoping in the store matches.
  const sellerId: string = currentUser?.sellerId ?? currentUser?.id ?? FALLBACK_SELLER_ID;
  const usingFallback = !currentUser?.sellerId && !currentUser?.id;

  const [log, setLog] = useState<ILogEntry[]>([]);
  const counterRef = useRef(0);

  // Subscribe to the bus to observe every emitted event.
  useEffect(() => {
    const unsubscribe = notificationBus.subscribe((event: INotificationEvent) => {
      const entry: ILogEntry = {
        id: String(++counterRef.current),
        occurredAt: event.occurredAt,
        type: String(event.type),
        recipientSummary: summarisePayload(event.payload),
      };
      setLog((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
    });
    return unsubscribe;
  }, []);

  const { count: unreadCount, isLoading: unreadLoading } = useUnreadCount();
  const {
    data: notifications,
    isLoading: notifLoading,
    isFetching,
    refetch,
  } = useNotifications({ limit: 5 } as Parameters<typeof useNotifications>[0]);

  // --- fire helpers -----------------------------------------------------------

  const fire = (
    type: Parameters<typeof notificationBus.emit>[0],
    payload: Parameters<typeof notificationBus.emit>[1],
  ) => {
    notificationBus.emit(type, payload, new Date().toISOString());
  };

  const fireConversaAtribuida = () =>
    fire("conversa.atribuida", {
      sellerId,
      storeId: SAMPLE_STORE_ID,
      entityId: "conv-001",
      entityType: "conversation",
      title: "Nova conversa atribuída",
      body: "Você foi atribuído a uma nova conversa de cliente.",
    });

  const fireLeadNovo = () =>
    fire("lead.novo", {
      sellerId,
      storeId: SAMPLE_STORE_ID,
      entityId: "lead-001",
      entityType: "lead",
      title: "Novo lead recebido",
      body: "Um novo lead foi gerado e atribuído a você.",
    });

  const fireMetaBatida = () =>
    fire("meta.batida", {
      sellerId,
      managerIds: SAMPLE_MANAGER_IDS,
      storeId: SAMPLE_STORE_ID,
      title: "Meta batida! 🏆",
      body: "Parabéns! Você atingiu 100% da meta mensal de vendas.",
    });

  const firePedidoCriado = () =>
    fire("pedido.criado", {
      sellerId,
      customerId: SAMPLE_CUSTOMER_ID,
      storeId: SAMPLE_STORE_ID,
      entityId: "pedido-001",
      entityType: "order",
      title: "Pedido criado",
      body: "O pedido #pedido-001 foi criado com sucesso.",
    });

  const fireSistemaManutencao = () =>
    fire("sistema.manutencao", {
      sellerId,
      managerIds: SAMPLE_MANAGER_IDS,
      ownerIds: SAMPLE_OWNER_IDS,
      customerId: SAMPLE_CUSTOMER_ID,
      storeId: SAMPLE_STORE_ID,
      title: "Manutenção programada",
      body: "O sistema entrará em manutenção hoje às 22h por aproximadamente 1 hora.",
    });

  const fireClienteDormente = () =>
    fire("cliente.dormente", {
      sellerId,
      managerIds: SAMPLE_MANAGER_IDS,
      storeId: SAMPLE_STORE_ID,
      entityId: SAMPLE_CUSTOMER_ID,
      entityType: "customer",
      title: "Cliente dormente",
      body: "Transportadora Aurora Ltda está sem compras há 45 dias.",
    });

  // --- render -----------------------------------------------------------------

  const EVENT_BUTTONS: { label: string; action: () => void; badge: string }[] = [
    { label: "Conversa atribuída", action: fireConversaAtribuida, badge: "operational" },
    { label: "Novo lead", action: fireLeadNovo, badge: "commercial" },
    { label: "Meta batida", action: fireMetaBatida, badge: "gamification" },
    { label: "Pedido criado", action: firePedidoCriado, badge: "transactional" },
    { label: "Manutenção do sistema", action: fireSistemaManutencao, badge: "system" },
    { label: "Cliente dormente", action: fireClienteDormente, badge: "commercial" },
  ];

  return (
    <Stack gap={4}>
      {/* Intro caption */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Ferramenta de desenvolvimento (PRD-008).</strong>{" "}
            Clique em um dos botões abaixo para disparar um evento de domínio real no bus de
            notificações. O roteador global processa o evento, resolve destinatários e persiste
            notificações in-app. Abra o{" "}
            <strong className="text-foreground">console do navegador</strong> para ver o resumo
            detalhado de roteamento:{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              [notificationRouter]
            </code>{" "}
            — destinatários, canais enviados / adiados / ignorados.
          </p>
          {usingFallback && (
            <p className="mt-2 text-xs text-muted-foreground">
              Nenhum usuário autenticado detectado — usando{" "}
              <code className="font-mono">{FALLBACK_SELLER_ID}</code> como{" "}
              <code className="font-mono">sellerId</code>. Faça login em{" "}
              <code className="font-mono">/auth/login</code> para direcionar eventos ao usuário
              atual.
            </p>
          )}
          {!usingFallback && (
            <p className="mt-2 text-xs text-muted-foreground">
              Usuário ativo: <strong className="text-foreground">{currentUser?.displayName}</strong>{" "}
              — <code className="font-mono text-xs">{sellerId}</code>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Fire buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Disparar evento</CardTitle>
          <CardDescription>
            Cada botão emite um evento representativo de uma categoria distinta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Grid cols={3} gap={3}>
            {EVENT_BUTTONS.map((btn) => (
              <div key={btn.label} className="flex flex-col gap-1">
                <Button variant="outline" className="w-full justify-start" onClick={btn.action}>
                  <Icon icon="mdi:bell-ring" size={16} className="mr-2 shrink-0" />
                  {btn.label}
                </Button>
                <Badge variant="secondary" className="w-fit font-mono text-[10px]">
                  {btn.badge}
                </Badge>
              </div>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Live event log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log de eventos (bus)</CardTitle>
          <CardDescription>
            Eventos recebidos nesta sessão — últimos {MAX_LOG_ENTRIES}, mais recentes primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum evento ainda. Clique em um botão acima para disparar.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
              <Stack gap={2}>
                {log.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded border border-border bg-card p-2 font-mono text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(entry.occurredAt).toLocaleTimeString("pt-BR")}
                    </span>{" "}
                    <span className="font-semibold text-foreground">{entry.type}</span>
                    <br />
                    <span className="text-muted-foreground">{entry.recipientSummary}</span>
                  </div>
                ))}
              </Stack>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Persistence readout */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Persistência in-app</CardTitle>
          <CardDescription>
            Confirme que os eventos disparados foram persistidos como notificações. O roteador
            persiste de forma assíncrona — clique em "Atualizar" após disparar um evento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Inline gap={3} className="items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Não lidas:</span>
                {unreadLoading ? (
                  <Skeleton className="h-6 w-10" />
                ) : (
                  <Badge className="font-mono">{unreadCount}</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
                <Icon icon="mdi:refresh" size={14} className="mr-1" />
                {isFetching ? "Atualizando…" : "Atualizar"}
              </Button>
            </Inline>

            {notifLoading ? (
              <Stack gap={2}>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </Stack>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma notificação persistida para o usuário atual ainda.
              </p>
            ) : (
              <Stack gap={2}>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2 rounded border border-border bg-muted/30 p-2 text-sm"
                  >
                    <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[10px]">
                      {n.status}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                    </div>
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function MocksPanel() {
  const { reset, loading, lastResult } = useResetMocks();
  const [seedInput, setSeedInput] = useState("");

  const handleReset = (useCustomSeed: boolean) => {
    const parsed = useCustomSeed ? Number(seedInput) : undefined;
    const seed = useCustomSeed && Number.isFinite(parsed) ? parsed : undefined;
    reset(seed);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Gerador de dados fictícios</CardTitle>
        <CardDescription>
          Refaz todo o dataset em memória. Dados existentes na sessão são perdidos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          <Inline gap={2} className="items-end">
            <div className="grow">
              <Label htmlFor="mock-seed" className="mb-1 block text-xs uppercase tracking-wide">
                Seed customizada (opcional)
              </Label>
              <Input
                id="mock-seed"
                inputMode="numeric"
                placeholder="ex.: 1337"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={loading || seedInput.trim() === ""}
              onClick={() => handleReset(true)}
            >
              Reset com seed
            </Button>
            <Button disabled={loading} onClick={() => handleReset(false)}>
              Reset com nova seed
            </Button>
          </Inline>
          {lastResult && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-mono">
                seed: <strong>{lastResult.seed}</strong>
              </p>
              <p className="text-muted-foreground">
                {lastResult.totalItems} itens regerados em{" "}
                {new Date(lastResult.generatedAt).toLocaleString("pt-BR")}.
              </p>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
