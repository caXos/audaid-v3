# Test instructions (Chrome Web Store)

Paste the block below (between the lines) into the dashboard's **"Instruções de teste"** tab
("Test instructions"), field **"Instruções adicionais"**. Leave username and password empty. It is
plain text on purpose.

---

WHAT IT IS. AudAid is a tool for staff of the Brazilian Labor Courts (TRT 1-24). It schedules, reschedules and cancels hearings in PJe, the courts' official case-management system. It runs only on pje.trtN.jus.br/pjekz/*, pje-homologacao.trtN.jus.br/pjekz/* and pje-treinamento.trtN.jus.br/pjekz/* (N = 1-24), and only after the user has logged in to PJe.

WHY THERE IS NO TEST ACCOUNT. PJe is restricted to court employees. Each login is personal and tied to the employee's legal identity (CPF and, usually, an ICP-Brasil digital certificate), and court rules forbid sharing it. There are no public demo or test accounts, so we cannot provide credentials. Without a PJe login, the extension's main features (the button inside PJe and its panels) cannot be shown.

WHAT CAN BE CHECKED WITHOUT AN ACCOUNT.
1. Install the extension: the terms-of-use page (termos.html) opens in a new tab.
2. Click "Li e concordo" (I agree) at the end of the page.
3. Click the AudAid icon in the toolbar: the Options page opens, with the sections "Botão do AudAid" (button position and style), "Sugestões de GIGS" (task text suggestions), "Auto organizar o Lote" (sort rules), "Pauta" (court-room calendar settings), "Termos de uso" and "Diagnóstico" (simulation mode, which shows the requests without sending them). Changes are saved locally.
4. Without a PJe login, the PJe pages do not show the AudAid button. That is expected: the button appears only on PJe pages after login.

WHAT A LOGGED-IN USER SEES. A floating AudAid button on every PJe page. On a case page it opens a panel to schedule or reschedule that case's hearing. Elsewhere it opens a menu with "Pauta" (the court rooms' calendar, day by day, where hearings can be scheduled or cancelled) and "Controle em Lote" (scheduling a whole day from a list of case numbers). The screenshots in the listing show these screens.

THIS UPDATE. 3.2.0 updates version 3.1.0, which is already published. The package structure and permissions are the same as 3.1.0 (storage, plus the PJe hosts above). The new feature is "Pauta". There is no remote code, and nothing is sent anywhere except to the PJe host itself.

Source code: https://github.com/caXos/audaid-v3 (the package can be rebuilt from it: npm ci, then npm run build:release; the Chrome package is the content of dist/chrome/).
Privacy policy: https://caxos.github.io/audaid-v3/privacidade.html
Contact: jorgegomezgmzti@gmail.com

---

## Em português (para você)

O bloco acima é para a aba **"Instruções de teste"** do painel da Chrome Web Store. Até a 3.2.0
ela estava vazia, e a 3.2.0 foi recusada em 09/11/2026 por "Yellow Magnesium" (funcionalidade que
não funciona), numa revisão automática. Sem conta no PJe, o revisor instala e não vê nada além dos
termos e das Opções.

O bloco diz ao revisor:
- o que é o AudAid e onde ele roda (só no `/pjekz/` do PJe, depois do login);
- por que não há conta de teste: o login é pessoal e ligado ao servidor, e não pode ser compartilhado;
- o que ele consegue conferir sem conta: os termos, o aceite e as Opções, seção por seção, e que o
  PJe sem login não mostrar o botão é o comportamento esperado;
- o que o usuário logado vê, com remissão às capturas da listagem;
- que a 3.2.0 atualiza a 3.1.0 publicada, com as mesmas permissões, e que a novidade é a Pauta;
- onde estão o código, a política e o contato (o e-mail de desenvolvedor da listagem).

Ao atualizar o bloco numa versão nova, revise a seção "THIS UPDATE" e os nomes das seções das
Opções (`src/paginas/opcoes/`).
