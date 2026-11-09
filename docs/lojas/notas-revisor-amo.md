# Notes to reviewer (AMO)

Paste the block below (between the lines) into the "Notes to Reviewer" field when submitting a
version. It is plain text on purpose: the field does not render Markdown. **AMO limit: 3000
characters.** This block has 2264 (version 3.2.0); keep it under the limit when updating it.

---

WHAT IT DOES. AudAid helps staff of the Brazilian Labor Courts (TRT 1-24) schedule, reschedule and cancel hearings in PJe, the official case-management system. It runs only on pje.trtN.jus.br, pje-homologacao.trtN.jus.br and pje-treinamento.trtN.jus.br (N = 1-24).

SERVER ACCESS. The content script calls PJe's own REST endpoints on the same host, with the session cookies and XSRF token PJe already set. It reads the logged-in court unit and the user's name locally from PJe's access_token cookie. AUD4 (/audapi, the hearings system on the same host) may receive that token as a Bearer header if cookies alone are refused. Nothing is sent anywhere else: no analytics, no tracking, no remote code. data_collection_permissions is "none".

FEATURES. Case panel (one hearing at a time); batch scheduling (since 3.1); and, new in 3.2, "Pauta", a court-room calendar. Pauta reads the user's profiles, rooms and day schedules only for the days scrolled into view, at most 4 requests at a time, and never refreshes on its own. Writes (schedule, reschedule or cancel a hearing; GIGS task; toggling "Juízo 100% Digital" for a Julgamento hearing) happen only in the logged-in unit, after a confirmation dialog. A simulation mode shows the requests without sending them.

STORAGE (storage.local). Options, terms acceptance, the batch draft (case numbers and times, no names), the user's court units and the last room chosen. Party and lawyer names stay in memory only and are never stored. No new permissions in 3.2. The terms went to version 4, so users accept them again.

TESTING. PJe requires a court employee account, so the extension cannot be exercised without one.

THIRD-PARTY CODE. Vue 3.5 runtime-only (npm "vue"), bundled unminified into content.js and opcoes.js. Templates are precompiled, so there is no eval or new Function. The innerHTML warnings come from Vue's insertStaticContent, used only for our own precompiled static templates. No v-html; PJe data is rendered as text.

BUILD (Vite, not minified). Node 20 or newer (built with Node 24.13.1, npm 11.8.0):
npm ci
npm run build:release
The Firefox package is the content of dist/firefox/.

Repository: https://github.com/caXos/audaid-v3
Privacy policy: https://caxos.github.io/audaid-v3/privacidade.html

---

## Em português (para você)

O bloco acima diz ao revisor, em texto simples e abaixo do limite de 3000 caracteres da AMO:
- o que a extensão faz e onde ela roda;
- que ela usa a sessão do PJe e o AUD4 no mesmo endereço (com o token como Bearer só se os cookies
  não bastarem), sem mandar nada para fora;
- as três partes: o painel do processo, o Lote (3.1) e a Pauta (3.2), com o que a Pauta lê (só os
  dias na tela, no máximo 4 consultas ao mesmo tempo, sem atualização automática);
- que toda gravação é só no órgão logado, com confirmação, e que há modo simulação;
- o que fica guardado (sem nomes), que não há permissão nova e que os termos foram para a v4;
- que não dá para testar sem conta no PJe;
- por que o lint avisa de `innerHTML` (o Vue);
- como compilar o pacote a partir do fonte, que a AMO exige porque usamos um empacotador (Vite).
