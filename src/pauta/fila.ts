// A fila das consultas da Pauta (D92): no máximo 4 ao mesmo tempo, na ordem em que foram pedidas,
// como na tela 1 do Lote (CONSULTAS_SIMULTANEAS).

import { CONSULTAS_SIMULTANEAS } from '../lote/resolver';

export class FilaDeLeitura {
  private ativas = 0;
  private readonly espera: (() => void)[] = [];

  constructor(private readonly limite = CONSULTAS_SIMULTANEAS) {}

  /** Quantas estão rodando agora (para os testes). */
  get emAndamento() {
    return this.ativas;
  }

  async executar<T>(tarefa: () => Promise<T>): Promise<T> {
    if (this.ativas >= this.limite) await new Promise<void>((liberar) => this.espera.push(liberar));
    this.ativas++;
    try {
      return await tarefa();
    } finally {
      this.ativas--;
      this.espera.shift()?.();
    }
  }
}
