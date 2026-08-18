/**
 * Catalog of the integration keys manageable from the platform (feature
 * "Integrações & Chaves").
 *
 * Names follow the env-style convention the Edge Functions resolve —
 * Vault-first, env secret as fallback (see supabase/functions/_shared/
 * secrets.ts). Per-account WhatsApp keys derive from `credentials_ref`
 * exactly like the engines do (`<ref>_ACCESS_TOKEN`, `<ref>_API_KEY`, ...).
 */

import type { IWhatsAppAccount } from "@/shared/types";

/** Same constraint the Edge Function + SQL wrapper enforce server-side. */
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;

export function isValidSecretName(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name);
}

export type IntegrationKeyKind = "secret" | "config";

export interface IIntegrationKeyDef {
  /** Vault/env secret name (e.g. RESEND_API_KEY). */
  name: string;
  /** pt-BR label shown to the Owner. */
  label: string;
  /** `secret` = sensitive credential; `config` = plain parameter (same write-only flow). */
  kind: IntegrationKeyKind;
  /** Short pt-BR hint below the field. */
  help?: string;
}

export interface IIntegrationKeyGroup {
  id: string;
  title: string;
  description?: string;
  icon: string;
  keys: IIntegrationKeyDef[];
}

type AccountForCatalog = Pick<IWhatsAppAccount, "id" | "label" | "provider" | "credentialsRef">;

const META_ACCOUNT_KEYS: Array<Omit<IIntegrationKeyDef, "name"> & { suffix: string }> = [
  {
    suffix: "_ACCESS_TOKEN",
    label: "Access token",
    kind: "secret",
    help: "Token permanente do app Meta (WhatsApp Business).",
  },
  {
    suffix: "_APP_SECRET",
    label: "App secret",
    kind: "secret",
    help: "Segredo do app Meta — valida a assinatura dos webhooks.",
  },
  {
    suffix: "_VERIFY_TOKEN",
    label: "Verify token",
    kind: "secret",
    help: "Token combinado com a Meta para o handshake do webhook.",
  },
];

const EVOLUTION_ACCOUNT_KEYS: Array<Omit<IIntegrationKeyDef, "name"> & { suffix: string }> = [
  {
    suffix: "_API_KEY",
    label: "API key",
    kind: "secret",
    help: "apikey da instância Evolution.",
  },
  {
    suffix: "_WEBHOOK_SECRET",
    label: "Webhook secret (opcional)",
    kind: "secret",
    help: "Segredo HMAC do webhook da instância. Sem ele, vale a lista de IPs.",
  },
];

/**
 * Builds the catalog the management screen renders: fixed platform groups
 * (Resend, webhook Meta/Evolution app-level) + one group per WhatsApp account
 * with `credentials_ref` set.
 */
