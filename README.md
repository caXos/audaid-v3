# AudAid 3

Extensão para **Firefox, Chrome e Edge** que ajuda assistentes de audiência dos TRTs que usam o
**PJe** a designar, redesignar e acompanhar audiências com menos cliques e menos erro.

> ## ⚠️ A extensão age em seu nome
>
> O AudAid faz requisições ao PJe **usando a sua sessão** (os cookies e o token de segurança do
> PJe já presentes no seu navegador), exatamente como se você estivesse clicando nas telas do PJe.
> Tudo o que ele grava (audiências designadas ou redesignadas, atividades do GIGS, alterações do
> Juízo 100% Digital) fica registrado **no seu nome**.
>
> - O AudAid só conversa com o próprio PJe do seu tribunal. **Nenhum dado é enviado a qualquer
>   outro servidor**, nem ao autor da extensão.
> - Antes do primeiro uso, a extensão pede que você leia e aceite estes termos.
> - Use só se você entende e concorda com isso.

## Estado

Em desenvolvimento: **versão 3.0, entrega 1 (prova técnica, somente leitura)**. Nesta etapa a
extensão **não grava nada no PJe**. Numa página de processo, ela mostra um painel que lê dados do
processo, as audiências, os tipos de audiência, as salas, o calendário do órgão e a pauta do dia.

## Compilar

Requer Node 20 ou mais novo.

```sh
npm ci
npm run check     # tipos + testes + build
```

O build gera duas pastas prontas para carregar:

- `dist/firefox/`: Firefox 128+
- `dist/chrome/`: Chrome 120+ e Edge

O código não é minificado, para que a revisão das lojas (e qualquer pessoa) possa lê-lo.

## Carregar para testar

**Firefox:** `about:debugging#/runtime/this-firefox` → **Carregar extensão temporária…** →
escolha `dist/firefox/manifest.json`. Se o botão do AudAid não aparecer no PJe, abra
`about:addons` → AudAid → **Permissões** e permita o acesso aos sites do PJe.

**Chrome / Edge:** `chrome://extensions` (ou `edge://extensions`) → ative o **Modo do
desenvolvedor** → **Carregar sem compactação** → escolha a pasta `dist/chrome`.

Depois de recompilar, use o botão de recarregar da extensão nessas mesmas páginas e recarregue o
PJe.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/pje/` | acesso ao PJe: ambiente e tribunal, sessão (cookies, JWT), requisições, endpoints |
| `src/regras/` | regras puras e testadas: calendário (bloqueio de datas), pauta do dia, tipos de audiência |
| `src/prova/` | painel da prova técnica (entrega 1) |
| `src/ui/` | utilidades de interface (sem frameworks; tudo em Shadow DOM) |
| `scripts/` | build e geração dos manifests de cada navegador |
| `tests/` | testes (Vitest); as fixtures não têm dados pessoais |

## Direitos

© Jorge Henrique Bueno Gomez. Todos os direitos reservados. O código é público para transparência
e revisão; não há licença de uso ou redistribuição.
