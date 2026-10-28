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
>
> Política de privacidade: https://caxos.github.io/audaid-v3/privacidade.html

## Estado

**Publicada: versão 3.0.1** (Controle Individual). **Em desenvolvimento: 3.1**, com o Controle em
Lote. Por enquanto, as telas 1 e 2: colar a lista, conferir quem entra e montar a pauta (horários,
intervalos, ajustes por processo, GIGS), com rascunho guardado. Ainda sem gravar nada. Nas
versões de desenvolvimento, o **modo simulação vem
ligado por padrão**: para gravar de verdade, desligue-o nas Opções. No modo real, o painel mostra
uma faixa de aviso e pede confirmação, com o resumo do que será gravado, antes de cada envio.

- **Controle Individual** (o botão do AudAid nas telas de processo): designar ou redesignar com
  sala, data (bloqueio por calendário), horário (conferência da pauta), tipo composto, Juízo 100%
  Digital e GIGS. O resultado mostra cada passo. Na simulação, mostra também a requisição que
  seria feita; no envio real, a requisição completa fica em "Copiar requisições".
- **Termos de uso:** abrem na instalação. Até o aceite, a extensão fica inativa.
- **Botão do AudAid** com posição e estilo configuráveis. O painel de diagnóstico (só leitura) abre
  pelo link "Diagnóstico" do Controle Individual.
- **Opções** (clique no ícone do AudAid na barra do navegador): botão, sugestões de GIGS, termos e
  diagnóstico (modo simulação).
- Aviso quando a versão antiga (v1) também está instalada.

`npm run build` gera a versão de desenvolvimento, com o modo simulação ligado por padrão.
`npm run build:release` gera a versão das lojas. `npm run pacotes` gera os zips para as lojas (passo a
passo em `docs/lojas/checklist-publicacao.md`).

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
| `src/componentes/` | base do Vue (montagem no Shadow DOM) e o que o Individual e o Lote compartilham: sala, data, pauta do dia, tipo composto, GIGS, passos da execução |
| `src/individual/` | painel do Controle Individual (Vue): os `.vue` mostram, e os `.ts` ao lado guardam o estado e as regras |
| `src/lote/` | Controle em Lote (Vue, 3.1): lista colada, consulta dos processos, "Não incluídos", pauta (`pauta.ts`, regras puras), arrastar e rascunho |
| `src/fluxo/` | executor da designação: passos, transporte (real/simulado), trava de escrita |
| `src/prova/` | painel de diagnóstico (só leitura) |
| `src/config/` | opções, termos e posição do botão (puro e testado) |
| `src/ext/` | API de extensão: armazenamento e mensagens |
| `src/paginas/` | páginas de termos e de opções |
| `src/ui/` | botão flutuante, ícone e utilidades de interface (sem Vue; Shadow DOM) |
| `scripts/` | build e geração dos manifests de cada navegador |
| `tests/` | testes (Vitest); as fixtures não têm dados pessoais |

## Direitos

© Jorge Henrique Bueno Gomez. Todos os direitos reservados. O código é público para transparência
e revisão; não há licença de uso ou redistribuição.
