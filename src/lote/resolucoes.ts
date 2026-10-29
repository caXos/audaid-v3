// As resoluções dos conflitos com a pauta da sala (D28, D32, D65, D66), as mesmas na tela 2 (na
// própria linha, D78) e na tela 3. Os textos e as opções são puros; `aplicarResolucao` age sobre o
// estado da pauta.

import { formatarDataHora } from '../ui/dom';
import type { EntradaPauta } from '../regras/pauta';
import { minutoLivreDepois, type Achado } from './conferencia';
import type { EstadoPauta } from './estadoPauta';
import { paraHora, type ModoHorarios } from './pauta';

export type Opcao = 'encaixar' | 'empurrar' | 'subir' | 'descer' | 'remover' | 'redesignar' | 'removerSemRecalcular';

const OPCOES: Partial<Record<Achado['tipo'], { valor: Opcao; rotulo: string }[]>> = {
  vermelho: [
    { valor: 'encaixar', rotulo: 'Encaixar 1 min depois' },
    { valor: 'empurrar', rotulo: 'Empurrar para depois dele' },
    { valor: 'subir', rotulo: 'Subir uma posição' },
    { valor: 'descer', rotulo: 'Descer uma posição' },
    { valor: 'remover', rotulo: 'Remover da lista' },
  ],
  ciclo: [
    { valor: 'encaixar', rotulo: 'Encaixar 1 min depois' },
    { valor: 'subir', rotulo: 'Subir uma posição' },
    { valor: 'descer', rotulo: 'Descer uma posição' },
    { valor: 'remover', rotulo: 'Remover da lista' },
  ],
  existente: [
    { valor: 'redesignar', rotulo: 'Redesignar a existente' },
    { valor: 'remover', rotulo: 'Remover da lista e recalcular' },
    { valor: 'removerSemRecalcular', rotulo: 'Remover sem recalcular' },
    { valor: 'subir', rotulo: 'Subir uma posição e recalcular' },
    { valor: 'descer', rotulo: 'Descer uma posição e recalcular' },
  ],
};

/**
 * As opções de um achado, com o padrão primeiro. Pelas vagas, "Empurrar" não existe: ele põe um
 * intervalo, e os intervalos não valem nesse modo (D73).
 */
export function opcoesDoAchado(a: Achado, modo: ModoHorarios): { valor: Opcao; rotulo: string }[] {
  const todas = OPCOES[a.tipo] ?? [];
  return modo === 'vagas' ? todas.filter((o) => o.valor !== 'empurrar' && o.valor !== 'removerSemRecalcular') : todas;
}

export function textoDoAchado(a: Achado): string {
  switch (a.tipo) {
    case 'vermelho':
      return `Vermelho: ${a.outro} já começa às ${paraHora(a.inicio)} nesta sala; o PJe recusaria.`;
    case 'amarelo':
      return `Amarelo: ${a.outro} começa às ${paraHora(a.inicio)}, dentro do horário planejado deste item. O PJe aceita.`;
    case 'do-lote':
      return `${a.outro}, do próprio lote, está neste horário hoje e vai sair dele: na execução, ele é redesignado antes.`;
    case 'ciclo':
      return `Troca circular com ${a.outro}, do próprio lote (um vai para o horário do outro): o PJe recusaria.`;
    case 'existente': {
      const x = a.antiga;
      return `Já tem audiência designada no órgão: ${formatarDataHora(x.dataInicio)} (${x.tipo?.descricao ?? '?'}, ${x.salaFisica?.nome ?? '?'}).`;
    }
  }
}

/**
 * Aplica uma resolução. `ok: false` quando nada mudou (o padrão "Redesignar" não mexe na pauta) ou
 * quando não foi possível, com o motivo em `aviso`.
 */
export function aplicarResolucao(pauta: EstadoPauta, entradas: EntradaPauta[], chave: string, a: Achado, opcao: Opcao): { ok: boolean; aviso?: string } {
  switch (opcao) {
    case 'encaixar': {
      if (a.tipo === 'existente') return { ok: false };
      const m = minutoLivreDepois(a.inicio, entradas, pauta.paraConferir, chave);
      if (m === null) return { ok: false, aviso: 'Não há minuto livre depois deste até a meia-noite.' };
      pauta.encaixar(chave, m);
      return { ok: true };
    }
    case 'empurrar':
      if (a.tipo === 'existente') return { ok: false };
      pauta.empurrar(chave, a.inicio);
      return { ok: true };
    case 'subir':
      pauta.subir(chave);
      return { ok: true };
    case 'descer':
      pauta.descer(chave);
      return { ok: true };
    case 'remover':
      pauta.remover(chave);
      return { ok: true };
    case 'removerSemRecalcular':
      pauta.removerSemRecalcular(chave);
      return { ok: true };
    case 'redesignar':
      return { ok: false }; // é o padrão: nada a mudar na pauta
  }
}
