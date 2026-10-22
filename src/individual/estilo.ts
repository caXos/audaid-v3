import { CSS as CSS_BASE } from '../prova/estilo';

// Base do painel de diagnóstico + o que o formulário do Controle Individual precisa.
export const CSS = `${CSS_BASE}
.painel { width: min(580px, 100vw); }
.cabecalho .linha-cab { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.link { background: none; border: 0; padding: 0; color: var(--cor-marca); cursor: pointer; font: inherit; text-decoration: underline; }
.faixa-simulacao {
  background: var(--cor-erro-fundo); color: var(--cor-erro); font-weight: 700; font-size: 12px;
  text-align: center; padding: 6px 10px; border-bottom: 1px solid #f1c4bf; letter-spacing: .02em;
}
.grade { display: grid; grid-template-columns: 110px 1fr; gap: 6px 10px; align-items: center; }
.grade > label { color: var(--cor-suave); font-size: 12px; }
.grade .controles { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
/* §5, layout estável: toda linha de mensagem tem altura FIXA de duas linhas; o excedente vai
   para o tooltip. Assim nada abaixo se mexe quando o texto muda. */
.msg, .aviso-digital, .previa-gigs {
  height: 2.9em; line-height: 1.45em; overflow: hidden; font-size: 12px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
}
.msg { grid-column: 2; }
.msg.carregando { color: var(--cor-suave); }
.msg.carregando::before {
  content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: -1px;
  border: 2px solid #c3cad4; border-top-color: var(--cor-marca); border-radius: 50%;
  animation: girar .8s linear infinite;
}
@keyframes girar { to { transform: rotate(360deg); } }
.msg.bloqueia, .msg.erro { color: var(--cor-erro); }
.msg.avisa { color: var(--cor-aviso); }
.msg.ok { color: var(--cor-ok); }
.msg.suave { color: var(--cor-suave); }
.resultado-tipo {
  grid-column: 1 / -1; background: var(--cor-fundo-2); border-radius: 6px; padding: 6px 8px;
  height: calc(2.9em + 12px); line-height: 1.45em; overflow: hidden;
}
.resultado-tipo.erro { background: var(--cor-erro-fundo); color: var(--cor-erro); }
.aviso-digital { grid-column: 1 / -1; color: var(--cor-aviso); }
/* Diálogo da pauta do dia: abre por cima do painel. */
.dialogo-pauta {
  width: min(520px, calc(100vw - 32px)); border: 1px solid var(--cor-borda); border-radius: 10px;
  padding: 14px 16px; color: var(--cor-texto); background: var(--cor-fundo);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 12px 40px rgba(0,0,0,.25);
}
.dialogo-pauta::backdrop { background: rgba(20, 28, 38, .45); }
.dialogo-pauta h3 { margin: 0 0 2px; font-size: 14px; }
.dialogo-pauta p { margin: 0 0 8px; font-size: 12px; }
.corpo-pauta { height: 340px; overflow: auto; border: 1px solid #eef1f4; border-radius: 6px; }
.corpo-pauta .centralizado { height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--cor-suave); padding: 0 16px; }
tr.clicavel { cursor: pointer; }
tr.clicavel:hover td { background: #e6f4f5; }
.rodape-dialogo { display: flex; justify-content: flex-end; margin-top: 10px; }
input[type="text"].largo { width: 100%; }
input[type="number"] { width: 70px; }
.previa-gigs { grid-column: 1 / -1; color: var(--cor-suave); }
.rodape-form { display: flex; gap: 10px; align-items: flex-start; margin-top: 10px; }
/* Altura fixa também: a lista de pendências não empurra o cartão de resultado. */
.pendencias { margin: 0; padding-left: 18px; font-size: 12px; color: var(--cor-aviso); height: 7.4em; overflow: auto; flex: 1; }
.pendencias:empty::before { content: 'Tudo pronto.'; color: var(--cor-ok); margin-left: -18px; }
button.acao:disabled { opacity: .45; cursor: not-allowed; }
/* D42: campo que não se aplica fica visivelmente desabilitado. */
select:disabled, input:disabled { background: #d5dbe3; color: #5b6878; border-color: #c3cad4; cursor: not-allowed; }
.rotulo-check { cursor: pointer; }
.rotulo-check.desabilitado { color: #8a94a3; cursor: not-allowed; }
button:disabled { cursor: not-allowed; }
.passo { border-top: 1px solid #eef1f4; padding: 6px 0; }
.passo:first-child { border-top: 0; }
.passo-topo { display: flex; gap: 8px; align-items: center; }
.passo-topo strong { flex: 1; }
.req { font: 11px/1.4 ui-monospace, Consolas, monospace; color: var(--cor-suave); word-break: break-all; margin-top: 2px; }
pre { margin: 4px 0 0; max-height: 180px; overflow: auto; background: #f7f9fb; border: 1px solid #eef1f4; border-radius: 6px; padding: 6px; font: 11px/1.4 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.resumo { font-weight: 600; margin-bottom: 6px; }
.resumo.sucesso, .resumo.simulado { color: var(--cor-ok); }
.resumo.parcial { color: var(--cor-aviso); }
.resumo.falha { color: var(--cor-erro); }
`;
