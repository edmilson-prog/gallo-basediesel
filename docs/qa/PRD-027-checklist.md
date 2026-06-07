# Checklist de Validação Manual — PRD-026 (Vault) + PRD-027 (Dispatch)

> **Escopo:** este arquivo cobre **dois épicos** numa branch só (`feat/prd-027-envio-rapido-biblioteca-ativos`, empilhada sobre `feat/prd-026-gestao-midia`). Valide as duas seções abaixo.
>
> - **Seção A — PRD-026 · Gestão de Mídia (DAM + Galeria)** · v0.67.0 "Vault" · PR #37
> - **Seção B — PRD-027 · Envio Rápido & Biblioteca de Ativos** · v0.68.0 "Dispatch" · PR #38
>
> Marque `- [x]` conforme testa. Registre qualquer divergência ao lado do item.

---

## 🔧 Preparação (comum às duas seções)

- [ ] `bun run dev` rodando; app aberto no navegador
- [ ] Saber **trocar de papel**: **Owner**, **Gestor**, **Vendedor** (para validar RBAC/sensível)
- [ ] Abrir uma **conversa** no Atendimento/Inbox (onde vivem composer e galeria de mídia)
- [ ] Ter um **cliente** com várias conversas (para a aba Mídias) e um **lead** ligado a uma conversa (para temperatura)
- [ ] Testar em **tema claro e escuro** e em largura **mobile (~360px)** além do desktop
- [ ] Os eventos "ao vivo" (mídia recebida, abertura de link, disparo de agendado) são **simulados por runners** — basta aguardar alguns segundos

---

# Seção A — PRD-026 · Gestão de Mídia (Vault)

## A1. Galeria de mídia por conversa
- [ ] Botão **"Mídias"** no topo da conversa abre a galeria
- [ ] **Contadores por tipo** (imagem/áudio/documento/vídeo) corretos
- [ ] **Busca** por nome do arquivo e por **transcrição**/OCR funciona
- [ ] **Filtros** (tipo/classificação) funcionam
- [ ] **3 modos**: **Grade**, **Cartões**, **Por tipo** — alternáveis pelo switcher
- [ ] Recarregar a página → o modo escolhido **persiste** (por usuário)

## A2. Aba "Mídias" na ficha do cliente
- [ ] A ficha do cliente tem a aba **Mídias**
- [ ] Agrega mídias de **todas as conversas** do cliente
- [ ] **Filtro por classificação** funciona
- [ ] Atalho para **abrir a conversa de origem** de cada mídia

## A3. Visualizador em tela cheia (lightbox)
- [ ] **Imagem** abre com **zoom** (+/−) e arraste
- [ ] **Áudio**: player com velocidade **1x / 1.5x / 2x** e **transcrição com realce** acompanhando
- [ ] **Documento**: abrir e **baixar**
- [ ] **Teclado**: setas (navegar), **Esc** (fechar), **Espaço** (play/pause áudio), **+/−** (zoom)

## A4. Classificação e vínculo assistidos
- [ ] Mídia recebida é **classificada automaticamente** (nota fiscal, peça, chassi/placa, comprovante, catálogo)
- [ ] Sistema **sugere vínculo** a veículo/pedido/peça
- [ ] Vínculo só é aplicado **com confirmação** do usuário
- [ ] A ação fica registrada em **auditoria**

## A5. Governança LGPD de mídia sensível (RBAC)
- [ ] Como **Vendedor/SDR**: **nota fiscal** e **comprovante** aparecem com **prévia borrada** + aviso; download/visualização **bloqueados**
- [ ] Cada tentativa de acesso bloqueado fica **auditada**
- [ ] Como **Owner/Gestor**: vê/baixa normalmente
- [ ] **Marcação manual de sensibilidade** disponível para a gestão (e não rebaixa o que já é sensível)

## A6. Anotação de imagem
- [ ] Adicionar **ponto / seta / texto** sobre a imagem
- [ ] Anotações salvas como **nova versão** (o original permanece intacto)

## A7. Preservação de mídia recebida
- [ ] Mídia que **chega** é arquivada automaticamente (aguarde o runner)
- [ ] **Deduplicação**: a mesma mídia não duplica
- [ ] Sinaliza quando a **origem está prestes a expirar** ou **falhou ao arquivar**, com **"tentar novamente"**
- [ ] O arquivamento **nunca trava** a conversa (assíncrono)

## A8. Retenção configurável
- [ ] Em **Configurações → Mídias**: parâmetros de retenção exibidos (**365 dias** comum, **5 anos / 1825 dias** sensível)

## A9. Não-regressão (PRD-026)
- [ ] Conversa, bubbles (texto/imagem/áudio/documento), envio e janela 24h continuam normais
- [ ] Tema claro/escuro e responsividade OK

---

# Seção B — PRD-027 · Envio Rápido & Biblioteca de Ativos (Dispatch)

## B1. AssetPicker — 3 modos de visualização
- [ ] Abrir a **Biblioteca** (menu do clipe → "Abrir biblioteca", ou `Ctrl/Cmd+K`)
- [ ] Switcher troca **Painel (⌘K) · Grade · Lateral** na hora
- [ ] Recarregar → o modo **persiste** (`gallo-assetpicker-mode`)
- [ ] Busca filtra (debounce); abas **Recentes / Favoritos / Tudo**; ★ favoritar alterna
- [ ] Mobile: Painel/Lateral viram **bottom sheet**; Grade vira **2 colunas**
- [ ] **Teclado**: `↑↓` navega a lista, `Enter` seleciona, `Esc` fecha (combobox/listbox)

