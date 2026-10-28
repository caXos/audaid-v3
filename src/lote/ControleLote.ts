// Controle em Lote (§2.3). Esta classe só põe o lote na página e o abre e fecha; o lote é
// PainelLote.vue. Mesma forma do ControleIndividual (src/individual/painel.ts).

import { RaizVue } from '../componentes/montar';
import type { Opcoes } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import { CSS } from '../prova/estilo';
import PainelLote from './PainelLote.vue';

export class ControleLote {
  private readonly host = document.createElement('div');
  private readonly raiz: RaizVue;

  constructor(
    private readonly ambiente: Ambiente,
    /** Versão da extensão. */
    private readonly versao: string,
    /** Onde ficam o rascunho e o topo lembrado (D18, D56). Nos testes, em memória. */
    private readonly armazenamento: Armazenamento,
  ) {
    this.host.id = 'audaid-v3-lote';
    this.raiz = new RaizVue(this.host, CSS);
    this.garantirNaPagina();
  }

  garantirNaPagina() {
    if (!this.host.isConnected) document.body.append(this.host);
  }

  get aberto() {
    return this.raiz.montado;
  }

  fechar() {
    this.raiz.desmontar();
  }

  /** Cada abertura começa da tela 1, que oferece retomar o rascunho, se houver (D18). */
  abrir(opcoes: Opcoes) {
    this.raiz.montar(PainelLote, {
      ambiente: this.ambiente,
      versao: this.versao,
      sugestoesGigs: opcoes.gigs.sugestoes,
      armazenamento: this.armazenamento,
      aoFechar: () => this.fechar(),
    });
  }
}
