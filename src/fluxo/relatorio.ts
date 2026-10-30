// Os passos de uma execução em texto, para "Copiar requisições" (Individual) e "Copiar relatório"
// (Lote): o conteúdo completo, para suporte (D52). O corpo do 100% Digital (o processo inteiro) é
// resumido.

import { ROTULO_ESTADO } from '../componentes/mensagens';
import type { RegistroPasso } from './executor';

export function linhasDosPassos(passos: RegistroPasso[], origem: string): string[] {
  const linhas: string[] = [];
  for (const p of passos) {
    linhas.push(`# ${p.titulo} [${ROTULO_ESTADO[p.estado]}]${p.detalhe ? ` ${p.detalhe}` : ''}${p.erro ? ` ERRO: ${p.erro.mensagem} (${p.erro.codigoErro ?? '—'})` : ''}`);
    if (p.requisicao) {
      linhas.push(`${p.requisicao.metodo} ${origem}${p.requisicao.caminho}`);
      const corpo = p.requisicao.corpo;
      if (corpo !== undefined) {
        if (p.requisicao.caminho.includes('alteracaoParcial')) {
          const c = corpo as Record<string, unknown>;
          linhas.push(`(corpo: o processo inteiro, ${Object.keys(c).length} campos, com juizoDigital = ${String(c['juizoDigital'])})`);
        } else {
          linhas.push(JSON.stringify(corpo));
        }
      }
    }
    linhas.push('');
  }
  return linhas;
}
