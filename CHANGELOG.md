# Changelog

All notable changes to **GALLO BASE DIESEL** are documented here.
Format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.92.0] — Unfold · 2026-06-13

**As mensagens recebidas agora mostram quando o cliente enviou e quando elas chegaram ao sistema.** Cada mensagem recebida ganhou um detalhe que se abre com dois horários — útil para entender atrasos e mensagens trazidas do histórico. Também voltou a funcionar o envio de arquivos avulsos pelo clipe, as mídias das conversas voltaram a carregar normalmente e atualizar a foto de um contato passou a avisar na hora.

### Added

- **Horários de envio e recebimento nas mensagens recebidas** — cada mensagem recebida mostra um único horário (quando o cliente enviou) e, ao tocar na setinha ao lado dele, abre um detalhe com os dois horários completos: quando o cliente enviou e quando a mensagem chegou ao sistema. Em conversas em tempo real os dois ficam praticamente iguais; em mensagens trazidas do histórico ou recebidas após uma reconexão, a diferença fica visível.

### Changed

- **Aviso ao atualizar a foto de um contato** — ao usar "Atualizar foto do contato" no menu (⋮) da conversa, aparece na hora um aviso "Atualizando foto do contato…", que se transforma no resultado (foto atualizada, sem foto disponível ou erro). Antes, o clique não dava retorno imediato e parecia que nada havia acontecido.

### Fixed

- **Envio de arquivos avulsos pelo clipe** — anexar uma imagem, documento ou áudio pelo clipe da conversa voltou a funcionar; antes, o arquivo era preparado mas o envio não se concluía.
- **Mídias que sumiam depois de um tempo** — fotos, áudios e documentos das conversas que voltavam a aparecer como indisponíveis após alguns minutos agora carregam normalmente, porque o acesso ao arquivo é renovado automaticamente ao abrir a conversa. Abrir uma foto em tamanho maior também deixou de gerar um erro técnico em segundo plano.

## [0.91.0] — Portrait · 2026-06-13

**As fotos de perfil dos contatos do WhatsApp agora aparecem nas Conversas.** Cada contato exibe a própria foto na lista e no topo da conversa; contatos novos recebem a foto automaticamente e há um botão para atualizar manualmente. Os áudios ganharam controle de velocidade e marca de "ouvido", mensagens presas "na fila" agora podem ser reprocessadas, e o contador de mensagens não lidas voltou a zerar quando você abre a conversa.

### Added

- **Fotos de perfil nas Conversas** — a lista de conversas e o cabeçalho de cada conversa passam a mostrar a foto de perfil do WhatsApp de cada contato. Quem não tem foto pública aparece com um ícone de pessoa (contatos só com número) ou com as iniciais do nome, em vez de um espaço vazio.
- **Sincronização de fotos em lote** — em Configurações → WhatsApp, o botão "Sincronizar fotos" busca de uma vez as fotos de todos os contatos. Pode rodar quantas vezes quiser: ele só busca as que ainda faltam e continua de onde parou.
- **Foto automática para contatos novos** — quando um contato novo manda mensagem (ou você inicia a conversa pelo celular), a foto dele é buscada sozinha e aparece logo em seguida, sem precisar sincronizar manualmente.
- **Atualizar a foto de um contato** — no menu (⋮) da conversa, a opção "Atualizar foto do contato" rebusca a foto apenas daquele contato — útil quando ele troca de foto ou quando ela não veio na primeira tentativa.
- **Velocidade e "ouvido" nos áudios** — nos áudios das conversas, dá para alternar a velocidade de reprodução entre 1×, 1,5× e 2×, e o balão passa a indicar quando o áudio já foi ouvido.
- **Reprocessar mensagem presa "na fila"** — quando uma mensagem enviada fica parada no status "na fila" por mais de um minuto, aparece um botão "Reprocessar" para reenviá-la, sem precisar digitar tudo de novo.

### Fixed

- **Contador de mensagens não lidas** — o número vermelho de não lidas em cada conversa volta a zero assim que você abre a conversa. Antes, ele continuava marcando mesmo depois de as mensagens já terem sido lidas.

## [0.90.1] — Mosaic · 2026-06-12

**Correções no envio de mídias pelo clipe.** Áudios anexados agora chegam como mensagem de voz tocável e documentos chegam com o nome de arquivo correto.

### Fixed

- **Envio de áudio pelo WhatsApp** — ao anexar um arquivo de áudio pelo clipe, ele agora chega ao cliente como uma mensagem de voz que toca direto na conversa. Antes, o envio de áudio não era concluído.
- **Nome dos documentos enviados** — ao enviar um documento pelo clipe (PDF, planilha etc.), o cliente passa a ver o nome original do arquivo (por exemplo, "orçamento.pdf") em vez de um nome genérico.

## [0.90.0] — Mosaic · 2026-06-12

**As mídias do WhatsApp voltaram a tocar e abrir — e agora têm um painel próprio na conversa.** Além de corrigir áudios e fotos recebidos, a aba "Mídias" virou uma galeria com três modos de visualização e um mini-player de áudio.

### Added

- **Painel de mídias da conversa** — a aba "Mídias" passa a exibir as fotos, áudios, vídeos e documentos da conversa em miniaturas de verdade, com busca por legenda e filtros por tipo, por autor (recebidas/enviadas) e por período. Aparecem apenas as mídias com arquivo disponível.
- **Três modos de visualização** — alterne entre Grade (miniaturas densas), Cartões (com legenda e data) e Por tipo (agrupado em imagens e vídeos, documentos e áudios). A preferência de modo fica salva.
- **Mini-player de áudio no painel** — cada áudio toca direto ali, sem abrir outra tela, mostrando a duração, se foi recebido ou enviado e a data e hora do envio. Ao iniciar um áudio, o que estava tocando pausa sozinho.

### Fixed

- **Reprodução de áudio nas conversas** — os áudios recebidos pelo WhatsApp agora tocam de verdade ao apertar play; antes a barrinha andava mas não saía som. Dá para pausar, retomar e arrastar para um trecho específico do áudio.
- **Fotos, documentos e vídeos recebidos** — passam a abrir e baixar normalmente nas conversas. Quando o arquivo não está mais disponível no servidor, a mensagem mostra "indisponível" em vez de um item quebrado.
- **Recuperação de áudios e fotos recentes** — áudios e imagens recebidos nas últimas semanas que apareciam como indisponíveis foram baixados e agora tocam e abrem normalmente. Mídias com mais de algumas semanas não puderam ser recuperadas porque o WhatsApp as remove de seus servidores depois desse período.

## [0.89.0] — Roster · 2026-06-12

**Gestão completa da equipe numa tela só** — agora dá para cadastrar, editar e desligar usuários direto na plataforma, ver quem está online e quando cada um acessou pela última vez.

### Added

- **Cadastro e edição de usuários** — em Configurações → Usuários, o botão "Novo usuário" cria um membro da equipe (nome, e-mail, telefone, tipo e região, quando se aplica) e cada pessoa pode ser ajustada pelo botão "Editar". O cadastro cria o usuário sem login; o acesso à plataforma é liberado depois por "Criar acesso" (senha temporária ou convite por e-mail).
- **Exclusão de usuário com histórico preservado** — o botão "Excluir" tira o acesso da pessoa e a remove de todas as listas (equipe, distribuição, rankings), mas mantém intacto o histórico de vendas, clientes e conversas vinculado a ela. O próprio usuário logado e os donos da conta não podem ser excluídos.
- **Presença online da equipe** — a tela de Usuários mostra um ponto verde e a etiqueta "Online" em quem está com a plataforma aberta naquele momento, atualizando em tempo real.
- **Último acesso de cada usuário** — abaixo do e-mail, a tela informa quando a pessoa entrou pela última vez (ou "Nunca acessou" para quem ainda não fez login).

## [0.88.0] — Chronicle · 2026-06-12

**As conversas reais do WhatsApp agora aparecem na plataforma** — incluindo o histórico importado do número conectado. E o envio ficou mais confiável: um balão só por mensagem, com status que reflete a verdade da entrega.

### Added

- **Conversas reais no Atendimento** — as mensagens do número de WhatsApp conectado passam a aparecer direto na tela de Conversas, com cliente, histórico e status. As conversas de demonstração ficam guardadas para consulta, sem se misturar com as de verdade.
- **Importação do histórico de conversas** — em Configurações → WhatsApp dá para importar as conversas antigas do número (mensagens e contatos), trazendo o histórico para dentro da plataforma. O resumo da importação mostra de forma honesta o que entrou e o que foi ignorado, separando grupos, listas, canais e contatos com número oculto pelo WhatsApp.
- **Mensagens enviadas pelo celular aparecem aqui** — se alguém responder um cliente direto pelo aparelho, a mensagem também surge na conversa da plataforma, mantendo o atendimento completo.

### Fixed

- **Fim do falso "não enviado"** — algumas mensagens apareciam com o ícone vermelho de falha mesmo tendo sido entregues e lidas. Agora o status reflete a realidade: quando a entrega é confirmada depois, o balão se recupera sozinho.
- **Um balão só por mensagem** — ao enviar, não aparece mais um balão duplicado. A mensagem mostra um único balão que vai de "enviando" para "enviado" e "entregue/lida".

## [0.87.0] — Socket · 2026-06-11

**Conectar o WhatsApp agora é coisa de dentro da plataforma**: leia um QR code e pronto, sem painéis técnicos. E as telas de lista ganharam um pacote de produtividade — visual de vidro, linha de progresso, busca mais esperta e colunas sob seu controle.

### Added

- **Conexão do WhatsApp por QR code** — em Configurações → WhatsApp, o botão "Conectar" abre um assistente: informe os dados do servidor, leia o QR code com o celular (igual ao WhatsApp Web) e o número fica ativo. Dá para testar o servidor antes de conectar e reconectar um número que caiu pelo mesmo caminho.
- **Status de conexão sempre verdadeiro** — a plataforma confere sozinha, de tempos em tempos (e na hora, quando o provedor avisa), se cada número segue conectado. O cartão da conta mostra o estado real e tem o botão "Verificar agora".
- **Métricas e mensagem de teste por conta** — cada conta de WhatsApp exibe envios dos últimos 30 dias, falhas, taxa de falha e o horário do último envio; o botão "Mensagem de teste" dispara um texto para um número à sua escolha (o campo formata o telefone automaticamente) para validar a conexão de ponta a ponta.
- **Aviso imediato de desconexão** — se um número cair, o gestor recebe notificação no sino e uma faixa translúcida fixa avisa no topo de todas as telas, com atalho "Reconectar"; o X silencia o aviso por 30 minutos. O ícone do WhatsApp no topo fica verde, âmbar ou vermelho conforme a situação das contas.
- **Linha de progresso de leitura** — uma linha fina colorida na base do cabeçalho avança conforme você rola a página, no app inteiro e nas telas de lista.
- **Menu de colunas nas listas** — clique com o botão direito no cabeçalho das tabelas de Clientes, Orçamentos e Pedidos para escolher quais colunas exibir (como já existia em Veículos e Catálogo); a escolha fica salva no navegador.
- **Colunas ajustáveis em Pedidos** — arraste a divisória no cabeçalho para mudar a largura de cada coluna, como no Catálogo; as larguras ficam salvas.

### Changed

- **Visual de vidro nos cabeçalhos** — o topo do app e os cabeçalhos de Catálogo, Clientes, Veículos, Orçamentos e Pedidos ganharam efeito de vidro fosco: o conteúdo passa desfocado por trás ao rolar.
- **Busca mais esperta nas listas** — o campo de busca dessas telas cresce quando você clica nele, a tecla "/" leva o cursor direto para a busca e Esc recolhe o campo.

### Removed

- **Busca global do topo** — a barra de busca do cabeçalho principal foi removida; a busca agora vive dentro de cada tela, com atalho "/" e mais contexto.

## [0.86.1] — Lever · 2026-06-11

Ajustes do **dia da virada para Produção**: correções identificadas no teste geral feito após a plataforma passar a operar com dados reais.

### Fixed

- **Listas completas** — telas como Pedidos mostravam no máximo 200 registros ao operar com dados reais; agora as listas carregam tudo o que existe (limite elevado em 17 fontes de dados).
- **Atualização imediata após editar cliente** — ações como "Marcar como dormente", bloquear ou transferir a carteira passavam a valer no servidor, mas a tela do cliente continuava mostrando o estado antigo até recarregar a página; agora a mudança aparece na hora.
- **Registro de auditoria das ações** — em Produção, algumas ações sobre clientes falhavam silenciosamente ao gravar a trilha de auditoria por usarem a identidade errada do usuário; o registro agora usa o vendedor vinculado, como o histórico espera.
- **Substituição de chaves no cofre** — atualizar uma chave de integração já cadastrada na tela "Chaves & API" falhava por falta de permissão interna; a regravação agora usa o mecanismo oficial do cofre.

## [0.86.0] — Lever · 2026-06-10

Agora dá para **alternar entre Demonstração e Produção de dentro da própria plataforma**, sem mexer em configurações de servidor — e o sistema deixa sempre claro em qual modo você está.

### Added

- **Tela "Ambiente & Dados"** — em Configurações → Avançado (exclusiva do dono): dois cartões grandes para escolher entre **Produção** (dados reais e login por e-mail e senha) e **Demonstração** (dados fictícios e perfis de teste), com uma área avançada para combinar dados e login de formas diferentes quando necessário.
- **Confirmação transparente** — antes de aplicar, um aviso lista exatamente o que vai acontecer: a página recarrega, a sessão é encerrada se a forma de login mudar e, ao entrar em Produção, tudo o que for cadastrado passa a ser permanente.
- **Aviso de modo Demonstração** — enquanto os dados forem fictícios, uma faixa discreta no topo lembra que nada está sendo salvo de verdade, com atalho para o dono trocar de modo. O menu do usuário e a tela Saúde do Sistema também mostram o modo ativo.
- **Ajuste por navegador** — a escolha vale apenas no navegador em que foi feita e pode ser desfeita com um clique em "Voltar ao padrão do ambiente"; os demais usuários não são afetados.

### Security

- **Proteções inalteradas** — o modo escolhido não abre nenhuma porta: as permissões e o login dos dados reais continuam valendo independentemente da escolha, e a tela é exclusiva do perfil Owner.

## [0.85.0] — Keyring · 2026-06-10

As **chaves das integrações agora são gerenciadas dentro da plataforma**: uma tela nova permite ao dono cadastrar e substituir as credenciais de e-mail e WhatsApp sem precisar de painéis técnicos externos — com tudo guardado criptografado em um cofre.

### Added

- **Tela "Chaves & API"** — em Configurações → Integrações (exclusiva do dono): cadastre a chave do serviço de e-mail, as credenciais do webhook do WhatsApp e as chaves de cada conta de WhatsApp conectada, cada uma com instruções do que é e de onde vem.
- **Cofre criptografado** — os valores são gravados cifrados no servidor. A tela mostra apenas quando cada chave foi configurada e os 4 últimos caracteres, para reconhecimento; o valor completo nunca é exibido de volta.
- **Troca sem interrupção** — substituir uma chave entra em vigor imediatamente, sem reiniciar nada; as chaves configuradas pelo método antigo continuam funcionando como reserva.

### Security

- **Acesso blindado** — nem pelo banco de dados é possível ler as chaves: somente o servidor interno acessa o cofre, e toda gravação fica registrada na auditoria (sem o valor).

## [0.84.0] — Anchor · 2026-06-10

Preparamos a **base para importar dados de outros sistemas** (PRD-121): clientes, peças e pedidos vindos de fora (como o ERP da loja) agora têm uma porta de entrada padronizada na plataforma, com dados de exemplo para testes.

### Added

- **Fundação de importação de dados** — camada interna que define como lotes de dados externos entram no sistema (clientes, peças, pedidos e itens), com validação de estrutura antes de qualquer gravação e um conjunto de dados de demonstração para testes. Nenhuma tela nova nesta versão — é o alicerce das importações.

### Changed

- **Importações via planilha serão assistidas** — por decisão registrada, a importação de arquivos CSV do ERP não terá tela de upload: cada importação será conduzida de forma assistida pelo agente desenvolvedor, com prévia das mudanças antes de gravar. Mais seguro para um fluxo que é esporádico.

## [0.83.0] — Relay · 2026-06-10

A **etapa do WhatsApp real está completa**: se uma conta de WhatsApp cair, o sistema agora tem **plano B** (PRD-120) — os envios novos passam automaticamente para uma conta reserva, o dono é avisado e tudo volta ao normal sozinho quando o provedor se recupera.

### Added

- **Failover entre contas** — cada conta de WhatsApp pode ter uma conta reserva e uma política: desativado, manual (você liga quando quiser) ou automático (liga sozinho quando a conta principal cai). Enquanto a contingência está ativa, as mensagens novas saem pela reserva; o histórico e o recebimento continuam no número original.
- **Monitor de saúde dos provedores** — uma rotina no servidor avalia a cada 5 minutos a taxa de erro de cada provedor; quando uma conta degrada ou cai, o estado muda, o gestor recebe um aviso no sino e, na política automática, a contingência liga sozinha. Após 30 minutos saudável, ela desliga e avisa.
- **Painel de provedores** — a tela Gestão → Saúde do Sistema ganhou a seção "WhatsApp — Provedores & Failover": estado de cada conta, chamadas das últimas 24h, taxa de erro, latência e a situação da contingência.
- **Controles do dono** — em Configurações → WhatsApp você define a política e a conta reserva, e tem os botões "Ativar failover agora" / "Desativar failover". Toda mudança fica registrada na auditoria.

### Changed

- **Envio ciente da contingência** — com o failover ativo, o aviso de janela de 24 horas considera o provedor que realmente vai enviar; modelos aprovados não saem por reserva sem suporte a eles — nesse caso o sistema bloqueia com explicação clara em vez de enviar errado.

### Security

- **Painel restrito ao dono** — os indicadores de provedores só retornam para o perfil Owner (regra no banco); a rotina de monitoramento não pode ser executada por usuários do aplicativo.

## [0.82.0] — Weave · 2026-06-10

A **integração do WhatsApp real fechou o ciclo com as telas do dia a dia** (PRD-119): anexar arquivos direto na conversa agora funciona de verdade, e a tela de configuração das contas de WhatsApp saiu do "em breve".

### Added

- **Anexar arquivos na conversa** — os botões Imagem, Documento e Áudio do clipe de anexos passaram a funcionar: escolha o arquivo do computador e ele sai na conversa (o texto digitado vira a legenda). Imagens até 5 MB, áudios até 16 MB e documentos até 25 MB; fora da janela de 24 horas, o sistema orienta a usar um modelo aprovado, como em qualquer envio.
- **Tela de contas de WhatsApp** — Configurações → WhatsApp deixou de ser uma prévia: mostra as contas conectadas com provedor, situação e recursos de cada uma, e permite editar o nome, o prefixo de credenciais e a configuração técnica de cada provedor. Tokens e chaves continuam fora da tela — ficam guardados apenas no servidor.

### Changed

- **Revisão geral das telas** — auditoria confirmou que Central de Atendimento, Conversa e Distribuição já operam pelos dados reais quando o modo Supabase está ativo, sem nenhum resquício dos dados de demonstração fora do lugar. A tela de Simulação SDR permanece um ambiente de treino isolado, que nunca grava no sistema.

### Security

- **Configuração de contas restrita** — editar as contas de WhatsApp agora é permitido apenas para Dono e Gestor, com a regra aplicada direto no banco de dados; vendedores continuam enxergando os recursos das contas para usar a conversa normalmente.

## [0.81.0] — Pulse · 2026-06-10

O **ciclo de cada mensagem do WhatsApp agora é visível do início ao fim** (PRD-118): você acompanha na conversa se a mensagem foi enviada, entregue ou lida — ao vivo, sem recarregar —, entende por que uma falhou e tem ação corretiva na hora. O dono ganhou um painel de saúde de entrega por conta.

### Added

- **Confirmações como no WhatsApp** — cada mensagem enviada mostra seu estado na bolha: relógio (enviando), ✓ (enviada), ✓✓ (entregue), ✓✓ azul (lida) e ⚠ vermelho em caso de falha — com o motivo no tooltip. A lista de conversas também ganhou o mini-indicador antes do prévia quando a última mensagem é da loja.
- **Atualização ao vivo** — as confirmações transicionam em tempo real com a tela aberta: a mensagem do cliente aparece sem recarregar e o ✓ vira ✓✓ no momento em que o provedor confirma.
- **Tentar de novo de verdade** — o botão de reenvio em mensagens com falha agora cria um novo envio real pelo mesmo canal seguro, preservando a mensagem original com o erro registrado.
- **Proteção contra número inválido** — quando a Meta informa que o número não tem WhatsApp, o cliente fica marcado e a conversa exibe o aviso "Número não é WhatsApp". Novos envios são bloqueados com explicação; Owner e Gestor podem confirmar e enviar mesmo assim (fica registrado), e a revalidação é manual pelo botão "Marcar como WhatsApp válido".
- **Saúde de entrega no painel** — a tela Gestão → Saúde do Sistema (Owner) ganhou a seção "WhatsApp — Saúde de Entrega": enviadas, entregues, lidas e falhas por conta nas janelas de 24 horas e 7 dias, além das principais causas de falha.

### Security

- **Indicadores restritos ao dono** — os números de saúde de entrega só são retornados para o perfil Owner; demais perfis e visitantes não recebem nada, com a regra aplicada direto no banco.
- **Forçar envio é privilégio auditado** — vendedor comum não consegue contornar o bloqueio de número inválido; quando Owner/Gestor confirma o envio, a decisão fica na trilha de auditoria.

## [0.80.0] — Hourglass · 2026-06-10

A **janela de 24 horas do WhatsApp ficou visível e precisa** (PRD-117): o aviso na conversa agora mostra exatamente quanto tempo resta para responder com texto livre, e quando a janela fecha o caminho para o modelo aprovado está a um clique.

### Added

- **Atalho direto para o modelo** — quando a janela fecha, o aviso na conversa ganha o botão "Selecionar template", que abre o seletor de modelos aprovados na hora — sem precisar tentar enviar e receber o aviso de bloqueio.

### Changed

- **Contagem regressiva exata** — o tempo restante da janela passa a ser calculado pela última mensagem recebida **do cliente** registrada no servidor; antes, em alguns casos, mensagens enviadas pela loja podiam fazer a janela parecer aberta quando já tinha fechado.
- **Reabertura em tempo real** — se o cliente responder com a tela aberta, o aviso volta a verde e o campo de mensagem reabilita na hora, sem recarregar.

### Security

- **Consulta protegida** — a verificação do horário da última mensagem respeita as mesmas regras de acesso do banco: cada vendedor só consulta as conversas que pode ver, e visitantes não autenticados não têm acesso.

## [0.79.0] — Stencil · 2026-06-10

Chegaram os **modelos de mensagem aprovados (templates HSM)** (PRD-116) — a única forma que a API oficial da Meta permite para falar com o cliente fora da janela de 24 horas. A plataforma agora tem o catálogo desses modelos e um seletor integrado à conversa. Em modo demonstração, nada muda na sua experiência.

### Added

- **Catálogo de templates** — nova tela em Configurações → Templates WhatsApp (perfis Owner e Gestor) para cadastrar os modelos aprovados no Meta Business Manager: corpo com variáveis `{{1}}`, rótulos amigáveis para cada campo, pré-visualização ao vivo e selo com o status de aprovação da Meta. Nome, idioma e corpo ficam travados após criar (mudou na Meta ⇒ cadastre um modelo novo).
- **Seletor de template na conversa** — ao tentar enviar texto livre fora da janela de 24h, a tela de Atendimento abre automaticamente o seletor: escolha o modelo aprovado, preencha os campos pelos rótulos, confira o resultado e envie. O texto final fica registrado na conversa como qualquer mensagem.
- **3 modelos de exemplo** — boas-vindas, aviso de pedido pronto e cobrança amigável já vêm cadastrados para demonstração (devem ser substituídos pelos modelos reais aprovados da GALLO).

### Security

- **Visibilidade por loja** — cada loja enxerga apenas seus modelos (e os globais); criar, editar e desativar é restrito a Owner e Gestor, com as regras aplicadas direto no banco de dados.

## [0.78.0] — Courier · 2026-06-10

O **envio real de mensagens** está pronto (PRD-115): quando as credenciais dos provedores forem ativadas, o botão Enviar da Central de Atendimento passa a despachar mensagens de verdade pelo WhatsApp — com confirmações de entrega e leitura voltando para a conversa. **Nada muda na sua experiência ainda** (o modo demonstração segue idêntico).

### Added

- **Envio pela Central de Atendimento** — texto e mídia saem por um canal seguro do servidor, que valida quem pode enviar em cada conversa (dono da conversa, gestores, ou conversas ainda sem responsável), registra a mensagem antes do envio e mostra falhas com motivo e opção de tentar de novo.
- **Aviso da janela de 24 horas** — na API oficial da Meta, texto livre só pode ser enviado até 24h após a última mensagem do cliente; fora disso o sistema avisa na hora e orienta a usar um modelo aprovado (os modelos chegam na próxima etapa).
- **Mensagens com erro ficam visíveis** — um envio que falhar nunca some: fica na conversa marcado com o motivo, para correção ou nova tentativa.

### Security

- **Permissão em dupla camada** — além das regras do banco, o servidor confere explicitamente se quem envia pode atuar naquela conversa; mídias saem por links temporários de 5 minutos; toda tentativa (sucesso ou falha) fica registrada na auditoria.

## [0.77.0] — Gateway · 2026-06-10

A **porta de entrada das mensagens reais do WhatsApp** está construída (PRD-114): quando um cliente mandar mensagem para um número da GALLO, ela vai chegar direto na tela de Atendimento — com cliente e conversa criados automaticamente quando for um contato novo. **Nada muda na sua experiência ainda**: o recebimento liga quando as credenciais dos provedores forem ativadas.

### Added

- **Recebimento unificado de mensagens** — um único ponto de entrada recebe as mensagens dos dois provedores (API oficial da Meta e Evolution), identifica a conta da loja, encontra ou cria o cliente e a conversa, e registra a mensagem — que aparece na tela de Atendimento em tempo real.
- **Cliente novo entra como "revisar"** — quem manda mensagem sem cadastro vira um cliente mínimo marcado para revisão, atribuído ao gestor da loja — sem inventar dados.
- **Confirmações de entrega e leitura** — quando o destinatário recebe ou lê uma mensagem enviada, o estado dela é atualizado na conversa.
- **Mídias recebidas guardadas na hora** — fotos, áudios e documentos enviados pelos clientes são baixados imediatamente (os links dos provedores expiram em minutos) e guardados no armazenamento privado da plataforma.

### Security

- **Porta fechada por padrão** — toda chamada recebida tem a autenticidade verificada criptograficamente (ou por lista de IPs confiáveis); sem as chaves configuradas, o ponto de entrada recusa tudo. Eventos repetidos pelos provedores nunca duplicam mensagens, e os registros de auditoria mascaram o telefone do cliente.

## [0.76.0] — Bridge · 2026-06-10

Começou a construção da **ponte para o WhatsApp de verdade** (PRDs 111, 112 e 113): a plataforma agora sabe conversar com os dois caminhos de envio e recebimento — a API oficial da Meta e a Evolution API (auto-hospedada) — cada um com suas capacidades e limites mapeados. **Nada muda na sua experiência nesta versão**: são as fundações invisíveis; o recebimento e o envio reais de mensagens chegam nas próximas etapas, quando as credenciais forem ativadas.

### Added

- **Conector da API oficial do WhatsApp (Meta)** — preparado para enviar textos, mídias, mensagens de modelo aprovadas e botões/listas interativas, receber mensagens e confirmações de entrega/leitura, e verificar a autenticidade de tudo que chega. Já entende as regras da Meta, como a janela de 24 horas para resposta livre.
- **Conector da Evolution API** — caminho alternativo para contas que ainda não têm aprovação da Meta: envia textos e mídias sem janela de 24 horas, detecta quando o WhatsApp do aparelho desconecta e avisa que é preciso reconectar pelo QR Code.
- **Registro de auditoria das integrações** — toda conversa da plataforma com os provedores de WhatsApp passa a ser registrada (endereço chamado, resultado, tempo de resposta), visível apenas para o perfil Owner.

### Security

- **Credenciais fora do banco de dados** — as chaves de acesso aos provedores vivem apenas no cofre seguro do servidor, nunca no banco nem no navegador; os registros de auditoria removem automaticamente qualquer segredo e limitam o tamanho do conteúdo guardado.
- **Verificação criptográfica das mensagens recebidas** — tudo que chega pelos provedores tem a assinatura validada com comparação resistente a ataques de tempo, antes de qualquer processamento.

## [0.75.0] — Sentinel · 2026-06-10

A plataforma ganhou a sua **rede de segurança**: cópias de segurança automáticas, planos de recuperação prontos e um painel para acompanhar a saúde do sistema. Fecha a faixa de infraestrutura da nuvem (PRDs 100–110). **Nada muda na sua experiência nesta versão** — são proteções e visibilidade dos bastidores.

### Added

- **Painel "Saúde do Sistema"** — nova tela no menu Gestão (perfil Owner) mostrando, em tempo real, se o banco de dados, o armazenamento de arquivos e o login estão respondendo; as rotinas automáticas do servidor com a última execução de cada uma; o tamanho da base; e atalhos para os painéis externos de investigação. A verificação se renova sozinha a cada 30 segundos.
- **Verificação pública de disponibilidade** — a plataforma ganhou um endereço próprio de "está no ar?", que permite que serviços de vigilância externos chequem a saúde do sistema a cada poucos minutos e avisem se algo cair — sem expor nenhum dado interno.
- **Cópias de segurança semanais automáticas** — toda semana o banco de dados completo e os arquivos críticos (documentos fiscais e mídias de conversas) passam a ser copiados para fora da nuvem principal, com validação automática da cópia e guarda por 90 dias. Se uma cópia falhar, chega aviso por e-mail.
- **Planos de recuperação prontos e testáveis** — guias passo a passo para recuperar o sistema em qualquer cenário: desfazer uma exclusão acidental voltando no tempo, reconstruir o banco a partir da cópia semanal, recuperar arquivos e até reconstruir tudo do zero — com metas de tempo de recuperação definidas.
- **Rastreamento de erros preparado (opcional)** — quando ativado, erros que acontecerem nas telas ou no servidor passam a ser capturados automaticamente com o rastro completo do problema e a versão em que ocorreram, acelerando o diagnóstico — sem nunca incluir dados pessoais de clientes.

### Security

- **Telemetria sem dados pessoais** — qualquer informação de erro enviada para fora da plataforma passa por uma limpeza automática que remove nome, e-mail, telefone e documentos de clientes; o painel de saúde é restrito ao perfil Owner também na camada do banco; e as cópias de segurança ficam guardadas em conta separada da nuvem principal.

## [0.74.0] — Backbone · 2026-06-10

A **infraestrutura da nuvem foi completada de ponta a ponta** (PRDs 100–108): atendimento ao vivo, envio de arquivos, convite por e-mail com definição de senha e relatórios pré-calculados no servidor. O sistema continua nos dados de demonstração por padrão — **nada muda na sua experiência nesta versão**; os novos recursos de nuvem ligam junto com a virada, quando você decidir.

### Added

- **Atendimento ao vivo (modo nuvem)** — a lista de conversas e as mensagens passam a se atualizar sozinhas no momento em que algo novo chega, sem recarregar a tela. O indicador de "tempo real" no topo do Atendimento agora também mostra, em âmbar, quando a conexão ao vivo ainda está sendo estabelecida.
- **Envio de arquivos para a galeria de mídias** — novo botão "Enviar mídia" nas galerias da conversa e da ficha do cliente: você pode subir fotos, vídeos, áudios e PDFs. No modo nuvem os arquivos ficam guardados em armazenamento próprio da loja, com links de acesso temporários.
- **Convite de vendedor por e-mail com definição de senha** — a tela de Usuários ganhou o botão "Convidar por e-mail": o vendedor recebe um link, define a própria senha numa página nova e já entra na plataforma (ativa de fato quando o provedor de e-mail estiver conectado).
- **Relatórios gerenciais preparados no servidor (modo nuvem)** — vendas por vendedor e mês, comissões por período e indicadores executivos passam a ser pré-calculados a cada 15 minutos nos bastidores, deixando os painéis prontos para crescer em volume. A busca de peças e clientes por nome também ficou indexada (mais rápida em bases grandes).
- **Bastidores versionados e padronizados** — todo o histórico de estrutura do banco em nuvem agora vive junto do código (reproduzível do zero), e as funções de servidor ganharam uma base comum com rastreio de erros por requisição e automações de publicação preparadas.

### Security

- **Acesso controlado a arquivos e relatórios (modo nuvem)** — arquivos de mídia só são acessíveis pela própria loja e por links temporários; nos relatórios pré-calculados, cada vendedor enxerga apenas os próprios números e os indicadores executivos ficam restritos à gestão.

## [0.73.0] — Keystone · 2026-06-10

A **Fase 2 (banco de dados em nuvem)** foi concluída, reforçada e integrada à base do produto. O sistema continua usando os dados de demonstração por padrão — **nada muda na sua experiência nesta versão**; a virada para os dados em nuvem é um passo separado, ligado quando você decidir.

### Added

- **Fundação da nuvem concluída e endurecida** — toda a virada para a plataforma funcionar sobre o banco em nuvem foi finalizada e testada nos bastidores: login real por e-mail e senha, separação dos dados por vendedor, catálogo público da loja e **geração automática dos alertas de gestão pelo servidor** (cliente A dormente, vendedor sobrecarregado, conversa sem resposta), sem depender de alguém estar com a tela aberta. Continua selecionável por configuração; o padrão segue nos dados de demonstração.
- **Finalização de pedido da loja pelo WhatsApp** — quando a loja estiver no modo nuvem, o "Finalizar pedido" passa a enviar o pedido direto ao nosso time pelo WhatsApp, já com o resumo do carrinho, em vez do checkout de demonstração — com a opção de copiar o resumo caso o WhatsApp ainda não esteja configurado.

### Security

- **Privacidade dos dados por vendedor (modo nuvem)** — cada vendedor passa a ver e alterar apenas as conversas, clientes, mídias e notas da própria carteira; as informações dos demais ficam protegidas inclusive contra acesso pela camada de dados, e cada nota fica corretamente atribuída ao vendedor que a registrou.

## [0.72.0] — Bedrock · 2026-06-08

### Added

- **Base para a Fase 2 (banco de dados em nuvem)** — toda a fundação dos bastidores foi preparada para a plataforma passar a funcionar sobre um banco de dados em nuvem (Supabase), incluindo login real por e-mail e senha. Tudo já fica selecionável por configuração. **Nesta versão nada muda na sua experiência** — o sistema continua usando os dados de demonstração; a virada para os dados em nuvem virá numa próxima etapa.

## [0.71.0] — Focus · 2026-06-08

### Added

- **Filtros recolhíveis na lista de conversas** — a barra de filtros do Atendimento agora pode ser recolhida com um clique, liberando bem mais espaço para a lista de conversas. Ela já abre recolhida e lembra a sua preferência. Um número ao lado de "Filtros" mostra quantos filtros estão ativos mesmo quando está recolhida, e o "Limpar tudo" continua à mão para zerar os filtros sem precisar abrir a barra.

## [0.70.0] — Guide · 2026-06-07

### Added

- **Dicas de ajuda nos indicadores** — os cards de indicadores do Painel do Gestor e da Visão Executiva agora têm um ícone de informação ao lado do título; ao passar o mouse (ou focar pelo teclado), aparece uma explicação curta do que cada número significa.
- **"Como funciona?" no Forecast e na Positivação** — logo abaixo do título dessas páginas há um "Como funciona?" que, ao ser aberto, explica em linguagem simples como os números são calculados (o que entra em cada parte do cálculo).

## [0.69.1] — Beacon · 2026-06-07

### Changed

- **Indicador de WhatsApp mais limpo** — o status de conexão do WhatsApp no topo agora é mostrado pela própria cor do ícone (verde pulsante quando conectado, cinza quando desconectado), sem a bolinha sobreposta no canto.

## [0.69.0] — Beacon · 2026-06-07

### Added

- **Indicador de conexão do WhatsApp no topo** — o cabeçalho agora mostra um ícone do WhatsApp, ao lado do copiloto, que sinaliza se a conta de WhatsApp da loja está conectada (ponto verde pulsante) ou desconectada (ponto cinza). Ao clicar no ícone, você vai direto para a tela de configuração do WhatsApp.

## [0.68.2] — Dispatch · 2026-06-07

### Fixed

- **Copiloto do atendimento abrindo sozinho** — o painel de sugestões do copiloto na tela de atendimento agora vem fechado por padrão e abre apenas quando você clica nele. Antes, ele se expandia automaticamente sempre que havia um alerta na conversa, ocupando espaço acima das mensagens. O alerta principal continua visível na faixa fechada, então nada importante deixa de aparecer.

## [0.68.1] — Dispatch · 2026-06-07

### Changed

- **Botão "Ficha" removido do canto superior direito** — o botão duplicado que não fazia nada foi removido da área acima da conversa. O botão "Ficha" que abre o painel do cliente continua no cabeçalho da conversa, ao lado de "Criar orçamento" e "Mídias".

### Fixed

- **Barra de rolagem dupla na ficha do cliente** — resolvida a barra de rolagem externa que aparecia encostada na barra da ficha em telas de atendimento, detalhe e configurações. O cálculo de altura dos painéis agora desconta a barra de status do rodapé, deixando apenas a rolagem interna de cada painel.
- **Falhas de tipagem em quick-send e mídia** — corrigidas inconsistências de tipos no código dos PRDs 026 e 027 que o compilador TypeScript detectava mas o build não bloqueava (esbuild não checa tipos).

## [0.68.0] — Dispatch · 2026-06-07

O atendimento ganha **envio rápido**. Agora o vendedor dispara catálogos, fichas, tabelas, garantias, vídeos e links direto do composer, a partir de uma **biblioteca de ativos curada e versionada** (por marca e linha), aberta em **três modos** que você alterna e ficam lembrados — **Painel** (⌘K), **Grade** e **Lateral** — com **Recentes**, **Favoritos** e busca. **Comandos de barra** (`/catalogo`, `/tabela`, `/garantia`, `/loja`) acham e inserem o material em segundos, e **respostas rápidas** preenchem variáveis (`{{nome}}`, `{{peça}}`, `{{prazo}}`) a partir do contexto da conversa — com trava que impede enviar campo em branco. Dá para mandar um **card de produto** rico (foto, código OE, equivalência, estoque, preço) montado do catálogo, montar **pacotes/combos** e **agendar** envios por conversa. **Links rastreáveis** sinalizam quando o cliente abriu o material e **elevam a temperatura do lead** automaticamente. A gestão controla o que circula: **publicar/despublicar, versão e permissão por ativo**, gestão de respostas compartilhadas e **estatística de uso** — e a **tabela de preços** (sensível) só pode ser enviada por Owner e Gestor, com auditoria. Tudo sobre o storage do PRD-026, sem alterar nada do composer existente.

### Added

- **Biblioteca de ativos no composer (PRD-027)** — seletor curado e versionado (catálogo, ficha técnica, tabela de preços, garantia, vídeo, link) por marca/linha, com busca, Recentes e Favoritos, em três modos lembrados (Painel/Grade/Lateral); abre por botão, `Ctrl/Cmd+K` ou `/`.
- **Comandos de barra (slash)** — `/catalogo`, `/tabela`, `/garantia`, `/loja` (e busca livre) inserem o ativo em 1 clique, sem capturar barra literal (`http://`, datas).
- **Respostas rápidas (snippets)** — texto reutilizável com variáveis resolvidas do contexto; o que não resolve fica em destaque editável e o envio é bloqueado até preencher (nunca envia placeholder cru).
- **Card de produto** — bubble rico montado do catálogo (foto, código OE, equivalência, estoque, preço), com degradação elegante quando falta imagem ou preço.
- **Links rastreáveis + temperatura do lead** — ao enviar um link, a abertura (simulada na Fase 1) aparece na conversa e eleva a temperatura do lead (frio→morno→quente), com indicação e registro do evento.
- **Pacotes/combos** — selecione vários ativos e envie em sequência; falha em um item não impede os demais.
- **Agendamento de envio** — agende ativo/snippet/combo por conversa, com lista de agendados (editar/cancelar + desfazer) e disparo no horário (simulado na Fase 1).
- **Governança da biblioteca** — publicar/despublicar, versão e permissão por ativo; gestão de respostas compartilhadas; estatística de uso (mais enviados + ranking por vendedor), em Configurações → Biblioteca.
- **Governança de ativo sensível** — a tabela de preços é restrita a Owner e Gestor para envio; tentativas de perfis sem permissão são bloqueadas e auditadas.

## [0.67.0] — Vault · 2026-06-06

Toda mídia trocada no atendimento — foto de peça, foto de chassi/placa, nota fiscal, comprovante, áudio, documento — agora é **preservada e fácil de achar**. Cada conversa ganha uma **galeria de mídias** (botão no topo), e a ficha do cliente ganha uma aba **Mídias** que reúne tudo de todas as conversas dele. Você escolhe como ver — **Grade**, **Cartões** ou **Por tipo** — e a preferência fica lembrada. Um **visualizador em tela cheia** abre imagem (com zoom), toca áudio (1x/1.5x/2x) com a transcrição em destaque e abre/baixa documentos, tudo navegável por teclado. A plataforma **classifica e sugere vínculos** (peça, chassi/placa, nota, comprovante) para você confirmar, e protege o que é sensível: **nota fiscal e comprovante** ficam restritos a Owner e Gestor — os demais veem uma prévia borrada com aviso, e cada acesso é auditado. Imagens podem receber **anotações** salvas como nova versão. Por trás, uma camada de storage abstrata já está pronta para o provedor real da Fase 2.

### Added

- **Galeria de mídia por conversa (PRD-026)** — botão "Mídias" no topo da conversa abre uma galeria com contadores por tipo, busca (nome/transcrição), filtros e três modos de visualização (Grade/Cartões/Por tipo), lembrados por usuário.
- **Aba Mídias na ficha do cliente** — agrega as mídias de todas as conversas do cliente, com filtro por classificação e atalho para abrir a conversa de origem.
- **Visualizador em tela cheia (lightbox)** — imagem com zoom, player de áudio com velocidade (1x/1.5x/2x) e transcrição com realce, abrir/baixar documento; navegação por teclado (setas, Esc, Espaço, +/−).
- **Classificação e vínculo assistidos** — a mídia é classificada automaticamente (nota fiscal, peça, chassi/placa, comprovante, catálogo) e sugere vínculo a veículo/pedido/peça, sempre com confirmação do usuário e registro em auditoria.
- **Governança LGPD de mídia sensível** — notas fiscais e comprovantes ficam restritos a Owner e Gestor; os demais perfis veem prévia borrada com aviso e têm o acesso bloqueado e auditado; marcação manual de sensibilidade disponível para a gestão.
- **Anotação de imagem** — marcações de ponto/seta/texto sobre a imagem, salvas como uma nova versão sem alterar o original.
- **Preservação de mídia recebida** — toda mídia que chega é arquivada (com deduplicação) e sinaliza quando a origem está prestes a expirar ou falhou ao arquivar, com opção de tentar novamente — sem nunca travar a conversa.
- **Retenção configurável** — parâmetros de retenção de mídia (365 dias para comum, 5 anos para sensível) exibidos em Configurações.

## [0.66.0] — Oracle · 2026-06-05

Duas frentes de inteligência comercial chegam juntas. O **Forecast de Fechamento** projeta onde o período vai fechar — realizado + pipeline ponderado + ritmo — em três cenários (pessimista, provável, otimista), com detalhamento por vendedor e um widget no cockpit. E o **Copiloto Analítico** ganha uma **página dedicada** (menu Gestão → Copiloto): você pergunta em linguagem natural ("quanto faturei de filtro Volvo esse mês?") e recebe o número com a fonte oficial citada e link direto para o painel. A página tem três modos que você alterna e ficam lembrados — **Foco** (conversa única), **Histórico** (conversas salvas) e **Split** (conversa + ficha de detalhe) — além de um início com sugestões por categoria. Tudo respeita o seu papel (RBAC) e nunca inventa números: todo valor vem dos motores de BI.

### Added

- **Forecast de Fechamento (PRD-056)** — página em Gestão → Forecast com três cenários (pessimista/provável/otimista), detalhamento por vendedor, alternância faturamento/pedidos, widget no cockpit executivo e configuração por loja (Owner).
- **Copiloto Analítico — página dedicada (PRD-057)** — Q&A em linguagem natural em Gestão → Copiloto, respondendo com valor, comparação, **fonte citada** e drill-down para o painel de origem.
- **Três modos de visualização do Copiloto** — Foco, Histórico e Split, alternáveis por um seletor e lembrados entre acessos.
- **Histórico de conversas do Copiloto** — sessões salvas no navegador, agrupadas por data (Hoje/Ontem/Anteriores), com "Nova conversa" e exclusão.
- **Início guiado do Copiloto** — saudação contextual e perguntas de exemplo agrupadas por categoria (Faturamento & Margem, Clientes & Positivação, Projeção), conforme o papel do usuário.
- **Acesso ao Copiloto** — item no menu Gestão, botão na barra superior e atalho Ctrl/Cmd+K levam à página.

## [0.65.0] — Fitment · 2026-06-03

O detalhe de cada veículo agora mostra as **peças compatíveis de verdade**, puxadas do catálogo conforme o modelo do veículo. Você escolhe como visualizar: a **Curadoria** separa o que já está no kit oficial do que é compatível mas ficou de fora (uma oportunidade de incluir no kit); o **Catálogo** lista todas as peças compatíveis com busca e filtro por categoria; e o modo **Só o Kit** mostra apenas as peças do kit. Quando existe um kit oficial de filtros para o modelo, um destaque no topo leva direto a ele. Veículos cujo modelo ainda não está cadastrado aparecem marcados como **"modelo não catalogado"**, e o gestor pode vinculá-los a um modelo existente ou cadastrar um novo na hora — a partir daí, os kits e as peças compatíveis passam a aparecer.

### Added

- **Peças compatíveis no detalhe do veículo** — substituem o antigo aviso "em construção" por uma lista real, com três modos de visualização à sua escolha (lembrados entre acessos): Curadoria, Catálogo e Só o Kit.
- **Destaque do kit aplicável** — quando há um kit oficial de filtros para o modelo do veículo, um destaque no topo da seção mostra os itens e leva direto ao kit.
- **Peças fora do kit (drift)** — no modo Curadoria, as peças compatíveis que ainda não estão no kit aparecem separadas, sinalizando oportunidades de incluí-las.
- **Modelo não catalogado** — veículos sem modelo no catálogo recebem um indicador discreto; o gestor pode vincular a um modelo existente ou cadastrar um novo sem sair da tela.

### Changed

- **Veículos ligados ao catálogo de modelos** — cada veículo passa a referenciar o modelo canônico; os kits e as peças compatíveis agora casam pelo modelo do veículo, não mais por texto aproximado.

### Removed

- **Aviso "catálogo de peças em construção"** — substituído pela seção real de peças compatíveis.

## [0.64.0] — Kit · 2026-06-03

Os kits de peças agora vivem dentro de cada modelo de veículo. Na área **Kits por modelo**, você monta kits de filtros escolhendo as peças, as quantidades e marcando quais são base (sempre entram) ou opcionais (sugestões), e mantém cada kit como rascunho ou oficial — o vendedor propõe, o gestor oficializa. No orçamento, um clique em "Aplicar kit" abre uma pré-visualização onde você confirma os itens (os opcionais vêm desmarcados) e as peças entram com o preço congelado do momento; dá para desfazer. O sistema ainda sugere o kit certo quando o cliente tem um veículo compatível e avisa quando há peças que servem ao modelo mas estão fora do kit. A antiga tela "Kits de revisão" foi substituída por essa experiência unificada.

### Added

- **Kits por modelo** — em cada modelo de veículo, monte kits de filtros com peças, quantidades, itens base/opcionais e notas, mantidos como rascunho ou oficial.
- **Curadoria (rascunho → oficial)** — o vendedor cria rascunhos; o gestor promove a oficial ou devolve para rascunho. A lista de modelos sinaliza quais têm rascunhos pendentes, com um filtro dedicado.
- **Aplicar kit no orçamento** — uma pré-visualização mostra os itens base já marcados, os opcionais a confirmar, quantidades editáveis e o total estimado; ao confirmar, as peças entram com preço congelado e a ação pode ser desfeita.
- **Sugestão automática** — quando o cliente tem um veículo compatível, o orçamento sugere aplicar o kit de filtros daquele modelo.
- **Peças compatíveis fora do kit** — um aviso discreto no editor lista peças que servem ao modelo mas ainda não estão no kit, com um atalho para adicioná-las.
- **Aplicar a partir do veículo** — o card "Filtros" no detalhe do veículo abre um orçamento já com o kit do modelo pronto para aplicar.

### Changed

- **"Kits de revisão" virou "Kits por modelo"** — a montagem de kits foi unificada dentro dos modelos de veículo; o endereço antigo passa a redirecionar para a nova área.

### Removed

- **Tela antiga de Kits de revisão** — substituída pela experiência de kits por modelo.

## [0.63.0] — Catalog · 2026-06-03

A plataforma passa a contar com um catálogo centralizado de modelos de veículo — a base que conecta os kits de peças aos caminhões e ônibus que a distribuidora atende. Owners e Gestores podem cadastrar, editar, inativar e buscar modelos canônicos (marca, modelo, motor e anos de aplicação), organizados por montadora e com o ícone de cada marca. Cada modelo tem uma página própria, já estruturada para receber os kits de peças numa próxima entrega. Vendedores têm acesso em modo leitura para consultar a listagem.

### Added

- **Catálogo de modelos de veículo** — nova área **Kits por modelo** onde Owner e Gestor cadastram, editam, inativam e buscam os modelos canônicos (marca + modelo + motor + anos), agrupados por marca, com ícone de cada montadora.
- **Página individual de modelo** — cada modelo tem página própria, já preparada para receber os kits de peças (em breve).
- **Acesso em leitura para Vendedor** — o vendedor consulta o catálogo de modelos em modo leitura, sem permissão de edição.

## [0.62.0] — Workshop · 2026-06-03

Os kits de revisão agora podem ser montados e mantidos pela própria interface, sem depender do time técnico. Uma nova tela em **Catálogo → Kits de revisão** (disponível para donos e gestores) permite criar, editar, duplicar e excluir kits — cada um com nome, veículo de aplicação, categoria e a lista de peças com quantidades. O formulário pode ser aberto de três formas, à escolha do usuário (página inteira, janela ou painel lateral), e a preferência fica salva. Os kits criados aparecem imediatamente no botão "Kit de revisão" da tela de novo orçamento.

### Added

- **Tela de gestão de kits de revisão** — em Catálogo → Kits de revisão (donos e gestores), lista todos os kits da loja com busca por nome, veículo ou categoria, e mostra quantas peças cada kit tem.
- **Criar e editar kits** — formulário com nome, descrição, veículo de aplicação e categoria opcionais, mais um montador de peças: busque no catálogo à esquerda e monte a lista do kit à direita, ajustando a quantidade de cada peça.
- **Três formas de abrir o formulário** — página inteira, janela (dialog) ou painel lateral (drawer), selecionáveis por um botão e com a preferência lembrada entre sessões.
- **Duplicar kit** — cria uma cópia pronta para editar, ideal para variações (por exemplo, revisão de 40.000 e de 60.000 km).
- **Excluir com confirmação** — a exclusão é protegida por um aviso de confirmação para evitar remoções acidentais.
- **Indicador de uso** — cada kit exibe em quantos orçamentos já foi utilizado.

## [0.61.1] — Toolkit · 2026-06-03

As três listas da tela de novo orçamento — sugestões por veículo, "já comprou antes" e os itens do orçamento — agora têm cores, ícones e rótulos distintos, deixando claro de relance o que é sugestão do sistema, o que é histórico de compras do cliente e o que já foi adicionado ao orçamento.

### Changed

- **Distinção visual das listas no novo orçamento** — as grades de sugestões por veículo (azul), recompra (verde) e itens do orçamento (cartão dourado em destaque) receberam identidades próprias. As listas de origem ficam claramente separadas do orçamento em construção, que passa a ser destacado como o documento principal. A diferenciação usa cor, ícone e rótulo em conjunto, funcionando também para quem tem dificuldade de distinguir cores.

## [0.61.0] — Toolkit · 2026-06-02

O editor de orçamento ganha três upgrades que deixam o processo de montar um pedido mais rápido. **Kits de revisão**: o vendedor clica em "Kit de revisão", escolhe um kit pré-configurado (ex.: "Revisão 40.000 km — Volvo FH") e todos os itens são inseridos de uma só vez. **Informação financeira do cliente**: o cartão do cliente exibe agora, quando disponíveis, o limite de crédito, títulos vencidos e as condições do contrato B2B — sem mostrar nada quando o dado não existe. **Aceleradores**: a tabela de itens pode ser exibida no modo compacto ou conforto (preferência salva), a tecla `/` foca a busca e as setas movem a seleção entre resultados, e o orçamento é salvo automaticamente como rascunho — ao reabrir a tela, o vendedor pode restaurar ou descartar o trabalho não finalizado.

### Added

- **Kits de revisão** — botão "Kit de revisão" na tela de itens abre uma lista de kits pré-configurados por veículo (ex.: filtros de óleo e combustível para Volvo FH ou Scania R). Clicar num kit insere todas as peças de uma vez, incrementando quantidades quando a peça já estava no orçamento. Peças removidas do catálogo são ignoradas automaticamente.
- **Informações financeiras do cliente** — o cartão do cliente exibe, quando disponíveis: limite de crédito, quantidade de títulos vencidos (alerta em vermelho), desconto de contrato B2B e prazo especial de pagamento. Cada dado é ocultado individualmente quando ausente.
- **Auto-save de rascunho** — o orçamento em andamento é salvo automaticamente. Ao reabrir a tela, um aviso oferece restaurar o rascunho (itens, desconto, frete, forma de pagamento e notas) ou descartá-lo. Após salvar o orçamento com sucesso, o rascunho é apagado.
- **Atalhos de teclado na busca** — tecla `/` foca a busca de peças a partir de qualquer lugar da tela; `↑` `↓` navegam pelos resultados; `Enter` adiciona a peça em destaque; `Esc` limpa a busca.
- **Densidade da tabela** — botão de alternância na barra superior troca entre modo "Conforto" (espaçamento generoso) e "Compacto" (mais linhas visíveis). Preferência é salva por sessão.

## [0.60.0] — Mosaic · 2026-06-02

A tela de criação de orçamento agora entrega **informação de catálogo no momento certo**: cada peça adicionada mostra selo de Original ou Equivalente, código do fabricante, marca, status de estoque em cores (verde/âmbar/vermelho) e, para gestores e donos, a margem estimada por linha. Ao clicar em "ver equivalentes", o vendedor visualiza opções alternativas e pode trocar a peça diretamente na lista. O cliente selecionado vira um cartão compacto com status, classe ABC, data da última compra e todos os veículos da frota. O painel de totais ganha peso estimado do pedido, margem total e um medidor visual de desconto que acende em laranja ao ultrapassar o limite configurado.

### Added

- **Linha de item enriquecida** — cada peça na tabela de itens exibe miniatura (ou ícone da categoria), selo **Original** (dourado) ou **Equivalente** (neutro), código OEM e marca, além do status de estoque em três estados com indicador colorido.
- **Equivalentes inline** — botão "ver equivalentes" expande a linha e lista as peças alternativas cadastradas, com preço e estoque de cada uma. O vendedor troca a peça da linha por um equivalente com um clique; a quantidade é mantida.
- **Margem por linha** _(visível apenas para Gestor e Owner)_ — cada linha da tabela mostra a margem bruta estimada em reais e percentual.
- **Cartão de cliente inteligente** — ao selecionar um cliente, o cabeçalho passa a exibir seu status (Ativo, Dormente, Recuperação ou Perdido), classe ABC, data da última compra e chips dos veículos da frota.
- **Peso total do pedido** — o painel de resumo calcula e exibe o peso estimado somando o peso de cada peça pela quantidade, útil para cotação de frete.
- **Margem total do orçamento** _(visível apenas para Gestor e Owner)_ — total de margem bruta e percentual sobre o subtotal, exibido no painel de resumo.
- **Medidor visual de desconto** — barra de progresso mostra o desconto aplicado em relação ao limite configurado; fica laranja quando o limite é ultrapassado, sinalizando que o orçamento precisará de aprovação.

### Changed

- **Informação de estoque unificada** — o indicador de estoque (disponível, baixo, indisponível) agora aparece tanto na busca de itens quanto na tabela do orçamento, com a mesma lógica e cores em ambos os lugares.

## [0.59.0] — Counter · 2026-06-02

A tela de criação de orçamento foi totalmente reformulada para funcionar como um **balcão de atendimento digital**: o vendedor escolhe o layout da tela (coluna dupla com resumo fixo, largura cheia ou barra de total no rodapé), adiciona múltiplos itens de uma vez sem fechar nenhuma janela e recebe sugestões automáticas de peças com base nos veículos do cliente e no histórico de compras. Todos os orçamentos criados até agora continuam funcionando normalmente.

### Added

- **3 layouts para a tela de orçamento** — o vendedor escolhe entre duas colunas (lista de itens ao lado do resumo fixo), largura total ou barra de total fixada no rodapé. A preferência é lembrada para as próximas sessões.
- **3 modos de adição de itens** — modo Contínuo (busca que permanece aberta, sugestões de peças visíveis o tempo todo), modo Catálogo (painel lateral com seleção por caixas de marcação para adicionar vários itens de uma vez) e modo Rápido (digitação com teclado, tecla Enter adiciona e a busca continua aberta para o próximo item). A preferência de modo também é lembrada.
- **Sugestões automáticas por veículo do cliente** — ao abrir a tela de itens com um cliente selecionado, a lista mostra imediatamente as peças compatíveis com os veículos cadastrados na frota dele. Quando o cliente tem mais de um veículo, botões permitem alternar entre eles sem precisar digitar nada.
- **Histórico de recompra** — trilho "Já comprou antes" com as peças que o cliente adquiriu em pedidos anteriores, facilitando a repetição de pedidos de consumíveis (filtros, óleos, correias).
- **Item avulso** — permite adicionar ao orçamento qualquer produto ou serviço que não esteja no catálogo, informando apenas o nome, preço e quantidade.
- **Indicador de estoque na busca** — cada peça exibida nos resultados mostra o status de estoque em três estados: disponível, baixo ou indisponível.

### Changed

- **Adição de itens sem duplicação** — adicionar uma peça que já está no orçamento incrementa a quantidade da linha existente em vez de criar uma segunda linha idêntica.
- **Resumo de desconto e frete integrado ao painel de totais** — os controles de desconto global e frete foram movidos para dentro do painel de totais (à direita na tela ou no rodapé), ficando sempre visíveis enquanto o orçamento é montado.
- **Flash de confirmação ao adicionar** — a linha da peça recém-adicionada destaca-se brevemente com um realce dourado, confirmando visualmente que o item entrou no orçamento sem necessidade de toast por item.

### Fixed

- **Layout de barra no rodapé exibia painel completo** — o modo "barra no rodapé" agora renderiza corretamente o total e os controles em formato compacto horizontal, sem sobrepor o conteúdo com o painel expandido.

## [0.58.0] — Gauge · 2026-06-02

A plataforma ganha o conceito de **Indicadores por produto** — uma nova forma de acompanhar metas comerciais recortadas por categoria, produto ou grupo de peças. Diferente das Metas (que medem performance geral), um Indicador responde: "quanto vendemos de filtros este mês?" — com barra de progresso em tempo real, semáforo, ranking de quem mais contribuiu, gráfico de evolução e composição clicável pelos pedidos que compõem o número.

### Added

- **Indicadores por produto (`/app/gestao/indicadores`)** — nova área de acompanhamento de vendas por recorte de produto (categoria, SKU ou grupo personalizado), com quatro métricas (faturamento, quantidade, margem, pedidos), três escopos (loja, individual, global) e períodos de diário a anual.
- **Dashboard de Indicadores** — visão do gestor com KPIs (ativos, atingimento médio, acima de 100%, atrasados), tabela filtrável, gráfico de barras; visão do vendedor mostra apenas os indicadores que o incluem, em modo leitura.
- **Criação e detalhe de indicador** — formulário em 5 seções com seletor multimodal de produto (chips de categoria / busca de SKU / montador de grupo personalizado), e página de detalhe com barra de progresso, gráfico evolutivo "realizado vs esperado", ranking de contribuição por vendedor e tabela de pedidos contribuintes clicável.
- **Notificações de marco** — toast ao cruzar 50%, 80% e 100% do alvo do indicador.
- **Transição automática de status** — indicador vencido vira "Concluído" (se bateu o alvo) ou "Arquivado" (se não bateu) sem intervenção manual.
- **Widget no Painel do Gestor** — faixa "Indicadores do mês" com os 5 ativos de maior atingimento, com link direto para o detalhe.
- **Conversas roteirizadas no mock** — cenários de atendimento que acionam as regras do Copiloto de Vendas, tornando o mockup mais realista para demonstrações.
- **Colunas redimensionáveis e menu de visibilidade no catálogo** — cada coluna da listagem pode ser arrastada para redimensionar; o menu "Colunas" permite esconder ou mostrar colunas individuais.

### Changed

- **Helpers de progresso compartilhados** — os cálculos de semáforo (verde/amarelo/vermelho) e tendência de ritmo foram extraídos do motor de Metas para um módulo compartilhado, consumido tanto por Metas quanto por Indicadores.
- **Alinhamento da coluna de estoque no catálogo** — agora à esquerda para consistência visual com as demais colunas de texto.

### Fixed

- **Conflito de porta no servidor de desenvolvimento** — `strictPort` agora garante falha imediata se a porta 5173 já estiver em uso, evitando que dois servidores coexistam e corrompam o cache do Vite.
- **Acesso de VendedorExterno à área de Indicadores** — o guard de rota agora inclui o papel VendedorExterno, que tinha acesso garantido pela política RBAC mas era redirecionado para `/sem-permissão` antes de chegar à página.

## [0.57.0] — Manifest · 2026-06-01

O catálogo ganha dados de verdade. As **referências cruzadas** entre marcas concorrentes passam a ter lugar no modelo e na ficha do produto, e o catálogo é semeado com uma amostra de **filtros reais importados da planilha do fornecedor UFI** — com GTIN, dados fiscais, peso, múltiplo, aplicações e equivalências verdadeiras. Os filtros sintéticos dão lugar aos reais; as demais categorias seguem geradas. Tudo continua na Fase 1 (mock determinístico), agora muito mais fiel ao negócio.

### Added

- **Referência cruzada multi-marca** — novo conceito no modelo (`IPartCrossReference` + campo `crossReferences` em `IPart`), distinto dos códigos OEM do montador e das equivalências entre peças GALLO. Exibida em seção dedicada na ficha do produto, presente nos três layouts (Balcão, Painel, Ficha).
- **Import de filtros reais UFI (amostra ~150 SKUs)** — um conversor offline (`scripts/import-ufi-parts.py`) transforma a planilha de cotação do fornecedor em dados crus versionados (`ufiPartsRaw.ts`); um builder determinístico (seeded) os converte em peças do catálogo, sintetizando estoque, SEFAZ, margem e localização. Cada filtro carrega GTIN, dados fiscais (NCM/ICMS/ST/origem), peso, múltiplo de embalagem, aplicações por veículo, referências cruzadas de até 10 marcas e custo real do fornecedor.
- **Segmento de aplicação** — novo campo `segment` (Off Road / Linha Leve / Linha Pesada), exibido como chip no cabeçalho da ficha.
- **Texto original da aplicação** — novo campo `applicationNotes`, que preserva de forma lossless o texto livre de aplicação da fonte, mostrado como rodapé na seção de Aplicações.

### Changed

- **Gerador de mocks do catálogo** — deixa de produzir filtros sintéticos; a fatia de filtros passa a vir da amostra real UFI, enquanto as outras sete categorias (motor, freios, transmissão, suspensão, elétrica, arrefecimento, lubrificantes) seguem geradas. A integridade referencial com pedidos, orçamentos e histórico de serviço é preservada.

### Removed

- **Fixture de peça única** (`seedRealPart.ts`) — o registro real avulso usado na validação inicial foi absorvido pela amostra de 150 filtros.

## [0.56.0] — Copilot · 2026-05-31

O vendedor ganha um copiloto. Durante o atendimento, uma camada de orientação **privada** (só o vendedor vê) reúne o contexto do cliente, o resumo da conversa e sugestões acionáveis derivadas de regras — sem se confundir com a resposta enviada ao cliente. Tudo com dados fictícios na Fase 1; o motor de IA plena fica para a Fase 2, com o contrato já preparado.

### Added

- **Copiloto de Vendas (`src/features/copilot/`)** — superfície de orientação privada ao vendedor na tela de atendimento, em três variantes (faixa sobre o campo de digitação, card no topo da conversa, aba na Ficha do cliente). Recolhida no estado normal e com expansão automática em alertas de alta severidade.
- **Briefing e resumo reaproveitados** — o briefing reflete a Ficha do cliente e o resumo reflete o escalonamento do SDR, sem recomputar nem duplicar dados.
- **Sugestões por regra determinística** — três regras prontas: prazo perguntado sem resposta (alerta), pedido de NF em nome de empresa para cadastro B2C (ação) e cliente dormente com intenção de compra (oportunidade). Cada sugestão pode ser dispensada.
- **Posicionamento configurável na plataforma** — em Configurações › Copiloto, cada usuário escolhe onde o copiloto aparece (faixa, card ou aba); a preferência é salva no navegador e aplicada na hora, sem recarregar. O parâmetro de build `VITE_COPILOT_PLACEMENT` passa a ser apenas o default de fábrica.
- **Botão "Gerar resposta" preparado** — presente porém inerte, reservando o lugar da geração por IA da Fase 2.

### Changed

- **Tela de atendimento** — passa a montar a superfície do copiloto conforme a variante ativa; o campo de digitação aceita rascunho controlado para receber a resposta sugerida.

## [0.55.0] — Chime · 2026-05-31

A Central de Notificações ganha rosto. O sino do topo passa a mostrar notificações reais com contagem de não lidas e um preview; uma página dedicada reúne tudo com dois layouts (Painel e Lista), filtros e estados; o usuário escolhe por quais canais recebe cada tipo de aviso numa matriz de preferências; e o cliente ganha sua própria central e preferências na loja. Consome a fundação Herald (0.54.0) sem alterá-la.

### Added

- **Sino e preview de notificações** — o sino do topo mostra a contagem de não lidas (com destaque visual e leitura por leitores de tela) e um preview com as últimas notificações agrupadas, com "marcar todas como lidas" e atalho para a central.
- **Central de Notificações (`/app/notificacoes`)** — página dedicada com dois layouts alternáveis (Painel com trilha lateral / Lista com barra horizontal, preferência lembrada), filtros por status, categoria e severidade sincronizados na URL, agrupamento de notificações relacionadas, paginação e estados de carregamento, vazio e erro.
- **Matriz de preferências por canal e categoria** — o usuário decide por quais canais (in-app, toast) recebe cada categoria; os canais externos (e-mail, WhatsApp, SMS, push) aparecem preparados para a Onda 8; avisos críticos permanecem sempre ativos. Em Configurações › Notificações.
- **Portal de notificações do cliente** — o cliente tem sua própria central (`/loja/conta/notificacoes`) e preferências (`/loja/conta/preferencias`) na loja, com tom comercial.
- **Tokens de severidade dedicados** — escala de cor de severidade (informação, sucesso, atenção, crítico) constante nos quatro temas, com contraste adequado em claro e escuro.

### Changed

- **Sino do topo** — substitui o preview estático por notificações reais vindas da fundação.
- **Alertas do Painel do Gestor** — a lista de alertas ativos passa a consumir a Central de Notificações; "Dispensar" arquiva o alerta, sem armazenamento local próprio.

## [0.54.0] — Herald · 2026-05-31

Fundação do sistema de notificações — a base invisível que vai alimentar a Central de Notificações e as preferências (em breve, no próximo release). Os eventos do dia a dia da plataforma passam a ser transformados em notificações por destinatário, com canais, preferências e condições derivadas. Sem mudança visível ainda — é a fundação sobre a qual a interface será construída.

### Added

- **Fundação de notificações (infraestrutura)** — modelo de dados único, barramento de eventos, roteamento por regras e preferências por destinatário, persistência via Provider Pattern e canais de entrega (in-app e toast ativos; e-mail, WhatsApp, SMS e push já preparados para a Onda 8). Base da Central de Notificações que chega no próximo release.
- **Reconciliador de condições derivadas** — os alertas do Painel do Gestor (cliente A dormente, vendedor sobrecarregado, conversa sem resposta) agora também alimentam notificações, a partir de uma lógica de condição compartilhada e única.

## [0.53.0] — Dossier · 2026-05-31

### Added

- Ficha de **Orçamento** e **Pedido** com 3 visualizações selecionáveis — **Cockpit** (padrão), **Operacional** e **Documento** — alternáveis por um seletor no cabeçalho, com preferência lembrada por página.
- Faixa de KPIs e trilho lateral fixo (resumo, cliente, ações) nas fichas de Orçamento e Pedido.
- Stepper de status no layout Operacional (rascunho→convertido / aguardando pagamento→concluído), com estados terminais para recusado/expirado/cancelado/devolvido.
- Framework compartilhado `src/shared/detail-views/` (config de layout, hook de persistência, seletor, faixa de KPIs, stepper, blocos de resumo/cliente/histórico e shells de layout).

### Changed

- Páginas de detalhe de Orçamento e Pedido passam a usar layout amplo (até 1600px) em vez da coluna central estreita, eliminando o desperdício de espaço lateral.

## [0.52.0] — Ledger · 2026-05-30

### Added

- Listas de Orçamentos e Pedidos com **3 visualizações selecionáveis** (Cockpit, Console, Linhas), seletor segmentado no cabeçalho e preferência lembrada por lista.
- Faixa de **KPIs** nas listas — Orçamentos (em aberto, convertido, conversão, ticket médio, expirando ≤3d) e Pedidos (valor total, recebido, a receber, a expedir, vencidos).
- **Abas de status** com contagem em ambas as listas.

### Changed

- A tabela de orçamentos agora é **fluida** (ocupa a largura disponível) em vez de largura fixa.
- O filtro de status passou de popover para **abas**; os demais filtros foram mantidos.

## [0.51.0] — Cockpit · 2026-05-30

Redesenho da página de detalhamento do veículo: largura ampla (1600px), faixa de indicadores no topo e três modos de visualização que o usuário escolhe (Saúde, Trilhos e Bento), além de novos blocos de inteligência.

### Added

- **Três modos de layout no detalhe do veículo** — seletor no cabeçalho alterna entre **Saúde** (padrão), **Trilhos** e **Bento**; a preferência é lembrada para todos os veículos.
- **Faixa de indicadores** — KM atual, próxima manutenção, manutenções vencidas, última visita e uso (km/ano).
- **Saúde do veículo** — medidor visual consolidando o estado das manutenções (em dia / atenção / vencido).
- **Evolução de KM** — gráfico da quilometragem ao longo do tempo.
- **Frota do proprietário** — outras unidades do mesmo cliente, com atalho.
- **Peças mais trocadas** — ranking das peças mais frequentes no histórico.

### Changed

- **Detalhe do veículo em largura ampla (1600px)** — aproveita melhor telas largas e reorganiza o conteúdo em cards.
- **Histórico de manutenção** — resumo no painel principal com atalho para o histórico completo na área de abas.

## [0.50.0] — Lens · 2026-05-30

Melhorias de navegação e usabilidade nas listas de veículos e leads: a tela de veículos ganhou controle de colunas visíveis, redimensionamento e polimento geral da interface; os filtros de leads passaram a exibir dicas ao passar o mouse sobre cada botão.

### Added

- **Controle de colunas visíveis na lista de veículos** — novo botão de engrenagem no cabeçalho da tabela permite mostrar ou ocultar colunas individualmente; a preferência é salva e restaurada entre sessões. Também é possível abrir o menu com clique direito no cabeçalho da tabela.
- **Colunas redimensionáveis na lista de veículos** — cada coluna pode ter sua largura ajustada arrastando a borda; o tamanho é salvo entre sessões e há um mínimo garantido para não comprometer a legibilidade.
- **Dicas nos botões de filtro da lista de leads** — ao passar o mouse sobre qualquer botão de filtro (temperatura, origem, vendedor, próxima ação, criado em, valor estimado, loja, incluir perdidos/convertidos), uma dica explica o que aquele filtro faz; padrão já aplicado nas listas de clientes e veículos.

### Changed

- **Cabeçalho da lista de veículos consolidado** — título, filtros, busca e botão de cadastro ficam agora em uma única linha, deixando a tela mais compacta e consistente com as demais listas.
- **Campo de busca da lista de veículos** — o campo se expande ao receber o foco, aceita o atalho "/" para ativação rápida e Escape para sair, com ícone de teclado como dica visual.
- **Paginação da lista de veículos mais compacta** — barra de paginação com altura reduzida, alinhada ao padrão da lista de clientes.
- **Listras alternadas e divisores no cabeçalho da tabela de veículos** — linhas com fundo alternado facilitam a leitura em tabelas longas; divisores verticais no cabeçalho melhoram a distinção entre colunas.

## [0.49.2] — Spotlight · 2026-05-30

### Fixed

- **Botão de transferência de vendedor no detalhe do cliente** — o botão (ícone ↔ ao lado de "Vendedor responsável") não fazia nada: navegava para uma rota inexistente (`/app/carteiras`, no plural) com um cast que silenciava o erro de tipo do roteador. Agora abre o modal de transferência individual (vendedor de destino + motivo), o mesmo já usado no menu do cabeçalho.
- **Detalhe do cliente não refletia a nova carteira após transferir** — as mutações de transferência passam a invalidar também a query `customer-profile`, então o vendedor responsável é atualizado na hora em todas as telas (criação, reversão e expiração de transferências).

## [0.49.1] — Spotlight · 2026-05-30

### Fixed

- **Dupla barra de rolagem na página de detalhe do veículo** — removido contêiner de scroll redundante que gerava duas barras verticais simultâneas na tela de detalhe do veículo (mesmo ajuste já aplicado na tela de clientes).

## [0.49.0] — Spotlight · 2026-05-30

Página dedicada ao detalhamento do cliente: ao clicar no nome de um cliente na lista, agora abre uma tela completa com gráfico de evolução de compras, linha do tempo de relacionamento, pendências acionáveis e todas as informações em formato amplo. O painel lateral de consulta rápida foi preservado — aparece ao clicar no restante da linha e ganhou botão de fechar e animação de entrada.

### Added

- **Página dedicada do cliente** — clicar no nome na lista abre `/app/clientes/:id` em largura total (1600px), com faixa de KPIs (ticket médio, LTV, recência, frequência e curva ABC), gráfico de evolução de compras dos últimos 12 meses, linha do tempo de relacionamento e painel de pendências acionáveis (orçamentos abertos, veículos a aprovar, recomendações e recompra atrasada) — cada item com link direto para a aba correspondente.
- **Botão "expandir" no painel lateral** — ícone no cabeçalho do painel de consulta rápida que abre a página dedicada sem precisar voltar à lista.
- **Botão de fechar o painel lateral** — X no canto superior direito do painel; fechar retorna a lista para largura total.
- **Animação de entrada no painel lateral** — o painel desliza da direita para a esquerda ao abrir.

### Changed

- **Lista começa com painel fechado** — ao entrar em `/app/clientes`, o painel lateral não é mais restaurado automaticamente; filtros, ordenação e paginação continuam sendo lembrados.
- **Colunas da lista em largura total** — enquanto nenhum cliente estiver selecionado, a tabela ocupa 100% da largura disponível.
- **Visão geral da página dedicada em 2 colunas** — na tela dedicada, os dados cadastrais e o status/carteira ficam lado a lado; o card de métricas é ocultado (os KPIs já aparecem na faixa no topo).

### Fixed

- **Dupla barra de rolagem na página dedicada** — removido contêiner de scroll redundante que gerava duas barras verticais simultâneas.
- **Painel lateral não restaurava cliente salvo incorretamente** — o `?selected=` deixou de ser persistido no localStorage; links diretos com esse parâmetro ainda funcionam.

## [0.48.0] — Polish · 2026-05-29

Release de refinamento amplo de UX sobre as entregas recentes: o gráfico de evolução de vendas, o Portal B2B do cliente, a configuração da loja virtual, as metas em lote e as notificações de e-commerce a vendedores ganharam melhorias de exibição e comportamento, além dos ajustes finais na tela de login.

### Changed

- **Gráfico de evolução de vendas mais informativo** — a curva de evolução do mês passa a destacar os indicadores de "esperado para hoje" e "% da meta já realizada", traz a linha comparativa do mesmo período do ano anterior e permite acompanhar a evolução individual por vendedor, deixando a leitura da trajetória do mês mais clara.
- **Portal B2B do cliente mais consistente** — diversos refinamentos visuais e de comportamento nas telas do portal: início, análises, lista e detalhe de pedidos, nova solicitação, perfil, faturamento, frota e suporte.
- **Configuração da loja virtual reorganizada** — a tela de configuração da loja passa a separar as opções em seções claras (destaque principal, categorias, produtos em destaque, páginas de categoria e promoções), facilitando a edição.
- **Metas em lote — exibição de período** — ajustes na apresentação de mês/ano e no preenchimento das metas anuais lançadas em lote.
- **Notificações de e-commerce a vendedores** — a distribuição de pedidos vindos da loja prioriza vendedores ativos com menos pedidos em aberto, e as mensagens automáticas passam a variar conforme o status do pedido (enviado, em separação, etc.).
- **Tela de login mais enxuta** — cartões de perfil de demonstração mais compactos, divisão equilibrada em 50/50 entre o painel de marca e o formulário, barra de rolagem oculta e remoção do subtítulo de demonstração.

## [0.47.0] — Podium · 2026-05-28

Oitava entrega do **Bloco 5** com a aba "Vendedores" completa em Análise de Vendas (leaderboard com pódio, ranking ranqueável, gaveta de detalhe individual com gráfico de evolução) e a redesign da tela de login com painel de marca animado e perfis de demonstração agrupados por função.

### Added

- **Aba "Vendedores" em Análise de Vendas** — nova aba dedicada ao ranking e detalhamento individual de vendedores na tela `/app/gestao/vendas`: pódio animado dos 3 primeiros (visível quando há ≥ 4 vendedores), lista ranqueada com barra de progresso da meta (cores por faixa de atingimento), tendência vs. mês anterior e botão de detalhamento.
- **Gaveta de detalhe do vendedor** — ao clicar em qualquer vendedor, abre uma gaveta lateral com todas as métricas do período (valor vendido, meta, previsão, pedidos, ticket médio, clientes positivados, orçamentos em aberto) mais gráfico de evolução cumulativa individual.
- **Seletor de métrica de ranqueamento** — segmented control no topo da aba permite reordenar o ranking por: valor vendido, % da meta, nº de pedidos ou ticket médio.
- **Visão em tabela densa** — botão "Ver como tabela" alterna o leaderboard para uma tabela premium com todos os dados lado a lado e linha de totais.
- **RBAC na aba Vendedores** — Owner e Gestor veem o ranking completo; Vendedor vê apenas a própria posição e métricas (sem expor colegas); demais perfis não veem a aba.
- **Login redesenhado** — nova tela de acesso com painel lateral animado exibindo a identidade visual GALLO (3 variantes de animação), perfis de demonstração agrupados por função (Gestão, Comercial, Financeiro, Operações) e botão de seleção de perfil acessível com teclado.

### Fixed

- **Gaveta do vendedor impossível de fechar (perfil Vendedor)** — quando um usuário com papel de Vendedor abria a aba, a gaveta de detalhe abria automaticamente e não permitia ser fechada, pois o estado era atrelado ao parâmetro de URL de filtro de vendedor. O estado da gaveta agora é local ao componente e fecha corretamente.
- **Tela em branco ao acessar `?aba=sellers` sem permissão** — navegar diretamente para a aba de Vendedores com um perfil sem acesso (ex.: Financeiro) gerava tela em branco; agora redireciona automaticamente para a aba "Visão geral".

### Changed

- **Acessibilidade no login** — erro de autenticação passa a usar `role="alert"` para leitura imediata por leitores de tela.

## [0.46.0] — Treasury · 2026-05-28

Recuperação das duas features financeiras que ficaram sem PRD durante a renumeração do Bloco 4b (originalmente planejadas como slots 050/051), agora entregues como PRD-054 e PRD-055. A DRE passa a usar despesas reais por competência.

### Added

- **Despesas (PRD-054)** — tela `/app/gestao/despesas` com livro-razão de despesas operacionais: lançamentos com dupla temporalidade (competência alimenta a DRE, pagamento alimenta o Fluxo de Caixa), 9 categorias mapeadas para as 3 linhas de despesa da DRE, KPIs (total/pagas/pendentes/atrasadas), 6 filtros com sincronização na URL e tabela paginada.
- **Despesas — recorrência** — despesas recorrentes (mensal/trimestral/anual) geram a série de lançamentos futuros; edição e cancelamento oferecem escopo "somente esta / esta e futuras / toda a série".
- **Despesas — ciclo de vida** — marcar como paga (com data e forma de pagamento), duplicar, cancelar e transição automática para "atrasado" via varredura diária de vencimentos.
- **Fluxo de Caixa (PRD-055)** — tela `/app/gestao/caixa` em regime de caixa: KPIs (saldo atual/entradas/saídas/saldo projetado), gráfico de evolução do saldo (realizado sólido + projetado tracejado, com linha de saldo mínimo), tabela de movimentações com link para a origem e filtros com sincronização na URL.
- **Fluxo de Caixa — projeção e alertas** — projeção determinística de contas a receber (pedidos pendentes) e a pagar (despesas/comissões pendentes); alertas de saldo abaixo do mínimo, projeção cruzando o mínimo e projeção negativa.
- **Fluxo de Caixa — lançamentos manuais** — aportes de capital e retiradas lançados diretamente no módulo.
- **Configuração financeira** — saldo inicial do caixa e alerta de saldo mínimo editáveis em Configurações → Financeiro.
- **RBAC** — novos recursos `expense` e `cashflow` (Owner e Financeiro com CRUD, Gestor somente leitura, Vendedor bloqueado).

### Changed

- **DRE Gerencial** — a linha "Despesas Operacionais" passou a agregar os lançamentos reais por competência (PRD-054), substituindo os valores fixos mockados do PRD-048; clicar na linha abre as despesas do período. Os valores fixos anteriores foram descontinuados e mantidos apenas como referência histórica, com aviso na configuração financeira.

### Fixed

- **Placeholders de Despesas e Fluxo de Caixa** — as telas referenciavam PRDs incorretos (050/051, que na verdade são Estoque-Análise e Atendimento-Análise); agora apontam para os PRDs corretos e estão implementadas.

## [0.45.1] — Gateway · 2026-05-28

Correções de lacunas de implementação identificadas pela auditoria dos PRDs 066, 067, 070 e 071: segurança, gráficos faltantes, filtros, service worker do PWA e qualidade geral das quatro features entregues na v0.45.0.

### Fixed

- **Portal B2B — faturamento bloqueado por permissão real**: a rota `/portal/faturamento` aceitava acesso via URL direta mesmo sem a permissão `canViewFinancial`; agora o guard de rota verifica a flag individual do usuário antes de carregar a página.
- **Portal B2B — análise de gastos completa**: a tela de análise exibia apenas 2 dos 4 gráficos previstos; foram adicionados "Gastos por categoria" e "Gastos por veículo" (dados reais) com drill-down — clicar em um veículo filtra a lista de pedidos.
- **Portal B2B — filtros na lista de pedidos**: a lista não tinha filtros; agora é possível filtrar por status de pagamento, período, valor mínimo, veículo de destino e comprador interno.
- **Portal B2B — empresas B2B com contrato real nos dados de demonstração**: as duas empresas com portal habilitado agora carregam contrato negociado (desconto, categorias especiais, limite de crédito), tornando o módulo de faturamento e a exibição de desconto no wizard de solicitação coerentes.
- **Portal B2B — audit de acesso a faturamento, login e logout**: eventos de autenticação e acesso à área sensível de faturamento agora são registrados no log de auditoria.
- **Portal B2B — desconto de contrato visível na solicitação**: o wizard de nova solicitação exibe o desconto negociado que será aplicado ao orçamento, com aviso de que catálogo completo chega na Fase 2.
- **Integração e-commerce — origem dos pedidos no Cockpit**: o KPI "Total de pedidos" do Cockpit Executivo agora exibe a distribuição por origem (WhatsApp/SDR, E-commerce, Portal B2B, Manual) em tooltip; o dado existia no hook mas não estava conectado à interface.
- **Integração e-commerce — botão "Abrir conversa" no alerta de novo pedido**: o toast que aparece para o vendedor ao receber um pedido via e-commerce agora inclui o botão "Abrir conversa" além do "Ver pedido", abrindo diretamente o canal de atendimento criado automaticamente.
- **Integração e-commerce — merge de compra como visitante com confirmação**: ao cadastrar uma conta com o mesmo e-mail ou CPF/CNPJ de uma compra feita como visitante, o sistema agora exibe o diálogo "Encontramos um pedido em seu nome — deseja vincular?" em vez de realizar o vínculo de forma silenciosa.
- **PWA Vendedor — service worker ativado**: o aplicativo PWA agora registra um service worker para cache de arquivos estáticos em produção, tornando a experiência instalável (critério de instalabilidade via navegador).
- **PWA Vendedor — aba "Conversas" na ficha do cliente**: a ficha resumida do cliente no PWA tinha 3 abas (Pedidos, Orçamentos, Veículos); foi adicionada a aba "Conversas" com o histórico de atendimentos do cliente.
- **PWA Vendedor — grade de calendário na agenda**: a tela de agenda exibia apenas listas agrupadas; agora mostra uma grade semanal com o número de visitas por dia antes das listas.
- **Admin Storefront — redirecionamento de link antigo de categorias**: o endereço `/app/configuracoes/storefront/categorias` não redirecionava; agora leva direto para a sub-aba "Categorias" no painel unificado.
- **Admin Storefront — sub-abas separadas Home / Categorias / Identidade**: o editor de conteúdo tinha "Home" e "Categorias" fundidos em uma única aba; agora são três abas distintas, mantendo um único rascunho compartilhado para salvar tudo de uma vez.
- **Admin Storefront — aviso ao sair com alterações não salvas**: navegar para outra aba enquanto há edições pendentes agora exibe um diálogo de confirmação antes de descartar as mudanças.
- **Admin Storefront — taxa de conversão entre etapas do funil**: o funil de conversão do e-commerce mostrava apenas valores absolutos; agora cada etapa exibe a porcentagem de conversão em relação à etapa anterior.

## [0.45.0] — Gateway · 2026-05-28

Sétima entrega do **Bloco 5 (E-commerce / Onda 3)** com quatro novas features de integração e dois cards do painel corrigidos: portal B2B corporativo, PWA para vendedores externos, painel unificado de e-commerce, integração e-commerce → central e correção dos widgets "Metas do mês" e "Saúde da carteira".

### Added

- **Portal B2B corporativo (PRD-071)** — rotas `/portal/*` com autenticação mock para clientes CNPJ: painel, pedidos, nova solicitação, analytics e faturamento; guard de sessão e i18n completos.
- **PWA para vendedor externo (PRD-070)** — progressive web app em `/pwa/*` para representantes em campo: início, agenda, clientes e perfil; service worker registrado e manifesto configurado.
- **Integração e-commerce → central (PRD-067)** — hooks de sincronização de pedidos e notificação aos vendedores responsáveis; widget de pedidos e-commerce no painel do gestor.
- **Painel unificado de e-commerce (PRD-066)** — área administrativa do storefront com abas de análise e conteúdo; estrutura de rota de configuração do storefront reestruturada.

### Fixed

- Cards **"Metas do mês"** e **"Saúde da carteira"** sem dados na tela inicial do gestor: o hook de metas lia o campo inexistente `.items` da resposta paginada (campo correto é `.data`), resultando em lista sempre vazia; o widget de carteira recriava a janela temporal a cada renderização com precisão de milissegundos, invalidando continuamente o cache de consultas e travando o indicador de carregamento.

## [0.44.0] — Passport · 2026-05-27

Sexta entrega do **Bloco 5 (E-commerce / Onda 3)** com o **PRD-065 — Conta do
Cliente**. Cria a área logada do storefront em `/loja/conta/*` com sistema de
autenticação mock **independente** do auth interno (PRD-006): login, cadastro
B2B/B2C, dashboard, histórico de pedidos e orçamentos, perfil, endereços
salvos e veículos da frota (B2B). A sessão persiste em Zustand + localStorage
(expiração de 30 dias) e a estrutura foi desenhada para troca drop-in por
Supabase Auth na Fase 2. O header da loja passa a exibir avatar + dropdown
quando logado, e o checkout (PRD-064) reconhece o cliente autenticado —
pré-popula a identificação e oferece endereços salvos para seleção.

### Added

- **Feature `storefront-account`** com páginas, hooks, store e i18n próprios:
  - `store/customerAuthStore.ts` — Zustand persistido (`gallo-storefront-
customer-auth`) com sessão, snapshot do `ICustomer` e endereços salvos
    multi-registro por cliente; seletor `selectIsCustomerAuthenticated` e
    `readCustomerSessionSync` para guards de rota.
  - `hooks/useCustomerAuth.ts` — `login` (busca `ICustomer` por e-mail no
    provider, aceita qualquer senha), `register` (cria `ICustomer` B2B/B2C +
    login automático, bloqueia e-mail duplicado), `logout` e `updateProfile`,
    todos com audit log (`customer_signin`/`register`/`signout`/`update`).
  - `pages/LoginPage.tsx` — formulário e-mail/senha, link recuperar senha,
    "continuar como visitante" e banner de modo demonstração.
  - `pages/RegisterPage.tsx` — toggle B2B/B2C com campos condicionais,
    validação de CPF/CNPJ/e-mail/telefone/senha e checkbox LGPD obrigatório.
  - `pages/PasswordRecoveryPage.tsx` — placeholder com banner de demonstração
    e toast de instruções enviadas.
  - `pages/AccountDashboardPage.tsx` — saudação + cards de pedidos,
    orçamentos, perfil, endereços e veículos (B2B) com contagens.
  - `pages/AccountOrdersPage.tsx` — lista de pedidos do cliente com filtros
    (todos/em andamento/concluídos/cancelados) e `OrderStatusBadge`.
  - `pages/AccountOrderDetailPage.tsx` — detalhe simplificado com itens,
    endereço, pagamento, totais, **"Repetir pedido"** (adiciona itens ao
    carrinho) e **"Falar sobre este pedido"** (link WhatsApp).
  - `pages/AccountQuotesPage.tsx` + `AccountQuoteDetailPage.tsx` — histórico
    de orçamentos e detalhe com **aceite** (status `aceito` → cria pedido via
    `createOrderFromQuote`, origin `ecommerce`).
  - `pages/AccountProfilePage.tsx` — edição de dados (condicional B2B/B2C),
    troca de senha mock e preferência de newsletter (placeholder).
  - `pages/AccountAddressesPage.tsx` + `AddressFormModal.tsx` — CRUD de
    endereços salvos com busca ViaCEP, marcar como padrão e remoção.
  - `pages/AccountVehiclesPage.tsx` — frota do cliente B2B reutilizando
    `NewVehicleModal`/`EditVehicleModal` do PRD-016 (B2C é redirecionado).
  - `components/AccountLayout.tsx` + `AccountSidebar.tsx` — shell sidebar +
    main responsivo (drawer no mobile) com navegação e logout.
  - `components/CustomerAccountMenu.tsx` — controle de sessão no header
    (avatar + dropdown logado; "Entrar" anônimo).
  - `guards.ts` — `requireCustomerSession` redireciona visitantes para
    `/loja/login?return=…`.
- **Rotas** `/loja/login`, `/loja/cadastro`, `/loja/recuperar-senha` e
  `/loja/conta/*` (dashboard, pedidos + detalhe, orçamentos + detalhe, perfil,
  endereços, veículos), com guard de sessão no layout `/loja/conta`.

### Changed

- **`StorefrontHeader`** (PRD-060) passa a consumir `CustomerAccountMenu`
  (sessão do cliente) no lugar do auth interno de staff.
- **Checkout (PRD-064)** integra a sessão do cliente:
  - `IdentificationStep` reconhece o cliente logado via `useCustomerAuth`,
    pré-popula identificação e vincula `customerId` ao pedido.
  - `AddressStep` lista endereços salvos do cliente para seleção rápida e
    persiste novos endereços quando "salvar para depois" está marcado.
  - `IRegisteredIdentity` ganha `customerId`; `createOrderFromCart` passa a
    anexar o pedido ao `ICustomer` existente em vez de criar visitante.

## [0.43.0] — Checkout · 2026-05-27

Quinta entrega do **Bloco 5 (E-commerce / Onda 3)** com o **PRD-064 —
Carrinho e Checkout**. Fecha o ciclo de compra do storefront: a página
`/loja/carrinho` deixa de ser placeholder e ganha edição inline + cálculo de
frete via ViaCEP/PRD-033; o `/loja/checkout` ganha wizard de 3 passos
(identificação → endereço → pagamento + revisão) com guest checkout, máscaras
de CPF/CNPJ/telefone e validação por etapa; o pedido é materializado por
`createOrderFromCart` (origin `ecommerce`, snapshots de preço, distribuição
round-robin), o carrinho é limpo e o cliente cai em
`/loja/pedido-confirmado/:orderId` com resumo completo. O header passa a
expor mini-preview do carrinho via popover.

### Added

- **Feature `storefront-cart`** com páginas, hooks e i18n próprios:
  - `pages/CartPage.tsx` — layout 2 colunas com resumo sticky no desktop,
    sticky-bottom CTA no mobile, lista editável (qty stepper + remover) e
    botão "Continuar comprando".
  - `pages/CheckoutPage.tsx` — wizard 3 passos com `CheckoutStepper`,
    navegação validada por etapa e submissão final via `createOrderFromCart`.
  - `pages/OrderConfirmedPage.tsx` — sucesso com número do pedido, resumo
    completo, CTAs para `/loja/conta` + `/loja` e banner de modo
    demonstração.

- **Componentes** (`src/features/storefront-cart/components/`):
  - `CartItemRow` — hidrata thumbnail/categoria contra o catálogo vivo,
    clampa quantidade pelo estoque, badge "Sem estoque" quando aplicável,
    link para a ficha em PRD-063.
  - `CartSummary` — subtotal/frete/total, calculadora de CEP integrada,
    placeholder de cupom desabilitado com tooltip.
  - `CartEmpty` — estado vazio com CTA para a vitrine.
  - `CartMiniPreview` — popover do header listando até 3 itens (sort por
    `addedAt` desc), subtotal e CTA "Ver carrinho completo".
  - `checkout/CheckoutStepper` — indicador 1·2·3 com tick verde nos passos
    concluídos.
  - `checkout/IdentificationStep` — auto-confirma para usuários logados;
    para visitantes: escolha entre login (PRD-065) e formulário guest com
    máscaras de CPF/CNPJ, validação de email e telefone (10/11 dígitos).
  - `checkout/AddressStep` — busca ViaCEP com fallback manual, "salvar
    endereço" disabled para guests com tooltip.
  - `checkout/PaymentStep` — radio com 3 métodos placeholder (PIX, Boleto,
    Cartão) + bloco de revisão final consolidando identidade, endereço,
    forma de pagamento, itens e totais.

- **Hooks** (`src/features/storefront-cart/hooks/`):
  - `useCheckoutState` — máquina de 3 passos com `canAdvance` por etapa.
  - `useCartShipping` — combina `useViaCep` + `calculateShipping` (PRD-033)
    - `IPlatformSettings.shipping` para retornar valor numérico ou
      "a combinar".
  - `useCartValidation` — fingerprint-based: ao mutar o carrinho ou
    chegar com itens persistidos, valida cada linha contra o catálogo,
    remove peças inativas/zeradas e clampa quantidades acima do estoque,
    com toasts informativos.
  - `useViaCep` — wrapper sobre o endpoint público da ViaCEP com máscara
    `00000-000` e validação de formato.

- **Engine de pedido** (`src/features/orders/api/createOrderFromCart.ts`):
  - Snapshots de preço/SKU/nome no momento da venda + cálculo de margem
    estimada (custo presumido 70% do preço quando não houver `unitCost`).
  - `origin = "ecommerce"`, `paymentStatus = "pendente"`,
    `fulfillmentStatus = "pendente"`.
  - Cria placeholder `ICustomerB2C`/`B2B` para guests (com `tags: ['ecommerce', 'visitante']`).
  - Distribuição round-robin entre vendedores ativos (placeholder PRD-013).
  - `composeOrderPaymentCondition` reaproveitado do PRD-032.
  - Audit log de `order_create` e `customer_create` (para guests).

- **Mini-preview no `StorefrontHeader`**: o botão de carrinho vira `Popover`
  exibindo os 3 últimos itens + subtotal + CTA "Ver carrinho completo".

- **Persistência cross-session**: `useCartStore.addItem` carimba `addedAt`
  na primeira inserção do item; mini-preview ordena por esse timestamp
  para mostrar os adicionados mais recentemente no topo.

### Changed

- `src/routes/loja.carrinho.tsx`, `loja.checkout.tsx` e
  `loja.pedido-confirmado.$orderId.tsx` deixam de ser placeholders / com
  `requireAuth` e passam a montar as páginas reais. O guard de
  autenticação foi removido do checkout porque o PRD prevê guest checkout.
- `ICartItem` ganha o campo opcional `addedAt: ISO8601` (não-quebra de
  retro-compatibilidade — default no insert).
- `StorefrontHeader` substituiu o `Button asChild → Link` do carrinho por
  um `Popover` envolvendo o mesmo `Link` no item primário, mantendo o badge
  numérico e o `aria-label`.

### Notes

- Toda a infraestrutura de pagamento é declaradamente placeholder no MVP:
  banners "Modo demonstração" no passo 3 e na confirmação tornam isso
  explícito ao cliente.
- O cálculo de frete usa o `IShippingConfig` salvo em
  `IPlatformSettings.shipping`; quando não há configuração ou regra
  aplicável, exibe "a combinar" sem bloquear o checkout.
- O round-robin de vendedores é simplificado (sort por id ascendente);
  trocar pelo motor real do PRD-013 é uma substituição de uma função no
  arquivo `createOrderFromCart.ts`.
- A página de carrinho redireciona automaticamente o `/loja/checkout` para
  o carrinho se o usuário entrar sem itens.

## [0.42.0] — Showcase · 2026-05-27

Quarta entrega do **Bloco 5 (E-commerce / Onda 3)** com o **PRD-063 — Ficha
do Produto**. A rota `/loja/produto/:slug` deixa de ser placeholder e ganha
ficha completa otimizada para conversão B2B: galeria com lightbox, header
comercial (badges, OEM, preço, indicador de estoque, seletor de quantidade,
CTA de carrinho com transição "Ver carrinho" por 3,5s, share WhatsApp e copy
link), três abas (Aplicações com filtro inline de compatibilidade, Equivalências
com cálculo de % de economia, Especificações com ficha técnica + garantia +
FAQ placeholder), grade de produtos relacionados (4 itens com algoritmo
categoria + sobreposição de aplicações), barra sticky de adicionar ao carrinho
no mobile, 404 amigável e SEO rico com microdata schema.org/Product
(`name`, `brand`, `mpn`, `sku`, `offers`, `priceCurrency`, `availability`).

### Added

- **`ProductDetailPage`** (`/loja/produto/:slug`):
  - Layout 2 colunas (galeria + info) → stack em mobile.
  - Esqueleto enquanto carrega; `ProductNotFound` em ID inválido (próprio SEO).
  - `useSeoMeta` dinâmico: título com OEM + descrição com categoria, marcas
    compatíveis e estoque.

- **Componentes** (`src/features/storefront-product/components/`):
  - `ProductGallery` — imagem placeholder única + thumbnail + lightbox via
    `Dialog` (estrutura preparada para múltiplas imagens na Fase 2).
  - `ProductInfo` — badges (Original/Equivalente + categoria + subcategoria),
    preço, indicador de estoque tricolor, qty stepper clampado pelo estoque,
    CTAs de carrinho/WhatsApp/copy link, microdata schema.org/Product +
    schema.org/Offer embutido no JSX (`itemScope` / `itemProp`).
  - `ProductTabs` — três abas com defaultValue `applications`.
  - `ApplicationsTab` — `IApplication[]` agrupado por marca; filtro inline
    Marca → Modelo → Ano cascateado a partir das próprias aplicações da peça;
    aplica destaque verde + badge `✓ Compatível` na linha matching e aviso
    âmbar quando o veículo informado não tem aplicação.
  - `EquivalentsTab` — consulta `partsProvider.listEquivalents(partId)`;
    cada item exibe imagem, badge Original/Equivalente, OEM, preço, badge de
    `Economia de X%` / `X% mais caro` / `Mesmo preço`, e link para a ficha
    da equivalente.
  - `SpecificationsTab` — tabela de specs (categoria, subcategoria, marca,
    fornecedor, SKU, divisão), códigos OEM alternativos em chips, descrição
    completa, texto institucional de garantia + FAQ placeholder.
  - `RelatedProducts` — 4 cards reusando `<ProductCard>` do PRD-061.
  - `ProductBreadcrumbs` — `Home > [Categoria] > [Produto]` (compactado em
    mobile como back link para a categoria).
  - `StickyMobileBar` — barra inferior mobile-only com preço + CTA de
    carrinho espelhando o fluxo do `ProductInfo`.
  - `ProductNotFound` — 404 amigável com CTAs para loja e busca.

- **Hook `useRelatedProducts`** — ranking em 3 tiers (mesma categoria +
  sobreposição de marca de veículo → mesma categoria → mesmo prefixo OEM),
  limitando a 4 itens e excluindo a própria peça.

- **i18n PT-BR completa** (`src/features/storefront-product/i18n/pt-BR.ts`)
  com 50+ strings cobrindo breadcrumbs, info, estoque, qty, CTAs, toasts,
  abas, filtro de compatibilidade, equivalências, specs, FAQ, 404 e galeria.

### Changed

- `loja.produto.$slug.tsx` deixa de renderizar `PlaceholderPage` e passa a
  montar `ProductDetailPage`. O nome do parâmetro permanece `slug` por
  compatibilidade com o `ProductCard` do PRD-061, mas carrega o `IPart.id`
  diretamente — o slug "humano" é um trabalho de Fase 2 alongside SSR.

### Notes

- Schema.org foi implementado via microdata HTML (em vez de JSON-LD) para
  não exigir um head manager — a estrutura fica no JSX, validável via
  Rich Results.
- O CTA "Ver carrinho" volta para "Adicionar" após 3,5s; o mini-preview
  flutuante é coberto pelo próprio toast (sonner) e pela atualização
  imediata do badge de quantidade no `StorefrontHeader`.
- O fluxo de estoque zerado bloqueia o botão principal, expõe um
  placeholder "Avise-me quando voltar" (desabilitado com tooltip) e um
  link de WhatsApp pré-preenchido para checar previsão.
- Para evitar ciclos entre os barrels de `storefront`, `storefront-search`
  e `storefront-category`, os hooks do `storefront` são importados via
  caminho direto (`@/features/storefront/hooks/...` e
  `@/features/storefront/store/cartStore`).

## [0.41.0] — Aisle · 2026-05-27

Terceira entrega do **Bloco 5 (E-commerce / Onda 3)** com o **PRD-062 —
Listagem por Categoria**. A rota `/loja/categoria/:slug` evolui do placeholder
para uma página rica: header com banner gradient + ícone, breadcrumbs, 6
filtros laterais focados, ordenações, paginação, drawer mobile, SEO dinâmico
por categoria e 404 amigável com sugestões. Além das categorias regulares, três
listas curadas entram em produção: `/loja/categoria/mais-vendidas` (ranking
por pedidos pagos dos últimos 90 dias), `/loja/categoria/novidades` (peças
recém-cadastradas) e `/loja/categoria/promocoes` (curadoria manual via
configuração da vitrine).

### Added

- **Slug mapping** (`storefront-category/data/slugs.ts`):
  - 10 categorias regulares com slugs amigáveis em português (`filtros`,
    `freios`, `correias`, `motor`, `embreagem`, `eletrica`, `transmissao`,
    `suspensao`, `arrefecimento`, `lubrificantes`).
  - 3 listas especiais: `mais-vendidas`, `novidades`, `promocoes`.
  - Fallback para o enum bruto do catálogo (ex.: `/loja/categoria/filtro`).
  - `resolveCategorySlug`, `iconForSlug`, `nameForSlug` expostos pelo barrel
    para reuso (config admin + cards da home já apontam para esses helpers).

- **Engine de listagem** (`useCategoryResults`):
  - Stage 1 — escopo por mapping (categoria, top-selling, newest,
    promoções com `manualPartIds`).
  - Stage 2 — filtros secundários aditivos (subcategoria, marca compatível,
    fabricante, tipo, faixa de preço, em estoque).
  - Stage 3 — ordenação + paginação de 24 itens/página.
  - `top-selling` busca pedidos pagos/parciais dos últimos 90 dias para
    rankear e só carrega quando o sort precisa.

- **URL sync** (`useCategoryFilters`):
  - 8 query params validados (`subcategoria`, `marca`, `fabricante`,
    `tipo`, `preco_min`, `preco_max`, `estoque`, `sort`, `page`).
  - `validateCategorySearch` é o `validateSearch` da rota — params inválidos
    são descartados em silêncio.

- **`CategoryListingPage`** (`/loja/categoria/:slug`):
  - Slug inválido → `InvalidCategoryFallback` com lista de categorias e
    listas especiais disponíveis (acessível via teclado + SEO próprio).
  - Header com gradient da submarca PARTS (azul para `novidades`, âmbar para
    `promocoes`), ícone Iconify e contador de produtos.
  - Breadcrumbs "Home > [Categoria]" (compactado em mobile).
  - Filtros laterais em desktop; drawer dedicado em mobile com badge de
    filtros ativos no botão de abertura.
  - Empty state contextual: sugere limpar filtros quando há filtros ativos,
    ou volta para a vitrine quando o escopo está vazio.
  - Banner amarelo de placeholder em `/loja/categoria/promocoes` quando o
    Owner ainda não selecionou itens.

- **Componentes**:
  - `CategoryHeader` — banner com gradient + descrição + contador.
  - `CategoryFilters` — sidebar com subcategoria (taxonomia do PRD-030 +
    união de subcategorias presentes no escopo para listas especiais),
    marca compatível, fabricante (multi-select), original/equivalente/ambos,
    faixa de preço e disponibilidade.
  - `CategoryMobileFiltersSheet` — drawer reutilizando o componente lateral.
  - `CategoryBreadcrumbs`, `CategoryPagination`, `CategoryEmptyState`.

- **SEO** dinâmico via `useSeoMeta`:
  - Title `"<Categoria> para Caminhão — Volvo, Scania, Mercedes e mais ·
GALLO PARTS"` para categorias regulares.
  - Title `"<Lista> · GALLO PARTS"` para listas especiais.
  - Description tomada do override do Owner ou da descrição padrão da
    categoria.

- **Configuração admin** (`/app/configuracoes/storefront`):
  - Nova seção "Páginas de categoria" com textarea de descrição por categoria
    e por lista especial.
  - Campo CSV para `promotionPartIds` que abastece
    `/loja/categoria/promocoes`.
  - Persistência via `IStorefrontConfig.categories` (novo campo opcional
    no tipo, default `[]`).

### Changed

- `IStorefrontConfig` ganha o campo opcional
  `categories: IStorefrontCategoryConfig[]` (slug + descrição opcional + IDs
  de promoção). Default seedado com array vazio para retro-compatibilidade.
- `loja.categoria.$slug.tsx` deixa de renderizar `PlaceholderPage` e passa
  a montar `CategoryListingPage` com `validateCategorySearch` no
  `validateSearch` da rota.

### Notes

- `ProductCard` e `useSeoMeta` foram reaproveitados sem duplicação (PRD-061
  e PRD-060 respectivamente). Para evitar ciclos de import entre os barrels
  de `storefront` e `storefront-category`, os hooks de leitura do storefront
  são importados via caminho direto (`@/features/storefront/hooks/...`).
- Filtro de subcategoria respeita a taxonomia declarada em
  `PART_CATEGORY_DESCRIPTORS` para categorias regulares; para listas
  especiais, deriva a união real das subcategorias presentes no escopo
  (oferece apenas opções com produtos).
- Engine de ordenação compartilha a lógica de `top-selling` com PRD-061
  (janela de 90 dias sobre pedidos pagos/parciais).

## [0.40.0] — Lighthouse · 2026-05-27

Segunda entrega do **Bloco 5 (E-commerce / Onda 3)** com o **PRD-061 — Busca
Avançada**. A rota `/loja/busca` evolui do placeholder para uma página completa
de catálogo público: input com auto-complete debounced, 6 filtros laterais
(incluindo identificação por veículo cascateada Marca → Modelo → Ano derivada
das aplicações reais do catálogo), 5 ordenações, paginação de 24 itens por
página, URL sync total, drawer de filtros no mobile e estado vazio com CTA
WhatsApp consumindo o telefone configurado em `IPlatformSettings.storefront`.

### Added

- **Engine de busca** (`useSearchResults`):
  - Reutiliza `findByOemCode`, `searchPartsByText` e
    `searchPartsByApplication` do PRD-030 (sem duplicação).
  - Combina veículo + texto + filtros sidebar de forma aditiva (AND).
  - Ordenação `top-selling` busca pedidos pagos dos últimos 90 dias para
    rankear; demais ordens são puras sobre o array filtrado.

- **URL sync completo** (`useSearchFilters`):
  - 12 query params validados (`q`, `marca`, `categoria`, `fabricante`,
    `tipo`, `preco_min`, `preco_max`, `estoque`, `veiculo_marca`,
    `veiculo_modelo`, `veiculo_ano`, `sort`, `page`).
  - Multi-select via CSV; reset clear all; setters dedicados por filtro.

- **Componentes** (`src/features/storefront-search/components/`):
  - `ProductCard` reutilizável (será consumido também pelo PRD-062 e a
    home PRD-060 quando precisar) com badge Original/Equivalente, OEM,
    StockBadge compacto, preço destacado e botão "Adicionar ao carrinho"
    integrado ao `useCartStore`.
  - `SearchHeader` com input grande, auto-complete dropdown (até 5
    produtos + 2 categorias + 1 marca) com debounce de 300ms via
    `useAutoComplete`.
  - `SearchFilters` (sidebar) com VehicleFilter destacado, radio de
    marca compatível, multi-select de categorias e fabricantes, radio
    de tipo (Original/Equivalente), range de preço, switch de estoque.
  - `VehicleFilter` cascateado derivado das aplicações reais (não usa
    catálogo de veículos hard-coded — sempre alinhado com peças que
    existem).
  - `MobileFiltersSheet` envolvendo os mesmos filtros num Sheet
    slide-from-left + botão "Ver resultados" com contagem.
  - `SearchPagination` com Anterior/Próxima e label "Página X de Y".
  - `EmptySearchState` com CTA WhatsApp dinâmico extraído da config da
    vitrine + sugestões inline (limpar filtros, buscar OEM).

- **Página `/loja/busca`** (`SearchResultsPage`) — orquestra tudo,
  injeta `useSeoMeta` com title dinâmico (`<query> — Busca · GALLO PARTS`)
  e renderiza grid responsivo 1/2/3 colunas.

- **Auto-complete** (`useAutoComplete`):
  - Debounce 300ms; ignora queries < 2 caracteres.
  - Mix: produtos (match em nome/SKU/OEM), categorias (PartCategory),
    marcas de veículo presentes no catálogo.
  - Click em produto navega para `/loja/produto/:slug`; em categoria
    aplica filtro; em marca seta `marca`.

### Changed

- `/loja/busca` deixa de ser placeholder — passa a usar
  `SearchResultsPage` com `validateSearch` do feature barrel.

### Compatibilidade Fase 2

- Engine puro (todas as funções de busca) — substituível por chamada a
  Postgres + RPC sem refatorar consumidores.
- `manualPartIds` da home (PRD-060) e o ProductCard compartilhado abrem
  caminho para PRD-062 (Listagem por categoria) reaproveitar 80% do código.

## [0.39.0] — Showcase · 2026-05-27

Início do **Bloco 5 (E-commerce / Onda 3)** com a entrega do **PRD-060 — Home /
Vitrine Pública**. A rota `/loja` ganha identidade visual própria da submarca
**PARTS** (verde dominante), hero impactante, header funcional (busca,
categorias, marcas, login, carrinho), seções de marcas atendidas, categorias
em destaque com contagem real do catálogo, 8 produtos em destaque (top vendidos
do PRD-041 ou seleção manual), bloco institucional e footer completo. Tudo
configurável em `/app/configuracoes/storefront` pelo Owner.

### Added

- **Tipos PRD-060** (`src/shared/types/storefront.ts`):
  - `IStorefrontConfig` agrupa hero, marcas, categorias em destaque,
    produtos em destaque, benefícios, sobre, footer e SEO.
  - `IStorefrontBrand`, `IStorefrontBenefit`.
  - `DEFAULT_STOREFRONT_CONFIG`, `DEFAULT_STOREFRONT_BRANDS`,
    `DEFAULT_STOREFRONT_BENEFITS` (sensitive defaults para a matriz).
  - Extensão de `IPlatformSettings` com `storefront`.

- **Cart store** (`src/features/storefront/store/cartStore.ts`):
  - Zustand `persist` em `localStorage` (`gallo-storefront-cart`).
  - `addItem` deduplica por `partId`; `setQuantity`, `removeItem`, `clear`.
  - Seletores `selectCartCount` e `selectCartSubtotal` consumidos pelo
    badge do header.

- **Hooks**
  - `useStorefrontSettings` — react-query sobre `IPlatformSettings.storefront`.
  - `useStorefrontTheme` — força `data-theme="parts"` no `<html>` enquanto
    o sub-app `/loja` está montado; reverte ao desmontar.
  - `useSeoMeta` — sincroniza `document.title`, `meta[name=description]`,
    Open Graph tags; restaura valores no unmount.
  - `useFeaturedProducts` — modo `manual` ou `top-selling` (janela 90d),
    sempre devolve 8 cards (top-up com catálogo ativo quando faltar).

- **Componentes da vitrine** (`src/features/storefront/components/`)
  - `StorefrontHeader` sticky com busca, dropdown de categorias
    (PRD-030), dropdown de marcas, sessão (login/avatar) e carrinho com
    badge. Mobile: hambúrguer + barra de busca inferior fixa. Foco
    programático via `STOREFRONT_FOCUS_SEARCH_EVENT` (`dispatchFocusSearch()`).
  - `StorefrontHero` com headline, sub-headline configurável, 2 CTAs
    (busca + catálogo) e 3 indicadores de confiança; placeholder de
    iconografia quando não há imagem de fundo.
  - `StorefrontBrands` — 5 cards de marcas, click leva a
    `/loja/busca?marca=<slug>`.
  - `StorefrontCategories` — grid 6 categorias com contagem real
    extraída via `partsProvider`.
  - `StorefrontFeaturedProducts` — 8 cards responsivos (1/2/4 colunas)
    com badge contextual (Mais vendido / Novidade / Promoção).
  - `StorefrontWhyBuy`, `StorefrontAboutTeaser`, `StorefrontFooter`
    (contato, redes sociais, links institucionais, copyright).

- **Página `/loja`** (`StorefrontHomePage`):
  - Composição vertical das 6 seções + meta SEO via `useSeoMeta`.
  - `LojaLayout` agora consome a configuração via `useStorefrontSettings`
    e aplica tema PARTS automaticamente.

- **Configuração `/app/configuracoes/storefront`**
  (`StorefrontConfigPage`):
  - Editor por seção (hero, categorias em destaque, modo de produtos,
    benefícios, sobre, footer, SEO).
  - Save dispara audit `storefront_config_update` capturando before/after
    via `usePlatformSettings`.
  - Banner "E-commerce em modo demonstração — checkout real Fase 2".
  - Restrito ao Owner via `requireAuth` + verificação local.

- **Navegação**
  - `ROUTES.CONFIG_STOREFRONT` registrado.
  - Item "Vitrine pública" no grupo Administração do
    `SettingsLayout` (Owner).
  - Search-param validator em `/loja/busca` aceitando `q` e `marca`.

### Changed

- `LojaLayout` reescrito para usar os novos componentes
  `StorefrontHeader` / `StorefrontFooter` que consomem
  `IPlatformSettings.storefront`; tema PARTS aplicado on mount.
- `seedStore.ts` agora inclui `storefront: DEFAULT_STOREFRONT_CONFIG`.

### Removed

- `src/features/shell/components/LojaHeader.tsx` e
  `LojaFooter.tsx` (placeholders sem settings; substituídos pelos
  componentes definitivos em `src/features/storefront/`).

### Compatibilidade Fase 2

- Carrinho persistido em `localStorage` na Fase 1; Fase 2 sincronizará
  com o cliente autenticado no Supabase (mesma interface `useCartStore`).
- SEO é client-side; SSR/SSG na Fase 2 substituirá `useSeoMeta` por um
  head manager sem mudar a chamada nas páginas.

## [0.38.0] — Compass · 2026-05-27

Encerramento da **Onda 2** do MVP com a entrega do **PRD-053 — IA Analítica / Insights
Automáticos**. Hub `/app/insights` consolida padrões cross-PRD detectados por 12
heurísticas configuráveis (queda de margem, churn, vendedor/cliente em risco, produto em
declínio ou excesso, conversão SDR caindo, meta em risco, sobrecarga, oportunidades de
segmento, novos clientes A e recuperações). Interface preparada para drop-in de LLM real
na Fase 2 sem refatorar consumidores: o `detectInsights()` é função pura, basta substituir
sua implementação.

### Added

- **Tipos PRD-053** (`src/shared/types/insights.ts`):
  - `IInsight`, `InsightType`, `InsightPriority`, `InsightCategory` —
    insight com `context` expansível, `suggestedAction` para drill-down,
    `validUntil` para janela anti-recriação e metadata de dispensa
    (`dismissedBy`, `dismissedAt`, `dismissReason`).
  - `IInsightThresholds` + `DEFAULT_INSIGHT_THRESHOLDS` — 12 thresholds
    configuráveis por loja (frações decimais, dias, capital em R$).
  - Extensão de `IPlatformSettings` com `insightsEnabled` (toggle global) e
    `insightThresholds` (sliders editáveis em `/app/configuracoes/insights`).

- **Engine puro PRD-053**
  (`src/features/insights/engine/detectInsights.ts`):
  - 12 heurísticas independentes, cada uma com lógica e ID estável
    (`ins-<type>-<key>`) para que dispensas sobrevivam à recomputação:
    `margin_drop`, `churn_spike`, `seller_at_risk`, `customer_at_risk`,
    `product_decline`, `product_excess`, `sdr_conversion_drop`,
    `meta_at_risk`, `top_seller_overload`, `opportunity_segment`,
    `new_customer_winning`, `recovery_success`.
  - Compara janelas móveis de 30 dias contra o período anterior; usa
    `IOrderItem.marginValue` e `IPart.unitCost` para inferências
    financeiras sem reabrir bases.
  - Snapshot de `context` em cada insight (atual vs anterior, capital
    parado, dias sem compra…) — base para o accordion "Ver contexto" do
    card e para futuras explicações narrativas via LLM.

- **Hub `/app/insights`**
  (`src/features/insights/pages/InsightsHubPage.tsx`):
  - 4 KPIs (total, críticos, médios, oportunidades).
  - Filtros (categoria, prioridade, período de detecção, status) com
    URL sync via TanStack Router.
  - Lista priorizada (crítico > médio > oportunidade > info, depois
    detecção descendente) com cards que expõem badge de prioridade
    colorida, badge de categoria, timestamp relativo, contexto
    expansível e drill-down para o PRD relevante (rentabilidade, ABC,
    metas, catálogo, etc.).
  - Toggle Ativos / Dispensados — histórico de dispensa preserva
    snapshot do insight original.

- **Dismiss persistente**
  (`src/features/insights/store/dismissalsStore.ts`):
  - Zustand `persist` em `localStorage` (`gallo-insight-dismissals`).
  - Modal pede motivo opcional; dispensas registram audit log
    `insight_dismiss` com `reason` e `validUntil`.
  - Engine ignora insights dispensados enquanto `validUntil` está aberto
    — evita ruído sem perder controle do usuário (`isStillDismissed`).

- **Integrações cross-PRD**
  - `CriticalInsightsWidget` no PRD-014 (Painel Gestor) com top 5
    críticos e CTA "Ver todos".
  - `InsightsBanner` no PRD-040 (Cockpit Executivo) — banner topo
    contabilizando críticos ativos.
  - Hook `useInsightsDailyDetection(storeId)` exposto via barrel para
    qualquer surface consumir.

- **Configuração `/app/configuracoes/insights`**
  (`src/features/insights/pages/InsightsConfigPage.tsx`):
  - Toggle global `insightsEnabled` (Owner-only).
  - 12 sliders para thresholds de cada heurística com formatação
    contextual (percentual, dias, R$, número).
  - Banner informativo sobre LLM real na Fase 2.
  - Save dispara audit `insight_config_update` capturando before/after.

- **Permissões e navegação**
  - Novo resource RBAC `insight` (view/edit/delete) com matrix:
    Owner cross-store, Gestor por loja, Financeiro view por loja
    (mas o hub filtra para `category === "financeiro"`).
  - Vendedor / SDR / Cliente bloqueados via GuardedRoute.
  - Item "Insights" no grupo Gestão da sidebar (Owner/Gestor/Financeiro)
    e link em Configurações ▸ Administração.

### Changed

- `IPlatformSettings` agora carrega `insightsEnabled` e
  `insightThresholds` — seed da loja matriz inicializa com
  `DEFAULT_INSIGHT_THRESHOLDS` (sensibilidade média).
- Cockpit Executivo (PRD-040) reposiciona o banner de alertas
  pré-existente abaixo do novo banner de Insights.

### Compatibilidade Fase 2

- `detectInsights()` é função pura — substituir por chamada a Edge
  Function + LLM mantém a interface dos consumers (hook + widgets +
  hub) idêntica.
- IDs de insight estáveis (`ins-<type>-<key>`) garantem dedupe contra
  dispensas mesmo se o LLM reformular o título/descrição.

## [0.37.0] — Trail · 2026-05-27

Conclusão do **Bloco 4b** com a tela de **Movimentação de Estoque
(PRD-052)** — histórico cronológico de saídas e devoluções derivado
dos pedidos pagos, com placeholders coerentes para entradas, ajustes
e transferências (ativação na Fase 2 via integração DINTEC). Esqueleto
enxuto: ledger somente leitura, sem mutação de `stockQuantity`.

### Added

- **Tipos PRD-052** (`src/shared/types/inventory-movement.ts`):
  - `IInventoryMovement` — registro imutável de movimentação com
    snapshot de produto (`partName`, `partOemCode`), referência ao
    pedido de origem quando aplicável (`orderId`, `orderNumber`), loja,
    executante e timestamp.
  - `MovementType` — 5 tipos modelados: `saida_venda`, `devolucao`
    (reais no MVP), `entrada_compra`, `ajuste_inventario`,
    `transferencia_loja` (placeholders preparados para Fase 2).

- **Engine puro PRD-052**
  (`src/features/inventory-movement/engine/deriveInventoryMovements.ts`):
  - Para cada pedido com `paymentStatus` `pago`/`parcial`, gera uma
    `IInventoryMovement` `saida_venda` por item (quantidade negativa).
  - Para cada pedido com `fulfillmentStatus = devolvido`, gera uma
    `devolucao` por item (quantidade positiva, devolvendo estoque).
  - Não muta `IPart.stockAvailable` — o histórico é derivado e nunca
    persistido como fonte de verdade.
  - Ordenação cronológica reversa (mais recente primeiro).

- **Hook PRD-052**
  (`src/features/inventory-movement/hooks/useInventoryMovements.ts`):
  - Fan-out de `ordersProvider.list` por loja acessível quando o
    usuário tem visão multi-loja; carrega `parts` para enriquecer
    códigos OEM.
  - Filtragem in-memory por tipo, produto (SKU/OEM/nome/número de
    pedido), período (24h / 7d / 30d / 90d), responsável e loja.
  - KPIs: total de movimentações no recorte + soma do valor bruto
    das saídas reais.

- **Filtros URL-sync PRD-052**
  (`useInventoryMovementFilters` + `validateInventoryMovementSearch`):
  - 5 filtros refletidos em search params (`tipo`, `produto`,
    `periodo`, `responsavel`, `loja`) com validação por whitelist.
  - Reset de página automático ao trocar qualquer filtro; paginação
    persistida via `pagina`.

- **Página `/app/gestao/estoque-movimentacao`**
  (`src/features/inventory-movement/pages/InventoryMovementPage.tsx`):
  - Header com 5 filtros + botão "Nova movimentação manual"
    desabilitado com tooltip de Fase 2.
  - 4 KPIs no topo (2 reais — total e saídas R$ — + 2 placeholders
    com badge "Fase 2" para entradas e ajustes).
  - Tabela cronológica reversa (50 linhas/página) com 7 colunas:
    data/hora, tipo (badge colorido), produto + OEM, quantidade
    (vermelha em saída, verde em entrada), origem (link para pedido),
    executado por, notas.
  - Drill-downs: click no produto leva a `/app/catalogo/$id`; click
    em pedido leva a `/app/pedidos/$id`.
  - Permissões via `requireAuth({ resource: "inventory", action: "view" })`
    e fallback `EmptyState` para roles fora da matriz
    (Owner / Gestor / Financeiro). Vendedor, SDR e Cliente sem acesso.
  - Mobile responsivo com scroll horizontal na tabela.

- **i18n PRD-052**
  (`src/features/inventory-movement/i18n/pt-BR.ts`) — todos os
  textos em português brasileiro com acentuação UTF-8 correta.

- **Sidebar (`Gestão` → `Movimentação`)** — novo item com ícone
  `mdi:swap-vertical-variant` visível para Owner, Gestor e Financeiro.

- **Atalho "Ver movimentações"** no header da Análise de Estoque
  (`/app/gestao/estoque`) — drill-down direto da página de análise
  para o ledger cronológico.

- **Widget `RecentMovementsWidget`** na Visão Executiva
  (`/app/gestao`) — card com as 5 movimentações mais recentes (badge
  por tipo, nome do produto, responsável e tempo relativo), respeita
  o scope de loja do cockpit, link "Ver todas" no canto + click na
  quantidade leva ao pedido de origem.

### Changed

- `src/features/shell/config/routes.ts`: adicionada constante
  `GESTAO_ESTOQUE_MOVIMENTACAO`.
- `src/shared/types/index.ts`: re-exporta `IInventoryMovement` e
  `MovementType` no barrel público.
- `src/features/inventory-analytics/components/InventoryHeader.tsx`:
  header agora exibe link "Ver movimentações" antes do ícone
  `mdi:warehouse`.
- `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx`:
  novo widget adicionado à grade de widgets do cockpit.

---

## [0.36.0] — Pulse · 2026-05-27

Continuação do **Bloco 4b** com a **Análise Histórica de Atendimento
(PRD-051)** — visão estratégica de longo prazo, complementar ao PRD-014
(operacional tempo real). Evolução de TMA, TMR, taxa de resolução,
conversão pós-atendimento, distribuição por canal e análise de
motivos de escalação SDR. Inclui drill-down individual por vendedor
com comparativo contra a média da equipe.

### Added

- **Tipos PRD-051** (`src/shared/types/customer-service-analytics.ts`):
  - `ICustomerServiceMetrics` consolidado: totals, previous, byChannel,
    bySeller, trendMonthly (12m), trendDaily, escalations.
  - `ICustomerServiceKpis` reutilizável em diferentes recortes.
  - `IChannelServiceMetrics`, `ISellerServiceMetrics` (com
    `healthScore` 0..100 composto), `ICustomerServiceMonthlyPoint`,
    `ICustomerServiceDailyPoint`, `IEscalationBreakdown`.

- **Engine pura PRD-051**
  (`src/features/customer-service-analytics/engine/calculateCustomerServiceMetrics.ts`):
  - TMA = `lastMessageAt − createdAt` em conversas
    `resolvida`/`arquivada`.
  - TMR = primeira out-human (`seller` ou `sdr`) menos primeira
    inbound (`customer`).
  - resolutionRate = (resolvidas − escaladas) / total.
  - conversionRate = % de conversas cujo cliente teve pedido pago
    após `createdAt`.
  - Tendência mensal (12 meses) e diária (período corrente) +
    comparativo com mês imediatamente anterior.
  - Aggregations por canal (`whatsapp/phone/site/ecommerce/sdr`) e
    por vendedor com `healthScore` composto (50% resolução, 30%
    conversão, 20% TMR — onde TMR ≤5min vale 100 e ≥120min vale 0).
  - Breakdown de escalações por motivo (5 categorias do PRD-023) e
    por vendedor receptor.

- **Hook PRD-051**
  (`src/features/customer-service-analytics/hooks/useCustomerServiceMetrics.ts`):
  - Orquestra conversations + paid orders + escalations + sellers +
    messages (bulk via novo `IMessagesProvider.listForAnalytics`)
    sobre uma janela de 12 meses.
  - Aplica scope de vendedor antes de chamar o engine.
  - `useCsaFilters` URL-sincronizado (mês / vendedor / aba).

- **Página `/app/gestao/atendimento-analise`**
  (`src/features/customer-service-analytics/pages/CustomerServiceAnalyticsPage.tsx`):
  - Header com 2 filtros (mês de referência + vendedor).
  - 4 abas:
    - **Visão Geral** — 5 KPIs com Δ% vs período anterior + card NPS
      placeholder (Fase 2), LineChart TMA/TMR 12m, LineChart de
      volume diário.
    - **Por Canal** — BarChart de volume por canal + tabela com 6
      colunas (canal, volume, TMA, TMR, resolução, conversão).
    - **Por Vendedor** — tabela comparativa com `healthScore` em
      pill colorida (verde ≥80, amarelo ≥60, vermelho <60),
      vendedores abaixo da média destacados em `bg-warning/5`.
      Click leva ao drill-down individual.
    - **Escalações SDR** — total destacado + PieChart por motivo
      (consome `byReason` da engine) + lista lateral com clicks que
      levam ao Painel SDR (PRD-024) + ranking dos vendedores que
      mais receberam transferências.
  - Os 5 motivos do PRD-023 (`customer_requested`,
    `negotiation_detected`, `sdr_failed`, `complexity`,
    `out_of_scope`) recebem labels em PT-BR e cores semânticas.

- **Drill-down `/app/gestao/atendimento-analise/$sellerId`**
  (`SellerServicePage`) — 4 KPIs individuais, LineChart TMA/TMR
  12m do vendedor, comparativo com média de health score da equipe.

- **`IMessagesProvider.listForAnalytics`** — endpoint bulk introduzido
  para alimentar TMR sem N×fetch. Implementação mock acessa o store
  diretamente filtrando por `since`/`until`/`conversationIds`. Stub
  Supabase delega ao Fase 2 (PRD-100+).

- **RBAC PRD-051**
  (`src/features/rbac/permissions/resources.ts`, `matrix.ts`): novo
  resource `customer_service_analytics`. Owner — `view` global;
  Gestor — `view` da loja; Financeiro — `view` da loja; Vendedor /
  SDR / Cliente — sem acesso.

### Changed

- **Rota `/app/gestao/atendimento-analise`** — criada com layout
  pai (`Outlet`) + index page e route `$sellerId`. Guard por
  permissão `customer_service_analytics:view`.

- **`src/features/shell/config/routes.ts`** — adicionada constante
  `GESTAO_ATENDIMENTO_ANALISE`.

### Notes

- Diferenciação clara contra PRD-014 (operacional) e PRD-024 (SDR
  específico): este é estratégico/longitudinal.
- TMA só é computado em conversas resolvidas — métricas em aberto
  enviesariam a média para baixo.
- Quando o dataset mock não tem mensagens suficientes para uma
  conversa, TMR é tratado como ausente (não contribui para a
  média) — evita "0 min" enganoso.
- O bulk endpoint `listForAnalytics` é o vetor que viabilizará
  análise sobre milhares de conversas na Fase 2 (Postgres com
  índice composto sobre `conversation_id, sent_at`).

---

## [0.35.0] — Warehouse · 2026-05-27

Continuação do **Bloco 4b** com a **Análise de Estoque (PRD-050)** —
cobertura em dias, classificação XYZ por giro, status semântico
(`ok` / `baixo` / `critico` / `excesso`), sugestões de reposição com
quantidade ideal + custo estimado + rationale textual e identificação
de capital parado. Página com 4 abas (visão geral, críticos &
reposição com export CSV, análise XYZ Pareto-style, excesso &
capital). Estrutura preparada para integração com o ERP DINTEC na
Fase 2.

### Added

- **Tipos PRD-050** (`src/shared/types/inventory.ts`):
  - `IInventoryAnalysis` — snapshot por peça com estoque atual,
    consumo no período, cobertura em dias, curva (X/Y/Z), status,
    sugestão de reposição, capital amarrado.
  - `IInventoryReorderSuggestion` — quantidade sugerida, custo
    estimado e justificativa textual.
  - `IInventoryMetrics` — KPIs agregados (totalProducts, byStatus,
    byCurve, totalCapitalTied, capitalInExcess, costCoverage, listas
    de críticos / sugestões / excessos).
  - `IInventoryAnalysisSettings` (em
    `IPlatformSettings.inventoryAnalysisSettings`) — janela de
    consumo (default 90d), cobertura alvo (30d), limite de excesso
    (180d).

- **Engine pura PRD-050**
  (`src/features/inventory-analytics/engine/calculateInventoryAnalysis.ts`):
  - `calculateInventoryAnalysis(ctx)` — itera sobre peças ativas,
    indexa consumo via pedidos pagos no `paidAt`, calcula
    `coverageInDays = stock / avgDailyConsumption`, classifica curva
    XYZ via heurística (Z se sem venda há > 60d ou consumo zero,
    X se cobertura < 30d e consumo significativo, senão Y/Z) e
    determina status (`critico` se estoque 0 ou cobertura < 5d,
    `baixo` se abaixo do mínimo ou cobertura < 15d, `excesso` se
    curva Z com cobertura > `excessCoverageDays`).
  - `suggestReorder()` — calcula
    `max(stockMin, ceil(avgDaily × targetDays), 1)` com rationale em
    português para o tooltip.
  - `calculateInventoryMetrics(analyses)` — KPIs + listas ordenadas
    por urgência (críticos por consumo) ou por capital amarrado
    (excessos).

- **Hooks PRD-050**:
  - `useInventoryAnalysis(filters)` — orquestra parts + paid orders
    (janela calculada a partir das settings) + settings, executa o
    engine e devolve `analyses`, `filtered`, `metrics`,
    `filteredMetrics`, lista de marcas e parts brutos.
  - `useInventoryFilters()` — estado URL-sincronizado
    (aba / categoria / marca / status / curva) + `validateInventorySearch`.

- **Página `/app/gestao/estoque`**
  (`src/features/inventory-analytics/pages/InventoryAnalyticsPage.tsx`):
  - Header com 4 filtros (categoria / marca / status / curva).
  - 4 abas via `Tabs` (shadcn):
    - **Visão Geral** — 5 KPIs (total, OK, baixo/crítico, capital
      amarrado, capital em excesso), donut chart de distribuição
      por status, tabela top 20 ordenada por urgência.
    - **Críticos & Reposição** — tabela priorizada (críticos →
      baixos → consumo) com sugestão de quantidade + custo + curva
      - status, botão "Gerar lista de compras (CSV)" que baixa CSV
        básico + toast informando que a integração completa virá na
        Fase 2.
    - **Análise XYZ** — bar chart Pareto-style (% faturamento vs %
      estoque por classe) + 3 cards lado a lado listando os
      produtos top 10 de cada classe com cobertura e capital.
    - **Excesso & Capital** — destaque do capital em excesso +
      tabela com cobertura, dias sem venda, capital amarrado;
      sugestão textual de promoção/descontinuação.
  - `InventoryStatusBadge` + `InventoryCurveBadge` reutilizáveis.
  - Click em qualquer linha leva à ficha PRD-030 do produto.

- **Sub-rota `/app/configuracoes/estoque-analise`**
  (`src/features/inventory-analytics/pages/InventoryAnalysisConfigPage.tsx`):
  - Sliders + inputs para 3 valores configuráveis (janela de
    consumo, cobertura alvo, limite de excesso).
  - Banner explícito: "Integração com ERP DINTEC disponível na Fase
    2".
  - Save grava via
    `usePlatformSettings.update(..., "settings.inventory.update")`
    — audit log automático + invalidação `["inventory"]`.

- **RBAC PRD-050** (`src/features/rbac/permissions/resources.ts`,
  `matrix.ts`): novo resource `inventory`. Owner — `view + edit`
  global; Gestor — `view` da loja; Financeiro — `view` da loja;
  Vendedor / SDR / Cliente — sem acesso.

- **Menu de configurações** atualizado com item "Estoque (análise)"
  visível apenas para Owner.

### Changed

- **`IPlatformSettings.inventoryAnalysisSettings`** — novo bloco
  obrigatório com defaults `consumptionWindowDays=90`,
  `targetCoverageDays=30`, `excessCoverageDays=180`. SEED_STORE
  atualizado.

- **Rota `/app/gestao/estoque`** — placeholder do PRD-052
  substituído pela `InventoryAnalyticsPage` real, com
  `validateSearch` e guard por permissão `inventory:view`.

- **`src/features/shell/config/routes.ts`** — adicionada constante
  `CONFIG_ESTOQUE_ANALISE`.

### Notes

- Engine puro: processar ~120 peças sobre ~90 dias de pedidos pagos
  consome bem abaixo do orçamento RNF-001 (< 50ms na fixture mock).
- Cobertura é tratada com `Number.POSITIVE_INFINITY` quando não há
  consumo no período mas estoque > 0; UI renderiza como "∞".
- O detector de excesso exige **curva Z + cobertura acima do limite
  configurado** — evita marcar como excesso peças de alto giro com
  estoque alto temporariamente.
- O CSV exportado é UTF-8 com BOM e segue 10 colunas — funciona
  diretamente no Excel/Sheets sem ajuste.
- A rota PRD-052 (movimentação de estoque) ficará em endpoint
  separado quando for implementada — esta rota cobre apenas a
  análise.

---

## [0.34.0] — Compass · 2026-05-27

Continuação do **Bloco 4b** com a **Análise de Rentabilidade (PRD-049)** —
visão multidimensional de margem por produto, categoria, cliente e
vendedor. Engine puro com 4 reducers, página com 4 abas, KPIs por
dimensão, alertas inteligentes (margem negativa, cobertura, vendedor
fora da média), drill-downs cruzados para o catálogo (PRD-030) e ficha
de cliente (PRD-012). Reaproveita o `DREAlertsBanner` do PRD-048 para
consistência visual. Dados estratégicos — Vendedor / SDR / Cliente
bloqueados.

### Added

- **Engine pura PRD-049**
  (`src/features/profitability/engine/calculateProfitability.ts`):
  - `calculateProfitability(dimension, ctx)` dispatcher para as quatro
    dimensões (`product` / `category` / `customer` / `seller`).
  - Reducers dedicados (`profitabilityByProduct`,
    `profitabilityByCategory`, `profitabilityByCustomer`,
    `profitabilityBySeller`) — cada um agrega receita, custo, margem,
    cobertura, número de pedidos e classificação de saúde
    (`good` / `neutral` / `warning` / `critical`) sobre cada grupo.
  - `calculateCoverage(orders)` — % de itens com `unitCost > 0` +
    contagem absoluta de itens e peças sem custo.
  - `profitabilitySummary(ctx)` — KPIs consolidados (receita, custo,
    margem, % margem, cobertura, contagem de produtos negativos e
    "underperforming").
  - `classifyMargin(pct)` + thresholds configuráveis
    (`PROFITABILITY_THRESHOLDS = { good: 0.35, neutral: 0.25 }`).
  - Trata `unitCost = 0` como "sem custo": item não soma ao CMV e
    abate cobertura, o flag `costMissing` propaga até a UI.

- **Hooks PRD-049**:
  - `useProfitabilityData(filters)` — orquestra orders + parts +
    customers + sellers, aplica scope filters (vendedor + categoria +
    marca + período mensal), executa o engine para as 4 dimensões em
    um único pass, e também devolve `categoryRowsPrevious` para o
    delta vs mês anterior.
  - `useProfitabilityAlerts({ productRows, sellerRows, coverage })`
    — gera `IDREAlert[]` com 3 famílias: produtos negativos
    (critical), cobertura < 80% (warning, <60% critical), vendedor
    com margem abaixo de média - 1σ (warning).
  - `useProfitabilityFilters()` — estado de filtros URL-sincronizado
    (mes / vendedor / categoria / marca / aba / subfiltro de produto),
    com `validateProfitabilitySearch` para o `validateSearch` da rota.

- **Página `/app/gestao/rentabilidade`**
  (`src/features/profitability/pages/ProfitabilityPage.tsx`):
  - `ProfitabilityHeader` com 4 selects (período mensal anchor,
    vendedor, categoria, marca) e indicador de cobertura no banner
    `info`.
  - Banner de alertas (`DREAlertsBanner` reusado).
  - 4 abas via `Tabs` (shadcn):
    - **Por Produto** — 4 KPIs (margem média, cobertura, produtos
      negativos, top produto), pílulas de subfiltro
      (todos / margem negativa / sem custo) e tabela top 30 com
      `HealthBadge`. Click leva à ficha PRD-030.
    - **Por Categoria** — BarChart de margem média por categoria com
      cor por saúde + tabela com Δ vs mês anterior.
    - **Por Cliente** — tabela com badge ABC (A/B/C) + nome do
      vendedor + indicador de saúde + filtro "Apenas clientes com
      margem negativa". Click leva à ficha PRD-012.
    - **Por Vendedor** — tabela ordenada por margem com destaque
      `bg-warning/5` para vendedores abaixo da média + desconto
      médio aplicado.
  - Estado vazio (`pageEmptyTitle` / `pageEmptyDescription`) quando
    não há pedidos pagos no período.

- **`HealthBadge` reutilizável**
  (`src/features/profitability/components/HealthBadge.tsx`): badge ou
  dot compacto com classes coloridas por severidade — consumido por
  todas as quatro abas.

- **RBAC PRD-049**
  (`src/features/rbac/permissions/resources.ts`, `matrix.ts`): novo
  resource `profitability`. Owner — `view` global; Gestor — `view`
  da loja; Financeiro — `view` da loja; Vendedor / SDR / Cliente —
  sem acesso (redirecionados para `/sem-permissao`).

### Changed

- **Rota `/app/gestao/rentabilidade`** — placeholder do PRD-003
  substituído pela `ProfitabilityPage` real, com `validateSearch` e
  guard por permissão `profitability:view`.

### Notes

- Engine puro: rodar 4 reducers + cobertura + summary sobre ~120
  pedidos consome < 20ms na fixture mock.
- Cobertura de custo é declarada em banner permanente no header — Owner
  sabe explicitamente sobre que % dos itens a análise se baseia.
- O detector de vendedor fora da média usa média − 1σ: estatística
  estável mesmo com pequena equipe (≥ 2 vendedores).
- `DREAlertsBanner` reaproveitado de PRD-048 — mesmo tipo `IDREAlert`,
  mesma classe de severidade, consistência visual entre as duas telas
  do Bloco 4b.

---

## [0.33.0] — Ledger · 2026-05-27

Continuação do **Bloco 4b** com o **DRE Gerencial (PRD-048)** — projeção
financeira completa derivada dos pedidos pagos, comissões reais
(PRD-047), CMV estimado a partir do custo unitário do catálogo, despesas
fixas configuráveis e impostos. Tabela hierárquica com comparativos cross-
período (vs período anterior, vs mesmo período ano anterior), tendência
12 meses, composição de despesas, alertas inteligentes e drill-downs em
cada componente. Banner explícito reforça que a integração contábil
completa virá na Fase 2 — os valores fixos no MVP são estimativas.

### Added

- **Tipos PRD-048** (`src/shared/types/dre.ts`,
  `src/shared/types/platform.ts`):
  - `IDREPeriod` — estrutura clássica do DRE com 18 linhas (receita
    bruta, impostos, devoluções, receita líquida, CMV, margem bruta,
    despesas operacionais expansíveis em comissões + folha + aluguel +
    outros, resultado operacional, impostos sobre lucro, resultado
    líquido), todas com percentuais sobre receita líquida.
  - `IDREComparativeBlock` — bloco comparativo vinculado a um período
    base, carregando valores brutos + deltas (`IDREComparison`) por
    campo para alimentar as colunas comparativas.
  - `IDRETrendPoint` — ponto do gráfico de 12 meses (receita líquida,
    custos totais, resultado líquido).
  - `IDREAlert` + `DREAlertSeverity` — banners contextuais
    (`info` / `warning` / `critical`).
  - `IFinancialSettings` (em `IPlatformSettings.financialSettings`) —
    impostos sobre vendas / lucro (decimal) + despesas fixas mensais
    (folha, aluguel + infra, outros).

- **Engine pura PRD-048** (`src/features/dre/engine/calculateDRE.ts`):
  - `calculateDRE(start, end, ctx)` — projeta o DRE do período somando
    pedidos pagos (`paidAt` ∈ window), aplicando impostos sobre vendas,
    devoluções (`returnedAt` ∈ window), CMV via
    `sum(item.quantity * item.unitCost)`, comissões do PRD-047 (filtra
    por `period` em `YYYY-MM`, descarta `canceled` / `disputed`),
    despesas fixas, impostos sobre lucro (`max(0, op) * taxOnProfitPct`)
    e resultado líquido — com percentuais em todos os subtotais.
  - Comparativos `vsPreviousPeriod` (mesmo comprimento imediatamente
    antes) e `vsYearAgo` (12 meses atrás, math UTC) calculados sobre o
    mesmo contexto — sem fetch adicional.
  - Coverage de CMV: `cmvCoverage`, `cmvMissingItemsCount`,
    `cmvMissingPartsCount` — proteção contra interpretação errada de
    margem quando peças não têm custo cadastrado.
  - `calculateDRETrend(endIso, ctx)` — série de 12 meses (uma execução
    por mês calendário) usada pelo `DRETrendChart`.

- **Hook PRD-048** (`src/features/dre/hooks/useDREData.ts`):
  - Janela de 24 meses no provider de orders + comissões + settings,
    `staleTime` 60s, executando engine + tendência client-side.
  - `resolvePeriodBounds(monthKey, kind)` resolve `monthly`,
    `quarterly`, `yearly`.
  - `buildMonthOptions(monthCount)` gera dropdown estável dos últimos N
    meses.

- **Hook de alertas** (`src/features/dre/hooks/useDREAlerts.ts`):
  - CMV coverage < 90% → warning (< 60% → critical).
  - Resultado operacional negativo → critical.
  - Margem bruta < 30% (com `netRevenue > 0`) → warning.
  - Queda ≥ 20% no resultado líquido vs período anterior → warning.

- **Página `/app/gestao/dre`** (`src/features/dre/pages/DREPage.tsx`):
  - Filtros: período (mensal / trimestral / anual) + mês de referência.
  - Banner de alertas no topo (`DREAlertsBanner`).
  - Tabela hierárquica (`DRETable`) com 18 linhas, 3 colunas
    comparativas (atual / anterior / ano anterior), deltas em pílulas
    (ícones de seta + cor success/destructive), drill-downs clicáveis:
    Receita Bruta → `/app/gestao/vendas`, CMV →
    `/app/gestao/rentabilidade`, Comissões → `/app/gestao/comissoes`,
    Devoluções → `/app/pedidos?status=devolvido`. Linha "Despesas
    Operacionais" expansível.
  - Card de destaque com Resultado Líquido + % da receita líquida.
  - `DRECoverageCard` — barra de progresso colorida (verde ≥90%,
    amarelo 70-89%, vermelho <70%) + atalho para o catálogo.
  - `DRETrendChart` — LineChart 12 meses (recharts) com receita
    líquida, custos totais e resultado líquido + legenda.
  - `DREExpensesChart` — PieChart de composição (donut) com legenda
    lateral e percentuais.

- **Sub-rota `/app/configuracoes/financeiro`**
  (`src/features/dre/pages/FinancialConfigPage.tsx`):
  - Sliders para `taxOnSalesPct` (0-25%) e `taxOnProfitPct` (0-30%).
  - Inputs para despesas fixas mensais (folha / aluguel + infra /
    outros) com total mensal calculado.
  - Banner explícito sobre limitação MVP ("integração contábil real
    disponível na Fase 2 — esses valores são estimativas").
  - Save grava via `usePlatformSettings.update(...,
"settings.financial.update")` — audit log automático e
    invalidação da query key `["dre"]` para refletir no relatório
    imediatamente.

- **RBAC PRD-048**
  (`src/features/rbac/permissions/resources.ts`,
  `matrix.ts`): novo resource `dre`. Owner — `view + edit` global;
  Gestor — `view` da loja; Financeiro — `view + edit` da loja;
  Vendedor / SDR / Cliente — sem acesso (redirecionados para
  `/sem-permissao`).

- **Menu de configurações** atualizado com item "Financeiro / DRE"
  visível para Owner e Financeiro.

### Changed

- **`IPlatformSettings.financialSettings`** — novo bloco obrigatório no
  shape de settings, com defaults `taxOnSalesPct=0.16`,
  `taxOnProfitPct=0.20`, `payroll=R$ 35k`, `rentInfra=R$ 12k`,
  `other=R$ 8k`. SEED_STORE atualizado.

- **Gerador de peças** (`src/mocks/generators/part.ts`) —
  aproximadamente 30% das peças mockadas passam a ter `unitCost = 0`
  para simular peças sem custo cadastrado e exercitar a cobertura de
  CMV no DRE. `unitPrice` continua derivado do custo base original
  (mantém volume comercial realista).

- **Rota `/app/gestao/dre`** — placeholder do PRD-003 substituído pela
  `DREPage` real. Guard troca `requireAuth([Owner])` por
  `requireAuth(permission: { resource: 'dre', action: 'view' })` para
  liberar Gestor / Financeiro.

- **`src/features/shell/config/routes.ts`** — adicionada constante
  `CONFIG_FINANCEIRO`.

### Notes

- DRE é estrutura clássica — não inventamos componentes; seguimos o
  padrão receita → CMV → margem bruta → despesas → resultado.
- Comparativos cross-período são pure functions sobre o mesmo `ctx` —
  trocar a janela é instantâneo, sem refetch.
- Cobertura de CMV é explicita: % + número absoluto de itens + número
  distinto de peças sem custo. Owner sabe se está olhando dado parcial.
- Drill-downs essenciais: cada linha relevante leva a um relatório de
  origem que detalha a composição.
- Banner sobre Fase 2 deixa claro que é estimativa, não contabilidade
  real.

---

## [0.32.0] — Payout · 2026-05-27

Continuação do **Bloco 4b** com o **Sistema de Comissões (PRD-047)** —
engine completa de cálculo, splits em transferências temporárias, bônus
por meta atingida, fechamento mensal auditável e disputas com workflow
formal. Substitui o `commissionPreview` simples do PRD-032 por
`ICommission` real com snapshots imutáveis de regra e meta. Hook
consumível pelo Cockpit Executivo (PRD-040) via `<CommissionsWidget />`.

### Added

- **Tipos PRD-047** (`src/shared/types/commercial.ts`,
  `src/shared/types/platform.ts`):
  - `ICommission` reescrito com snapshots imutáveis (`ruleSnapshot`,
    `goalSnapshot`), campos completos (`baseValue`, `baseRate`,
    `baseCommission`, `goalBonus`, `totalCommission`), estados de
    aprovação (`approvedAt`, `approvedBy`), pagamento (`paidAt`,
    `paidBy`, `paidBy`), disputa (`disputeReason`, `disputeResolution`,
    etc.) e fechamento (`closedInPeriod`).
  - `CommissionStatus` migrado para os 6 estados do PRD: `calculated`,
    `pending_approval`, `approved`, `paid`, `disputed`, `canceled`.
  - `ICommissionRuleConfig` — regra configurável (taxa base + bônus por
    meta opcional) específica do vendedor ou padrão da loja.
  - `ICommissionGoalBonus` com tipo `fixed` (R$) ou
    `percentage_points` (pp na taxa).
  - `ICommissionSplitDetails` referenciando a `ICarteiraTransfer` que
    disparou o split (PRD-018).
  - `ICommissionSettings` no `IPlatformSettings`: `active`,
    `defaultRate`, `splitPolicy` (`coverage_full` |
    `split_50_50`), `goalBonusEnabled`, `rules[]`, `closedPeriods[]`.

- **Engine puro** (`src/features/commissions/engine/`):
  - `calculateCommission(order, ctx)` — função pura que resolve regra
    aplicável, calcula base, aplica bônus por meta, snapshota tudo e
    retorna `{ primary, secondary? }` (secondary apenas em split 50/50).
  - `determineCommissionBeneficiary(order, transfers, policy)` —
    detecta `ICarteiraTransfer` temporária ativa em `order.paidAt` e
    aplica a política configurada.
  - `findApplicableRule({ sellerId, storeId, paidAt, settings })` —
    resolução em 3 níveis: específica do vendedor → padrão da loja →
    fallback sintético com `defaultRate`.

- **Hooks**:
  - `useCommissionTrigger({ storeId })` — varredura idempotente que
    detecta pedidos pagos sem comissão e emite via provider; respeita
    `settings.commissionSettings.active`.
  - `useCommissionsList(filters)` — lista paginada com cache TanStack.
  - `useCommissionMetrics({ storeId, period, sellerId? })` —
    agregação por vendedor + totais + delta vs período anterior.
  - `useCommissionForOrder(orderId)` — usado pelo OrderDetailPage para
    substituir o preview pelo cálculo real quando existe.
  - `useCommissionsFilters({ sellerLockedId? })` — URL-sync com
    `validateCommissionsSearch` para período (`YYYY-MM`) e vendedor.

- **Páginas**:
  - `CommissionsPage` (`/app/gestao/comissoes/`) — renderização
    condicional por papel: **Vendedor** vê visão individual (KPIs +
    tabela do período); **Gestor/Owner/Financeiro** veem visão
    consolidada (KPIs + tabela por vendedor com drill).
  - `SellerCommissionsPage` (`/app/gestao/comissoes/$sellerId`) —
    drill-down com KPIs do vendedor, tabela completa, cards de
    disputas a resolver (Owner/Gestor) e de pagamentos pendentes
    (Owner/Financeiro).
  - `CommissionsConfigPage` (`/app/configuracoes/comissoes`) — Owner
    only, edita taxa padrão, política de split, toggle de bônus e CRUD
    de regras (incluindo `goalBonus`).

- **Componentes**:
  - `<CommissionsHeader />` com filtro de período (`<Input type="month">`)
    e seletor de vendedor.
  - `<CommissionsKpiGrid />` — 4 KPIs (total a pagar, pedidos, bônus,
    status agregado).
  - `<CommissionsBySellerTable />` — tabela consolidada com drill,
    chips de status por valor.
  - `<CommissionsMyOrdersTable />` — tabela individual com botão
    "Contestar" e link para pedido.
  - `<DisputeDialog />` — vendedor abre contestação com justificativa.
  - `<ResolveDisputeDialog />` — gestor resolve (manter / cancelar).
  - `<ClosePeriodDialog />` — modal de confirmação para fechamento
    mensal com resumo de impacto.
  - `<CommissionsWidget />` — widget compacto para Cockpit (PRD-040) e
    futuro Painel Gestor.

- **Integração no Cockpit Executivo (PRD-040)** —
  `<CommissionsWidget />` adicionado ao grid de comparativos.

- **Integração no OrderDetailPage (PRD-032)** — bloco "Comissão Preview"
  agora renderiza o `ICommission` real quando existe (com base/taxa/bônus
  e indicador de split), e mantém o preview informativo quando o pedido
  ainda não está pago.

- **Mock seed**:
  - `seedCommissionRules()` gera 1 regra padrão da loja + 2 overrides
    por vendedor (Marina @ 4% com bônus `fixed` R$ 500 a 100% revenue;
    Carlos @ 3.5% com bônus `percentage_points` +0.5pp a 100% revenue).
  - `generateCommission()` reescrito para usar `findApplicableRule` e
    emitir registros com snapshots, novos status (`calculated`,
    `approved`, `paid`, `disputed`) e campos completos.

- **Mock API** (`src/mocks/api/commissions.ts`) ganhou `create`,
  `closeMonthlyPeriod`, `openDispute`, `resolveDispute` e
  `registerPayment` com validação ("comissão em período fechado é
  imutável", "pagamento exige aprovado").

- **Provider** (`ICommissionsProvider`) expandido nos contracts; mock
  implementa com audit log via `logMockMutation` (`create`,
  `approve`, `pay`, `dispute_open`, `dispute_resolve`, `close_period`,
  `update`); supabase mantido como stub.

- **Rotas**:
  - `/app/gestao/comissoes` reestruturada — agora é layout-only com
    `<Outlet />`.
  - `/app/gestao/comissoes/` (index) — `CommissionsPage`.
  - `/app/gestao/comissoes/$sellerId` — `SellerCommissionsPage`.
  - `/app/configuracoes/comissoes` — `CommissionsConfigPage`
    (Owner only).
  - `SettingsLayout` ganha item de menu "Comissões" no grupo Avançado.

- **i18n pt-BR** em `src/features/commissions/i18n/pt-BR.ts` com
  rótulos completos, status, headers de tabela e copy de diálogos.

- **Audit log** em todas mutações: `commission.create`,
  `commission.approve`, `commission.pay`, `commission.dispute_open`,
  `commission.dispute_resolve`, `commission.close_period`,
  `settings.commissions.update`.

### Changed

- `IPlatformSettings` ganha `commissionSettings` obrigatório (default
  no `seedStore.ts` com taxa 3%, split `coverage_full`, bônus ligado).
- `ICommission.status` migrado dos rótulos antigos pt-BR
  (`pendente`/`aprovado`/`pago`/`contestado`) para os 6 estados do PRD-047
  em inglês. `OrderPaymentStatus` e `VehicleCadastroStatus` não foram
  afetados (campos distintos).

### Fixed

- `OrderDetailPage` deixa de exibir "preview" quando há comissão real,
  evitando confusão para vendedores que abrem pedidos já pagos.

### Migration notes

- Comissões anteriormente persistidas continuam sendo lidas, mas com os
  novos campos opcionais ausentes — em produção (Fase 2) será preciso
  uma migração de dados ou recálculo idempotente via
  `useCommissionTrigger`.

---

## [0.31.0] — Podium · 2026-05-27

Abertura do **Bloco 4b** com o **Ranking de Vendedores e Gamificação
(PRD-043)** — camada motivacional sobre as metas (PRD-042), positivação
(PRD-044), curva ABC (PRD-045) e carteira analítica (PRD-046). Sistema
de pontos derivado em 4 dimensões (metas batidas/superadas, novos
clientes/positivação/recovery, pedidos high-ticket, bônus de badges),
catálogo seed de **10 badges automáticos** distribuídos em 5 categorias
× 4 raridades, e ranking periódico com tie-breaking determinístico e
delta vs. período anterior.

**Engine puro.** `calculateSellerScore(sellerId, period, context)` e
`evaluateBadgesForSeller({sellerId, period, context, rankingForPeriod})`
em `src/features/gamification/engine/` são funções sem efeitos
colaterais sobre dados já carregados. `calculateRanking` ordena
entradas por score desc com fallback em `breakdown.fromGoals` →
`positionPrevious` e popula `positionDelta`. O badge `estrela-ascensao`
(legendary) é o único que consome o ranking já calculado, ativando-se
quando `positionDelta ≥ 3`. Idempotência garantida via verificação de
`(sellerId, badgeType, periodRef)` antes de emitir um novo
`IGamificationBadge` — re-executar o evaluator nunca duplica.

**Catálogo de badges em settings.** `IGamificationRules` ganhou 7
campos editáveis (`pointsPerGoalCompleted`, `pointsPerGoalExceeded`,
`pointsPerNewCustomer`, `pointsPerHighTicketOrder`, `thresholdHighTicket`,
`thresholdBigTicket`, `notifyOnBadgeEarned`) e um array `badges` com
as 10 definições. Tipos novos: `IBadgeDefinition`, `BadgeCategory`,
`BadgeRarity`. `IRankingEntry` agora carrega `breakdown` por fonte,
`positionPrevious`, `positionDelta` e `badgeSlugs[]`.

**Hook agregador.** `useRanking({period, scope, rulesOverride})`
dispara 7 queries TanStack em paralelo (sellers, settings, orders
period, orders previous, orders historical, customers, goals) +
hook `useBadges` consumindo o mock `badgesApi`. Calcula primeiro
o ranking do período anterior (para popular `positionPrevious`),
depois o atual, e finalmente roda o evaluator de badges sobre o
ranking calculado. `useSellerHistory({sellerId, months: 6})` é o
complemento drill-down: reconstrói scores mensais nos últimos 6
âncoras para o gráfico temporal.

**Página principal.** `/app/gestao/ranking` substitui placeholder.
Header com filtros (período mensal/trim./anual + loja com URL-sync).
**Pódio top-3** com ouro/prata/bronze (ring colorido, troféu/medalha
sobreposto, breakdown em pílulas semânticas), ordenado 2-1-3 em
desktop com gold scale-up. **Tabela do ranking** para 4º em diante,
com sticky highlight da linha do próprio vendedor quando role=Vendedor.
**Card "Conquistas em destaque"** lateral elencando as 5 badges mais
raras do período. Reestruturação de rotas TanStack: parent agora é
layout-only com `<Outlet />` e a página mora em
`app.gestao.ranking.index.tsx` — destrava o drill-down.

**Drill-down do vendedor.** `/app/gestao/ranking/$sellerId` com guard
de acesso (Vendedor só pode abrir o próprio). Header com avatar +
posição (#N de M) + qualitativo (Top 10/25/50%). 3 KPI cards
(score, posição com delta, conquistas no período). **Donut Recharts**
de breakdown por fonte (Metas/Clientes/Pedidos/Bônus). **Gráfico de
linha** com últimos 6 períodos mensais. **Grid de conquistas** com
nome, raridade e data — usa `<SellerBadgesGrid />`, componente
exportado para futuro reuso na ficha do vendedor.

**Página de configuração.** `/app/configuracoes/gamificacao`
(Owner only) substitui o `GamificationPlaceholderPage`. Banner
"Modo demonstração", toggle global `active`, formulário de 8 campos
numéricos para tunar os points/thresholds, tabela editável com as
10 badges (toggle active + edit bonusPoints), e botão "Recalcular
agora" que invalida o cache do TanStack. Save persiste via
`usePlatformSettings.update` com action `settings.gamification.update`
no audit log.

**Widget no Painel Gestor (PRD-014).** `<TopPerformersWidget />`
adicionado à seção de widgets — grade agora `lg:grid-cols-4`
acomodando Metas / Positivação / Saúde da carteira / Top performers.
Mini-pódio horizontal com 3 medalhas + avatar + score + até 3 ícones
de badges + link "Ver ranking completo".

**Widget no Cockpit Executivo (PRD-040).** `<RankingHighlightWidget />`
adicionado ao grid de charts (após o `ABCMiniChart`). Pódio top-3
cross-store quando Owner, da loja quando Gestor (via `storeId`
prop). Mostra breakdown abreviado por fonte e score destacado.

**Permissões.** Página principal e drill-down guardados por
`requireAuth` aceitando Owner/Gestor/Vendedor/Financeiro. Vendedor
preso no próprio drill-down e na própria loja (escopo automático).
Configuração restrita a Owner. Widget oculto quando
`gamificationRules.active=false`.

### Added

- `src/features/gamification/` — feature completa (catálogo seed,
  engine puro, 4 hooks de dados, 9 componentes, 3 páginas, i18n + barrel)
- Tipos `IBadgeDefinition`, `BadgeCategory`, `BadgeRarity` em
  `src/shared/types/bi.ts` + campos snapshot em `IGamificationBadge`
- 8 campos novos em `IGamificationRules` (active, points-rules e
  thresholds) + array `badges[]`
- Campos `breakdown`, `positionPrevious`, `positionDelta`,
  `badgeSlugs[]` em `IRankingEntry`
- Engine `calculateSellerScore`, `calculateRanking`,
  `evaluateBadgesForSeller`, `sumBreakdown`, `findBadgeDefinition`
- Catálogo seed `DEFAULT_BADGE_CATALOG` com 10 badges
  (meta-batida, hat-trick, veterano, recordista-tri, maratona,
  cobertura, resgatador, conquistador, big-ticket, estrela-ascensao)
- Hooks `useRanking`, `useBadges`, `useRankingFilters` (URL-sync),
  `useSellerHistory`
- Componentes `BadgeChip`, `RarityBadge`, `SellerAvatar`,
  `RankingHeader`, `RankingPodium`, `RankingTable`, `RecentBadgesCard`,
  `BreakdownDonut`, `ScoreHistoryChart`, `SellerBadgesGrid`,
  `TopPerformersWidget` (PRD-014), `RankingHighlightWidget` (PRD-040)
- Rotas `/app/gestao/ranking` (layout `<Outlet />`),
  `/app/gestao/ranking/` (index — RankingPage),
  `/app/gestao/ranking/$sellerId` (drill-down),
  `/app/configuracoes/gamificacao` (config — substitui placeholder)
- Generator de badges atualizado para usar catálogo canônico
  com snapshots de category/rarity/bonusPoints

### Changed

- Painel Gestor (PRD-014): grade da seção de widgets passa de
  `lg:grid-cols-3` para `lg:grid-cols-4` acomodando o
  `<TopPerformersWidget />`
- Cockpit Executivo (PRD-040): adiciona `<RankingHighlightWidget />`
  ao grid de charts
- Mock `seedStore.ts` adota o `DEFAULT_BADGE_CATALOG` + valores
  default das novas 8 chaves de `gamificationRules`
- `IGamificationRules`, `IGamificationBadge`, `IRankingEntry`
  estendidos com campos opcionais (retro-compatíveis)

### Fixed

- Padrão de rotas TanStack para drill-down — parent agora é layout
  com `<Outlet />` + `index.tsx` filho. Bug latente similar existe
  em `app.gestao.abc.tsx` (drill `/abc/$class`) e
  `app.gestao.carteira-analitica.tsx` (drill `/carteira-analitica/$sellerId`)
  — não corrigidos neste release, ficam catalogados como dívida

### Notas

- `<SellerBadgesGrid sellerId />` é exportado do barrel e fica
  pronto para a futura ficha do vendedor (não existe no MVP)
- Recálculo agendado mock — TanStack Query invalidation no botão
  "Recalcular agora"; Fase 2 Edge Function diária
- Notificação toast de conquista é opcional via
  `gamificationRules.notifyOnBadgeEarned` (default `false`)
- 50 PRDs do MVP redigidos + 32 implementados; 18 a fazer
  (047–053 do Bloco 4b + 060–067 Bloco 5 + 070–071 Bloco 6)

## [0.30.0] — Vitals · 2026-05-26

Sequência do Bloco 4a (Gestão A — Onda 2) com a **Carteira Analítica
(PRD-046)** — visão temporal e por estado da saúde da carteira,
distinta da Positivação (PRD-044, foco binário "comprou no mês?")
e da Curva ABC (PRD-045, foco ranking de receita). Aqui o ângulo é
_contínuo + comparativo temporal_: como a base está distribuída
entre ativo/dormente/recuperação/perdido, quantos clientes saíram
no período (churn), quantos voltaram (recovery) e quem está a
poucos dias de cair de status (em risco).

**Engine pura.** `calculatePortfolioMetrics(start, end, context)`
em `src/features/portfolio-analytics/engine/` é função sem efeitos
colaterais: agrupa clientes por `customer.status`, compara o
status reconstruído na borda inicial vs. final da janela (via
`lastPurchaseAt` + `lifecycleThresholds`) para tally de transições
(`activeToDormant`, `activeToLost`, `dormantToLost`, `dormantToActive`,
`lostToActive`), conta novos clientes criados na janela, identifica
listas `atRisk` lookahead 15 dias (ativos prestes a virar dormentes
e dormentes prestes a virar perdidos). Retorna ainda `bySeller` com
a mesma matemática restrita ao portfólio de cada vendedor, incluindo
um **Health Score composite 0-100** ponderando 50% ativos + 25%
recovery + 25% inverso de churn — exposto com qualitativo (Excelente

> 80, Bom 60-80, Atenção 40-60, Crítico < 40) via `describeHealthScore`.

**Hook agregador.** `usePortfolioMetrics({ window, scope })` carrega
clientes, pedidos pagos na janela, **histórico completo de pedidos
até a borda final** (necessário para reconstruir o status em cada
bucket mensal do gráfico evolutivo), vendedores e settings da loja
via 5 queries TanStack em paralelo. Delega ao engine e constrói
adicionalmente a série `evolution` — bucket mensal com contagem
de ativos/dormentes/perdidos no fim de cada mês entre `fromIso` e
`toIso`. `useSellerPortfolio` é o complemento drill-down: combina
um `usePortfolioMetrics` escopado num único vendedor com o registro
do próprio seller.

**Página principal.** `/app/gestao/carteira-analitica` substitui
ausência de rota anterior. Header de filtros (período: mês atual /
trimestre / semestre / YTD / **últimos 12 meses default** /
personalizado + loja + vendedor, com URL-sync). 7 KPIs no topo:
total da carteira, %ativos (verde), %dormentes (âmbar), %perdidos
(vermelho), churn no período, recovery, crescimento líquido. **Donut
chart Recharts** com 4 fatias (cores semânticas verde/azul/âmbar/
vermelho) + legenda lateral com contagem e %. **Gráfico evolutivo
temporal** multi-linha mostrando ativo/dormente/perdido ao longo
dos meses do período. **Card "Transições no período"** com 6 setas
coloridas (active→dormant, active→lost, dormant→lost, dormant→active,
lost→active, novos). **Tabela "Saúde por vendedor"** com 9 colunas
(avatar com iniciais, nome, tamanho da carteira, %ativos/%dormentes/
%perdidos coloridos, churn + taxa, recovery + taxa, **Health Score
badge** colorido por qualitativo, ação drill-down). **Duas listas
de risco** lado a lado: "Em risco iminente" (ativos próximos do
limite dormente) e "Em risco crítico" (dormentes próximos do limite
perdido), com colunas cliente/vendedor/última compra/dias restantes
coloridos por urgência + botões Contatar e Abrir ficha.

**Drill-down por vendedor.** `/app/gestao/carteira-analitica/$sellerId`
com guard de acesso (Vendedor só pode abrir o próprio drill;
acessos cruzados redirecionam para EmptyState). Header com nome do
vendedor + **Health Score badge** + card resumo de %ativos/churn/
recovery. Mesmas visualizações (KPIs, donut, evolução, transições)
filtradas. Lista de carteira completa com 5 tabs por status
(Todos / Ativos / Dormentes / Perdidos / Em recuperação — esta
última apenas quando count > 0), tabela paginada 20/página com
nome do cliente, status colorido, última compra, LTV e ações.

**Widget no Painel Gestor (PRD-014).** `<PortfolioHealthWidget />`
adicionado na seção lateral junto a Metas e Positivação (grade
agora `lg:grid-cols-3` em vez de 2). Mini-donut PieChart + KPI
%ativos + contadores de churn/recovery + link "Abrir análise".

**Permissões.** Página guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor (auto-redirect para próprio drill-down) e
Financeiro. Gestor preso na loja atual via `gestorLockedStoreId`.
Tabela "Saúde por vendedor" oculta para Vendedor. Listas de risco
contêm PII — escopo respeita carteira.

### Added

- `src/features/portfolio-analytics/` — feature completa (engine
  puro, 2 hooks de dados, hook de filtros URL-sync, 9 componentes,
  2 páginas, i18n + barrel)
- Engine `calculatePortfolioMetrics` puro com tally de transições,
  health score composite e at-risk lookahead — exportado pelo barrel
- Helpers `calculateHealthScore` e `describeHealthScore` para
  qualitativo (excelente/bom/atenção/crítico)
- Hook `usePortfolioMetrics` — 5 queries TanStack + engine + série
  temporal mensal reconstruída do histórico de pedidos
- Hook `useSellerPortfolio` — drill-down escopado em um vendedor
- Hook `usePortfolioFilters` — URL-sync com presets mês/trim/sem/
  YTD/12m + custom + loja + vendedor
- Componentes `PortfolioHeader`, `PortfolioKpis` (7 KPIs com accents
  semânticos), `PortfolioDistributionChart` (donut), `PortfolioEvolutionChart`
  (linhas multi-status), `PortfolioTransitionsCard`, `PortfolioBySellerTable`
  (9 colunas), `PortfolioRiskList`, `PortfolioHealthBadge`, `CustomerPortfolioList`
  (paginada por status), `PortfolioHealthWidget` (PRD-014)
- Rotas `/app/gestao/carteira-analitica` e
  `/app/gestao/carteira-analitica/$sellerId`
- Item de navegação "Carteira Analítica" (mdi:heart-pulse) no menu
  Gestão para os 4 roles
- Constante `ROUTES.GESTAO_CARTEIRA_ANALITICA`

### Changed

- Painel Gestor (PRD-014): grade da seção "Metas / Positivação /
  Saúde da carteira" passa de `lg:grid-cols-2` para `lg:grid-cols-3`
  acomodando o `<PortfolioHealthWidget />`

### Notas

- Drill-down do vendedor reusa o `usePortfolioMetrics` com escopo
  `sellerId`, mantendo a matemática centralizada
- Série evolutiva reconstrói status em cada bucket mensal a partir
  do `lastPurchaseAt` projetado — `recuperacao` é projetado apenas
  no último bucket por não haver audit trail histórico no mock
- Marco: Bloco 4a (Gestão A) fechado com Vendas + Metas + Cockpit +
  Positivação + ABC + Carteira Analítica

## [0.29.0] — Pareto · 2026-05-26

Continuação do Bloco 4a (Gestão A — Onda 2) com a **Curva ABC
(PRD-045)** — classificação automática de clientes via princípio
de Pareto, com detecção de migrações e drill-down por classe.
A rota `/app/gestao/abc`, antes placeholder Owner-only, vira
página completa para Owner, Gestor, Vendedor (escopo próprio) e
Financeiro, com KPIs, gráfico Pareto icônico, banners de migração
e admin dedicado para tunar os limites.

Inclui também **dois bug fixes runtime-críticos** em código
shippado nas versões 0.27.0 (Cockpit) e 0.28.0 (Coverage): o
contrato `IPaginatedResult` usa o campo `data`, não `items`. Os
hooks `useCockpitMetrics` e `usePositivationMetrics` estavam
acessando `.data?.items` que sempre retornava `undefined`, fazendo
as páginas renderizarem com dados vazios. `vite build` usa esbuild
sem `tsc` então a quebra de tipos passou despercebida. Mesma
correção aplicada para `seller.name` → `seller.fullName`. As
páginas Cockpit e Positivação agora funcionam de verdade. Bugs
equivalentes em `goals` e `sales-analytics` permanecem pendentes
para PR de cleanup separado.

**Engine pura.** `classifyABC(start, end, context)` em
`src/features/abc-curve/engine/` é função sem efeitos colaterais:
agrega receita por cliente nos pedidos pagos do período, ordena
desc, calcula participação cumulativa e classifica conforme os
cutoffs (defaults 80% e 95%). Devolve `byClass` (3 buckets com
contagem, receita e %), `records` (lista ranqueada com classe e
cumulativa), `classByCustomerId` (lookup rápido). `detectMigrations`
compara duas classificações por customerId e emite `subiu`, `caiu`,
`manteve`, `novo` ou `saiu`, com buckets dedicados para "subiu
para A", "caiu de A" e "novos em A".

**Hook agregador.** `useABCClassification({ window, previousWindow,
scope })` carrega clientes, pedidos current/previous e settings
da loja via 4 queries TanStack em paralelo, delega ao engine,
e suporta `settingsOverride` para a página admin pré-visualizar
mudanças sem persistir. Inteiramente compatível com filtros
URL-sync de período (3/6/12/24m + custom) e escopo
loja/vendedor.

**Página principal.** `/app/gestao/abc` com header de filtros +
5 KPIs (total classificados, receita do período, cards A/B/C
clicáveis com contagem + receita + %) + banners de migração
(verde = subiu, vermelho = caiu, azul = novo em A) + gráfico Pareto
Recharts (`ComposedChart` com barras coloridas por classe + linha
cumulativa + `ReferenceLine`s nos cutoffs A/B com label) + tabela
dos top 25 contribuintes com badge de classe, vendedor, receita,
% acumulada, migração e drill-down para a ficha do cliente.

**Drill-down por classe.** `/app/gestao/abc/$class` com guard de
classe válida (`A`/`B`/`C` apenas, redireciona com `EmptyState` se
inválido), 3 KPIs específicos da classe (count, receita, %),
tabela completa paginada (25/página) com a mesma estrutura da
tabela do top + colunas de migração coloridas.

**Admin.** `/app/configuracoes/curva-abc` (Owner-only) substitui
a ausência de sub-rota anterior. Sliders para periodMonths (3-24),
classAThreshold (70-90%) e classBThreshold (90-99%) com validação
de ordem (B precisa ser > A). Card de pré-visualização live mostra
3 mini-cards (A/B/C) com a contagem atual vs nova e Δ colorido.
Botão "Recalcular agora" invalida o cache do TanStack Query
forçando re-fetch. Save persiste via `usePlatformSettings` (que
já grava audit log automaticamente — `action='settings.abcCurve.update'`).

**Settings extensíveis.** Nova interface `IABCCurveSettings`
adicionada a `IPlatformSettings` com defaults (12m, 80%, 95%)
seedados em `seedStore.ts` para a Matriz.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor (escopo próprio automaticamente) e Financeiro.
Vendedor não vê classificação de clientes alheios — o filtro de
seller no scope vira no-op travado em `sellerId` próprio. Config
admin é Owner-only.

**Sidebar.** Item "Curva ABC" agora visível para os 4 roles
(antes só Owner). Item config "Curva ABC" precisa ser plugado
no menu de admin-settings — adiado pois o submenu é complexo;
acesso por URL direta funciona.

### Added

- `src/features/abc-curve/` — feature completa (2 engines puros,
  2 hooks, 5 componentes, 3 páginas, utils + i18n + barrel)
- Engine `classifyABC` + `detectMigrations` puros, exportados pelo
  barrel para que Cockpit/PRD-040 e Goals/PRD-042 possam plugar
  no futuro (swap dos stubs)
- Hook `useABCClassification` — 4 queries TanStack em paralelo +
  delega aos engines + suporta `settingsOverride` para preview
- Hook `useABCFilters` — URL-sync com presets 3/6/12/24m + custom +
  store + seller
- Componentes `ABCHeader`, `ABCKpis`, `ParetoChart` (ComposedChart
  com ReferenceLines nos cutoffs), `MigrationBanners`,
  `ABCCustomersTable`
- Páginas `ABCCurvePage`, `ABCClassPage` (drill-down `/$class`) e
  `ABCSettingsPage` (admin)
- Rotas `/app/gestao/abc` (substitui placeholder),
  `/app/gestao/abc/$class` (nova) e `/app/configuracoes/curva-abc`
  (nova, Owner-only)
- Tipo `IABCCurveSettings` em `IPlatformSettings` + seed default
  (12m, 80/95) em `seedStore.ts`

### Fixed

- **Cockpit (PRD-040) e Positivação (PRD-044)**: hooks acessavam
  `query.data?.items` mas o contrato `IPaginatedResult` usa `data`.
  Correção: `query.data?.data`. Sem isso as páginas renderizavam
  vazias em runtime mesmo sem erro visível. `vite build` não roda
  `tsc` (apenas esbuild) então o bug passou pelo gate de release
- **Cockpit e Positivação**: `seller.name` não existe em `ISeller`
  (é `fullName`). Correção: usar `fullName`. Sem isso o label de
  vendedor renderizava "—" em toda a UI
- Validação `userRole !== undefined` substituída por
  `userRole !== null` (o auth provider devolve `RoleName | null`,
  não `undefined`)
- Vários ajustes TS-only nos hooks de filters e gráficos do
  Cockpit (typing de `prev` em `navigate.search`, fallback em
  destructure de `value.split("-")`)

### Changed

- Sidebar: "Curva ABC" agora visível para Owner, Gestor,
  Vendedor e Financeiro

### Notes

- Item "Curva ABC" no submenu de admin-settings (sidebar
  Configurações → Atendimento/Distribuição/…) não foi plugado
  porque a sidebar de config tem estrutura própria; acesso por
  URL `/app/configuracoes/curva-abc` funciona
- Bugs equivalentes ao `.items`/`.fullName` ainda existem em
  `goals/hooks/useGoals*`, `sales-analytics/hooks/useSales*` e
  `manager-dashboard/hooks` — não corrigidos neste PR para manter
  escopo focado em PRD-045. Painel Gestor, Vendas, Metas e
  Goals widget continuam silenciosamente exibindo dados vazios
  até o cleanup
- Recálculo agendado diário (RF-018) usa apenas botão manual no
  admin (`Recalcular agora` invalida cache). Edge Function de
  cron fica para Fase 2

---

## [0.28.0] — Coverage · 2026-05-26

Reabertura do Bloco 4a (Gestão A — Onda 2) com o sistema de
**Positivação (PRD-044)** — o painel que finalmente responde a
pergunta "quem da minha carteira ainda não comprou este mês?".
A rota `/app/gestao/positivacao`, antes placeholder Owner-only,
vira página completa para Owner, Gestor, Financeiro e Vendedor
(escopo próprio), com KPIs, gráfico evolutivo, drill-down por
vendedor, lista de não-positivados, lista de clientes em risco
de virarem dormentes, e widget compacto no Painel Gestor.

**Engine pura.** `calculatePositivation(start, end, context)` em
`src/features/positivation/engine/` é função sem efeitos
colaterais: recebe clientes, pedidos pagos no período, vendedores
e o `dormantDays` configurável (PRD-019 lifecycle thresholds),
devolve a base elegível (clientes ativos), o conjunto de
positivados (clientes com ao menos 1 `IOrder` `pago` com `paidAt`
no período), a taxa de positivação, a projeção linear capeada na
base, o breakdown por vendedor com taxa individual e a lista de
clientes em risco (cujo `lastPurchaseAt + dormantDays - now ≤ 15
dias`). Determinística com `now` injetável para testes.

**Hook agregador.** `usePositivationMetrics({ window, previousWindow,
scope })` carrega clientes, pedidos current/previous, vendedores
e configurações do store via 5 queries TanStack em paralelo,
delega ao engine, e devolve métricas + previousMetrics + tendências
calculadas via `computeTrend` (positivado/taxa = maior é melhor;
churn/em risco = menor é melhor) + série diária para o gráfico
de evolução. Reativo a mudanças no provider de pedidos.

**Página principal.** `/app/gestao/positivacao` com header de
filtros (período: mês atual/mês anterior/trimestre/YTD/custom,
loja, vendedor — todos URL-sync) + 5 KPIs no topo (base, positivados,
taxa, projeção, em risco) + gráfico Recharts de linha cumulativa
vs proporcional + tabela "Por vendedor" (oculta para Vendedor) com
drill-down clicável + duas listas paginadas (30/página) de clientes:
não-positivados e em risco. Cada cliente tem botão "Contatar"
(placeholder — abre `/app/atendimento` com nome pré-filtrado via
`?q=`) e "Abrir ficha" (vai para `/app/clientes/$id`).

**Drill-down.** `/app/gestao/positivacao/$sellerId` mostra a
carteira completa do vendedor com 4 abas (Todos / Positivados /
Não positivados / Em risco) + KPIs específicos. Vendedor só
consegue abrir o próprio drill-down (Gestor e Owner veem qualquer
um); tentativa de URL direta cai em `EmptyState` de acesso negado.

**Widget no Painel Gestor.** `<PositivationWidget />` plugado no
`/app/inicio` ao lado do `<GoalsWidget />` — KPI compacto da taxa
do mês com barra de progresso inline + projeção fim de mês + link
"Abrir" para a página completa.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor, Vendedor e Financeiro. Vendedor é automaticamente travado
no próprio `sellerId` (filtro de vendedor vira no-op) e na própria
loja. Gestor é travado na própria loja. Owner livre cross-store.
Sidebar atualizada para refletir o novo escopo de roles.

### Added

- `src/features/positivation/` — feature completa (engine puro,
  3 hooks, 5 componentes, 2 páginas, i18n PT-BR e barrel)
- Engine `calculatePositivation` em `src/features/positivation/engine/`
  com `IPositivationMetrics`, `ISellerPositivation`, `IAtRiskCustomer`
- Hook `usePositivationMetrics` — agregador via 5 queries TanStack +
  delega ao engine + tendências vs período anterior + série diária
- Hook `usePositivationFilters` — URL-sync com 4 presets (mês atual,
  anterior, trimestre, YTD) + custom, loja, vendedor
- Componentes `PositivationHeader`, `PositivationKpis`,
  `PositivationEvolutionChart` (Recharts), `PositivationBySellerTable`,
  `CustomerListCard` (paginação client-side), `PositivationWidget`
- Páginas `PositivationPage` e `SellerPositivationPage`
- Rotas `/app/gestao/positivacao` (substitui placeholder) e
  `/app/gestao/positivacao/$sellerId`
- Widget `<PositivationWidget />` plugado em `ManagerDashboardPage`
  (PRD-014) ao lado do `GoalsWidget`

### Changed

- Sidebar: item "Positivação" agora visível para Owner, Gestor,
  Vendedor e Financeiro (antes só Owner)
- `app.gestao.positivacao.tsx` substitui o `PlaceholderPage` pela
  página real, com guard de roles ampliado

### Notes

- Botão "Contatar" é placeholder do MVP — navega para `/app/atendimento`
  com nome do cliente pré-filtrado via search params. Criação de
  nova conversa direta com cliente fica para PRD-100 / Fase 2
- Filtro "Positivado este mês" / "Não positivado este mês" em
  `/app/clientes` (PRD-015 RF-021) fica para próxima iteração —
  exige refactor da paginação server-side para suportar
  post-filtering consistente
- Engine `usePositivationMetrics` está pronto para ser plugado no
  Cockpit (PRD-040) e na engine de metas (PRD-042) para substituir
  os stubs atuais — feito em PR posterior para isolar risco

---

## [0.27.0] — Cockpit · 2026-05-26

Encerramento provisório do Bloco 4 (Gestão e BI — Onda 2) com a
**Visão Executiva (PRD-040)** — o cockpit estratégico do Owner.
A rota `/app/gestao`, antes placeholder, vira o "mapa em uma
tela" da empresa: 12 KPIs de alto nível com sparklines e tendência
vs período anterior (ou ano anterior), 4 gráficos macro,
comparativo lado a lado e banner de alertas executivos calculados
em runtime.

**Cockpit (PRD-040).** A página `ExecutiveCockpitPage` agrega
métricas de PRDs 041 (vendas), 042 (metas), 032 (pedidos), 031
(orçamentos) e 015 (clientes) através do hook `useCockpitMetrics`.
PRDs 044 (positivação), 045 (ABC), 046 (carteira), 047 (comissões)
e 049 (rentabilidade) entram como stubs computados a partir dos
dados já disponíveis — positivação derivada de pedidos/clientes
ativos, ABC reconstruída em runtime via Pareto 80/95, comissões
estimadas em 3,5% do faturamento, margem média via `marginValue`
real dos pedidos com fallback para 32%. Quando os PRDs analíticos
forem implementados, basta plugar os hooks reais — o contrato do
agregador não muda.

Os 12 KPIs cobrem: faturamento, ticket médio, total de pedidos,
margem estimada, clientes ativos, positivação, churn do período,
novos clientes, pipeline aberto (orçamentos enviados+aceitos
não convertidos), conversão orçamento→pedido, comissões a pagar
e NPS (card "em breve"). Cada card renderiza tendência colorida
(verde = melhorou, vermelho = piorou), sparkline de 12 meses
quando relevante, badge `Estimativa` para os que dependem de PRDs
pendentes, e drill-down clicável para a página detalhada
correspondente.

**Gráficos macro.** ComposedChart de 12 meses combina área de
faturamento (eixo esquerdo, em BRL) e linha de pedidos (eixo
direito, contagem). Donut compacto da saúde da carteira (ativo /
dormente / recuperação / perdido) com cores semânticas das
submarcas GALLO. Bar horizontal dos top 5 vendedores por
faturamento. Mini gráfico de barras da curva ABC mostrando
participação de receita por classe + contagem de clientes. Todos
clicáveis para a página detalhada correspondente quando ela
existe (vendas, clientes, ABC) ou navegação para placeholder.

**Comparativo lado a lado.** Card no fim da página com 3 linhas
(faturamento, pedidos, ticket médio) mostrando valor atual,
anterior e Δ% colorido por direção e por melhora/piora. Funciona
para ambos os modos de comparação — período anterior ou mesmo
mês no ano anterior — controlado pelo dropdown no header.

**Alertas executivos.** Hook `useCockpitAlerts` calcula 4 tipos
de alerta a partir das métricas + metas ativas: churn subiu
≥ 20% vs período anterior (vermelho), 3+ metas críticas com
< 50% atingido e ≤ 7 dias restantes (amarelo), faturamento médio
< 70% da meta agregada (vermelho), conversão de orçamentos < 15%
(amarelo). Cada alerta é dispensável (estado em memória, perdido
no reload) e tem CTA para a página correspondente.

**Filtros URL-sincronizados.** Período (mês/trimestre/YTD/
personalizado), loja (Owner livre, Gestor travado na própria loja)
e base de comparação (período anterior ou ano anterior). O escopo
da loja viaja para todos os 7 queries TanStack via chave de cache,
garantindo invalidação correta ao trocar.

**Permissões.** Rota guardada por `requireAuth` aceitando Owner,
Gestor e Financeiro. Vendedor é bloqueado e redirecionado para
`/sem-permissao` no nível da rota; mesmo se acessar via URL
direta, o `EmptyState` interno na página oferece fallback gracioso.
Navegação atualizada: "Visão executiva" no menu lateral agora
aparece para Owner, Gestor e Financeiro.

**Performance.** 7 queries em paralelo (orders current/previous/
12m, quotes current/previous, customers, sellers) com `staleTime`
de 30s. Cards memoizados; séries derivadas via `useMemo` com
dependências granulares. Tooltips dos KPIs explicam a base
comparativa.

### Added

- `src/features/executive-cockpit/` — feature completa (page,
  3 hooks, 4 charts, 4 componentes auxiliares, i18n PT-BR e
  barrel `index.ts`)
- Rota `/app/gestao` agora renderiza `ExecutiveCockpitPage` com
  `validateCockpitSearch` para filtros via URL
- Hook `useCockpitMetrics` — agregador de 11 KPIs + séries de
  12 meses + saúde da carteira + top vendedores + ABC compacta,
  com stubs para PRDs 044/045/046/047/049 ainda pendentes
- Hook `useCockpitFilters` — período (mês/trim/YTD/custom),
  loja e base de comparação (período anterior ou YoY), tudo
  URL-sincronizado
- Hook `useCockpitAlerts` — 4 categorias de alerta executivo
  com dispensa em memória
- Componente `<ExecutiveKpiCard>` — variante do KpiCard com
  sparkline Recharts, tag opcional ("Estimativa"/"Em breve") e
  drill-down clicável
- Componentes `<RevenueOrdersComposedChart>`,
  `<PortfolioMiniDonut>`, `<TopSellersBar>`, `<ABCMiniChart>` —
  4 gráficos macro do cockpit

### Changed

- Sidebar: item "Visão executiva" agora visível para Owner,
  Gestor e Financeiro (antes só Owner)
- `app.gestao.index.tsx` substitui o `PlaceholderPage` pela página
  real do cockpit, com guard de roles ampliado

### Notes

- PRDs 044/045/046/047/049 ainda não implementados. Os valores
  exibidos no cockpit para esses domínios são derivados em runtime
  pelo próprio hook — quando os PRDs reais entrarem, basta trocar
  o cálculo interno pelo hook canônico sem mudar a API do agregador
- NPS exibido como card "Em breve" (placeholder de Fase 2)
- Personalização de widgets via botão no header é placeholder
  com tooltip "Disponível na Fase 2"

---

## [0.26.0] — Pulse · 2026-05-26

Continuação do Bloco 4 (Gestão e BI — Onda 2). Após a análise de
vendas (PRD-041), a plataforma ganha o sistema de gestão de metas
comerciais (PRD-042) — o cérebro que conecta o que está vendendo
à expectativa do mês, individual e da loja, com tracking em tempo
real. Resolve três dores: vendedor não sabia onde estava no meio
do mês, gestor descobria atrasos só no dia 28, e PRDs futuros
(comissões, gamificação) não tinham base mensurável.

**Metas (PRD-042).** A rota `/app/gestao/metas`, antes placeholder
Owner-only, vira uma página dual-mode: Vendedor vê apenas os cards
das próprias metas com barra de progresso e dias restantes;
Gestor/Owner/Financeiro vêm o dashboard agregado com 4 KPIs (metas
ativas, % média, heroes ≥ 100%, atenção < 70%), filtros URL-
sincronizados (tipo, escopo, status, vendedor, loja, período),
tabela completa com barra inline, gráfico de barras por vendedor
e abas Ativas / Histórico. Suporta 5 métricas no MVP (revenue,
ticket_medio, tickets, positivacao, novos_clientes) + 3 dormentes
(margin, recovery, conversion).

A página `/app/gestao/metas/nova` traz formulário de 4 seções
(configuração, escopo, valor, recompensa) com sugestão inteligente
de target baseada no histórico ("período anterior R$ X, alcançou
Y% → sugestão R$ X×1.05"). A página `/app/gestao/metas/:id`
oferece header com ações (editar/cancelar restritos a Owner/Gestor),
resumo de progresso com projeção linear, gráfico evolutivo com
linha realizada vs esperada (proporcional ao período), composição
clicável (pedidos contribuintes para metas de revenue/tickets;
clientes positivados para positivacao; clientes novos para
novos_clientes; estatísticas min/median/max/std para ticket_medio)
e histórico de mudanças via audit log.

Mudança de target em meta ativa exige checkbox de confirmação
explícito sobre impacto em comissões (PRD-047). Cancelamento exige
motivo. Hook `useGoalAutoStatusUpdate` roda uma vez por sessão
(throttled a 24h via localStorage) transicionando metas vencidas
para `concluida` ou `arquivada` conforme atingimento. Hook
`useGoalMilestoneToast` dispara toast quando o vendedor cruza
50/80/100% (guardado em localStorage para não repetir). Widget
"Metas do mês" injetado no Painel Gestor (PRD-014) lista as 5
metas com menor progresso primeiro — as que mais precisam de
atenção.

O tipo `IGoal` em `src/shared/types/bi.ts` foi estendido com os
campos do PRD-042 (`name?`, `status?`, `sellerId?`,
`rewardDescription?`, `createdBy?`, `cancelReason?`) mantendo
back-compat. `GoalMetric` foi ampliado com `ticket_medio` e
`novos_clientes`. Gerador de mocks reescrito para popular os novos
campos e gerar ~25 metas (5 meses de histórico + período corrente

- 1 cancelada).

### Added

- **Feature `goals`** (`src/features/goals/`):
  - `pages/GoalsPage.tsx`: entry com renderização condicional por
    role.
  - `pages/NewGoalPage.tsx`: 4 seções de formulário com sugestão
    inteligente e validações.
  - `pages/GoalDetailPage.tsx`: header + resumo + chart + composição
    - histórico.
  - `engine/calculate.ts`: função pura `calculateGoalProgress` para
    5 métricas + fallback ao snapshot para `recovery`/`conversion`.
  - `engine/projection.ts`: `describePeriodWindow` e
    `computeProjection` (linear, cap 200%).
  - `engine/suggestion.ts`: `suggestTarget` (mês anterior × 1.05
    com fallback metric-default).
  - `hooks/useGoalsWithProgress.ts`: agregador `useQueries` único
    que evita N+1.
  - `hooks/useGoalProgress.ts`: progress de uma meta única.
  - `hooks/useSellerGoals.ts`, `useStoreGoals.ts`,
    `useGoalsStatistics.ts`: wrappers para consumo externo (PRDs
    043/047 futuros).
  - `hooks/useGoalsFilters.ts`: URL sync com 7 filtros
    (tab + 6 dimensões) + `validateGoalsSearch`.
  - `hooks/useGoalAutoStatusUpdate.ts`: transição automática
    throttled a 24h por sessão.
  - `hooks/useGoalMilestoneToast.ts`: toasts em 50/80/100%
    guardados em `localStorage`.
  - `components/`: `GoalCard`, `GoalProgressBar`,
    `GoalStatusBadge` (modes progress|lifecycle), `GoalTypeBadge`,
    `IndividualGoalsDashboard`, `AggregatedGoalsDashboard`,
    `GoalKpiRow`, `GoalsFiltersBar`, `GoalsTable`,
    `SellerProgressBarChart` (Recharts com cores semáforo),
    `EditGoalModal` (com checkbox de confirmação em mudança de
    target), `CancelGoalDialog` (motivo obrigatório).
  - `components/detail/`: `GoalDetailHeader`,
    `GoalProgressSummary`, `GoalEvolutionChart` (LineChart
    realizado vs esperado), `GoalCompositionSection`
    (renderização condicional por métrica),
    `GoalHistorySection`.
  - `components/widget/GoalsWidget.tsx`: card compacto para o
    Painel Gestor.
  - `utils/`: `labels.ts` (metric/level/status icons + labels),
    `formatGoalValue.ts` (currency/count/percent), `validation.ts`
    (form rules + `defaultPeriodRange`), `composition.ts`
    (`buildEvolutionSeries`, `getContributingOrders`,
    `getPositivatedCustomers`, `getAcquiredCustomers`,
    `getTicketStats`).
  - `i18n/pt-BR.ts`: strings UI completas.

- **Tipos goals** (`src/shared/types/goals.ts`): `IGoalProgress`,
  `GoalProgressStatus` (no_caminho|atencao|atrasada|concluida),
  `GoalProgressTrend` (subindo|estavel|caindo).

- **Rotas**:
  - `src/routes/app.gestao.metas.nova.tsx` (Owner/Gestor only).
  - `src/routes/app.gestao.metas.$id.tsx` (Owner/Gestor/Vendedor/
    Financeiro com guard por scope).

### Changed

- **Tipo `IGoal`** (`src/shared/types/bi.ts`): novos campos
  opcionais (`name`, `status`, `sellerId`, `rewardDescription`,
  `createdBy`, `cancelReason`) — back-compat com mocks existentes.
  Novo tipo de status `GoalStatus` exportado.
- **Tipo `GoalMetric`**: amplia com `ticket_medio` e
  `novos_clientes`.
- **Gerador `src/mocks/generators/goal.ts`**: gera ~25 metas com
  mix de status (ativa/concluida/arquivada/cancelada) + 5 meses
  de histórico + cancelada com motivo.
- **Rota `/app/gestao/metas`** (`src/routes/app.gestao.metas.tsx`):
  troca `PlaceholderPage` por `<GoalsPage />`, amplia roles para
  Owner/Gestor/Vendedor/Financeiro, instala
  `validateSearch: validateGoalsSearch`.
- **Painel Gestor** (`src/features/manager-dashboard/pages/
ManagerDashboardPage.tsx`): injeta `<GoalsWidget />` entre o
  heatmap e a saúde da carteira.
- **Navigation** (`src/features/shell/config/navigation.ts`):
  amplia roles dos itens "Vendas" e "Metas" para os 4 perfis com
  acesso a indicadores.

## [0.25.0] — Insight · 2026-05-26

Abertura do Bloco 4 (Plataforma de Gestão e BI — Onda 2) com a
análise detalhada de vendas (PRD-041). A rota `/app/gestao/vendas`,
que era placeholder restrita ao Owner, vira um dashboard analítico
multidimensional liberado para Owner, Gestor, Vendedor e Financeiro
— cada perfil enxerga o escopo permitido sem precisar mudar a UI.
A página entrega o cérebro analítico que o João Gallo pedia: o que
está vendendo, qual categoria cresce, qual marca de veículo puxa
receita, quais clientes geram valor e onde o funil leak.

**Vendas — Análise Detalhada (PRD-041).** Página única em
`/app/gestao/vendas` com header de filtros globais (período preset
ou custom, loja, vendedor, categoria de peça, marca de veículo e
canal) sincronizados com a URL e 4 abas: Visão Geral, Produtos,
Clientes e Funil. KPIs (faturamento, pedidos pagos, ticket médio,
margem média) reaproveitam o `KpiCard` do painel-gestor com trend
badge versus período anterior. Quatro gráficos macro na Visão Geral
(linha temporal 12 meses, distribuição por categoria, barras por
marca de veículo, pizza por canal) com tooltips ricos e click-to-
filter quando aplicável. Card de sazonalidade dispara quando a
variação year-over-year do mês corrente passa de 25%. Aba Produtos
traz top 20 vendidos com tendência vs período anterior e seção
dedicada para produtos em queda > 30%. Aba Clientes top 20 com
classe ABC heurística (placeholder até PRD-045), ticket médio e
indicador novos vs recorrentes em barras paralelas. Aba Funil é um
funil custom (Recharts limita) com 5 etapas (leads → qualificados
→ orçamentos enviados → aceitos → pedidos pagos), conversão por
etapa e destaque automático do gargalo (queda < 70%). Drill-downs
universais: produto navega para a ficha do catálogo, cliente para
a ficha do cliente, etapas do funil para as listas correspondentes.
Permissões resolvidas no escopo das queries: Owner vê cross-store,
Gestor trava no `currentStore`, Vendedor enxerga apenas pedidos do
próprio `sellerId` (campos travados no header).

### Added

- **Feature `sales-analytics`** (`src/features/sales-analytics/`):
  - `pages/SalesAnalyticsPage.tsx`: entry com guardas de role,
    resolução de escopo (storeId / sellerId) e composição das 4
    abas.
  - `hooks/useSalesFilters.ts`: filtros URL-sincronizados, com
    `resolveSalesWindow()` (current vs previous) cobrindo 7 presets
    (today / yesterday / 7d / 30d / 90d / ytd / custom) e travas
    para Gestor (store) e Vendedor (seller).
  - `hooks/useSalesAnalytics.ts`: agregador principal — carrega
    orders (current + previous + 12 meses), customers, parts e
    sellers em paralelo via `useQuery`, calcula KPIs com tendência,
    série mensal, breakdowns (categoria, marca de veículo, canal),
    top 20 produtos com trend, top 20 clientes com ABC heurístico,
    produtos em queda, novos vs recorrentes e snapshot de
    sazonalidade YoY.
  - `hooks/useFunnelMetrics.ts`: funil lead → qualificado →
    orçamento enviado → aceito → pedido pago com taxa de conversão
    por etapa e detecção automática de gargalo.
  - `components/SalesHeader.tsx`: header com 6 dropdowns de filtros
    (período, loja, vendedor, categoria, marca, canal) + badge de
    contagem ativa e botão de reset.
  - `components/SalesKpiRow.tsx`: 4 KPIs reaproveitando `KpiCard`
    do painel-gestor.
  - `components/SeasonalityCard.tsx`: card destaque ano-versus-ano.
  - `components/ProductsInDeclineCard.tsx`: lista de produtos com
    queda > 30%.
  - `components/NewVsRecurringCard.tsx`: barras paralelas de share.
  - `components/charts/`: `RevenueOverTimeChart` (linha 12 meses),
    `CategoryBarChart` (barras horizontais com filter onClick),
    `VehicleBrandBarChart`, `ChannelPieChart` (donut + legenda),
    `FunnelChart` (custom 5 etapas com bottleneck).
  - `components/tables/`: `TopProductsTable` e `TopCustomersTable`
    com navegação para fichas existentes.
  - `components/tabs/`: `SalesOverviewTab`, `SalesProductsTab`,
    `SalesCustomersTab`, `SalesFunnelTab`.
  - `utils/aggregations.ts`: `groupBy`, `sumBy`, `trendPct`,
    `percentOfTotal`, `topN`, `bucketByMonth`, `last12MonthKeys`.
  - `utils/seasonality.ts`: `computeSeasonalitySignal` (YoY
    threshold 25%) + `formatMonthKey`.
  - `i18n/pt-BR.ts`: strings UI.

### Changed

- **Rota `/app/gestao/vendas`** (`src/routes/app.gestao.vendas.tsx`):
  substitui o `PlaceholderPage` por `<SalesAnalyticsPage />`,
  amplia `requireAuth` para Owner / Gestor / Vendedor / Financeiro
  e instala `validateSearch: validateSalesSearch` para preservar
  filtros copiados/colados.

## [0.24.0] — Logistics · 2026-05-26

Fechamento do Bloco 3 (Comercial Operacional) com duas entregas
encadeadas: Pedido (PRD-032) materializa o ciclo pós-orçamento e
Frete (PRD-033) centraliza o cálculo de envio que vinha duplicado
em três features.

**Pedido (PRD-032).** Lista paginada em `/app/pedidos` com filtros
de status (pagamento e fulfillment), origem, vendedor, cliente,
período e faixa de valor, mais URL sync e indicadores visuais
contextuais. Ficha em `/app/pedidos/:id` com seções de cliente,
items (snapshots imutáveis), pagamento, entrega, histórico e
referência cruzada ao orçamento de origem. Conversão automática
quando um orçamento `aceito` vira `IOrder`, preservando `quoteId`
para auditoria. Integração com `IVehicle`: items aplicados em
veículos registram o serviço no histórico (PRD-016) e atualizam
quilometragem. Geradores produzem pedidos com mix realista de
status de pagamento e fulfillment.

**Frete (PRD-033).** Função pura `calculateShipping()` em
`src/features/shipping/api/` substitui `calculateShippingPlaceholder`
do PRD-022 e os stubs implícitos nos PRDs 031 e 032. Três estratégias
configuráveis (`fixed_by_region` default, `to_negotiate_default`,
`preliminary_by_weight`) com match por especificidade
(cidade → estado → múltiplos estados → nacional) e fallback
configurável quando nenhuma regra casa. Painel admin
`/app/configuracoes/frete` (Owner edita, Gestor visualiza) com
quatro seções: seleção de estratégia, CRUD de regras em tabela
editável com modal, simulador interativo para validar antes de
salvar e card placeholder informando sobre a integração com
transportadoras na Fase 2. Configurações centralizadas em
`IPlatformSettings.shipping` substituem `sdrShippingPlaceholder`,
o card "Frete placeholder" da página de SDR foi trocado por um
link para a nova rota e o `NewQuotePage` ganhou o botão "Calcular"
que usa o endereço do cliente para pré-preencher o campo de frete.

### Added

- **Feature `shipping`** (`src/features/shipping/`):
  - `api/calculate.ts`: função pura `calculateShipping(input)` com
    match por especificidade, sobretaxa por peso opcional e três
    razões de fallback (`missing_address`, `no_active_rules`,
    `no_match_negotiate`/`fixed`).
  - `config/defaults.ts`: `DEFAULT_SHIPPING_CONFIG` com 3 regras
    iniciais (Frederico Westphalen R$ 50 / RS R$ 80 / SC + PR R$ 120)
    e fallback "a combinar".
  - `pages/ShippingConfigPage.tsx`: painel admin completo com 4
    seções (estratégia, regras, simulador, placeholder Fase 2),
    modal de edição/criação de regra, validações no save (nome
    único, valor não-negativo, escopo coerente) e audit log
    `settings.shipping.update`.
- **Tipos shipping** (`src/shared/types/shipping.ts`):
  `IShippingConfig`, `IShippingRate`, `IShippingResult`,
  `ShippingStrategy`, `ShippingScope`, `ShippingDefaultAction`,
  `ShippingResultReason`.
- **Rota** `/app/configuracoes/frete` protegida por
  `requireAuth(["Owner","Gestor"], settings:view)` — Vendedor/SDR
  caem no `Forbidden`.
- **Item "Frete"** no grupo Operação do `SettingsLayout` com ícone
  `mdi:truck-fast-outline`.
- **Botão "Calcular"** no campo de frete do `NewQuotePage` que chama
  `calculateShipping` com endereço do cliente e exibe toast com a
  regra aplicada (ou "a combinar" quando não há match).
- **Feature `orders`** (`src/features/orders/` — PRD-032): páginas
  `OrdersListPage`, `OrderDetailPage`, rotas dedicadas, transições
  de status controladas, conversão a partir de orçamento aceito,
  integração com veículos (histórico de serviço + atualização de
  quilometragem) e gerador de pedidos com mix realista.

### Changed

- `IPlatformSettings.sdrShippingPlaceholder` foi substituído por
  `IPlatformSettings.shipping: IShippingConfig`. A nova estrutura
  é mais rica (estratégia + regras + fallback) e única para todos
  os consumidores.
- `generateSdrQuote` (PRD-022) agora chama `calculateShipping` em
  vez do antigo `calculateShippingPlaceholder`, mantendo a mesma
  semântica de "a combinar" no template.
- `SdrQuoteSettingsPage`: card "Frete placeholder" substituído por
  link "Abrir configurações de frete" apontando para o painel
  centralizado.
- Templates do SDR (`render.ts`) passam a consumir `IShippingResult`
  diretamente — `value` e `isToNegotiate` são os campos usados.
- `seedStore` carrega `shipping: DEFAULT_SHIPPING_CONFIG` no lugar
  do antigo `sdrShippingPlaceholder` hardcoded.

### Removed

- Tipos descontinuados: `ISdrShippingPlaceholderSettings`,
  `ISdrShippingResult`, `SdrOtherStatesAction` (substituídos pelos
  tipos `IShippingConfig` / `IShippingRate` / `IShippingResult`).
- `src/features/sdr-quote/engine/shipping.ts` (placeholder que tinha
  a função `calculateShippingPlaceholder`).
- Exports removidos do barrel `@/features/sdr-quote`:
  `calculateShippingPlaceholder`, `calculateShippingPlaceholderFor`.

## [0.23.0] — Quote · 2026-05-26

Orçamento (PRD-031) — coração do ciclo comercial. Rota `/app/orcamentos`
substitui o placeholder e entrega listagem paginada (50/pg) com 8
filtros (status, origem, vendedor, cliente, período de criação,
faixa de valor, validade, loja) + busca textual em número/cliente/OEM

- URL sync completo, distinção visual de quatro origens (SDR/Manual/
  Portal/E-commerce) e indicador de validade tricolor. Criação manual
  em `/app/orcamentos/novo` com 5 seções estruturadas: cliente
  (autocomplete restrito à carteira para Vendedor), items (modal de
  busca no catálogo com pré-filtro por veículo do cliente + edição
  inline de quantidade/preço/desconto), desconto e frete (com
  justificativa obrigatória quando passa o limite), condições de
  pagamento (método estruturado + prazo + validade) e notas internas.
  Ficha `/app/orcamentos/:id` em 6 seções com header rico (badges,
  ações contextuais por status, banner SDR e banner de aprovação),
  cliente com link para a ficha, items com snapshots imutáveis,
  valores com % de desconto explícito, condições e histórico
  cronológico via audit log filtrado.

Lifecycle completo de 6 estados (rascunho → enviado → aceito/recusado
→ convertido; expirado em qualquer ponto) com transições controladas,
aprovação de desconto >5% por Gestor/Owner (gating do envio até
aprovação, com workflow aprovar/rejeitar + motivo), expiração
automática horária via hook montado no `AppLayout`, conversão em
pedido (`IOrder` real criado preservando referência via `quoteId`),
duplicação que zera aprovação/conversão e renova validade, e envio
WhatsApp placeholder via copy-to-clipboard com texto formatado.
Componente `<CustomerQuotesList>` exportado para futuro consumo, com
a tab "Orçamentos" da ficha do cliente (PRD-012) já atualizada para
usar `quote.number` em vez do id-derivado. Geradores produzem 80
orçamentos com distribuição realista (30% sdr, 50% vendedor,
6% portal, 6% e-commerce) e mix de status calibrado.

### Added

- **Feature `quotes`** (`src/features/quotes/`): páginas
  `QuotesListPage`, `NewQuotePage`, `QuoteDetailPage` + 3 rotas
  (`/app/orcamentos`, `/novo`, `/:id`).
- **Listagem**: `QuotesHeader`, `QuotesFiltersBar` (8 filtros
  multi-select + faixa de valor + período custom), `QuotesTable` com
  ordenação por total/criado/validade, `QuotesPagination`.
- **Criação manual**: `AddItemModal` reusando
  `searchPartsByText`/`searchPartsByApplication` do PRD-030 +
  pré-filtro pelo veículo do cliente, `CustomerAutocomplete`
  restrito à carteira do Vendedor, 5 seções renderizadas com
  numerador visual.
- **Detalhe**: 6 seções (header, cliente, items, valores, condições,
  histórico) com botões contextuais por status (enviar, aceitar,
  recusar, cancelar, converter, duplicar, WhatsApp) e diálogos de
  confirmação via `<AlertDialog>`.
- **Componentes compartilhados**: `QuoteStatusBadge`,
  `QuoteOriginBadge` (4 variantes coloridas com ícones MDI),
  `ValidityIndicator` tricolor (verde/laranja/vermelho conforme
  proximidade da expiração) e `CustomerQuotesList` para a ficha do
  cliente.
- **Hooks**: `useQuotesUrlState` (URL sync de filtros/sort/page),
  `useQuotesList` (filtragem provider-side + client-side composta),
  `useQuote` (drill-down), `useQuoteExpirationTimer` (timer 1h
  global montado no `AppLayout`).
- **Utils**: `recalculateQuote`, `requiresDiscountApproval`,
  `daysUntil`, `validityBucket`, `generateQuoteNumber`
  (sequencial `OR-YYYY-NNNN` por loja/ano), `composePaymentCondition`.

### Changed

- **Modelo `IQuote`** (`src/shared/types/commercial.ts`) recebe
  campos `number`, `conversationId`, `paymentMethod`, `paymentTerms`,
  `deliveryAddress`, `discountReason`, `requiresApproval`,
  `approvedBy`, `approvedAt`, `rejectedReason`, `convertedAt`.
  Tipo `QuotePaymentMethod` exportado no barrel.
- **`IPlatformSettings`** ganha `discountApprovalThresholdPct`
  (default 5%) e `quoteDefaultValidityDays` (default 7).
- **Contrato `IQuotesProvider`** e `quotesApi` aceitam multi-select
  de status/origin, intervalo de criação, faixa de total,
  `conversationId`, busca textual e ordenação configurável.
- **Geradores de quote** (`src/mocks/generators/quote.ts`) reescritos
  para produzir 80 orçamentos com nova distribuição
  (status 10/30/25/15/10/10, origin 30/40/5/5), aprovação
  pré-resolvida quando aplicável e número sequencial.
- **`generateSdrQuote`** (PRD-022) preenche o novo campo `number`
  com prefixo `OR-{YYYY}-S{...}` para distinguir do manual.
- **`QuotesTab`** (PRD-012) usa `quote.number` em vez do id-derivado.
- **`AppLayout`** monta `useQuoteExpirationTimer` para Owner/Gestor.

## [0.22.0] — Catalog · 2026-05-26

Catálogo interno de peças (PRD-030) — núcleo do negócio agora
materializado. Rota `/app/catalogo` substitui o placeholder e entrega
listagem paginada (50/pg) com 8 filtros combinados (categoria,
subcategoria dependente, fabricante, original/equivalente, veículo
compatível marca+modelo+ano, faixa de preço, estoque, status, loja),
busca textual com debounce 300ms e URL sync completo. Ficha
`/app/catalogo/:id` em 5 seções: header com badges (categoria,
original/equivalente), aplicações agrupadas por marca com mini-filtro
de compatibilidade ao vivo, equivalências com % de economia e
navegação cruzada, comercial com histórico de preço expansível
(audit log filtrado) e estoque com indicador visual (verde/amarelo/
vermelho). Criação/edição com editor multi-row de aplicações,
autocomplete de equivalências com **bidirecionalidade automática**
(adicionar B em A.equivalents propaga A em B.equivalents e vice-versa),
validação de OEM duplicado e audit log especial em mudança de preço.
Funções de busca exportadas em `@/features/catalog/api/search`
(`searchPartsByApplication`, `findByOemCode`, `findByAlternativeCode`,
`getEquivalents`, `searchPartsByText`) prontas para serem consumidas
pelos PRD-021 (identificação SDR), PRD-016 (peças compatíveis com
veículo), PRD-031 (orçamento) e Bloco 5 (e-commerce).

### Added

- **Feature `catalog`** (`src/features/catalog/`): páginas
  `CatalogListPage`, `PartDetailPage`, `PartNewPage`, `PartEditPage`.
- **Listagem com filtros**: `CatalogHeader`, `CatalogFiltersBar`
  (8 filtros multi-select via Popover/Select + chip "N filtros ativos"),
  `CatalogTable` com ordenação por nome/preço/estoque, `CatalogPagination`
  com PAGE_SIZES configurável (25/50/100).
- **Ficha de produto**: `PartDetailHeader`, `ApplicationsSection`
  (grouped by brand + mini-filtro inline para verificar compatibilidade),
  `EquivalentsSection` (cards com % economia e navegação cruzada),
  `CommercialSection` (expansível com histórico de preço via audit),
  `StockSection` com `StockBadge` colorido.
- **Criação/edição**: `PartForm` reutilizado por `PartNewPage` e
  `PartEditPage`, `ApplicationsEditor` multi-row e `EquivalentsEditor`
  com autocomplete; preço gated por permissão de Owner (Gestor vê
  read-only com tooltip).
- **API de busca** (`api/search.ts`): funções puras consumidas
  cross-feature — `searchPartsByApplication`, `findByOemCode`,
  `findByAlternativeCode`, `getEquivalents`, `searchPartsByText`.
- **Hooks**: `useCatalogList` com filtragem client-side para critérios
  não suportados pelo provider (categorias, aplicações, origem, faixa
  de preço, buckets de estoque, multi-store); `useCatalogUrlState`
  com 17 search params validados; `useEquivalentsBidirectional` para
  reconciliação atômica de equivalências.
- **Componentes reutilizáveis**: `<PartImage>` (placeholder por
  categoria com cor temática, fallback automático quando `imageUrl`
  ausente), `<StockBadge>` (variant default/compact, 3 cores).
- **Utilitários**: `PART_CATEGORY_DESCRIPTORS` com 10 categorias
  - ícones Iconify + tons + subcategorias; `activeFilterCount`,
    `toListParams`, `EMPTY_FILTERS`.
- **i18n**: `pt-BR.ts` cobrindo lista, filtros, ficha, form e toasts
  com português correto e acentos UTF-8.

### Changed

- **Tipo `IPart`** (`src/shared/types/catalog.ts`): novos campos
  opcionais `category`, `subcategory`, `isOriginal`, `imageUrl`,
  `storeId` — compatíveis com schema futuro do DINTEC.
- **Gerador `generatePart`** (`src/mocks/generators/part.ts`):
  popula `category` (mapeado para canonical via
  `CATALOG_CATEGORY_TO_CANONICAL`), `subcategory` (do pool por
  família), `isOriginal` (heurística por brand/supplier "OEM"),
  `storeId` (matriz no MVP); distribuição de estoque ajustada para
  70% normal / 20% baixo / 10% zerado conforme RF-005.
- **Permissões** (`src/features/rbac/permissions/matrix.ts`):
  Gestor ganhou `create` + `edit` em `part` (mantém `delete` apenas
  para Owner — desativação Owner-only).
- **Rota `/app/catalogo`** virou layout (Outlet) e ramifica em
  `/`, `/:id`, `/novo`, `/:id/editar` com `beforeLoad` guards via
  `hasPermission`.

### Audit log

Adicionadas 6 actions: `part_create`, `part_update`, `part_price_change`
(disparada apenas quando `unitPrice` mudou — destaque em CommercialSection),
`part_application_update` (pendente; coberto por part_update), `part_equivalent_update`
(disparada em ambos os lados pela reconciliação bidirecional),
`part_activate` / `part_deactivate`.

## [0.21.0] — Cockpit · 2026-05-26

Painel completo do agente SDR (PRD-024) — hub centralizado em
`/app/sdr` com 5 abas (Visão Geral, Histórico, Métricas, Templates,
Configurações) que reúne todo o ciclo de vida do SDR num só lugar.
Owners ganham KPIs comparativos com período anterior, drill-down em
sessões individuais com timeline reconstituída (saudação → coleta →
identificação → orçamento → escalação → finalização), gráficos
detalhados (heatmap volume 7×24, FAQ resolvido vs escalado, pie de
motivos de escalação, TTFR por modo), editor centralizado de todos
os templates (core PRD-020 + orçamento PRD-022 + handoff PRD-023)
com syntax highlight de variáveis e preview ao vivo, e configurações
consolidadas com confirmação ao desligar o SDR globalmente. Banner
de alertas proativos no topo (taxa subindo, intent unknown, templates
default) sinaliza quando Owner precisa agir.

### Added

- **Feature `sdr-dashboard`** (`src/features/sdr-dashboard/`):
  página principal `SdrDashboardPage`, 5 tabs em components/tabs/,
  hooks `useSdrDashboardFilters`, `useSdrDashboardData` (agregador
  reativo a `ESCALATION_QUEUE_EVENT`), `useSdrAlerts`,
  `useSdrSessionContext`, `useSdrHistoryFilters`.
- **Visão Geral**: 4 KPIs (sessões, taxa de escalação, taxa de
  aceite de orçamento, TTFR médio) com tendência vs período anterior,
  gráfico de linha Recharts para volume diário, pizza para
  distribuição de `finishReason`, banner de alertas no topo.
- **Histórico**: tabela paginada (30/página) com 4 filtros
  (estado final multi-select, motivo da escalação, vendedor
  escalado, com/sem orçamento), URL sync, modal
  `SdrSessionDetailModal` com timeline cronológica de eventos
  (saudação, qualificação, identificação PRD-021, orçamento
  PRD-022, escalação PRD-023, finalização), trace JSON expansível
  e navegação direta para a conversa.
- **Métricas detalhadas**: heatmap SVG nativo 7×24 com click
  direcionando para a aba Histórico, BarChart FAQ resolvido vs
  escalado por categoria (horário/entrega/pagamento/garantia),
  pie chart distribuição de motivos de escalação, BarChart TTFR
  por modo (urgent/normal/standard).
- **Editor de templates centralizado**: accordions agrupando os
  20+ templates do SDR (saudação, qualificação, FAQ, escalação
  core do PRD-020 + 4 slots de orçamento do PRD-022 + handoff
  do PRD-023). Cada editor com syntax highlight para `{{var}}`,
  preview ao vivo com variáveis exemplo preenchidas, glossário
  contextual de variáveis, validação de variáveis desconhecidas
  e botão restaurar padrão. Audit log em cada save.
- **Configurações consolidadas**: toggle SDR ativo (com
  confirmação forte ao desligar via AlertDialog), sliders para
  validade do orçamento (1-30 dias), desconto autorizado (0-10%),
  timeout urgent/normal e delay de broadcast. Salvar atômico
  agrupa todas as mudanças num único audit log com sumário das
  alterações.
- **Hook `useSdrAlerts`** calcula 3 tipos de alerta proativos:
  taxa de escalação subindo > 20%, 5+ sessões com intenção
  indefinida na última hora, templates ainda em valores padrão.
- **Volume de mocks**: dataset cresceu de 20 para 100 sessões
  SDR históricas para que o painel renderize ~4 páginas de
  backlog crível.

### Changed

- **Rota `/app/sdr`** substitui o placeholder que mostrava apenas
  o card de métricas de escalação — agora carrega
  `SdrDashboardPage` completo com 5 abas. Guard aceita
  `Owner` e `Gestor`; Gestor vê tudo em modo leitura
  (banner explícito + inputs disabled).
- **`validateSearch`** da rota foi tipado para aceitar os
  parâmetros de filtro de período, loja, estado final, motivo,
  vendedor, quote e página.

### Marco

Com PRD-024, **Bloco 2 (SDR) está completo**. Os 5 PRDs do
agente IA (020 simulação, 021 identificação, 022 orçamento,
023 escalação, 024 painel) entregam um SDR funcional 24/7,
auditável e configurável fim a fim.

## [0.20.0] — Handoff · 2026-05-26

Handoff estruturado SDR → vendedor humano (PRD-023) — quando o SDR
detecta que precisa transferir (cliente pediu humano, negociação,
falha repetida), o sistema compõe um resumo de contexto rico,
escolhe o melhor vendedor disponível (carteira → especialidade →
disponibilidade), envia uma mensagem de despedida ao cliente,
persiste um bubble system com todo o histórico relevante e atribui
a conversa. Modo `urgent` faz broadcast aos vendedores online se
o titular não responder em 30s; modo `normal` segue cascata padrão;
modo `standard` aguarda a fila com timeout configurável (5min
urgent / 30min normal). Métricas TTFR/abandono/conversão alimentam
o painel SDR (PRD-024).

### Added

- **Tipos novos** em `src/shared/types/sdr-escalation.ts`:
  `ISdrEscalation` (registro persistente), `ISdrContextSummary`
  (snapshot estruturado), `ISdrEscalationVehicle`,
  `ISdrEscalationPart`, `ISdrEscalationQuote`,
  `ISdrEscalationTraceStep`, `SdrEscalationReason`,
  `SdrEscalationMode` e `SdrEscalationStatus`.
- **`IPlatformSettings`** ganha 4 campos (PRD-023 RF-002):
  `escalationQueueTimeoutMinutesUrgent` (5min),
  `escalationQueueTimeoutMinutesNormal` (30min),
  `escalationCustomerHandoffTemplate` (template editável) e
  `escalationUrgentBroadcastDelaySeconds` (30s).
- **Engine `escalateToHuman()`** (`features/sdr-escalation/engine/escalate.ts`)
  — função pura que detecta modo (`urgent`/`normal`/`standard`) a
  partir do motivo, chama `chooseHumanSeller()` e devolve o registro
  - seleção sem side effects.
- **Engine `chooseHumanSeller()`** — reusa a lógica do PRD-013 com
  3 adaptações: carteira sempre vence (mesmo offline em modo
  normal/standard), especialidade casa contra a marca identificada
  pelo PRD-021, modo `urgent` força preferência por `online`
  (substitui titular offline).
- **`buildContextSummary()`** — compõe `ISdrContextSummary` agregando
  sessão SDR + cliente + veículo + peça (PRD-021) + orçamento
  (PRD-022) com tempo no SDR, número de mensagens e trace de estados.
- **`renderEscalationBubble()` + `renderCustomerHandoff()`** —
  templates de renderização. O bubble system carrega cabeçalho
  destacado "🤖 ESCALADO PELO SDR — \<modo\>", seções condicionais
  (cliente, veículo, peça, orçamento) e separadores visuais. A
  mensagem ao cliente usa placeholders `{{saudacao_nome}}` e
  `{{resumo_curto}}`.
- **Hook `useSdrEscalation()`** — orquestra o handoff: monta
  contextSummary, roda o engine, envia handoff message + bubble,
  patcha conversation (`assignedSellerId`, `isSdrActive=false`),
  finaliza session (`finishReason='escalated'`), persiste registro
  e grava audit log atômico.
- **Hook `useEscalationToasts()`** — escuta novas escalações e dispara
  toast prominente para o vendedor recém-atribuído com botão
  "Atender agora". Modo urgent usa `toast.error` com cor + duração
  reforçadas.
- **Hook `useUrgentBroadcastTimer()`** — Owner/Gestor mantém o timer
  rodando; após 30s sem resposta do escolhido, marca
  `urgentBroadcastAt`, emite `sdr_escalate_broadcast`, dispara o
  evento de fila e gera toast de alerta.
- **Hook `useEscalationQueueTimeoutMonitor()`** — monitora
  escalações `pending` cujo tempo em fila ultrapassou
  `escalationQueueTimeoutMinutes*` e notifica o Owner; também
  marca como `abandoned` após 1h sem resposta humana (RF-020).
- **Hook `useEscalationMetrics()`** — devolve TTFR médio, taxa de
  abandono, taxa de resposta, acerto de especialidade e contagem
  por modo (PRD-023 RF-021). Recalcula via `window` event.
- **Hook `useUrgentBroadcastQueue()`** — gerencia a fila de
  broadcasts urgentes ativos, expõe `claim()` para o primeiro
  vendedor assumir.
- **Hook `useEscalationsByConversation()` + `useConversationEscalation()`** —
  lookups reativos consumidos pela inbox e pela conversa.
- **Componentes** `EscalationBadge` (compact + banner) e
  `UrgentBroadcastClaim` (painel flutuante de claim para urgentes).
- **Inbox (PRD-010)** — item de conversa escalada ganha badge
  "🤖 Escalado · \<modo\>"; borda esquerda em `--brand-parts`
  durante os 60s após a escalação (RF-016); filtro "Escaladas pelo
  SDR" no chip bar.
- **Conversa (PRD-011)** — header ganha banner prominente
  "🤖 Esta conversa foi escalada pelo SDR — \<modo\>" abaixo do
  título (RF-017). Modo urgente pulsa.
- **`UrgentBroadcastClaim`** fixo no `AppLayout` (canto inferior
  direito) — primeiro a clicar "Atender agora" assume.
- **Página `/app/sdr`** ganha `EscalationMetricsCard` para Owner
  visualizar TTFR, abandono, taxa de resposta, acerto de
  especialidade e volume por modo. PRD-024 vai expandir.
- **Provider novo** `sdrEscalations` (`ISdrEscalationsProvider`)
  com mock + stub Supabase. Hook `useSdrEscalationsProvider()`.
- **Mocks** — 30 escalações históricas (`generateSdrEscalation`)
  com mix de status (answered 55% / assigned 25% / pending 10% /
  abandoned 10%) e modos ponderados pela razão.
- **Audit log** — eventos `sdr_escalate`, `sdr_escalate_assign`,
  `sdr_escalate_broadcast`, `sdr_escalate_broadcast_claim`,
  `sdr_escalate_queue_timeout` e `sdr_escalate_abandoned`.

### Changed

- **`useSdrResponder()`** aceita `onEscalate?: (info) => void`
  opcional — quando o engine emite `escalate_to_human`, o callback
  recebe a sessão atualizada + motivo. Permite ligar o handoff
  estruturado a partir do simulador / inbox sem quebrar consumidores
  existentes.
- **`ConversationHeader`** e **`ConversationListItem`** aceitam a
  prop opcional `escalation` para renderizar os badges/banner.
- **`InboxFilters`** ganha toggle "Escaladas pelo SDR" e
  `useInboxFilters` persiste `escalated` no URL search.

### Notes

- **`PRD-023`** marcado como `_DONE` após esta release.
- **Provider Supabase** segue stub; tabela `sdr_escalations` chega
  na Fase 2 junto com `sdr_sessions`.
- Toast prominente reaproveita `sonner` — modo urgent usa
  `toast.error` para diferencial visual sem mudar a infra.

## [0.19.0] — Quotemaster · 2026-05-26

Geração automática de orçamento via SDR (PRD-022) — quando o cliente
confirma a peça identificada (PRD-021), o SDR compõe um `IQuote`
estruturado (origin='sdr') com precificação base, frete preliminar
por região, validade configurável e envia mensagem rica formatada
para o WhatsApp com 3 opções (aceitar/recusar/falar com vendedor).
Pipeline puro (`generateSdrQuote` → `renderQuoteMessage` →
`parseQuoteResponse`) preparado para troca por serviço backend na
Fase 2 sem refatorar consumidores.

### Added

- **Tipos novos** em `src/shared/types/sdr-quote.ts`:
  `ISdrQuoteTemplates` (4 slots), `ISdrShippingPlaceholderSettings`,
  `ISdrShippingResult`, `ISdrPendingQuote`, `IQuoteResponseMatch`,
  `QuoteResponseIntent` e `SdrOtherStatesAction`.
- **`IPlatformSettings`** ganha 4 campos novos (PRD-022 RF-002):
  `sdrQuoteValidityDays` (default 7), `sdrAutoDiscountPct`
  (default 0), `sdrQuoteTemplates` (4 templates editáveis) e
  `sdrShippingPlaceholder` (mesma cidade R$ 50, mesmo estado R$ 80,
  outros estados "a combinar").
- **`SdrSessionState`** ganha `aguardando_resposta_orcamento` e
  `aguardando_dados_pedido` — `ISdrCollectedData` ganha
  `pendingQuote`, `paymentMethod`, `deliveryPreference` e
  `pendingOrderId`.
- **Engine `generateSdrQuote()`** (`features/sdr-quote/engine/generate.ts`)
  — função pura que recebe `IPartIdentification` confirmada, busca
  preço em `IPart`, aplica desconto (se autorizado), calcula frete
  via placeholder, monta `IQuote` com `origin='sdr'`,
  `status='enviado'`, `validUntil = now + sdrQuoteValidityDays`.
- **Engine `calculateShippingPlaceholder()`** (RF-008) — decisão por
  região: mesma cidade / mesmo estado / outros estados (com modo
  `to_negotiate` ou `fixed_value`). Trace de motivo (`same_city`,
  `other_state_negotiate`, `missing_address`) consumido pelo
  inspetor.
- **`renderQuoteMessage()`** + 3 renderizadores específicos
  (`renderAcceptMessage`, `renderRejectMessage`,
  `renderEscalateMessage`) com substituição de variáveis
  (`{{peca_nome}}`, `{{valor_unitario}}`, `{{total}}`,
  `{{frete_formatado}}`, `{{validade}}`, `{{cliente_nome}}`, etc.).
  Auxiliar `{{cliente_nome_separador}}` colapsa vírgula quando não
  há nome.
- **`parseQuoteResponse()`** classifica resposta do cliente em 5
  intents (`accept`, `reject`, `escalate`, `negotiate`, `unknown`)
  via regex priorizado. "tá caro" / "tem por menos" / "desconto"
  caem em `negotiate` e escalam automaticamente para humano.
- **4 templates default** (`DEFAULT_SDR_QUOTE_TEMPLATES`):
  generation (mensagem rica com emoji), accept (pergunta pagamento +
  prazo), reject (oferece alternativas), escalate (passa pra
  vendedor).
- **Integração com SDR (PRD-020)** —
  `sdrRespond()` agora detecta sequência completa em 3 níveis:
  - Quando `pendingPartIdentification` resolve confirmada e há
    `context.parts + context.customer`, gera quote inline,
    transiciona para `aguardando_resposta_orcamento` e emite
    `quote_generated`.
  - Quando `pendingQuote` existe, roteia a resposta via
    `parseQuoteResponse`: aceite vai para `aguardando_dados_pedido`,
    recusa volta para `roteamento`, escalate/negotiate finalizam
    com `escalate_to_human`, unknown re-pergunta.
  - Quando state é `aguardando_dados_pedido`, captura método de
    pagamento (PIX/Boleto/Cartão/Dinheiro detectados por regex) e
    prazo de entrega, salva em `collectedData` e finaliza.
  - Suporta orçamento expirado (RF-025): detecta `now > validUntil`
    e responde "Esse orçamento já passou da validade. Vou gerar um
    novo."
- **`useSdrResponder()`** persiste quote via
  `useQuotesProvider().create()` em resposta a `quote_generated`;
  no aceite, atualiza status para `aceito` e cria `IOrder`
  placeholder via `useOrdersProvider().create()` (stub PRD-032 com
  margin estimada 30%) — retorna `persistedQuote` e `orderStubId` no
  resultado do turno. 7 novos audit actions: `sdr_quote_create`,
  `sdr_quote_accepted`, `sdr_quote_rejected`,
  `sdr_quote_negotiate_detected`, `sdr_quote_escalate`,
  `sdr_quote_unknown_reply` e `sdr_order_stub_created`.
- **Hook `useSdrQuoteMetrics()`** calcula totalQuotes, acceptedRate,
  rejectedRate, pendingCount, movedRevenue e averageTicket sobre
  quotes com `origin='sdr'` — alimenta painel SDR (PRD-024) e a
  página admin de configurações.
- **Página `/app/configuracoes/sdr/orcamento`** (Owner-only) — 4
  blocos: 4 cards de métrica no topo (total/aceite/recusa/valor
  movido), card de regras gerais (slider de validade 1-30 dias,
  slider de desconto 0-10%), card de frete placeholder (4 campos
  numéricos + select `to_negotiate | fixed_value` + cidade/UF da
  loja), card de templates com `Textarea` por slot e botão
  "Restaurar padrão". Sticky footer com salvar/descartar e
  `UnsavedChangesDialog` no exit.
- **Item de menu "Orçamento automático"** adicionado em "Agente
  SDR" do `SettingsLayout`.
- **Simulador SDR** passa stub `SIM_CUSTOMER` (Frederico Westphalen,
  para que o cálculo de frete caia em `sameCityValue`) e exibe
  mensagens `system` quando `quote_generated` ou `quote_response`
  são emitidos pela engine, mostrando intent detectada e keywords.

### Changed

- `ISdrAction` ganha 4 variantes novas: `quote_generated`,
  `quote_response`, `order_stub_created`, e `create_quote` agora
  carrega `identificationId?: ID`.
- `ISdrTrace` ganha `pendingQuote` e `quoteResponseIntent`;
  `templateUsed` aceita 7 triggers novos (`quote_generation`,
  `quote_accept`, `quote_reject`, `quote_escalate`, `quote_unknown`,
  `quote_expired`, `order_captured`).
- `seedStore.ts` injeta as 4 configurações novas com defaults
  conservadores (frete same-city R$ 50, sem desconto automático,
  validade 7 dias).

### Notes (Fase 2)

- Cálculo de frete real via integração transportadora substitui
  `calculateShippingPlaceholder` quando PRD-033 entregar.
- Persistência do quote via `useQuotesProvider` é stub mock —
  `useOrdersProvider().create()` para pedido aceito também é
  placeholder até PRD-032 (checkout completo com pagamento).
- Geração de PDF do orçamento, expiração automática com lembrete
  e múltiplos itens por quote ficam para Fase 2.
- Edição de templates pelo Owner é texto livre — Fase 2 ganha
  preview lado-a-lado e validação de placeholders.

## [0.18.0] — Scout · 2026-05-26

Engine de identificação de peças (PRD-021) — o SDR passa a entender
"preciso de filtro de óleo Volvo FH 460 2020 motor D13K460" extraindo
marca, modelo, ano, motor, categoria e subtipo da peça em uma única
mensagem, busca no catálogo via pesos por aplicação, classifica a
confiança em verde/amarelo/vermelho e propõe top 3 candidatos
(originais + equivalentes) com mensagem pronta para o WhatsApp. A
arquitetura é toda função pura (`extractAttributes`, `searchCatalog`,
`scoreCandidate`, `decideAction`, `formatConfirmationMessage`,
`identifyPart`), preparada para troca por LLM na Fase 2 sem refatorar
consumidores.

### Added

- **Tipos novos** em `src/shared/types/part-identification.ts`:
  `IPartIdentification`, `IPartCandidate`,
  `IPartIdentificationDecision`, `IExtractedAttributes`,
  `AttributeConfidence`, `PartIdentificationStatus`,
  `PartIdentificationActionKind` e `PartCategory` (10 famílias —
  filtro, freio, correia, motor, embreagem, elétrica, transmissão,
  suspensão, arrefecimento, lubrificante).
- **Lookup tables** em `src/features/part-identification/data/`:
  - `brands.ts` — 5 marcas (Volvo, Scania, Mercedes-Benz, Ford Cargo,
    Iveco) com aliases ("mercedes-benz", "mb", "cargo"…).
  - `models.ts` — 18 modelos por marca, cada um com aliases sem espaço
    ("R450" ≡ "r 450").
  - `engines.ts` — 18 motores por marca (D13K460, DC13, OM 457 LA,
    Cursor 13…).
  - `partCategories.ts` — 10 categorias + 40+ subtipos (óleo, ar,
    combustível, cabine; pastilha, lona, tambor; etc.).
- **Engine de extração** (`engine/extract.ts`) — parsers individuais
  com confidence por atributo (`extractBrand`, `extractModel`,
  `extractYear`, `extractEngine`, `extractPartCategory`,
  `extractPartSubtype`, `extractOemCode`); orquestrador
  `extractAttributes(text, context)` que reaproveita
  `context.vehicles[0]` quando o cliente tem 1 veículo cadastrado e
  marca/modelo não vieram na mensagem; flag
  `multipleVehiclesAmbiguous` quando a frota tem 2+ caminhões.
- **Engine de busca** (`engine/search.ts`) — `searchCatalog(attrs,
parts)` recebe um snapshot de `IPart[]` (sem acoplamento com
  provider); short-circuit por código OEM exato; `scoreCandidate()`
  com pesos `SCORE_WEIGHTS` mandatórios pelo PRD (marca 0.35, modelo
  0.30, ano 0.15, motor 0.10, categoria 0.10, equivalente -0.05);
  inclui equivalentes (`IPart.equivalentPartIds`) do top candidato;
  `searchCatalogWithFallback()` emite 3 candidatos estilizados quando
  o catálogo está vazio.
- **Engine de decisão** (`engine/decide.ts`) — `decideAction()` com 3
  estratégias: `confirm_auto` (1 candidato score > 0.9), `ask_user`
  (2+ com score >= 0.6), `request_more_info` (top score < 0.6 ou
  poucos candidatos); calcula lista de atributos faltantes para
  perguntas específicas.
- **Engine de formatação** (`engine/format.ts`) —
  `formatConfirmationMessage()` com 3 templates por kind de decisão;
  destaca economia em equivalentes (>= 5% vs original);
  `parseCustomerChoice()` aceita "1", "2", "3", "primeiro", "segundo",
  "terceiro"; constantes `PHOTO_PLACEHOLDER_MESSAGE` (RF-020) e
  `OEM_NOT_FOUND_MESSAGE` (RF-019).
- **Orquestrador `identifyPart()`** (`engine/identify.ts`) — função
  pura que encadeia extract → search → decide e devolve
  `IPartIdentification` completa; `applyCustomerChoice()` para
  resolver para `confirmed` / `rejected` / `failed`.
- **Integração com SDR (PRD-020)** —
  - `sdrRespond()` ganha 4º argumento opcional
    `context: { parts?, customer?, vehicles? }`; quando presente, na
    intent `identificar_peca` chama `identifyPart()` inline e usa o
    texto formatado como `send_message` (em vez de uma pergunta
    genérica).
  - Curto-circuito de foto: qualquer `IMessage` com
    `mediaType="image"` recebe `PHOTO_PLACEHOLDER_MESSAGE` antes do
    pipeline normal.
  - Resolução automática de identificação pendente: quando a sessão
    tem `pendingPartIdentification` e a próxima mensagem casa com
    "1/2/3/primeiro/segundo/terceiro", o engine resolve para
    `confirmed`, marca `collectedData.identifiedPart` e emite
    `create_quote` (stub do PRD-022).
  - `ISdrCollectedData` ganha `pendingPartIdentification` e
    `partIdentificationHistory`; `ISdrAction` ganha
    `part_identification_resolved`; `ISdrTrace` ganha
    `partIdentification`, `partIdentificationUsedFallback` e
    `partIdentificationResolved`.
- **`useSdrResponder()`** repassa `parts/customer/vehicles` para a
  engine; novos audit logs `sdr_identify_part_requested` (com decisão
  - confidence + nº de candidatos), `sdr_identify_part_resolved` e
    `sdr_photo_received` (OCR pendente Fase 2).
- **Simulador `/app/configuracoes/sdr/simulador`** carrega catálogo
  via `usePartsProvider().list({ pageSize: 60 })` e injeta na engine.
  Inspetor à direita ganha 3 seções novas:
  - **Identificação de peça** — atributos extraídos em chips
    coloridos (verde >= 85%, amarelo 60-84%, vermelho < 60%),
    decisão, lista de candidatos com score, marca, preço, tag
    "equiv." e atributos casados, mais legenda dos pesos.
  - **Histórico de identificações** — últimas 20 com status colorido,
    nome do top candidato e trecho do raw input.
  - **Botão de foto** ao lado do input — envia `IMessage` com
    `mediaType='image'` para testar o placeholder OCR.

### Changed

- `ISdrCollectedData` adiciona `pendingPartIdentification?` e
  `partIdentificationHistory?` — `applyResponseToSession()` mantém o
  histórico (últimos 20) e limpa o slot pending quando o engine
  retorna `undefined` explicitamente.
- `sdrRespond()` mantém assinatura backward compatible — o 4º
  argumento é opcional e default `{}`; chamadas existentes continuam
  funcionando com o template `pergunta_necessidade` como fallback.

### Notes (Fase 2)

- OCR real (Tesseract.js ou Google Vision) substitui o placeholder
  quando o cliente envia foto da peça.
- Substituir parsers por LLM mantém `extractAttributes()` /
  `searchCatalog()` / `decideAction()` com a mesma assinatura — os
  consumidores não mudam.
- Edição de lookup tables (marcas, modelos, motores) ganha
  sub-rota `/app/configuracoes/sdr/dicionarios` (placeholder no MVP).
- Histórico de identificações ganha aba dedicada no painel do SDR
  (PRD-024) com filtros por status e período.

## [0.17.0] — Concierge · 2026-05-26

Agente SDR simulado (PRD-020) — o assistente IA do GALLO BASE DIESEL
ganha um engine puro, máquina de estados de 7 transições, 8 templates
editáveis com substituição de variáveis (`{{nome}}`, `{{empresa}}`),
classificador de intenção por keywords em 6 categorias e um painel de
simulação interativo. A arquitetura está preparada para troca por
LangChain/OpenAI na Fase 2 sem refatorar consumidores.

### Added

- **Engine puro `sdrRespond()`** (`src/features/sdr/engine/respond.ts`)
  — função determinística que recebe `IMessage` + `ISdrSession` +
  `IPlatformSettings` e devolve `ISdrResponse` com `nextState`,
  `actions[]`, `updatedCollectedData`, `trace` e `finishReason`. Sem
  side effects: hooks externos é que mutam o mock store.
- **Classificador de intenção `detectIntent()`** com 6 categorias
  (`escalar_humano`, `gerar_orcamento`, `identificar_peca`,
  `faq_horario`, `faq_entrega`, `texto_livre`). Pattern matching simples
  por keyword, lowercase + includes, com prioridade declarativa.
- **Sistema de templates** — `renderTemplate()` faz substituição de
  variáveis `{{nome}}`, `{{empresa}}` com fallback (`"amigo"`) quando
  ausente. 8 templates default seedados no `IPlatformSettings.sdrTemplates`.
- **Tipos novos** em `src/shared/types/sdr.ts`: `ISdrSession`,
  `ISdrTemplate`, `ISdrCollectedData`, `ISdrIntentMatch`, `ISdrAction`,
  `ISdrTrace`, `ISdrResponse`, `SdrSessionState`, `SdrFinishReason`,
  `SdrTemplateTrigger`, `SdrIntent`. `IPlatformSettings` ganha
  `sdrEnabled: boolean` e `sdrTemplates: ISdrTemplate[]`.
- **20 sessões SDR mockadas** geradas no bootstrap com mix de
  `finishReason` (escalated 30%, completed 35%, abandoned 20%,
  paused_by_human 15%) — alimentam métricas e simulador.
- **API mock `sdrSessionsApi`** + contract `ISdrSessionsProvider` +
  hook `useSdrSessionsProvider()`. Stub Supabase preparado para Fase 2.
- **Hooks** — `useSdrResponder()` orquestra um turno (carrega/cria
  sessão, chama engine, persiste mensagens `out` com `authorType='sdr'`,
  audit log de transições); `useSdrPauseOnHumanIntervention()` pausa
  sessão quando vendedor envia mensagem `out` em conversa com SDR ativo;
  `useSdrReactivate()` reativa via menu ⋮; `useSdrMetrics()` calcula 7
  métricas (total, taxa de escalação/completion/abandono, duração média,
  resolução de FAQ, volume fora do horário) — alimentam PRD-024.
- **Página `/app/configuracoes/sdr/simulador`** — interface 2 colunas:
  conversa simulada à esquerda (bubbles cliente/SDR/system, input para
  enviar como cliente, indicador "digitando") e inspetor à direita
  (estado da sessão, dados coletados, último turno com intent/template/
  variáveis, lista de templates ativos). Botões Reiniciar e Salvar caso
  (persiste no localStorage). Acesso restrito a Owner/Gestor.
- **Página `/app/configuracoes/sdr/templates`** — editor visual dos 8
  templates default. Detecta variáveis usadas no texto, valida contra
  vocabulário conhecido (`nome`, `empresa`), permite restaurar para o
  padrão. Toggle global "Agente SDR ativo" no topo controla
  `sdrEnabled`. Acesso restrito a Owner.
- **Nova categoria "Agente SDR" na sidebar de Configurações** com 2
  itens (Simulador + Templates de mensagem), filtrados por papel.
- **Sincronia automática SDR session ↔ flag `isSdrActive`** no menu ⋮
  da conversa — quando Owner/Gestor pausa o SDR pelo menu, a sessão
  associada também transita para `state='pausado'` com
  `finishReason='paused_by_human'`. Reativação restaura o estado anterior
  via `pausedFromState`.
- **Audit log padronizado** para todas as ações SDR: `sdr_session_start`,
  `sdr_state_transition`, `sdr_escalate`, `sdr_identify_part_requested`,
  `sdr_quote_requested`, `sdr_paused_by_human`, `sdr_reactivated`.

### Changed

- `IBootstrappedDataset` ganha `sdrSessions: ISdrSession[]`; mutations
  e seletores aceitam a nova coleção.
- `SEED_STORE.settings` agora seedaa `sdrEnabled: true` e os 8 templates
  default — bootstrap atualiza automaticamente.

## [0.16.0] — Cockpit · 2026-05-26

Configurações Administrativas (PRD-019) — o hub `/app/configuracoes`
deixa de ser placeholder e ganha **cinco categorias** (Pessoal,
Administração, Operação, Integrações, Avançado) com 16 sub-rotas,
edição funcional para o subconjunto especificado no MVP e placeholders
informativos coerentes para as áreas que serão expandidas na Fase 2.
A sidebar filtra itens por papel e permissão RBAC, garantindo que
Vendedores só vejam Perfil/Aparência, Gestores vejam o operacional e
Owners vejam o hub completo.

### Added

- **Hub renovado em `/app/configuracoes`** — substitui o
  `PlaceholderPage` por um `SettingsLayout` agrupado em 5 categorias
  (Pessoal / Administração / Operação / Integrações / Avançado).
  Filtra itens visíveis por papel/permissão (PRD-019 RF-003), suporta
  navegação por teclado e tem versão mobile via `Sheet` drawer.
  `GET /app/configuracoes` redireciona para `/app/configuracoes/perfil`
  (PRD-019 RF-004).
- **`/app/configuracoes/perfil`** — qualquer usuário autenticado pode
  editar nome, email, telefone e (para vendedores externos) região do
  próprio cadastro. Valida email, exibe iniciais como avatar e dispara
  audit log via `useSellersProvider().update()`. Modal de
  confirmação avisa antes de descartar mudanças não salvas.
- **`/app/configuracoes/atendimento/motivos-perda`** — CRUD simples
  da `IPlatformSettings.lossReasons` usada pelo modal "Marcar como
  perdido" (PRD-017). Suporta adicionar, remover e ativar/desativar
  motivos com toast de confirmação e audit log automático.
- **`/app/configuracoes/atendimento/lifecycle`** — dois sliders
  configuram `dormantDays` (30–180) e `lostDays` (180–720). Pré-visualiza
  o impacto em tempo real: mostra quantos clientes seriam considerados
  dormentes/perdidos com o novo limiar e a variação vs. atual. Valida
  que `lostDays > dormantDays`.
- **`/app/configuracoes/atendimento/horario-comercial`** — embed do
  `BusinessHoursSection` do PRD-013, mas servido fora do painel de
  distribuição para deixar a configuração descobrível.
- **`/app/configuracoes/atendimento/pipeline`** — visualização
  read-only dos estágios atuais com cor, ordem e badge "Edição
  disponível na Fase 2". Botão "Sugerir mudança" desabilitado com
  tooltip explicativo.
- **`/app/configuracoes/atendimento/tags`** — listagem em duas seções:
  catálogo oficial (`IPlatformSettings.tagSuggestions`) e tags livres
  detectadas em uso por clientes mas fora do catálogo. Owner e Gestor
  podem promover uma tag livre ao catálogo, criar tags oficiais novas e
  remover tags do catálogo (com alerta quando há clientes ainda usando).
- **`/app/configuracoes/veiculos/cadastro-mode`** — radio cards com 3
  opções (`auto_aprovado` / `aprovacao_obrigatoria` / `manual_apenas_gestor`),
  descrição inline de cada modo e aviso sobre override por vendedor que
  virá na Fase 2.
- **Placeholders coerentes** em `/usuarios`, `/whatsapp`,
  `/portal-cliente`, `/gamificacao` e `/divisoes` — cada um lista o
  que será configurável na Fase 2, traz contexto real (equipe seedada,
  contas WhatsApp do mock, regras de gamificação vigentes) e cita os
  PRDs que vão entregar a feature. `/divisoes` mostra cards das três
  submarcas (PARTS em verde habilitada, SERVICE em vermelho e INDUSTRIAL
  em amarelo desabilitadas).
- **Hook `useUnsavedChanges`** — usa `useBlocker` do TanStack Router
  para interceptar navegação enquanto há mudanças não salvas, exibindo
  `UnsavedChangesDialog` com opções "Cancelar" e "Descartar e sair".
  Também guarda `beforeunload` do navegador para reloads/fechamento de
  aba (PRD-019 RF-038).
- **Hook `usePlatformSettings`** — wrapper compartilhado de leitura e
  escrita do `IPlatformSettings` completo, capturando before/after por
  campo patched e gerando audit log via `auditLog()` em cada save.
- **Componentes compartilhados** `SectionHeader`, `PlaceholderSection`,
  `UnsavedChangesDialog` em `src/features/admin-settings/components/`.

### Changed

- **`ISellersProvider`** ganha método `update(id, patch)` para suportar
  edição de perfil. Implementado em `mockSellersProvider`/`sellersApi`;
  `supabaseSellersProvider` segue como stub até PRD-105+.
- **`SettingsLayout`** reescrito para suportar agrupamento por
  categoria, drawer mobile via `Sheet` e badge "Em breve" para
  placeholders. Mantém a API anterior (recebe `children`) — todas as
  rotas existentes continuam funcionando sem alteração.

### Notas

- O escopo MVP do PRD-019 inclui: hub navegável + edição funcional do
  subconjunto especificado + placeholders informativos. CRUD de
  usuários e lojas, conexão real com WhatsApp, gateway de pagamento,
  configuração de IA do SDR, editor visual do pipeline e edição da
  matriz RBAC ficam para Fase 2.
- Toda edição dispara audit log (PRD-006) e exibe toast "Configuração
  salva" com ícone de check.
- **Marco** — com este PRD, o **Bloco 1 (Central de Atendimento e
  CRM)** está completo.

---

## [0.15.0] — Wallet · 2026-05-26

Gestão de Carteira e Transferências (PRD-018) — `/app/carteira` deixa
de ser placeholder e passa a entregar o **sistema completo de
transferências entre vendedores**, com três sabores (temporária com
reversão automática, permanente individual e permanente em lote),
painel administrativo em 3 abas (Ativas, Histórico, Auditoria),
notificações por toast, audit log imutável e integração com a ficha
do cliente (PRD-012) e a lista de clientes (PRD-015).

### Added

- **Rota `/app/carteira`** substitui o placeholder por `CarteiraPage`
  em `src/features/carteira/`. Protegida por `requireAuth` com
  `transfer:view` — apenas Owner e Gestor têm acesso; Vendedor é
  redirecionado para `/sem-permissao`.
- **Painel em 3 abas:** **Ativas** (cards detalhados com tipo, rota
  vendedor → vendedor, contador de clientes, período de cobertura,
  tempo restante até a reversão automática e ação "Reverter agora"),
  **Histórico** (tabela paginada com filtros por tipo, vendedor de
  origem/destino, status final e período) e **Auditoria** (lista de
  eventos `transfer.create`, `transfer.revert` e `transfer.expire`
  com detalhes expansíveis before/after).
- **Header com contadores em tempo real** — "X ativas · Y temporárias
  em vigência" — e dropdown "+ Nova transferência" com 3 atalhos
  (Temporária, Permanente individual, Permanente em lote). Os dois
  últimos abrem orientação direcionando ao fluxo correto (ficha do
  cliente para individual, lista com multi-select para batch).
- **`<NewTemporaryTransferModal>`** — workflow completo: dropdowns De
  / Para com sellers da loja, range de datas (start ≥ hoje, end >
  start), motivo categórico (Férias, Licença médica, Treinamento,
  Outro) + detalhes opcionais, cobertura "Todos os clientes do
  titular" (default) ou "Selecionar específicos" via multi-select com
  checkboxes. Inclui detecção de **conflito de cobertura** (alerta
  amarelo quando já existe temporária ativa para o mesmo titular) e
  **preview** antes de confirmar.
- **`<NewPermanentIndividualTransferModal>`** — chamado pela ficha do
  cliente (PRD-012 → menu ⋮ → "Transferir carteira"). Substitui o
  redirect anterior para `/app/carteiras`. Cliente e vendedor atual
  ficam lockados; motivo obrigatório como textarea; confirmação
  destacada antes de submeter.
- **`<NewPermanentBatchTransferModal>`** — chamado pela ação em lote
  da Lista de Clientes (PRD-015). Substitui o `TransferSellerModal`
  anterior por uma versão polida: lista expansível dos clientes
  selecionados, validação de motivo obrigatório, agrupamento
  automático por `fromSellerId` quando a seleção atravessa
  vendedores diferentes (cria 1 `ICarteiraTransfer` `permanent_batch`
  por grupo, não N individuais), e confirmação enfatizando o caráter
  permanente da ação.
- **`<RevertTransferModal>`** — confirmação contextual (texto
  diferente para temporary vs permanent) ao clicar "Reverter agora";
  toast de sucesso/erro e invalidação de queries.
- **Reversão automática (`useAutoRevertTimer`)** — hook montado uma
  vez no `AppLayout`, ativo para Owner/Gestor enquanto o app está
  aberto. A cada 60 segundos varre transferências temporárias com
  `autoRevertAt <= now` e `status='active'`, chama
  `transfersProvider.expire(id)` em cada uma, atualiza
  `customer.sellerId` para o titular original, grava audit log
  `transfer.expire` e dispara toast "Transferência temporária
  revertida automaticamente". Caminho Fase 2 (Edge Function com
  `pg_cron`) documentado em `docs/carteira.md`.
- **Banner discreto na ficha (`<CoverageBanner>`)** — exibido no
  `ProfileHeader` (PRD-012) quando há cobertura temporária ativa
  cobrindo o cliente. Lê transferências `temporary`/`active` que
  contêm `customer.id` e mostra o titular original e a data de
  retorno: _"Este cliente está sob cobertura temporária. Volta para
  [titular] em [data]."_
- **Tipos de filtros novos no provider de transferências** —
  `IListTransfersParams` agora aceita `statuses`, `types`, `since` e
  `until`, permitindo o histórico filtrado e a varredura otimizada do
  timer de auto-revert.
- **Métodos `revert(id)` e `expire(id)` no provider** —
  `ITransfersProvider` ganha duas mutações. Ambas validam que a
  transferência está em `active`, reescrevem `customer.sellerId`
  para o titular original e gravam audit log com `before` (status
  anterior) e `after` (snapshot com sellers e contagem de clientes).
- **`docs/carteira.md`** documenta tipos, modelo, reversão
  automática (MVP e Fase 2), audit log, permissões e a árvore de
  arquivos.

### Changed

- **Provider `transfersProvider.create`** agora reescreve
  `customer.sellerId` para o titular destino também em transferências
  `temporary` (antes era exclusivo de `permanent_*`). Necessário para
  refletir corretamente quem atende o cliente durante a vigência da
  cobertura; a reversão automática restaura o `sellerId` original.
- **Audit log de transferências** padronizado em `resource='transfer'`
  com ações `transfer.create`, `transfer.revert`, `transfer.expire`.
  A aba Auditoria do painel embebe uma view filtrada por essas três
  ações. O tipo `action` do `logMockMutation` foi alargado para
  aceitar strings semânticas (`transfer.*`) além dos verbos CRUD.
- **Ficha do cliente (PRD-012):** o item "Transferir carteira" no
  menu ⋮ deixa de redirecionar para `/app/carteiras?customerId=…` e
  passa a abrir o novo modal `<NewPermanentIndividualTransferModal>`
  inline.
- **Lista de Clientes (PRD-015):** a ação em lote "Transferir
  vendedor" troca o `TransferSellerModal` antigo pelo
  `<NewPermanentBatchTransferModal>` da feature de carteira, ficando
  alinhada ao audit log central e ao novo design system.
- **Barrel `@/providers/data`** exporta agora `ICreateTransferInput`
  para consumo pelos hooks de mutação (`useCreateTransfer`,
  `useRevertTransfer`, `useExpireTransfer`).

### Security

- **Audit log imutável de transferências** — toda criação, reversão
  manual ou expiração automática registra ator, alvo, snapshot
  before/after e storeId. Base de evidências para o módulo de
  Comissões (PRD-047, Onda 2) resolver disputas do tipo "esse
  cliente fechou comigo".
- **Validação cross-store no front** — modais filtram a lista de
  sellers pelo storeId do cliente; transferência entre lojas exige
  permissão de Owner (preparado para validação no backend na Fase 2).

## [0.14.0] — Pipeline · 2026-05-26

Pipeline de Leads (PRD-017) — `/app/leads` deixa de ser placeholder e passa
a entregar um **funil leve com 5 estágios, Kanban e Lista alternáveis,
conversão preservando memória organizacional e métricas integradas**. O
vendedor enxerga onde cada lead trava, o gestor encontra gargalos no
Kanban e a ficha do cliente convertido mantém o histórico pré-conversão
acessível.

### Added

- **Rota `/app/leads`** substitui o placeholder por `LeadsPage` em
  `src/features/leads/`. Toggle Kanban/Lista persistido em URL
  (`?view=kanban|list`); Kanban é o default.
- **Kanban com 5 colunas** vindas de `IPlatformSettings.pipelineStages`
  (defaults via `SEED_PIPELINE_STAGES`). Cada coluna mostra contagem,
  tempo médio no estágio (proxy via `updatedAt`) e empty state.
- **Drag-and-drop nativo (HTML5)** entre estágios com audit log
  `lead.stage_changed` e toast de confirmação. Drop na coluna final
  abre `<CloseDecisionModal>` perguntando "Convertido ou Perdido?".
- **`<LeadCard>`** com avatar/iniciais, nome, telefone, badge de
  temperatura (🔵/🟡/🔴), valor estimado compacto, próxima ação
  colorida por urgência (verde/amarelo/vermelho), origem (WhatsApp /
  E-commerce / Indicação / Google / Outro) e mini-avatar do vendedor.
- **Lista alternativa** (`<LeadsList>`) com 10 colunas e ordenação por
  nome, temperatura, valor estimado, próxima ação, dias no estágio e
  data de criação. Clique em linha navega para o detalhe.
- **Filtros completos com URL sync** — estágio (lista), temperatura,
  origem, vendedor (multi-select), próxima ação (atrasadas / hoje /
  esta semana / futuras), período de criação (24h / 7d / 30d), faixa
  de valor estimado, loja (Owner only), busca textual em nome/telefone,
  toggles "Incluir perdidos" e "Incluir convertidos".
- **Métricas no header do Kanban** — taxa de conversão (30d), tempo
  médio total (ciclo `createdAt → updatedAt` dos convertidos) e valor
  médio convertido, calculados em `computeGlobalMetrics()` e
  memoizados.
- **`/app/leads/:id`** — `LeadDetailPage` com header (avatar, badges,
  ações), card "Dados do lead" com edição inline de valor estimado,
  próxima ação e temperatura, e três tabs: **Conversas** (consome
  `conversationsProvider.list({ leadId })`), **Notas** (placeholder) e
  **Histórico** (consome `auditsProvider.list` filtrando por
  `resource: "lead"` e renderiza linha do tempo com timestamps).
- **`<NewLeadModal>`** — criação manual com nome, telefone (validação
  10–11 dígitos), e-mail opcional, origem, valor estimado,
  temperatura, estágio inicial (default "Novo"), vendedor responsável
  (locked para Vendedor, dropdown para Gestor/Owner) e próxima ação.
  Audit log `lead.created` e navegação automática para o detalhe.
- **`<ConvertLeadModal>`** — discriminated B2B/B2C, pré-preenche
  dados do lead, valida CNPJ (14 dígitos) / CPF (11 dígitos), cria
  `ICustomer` com `convertedFromLeadId`, `convertedFromLeadAt` e
  `convertedBySellerId`, atualiza `lead.convertedToCustomerId` e
  `lead.stage = "Convertido"`, emite dois audit logs (`lead.converted`
  - `customer.created`) e navega para a ficha do cliente.
- **`<MarkAsLostModal>`** — dropdown obrigatório de motivo da perda
  alimentado por `IPlatformSettings.lossReasons` (defaults via
  `SEED_LOSS_REASONS`), notas opcionais, audit log `lead.lost`.
- **Próxima ação visual** — badge colorido no card e na lista (verde
  para futura/amanhã, amarelo para hoje, vermelho para atrasada com
  contagem de dias) calculado em `getNextActionInfo()`.
- **Permissões respeitadas** — Vendedor vê apenas leads atribuídos
  (`sellerScopeIds` aplicado em `useLeadsList`); Gestor/Owner veem
  loja/cross-store conforme RBAC já vigente.

### Changed

- **Rotas de leads** reestruturadas — `app.leads.tsx` vira layout
  (`<Outlet>`), `app.leads.index.tsx` carrega `LeadsPage` com
  `validateLeadsSearch`, e `app.leads.$id.tsx` carrega
  `LeadDetailPage`.

### Tech notes

- **Drag-and-drop sem dependência adicional** — implementação via
  HTML5 Drag-and-Drop API nativo (`onDragStart` / `onDrop`) para
  evitar a 24h supply-chain guard do `@dnd-kit/sortable`. Mobile
  (< 768px) deve preferir a Lista; a alternativa de teclado fica
  garantida pelo `onKeyDown` do card que abre o detalhe.
- **Stage configurável via Settings** — `usePipelineSettings(storeId)`
  lê `IPlatformSettings.pipelineStages` e `lossReasons`; fallback
  estável para os seeds quando o store ainda não materializou
  settings.
- **Métricas memoizadas** — `computeStageMetrics` e
  `computeGlobalMetrics` são chamadas em `useMemo` no Kanban e na
  barra superior para satisfazer RNF-005.

## [0.13.0] — Fleet · 2026-05-26

Veículos do Cliente (PRD-016) — veículo passa a ser **entidade de primeira
classe** com listagem geral, página de detalhe, histórico de manutenção
estruturado, recomendações proativas baseadas em km e cadastro
configurável em 3 modos (auto / aprovação / apenas gestor). **Marco: o
vendedor para de perguntar "qual o caminhão?" toda vez — toda peça vendida
pode ser amarrada a um veículo e o sistema avisa quando a próxima
manutenção está chegando.**

### Added

- **Rota `/app/veiculos`** substitui o placeholder por `VehiclesListPage`
  em `src/features/vehicles/pages/`. Tabela paginada com 9 colunas (marca,
  ano, motor, placa, cliente, vendedor, km, última manutenção, status),
  ordenação por 5 colunas e paginação configurável (25/50/100/200).
- **Rota `/app/veiculos/:id`** — `VehicleDetailPage` com 6 seções:
  cabeçalho com badge de cadastroStatus, dados técnicos, proprietário,
  histórico de manutenção (timeline reversa), recomendações de manutenção
  e peças compatíveis (placeholder até PRD-030).
- **Filtros combináveis com URL sync** — marca (multi-select), modelo
  (texto livre), faixa de ano, motor (texto livre), status de cadastro,
  vendedor (Gestor/Owner) e loja (Owner). Atalho "Pendentes" filtra
  cadastros pendentes em um clique.
- **Busca textual** — placa, VIN, modelo ou nome do cliente.
- **`<NewVehicleModal>`** — autocomplete de cliente proprietário escopado
  à carteira do vendedor, dropdown de marca (5 fabricantes + "Outro"),
  validação de ano (1990 a ano atual + 1), placa brasileira
  (7 caracteres), VIN (17 caracteres) e anti-duplicata de placa por
  cliente.
- **3 modos de cadastro** (`IPlatformSettings.vehicleCadastroMode`):
  `auto_aprovado` cria como aprovado; `aprovacao_obrigatoria` deixa
  pendente até revisão do gestor; `manual_apenas_gestor` esconde o botão
  "+ Veículo" do vendedor.
- **Override por vendedor** — `ISeller.vehicleCadastroMode` permite
  exceções por usuário (resolvido em `useCadastroMode`).
- **Edição inline de km** com confirmação obrigatória para mudanças
  acima de 50.000 km — proteção contra erros de digitação que invalidam
  o histórico.
- **Histórico de manutenção estruturado** — `IVehicleServiceEntry` em
  timeline cronológica reversa com data, km, peças trocadas (badges) e
  referência ao pedido derivado quando aplicável.
- **`<AddServiceEntryModal>`** — registro manual com date picker, km,
  tags de peças (adicionar com Enter), observações e toggle para
  associar a um pedido do mesmo cliente.
- **Recomendações proativas** — heurística de 4 regras (filtros, correia,
  freios, revisão) com intervalos fixos: card amarelo a 5.000 km da
  próxima troca (10.000 km na revisão completa) e card vermelho quando
  atrasado. CTA "Criar orçamento" reservado para PRD-031.
- **Aprovação/rejeição** — individual via página de detalhe e em lote via
  multi-select na listagem. Rejeição abre AlertDialog pedindo motivo
  (opcional) e gera audit log.
- **`<CustomerVehiclesList>`** consumido pela tab Veículos da ficha do
  cliente (PRD-012) — substitui o componente embutido anterior por uma
  visão unificada com até 5 cards e link "Ver todos os N veículos".

### Changed

- **`VehicleCadastroMode` ganha terceiro modo** — `manual_apenas_gestor`
  somado aos dois existentes (`auto_aprovado`, `aprovacao_obrigatoria`).
  Tipo exportado via `@/shared/types`.
- **`IVehiclesProvider.list`** estendido com `customerIds`, `brands`,
  `model`, `engine`, `yearMin`, `yearMax`, `cadastroStatuses`, `storeIds`,
  `sellerIds`, `search`, `orderBy` e `orderDir`. Mock cruza com customers
  para resolver filtros por loja e vendedor.
- **`IVehiclesProvider.addServiceEntry`** — novo método para registrar
  manutenções; atualiza `currentKm` quando o entry tem km maior que o
  atual.
- **`VehiclesTab`** da ficha do cliente reduzido a wrapper de
  `<CustomerVehiclesList>` (DRY com a listagem geral).

### Tech notes

- 60 veículos seeded vinculados a 25 clientes B2B suportam o PRD; mocks
  ganharam helpers para resolver customer-name e seller-id no cruzamento
  de filtros.
- Stub Supabase atualizado para o novo método `addServiceEntry`
  (`NotImplementedError` até PRD-110+).

## [0.12.0] — Ledger · 2026-05-26

Lista Geral de Clientes (PRD-015) — visão macro da base que complementa a
ficha individual (PRD-012). Tabela paginada com 4 colunas obrigatórias + 9
opcionais configuráveis, 10 filtros combináveis com URL sync, busca textual
em nome/CNPJ/CPF/telefone/email/notas, segmentações salvas private/shared
com CRUD próprio, multi-select com 5 ações em lote e drill-down via layout
3:2 para a ficha existente. **Marco: gestor e vendedor passam a operar a
base como um conjunto — uma campanha de recuperação que antes exigia 30
cliques agora vira filtro + 3 cliques + um toast "23 clientes atualizados".**

### Added

- **Rota `/app/clientes`** substitui o placeholder por `CustomersListPage`
  em `src/features/customers/pages/`. Layout 3:2 em desktop (≥ 1024px) com
  tabela à esquerda e `<CustomerProfile>` (PRD-012) à direita; mobile
  navega para `/app/clientes/:id` em tela cheia.
- **Provider estendido** — `IListCustomersParams` ganha `statuses[]`,
  `abcClasses[]`, `tags[]`, `sellerIds[]`, `recencyBuckets[]`,
  `recencyCustom`, `ticketRange`, `ltvRange`, `vehicleBrands[]`,
  `storeIds[]` e novas chaves de `orderBy` (`ticketMedio`, `ltv`,
  `recency`, `abcClass`, `status`). Filtros anteriores (`status`, `tag`,
  `sellerId`) preservados para back-compat. Mock implementa cruzamento com
  vehicles para o filtro de marca.
- **Segmentações CRUD** — `ISegmentsProvider` ganha `create`, `update`,
  `delete` (mock + audit). `useSegments()` agrupa em `privateOnes` /
  `shared`, com mutations tipadas e invalidação automática do cache.
- **Transferências em lote** — `ITransfersProvider` ganha `create`. Mock
  agora aceita `permanent_batch` com re-atribuição imediata do `sellerId`
  nos clientes afetados e registro do `ICarteiraTransfer` correspondente.
- **`<CustomersTable>`** com colunas obrigatórias (checkbox, nome+avatar,
  tipo, ABC, status) + opcionais (CNPJ/CPF, vendedor com avatar, ticket
  médio, recência colorida, LTV, tags com truncate, cidade, última conversa,
  cadastro). Ordenação clicável (5 colunas sortáveis), navegação por
  setas ↑↓ entre linhas mantendo a ficha aberta, highlight amarelo do
  termo de busca.
- **`<CustomersFiltersBar>`** com 10 controles: Status (multi), Tipo
  (toggle Ambos/B2B/B2C), ABC (multi com "Sem classificação"), Tags (multi
  searchable), Vendedor (multi searchable — locked em si para Vendedor),
  Recência (multi com 4 faixas), Ticket médio (presets + custom min/max),
  LTV (presets + custom), Veículo marca (Volvo/Scania/Mercedes/Ford/Iveco
  - "Qualquer"), Loja (Owner only quando há ≥ 2 lojas acessíveis). Combina
    via AND, indicador "N filtros ativos" + botão "Limpar tudo".
- **Busca textual** com URL sync, pesquisa em nome (razão social / nome
  fantasia / fullName), CNPJ / CPF (digits-only normalizado), telefone
  normalizado, email e conteúdo de notas. Highlight visual onde encontrado.
- **Segmentações salvas** — `<SegmentsDropdown>` lista private (do user)
  - shared (da loja) com badge "ativa". `<SaveSegmentModal>` cria
    segmentação a partir dos filtros atuais (nome ≤ 50 chars + escopo
    Privada/Compartilhada — Vendedor não pode criar shared).
    `<ManageSegmentsModal>` permite renomear, mudar escopo e excluir.
    Comportamento "Modificado" quando filtros divergem da segmentação ativa
    — Owner/Gestor pode "Salvar alterações" ou "Salvar como nova".
- **Multi-select + ações em lote** — checkbox por linha + "Selecionar
  todos da página" (com tri-state indeterminate). Quando há seleção parcial
  e existem mais itens filtrados, botão "Selecionar todos os N filtrados"
  recarrega o conjunto inteiro (até 500). Barra `<BulkActionsBar>` oferece:
  Adicionar tag (autocomplete + tags livres), Remover tag (lista apenas as
  tags presentes nos selecionados), Transferir vendedor (Owner/Gestor, gera
  `ICarteiraTransfer` `permanent_batch` agrupando por vendedor de origem),
  Marcar dormente (com confirm), Exportar CSV / LGPD (placeholders com
  tooltip "Disponível na Fase 2"). Cada ação registra audit log com
  `action: "bulk_*"` + sumário.
- **`<ColumnsConfigModal>`** persiste em localStorage
  (`gallo-customers-columns`) o conjunto de colunas opcionais visíveis.
  Botão "Restaurar padrão" disponível.
- **`<NewCustomerModal>`** — criação rápida B2B/B2C com validação de
  CNPJ/CPF (length + dígitos repetidos), telefone (10–11 digits), email
  opcional, vendedor responsável locked em si para Vendedor / livre para
  Owner/Gestor. Após criar, abre a ficha do novo cliente automaticamente.
- **URL sync completa** — `validateCustomersSearch` valida e normaliza
  filtros, ordenação, paginação, busca, segmentação ativa e cliente
  selecionado em query params. URLs ficam compartilháveis e refresh
  preserva todo o estado.
- **Empty states contextuais** — sem filtros (CTA "+ Cliente"), com
  filtros ("Limpar filtros"), busca sem resultados (mostra o termo) e
  estado de erro com "Tentar novamente". Skeleton de tabela durante fetch
  inicial.
- **Permissões aplicadas** — Vendedor só vê sua carteira (filtro
  `sellerIds` é forçado em si mesmo, dropdown de Vendedor não aparece);
  Gestor vê toda a loja com ações em lote completas; Owner vê cross-store
  com filtro de Loja habilitado.

### Changed

- `IListCustomersParams` (contrato) recebe os novos campos opcionais sem
  remover os antigos — código existente que usa `status`, `tag` ou
  `sellerId` continua válido.
- `ISegmentsProvider` deixa de ser read-only no MVP — `create`, `update`
  e `delete` agora fazem parte do contrato.
- `ITransfersProvider` ganha `create`, habilitando o fluxo de
  transferência em lote a partir desta página.

### Notes

- Export CSV e LGPD por cliente individual seguem como placeholders Fase 2,
  conforme escopo do PRD-015.
- Edição inline na tabela fora do MVP — clientes são editados via ficha
  (PRD-012) acessada por drill-down.
- Versão bump 0.11.0 → 0.12.0 (MINOR) — nova feature substantiva.
- `package.json` → `0.12.0`.

## [0.11.0] — Cockpit · 2026-05-26

Painel do Gestor (PRD-014) — visão operacional em tempo real para Owner e
Gestor. Sete widgets que respondem "como vai o atendimento agora?" em três
linhas: KPIs (TMA, TMR, Taxa de Resolução, Backlog) com indicador de tendência
versus período anterior; carga por vendedor com barras coloridas por saúde;
heatmap de volume 7×24 em SVG nativo; saúde da carteira como donut clicável;
e lista de alertas ativos com dispensa por 24h. Drill-down em todo widget,
filtros sincronizados na URL e configuração de limiares (Owner) com audit log.
**Marco: gestor passa a operar com visão proativa — alertas e tendências em
vez de feeling, com modal de configuração dos limites por loja.**

### Added

- **Rota `/app/inicio`** substitui o placeholder por `ManagerDashboardPage`
  para Owner / Gestor. Vendedor enxerga EmptyState explicativo com CTA para
  a Central de Atendimento — sem dado vazando.
- **Aggregate provider** `IManagerDashboardProvider.snapshot(params)` em
  `src/providers/data/contracts/managerDashboard.ts` — payload único com
  `openConversations`, `sellers`, `customers`, `conversationsInPeriod`,
  `messagesInPeriod` e os equivalentes do período anterior para tendência.
  Implementação mock em `src/mocks/api/managerDashboard.ts` + stub Supabase
  para Fase 2 (materialized view / RPC).
- **Header com filtros globais** sincronizados na URL via `useDashboardFilters`
  (`?periodo=…&vendedor=…&loja=…&canal=…`) — Período (Hoje default, Ontem,
  7d, 30d), Vendedor, Loja (locked em Gestor), Canal. Limites do período
  resolvidos como janelas atual + anterior na mesma chamada.
- **KPIs (linha 1)** — `<KpiCard>` reutilizável com badge de tendência
  adaptativa (verde quando melhora, vermelho quando piora; lógica invertida
  entre "menor é melhor" — TMA/TMR/Backlog — e "maior é melhor" — Taxa de
  Resolução). Cálculos em `src/features/manager-dashboard/utils/kpiMath.ts`:
  - **TMA**: média do span entre primeira mensagem do cliente e `lastMessageAt`
    em conversas resolvidas no período.
  - **TMR**: média entre cada `direction: "in"` do cliente e o primeiro
    `direction: "out"` `authorType: "seller"` que responder.
  - **Taxa de Resolução**: resolvidas / abertas × 100 sobre o período.
  - **Backlog**: contagem absoluta de `status === "aguardando"` agora.
- **Carga e Heatmap (linha 2)**:
  - `<SellerLoadList>` ordena vendedores por carga atual decrescente, com
    avatar + iniciais, dot de availability, barra colorida em 3 bandas
    (normal ≤ 67% do limite, warning, critical acima do `sellerOverloadThreshold`).
  - `<VolumeHeatmap>` em SVG nativo 7×24 com 6 níveis de intensidade
    derivados da cor de acento do tema. Hover mostra tooltip "Seg 14h: 23
    mensagens" com `aria-live` para leitores de tela.
- **Carteira e Alertas (linha 3)**:
  - `<CarteiraHealthDonut>` em Recharts mostra distribuição dos clientes por
    `CustomerStatus`. Centro do donut traz o total absoluto; legenda lateral
    é clicável e leva a `/app/clientes?status=…`.
  - `<ActiveAlertsList>` agrega três tipos com `useActiveAlerts`:
    - **Cliente A dormente**: clientes com `abcClass === "A"` e
      `status === "dormente"`, mensagem traz o número de dias sem compra.
    - **Vendedor sobrecarregado**: carga acima do limiar configurado.
    - **Conversa sem resposta**: agregação de conversas `aguardando` há mais
      do que `conversationWaitingHoursThreshold` horas.
  - Severidade dita ícone, cor e ordenação (critical → high → medium).
    Botão "Dispensar" persiste hash + timestamp em `localStorage` por 24h
    (chave `gallo-alert-dismissed-{hash}`). Recálculo automático a cada
    `alertPollingSeconds`.
- **Drill-down em todo widget**: KPIs e Backlog navegam à inbox filtrada;
  carga leva ao filtro `assignment=<sellerId>`; donut leva à lista de clientes
  por status; alerta de cliente abre a ficha (`/app/clientes/$id`); alerta de
  vendedor leva à inbox filtrada por aquele vendedor.
- **Configuração de alertas** — `<AlertSettingsModal>` Owner-only abre via
  botão ⚙ no header. Sliders + inputs numéricos sincronizados para limite
  de conversa sem resposta (1-24h) e sobrecarga (5-50 conversas), toggles
  individuais por tipo de alerta, select de frequência (15s / 30s / 60s / 5min).
  Save chama `settingsProvider.update({ managerDashboard })` e emite
  `auditLog({ action: "manager_dashboard_settings.update" })`.
- **Modelos novos**:
  - `IManagerDashboardSettings` em `src/shared/types/platform.ts` com
    thresholds, toggles e polling, integrado a `IPlatformSettings`.
  - `IManagerDashboardSnapshotParams` / `IManagerDashboardSnapshot` em
    `src/providers/data/contracts/managerDashboard.ts`.
- **Defaults da matriz** em `src/mocks/data/seedManagerDashboard.ts` — limites
  4h de espera, 15 conversas de sobrecarga, todos os alertas habilitados,
  polling de 30s. Reexportados pelo barrel `src/mocks/data/index.ts`.
- **Mock user Gestor** — perfil `mock-gestor` (Marina Cardoso) adicionado a
  `MOCK_USERS`. Vincula ao seller existente `seller-marina-cardoso` para que
  os filtros e o lock de loja exercitem o caminho não-Owner.
- **Real-time** — o painel reaproveita `useRealtimeConversations` (PRD-010)
  como heartbeat: cada nova mensagem simulada bumpa o `refreshKey` do snapshot
  hook (`useDashboardSnapshot`), que refaz a chamada em background sem
  esqueletos. Toggle no header acende/apaga o pulse e pausa as atualizações.

### Changed

- **Role guard de `/app`** agora aceita `Gestor` (era `["Owner", "Vendedor"]`)
  para permitir que o novo perfil veja o painel sem ficar preso em
  `/sem-permissao`.
- **`IPlatformSettings`** carrega o novo campo obrigatório `managerDashboard`.
  Mock seed da matriz traz os defaults; código que cria settings precisa
  preencher (não há migração porque ainda estamos em Fase 1 com mocks).
- **`IDataProviders`** ganha a chave `managerDashboard`. Factory mock e stub
  Supabase devolvem ambas as implementações.

### Notes

- Cálculos derivam timestamps das mensagens — na Fase 2 a TMA real virá do
  audit log de mudança de status (`conversation.resolve`), encerrando a
  aproximação atual baseada em `lastMessageAt`.
- O drill-down de célula do heatmap leva à inbox dos últimos 30 dias com uma
  pista textual no campo de busca; a filtragem por janela horária exata fica
  para um refinamento futuro da inbox.
- Alertas de "Vendedor sobrecarregado" usam o mesmo `sellerOverloadThreshold`
  do banding visual da carga, garantindo coerência entre o visual e a
  geração do alerta — mudou o limite, recolore E reemite alertas.

## [0.10.0] — Switchboard · 2026-05-26

Regras de distribuição e roteamento (PRD-013) — toda conversa nova passa por
um engine puro de 5 critérios em cascata, configurável pelo Owner, com
auditoria completa. A loteria do "quem viu primeiro responde" acaba aqui:
carteira é sagrada, especialista atende quem é da sua marca, restante via
round-robin balanceado, fallback inteligente para SDR ou fila quando ninguém
disponível. **Marco: gestor passa a controlar a operação de atendimento com
regras explícitas e simulador para testar cenários antes de aplicar.**

### Added

- **Engine puro** em `src/features/distribution/engine/` — função
  `distributeConversation(input, context): IDistributionResult` sem side
  effects, determinística (round-robin via cursor persistente, não aleatório).
  Cinco critérios encapsulados em `tryCarteira`, `tryEspecialidade`,
  `tryRoundRobin`, `tryCarga`, `tryFallback` mais utilitários
  `isWithinBusinessHours`, `getOnlineSellers`, `selectByLoad`,
  `selectByRoundRobin`, `findSpecialtyMatches`. Função pronta para ser invocada
  tanto pelo mock provider quanto, na Fase 2, por uma Edge Function do Supabase
- **Modelos novos** em `src/shared/types/distribution.ts`:
  - `IDistributionSettings` aninhado em `IPlatformSettings.distribution` com
    `mode`, `criteriaEnabled`, `criteriaOrder`, `businessHours`,
    `offHoursMessage`, `queueTimeoutMinutes`, `lastAssignedSellerId`,
    `specialtyKeywords`
  - `IDistributionTrace` com `selectedSellerId`, `criterionMatched` (carteira /
    especialidade / round_robin / carga / fallback_sdr / fallback_fila),
    `candidatesEvaluated[]` (todos os vendedores avaliados, mesmo descartados,
    com motivo), `mode` na hora da decisão — base do histórico auditado
  - `IBusinessHoursWindow` para janelas semanais
- **Defaults da matriz** em `src/mocks/data/seedDistribution.ts` — modo
  `hybrid`, todos os critérios ativos, horário seg-sex 8h-18h + sáb 8h-12h,
  fila com timeout de 30 min, 11 keywords de especialidade (volvo, scania,
  mercedes, ford, iveco, freio, motor, embreagem, filtro, turbo, injetor)
- **Integração com o mock provider** — `IConversationsProvider.create(input)`
  novo no contrato; `mockConversationsProvider.create` chama o engine, persiste
  a conversa + primeira mensagem (do cliente) + bubble `system` quando há
  mensagem fora do expediente, registra o `IDistributionTrace` e emite
  `auditLog` (`conversation.create`). Round-robin avança o cursor
  `lastAssignedSellerId` em settings após cada vitória
- **`distributionTracesApi` + provider novo** — `list/get/create` com filtros
  por `storeId`, `selectedSellerId`, `criterionMatched`, janela temporal.
  `mockDistributionTracesProvider` na Fase 1; stub Supabase em
  `supabaseDistributionTracesProvider` lançando `NotImplementedError` até
  Fase 2. Hook `useDistributionTracesProvider()` exposto pelo barrel
- **Gerador de traces históricos** — `generateDistributionTrace` no bootstrap
  produz ~40 traces sintéticos cobrindo todos os critérios para popular o
  histórico no primeiro carregamento
- **Página `/app/configuracoes/distribuicao`** (Owner only via
  `requireAuth(..., ["Owner"], { resource: "settings", action: "edit" })`) com
  7 seções:
  - **`ModeSection`** — 4 cards radio (Automático / Híbrido recomendado /
    SDR-first / Manual) com modal de confirmação antes de salvar
  - **`CriteriaSection`** — reordenação via ↑↓, toggle on/off por critério,
    fallback bloqueado para sempre ficar ativo, aviso visual quando só o
    fallback restar habilitado, draft + botão "Salvar critérios"
  - **`BusinessHoursSection`** — grade semanal com switch por dia + inputs
    `time` para abertura/fechamento
  - **`OffHoursMessageSection`** — textarea com 600 caracteres + preview da
    bolha do SDR ao lado
  - **`QueuePolicySection`** — input numérico de minutos de timeout da fila
  - **`DistributionSimulator`** — escolhe cliente/lead, canal e mensagem;
    roda engine puro localmente (sem persistir) e renderiza trace visual com
    candidatos avaliados e vencedor destacado
  - **`TriggerInboundSection`** — dispara `conversationsProvider.create()`
    de verdade, exercitando engine + trace + audit log + toast em tempo real
  - **`DistributionHistory`** — tabela paginada (10/pg) com filtros por
    critério e vendedor, cada linha expandível mostra trace completo
- **`AvailabilityToggle`** embutido no avatar dropdown do `TopBar` — 4 opções
  (Online verde, Ausente amarelo, Ocupado laranja, Offline cinza) consumindo
  `sellersProvider.setAvailability` com audit log e toast
- **Badge "Em fila"** no `ConversationListItem` para conversas órfãs
  (`assignedSellerId: null && status === "aguardando" && !isSdrActive`)
- **Filtro "Em fila"** no `AssignmentFilter` da inbox — adiciona
  `unassigned + isSdrActive=false + status=aguardando` aos params
- **`useDistributionToasts`** montado em `AppLayout` — polla traces filtrados
  por `selectedSellerId === currentUser.sellerId` a cada ~9s; cada trace novo
  dispara toast "Nova conversa atribuída a você" com botão "Ver" navegando
  para `/app/atendimento/$id`. Bootstrap inicial só seeda o set de
  já-vistos sem disparar alertas
- **`useDistributionSettings(storeId)`** — hook de leitura/escrita aninhado
  em `IPlatformSettings.distribution`, com audit log automático em cada save
- **Mapeamento `IMockUserProfile.sellerId`** opcional (mock-owner →
  seller-joao-gallo, mock-vendedor → seller-carlos-santos) para que o
  AvailabilityToggle consiga consultar/atualizar o seller real
- **Doc `docs/distribuicao.md`** com arquitetura do engine, semântica dos
  critérios, traces, contratos para Fase 2, matriz de permissões e defaults

### Changed

- **`IPlatformSettings`** ganha campo obrigatório `distribution:
IDistributionSettings`; seed da matriz preenche com defaults
- **`IConversationsProvider`** ganha método `create(input)` retornando
  `{ conversation, messages, trace }`; supabase stub lança `NotImplementedError`
- **`IBootstrappedDataset`** ganha coleção `distributionTraces`
- **`mutations.ts`** e **`selectors.ts`** estendidos para `distributionTraces`
- **`SettingsLayout`** ganha entrada "Distribuição" gated por permissão de
  edição de settings — visível só para Owner
- **`InboxFilters` / `useInboxFilters`** — novo valor `queue` no
  `AssignmentFilter` + tradução em `INBOX_STRINGS.assignmentOptions.queue`;
  conserta uso de `s.displayName` (que não existe em `ISeller`) para `s.fullName`

### Notes

- **Engine pronto para Fase 2** — função pura sem dependência de provider;
  a Edge Function do Supabase consumirá o mesmo `distributeConversation`
  passando o contexto via parâmetros
- **Watchdog da fila** (alerta quando `queueTimeoutMinutes` for excedido)
  fica para quando a inbox passar a operar com WhatsApp real em Fase 2 —
  no MVP a métrica é configurável mas o efeito é descritivo
- **Transferência manual** (Owner/Gestor mover conversa entre vendedores)
  já existia via `conversationsProvider.assignSeller`; este PRD não altera
  esse fluxo

## [0.9.0] — Compass · 2026-05-25

Ficha unificada do cliente (PRD-012) — o "cérebro do CRM" entra em órbita.
O vendedor agora vê todo o contexto comercial e relacional do cliente sem
sair da conversa: métricas, dados cadastrais, carteira, frota, histórico
de pedidos e orçamentos, conversas anteriores, notas internas e
recomendações ativas — tudo em uma coluna lateral de 360px à direita do
`ConversationLayout`. **Marco: cada resposta do vendedor passa a ter
contexto completo na ponta dos dedos; o "espera aí, deixa eu buscar no
sistema" acaba aqui.**

### Added

- **`<CustomerProfile>`** em `src/features/customers/components/` consumido
  em duas superfícies — coluna lateral do `ConversationLayout` (drawer no
  tablet, navegação para tela cheia no mobile) e página dedicada
  `/app/clientes/:id` (substitui o placeholder do PRD-003) — com a mesma
  experiência adaptada via prop `variant: "column" | "page"`
- **`<ProfileHeader>`** com avatar (hash de cor por id reutilizando o
  helper compartilhado), nome, badges de tipo (B2B/B2C), classe ABC
  (ouro/prata/neutro), ciclo de vida (4 cores semânticas) e o badge
  **"Histórico pré-conversão"** com Popover que mostra origem do cliente
  (data de criação como lead, dias até conversão, vendedor/SDR que
  converteu) — preservando memória organizacional na transição lead→cliente
- **7 tabs** com lazy load (cada tab busca dados apenas quando ativada):
  - **Visão geral** com 5 cards: `<MetricsCard>` (ticket médio, LTV,
    recência, frequência, classe ABC + share), `<CadastraisCard>`
    (discriminated union B2B/B2C — CNPJ/razão social/contato vs CPF/nome,
    endereço completo), `<StatusWalletCard>` (ciclo de vida, vendedor com
    avatar, `<StoreBadge>` do PRD-007, primeira/última compra),
    `<TagsCard>` (mecânica completa com autocomplete do catálogo
    promovido + tags livres em cinza com flag "rascunho" + botão
    **"Sugerir promoção"** que registra intenção pendente),
    `<PortalCard>` (7 toggles read-only do `IPortalSettings` — edição
    sinalizada como PRD-019)
  - **Pedidos** — lista paginada (10/pg) com filtros de período
    (30d/90d/12m/tudo), badges combinados de `paymentStatus` +
    `fulfillmentStatus`, item-síntese e click navega para detalhe
  - **Orçamentos** — lista paginada com badge de status + origin
    (SDR/vendedor/portal/e-commerce) + desconto aplicado
  - **Veículos** — cards da frota (marca/modelo/ano/motor/placa/km) com
    histórico de manutenção (últimos 3 serviços) + dialog **"Adicionar
    veículo"** que respeita `IPlatformSettings.vehicleCadastroMode`
    (auto-aprovado salva direto, aprovação obrigatória marca como pendente)
  - **Conversas** — histórico de todas as conversas com o cliente,
    conversa atual destacada com badge "Atual" no topo, vendedor de cada
    atendimento com avatar mini
  - **Notas** — timeline imutável (sem editar/deletar — audit trail) com
    autor + tempo relativo, textarea com atalho **Cmd/Ctrl + Enter**
  - **Recomendações** — só os 3 tipos do MVP (`recovery`,
    `vehicle_maintenance`, `follow_up`) com prioridade colorida e botão
    **"Dispensar"** que resolve via provider + audit log
- **`<ProfileMenu>`** (kebab) com 7 ações contextuais filtradas por RBAC
  (PRD-006): Editar dados, Marcar como dormente, Transferir carteira,
  Bloquear cliente (gated por `<AlertDialog>` que muda status para
  "perdido"), Adicionar veículo, **Ver no Pipeline** (condicional —
  aparece quando `convertedFromLeadId` existe e navega para o lead),
  Exportar dados LGPD (placeholder Fase 2, Owner only)
- **`<CustomerProfileFiche>`** + `useFicheLayout()` — wrapper responsivo
  que escolhe entre 3 modos:
  - `column` (≥ 1280px) — sidebar fixo de 360px que colapsa para 0
    quando `fiche.open` é false, mantendo o cache React Query quente
  - `drawer` (768–1279) — `<Sheet>` que desliza pela direita
  - `route` (< 768) — botão "Ficha" navega para `/app/clientes/:id` em
    tela cheia em vez de toggle
- **`useFicheButtonHandler`** decide entre toggle e navegação conforme
  breakpoint, integrado ao botão "Ficha" do `<ConversationHeader>`
- **Cache de 2 minutos** via React Query `staleTime` em
  `useCustomerProfile` (RNF-003) — reabrir a mesma ficha em < 50ms
- **Audit log** em todas as mutações sensíveis: mudança de status
  (markedDormant, blocked), tag adicionada/removida/promovida, nota
  adicionada, recomendação dispensada, veículo criado

### Changed

- **`ICustomer` estendido** com snapshot de campos surfados pela ficha:
  `purchaseStats` (ticketMedio / LTV / orderCount12m), `abcClass` +
  `abcShare`, `convertedFromLeadId` + `convertedFromLeadAt` +
  `convertedBySellerId` (back-pointer da conversão lead→cliente),
  `portal` (embed de `IPortalSettings`), `address` (`ICustomerAddress` —
  novo type). Mock generator popula todos esses campos durante o
  bootstrap em um passo de enriquecimento pós-orders/ABC
- **`IRecommendationsProvider.list`** ganha `subjectId?` e aceita array
  de `type` — necessário para filtrar recomendações de um cliente
  específico nos 3 tipos do MVP
- **`/app/clientes`** virou rota de layout (passthrough `<Outlet>`) com
  `app.clientes.index.tsx` segurando o placeholder PRD-015 e
  `app.clientes.$id.tsx` rendering a ficha de página inteira
- **`useConversationsProvider.list`** ganha ordenação por `orderBy:
"lastMessageAt" | "abcClass"` (não era exposto antes)

### Fixed

- **`InboxFilters`** — `setSellers(res.data)` quebrava quando o usuário
  era Owner/Gestor (provider de sellers retorna array, não paginado);
  trocado para `setSellers(res)`. `s.displayName` corrigido para
  `s.fullName` (ISeller não tem displayName)
- **`<Tooltip>` sem provider** quebrava o `ConversationHeader` quando a
  página era acessada por deep link (Owner indo direto para
  `/app/atendimento/:id`); `TooltipProvider` agora envolve a página
- Generator de endereço duplicava o prefixo (`Rua Rua Nogueira`) porque
  `faker.location.street()` já retorna nome completo em pt-BR
- `conversationDisplay` agora reusa `hashHue` + `initialsFrom` extraídos
  para `@/shared/utils/avatar` (eliminando duplicação com a ficha)

### Notes

- Helpers de formatação compartilhados em `@/shared/utils/format.ts`:
  `formatBRL`, `formatBRLCompact`, `formatCPF`, `formatCNPJ`,
  `formatPhone`, `formatPercent`, `formatDateBR`, `formatDateTimeBR`,
  `formatRelativeTimeBR`, `daysSince`
- Lazy load por tab + skeletons individuais por tab atende RNF-001
  (< 400ms para a Visão Geral default) e RNF-002 (tab inativa não busca)
- Navegação por teclado entre tabs (←/→) nativa via Radix Tabs satisfaz
  RNF-005 (WCAG AA)

---

## [0.8.0] — Pilot · 2026-05-25

Conversa multicanal (PRD-011) — a coluna central do `ConversationLayout`
ganha vida. O vendedor agora atende dentro da plataforma com histórico
rico, envio com optimistic UI, indicador da janela de 24h do WhatsApp Meta
e ações contextuais auditadas. **Marco: a inbox (PRD-010) deixa de ser
um placeholder no centro — todas as conversas ficam realmente operáveis,
sem necessidade de fugir para WhatsApp Web.**

### Added

- **`ConversationPage`** em `/app/atendimento/:id` substitui o
  placeholder do PRD-001; consome `<ConversationLayout>` via `<Outlet>`
  com header, histórico, indicador de janela 24h e input de mensagem
- **`<ConversationHeader>`** com avatar (iniciais coloridas por hash do
  participante), nome, canal + número (subtítulo), pill de status com cor
  semântica (4 estados: aguardando / em_andamento / aguardando_cliente /
  resolvida / arquivada), badge "SDR ativo" quando aplicável, botões
  **Criar orçamento** (navega para `/app/orcamentos?customerId=...`),
  **Ficha** (toggle persistido em `localStorage`) e menu **⋮**
- **6 tipos de bubble tipados** em `components/bubbles/`:
  `<TextBubble>` (whitespace preservado), `<ImageBubble>` (thumbnail
  clicável que abre modal + skeleton de loading + caption opcional),
  `<AudioBubble>` (player com play/pause real, waveform SVG determinística
  por id, duração formatada `mm:ss`, placeholder de transcrição),
  `<DocumentBubble>` (ícone por extensão — PDF/XLSX/DOCX/ZIP — nome,
  tamanho determinístico, botão download), `<SystemBubble>`
  (centralizado, itálico, sem balão), `<TemplateBubble>` (selo "Template"
  - parser de variáveis + linha de quick-replies)
- **`<MessageBubble>`** discriminador polimórfico — escolhe o bubble certo
  via `mediaType` / `authorType` / prefixo `[template]`
- **Direção e autoria visual**: bubbles `in` à esquerda em surface neutra;
  `out` do vendedor à direita em `--primary/10`; **bubbles do SDR à
  direita em `--brand-parts/10` com borda esquerda sólida + badge "🤖 SDR"
  no canto + tooltip "Mensagem enviada pelo agente SDR"**
- **Status visual de envio (out only)** com tooltip explicativo:
  - `sent` ✓ cinza
  - `delivered` ✓✓ cinza
  - `read` ✓✓ azul
  - `failed` ⚠ vermelho com botão "Tentar novamente"
- **`<MessageList>`** com paginação por scroll-up (`IntersectionObserver`
  - sentinela no topo carrega mais antigas preservando posição via
    delta de `scrollHeight`), auto-scroll inteligente (somente quando o
    usuário já estava no fim — não interrompe leitura), `role="log"` +
    `aria-live="polite"` para acessibilidade
- **Marcadores temporais automáticos** entre grupos de mensagens via
  `groupMessagesWithDaySeparators`: "Hoje", "Ontem", dia da semana por
  extenso (últimos 7 dias) ou "12 de maio" (mais antigas; inclui ano
  quando diferente do atual)
- **`<MessageInput>`** com textarea de auto-resize (1-5 linhas, scroll
  interno após excesso), botões de **anexo** (dropdown imagem/documento/
  áudio — placeholders com toast "em breve"), **emoji** (popover com
  16 emojis e inserção na posição do cursor), **templates** (apenas
  visível como habilitado quando provider é Meta), **enviar** (Enter
  envia, Shift+Enter quebra), e linha de **sugestões IA** estáticas
  baseadas em palavras-chave da última mensagem do cliente ("preço",
  "estoque", "prazo", "boleto") com botões clicáveis que preenchem o
  textarea
- **Optimistic UI no envio** via `useMessageSend`:
  1. mensagem aparece imediatamente como `sent` (✓ cinza)
  2. após 200-500ms transita para `delivered` (✓✓ cinza)
  3. após 1-3s extras, com 80% de probabilidade vira `read` (✓✓ azul)
  4. em 5% das tentativas vira `failed` com retry inline
     Taxas configuráveis em `utils/sendSimulation.ts`
- **`<MetaWindowIndicator>`** com 4 estados visuais:
  - 🟢 Verde (> 12h): "Janela aberta — Xh restantes"
  - 🟡 Amarelo (1-12h): mesma copy + sugestão "Considere usar template"
  - 🔴 Vermelho (< 1h): "Janela fechando — X min restantes"
  - ⚪ Cinza (= 0): "Janela fechada — apenas templates HSM"
    Re-cálculo a cada 30s via `setInterval`; aparece **apenas** para Meta
    provider com `whatsappAccount.provider === "meta"` e conversa não-
    arquivada
- **`useMetaWindow`** computa tempo restante a partir do
  `lastInboundMessageAt` derivado das mensagens no contexto, expondo
  `canSendFreeText` que o input consome para desabilitar texto quando
  a janela fecha
- **`<TemplateDialog>`** modal com seletor de templates HSM mockados
  (4 templates: follow-up de orçamento, cobrança gentil, confirmação de
  entrega, saudação inicial), inputs para variáveis (`{{nome}}`,
  `{{produto}}`, etc.), pré-visualização com substituição em tempo real
  e botão "Enviar template" — habilita apenas quando todas as variáveis
  estão preenchidas
- **`<ConversationMenu>`** (kebab no header) com permissões dinâmicas via
  `usePermission`:
  - Marcar resolvida / Reabrir (qualquer com `edit` em `own`)
  - Marcar não-lida (reseta `gallo-conversation-last-view-...` para
    forçar badge na inbox)
  - Transferir (Owner/Gestor — abre `<TransferDialog>` com dropdown de
    vendedores da loja)
  - Escalar para gestor (Vendedor, quando SDR ativo — encontra primeiro
    gestor disponível via `accessibleStoreIds.length > 1`)
  - Pausar/Retomar SDR (Owner/Gestor, quando aplicável)
  - Arquivar/Desarquivar (Owner/Gestor)
  - Adicionar nota (qualquer com `edit` em customer — abre
    `<NoteDialog>` que chama `customersProvider.addNote`)
- **Toast com botão "Desfazer" (5s)** para ações reversíveis: resolver,
  arquivar, retomar, e cada uma grava `recordAuditLog` em ambas as
  direções (a ação original e o desfazer)
- **Auditoria via PRD-006** em toda mutation sensível
  (`conversation.resolve`, `conversation.transfer`,
  `conversation.archive`, `conversation.toggle_sdr`) com `before`/`after`
- **`<TypingIndicator>`** "Cliente está digitando…" com 3 pontos
  animados; aparece probabilisticamente (30% a cada 20-40s) em
  conversas `em_andamento` / `aguardando_cliente`, dura 3-8s
- **`useConversationDetail`** carrega conversa + customer/lead +
  whatsappAccount de uma vez, expondo `notFound` para o empty state e
  `refresh` para invalidação manual após mutações
- **`useMessages`** com paginação descendente (50/página) traduzida para
  ordem ascendente de display; cache local com `appendOptimistic`,
  `commit`, `fail`, `update` e `retry` para o ciclo de envio
- **`ConversationContext`** compartilha o estado de mensagens entre
  `<MessageList>` e `<MessageInput>` para que a janela 24h e as sugestões
  IA consigam ler a última mensagem inbound sem prop drilling
- **`IWhatsAppAccountsProvider`** novo contrato + impl mock + stub
  Supabase + hook `useWhatsAppAccountsProvider`, expondo `list` e `get`
  para alimentar capabilities e número do header
- **Catálogo de templates HSM mockados** em `utils/hsmTemplates.ts` com
  4 templates representativos, `renderTemplate` para substituição de
  variáveis e `templateReady` para validação inline
- **`CONVERSATION_STRINGS`** namespace em `i18n/pt-BR.ts` cobrindo
  header, empty states, separadores temporais, bubbles, status,
  indicador 24h, input, menu e diálogos
- **Empty states** para conversa não encontrada (com botão "Voltar à
  inbox") e conversa nova sem mensagens
- **Read-only mode** no input quando vendedor não é o atribuído ou a
  conversa está arquivada — copy explícita no rodapé

### Changed

- **`/app/atendimento/:id`** — rota deixa de ser `PlaceholderPage` e
  passa a renderizar `<ConversationPage>` real
- **Barrel `@/features/conversations`** expõe `ConversationPage` ao lado
  do `InboxPage` e `InboxCenterPlaceholder`
- **`IDataProviders`** ganha campo `whatsappAccounts` na agregação
  retornada pela factory; ambas as implementações (mock + Supabase stub)
  registradas no `getDataProviders()`

### Notes

- **`@tanstack/react-virtual` ficou de fora** — o gerador de mocks produz
  no máximo 25 mensagens por conversa e o histórico renderiza
  fluidamente sem virtualização. Quando o dataset crescer na Fase 2,
  basta envolver o `.map` do `<MessageList>` no `useVirtualizer` sem
  tocar nos bubbles. Comentário de planejamento mantido no componente.
- **Emoji picker dedicado ficou de fora** — usamos um popover do
  `shadcn` com 16 emojis representativos do dia-a-dia comercial
  (caminhão, peças, dinheiro, etc.) para evitar nova dependência sob o
  supply-chain guard de 24h do `bunfig.toml`
- **Anexos reais ficaram de fora** — os botões abrem dropdown com 3
  opções (imagem/documento/áudio) e disparam `toast.info("em breve")`
  porque o MVP não tem storage; o fluxo de mídia já está modelado nos
  bubbles e nos tipos para a entrada de Fase 2
- **IA real ficou de fora** — sugestões são heurísticas estáticas
  baseadas em palavras-chave (palavra "preço" sugere "Vou te passar o
  valor…"). LangChain/OpenAI virá no PRD-101+
- **Codinome Pilot** marca o momento em que o vendedor pilota a
  plataforma de ponta a ponta: lê histórico, envia mensagem, recebe
  template HSM dentro da janela de 24h e executa ações contextuais sem
  precisar abrir outra ferramenta. O CRM deixa de ser passivo

## [0.7.0] — Hub · 2026-05-25

Inbox unificado (PRD-010) — primeira tela do Bloco 1 (CRM e Central de
Atendimento). A coluna esquerda do `ConversationLayout` ganha vida: lista
paginada de 80+ conversas mockadas, 6 filtros combinados sincronizados na
URL, 3 modos de ordenação (recência, tempo de espera, prioridade ABC),
busca textual com destaque, atualização em tempo real simulada,
ações rápidas no hover (atribuir-me, transferir, arquivar), e estados
contextuais para vazio/erro. **Marco: porta de entrada do CRM ativa —
PRD-011 (Conversa) e PRD-012 (Ficha) podem ser implementados agora.**

### Added

- **`src/features/conversations/`** em 5 subpastas (`pages`, `components`,
  `hooks`, `utils`, `i18n`) + barrel `@/features/conversations` como
  superfície pública
- **`InboxPage`** em `/app/atendimento` consumindo `<ConversationLayout>`
  via slot esquerdo, com `app.atendimento.tsx` convertido para layout
  route que orquestra lista + `<Outlet>` para a coluna central
- **`app.atendimento.index.tsx`** com `<InboxCenterPlaceholder>` para o
  estado "selecione uma conversa"
- **`<ConversationListItem>`** densamente informativo: avatar com
  iniciais coloridas por hash, nome, timestamp relativo auto-atualizado a
  cada minuto, preview da última mensagem (com handling de mídia),
  contador de não-lidas (limite 9+), badges de canal/SDR/temperatura/Novo,
  borda esquerda colorida por status, destaque de busca via `<mark>`
- **6 filtros combinados** via dropdowns shadcn: Status, Canal, Atribuição
  (contextual ao papel — Vendedor só vê "Atribuídas a mim"; Owner/Gestor
  ganha "Todas", "Sem atribuição" e sub-lista por vendedor), Tags
  multi-select, Período (24h/7d/30d), busca textual debounced 300ms
- **3 modos de ordenação**: Mais recentes (default), Tempo de espera
  (filtra `aguardando` + ordena asc), Prioridade ABC (join com
  `IABCClassification` + tiebreak por recência)
- **`useInboxFilters`** sincroniza filtros com query params da URL via
  TanStack Router `useSearch`/`useNavigate`; defaults são omitidos do
  URL para mantê-lo enxuto; `validateSearch` rejeita valores inválidos
  silenciosamente
- **`useConversationsList`** com paginação cursor-style (30/página) e
  scroll infinito via `IntersectionObserver`; suporta `refreshKey` para
  refetch em camadas (real-time refaz páginas 1..N preservando posição)
- **`useRealtimeConversations`** dispara mensagens simuladas a cada
  8-15s (jittered) chamando `messagesProvider.simulateIncoming`; bumpa
  `tick` para o `useConversationsList` refrescar; toggle persistido em
  `localStorage` chave `gallo-realtime-enabled`
- **`<RealtimeToggle>`** no header da lista (ícone `mdi:radio-tower` /
  `mdi:radio-tower-off`) com tooltip e estado "Atualização pausada"
- **`<QuickActions>`** no hover/foco do item: Atribuir-me (qualquer user
  quando conversa está sem dono), Transferir (Owner/Gestor — dropdown
  de vendedores via `useSellersProvider`), Arquivar (Owner/Gestor) —
  cada ação grava `recordAuditLog` com `before`/`after` e mostra toast
  via sonner com botão "Desfazer" (rollback de 5s)
- **`<InboxEmptyState>`** contextual: copy varia entre "sem conversas",
  "filtros vazios" e "busca sem resultados"; botão "Limpar tudo" inline
- **`useUnreadTracking`** persiste timestamp de última visualização por
  usuário+conversa (`gallo-conversation-last-view-{userId}-{convId}`)
  para bold/unbold após mark read; sync cross-tab via `storage` event
- **`useLastSelectedConversation`** lembra a última conversa aberta
  (`gallo-last-conversation-id`) e reabre automaticamente ao voltar à
  inbox sem id na URL
- **Atalhos de teclado**: `↑↓` navega entre conversas, `/` foca a busca,
  `Enter` abre (intrínseco ao Link)
- **Mobile**: `<ConversationLayout>` ganha prop `mobileShow: 'list' |
'conversation'` para alternar entre lista cheia (sem seleção) e
  conversa cheia (com seleção) em viewports < 768px
- **Real-time + SDR**: badge prominente "🤖 SDR" com tooltip explicativo
  quando `isSdrActive: true`; badge "Novo!" verde por 60s após
  `lastMessageAt`

### Changed

- **`IConversationsProvider.list`** aceita novos params: `tags?: string[]`,
  `search?: string`, `fromDate?/toDate?: string`, `unassigned?: boolean`,
  `orderBy?: 'lastMessageAt' | 'abcClass'`, `orderDir?: 'asc' | 'desc'`;
  e `status` agora aceita array (`ConversationStatus[]`)
- **`IMessagesProvider`** ganha método `simulateIncoming(conversationId,
text?)` que cria mensagem `direction: 'in'` no mock (no-op no
  Supabase stub até PRD-100+)
- **Mock `conversationsApi.list`** implementa busca textual em
  `customer.name`/`phone`/últimas 20 mensagens, filtro de tags
  (intersecta com `customer.tags`/`lead.tags`), ordenação ABC com
  tiebreak por recência
- **Mock `conversationsApi.archive`** agora seta `status: 'arquivada'`
  em vez de remover do dataset (alinhado com o status enumerado)
- **`_storeScope.ts`** ganha helper `withOwnSellerScope` que injeta
  `assignedSellerId = currentUser.id` quando o usuário tem scope `own`
  (não `store`/`all`) — Vendedor agora vê apenas conversas próprias
  sem precisar de filtragem manual no componente
- **`<ConversationLayout>`** ganha prop `mobileShow` (default
  `'conversation'`, retrocompatível) para suportar lista em tela cheia
  no mobile

### Notes

- **Sem novas dependências de runtime** — `date-fns` (timestamps),
  `sonner` (toasts) e `@tanstack/react-router` já presentes; supply-chain
  guard preservado (`bunfig.toml` intocado)
- **Virtual scroll** ficou de fora do MVP — 80 conversas mockadas
  renderizam fluidamente com scroll comum + `IntersectionObserver`;
  pode-se adicionar `@tanstack/react-virtual` em iteração futura quando
  o dataset crescer (Fase 2)
- **Codinome Hub** marca a abertura do CRM como hub central do operador:
  inbox unificada que concentra toda a comunicação multicanal num só
  lugar antes da expansão pela conversa (PRD-011), ficha (PRD-012),
  distribuição (PRD-013) e métricas gerenciais (PRD-014)

## [0.6.0] — Compass · 2026-05-25

Multi-loja (PRD-007) — fundação completa de operação cross-store. Toda
entidade comercial passa a carregar `storeId` de forma obrigatória, as
listagens dos providers ganham filtro implícito por loja ativa via
`withStoreScope`, o `<StoreSwitcher>` substitui o placeholder do TopBar e
uma página read-only em `/app/configuracoes/lojas` consolida a visão. No
MVP só existe a matriz; a infraestrutura está pronta para receber filiais
e parceiras na Fase 2 sem refatoração arquitetural. **Marco: Bloco 0
(Fundação) está completo.**

### Added

- **`src/features/multistore/` em 5 subpastas** (`hooks`, `utils`,
  `components`, `pages`, `store`) + barrel `@/features/multistore` como
  única superfície pública da camada multi-loja
- **`MultistoreProvider`** entre `<AuthProvider>` e a árvore de rotas;
  carrega o roster de lojas via `useStoresProvider()`, resolve a loja
  ativa em quatro etapas (localStorage → loja primária → primeira
  acessível → null), e persiste a escolha na chave `gallo-current-store-id`
- **Hooks reativos** `useCurrentStore()`, `useAccessibleStores()` e
  `useStoreById()` consumindo o context
- **Helper `withStoreScope(params, ctx)`** com tipagem genérica
  preservando o tipo de entrada — três comportamentos: usuário anônimo →
  `storeId='__no_user__'`; scope `all` → cross-store; demais →
  `storeId=currentStoreId`
- **Helpers `getCurrentContext()`** (acesso síncrono fora de React),
  **`getStoreForUser()`** e **`isStoreAccessible()`**
- **Holder externo `multistoreStore`** com pub/sub pequeno para o
  contexto sincronizar com chamadas fora de React (mock providers em
  selectors)
- **Helpers internos do mock layer** (`_storeScope.ts`):
  `scopedListParams`, `withCreateStoreId`, `assertImmutableStoreId`
- **`<StoreSwitcher>`** integrado ao `<TopBar>` substituindo o placeholder
  estático — sempre visível, abre dropdown mesmo com 1 loja com nota
  "Filiais e parceiras serão habilitadas na Fase 2"; `setCurrentStore`
  com fallback de toast em erro
- **`<StoreBadge store>`** pill compacta por tipo (matriz/filial/parceira)
  pronta para listas cross-store na Fase 2
- **`StoresPage`** em `/app/configuracoes/lojas` (read-only), com card
  por loja acessível mostrando CNPJ, endereço, divisões ativas, número
  de vendedores e clientes vinculados; entrada no `SettingsLayout`
  gated por `permission: { resource: 'store', action: 'view' }`
- **Auditoria de troca de loja** via `auditLog({ action: 'switch_store' })`
  reusando o pipeline do PRD-006 — visível em `/app/configuracoes/auditoria`
  quando exercitada na Fase 2
- **Campo `accessibleStoreIds?: ID[]`** em `ISeller` (extensão pontual do
  PRD-002) habilitando a Fase 2 a atribuir vendedores a múltiplas lojas
- **Campo `storeId: ID`** em `IMockUserProfile` + `accessibleStoreIds?`
  como input para o provider resolver a loja ativa por perfil mockado
- **Campo `storeId: ID`** em `ICommission` (era a única entidade
  transacional faltando o campo); generator e `commissionsApi` atualizados
- **Filtros `storeId` adicionados** em `commissionsApi`, `recommendationsApi`,
  `auditsApi` e suas contratuais correspondentes
- **`docs/multistore.md`** com filosofia, helpers, fluxos de erro,
  esqueleto de policies Supabase RLS e roteiro passo a passo para
  ativar uma filial na Fase 2
- **Glossário** ganha entradas para "Loja ativa (current store)",
  "Matriz", "Filial" e "Parceira"

### Changed

- **Todos os 11 mock providers com entidades scoped por loja** passam a
  consumir `scopedListParams(params, resource)` em `list()` —
  `customers`, `orders`, `quotes`, `leads`, `conversations`,
  `commissions`, `goals`, `transfers`, `recommendations`, `sellers`,
  `audits`
- **Mutations `create`** de `customers`, `orders`, `quotes` e `leads`
  preenchem `storeId` automaticamente quando o caller omite — via
  `withCreateStoreId`
- **Mutations `update`** das mesmas entidades bloqueiam alteração de
  `storeId` (`MockValidationError` com mensagem clara — imutabilidade
  no MVP, transferência fica para Fase 2)
- `auditLog()` e `logMockMutation()` resolvem `storeId` via
  `getCurrentContext()` (com fallback ao seed `store-matriz`), abandonando
  o hardcode anterior
- `<TopBar>` substitui o placeholder "GALLO Matriz" pelo `<StoreSwitcher>`
  reativo
- `SettingsLayout` ganha entrada "Lojas" gated por permissão
- `IListAuditsParams`, `IListCommissionsParams`, `IListRecommendationsParams`
  passam a aceitar `storeId?`

## [0.5.0] — Pilot · 2026-05-25

RBAC visual (PRD-006) — matriz canônica de permissões para os 7 papéis, com
helpers/hooks/componentes reativos, integração com o route guard do PRD-003,
auditoria visual e logging de runtime acoplado aos providers. Tudo é
disciplina de UX/UI; a segurança real entra na Fase 2 com Supabase RLS.

### Added

- **`src/features/rbac/` em 5 subpastas** (`permissions`, `utils`, `hooks`,
  `components`, `pages`) + barrel `@/features/rbac` como única superfície
  pública
- **Matriz de permissões** para 7 papéis (`Owner`, `Gestor`, `Vendedor`,
  `SDR`, `Cliente`, `VendedorExterno`, `Financeiro`) × 18 recursos × 5
  ações × 4 scopes em `permissions/matrix.ts`, com índice pré-computado
  `EFFECTIVE_PERMISSIONS_INDEX` para lookup O(1)
- **Constantes tipadas** `RESOURCES`, `ACTIONS`, `SCOPE_ORDER` com union
  literal — `ResourceName` e `PermissionAction` ganham checagem em compile-time
- **Helpers síncronos** `hasPermission()`, `compareScopes()`,
  `scopeSatisfies()`, `getEffectivePermissions()`, `getCurrentUserScope()`
- **Hooks reativos** `usePermission(resource, action, scope?)` e
  `useCurrentRole()` que consomem o `AuthProvider` do PRD-003 e
  re-renderizam ao trocar perfil
- **Componentes declarativos** `<Can resource action scope? fallback?>` e
  `<Forbidden message?>` (reusa o `EmptyState` do PRD-001)
- **Extensão de `requireAuth(pathname, roles?, permission?)`** mantendo
  retrocompatibilidade — todas as rotas existentes continuam funcionando
- **Tela `/app/configuracoes/papeis`** (read-only) com tabs para os 7
  papéis e tabela de recursos × ações × scope; badge "Edição na Fase 2"
- **Tela `/app/configuracoes/auditoria`** com lista paginada, filtros
  laterais (ator, ação, recurso, faixa de data) sincronizados com a URL,
  expansão de cada item mostrando `before`/`after` em JSON
- **Botão "Exportar CSV"** placeholder com tooltip "Disponível na Fase 2"
- **Audit log runtime**: novo `IAuditsProvider` no barrel
  `@/providers/data` com `mock` + `supabase` stub; `recordAuditLog()`
  fire-and-forget exposto publicamente; helper `auditLog()` em
  `@/features/rbac` para uso por features
- **Mock providers de `customer`, `order`, `quote`, `commission`** passam
  a registrar audit log automaticamente em `create`/`update`/`delete`
  (e `approve` em commission)
- **`AuthProvider`** registra `auth.signin` e `auth.signout` em todo
  evento de troca de perfil
- **`SettingsLayout`** ganha filtragem por permissão fina (não só por
  papel) e exibe entradas "Papéis" e "Auditoria" para quem tem `view` em
  `role` / `audit_log`
- **`docs/rbac.md`** com matriz completa, exemplos de uso e esqueleto das
  policies Supabase RLS previstas para a Fase 2

### Changed

- `requireAuth(pathname, roles?, permission?)` agora aceita um terceiro
  parâmetro opcional `permission` que aciona a checagem RBAC fina; a
  assinatura antiga `requireAuth(path, [...roles])` continua válida
- `auditsApi` (mocks/api/audits.ts) ganha `create`, suporte a filtros
  multi-valor (`actorIds`, `actions`, `resources`) e por faixa de data
  (`since`, `until`); `mutations.ts` expõe `audits` como collection
  mutável
- `package.json` → `0.5.0`

## [0.4.0] — Hub · 2026-05-25

Provider Pattern (PRD-005) — a "fundação invisível" que protege todo o app
de retrabalho na Fase 2. Features passam a consumir dados exclusivamente
através de hooks tipados; a escolha entre mock e Supabase vira uma variável
de ambiente.

### Added

- **`src/providers/data/` em 4 subpastas** (`contracts`, `impl/mock`,
  `impl/supabase`, `hooks`) + `factory.ts`, `context.tsx`, `errors.ts` e
  barrel `@/providers/data` como única superfície pública
- **16 contratos TypeScript** (`ICustomersProvider`, `IVehiclesProvider`,
  `ILeadsProvider`, `IConversationsProvider`, `IMessagesProvider`,
  `IPartsProvider`, `IQuotesProvider`, `IOrdersProvider`,
  `ICommissionsProvider`, `IGoalsProvider`, `IRecommendationsProvider`,
  `ITransfersProvider`, `ISegmentsProvider`, `ISellersProvider`,
  `IStoresProvider`, `ISettingsProvider`) espelhando 1:1 as APIs do
  PRD-004, com tipo agregador `IDataProviders`
- **16 implementações `mockXxxProvider`** delegando para `@/mocks` — pura
  delegação, sem lógica adicional
- **16 esqueletos `supabaseXxxProvider`** lançando `NotImplementedError`
  tipado com referência ao PRD futuro de implementação
- **`getDataProviders()`** lê `import.meta.env.VITE_DATA_SOURCE`
  (`mock` default | `supabase`) com fallback `mock` + `console.warn` em
  dev quando valor é inválido; instâncias são singletons para referência
  estável no React Context
- **`<DataProvidersProvider>`** inserido entre `<ThemeProvider>` e
  `<AuthProvider>` no `__root.tsx`; expõe os providers via Context
- **16 hooks** (`useCustomersProvider`, `useOrdersProvider`, etc.) com
  helper interno `useDataProviderSlice` que lança erro claro quando usado
  fora do Provider
- **`NotImplementedError`** com `instanceof Error` e mensagem completa
  (provider + método + PRD futuro)
- **`.env.example`** documentando `VITE_DATA_SOURCE`
- **`src/vite-env.d.ts`** tipando `import.meta.env.VITE_DATA_SOURCE` como
  `'mock' | 'supabase' | undefined`
- **Regras ESLint `no-restricted-imports`** bloqueando: features
  importarem `@/mocks` ou `@/mocks/api/*` (apenas `impl/mock/**` pode);
  qualquer arquivo fora de `src/providers/data/` importar `impl/*`,
  `contracts/*` ou `factory`; com exceção dev-only para
  `src/routes/design-system.tsx` (acessa `useResetMocks`)
- **`docs/provider-pattern.md`** com filosofia, diagrama de camadas,
  passo a passo de adição de novo agregado, regras de isolamento e
  aplicação futura em outras integrações (WhatsApp, pagamento, frete)

### Changed

- **`src/routes/__root.tsx`** — árvore de providers passa a ser
  `QueryClientProvider > ThemeProvider > DataProvidersProvider >
AuthProvider > <Outlet/>`

## [0.3.0] — Genesis · 2026-05-25

Camada de mocks completa (PRD-004) — a "fundação invisível" sobre a qual todo
o app vai operar até a Fase 2 (Supabase).

### Added

- **`src/mocks/` em 5 subpastas** (`config`, `data`, `generators`, `store`,
  `api`, `hooks`) com barrel raiz `@/mocks` como única superfície pública
- **Geradores determinísticos** para ~32 entidades do modelo conceitual
  (PRD-002): clientes B2B/B2C, veículos, leads, conversas, mensagens, peças,
  orçamentos, pedidos, comissões, metas, recomendações, transferências de
  carteira, segmentos, papéis, auditoria, contas WhatsApp, badges, ranking,
  positivação e curva ABC
- **Determinismo via `seedrandom`** + `@faker-js/faker` (locale `pt_BR`),
  reseedados por contexto: a mesma seed produz exatamente o mesmo dataset em
  qualquer máquina
- **Volumes realistas**: ~2200 itens no dataset default (70 clientes,
  200 peças, 80 conversas, ~600 mensagens, 120 pedidos espalhados em
  12 meses, 80 leads, 30 orçamentos, 8 metas, 25 recomendações)
- **Integridade referencial**: validador em dev percorre todas as FKs no fim
  do bootstrap e loga inconsistências sem quebrar a UI
- **Store Zustand interno** (`mockStore`) com `selectors` e `mutations`
  tipados — bootstrap automático no primeiro acesso à store
- **APIs públicas** seguindo contrato CRUD + queries específicas por agregado
  (`customersApi`, `vehiclesApi`, `leadsApi`, `conversationsApi`,
  `messagesApi`, `partsApi`, `quotesApi`, `ordersApi`, `commissionsApi`,
  `goalsApi`, `recommendationsApi`, `transfersApi`, `segmentsApi`,
  `sellersApi`, `storesApi`, `settingsApi`, `auditsApi`, `badgesApi`,
  `rankingsApi`, `positivationsApi`, `abcsApi`, `whatsappAccountsApi`,
  `rolesApi`) — assinatura idêntica à do `SupabaseProvider` da Fase 2
- **Paginação genérica** (`IPaginatedResult<T>` + `paginate()` helper)
  uniforme em todas as operações `list`
- **Simulação de latência** (80–180ms default) e **erro tipado** (`ERROR_RATE`
  default 0,5% em dev) em toda chamada de API via wrapper `runApi`
- **Erros tipados**: `MockError` base + `MockNotFoundError`,
  `MockValidationError`, `MockNetworkError`, `MockUnauthorizedError` —
  consumidores narrowing via `instanceof`
- **Logs compactos** no console em dev (`MOCK_LOGS_ENABLED`) para debug, com
  cor por status
- **Hook `useResetMocks`** + seção **"Mocks (dev only)"** em `/design-system`
  permitindo reset com seed customizada ou nova seed automática
- **Regra ESLint** `no-restricted-imports` bloqueando imports de
  `@/mocks/store/*`, `@/mocks/generators/*` e `@/mocks/data/*` fora da pasta
  `src/mocks/` — força uso do barrel público

### Changed

- `package.json` adiciona `zustand`, `@faker-js/faker`, `seedrandom` e
  `@types/seedrandom` como dependências

## [0.2.0] — Genesis · 2026-05-25

Esqueleto navegável da plataforma. PRD-003 implementado.

### Added

- **Roteamento end-to-end**: 3 árvores de rota (`/app/*` interno, `/loja/*`
  vitrine, `/auth/*` login) + rotas de erro (`/sem-permissao`, `/erro`).
  Todas as 30+ rotas funcionais com placeholders referenciando os PRDs futuros
- **Auth mockada** com 3 perfis (Owner "João Gallo", Vendedor "Carlos Santos",
  Cliente "Transportadora Aurora") em `/auth/login`, persistência em
  `localStorage` chave `gallo-mock-user`
- **AuthProvider + useAuth** hook com `signIn`, `signOut`, `hasRole`
- **Guards de role** via `beforeLoad` em rotas TanStack — `/app/*` exige
  Owner ou Vendedor; rotas de Gestão e Carteira exigem Owner
- **8 layouts reutilizáveis**: AppLayout, AuthLayout, EmptyLayout, LojaLayout,
  ConversationLayout (3 colunas), DetailLayout (2 colunas), DashboardLayout,
  SettingsLayout (sub-sidebar)
- **Sidebar** contextualizada por papel (Owner vê todos os agrupamentos;
  Vendedor vê subconjunto), expandida/colapsada com persistência em
  `localStorage` (`gallo-sidebar-collapsed`)
- **TopBar** com logo, seletor de loja (mock "GALLO Matriz"), busca global
  placeholder, notificações com badge + dropdown mockado, ThemeSwitcher,
  avatar com dropdown (Perfil, Configurações, Trocar perfil, Sair)
- **BottomNav** mobile (`<768px`) com 4 itens prioritários + Sheet "Mais"
- **LojaHeader** e **LojaFooter** para vitrine pública
- **PlaceholderPage / EmptyState** componentes reutilizáveis
- **RouteSkeleton** para `<Suspense>` fallback (lazy loading já ativo via
  `tanstackRouter({ autoCodeSplitting: true })`)
- Rota raiz `/` redireciona inteligentemente baseado em auth e papel
- Página `/app/configuracoes/aparencia` minimamente funcional (ThemeSwitcher
  integrado)

### Changed

- `__root.tsx` agora envolve a árvore em `<AuthProvider>`
- Home (`/`) deixou de ser página estática — agora é redirect via
  `beforeLoad`
- README implícito: estrutura `src/features/shell/` e `src/features/auth/`
  introduzidas

### Notes

- **Adaptação ao stack**: PRD-003 especifica React Router v6; mantivemos
  TanStack Router (já configurado e funcional). Conceitos equivalentes
  (rotas aninhadas, lazy loading, guards via `beforeLoad`, layout routes).
- Auth mockada é **UX, não segurança** — qualquer um pode editar
  localStorage. Proteção real virá na Fase 2 (Supabase Auth + RLS).
- Conteúdo funcional das 30+ telas internas será preenchido pelos PRDs
  específicos dos Blocos 1-6.

## [0.1.1] — Genesis · 2026-05-25

Modelo conceitual de domínio completo. PRD-002 implementado.

### Added

- Modelo conceitual GALLO consolidado em `src/shared/types/` (10 arquivos)
  cobrindo ~40 entidades: plataforma, pessoas, cliente, lead, conversa,
  catálogo, comercial e BI
- Tipos utilitários comuns: `ID`, `ISO8601`, `Money`, `Division`,
  `ThemeName`, `ThemeMode` em `common.ts`
- Barrel export em `src/shared/types/index.ts` — import único via
  `@/shared/types`
- `docs/glossario.md` — definições operacionais oficiais do domínio
  (termos técnicos do mercado de peças pesadas, comerciais, operacionais
  e arquiteturais)
- JSDoc com `@see` glossário nas interfaces principais
  (`ICustomer`, `IPart`, `IConversation`, `ICarteiraTransfer`,
  `IPositivation`, `IRecommendation` etc.)
- Discriminated union B2B/B2C em `ICustomer` (CNPJ vs CPF)
- Suporte modelado de 4 tipos de transferência de carteira
  (`CarteiraTransferType`)
- Capability matrix de WhatsApp (`IWhatsAppCapabilities`) preparando UI
  adaptativa por provider

### Changed

- `tsconfig.json` reforçado com `noImplicitAny`, `strictNullChecks` e
  `noUncheckedIndexedAccess`
- `src/config/themes.ts` agora re-exporta `ThemeName` e `ThemeMode` de
  `@/shared/types` (fonte única)
- `src/lib/contrast.ts` ajustado para o novo `noUncheckedIndexedAccess`
- `src/components/ui/input-otp.tsx` ajustado para acesso seguro a slots

### Notes

- `exactOptionalPropertyTypes` permanece **desativado** — incompatível
  com boilerplate atual do shadcn/ui em vários componentes
  (`context-menu`, `dropdown-menu`, `menubar`, `Icon`). Registrado como
  tech-debt; reavaliar em PRD futuro de hardening.
- Equipes (`ITeam`) modeladas mas **dormentes** no MVP.
- SERVICE e INDUSTRIAL modeladas via `Division` mas dormentes no MVP
  (todas as entidades comerciais nascem com `division: 'parts'`).

## [0.1.0] — Genesis · 2026-05-25

Fundação visual da plataforma. PRD-001 implementado.

### Added

- Identidade visual GALLO BASE DIESEL aplicada à UI
- Arquitetura de tokens em 3 camadas: primitivos → semânticos → tema
- Sistema de **4 temas × 2 modos** (8 combinações):
  Diesel (Black Gold), Parts (Forest), Service (Crimson), Industrial (Amber);
  light/dark/auto
- `ThemeProvider`, hook `useTheme()`, `ThemeSwitcher` com codinomes UI
- Persistência em `localStorage` (`gallo-theme`, `gallo-mode`) com fallback
  silencioso quando indisponível
- Script anti-FOUC inline no `<head>` aplicando tema/modo antes do primeiro paint
- Tipografia oficial: **Saira Condensed** (display), **Inter** (UI),
  **JetBrains Mono** (códigos OEM) via Google Fonts com `font-display: swap`
- Logo GALLO em variantes (`horizontal`, `vertical`, `mark`) — placeholders
  tipográficas que adaptam cor ao modo
- Favicon SVG com signo GALLO
- Wrapper `<Icon>` sobre Iconify (`@iconify/react`) com fallback gracioso
  e carregamento sob demanda
- Layout primitives: `Stack`, `Inline`, `Grid`, `Container`
- Galeria shadcn/ui customizada consumindo apenas tokens semânticos
- Rota `/design-system` (dev-only, redireciona em produção) com:
  tokens primitivos, tokens semânticos resolvidos, tipografia, espaçamento,
  raios, sombras, ícones recomendados, galeria de componentes,
  validador de contraste WCAG 2.1 em tempo real
- Respeito a `prefers-reduced-motion`

### Notes

- Logos atuais são **placeholders tipográficas**; substituir pelos SVGs
  oficiais em `public/` quando disponíveis.
- Cores funcionais (`success`/`warning`/`danger`/`info`) são propositalmente
  distintas das submarcas para evitar confusão semântica.