## B2. Slash commands
- [ ] `/` no início da mensagem abre o menu de comandos
- [ ] `/catalogo freio` filtra categoria **catálogo** + título "freio"; `↑↓ Enter Esc`
- [ ] **Barra literal protegida**: `http://`, `12/05`, `3/4`, `//` **não** abrem o menu

## B3. Envio de ativo
- [ ] `Enter` numa linha → vira **chip staged** com **mensagem de contexto editável**; envia ao confirmar
- [ ] `Cmd/Ctrl+Enter` → **envia direto** (sem staging)
- [ ] O ativo chega como mensagem outbound (arquivo via storage do PRD-026) e aparece na **galeria de mídia** (Seção A)
- [ ] **Fora da janela 24h**: envio de ativo respeita o mesmo bloqueio do template (não burla)

## B4. Snippets (respostas rápidas)
- [ ] Inserir snippet (ex.: `/garantia`) → `{{nome}}`/`{{peça}}` **resolvidos** do contexto
- [ ] Variável sem valor (`{{prazo}}`) vira **pílula âmbar `[prazo]`** editável; foco cai nela
- [ ] **Enviar bloqueado** enquanto houver lacuna; contador "N campos a preencher"; nunca envia `{{...}}`/`[...]` cru

## B5. Card de produto
- [ ] Menu → "Enviar produto" → busca no catálogo → enviar → **bubble de card** (foto, OE, equivalência, estoque, preço)
- [ ] **Sem imagem** → tile com ícone; **sem preço** → "Consultar valor" (nunca `R$ 0,00`)
- [ ] OE/equivalência em fonte mono **copiável**

## B6. Links rastreáveis + temperatura do lead
- [ ] Enviar um **link** numa conversa ligada a um **lead**
- [ ] Aguardar a **abertura simulada** → "👁 **Aberto há …**" sob o bubble
- [ ] **Temperatura sobe** (frio→morno→quente) com **1 pulso** no chip do header + **1 system bubble**
- [ ] Nunca **rebaixa**; já "quente" não muda; **sem toast** por abertura

## B7. Pacotes / combos
- [ ] Ativar **"Modo pacote"** no picker → multi-seleção → itens na **bandeja** acima do composer
- [ ] **Reordenar** por ▲▼ e por **`Alt+↑/↓`** (leitor de tela anuncia a nova posição)
- [ ] "Enviar todos" → envia em ordem (progresso "Enviando i/N")
- [ ] Item **despublicado/sem permissão** é **ignorado com aviso**; os demais ainda enviam (falha parcial tolerada)

## B8. Agendamento
- [ ] **Split do Enviar** (`Enviar ▾` → "Agendar") → presets (Hoje 18:00 / Amanhã 09:00) + data-hora custom
- [ ] Entra em **"Agendados (N)"** por conversa; **editar** e **cancelar** (com **desfazer 5s**)
- [ ] No horário (simulado) **dispara** como mensagem outbound; data **no passado** é bloqueada

## B9. Governança (como Gestor/Owner)
- [ ] **Configurações → Biblioteca** (`/app/configuracoes/biblioteca`) acessível pelo menu
- [ ] **Publicar/despublicar**; **versão** incrementa (anterior no histórico); só a versão **publicada** é enviável
- [ ] Definir **permissão por ativo** (`allowedRoleIds`)
- [ ] **Snippets compartilhados**: criar/editar/arquivar
- [ ] **Estatística de uso**: ativos mais enviados + ranking por vendedor

## B10. Sensível / RBAC (como Vendedor)
- [ ] **Tabela de preços** (sensível) aparece com **🔒** e **não é enviável** ("Sem permissão")
- [ ] Como **Owner/Gestor**, a mesma tabela **é** enviável
- [ ] Tentativa bloqueada fica em **auditoria** (`/app/configuracoes/auditoria`)

## B11. ⚠️ Não-regressão do composer (crítico)
- [ ] **Texto**: digitar + `Enter` envia; `Shift+Enter` quebra linha
- [ ] **Emoji**, **menu de anexo** (Imagem/Documento/Áudio originais), **Templates HSM**, **sugestões IA**, **janela 24h**, **copilot strip** — todos funcionando
- [ ] Clique **primário** no Enviar continua **enviando agora** (agendar é o secundário)
- [ ] Bubbles existentes + galeria de mídia (Seção A) intactos

## B12. Tema / responsivo / acessibilidade
- [ ] Legível em **claro e escuro** (cores de severidade — estoque/temperatura/lacuna — corretas em ambos)
- [ ] **Teclado**: picker e slash navegáveis; combo reordena por teclado com anúncio
- [ ] Botão **Enviar desabilitado** mostra o **motivo** (tooltip/aria) quando há lacuna ou janela fechada
- [ ] **360px**: sem overflow/quebra

---

## ✅ Encerramento
- [ ] Seção A (PRD-026) validada
- [ ] Seção B (PRD-027) validada
- [ ] Divergências anotadas e reportadas

> Dúvidas/itens reprovados: anote aqui o item (ex.: `B6 — temperatura não subiu`) que eu investigo.
