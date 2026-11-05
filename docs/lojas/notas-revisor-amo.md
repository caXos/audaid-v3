# Notes to reviewer (AMO)

Paste the block below into the "Notes to Reviewer" field when submitting a version.

---

**What it does.** AudAid helps court staff of the Brazilian Labor Courts (TRT 1–24) schedule and reschedule hearings in **PJe**, the official court case-management system, from the case screen. It only runs on `pje.trtN.jus.br`, `pje-homologacao.trtN.jus.br` and `pje-treinamento.trtN.jus.br` (N = 1–24).

**How it talks to the server.** The content script calls PJe's own REST endpoints (same origin, the same requests PJe's UI makes), using the session cookies and the XSRF token that PJe already set in the browser. It reads the logged-in court unit and the user's name from PJe's own `access_token` cookie, locally. **No data is sent anywhere other than the PJe server of the court.** There is no analytics, no tracking and no remote code. `data_collection_permissions` is set to `none`.

**New in 3.1: batch scheduling ("Controle em Lote").** A full-screen panel where the user pastes a list of case numbers, builds a hearing schedule for one day and room, and then saves the hearings one by one. To show and sort the list, it reads the parties and lawyers of each case from PJe; **names are kept only in memory and never stored**. It stores locally (`storage.local`) a draft of the schedule being built (case numbers, times and settings, no party names) and the last values used, so the user can resume later. The draft is deleted when the real saving starts. **No new permissions** were added.

**Testing.** PJe requires a court employee account (digital certificate or government credentials), so the extension cannot be exercised without one. Every write action (schedule/reschedule a hearing, create a GIGS task, toggle "Juízo 100% Digital" for a Julgamento hearing) is preceded by a confirmation dialog listing exactly what will be sent, and a **simulation mode** shows the requests without sending them.

**Third-party code.** Since version 3.1 the panels and the options page use **Vue 3.5** (npm package `vue`, runtime-only build, bundled unminified into `content.js` and `opcoes.js`). Templates are precompiled at build time, so there is no `eval` or `new Function`. The `innerHTML` warning in `content.js` and in `opcoes.js` comes from Vue's runtime (`insertStaticContent`), which Vue uses only for static HTML from our own precompiled templates. The extension never uses `v-html`, and all data from PJe is rendered as text.

**Source code and build.** The package is built from TypeScript with Vite. The output is **not minified** on purpose, so it stays readable. To reproduce the submitted package from the attached source:

```
Node.js 20 or newer (built with Node 24.13.1, npm 11.8.0)
npm ci
npm run build:release
# The Firefox package is the contents of dist/firefox/
```

Public repository: https://github.com/caXos/audaid-v3 · Privacy policy: https://caxos.github.io/audaid-v3/privacidade.html

---

## Em português (para você)

O resumo acima diz ao revisor:
- o que a extensão faz e onde ela roda;
- que ela usa a sessão do PJe, sem mandar nada para fora;
- desde a 3.1, o Controle em Lote: lê partes e advogados só para mostrar, guarda o rascunho sem
  nomes, e não pede permissão nova;
- que não dá para testar sem conta no PJe;
- como compilar o pacote a partir do fonte, que a AMO exige porque usamos um empacotador (Vite).
