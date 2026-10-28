// Controle em Lote (§2.3). Esta classe só põe o lote na página e o abre e fecha; o lote é
// PainelLote.vue. Mesma forma do ControleIndividual (src/individual/painel.ts).

import { RaizVue } from '../componentes/montar';
import type { Ambiente } from '../pje/ambiente';
import { CSS } from '../prova/estilo';
import PainelLote from './PainelLote.vue';

export class ControleLote {
  private readonly host = document.createElement('div');
  private readonly raiz: RaizVue;

  constructor(
    private readonly ambiente: Ambiente,
    /** Versão da extensão, para o diagnóstico. */
    private readonly versao: string,
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

  abrir() {
    // Cada abertura começa da tela 1 (o rascunho persistido vem na entrega 2, D18).
    this.raiz.montar(PainelLote, { ambiente: this.ambiente, versao: this.versao, aoFechar: () => this.fechar() });
  }

  alternar() {
    if (this.aberto) this.fechar();
    else this.abrir();
  }
}
