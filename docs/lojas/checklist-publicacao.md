# Checklist de publicação (a cada versão)

## 1. Gerar os pacotes (no repositório)

```
git status            # precisa estar limpo: o zip do fonte sai do último commit
npm ci
npm run pacotes
```

Isso roda tipos + testes, gera o build de **release** (modo simulação desligado e escondido) e cria
em `pacotes/`:

| Arquivo | Vai para |
|---|---|
| `audaid-<versão>-firefox.zip` | AMO, como o pacote da extensão |
| `audaid-<versão>-fonte.zip` | AMO, campo "código-fonte" (exigido porque usamos empacotador) |
| `audaid-<versão>-chrome.zip` | Chrome Web Store (e Edge Add-ons, se for publicar lá) |

Antes de enviar, confira:
- [ ] `npx web-ext lint --source-dir dist/firefox` sem **erros**. Os 4 avisos são esperados: 2 sobre `data_collection_permissions` e, desde a 3.1, 1 de `innerHTML` no `content.js` e 1 no `opcoes.js`, que vêm do runtime do Vue e estão explicados nas notas para o revisor da AMO;
- [ ] carregue `dist/firefox` e `dist/chrome` uma vez e confira: termos abrem, botão aparece, Opções **sem** simulação ligada.

## 2. Firefox: addons.mozilla.org (AMO)

- [x] https://addons.mozilla.org/developers/ → **Enviar um novo complemento** → **Neste site** (listado).
- [x] Envie `audaid-<versão>-firefox.zip`.
- [x] Quando perguntar sobre código-fonte: **Sim**, envie `audaid-<versão>-fonte.zip`.
- [x] Descrição, resumo, categoria e links: `docs/lojas/descricao.md`.
- [x] Notas para o revisor: o bloco em inglês de `docs/lojas/notas-revisor-amo.md`.
- [x] Licença: "Todos os direitos reservados" (D38).
- [x] Política de privacidade: https://caxos.github.io/audaid-v3/privacidade.html
- [ ] Ícone: `public/icons/audaid.svg`. Capturas de tela: as mesmas da Chrome Web Store.

## 3. Chrome Web Store

- [x] https://chrome.google.com/webstore/devconsole → **Novo item** → envie `audaid-<versão>-chrome.zip`.
- [x] **Listagem:** descrição e categoria de `docs/lojas/descricao.md`; idioma português (Brasil).
- [x] **Imagens (só você pode fazer, no PJe):**
  - [x] ícone 128×128: `dist/chrome/icons/audaid-128.png`;
  - [x] pelo menos **1 captura de tela 1280×800** (ou 640×400), por exemplo o painel do
    Controle Individual aberto e o resumo de confirmação. **Esconda nomes de partes e
    números de processo reais**, ou use processos de teste;
  - [x] bloco promocional pequeno 440×280 (opcional).
- [x] **Práticas de privacidade:** cole os textos de `docs/lojas/justificativas-permissoes.md`.
- [x] Visibilidade: **Pública**. Regiões: Brasil (ou todas).
- [x] Enviar para revisão.

## 4. Depois de publicar

- [ ] Anotar no blueprint (§10) as URLs das duas listagens e a data.
- [ ] Quando a v3 estiver nas lojas e os usuários tiverem migrado: **excluir a v1 da AMO** (D36).
