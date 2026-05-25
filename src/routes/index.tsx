import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Container, Grid, Inline, Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { THEMES } from "@/config/themes";
import { useTheme } from "@/hooks/useTheme";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { theme } = useTheme();
  const meta = THEMES[theme];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <Container size="xl">
          <Inline justify="between" className="h-16">
            <Logo variant="horizontal" className="h-7" />
            <Inline gap={3}>
              <Badge variant="outline" className="font-mono">
                v0.1.1 · Genesis
              </Badge>
              <ThemeSwitcher />
            </Inline>
          </Inline>
        </Container>
      </header>

      <main>
        <Container size="lg" className="py-20">
          <Stack gap={8} align="center" className="text-center">
            <Badge style={{ backgroundColor: meta.accentHex, color: "#000" }}>
              Tema ativo: {meta.uiLabel}
            </Badge>
            <h1 className="font-display text-5xl font-bold tracking-tight md:text-7xl">
              GALLO BASE DIESEL
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Plataforma proprietária de operação e inteligência comercial. Esta entrega estabelece
              a fundação visual: identidade GALLO, sistema de 4 temas × 2 modos e biblioteca de
              componentes base.
            </p>
            <Inline gap={3}>
              {import.meta.env.DEV && (
                <Button asChild size="lg">
                  <Link to="/design-system">
                    <Icon icon="mdi:palette" size={18} className="mr-2" />
                    Abrir Design System
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="lg" asChild>
                <a href="https://github.com" target="_blank" rel="noreferrer">
                  <Icon icon="mdi:book-open-variant" size={18} className="mr-2" />
                  Documentação
                </a>
              </Button>
            </Inline>
          </Stack>

          <Grid cols={4} gap={4} className="mt-20">
            {Object.values(THEMES).map((t) => (
              <Card key={t.name}>
                <CardHeader>
                  <Inline gap={2}>
                    <span
                      aria-hidden
                      className="size-4 rounded-full border border-border"
                      style={{ backgroundColor: t.accentHex }}
                    />
                    <CardTitle className="text-base">{t.codename}</CardTitle>
                  </Inline>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs text-muted-foreground">{t.brand}</p>
                  <p className="mt-2 text-sm">{t.description}</p>
                </CardContent>
              </Card>
            ))}
          </Grid>

          <div className="mt-20 grid gap-4 md:grid-cols-3">
            <Feature
              icon="mdi:palette-swatch"
              title="Tokens em 3 camadas"
              text="Primitivos → semânticos → tema. Trocar a paleta nunca toca um componente."
            />
            <Feature
              icon="mdi:theme-light-dark"
              title="4 temas × 2 modos"
              text="8 combinações funcionais, persistidas em localStorage, sem FOUC."
            />
            <Feature
              icon="mdi:check-decagram"
              title="WCAG 2.1 AA"
              text="Validador de contraste embutido na página /design-system."
            />
          </div>
        </Container>
      </main>

      <footer className="border-t border-border">
        <Container size="xl" className="py-6">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} GALLO BASE DIESEL — Design System v0.1.1 · Genesis
          </p>
        </Container>
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Icon icon={icon} size={28} className="text-primary" />
        <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
