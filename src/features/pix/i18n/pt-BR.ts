import type { PixKeyType } from "@/shared/types";

export const PIX_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: "CNPJ",
  cpf: "CPF",
  phone: "Telefone",
  email: "E-mail",
  random: "Aleatória",
};

/** Discrimination by SHAPE, not colour — works in every theme and colour vision. */
export const PIX_TYPE_ICON: Record<PixKeyType, string> = {
  cnpj: "mdi:office-building-outline",
  cpf: "mdi:card-account-details-outline",
  phone: "mdi:phone-outline",
  email: "mdi:email-outline",
  random: "mdi:shuffle-variant",
};

/**
 * Expected shape per type. The `random` example matters most: an EVP key is the
 * one nobody can guess the format of, and typing it wrong is a money bug.
 * These are placeholders only — never prefill a real value.
 */
export const PIX_TYPE_PLACEHOLDER: Record<PixKeyType, string> = {
  cnpj: "00.000.000/0000-00",
  cpf: "000.000.000-00",
  phone: "+55 54 99999-9999",
  email: "financeiro@empresa.com.br",
  random: "8e2f1c40-9a3b-4d51-8f6e-2c7b9a1d0e34",
};

export const PIX_STRINGS = {
  navLabel: "Chaves PIX",
  pageTitle: "Chaves PIX",
  pageDescription: "Cadastre as chaves que a equipe pode enviar no atendimento.",
  edit: "Editar",
  delete: "Excluir",
  copy: {
    action: "Copiar",
    done: "Copiado",
    announced: "Chave copiada",
    error: "Não foi possível copiar a chave.",
    unavailable: "A cópia não está disponível neste navegador.",
  },
  list: {
    empty: "Nenhuma chave PIX cadastrada.",
    emptyHint: "Cadastre a primeira chave para liberar o atalho no atendimento.",
    newKey: "Nova chave",
    defaultKey: "Chave padrão",
    inactive: "Inativa",
    readOnly: "Somente Owner e Gestor podem editar as chaves.",
    deleteTitle: "Excluir chave PIX",
    deleteDesc: (alias: string) =>
      `A chave "${alias}" deixará de aparecer no atendimento. Prefira desativá-la para manter o histórico.`,
    deleted: "Chave PIX excluída.",
  },
  editor: {
    newTitle: "Nova chave PIX",
    editTitle: "Editar chave PIX",
    alias: "Apelido",
    aliasPlaceholder: "Matriz — CNPJ",
    keyType: "Tipo de chave",
    keyValue: "Chave",
    invalidKey: "Chave inválida para o tipo selecionado.",
    receiverName: "Favorecido",
    receiverNameHint: "Máximo de 25 caracteres, sem acentos.",
    receiverNameTooLong: "O favorecido excede 25 caracteres — encurte para gerar o QR Code.",
    receiverCity: "Cidade",
    receiverCityHint: "Máximo de 15 caracteres, sem acentos.",
    receiverCityTooLong: "A cidade excede 15 caracteres — encurte para gerar o QR Code.",
    /** Counter shown under the receiver fields — counts what the BR Code measures. */
    counter: (used: number, max: number) => `${used}/${max}`,
    defaultContext: "Mensagem padrão",
    defaultContextPlaceholder: "Deixe em branco para usar o texto automático.",
    shortcut: "Atalho (opcional)",
    shortcutPlaceholder: "/pix-matriz",
    shortcutInvalid: "O atalho deve começar com / e não conter espaços.",
    shortcutCollision: (shortcut: string) => `O atalho ${shortcut} já está em uso.`,
    sendDefaults: "O que enviar por padrão",
    sendTextOption: "Enviar a chave em texto",
    sendQrOption: "Enviar o QR Code",
    isDefault: "Usar como chave padrão",
    isDefaultInactiveHint: "Só uma chave ativa pode ser a padrão.",
    isActive: "Ativa",
    previewTitle: "Como o cliente recebe",
    previewBubbleOne: "Primeira mensagem",
    previewBubbleTwo: "Segunda mensagem — a chave",
    previewNote: "Prévia ilustrativa. Confira o QR escaneando com o app do seu banco.",
    previewEmpty: "Nada será enviado. Ative a chave em texto, o QR Code, ou os dois.",
    qrAlt: (alias: string) => `QR Code do PIX — ${alias}`,
    qrUnavailable: "Complete a chave e o favorecido para gerar o QR Code.",
    save: "Salvar chave",
    cancel: "Cancelar",
    saved: "Chave PIX salva.",
    missingFields: "Preencha apelido, chave, favorecido e cidade.",
  },
  composer: {
    menuSection: "Pagamento",
    menuItem: "Chave PIX",
    menuHint: "/pix",
    noKeys: "Nenhuma chave PIX cadastrada.",
    pickTitle: "Escolha a chave PIX",
    searchPlaceholder: "Buscar chave...",
    contextPlaceholder: "Mensagem antes da chave (opcional)…",
    optionsLabel: "O que enviar",
    optionText: "Chave",
    optionQr: "QR",
    swapKey: "Trocar de chave",
    send: "Enviar PIX",
    cancel: "Cancelar",
    nothingSelected: "Selecione ao menos a chave ou o QR Code.",
    receiverTooltip: (name: string) => `Favorecido: ${name}`,
    sent: "Chave PIX enviada.",
  },
  errors: {
    qrRenderFailed: "Não foi possível gerar o QR Code. A chave foi enviada como texto.",
    sendFailed: "Não foi possível enviar a chave PIX.",
    saveFailed: "Não foi possível salvar a chave.",
    loadFailed: "Não foi possível carregar as chaves PIX.",
  },
} as const;
