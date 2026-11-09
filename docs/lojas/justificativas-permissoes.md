# Chrome Web Store: aba "Práticas de privacidade"

Textos prontos para colar nos campos do painel do desenvolvedor. Revisados para a 3.2.1
(09/11/2026): mais curtos, com o requisito de login do PJe dito já na finalidade única, e com a
finalidade nas mesmas palavras da política de privacidade ("designar, cancelar e acompanhar
audiências no PJe a pedido do usuário: uma por vez, em lote ou pela pauta"). As permissões são as
mesmas da 3.1.0 publicada: `storage` e os hosts do PJe.

O painel não mostra limite para esses campos, e os textos da 3.1 e da 3.2.0 (cerca de 700
caracteres) foram aceitos. Os de agora são mais curtos; o número de caracteres está ao lado de cada
um.

## Finalidade única

(474 caracteres)

> Ajudar assistentes de audiência dos Tribunais Regionais do Trabalho a designar, redesignar, cancelar e acompanhar audiências no PJe, a pedido do usuário: um processo por vez, na tela do processo; em lote, a pauta de um dia a partir de uma lista de processos; ou pela pauta das salas dos órgãos do usuário. A extensão funciona só dentro do PJe dos TRTs, depois do login, e faz no PJe, com a sessão do próprio usuário, as mesmas leituras e gravações que as telas do PJe fazem.

## Justificativa de cada permissão

**storage** (442 caracteres)
> Guarda, só neste navegador: as opções do usuário (botão, sugestões do GIGS, regras de ordenação, modo simulação e preferências da Pauta); a data e a versão do aceite dos termos; o rascunho do Controle em Lote (números de processo, horários e ajustes, sem nomes de partes) e os últimos valores usados nele; e, na Pauta, a lista dos órgãos do usuário (número, sigla e nome) e a última sala escolhida em cada um. Nada é sincronizado nem enviado.

**Permissões de host** (`https://pje.trtN.jus.br/*`, `https://pje-homologacao.trtN.jus.br/*` e `https://pje-treinamento.trtN.jus.br/*`, N = 1 a 24) (501 caracteres)
> O AudAid só funciona no PJe dos 24 TRTs, nos três ambientes oficiais. Nesses endereços ele mostra o seu botão e faz, com a sessão do usuário, as mesmas requisições que as telas do PJe fazem: lê processos, partes, a pauta das salas, o calendário e os tipos de audiência; e designa, redesigna ou cancela audiências quando o usuário confirma. Na Pauta, consulta também o AUD4, o sistema de audiências que fica no mesmo endereço (/audapi), para a lista de órgãos do tribunal. Nenhum outro site é acessado.

## Uso de código remoto

> **Não.** Todo o código está no pacote da extensão; nada é baixado ou executado de fora.

## Uso de dados

Marque **apenas**:

- **Informações de autenticação.** A extensão usa a sessão do PJe que já está no navegador (cookies e token XSRF) para autenticar as requisições ao próprio PJe, e lê localmente, do token, o órgão em que o usuário está logado e o nome dele (para a variável `{eu}` do GIGS). No AUD4, que fica no mesmo endereço do PJe, se a sessão sozinha não bastar, o token de acesso vai no cabeçalho `Authorization`. Esses dados não saem do navegador, a não ser dentro das requisições ao próprio PJe.

Não marque as outras categorias. É a mesma declaração da 3.0 à 3.2.0, e mudá-la agora só abriria
outra frente na revisão. A extensão não coleta histórico, localização, comunicação pessoal etc. O
conteúdo dos processos que ela lê (inclusive os nomes das partes e dos advogados, no Controle em
Lote e na Pauta) vem do PJe, é mostrado na tela e não sai do navegador nem é guardado. O rascunho do
lote guarda só números de processo, horários e ajustes, e a Pauta guarda só a lista dos órgãos do
usuário e a última sala de cada um.

Marque as três declarações:
- não vendo nem transfiro dados a terceiros, fora os casos de uso aprovados;
- não uso nem transfiro dados para finalidades não relacionadas à finalidade única;
- não uso nem transfiro dados para determinar crédito ou para empréstimos.

## URL da política de privacidade

https://caxos.github.io/audaid-v3/privacidade.html
