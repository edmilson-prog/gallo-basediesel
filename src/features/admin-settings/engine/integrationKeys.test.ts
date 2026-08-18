import { describe, expect, it } from "vitest";
import { buildIntegrationKeyCatalog, isValidSecretName } from "./integrationKeys";

const META_ACCOUNT = {
  id: "wa-meta-1",
  label: "Matriz",
  provider: "meta" as const,
  credentialsRef: "WHATSAPP_META_MATRIZ",
};

const EVOLUTION_ACCOUNT = {
  id: "wa-evo-1",
  label: "Campanhas",
  provider: "evolution" as const,
  credentialsRef: "WHATSAPP_EVO_CAMPANHAS",
};

describe("isValidSecretName", () => {
  it("accepts env-style names", () => {
    expect(isValidSecretName("RESEND_API_KEY")).toBe(true);
    expect(isValidSecretName("WHATSAPP_META_MATRIZ_ACCESS_TOKEN")).toBe(true);
  });

  it("rejects lowercase, leading digits/underscore and symbols", () => {
    expect(isValidSecretName("resend_api_key")).toBe(false);
    expect(isValidSecretName("1KEY")).toBe(false);
    expect(isValidSecretName("_KEY")).toBe(false);
    expect(isValidSecretName("KEY WITH SPACE")).toBe(false);
    expect(isValidSecretName("")).toBe(false);
  });
});

