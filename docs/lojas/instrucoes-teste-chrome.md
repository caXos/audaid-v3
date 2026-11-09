# Test instructions (Chrome Web Store)

Paste the block below (between the lines) into the dashboard's **"Instruções de teste"** tab
("Test instructions"), field **"Instruções adicionais"**. Leave username and password empty. It is
plain text on purpose. **Limit: 500 characters.** This block has 448 (version 3.2.1); keep it under
the limit when updating it.

---

AudAid works only inside PJe, the Brazilian Labor Courts' case system (pje.trtN.jus.br/pjekz/*), after login with a personal court-staff account, so we cannot share credentials. Without login: on install the terms page opens; click "Li e concordo"; the toolbar icon opens Options. 3.2.1 fixes 3.2.0, which did not load in Chrome (a U+FFFF character in content.js). Permissions are the same as the published 3.1.0. Source: github.com/caXos/audaid-v3

---

## Em português (para você)

O bloco acima é para a aba **"Instruções de teste"** do painel da Chrome Web Store, cujo campo
aceita **até 500 caracteres**.

A 3.2.0 foi recusada duas vezes, em 09/11/2026, por "Yellow Magnesium" (funcionalidade que não
funciona). A causa não era a falta de instruções: **a 3.2.0 não carregava no Chrome.** O `content.js`
tinha um U+FFFF (um "não-caractere" do Unicode), e o Chrome recusa a extensão inteira com "Não foi
possível carregar o arquivo "content.js" para o script de conteúdo. Ele não possui a codificação
UTF-8". O Firefox aceita, e por isso o erro não apareceu nos testes. A 3.2.1 corrige isso, e o build
passou a falhar se o caractere voltar.

O bloco diz ao revisor:
- onde o AudAid roda: só no `/pjekz/` do PJe, depois do login;
- por que não há conta de teste: o login é pessoal e restrito aos servidores;
- o que ele consegue conferir sem conta: os termos abrem na instalação, o aceite ("Li e concordo") e
  as Opções pelo ícone da barra;
- que a 3.2.1 corrige o erro de carga da 3.2.0, com as mesmas permissões da 3.1.0 publicada;
- onde está o código.

Ao atualizar o bloco numa versão nova, revise a frase da versão ("3.2.1 fixes…") e **conte os
caracteres** antes de colar.
