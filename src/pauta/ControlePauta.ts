// Pauta (3.2, §2.7). Esta classe só põe a Pauta na página e a abre e fecha; a Pauta é
// PainelPauta.vue. Mesma forma do ControleLote (src/lote/ControleLote.ts).

import { RaizVue } from '../componentes/montar';
import type { Opcoes, OrgaoConhecido } from '../config/opcoes';
import type { Armazenamento } from '../ext/api';
import type { Ambiente } from '../pje/ambiente';
import { CSS } from '../prova/estilo';
import type { LeitorPauta } from './dados';
import type { FocoPauta } from './estadoPauta';
import PainelPauta from './PainelPauta.vue';

export class ControlePauta {
  private readonly host = document.createElement('div');
  private readonly raiz: RaizVue;

  constructor(
    private readonly ambiente: Ambiente,
    /** Versão da extensão, para o cabeçalho do diagnóstico. */
    private readonly versao: string,
    /** Onde fica a última sala de cada órgão (D90). Nos testes, em memória. */
    private readonly armazenamento: Armazenamento,
    /** Guarda os órgãos mostrados, para o "Ocultar da Pauta" das Opções (D87b). */
    private readonly aoConhecerOrgaos?: (orgaos: OrgaoConhecido[]) => void,
    /** Só nos testes: um PJe falso e o dia de hoje. */
    private readonly paraTestes?: { ler: LeitorPauta; hoje: string },
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

  /** Cada abertura começa do zero (relê órgãos e salas). Com `foco`, abre no dia da audiência (D90). */
  abrir(opcoes: Opcoes, foco?: FocoPauta) {
    this.raiz.montar(PainelPauta, {
      ambiente: this.ambiente,
      versao: this.versao,
      opcoes,
      armazenamento: this.armazenamento,
      aoFechar: () => this.fechar(),
      ...(foco ? { foco } : {}),
      ...(this.aoConhecerOrgaos ? { aoConhecerOrgaos: this.aoConhecerOrgaos } : {}),
      ...(this.paraTestes ?? {}),
    });
  }
}
