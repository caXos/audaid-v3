// Pauta (3.2, §2.7). Esta classe só põe a Pauta na página e a abre e fecha. Na entrega 0, o que
// abre é o diagnóstico (D86b). Mesma forma do ControleLote (src/lote/ControleLote.ts).

import { RaizVue } from '../componentes/montar';
import type { Ambiente } from '../pje/ambiente';
import { CSS } from '../prova/estilo';
import DiagnosticoPauta from './DiagnosticoPauta.vue';

export class ControlePauta {
  private readonly host = document.createElement('div');
  private readonly raiz: RaizVue;

  constructor(
    private readonly ambiente: Ambiente,
    /** Versão da extensão, para o cabeçalho do diagnóstico. */
    private readonly versao: string,
  ) {
    this.host.id = 'audaid-v3-pauta';
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
    this.raiz.montar(DiagnosticoPauta, { ambiente: this.ambiente, versao: this.versao, aoFechar: () => this.fechar() });
  }
}
