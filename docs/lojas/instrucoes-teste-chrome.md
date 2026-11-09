# Test instructions (Chrome Web Store)

Paste the block below (between the lines) into the dashboard's **"Instruções de teste"** tab
("Test instructions"), field **"Instruções adicionais"**. Leave username and password empty. It is
plain text on purpose. **Limit: 500 characters.** This block has 470 (version 3.2.0); keep it under
the limit when updating it.

---

AudAid runs only inside PJe, the Brazilian Labor Courts' case system (pje.trtN.jus.br/pjekz/*), after login. PJe accounts are personal and restricted to court staff, so we cannot share test credentials. Without login you can check: on install, the terms page opens; accept it; the toolbar icon opens Options (button, GIGS, sort rules, Pauta, simulation mode). 3.2.0 updates the published 3.1.0 with the same permissions and adds Pauta. Source: github.com/caXos/audaid-v3

---

## Em português (para você)

O bloco acima é para a aba **"Instruções de teste"** do painel da Chrome Web Store, cujo campo
aceita **até 500 caracteres**. Até a 3.2.0 a aba estava vazia, e a 3.2.0 foi recusada em 09/11/2026
por "Yellow Magnesium" (funcionalidade que não funciona), numa revisão automática. Sem conta no PJe,
o revisor instala e não vê nada além dos termos e das Opções.

O bloco diz ao revisor:
- onde o AudAid roda: só no `/pjekz/` do PJe, depois do login;
- por que não há conta de teste: o login é pessoal e restrito aos servidores;
- o que ele consegue conferir sem conta: os termos abrem na instalação, o aceite e as Opções (com
  as seções);
- que a 3.2.0 atualiza a 3.1.0 publicada, com as mesmas permissões, e que a novidade é a Pauta;
- onde está o código.

Ao atualizar o bloco numa versão nova, revise a frase da versão ("3.2.0 updates…") e os nomes das
seções das Opções (`src/paginas/opcoes/`), e **conte os caracteres** antes de colar.