export function buildIntegrationKeyCatalog(accounts: AccountForCatalog[]): IIntegrationKeyGroup[] {
  const groups: IIntegrationKeyGroup[] = [
    {
      id: "resend",
      title: "E-mail transacional (Resend)",
      description: "Convites de acesso por e-mail e alertas da plataforma.",
      icon: "mdi:email-outline",
      keys: [
        {
          name: "RESEND_API_KEY",
          label: "Chave da API",
          kind: "secret",
          help: "Criada em resend.com → API Keys.",
        },
        {
          name: "RESEND_FROM",
          label: "Remetente verificado",
          kind: "config",
          help: "Ex.: GALLO <nao-responda@seudominio.com.br> (domínio verificado no Resend).",
        },
        {
          name: "INVITE_REDIRECT_URL",
          label: "URL do link de convite",
          kind: "config",
          help: "Página /auth/definir-senha no domínio de produção.",
        },
      ],
    },
    {
      id: "whatsapp-webhook",
      title: "WhatsApp — Webhook (nível do app)",
      description: "Credenciais globais que protegem o recebimento de mensagens.",
      icon: "mdi:webhook",
      keys: [
        {
          name: "WHATSAPP_META_APP_SECRET",
          label: "Meta — App secret",
          kind: "secret",
          help: "Assina todos os webhooks recebidos da Meta (fail-closed sem ele).",
        },
        {
          name: "WHATSAPP_META_VERIFY_TOKEN",
          label: "Meta — Verify token",
          kind: "secret",
          help: "Usado uma única vez no handshake de cadastro do webhook.",
        },
        {
          name: "EVOLUTION_ALLOWED_IPS",
          label: "Evolution — IPs liberados",
          kind: "config",
          help: "Lista separada por vírgulas. Gate alternativo ao webhook secret.",
        },
      ],
    },
    {
      id: "llm-providers",
      title: "Provedores LLM",
      description: "Chaves de API dos provedores de Inteligência Artificial.",
      icon: "mdi:robot-happy-outline",
      keys: [
        {
          name: "ANTHROPIC_API_KEY",
          label: "Anthropic — Chave da API",
          kind: "secret",
          help: "Criada em console.anthropic.com.",
        },
        {
          name: "OPENAI_API_KEY",
          label: "OpenAI — Chave da API",
          kind: "secret",
          help: "Criada em platform.openai.com.",
        },
        {
          name: "OPENROUTER_API_KEY",
          label: "OpenRouter — Chave da API",
          kind: "secret",
          help: "Uma chave para múltiplos provedores (openrouter.ai).",
        },
        {
          name: "GOOGLE_AI_API_KEY",
          label: "Google — Chave da API",
          kind: "secret",
          help: "Criada no Google AI Studio.",
        },
      ],
    },
    {
      id: "melhor-envio",
      title: "Frete — Melhor Envio",
      description:
        "Apps OAuth para a cotação automática de fretes. Produção e Sandbox têm client_id/secret próprios; redirect e User-Agent são compartilhados.",
      icon: "mdi:truck-outline",
      keys: [
        {
          name: "MELHOR_ENVIO_CLIENT_ID",
          label: "Client ID (Produção)",
          kind: "config",
          help: "App de produção em app.melhorenvio.com.br → Integrações → Área de desenvolvedor.",
        },
        {
          name: "MELHOR_ENVIO_CLIENT_SECRET",
          label: "Client secret (Produção)",
          kind: "secret",
          help: "Segredo do app OAuth de produção do Melhor Envio.",
        },
        {
          name: "MELHOR_ENVIO_SANDBOX_CLIENT_ID",
          label: "Client ID (Sandbox)",
          kind: "config",
          help: "App separado, criado em sandbox.melhorenvio.com.br (ambiente de testes).",
        },
        {
          name: "MELHOR_ENVIO_SANDBOX_CLIENT_SECRET",
          label: "Client secret (Sandbox)",
          kind: "secret",
          help: "Segredo do app OAuth de sandbox do Melhor Envio.",
        },
        {
          name: "MELHOR_ENVIO_REDIRECT_URI",
          label: "Redirect URI (ambos)",
          kind: "config",
          help: "Idêntica à cadastrada nos dois apps do Melhor Envio (ex.: https://crm.gallobasediesel.com.br/app/configuracoes/frete/callback).",
        },
        {
          name: "MELHOR_ENVIO_USER_AGENT",
          label: "User-Agent (ambos · contato)",
          kind: "config",
          help: "Ex.: GALLO BASE DIESEL (contato@dominio) — exigido pela API do Melhor Envio.",
        },
      ],
    },
    {
      id: "mercado-pago",
      title: "Pagamentos — Mercado Pago",
      description:
        "Checkout transparente da loja (Pix, boleto e cartão). Produção e teste têm credenciais próprias; o webhook secret vale para os dois.",
      icon: "mdi:credit-card-outline",
      keys: [
        {
          name: "MERCADO_PAGO_ACCESS_TOKEN",
          label: "Access token (Produção)",
          kind: "secret",
          help: "Suas integrações → aplicação → Credenciais de produção. Cobra de verdade.",
        },
        {
          name: "MERCADO_PAGO_PUBLIC_KEY",
          label: "Public key (Produção)",
          kind: "config",
          help: "Usada pelo SDK no navegador para tokenizar o cartão. Não é segredo.",
        },
        {
          name: "MERCADO_PAGO_TEST_ACCESS_TOKEN",
          label: "Access token (Teste)",
          kind: "secret",
          help: "Credenciais de teste da mesma aplicação. Use com os usuários de teste do Mercado Pago.",
        },
        {
          name: "MERCADO_PAGO_TEST_PUBLIC_KEY",
          label: "Public key (Teste)",
          kind: "config",
          help: "Par da public key de produção, para o checkout em ambiente de teste.",
        },
        {
          name: "MERCADO_PAGO_WEBHOOK_SECRET",
          label: "Webhook secret (assinatura)",
          kind: "secret",
          help: "Suas integrações → aplicação → Webhooks. Valida o header x-signature das notificações.",
        },
      ],
    },
    {
      id: "fiscal-notes",
      title: "Notas fiscais de entrada (NF-e)",
      description:
        "Credenciais das origens automáticas. Upload de XML não usa chave — estas valem para a caixa de e-mail monitorada e para a consulta à SEFAZ.",
      icon: "mdi:file-document-outline",
      keys: [
        {
          name: "FISCAL_INBOX_CREDENTIAL",
          label: "Credencial da caixa de e-mail",
          kind: "secret",
          help: "Acesso da caixa que recebe os XML dos fornecedores. Sem ela a origem de e-mail responde desligada.",
        },
        {
          name: "SEFAZ_A1_CERTIFICATE",
          label: "Certificado digital A1 (SEFAZ)",
          kind: "secret",
          help: "Certificado da empresa em base64. Sem ele a SEFAZ recusa a conexão.",
        },
      ],
    },
  ];

  for (const account of accounts) {
    const ref = account.credentialsRef?.trim();
    if (!ref || !isValidSecretName(ref)) continue;
    if (
      account.provider === "evolution-go" ||
      account.provider === "waha" ||
      account.provider === "openwa"
    )
      continue; // key lives on the server registry, not the account
    const defs = account.provider === "meta" ? META_ACCOUNT_KEYS : EVOLUTION_ACCOUNT_KEYS;
    groups.push({
      id: `account-${account.id}`,
      title: `WhatsApp — ${account.label}`,
      description:
        account.provider === "meta"
          ? `Meta Cloud API · prefixo ${ref}`
          : `Evolution API · prefixo ${ref}`,
      icon: "mdi:whatsapp",
      keys: defs.map(({ suffix, label, kind, help }) => ({
        name: `${ref}${suffix}`,
        label,
        kind,
        help,
      })),
    });
  }

  return groups;
}
