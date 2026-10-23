# Chrome Web Store: aba "Práticas de privacidade"

Textos prontos para colar nos campos do painel do desenvolvedor.

## Finalidade única

> Ajudar assistentes de audiência dos Tribunais Regionais do Trabalho a designar e redesignar audiências no PJe a partir da tela do processo, consultando a pauta, o calendário e os tipos de audiência do próprio PJe e gravando a audiência (e, se pedido, uma atividade no GIGS) em nome do usuário logado.

## Justificativa de cada permissão

**storage**
> Guarda localmente as opções do usuário (posição e estilo do botão, sugestões de texto do GIGS, modo simulação) e a data e a versão em que ele aceitou os termos de uso. Nada é sincronizado nem enviado.

**Permissões de host** (`https://pje.trtN.jus.br/*`, `https://pje-homologacao.trtN.jus.br/*` e `https://pje-treinamento.trtN.jus.br/*`, N = 1 a 24)
> A extensão só funciona nas páginas do PJe dos 24 TRTs, nos três ambientes oficiais. Ela precisa desses hosts para mostrar o botão nas telas do processo e para fazer, com a sessão do usuário, as mesmas requisições que as telas do PJe fazem (ler a pauta, o calendário e os tipos de audiência; designar ou redesignar a audiência). Nenhum outro site é acessado.

## Uso de código remoto

> **Não.** Todo o código está no pacote da extensão; nada é baixado ou executado de fora.

## Uso de dados

Marque **apenas**:

- **Informações de autenticação.** A extensão usa a sessão do PJe que já está no navegador (cookies e token XSRF) para autenticar as requisições ao próprio PJe, e lê localmente, do token, o órgão em que o usuário está logado e o nome dele (para a variável `{eu}` do GIGS). Esses dados não saem do navegador, a não ser dentro das requisições ao próprio PJe.

Não marque as outras categorias: a extensão não coleta histórico, localização, comunicação pessoal etc. O conteúdo dos processos que ela lê vem do PJe e volta só para o PJe.

Marque as três declarações:
- não vendo nem transfiro dados a terceiros, fora os casos de uso aprovados;
- não uso nem transfiro dados para finalidades não relacionadas à finalidade única;
- não uso nem transfiro dados para determinar crédito ou para empréstimos.

## URL da política de privacidade

https://caxos.github.io/audaid-v3/privacidade.html