describe("buildIntegrationKeyCatalog", () => {
  it("always includes the Resend and webhook app-level groups", () => {
    const groups = buildIntegrationKeyCatalog([]);
    const ids = groups.map((group) => group.id);
    expect(ids).toEqual([
      "resend",
      "whatsapp-webhook",
      "llm-providers",
      "melhor-envio",
      "mercado-pago",
      "fiscal-notes",
    ]);

    const resend = groups[0];
    expect(resend?.keys.map((key) => key.name)).toEqual([
      "RESEND_API_KEY",
      "RESEND_FROM",
      "INVITE_REDIRECT_URL",
    ]);
  });

  it("inclui o grupo de Provedores LLM com as 4 chaves", () => {
    const groups = buildIntegrationKeyCatalog([]);
    const llm = groups.find((group) => group.id === "llm-providers");
    expect(llm).toBeDefined();
    const names = llm!.keys.map((key) => key.name).sort();
    expect(names).toEqual([
      "ANTHROPIC_API_KEY",
      "GOOGLE_AI_API_KEY",
      "OPENAI_API_KEY",
      "OPENROUTER_API_KEY",
    ]);
  });

  it("inclui o grupo Frete — Melhor Envio com chaves por ambiente (produção + sandbox)", () => {
    const groups = buildIntegrationKeyCatalog([]);
    const me = groups.find((group) => group.id === "melhor-envio");
    expect(me).toBeDefined();
    expect(me!.keys.map((key) => key.name)).toEqual([
      "MELHOR_ENVIO_CLIENT_ID",
      "MELHOR_ENVIO_CLIENT_SECRET",
      "MELHOR_ENVIO_SANDBOX_CLIENT_ID",
      "MELHOR_ENVIO_SANDBOX_CLIENT_SECRET",
      "MELHOR_ENVIO_REDIRECT_URI",
      "MELHOR_ENVIO_USER_AGENT",
    ]);
    // Both client secrets are the true secrets; redirect/user-agent are plain config.
    const secretNames = me!.keys.filter((key) => key.kind === "secret").map((key) => key.name);
    expect(secretNames).toEqual([
      "MELHOR_ENVIO_CLIENT_SECRET",
      "MELHOR_ENVIO_SANDBOX_CLIENT_SECRET",
    ]);
  });

  it("inclui o grupo Pagamentos — Mercado Pago com chaves por ambiente (produção + teste)", () => {
    const groups = buildIntegrationKeyCatalog([]);
    const mp = groups.find((group) => group.id === "mercado-pago");
    expect(mp).toBeDefined();
    expect(mp!.keys.map((key) => key.name)).toEqual([
      "MERCADO_PAGO_ACCESS_TOKEN",
      "MERCADO_PAGO_PUBLIC_KEY",
      "MERCADO_PAGO_TEST_ACCESS_TOKEN",
      "MERCADO_PAGO_TEST_PUBLIC_KEY",
      "MERCADO_PAGO_WEBHOOK_SECRET",
    ]);
    // Access tokens and the signature secret are sensitive; public keys are meant
    // to reach the browser, so they follow the plain-config path.
    const secretNames = mp!.keys.filter((key) => key.kind === "secret").map((key) => key.name);
    expect(secretNames).toEqual([
      "MERCADO_PAGO_ACCESS_TOKEN",
      "MERCADO_PAGO_TEST_ACCESS_TOKEN",
      "MERCADO_PAGO_WEBHOOK_SECRET",
    ]);
  });

  it("inclui o grupo NF-e com as credenciais das origens automáticas", () => {
    const groups = buildIntegrationKeyCatalog([]);
    const fiscal = groups.find((group) => group.id === "fiscal-notes");
    expect(fiscal).toBeDefined();
    expect(fiscal!.keys.map((key) => key.name)).toEqual([
      "FISCAL_INBOX_CREDENTIAL",
      "SEFAZ_A1_CERTIFICATE",
    ]);
    // Credencial de caixa e certificado A1 são material sensível: nenhum dos
    // dois é config de exibição.
    expect(fiscal!.keys.every((key) => key.kind === "secret")).toBe(true);
  });

  it("não expõe o segredo do agendador da NF-e — worker secret é infra, não chave de integração", () => {
    // Os seis worker secrets do projeto (NPS, SDR, push, scheduled, rescue e
    // este) vivem nos env secrets da Edge Function, ao lado do agendador que os
    // envia. Colocar um deles na tela sugeriria que o Owner deve girá-lo por
    // ali, e o agendador ficaria para trás.
    const names = buildIntegrationKeyCatalog([]).flatMap((group) =>
      group.keys.map((key) => key.name),
    );
    expect(names).not.toContain("FISCAL_INBOX_WORKER_SECRET");
    expect(names.some((name) => name.endsWith("_WORKER_SECRET"))).toBe(false);
  });

  it("derives Meta account keys from credentials_ref (engine convention)", () => {
    const groups = buildIntegrationKeyCatalog([META_ACCOUNT]);
    const accountGroup = groups.find((group) => group.id === "account-wa-meta-1");
    expect(accountGroup?.title).toBe("WhatsApp — Matriz");
    expect(accountGroup?.keys.map((key) => key.name)).toEqual([
      "WHATSAPP_META_MATRIZ_ACCESS_TOKEN",
      "WHATSAPP_META_MATRIZ_APP_SECRET",
      "WHATSAPP_META_MATRIZ_VERIFY_TOKEN",
    ]);
  });

  it("derives Evolution account keys (apikey + optional webhook secret)", () => {
    const groups = buildIntegrationKeyCatalog([EVOLUTION_ACCOUNT]);
    const accountGroup = groups.find((group) => group.id === "account-wa-evo-1");
    expect(accountGroup?.keys.map((key) => key.name)).toEqual([
      "WHATSAPP_EVO_CAMPANHAS_API_KEY",
      "WHATSAPP_EVO_CAMPANHAS_WEBHOOK_SECRET",
    ]);
  });

  it("skips accounts without a usable credentials_ref", () => {
    const groups = buildIntegrationKeyCatalog([
      { ...META_ACCOUNT, credentialsRef: "" },
      { ...EVOLUTION_ACCOUNT, credentialsRef: "lower case ref" },
    ]);
    expect(groups.map((group) => group.id)).toEqual([
      "resend",
      "whatsapp-webhook",
      "llm-providers",
      "melhor-envio",
      "mercado-pago",
      "fiscal-notes",
    ]);
  });

  it("every generated name passes the server-side validation", () => {
    const groups = buildIntegrationKeyCatalog([META_ACCOUNT, EVOLUTION_ACCOUNT]);
    for (const group of groups) {
      for (const key of group.keys) {
        expect(isValidSecretName(key.name)).toBe(true);
      }
    }
  });

  it("does not emit a key group for evolution-go accounts (key is on the server)", () => {
    const groups = buildIntegrationKeyCatalog([
      {
        id: "acc-go",
        label: "Comercial Volvo",
        provider: "evolution-go" as const,
        credentialsRef: "WA_EVO_GO_COMERCIAL_VOLVO_AB",
      },
    ]);
    expect(groups.some((g) => g.id === "account-acc-go")).toBe(false);
  });

  it("skips per-account key groups for waha accounts (key lives on the server)", () => {
    const groups = buildIntegrationKeyCatalog([
      { id: "acc-1", label: "Loja Centro", provider: "waha" as const, credentialsRef: "WAHA_SERVER_1_API_KEY" },
    ]);
    expect(groups.find((g) => g.id === "account-acc-1")).toBeUndefined();
  });
});
