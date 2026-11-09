# AudAid 3

Extensão para **Firefox, Chrome e Edge** que ajuda assistentes de audiência dos TRTs que usam o
**PJe** a designar, redesignar e acompanhar audiências com menos cliques e menos erro.

> ## ⚠️ A extensão age em seu nome
>
> O AudAid faz requisições ao PJe **usando a sua sessão** (os cookies e o token de segurança do
> PJe já presentes no seu navegador), exatamente como se você estivesse clicando nas telas do PJe.
> Tudo o que ele grava (audiências designadas, redesignadas ou canceladas, atividades do GIGS,
> alterações do Juízo 100% Digital) fica registrado **no seu nome**, e as consultas também.
>
> - O AudAid só conversa com o próprio PJe do seu tribunal. **Nenhum dado é enviado a qualquer
>   outro servidor**, nem ao autor da extensão.
> - Antes do primeiro uso, a extensão pede que você leia e aceite estes termos.
> - Use só se você entende e concorda com isso.
>
> Política de privacidade: https://caxos.github.io/audaid-v3/privacidade.html

## Estado

**Enviadas às lojas: 3.1** (05/11/2026), com o Controle em Lote, e **3.2** (09/11/2026), com a
Pauta. Nas versões de desenvolvimento, o **modo simulação vem ligado por padrão**: para gravar de
verdade, desligue-o nas Opções. No modo real, o AudAid mostra uma faixa de aviso e pede confirmação,
com o resumo do que será gravado, antes de cada envio.

- **Pauta** (3.2; o botão do AudAid fora de um processo → "Pauta", ou "Abrir a pauta" no Controle
  Individual): a pauta das salas dos órgãos em que o usuário tem perfil, numa lista contínua a partir
  de hoje, com filtros de órgão, sala e mês. Cada dia é lido só quando aparece na tela, no máximo 4
  consultas ao mesmo tempo. "Todas as salas" junta as salas do órgão pela hora. No órgão logado, o
  calendário com "+" designa numa vaga (ou "+ Designar" no dia), com o formulário do Individual, e a
  lixeira cancela, uma audiência por vez, com confirmação. Nos outros órgãos, só consulta.
- **Controle em Lote** (o botão do AudAid fora de um processo → "Controle em Lote", ou o link no Controle Individual): a
  pauta de um dia inteiro a partir de uma lista colada. Confere quem entra, monta a pauta (pelas
  vagas da sala ou em sequência, intervalos, ajustes e GIGS por processo, Auto organizar pelas
  regras das Opções), mostra a pauta da sala no PJe enquanto monta (vagas, audiências já marcadas,
  conflitos), deixa alterar as audiências que já estavam lá, confere de novo antes de gravar e grava
  processo a processo, com relatório e reprocessamento das falhas. O rascunho fica guardado no
  navegador, sem nomes de partes.
- **Controle Individual** (o botão do AudAid nas telas de processo): designar ou redesignar com
  sala, data (bloqueio por calendário), horário (conferência da pauta), tipo composto, Juízo 100%
  Digital e GIGS. O resultado mostra cada passo. Na simulação, mostra também a requisição que
  seria feita; no envio real, a requisição completa fica em "Copiar requisições".
- **Termos de uso:** abrem na instalação. Até o aceite, a extensão fica inativa.
- **Botão do AudAid** com posição e estilo configuráveis. Os painéis de diagnóstico (só leitura)
  abrem pelo botão "Diagnóstico" do Controle Individual e da Pauta.
- **Opções** (clique no ícone do AudAid na barra do navegador): botão, sugestões de GIGS, Pauta
  (meses à frente e órgãos ocultos), termos e diagnóstico (modo simulação).
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
| `src/regras/` | regras puras e testadas: calendário (bloqueio de datas), pauta do dia, tipos de audiência, números e partes, ordenação do Auto organizar |
| `src/componentes/` | base do Vue (montagem no Shadow DOM) e o que o Individual e o Lote compartilham: sala, data, pauta do dia, tipo composto, GIGS, passos da execução |
| `src/individual/` | painel do Controle Individual (Vue): os `.vue` mostram, e os `.ts` ao lado guardam o estado e as regras |
| `src/lote/` | Controle em Lote (Vue, 3.1): lista colada e consulta dos processos, pauta (`pauta.ts`, regras puras: horários, vagas, audiências de fora), conferência (`conferencia.ts`), execução (`execucao.ts`: a ordem, o estacionamento, o reprocessamento) e rascunho |
| `src/pauta/` | Pauta (Vue, 3.2): leituras (`dados.ts`, com a fila de 4), órgãos e rótulos (`orgaos.ts`), estado da lista contínua (`estadoPauta.ts`), o "+" (`DesignarPauta.vue`, com o formulário do Individual), o cancelamento (`CancelarPauta.vue`) e o diagnóstico |
| `src/fluxo/` | executor da designação e do cancelamento: passos, transporte (real/simulado), trava de escrita |
| `src/prova/` | painel de diagnóstico (só leitura) |
| `src/config/` | opções, termos e posição do botão (puro e testado) |
| `src/ext/` | API de extensão: armazenamento e mensagens |
| `src/paginas/` | páginas de termos e de opções (as Opções em Vue, em `src/paginas/opcoes/`) |
| `src/ui/` | botão flutuante, ícone e utilidades de interface (sem Vue; Shadow DOM) |
| `scripts/` | build e geração dos manifests de cada navegador |
| `tests/` | testes (Vitest); as fixtures não têm dados pessoais |

## Direitos

© Jorge Henrique Bueno Gomez. Todos os direitos reservados. O código é público para transparência
e revisão; não há licença de uso ou redistribuição.
