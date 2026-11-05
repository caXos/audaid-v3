# Chrome Web Store: aba "Práticas de privacidade"

Textos prontos para colar nos campos do painel do desenvolvedor.

## Finalidade única

> Ajudar assistentes de audiência dos Tribunais Regionais do Trabalho a designar e redesignar audiências no PJe, um processo por vez a partir da tela do processo ou a pauta de um dia inteiro a partir de uma lista de processos, consultando a pauta, o calendário e os tipos de audiência do próprio PJe e gravando as audiências (e, se pedido, uma atividade no GIGS) em nome do usuário logado.

## Justificativa de cada permissão

**storage**
> Guarda localmente as opções do usuário (posição e estilo do botão, sugestões de texto do GIGS, regras de ordenação, modo simulação), a data e a versão em que ele aceitou os termos de uso e, no Controle em Lote, o rascunho da pauta em montagem (números de processo, horários e ajustes, sem nomes de partes) e os últimos valores usados. Nada é sincronizado nem enviado.

**Permissões de host** (`https://pje.trtN.jus.br/*`, `https://pje-homologacao.trtN.jus.br/*` e `https://pje-treinamento.trtN.jus.br/*`, N = 1 a 24)
> A extensão só funciona nas páginas do PJe dos 24 TRTs, nos três ambientes oficiais. Ela precisa desses hosts para mostrar o botão nas telas do PJe e para fazer, com a sessão do usuário, as mesmas requisições que as telas do PJe fazem (ler os processos, as partes, a pauta, o calendário e os tipos de audiência; designar ou redesignar as audiências). Nenhum outro site é acessado.

## Uso de código remoto

> **Não.** Todo o código está no pacote da extensão; nada é baixado ou executado de fora.

## Uso de dados

Marque **apenas**:

- **Informações de autenticação.** A extensão usa a sessão do PJe que já está no navegador (cookies e token XSRF) para autenticar as requisições ao próprio PJe, e lê localmente, do token, o órgão em que o usuário está logado e o nome dele (para a variável `{eu}` do GIGS). Esses dados não saem do navegador, a não ser dentro das requisições ao próprio PJe.

Não marque as outras categorias: a extensão não coleta histórico, localização, comunicação pessoal etc. O conteúdo dos processos que ela lê (inclusive os nomes das partes e dos advogados, no Controle em Lote) vem do PJe, é mostrado na tela e não sai do navegador nem é guardado; o rascunho do lote guarda só números de processo, horários e ajustes.

Marque as três declarações:
- não vendo nem transfiro dados a terceiros, fora os casos de uso aprovados;
- não uso nem transfiro dados para finalidades não relacionadas à finalidade única;
- não uso nem transfiro dados para determinar crédito ou para empréstimos.

## URL da política de privacidade

https://caxos.github.io/audaid-v3/privacidade.html
