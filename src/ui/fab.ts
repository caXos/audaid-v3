import type { Opcoes } from '../config/opcoes';
import { cssDaPosicao, cssDoEstilo } from '../config/posicao';
import { h } from './dom';
import { criarIcone } from './icone';

const CSS = `
:host { all: initial; }
.fab {
  position: fixed; z-index: 2147483646;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.fab.abaixo { flex-direction: column-reverse; }
.botao { display: grid; place-items: center; cursor: pointer; line-height: 0; transition: transform .1s; }
.botao:hover { transform: scale(1.08); }
.botao:focus-visible { outline: 2px solid #00838f; outline-offset: 2px; }
.pilula {
  border: 0; border-radius: 999px; background: #00838f; color: #fff; cursor: pointer;
  font: 600 12px/1 system-ui, sans-serif; padding: 8px 14px; box-shadow: 0 2px 8px rgba(0,0,0,.25);
}
.aviso-v1 {
  max-width: 300px; background: #fff4d6; color: #5c3d00; border: 1px solid #e6c46a;
  border-radius: 8px; padding: 8px 28px 8px 10px; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,.15);
}
.aviso-v1 button { position: absolute; top: 4px; right: 6px; border: 0; background: none; cursor: pointer; font-size: 16px; color: inherit; }
.simulacao { background: #fce8e6; color: #b3261e; border-radius: 999px; padding: 2px 8px; font-weight: 600; font-size: 10px; letter-spacing: .03em; }
.menu { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
.item-menu {
  border: 1px solid #00838f; border-radius: 999px; background: #fff; color: #00838f; cursor: pointer;
  font: 600 12px/1 system-ui, sans-serif; padding: 8px 14px; box-shadow: 0 2px 8px rgba(0,0,0,.2); white-space: nowrap;
}
.item-menu:hover, .item-menu:focus-visible { background: #00838f; color: #fff; outline: none; }
`;

export type ModoFab = 'ativo' | 'sem-aceite';

export interface ItemMenuFab {
  rotulo: string;
  titulo: string;
  acao: () => void;
}

/** O botão flutuante (§2.2, §2.6). Mora em Shadow DOM para não sofrer com o CSS do PJe. */
export class Fab {
  private readonly host = h('div');
  private readonly caixa = h('div', { class: 'fab' });
  private avisoV1Fechado = false;
  private avisoV1: HTMLElement | null = null;
  /** D88: fora do processo, o FAB abre um menu pequeno ("Pauta" e "Controle em Lote"). */
  private menu: HTMLElement | null = null;

  constructor(
    private readonly aoClicar: () => void,
    private readonly aoPedirAceite: () => void,
  ) {
    this.host.id = 'audaid-v3-fab';
    const sombra = this.host.attachShadow({ mode: 'open' });
    sombra.append(h('style', {}, CSS), this.caixa);
    this.mostrar(false);
  }

  garantirNaPagina() {
    if (!this.host.isConnected) document.body.append(this.host);
  }

  mostrar(visivel: boolean) {
    this.host.style.display = visivel ? '' : 'none';
  }

  aplicar(opcoes: Opcoes, modo: ModoFab) {
    const { posicao, estilo } = opcoes.fab;
    this.caixa.className = `fab ${posicao.startsWith('abaixo') ? 'abaixo' : ''}`;
    this.caixa.removeAttribute('style');
    for (const [prop, valor] of Object.entries(cssDaPosicao(posicao))) this.caixa.style.setProperty(prop, valor);

    let botao: HTMLButtonElement;
    if (modo === 'sem-aceite') {
      // D22: sem aceite, a extensão fica inerte; o botão só leva aos termos.
      botao = h('button', { class: 'pilula', type: 'button', title: 'Abrir os termos de uso do AudAid', onclick: () => this.aoPedirAceite() }, 'AudAid: aceitar os termos para usar');
    } else {
      botao = h('button', { class: 'botao', type: 'button', title: 'AudAid', onclick: () => this.aoClicar() });
      botao.setAttribute('aria-label', 'Abrir o AudAid');
      for (const [prop, valor] of Object.entries(cssDoEstilo(estilo))) botao.style.setProperty(prop, valor);
      botao.append(criarIcone());
    }

    if (modo === 'sem-aceite') this.menu = null;
    const filhos: Node[] = [botao];
    if (this.menu) filhos.push(this.menu);
    if (modo === 'ativo' && opcoes.simulacao) filhos.push(h('span', { class: 'simulacao', title: 'Modo simulação: nada é gravado no PJe' }, 'SIMULAÇÃO'));
    if (this.avisoV1) filhos.push(this.avisoV1);
    this.caixa.replaceChildren(...filhos);
  }

  get menuAberto() {
    return this.menu !== null;
  }

  /** Abre o menu ao lado do botão; se já estiver aberto, fecha. Escolher um item fecha o menu. */
  alternarMenu(itens: ItemMenuFab[]) {
    if (this.menu) {
      this.fecharMenu();
      return;
    }
    const botoes = itens.map((item) =>
      h('button', {
        class: 'item-menu',
        type: 'button',
        title: item.titulo,
        onclick: () => {
          this.fecharMenu();
          item.acao();
        },
      }, item.rotulo),
    );
    this.menu = h('div', { class: 'menu' }, ...botoes);
    this.menu.setAttribute('role', 'menu');
    for (const b of botoes) b.setAttribute('role', 'menuitem');
    this.menu.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') this.fecharMenu();
    });
    this.caixa.children[0]?.after(this.menu);
    botoes[0]?.focus();
  }

  fecharMenu() {
    this.menu?.remove();
    this.menu = null;
  }

  /** D36: enquanto a v1 estiver instalada, avisa para desinstalá-la (uma vez por página). */
  avisarV1(presente: boolean) {
    const deveMostrar = presente && !this.avisoV1Fechado;
    if (deveMostrar === Boolean(this.avisoV1)) return;
    if (!deveMostrar) {
      this.avisoV1?.remove();
      this.avisoV1 = null;
      return;
    }
    this.avisoV1 = h(
      'div',
      { class: 'aviso-v1' },
      'A versão antiga do AudAid também está instalada. Desinstale-a para não ficar com dois botões.',
      h('button', {
        type: 'button',
        title: 'Fechar aviso',
        onclick: () => {
          this.avisoV1Fechado = true;
          this.avisarV1(false);
        },
      }, '×'),
    );
    this.caixa.append(this.avisoV1);
  }
}

/** A v1 injeta estes elementos na tela de Detalhes do Processo. */
export function v1Presente(doc: Document = document): boolean {
  return Boolean(doc.getElementById('aud-aid-button-container') || doc.getElementById('aud-aid-open-modal-button'));
}
