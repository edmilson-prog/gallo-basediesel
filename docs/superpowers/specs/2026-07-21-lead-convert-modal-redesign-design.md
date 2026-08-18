# Redesign do modal "Converter lead em cliente" — fluxo B2B em 2 etapas + atalho de vínculo no painel

**Data:** 2026-07-21 · **Status:** design aprovado pelo dono (via mockup interativo)
**Branch:** `worktree-lead-convert-cnpj-link` (continuação — PR #350 já mergeado; esta é uma segunda entrega sobre o mesmo componente)
**Mockup de referência:** artifact "Conversão de lead → cliente — 3 propostas" (3 opções + comparativo), aprovado como **Opção C — Em duas etapas** pro modal e **Proposta B — botão dividido** pro painel.

## 1. Contexto

O PR #350 entregou o autofill de CNPJ (Receita Federal) e o modo "vincular a cliente existente" no `ConvertLeadModal`, mas o resultado visual não agradou: o formulário B2B mostra todos os campos de uma vez (razão social, nome fantasia, CNPJ, contato, e-mail) antes mesmo de saber se a empresa existe, e o toggle "Criar novo / Vincular existente" usa duas caixas com bolinha de rádio que lê como formulário genérico.

Esta spec cobre a segunda entrega, sobre o mesmo componente: reorganizar o fluxo B2B em duas etapas (CNPJ → confirmação) e redesenhar os controles de toggle, além de adicionar um atalho de "vincular" direto no painel lateral da ficha do lead.

## 2. Decisões (aprovadas via mockup)

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Estrutura do fluxo B2B | **Duas etapas dentro do mesmo modal** (Opção C do mockup): Etapa 1 = só o campo CNPJ + botão "Continuar" (desabilitado até a Receita confirmar); Etapa 2 = cartão "registro verificado" (dados da Receita, somente leitura) + campos editáveis **Contato principal** e **E-mail** + rodapé "Voltar" / "Converter". |
| D2 | Toggles "Tipo de conversão" e "Tipo de cliente" | Viram **segmented control** (pílula com indicador deslizante), substituindo as duas caixas com `RadioGroupItem` visível. Semântica de rádio (uma opção exclusiva) é preservada — só a casca visual muda. |
| D3 | Cartão de confirmação da empresa | Vira um **cartão de registro**: barra de destaque à esquerda (verde quando `situacaoCadastral === "ATIVA"`), nome em destaque, badge de situação, endereço com ícone de pino — mesma informação que já existe hoje (`cnpjData.razaoSocial`/`address`/`situacaoCadastral`), só reorganizada. |
| D4 | Atalho no painel lateral (`LeadProfileFiche`) | **Botão dividido**: "Converter em cliente" continua sendo o botão principal (abre o modal em modo "Criar novo"); um `▾` ao lado abre um menu com os 2 modos — "Criar novo cliente" e "Vincular a cliente existente". Não cresce a altura do painel (~350px). |
| D5 | Modo B2C ("Pessoa") e modo "Vincular a cliente existente" | **Inalterados na estrutura** — só herdam o novo toggle segmentado (D2). O B2C continua telas única (nome + CPF + e-mail); o vínculo continua busca + seleção como hoje. |

## 3. Mudanças de contrato

### 3.1 `ConvertLeadModal` ganha uma prop opcional

```ts
export interface IConvertLeadModalProps {
  lead: ILead | null;
  onClose: () => void;
  onConverted?: (customerId: ID) => void;
  /** Modo inicial ao abrir — default "new". Permite que o painel abra
   *  direto no modo "vincular" sem passar pelo toggle interno. */
  initialMode?: "new" | "link";
}
```

`initialMode` só é lido no efeito de reset-por-lead (o mesmo que já zera `type`/`cnpj`/etc. a cada `lead` novo) — trocar de lead com o modal fechado sempre reabre no modo pedido; o modal aberto continua reagindo à troca de `lead` como hoje.

### 3.2 Estado novo dentro do componente

- `b2bStep: 1 | 2` (default `1`) — só relevante quando `mode === "new" && type === "B2B"`. Reseta pra `1` sempre que: o `lead` muda, `mode` sai de `"new"`, ou `type` sai de `"B2B"`. "Continuar" (etapa 1 → 2) fica desabilitado enquanto `cnpjFieldState !== "valid"`. "Voltar" e o link "Trocar" do cartão de registro fazem a mesma coisa: `setB2bStep(1)` — **sem** limpar o CNPJ digitado (o vendedor volta pra editar o que já tinha, não começa do zero).

### 3.3 `LeadProfileFiche.tsx` — botão dividido

O bloco atual (`LeadProfileBody`, linhas ~369-378) troca de um `<Button>` único para um par `Button` (ação principal) + `DropdownMenuTrigger` (chevron), usando os componentes shadcn já existentes no projeto (`src/components/ui/dropdown-menu.tsx`). Novo estado local `convertInitialMode: "new" | "link"` decide o que é passado como `initialMode` pro `ConvertLeadModal` já montado logo abaixo (linhas ~382-391).

## 4. Fora de escopo

- Mudar a lógica de negócio da conversão (submissão, auditoria, invalidação de queries) — só a casca visual e a organização em etapas mudam. Tudo que já foi implementado e revisado no PR #350 (fix de corrida do debounce, guarda de endereço, exclusão de `pending_review` na busca) continua exatamente igual.
- Redesenhar o modo B2C ou o modo "vincular a cliente existente" além do toggle compartilhado (D5).
- Migrations, RLS, providers — nenhuma mudança de dado, só de UI.

## 5. Testes

Sem novo teste de engine puro (não há lógica de negócio nova, só reorganização de estado de UI local). Verificação: `bun run test` (suíte completa) + `bunx tsc --noEmit`, igual ao PR anterior — este componente permanece sem teste dedicado, consistente com o `NewCustomerModal.tsx`.

## 6. Arquivos afetados

- `src/features/leads/components/ConvertLeadModal.tsx` — wizard de 2 etapas no B2B, segmented control nos 2 toggles, cartão de registro redesenhado, prop `initialMode`.
- `src/features/leads/components/LeadProfileFiche.tsx` — botão dividido no rodapé do painel.
- `src/features/leads/i18n/pt-BR.ts` — novas chaves (`continueLabel`, `back`, `situacaoActive`, etc.).
