// CSS do painel, isolado em Shadow DOM: não vaza para o PJe e o PJe não vaza para cá.
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.raiz {
  --cor-texto: #1d2733;
  --cor-suave: #5b6878;
  --cor-borda: #d5dbe3;
  --cor-fundo: #ffffff;
  --cor-fundo-2: #f3f6f9;
  --cor-marca: #00838f;
  --cor-ok: #1b7f3b;
  --cor-ok-fundo: #e6f4ea;
  --cor-erro: #b3261e;
  --cor-erro-fundo: #fce8e6;
  --cor-aviso: #8a5a00;
  --cor-aviso-fundo: #fff4d6;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--cor-texto);
}
.painel {
  position: fixed; top: 0; right: 0; height: 100vh; width: min(540px, 100vw);
  z-index: 2147483647; background: var(--cor-fundo);
  border-left: 1px solid var(--cor-borda); box-shadow: -6px 0 24px rgba(0,0,0,.18);
  display: flex; flex-direction: column;
}
.cabecalho { padding: 14px 16px 10px; border-bottom: 1px solid var(--cor-borda); background: var(--cor-fundo-2); }
.cabecalho h1 { font-size: 15px; margin: 0 0 2px; }
.cabecalho p { margin: 0; color: var(--cor-suave); }
.fechar { position: absolute; top: 10px; right: 12px; background: none; border: 0; font-size: 20px; cursor: pointer; color: var(--cor-suave); }
.corpo { flex: 1; overflow: auto; padding: 12px 16px 24px; }
.cartao { border: 1px solid var(--cor-borda); border-radius: 8px; margin-bottom: 10px; overflow: hidden; }
.cartao-topo { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--cor-fundo-2); }
.cartao-topo h2 { font-size: 13px; margin: 0; flex: 1; }
.meta { color: var(--cor-suave); font-size: 11px; font-variant-numeric: tabular-nums; }
.selo { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.selo.aguardando { background: #eceff3; color: var(--cor-suave); }
.selo.ok { background: var(--cor-ok-fundo); color: var(--cor-ok); }
.selo.erro { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.selo.aviso { background: var(--cor-aviso-fundo); color: var(--cor-aviso); }
.cartao-corpo { padding: 8px 10px; }
.cartao-corpo ul { margin: 4px 0; padding-left: 18px; }
.cartao-corpo li { margin: 2px 0; }
.suave { color: var(--cor-suave); }
.erro-texto { color: var(--cor-erro); }
.aviso-texto { color: var(--cor-aviso); }
.ok-texto { color: var(--cor-ok); }
.linha-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0 8px; }
.linha-form label { color: var(--cor-suave); font-size: 12px; }
select, input { font: inherit; padding: 4px 6px; border: 1px solid var(--cor-borda); border-radius: 6px; background: #fff; color: var(--cor-texto); }
button.acao { font: inherit; font-weight: 600; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--cor-marca); background: var(--cor-marca); color: #fff; cursor: pointer; }
button.acao.secundaria { background: #fff; color: var(--cor-marca); }
/* D62: ação é botão, nunca link; dentro de linhas e cabeçalhos, o botão pequeno. */
button.acao.pequena { font-size: 12px; padding: 3px 9px; white-space: nowrap; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
td { padding: 2px 6px; border-bottom: 1px solid #eef1f4; vertical-align: top; }
td.hora { font-variant-numeric: tabular-nums; width: 52px; }
tr.vaga td { color: var(--cor-suave); font-style: italic; }
tr.destaque td { background: var(--cor-aviso-fundo); }
textarea { width: 100%; height: 190px; font: 11px/1.4 ui-monospace, Consolas, monospace; padding: 8px; border: 1px solid var(--cor-borda); border-radius: 6px; resize: vertical; }
`;
