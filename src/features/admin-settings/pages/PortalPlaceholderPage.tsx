import { PlaceholderSection } from "../components/PlaceholderSection";

export function PortalPlaceholderPage() {
  return (
    <PlaceholderSection
      title="Portal do cliente"
      description="Defina os defaults do portal externo que clientes B2B podem acessar para acompanhar pedidos, baixar nota fiscal e consultar tabela de preços."
      icon="mdi:web"
      prdCodes="071"
      whatComes={[
        "Liberar/restringir histórico de pedidos",
        "Permitir criação de orçamentos pelo próprio cliente",
        "Mostrar tabela de preços personalizada e limite de crédito",
        "Habilitar download de nota fiscal",
        "Configurar identidade visual por loja (logo, cores)",
      ]}
      statusNote="Hoje o portal usa os campos individuais (ICustomer.portal) por cliente. O painel de defaults vem na Fase 2."
    />
  );
}
