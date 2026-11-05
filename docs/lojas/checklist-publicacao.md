# Checklist de publicação (a cada versão)

## 1. Gerar os pacotes (no repositório)

```
git status            # precisa estar limpo: o zip do fonte sai do último commit
npm ci
npm run pacotes
```

Isso roda tipos + testes, gera o build de **release** (modo simulação desligado e escondido) e cria
em `pacotes/` os três arquivos da versão. Os pacotes de outras versões que já estiverem lá ficam
(desde a 3.1, o script só apaga os da própria versão):

| Arquivo | Vai para |
|---|---|
| `audaid-<versão>-firefox.zip` | AMO, como o pacote da extensão |
| `audaid-<versão>-fonte.zip` | AMO, campo "código-fonte" (exigido porque usamos empacotador) |
| `audaid-<versão>-chrome.zip` | Chrome Web Store (e Edge Add-ons, se for publicar lá) |

Antes de enviar, confira:
- [ ] `npx web-ext lint --source-dir dist/firefox` sem **erros**. Os 4 avisos são esperados: 2 sobre `data_collection_permissions` e, desde a 3.1, 1 de `innerHTML` no `content.js` e 1 no `opcoes.js`, que vêm do runtime do Vue e estão explicados nas notas para o revisor da AMO;
- [ ] carregue `dist/firefox` e `dist/chrome` uma vez e confira: termos abrem, botão aparece, Opções **sem** simulação ligada;
- [ ] depois, `npm run build` para voltar o `dist/` ao build de desenvolvimento.

Se a política de privacidade mudou (como na 3.1, termos v3), **mescle no `main` antes de enviar**: o
GitHub Pages publica `docs/privacidade.html` a partir do `main`, e as lojas conferem o link.

## 2. Firefox: addons.mozilla.org (AMO)

A listagem já existe (a 3.0 foi aprovada). Para uma versão nova:
- [ ] https://addons.mozilla.org/developers/ → AudAid → **Enviar nova versão**.
- [ ] Envie `audaid-<versão>-firefox.zip`.
- [ ] Quando perguntar sobre código-fonte: **Sim**, envie `audaid-<versão>-fonte.zip`.
- [ ] Notas para o revisor: o bloco em inglês de `docs/lojas/notas-revisor-amo.md`.
- [ ] Se a descrição mudou (como na 3.1, com o Controle em Lote): atualize em **Editar página do produto**, com `docs/lojas/descricao.md`.
- [ ] Capturas de tela: as mesmas da Chrome Web Store.

## 3. Chrome Web Store

A listagem já existe (a 3.0 foi publicada). Para uma versão nova:
- [ ] https://chrome.google.com/webstore/devconsole → AudAid → **Pacote** → **Fazer upload do novo pacote** → `audaid-<versão>-chrome.zip`.
- [ ] **Listagem da loja:** se a descrição mudou, cole a de `docs/lojas/descricao.md` (resumo e descrição).
- [ ] **Imagens (só você pode fazer, no PJe):** na 3.1, acrescente capturas do Controle em Lote (a
  pauta montada e o relatório da execução), 1280×800. **Esconda nomes de partes e números de
  processo reais**, ou use processos de teste.
- [ ] **Práticas de privacidade:** confira com `docs/lojas/justificativas-permissoes.md` (na 3.1, a
  finalidade única e a justificativa do `storage` mudaram).
- [ ] Enviar para revisão.

## 4. Depois de publicar

- [ ] Anotar no blueprint (§11) a data e as versões nas duas lojas.
- [ ] Criar a tag da versão (`git tag v<versão>` no commit dos pacotes e `git push --tags`).
- [ ] Com a 3.1 nas duas lojas: **avisar os usuários da v1** (D54) e, depois da migração, **excluir a v1 da AMO** (D36).
