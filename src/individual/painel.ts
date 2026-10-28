// Controle Individual (§2.2 do blueprint). Desde a 3.1, em Vue (D50a): esta classe só põe o painel
// na página e o abre e fecha; o painel é PainelIndividual.vue.

import { RaizVue } from '../componentes/montar';
import type { Opcoes } from '../config/opcoes';
import type { Ambiente } from '../pje/ambiente';
import { CSS } from '../prova/estilo';
import PainelIndividual from './PainelIndividual.vue';

export class ControleIndividual {
  private readonly host = document.createElement('div');
  private readonly raiz: RaizVue;
  private idProcesso: number | null = null;

  constructor(
    private readonly ambiente: Ambiente,
    private readonly aoAbrirDiagnostico: () => void,
    /** Link "Abrir controle em lote" (D1). */
    private readonly aoAbrirLote: () => void,
  ) {
    this.host.id = 'audaid-v3-individual';
    // O CSS base (cores, painel, cartões) é o mesmo do painel de diagnóstico, que continua sem Vue.
    this.raiz = new RaizVue(this.host, CSS);
    this.garantirNaPagina();
  }

  garantirNaPagina() {
    if (!this.host.isConnected) document.body.append(this.host);
  }

  definirProcesso(id: number | null) {
    if (id === this.idProcesso) return;
    this.idProcesso = id;
    this.fechar();
  }

  get aberto() {
    return this.raiz.montado;
  }

  fechar() {
    this.raiz.desmontar();
  }

  alternar(opcoes: Opcoes) {
    if (this.aberto) this.fechar();
    else this.abrir(opcoes);
  }

  private abrir(opcoes: Opcoes) {
    if (this.idProcesso === null) return;
    // Cada abertura é um painel novo, que relê o processo.
    this.raiz.montar(PainelIndividual, {
      ambiente: this.ambiente,
      idProcesso: this.idProcesso,
      opcoes,
      aoFechar: () => this.fechar(),
      aoAbrirDiagnostico: this.aoAbrirDiagnostico,
      aoAbrirLote: this.aoAbrirLote,
    });
  }
}
