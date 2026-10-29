// Tela 3 do Lote (§2.3): a conferência antes de executar. Cruza a pauta montada com a pauta do dia
// da sala no PJe. Puro e testado (tests/conferencia.test.ts).
//
// - Conflito só na mesma sala (D15). Vaga nunca é conflito (D33), nem o próprio processo.
// - Mesmo minuto de início de um processo de fora: vermelho, o PJe recusaria (D28).
// - Processo de fora começando dentro da janela planejada de um item: amarelo, só aviso (D28).
// - Horário de outro processo do lote, que vai ser redesignado: só aviso; a execução o tira dali
//   antes. Troca circular é vermelho (D67).
// - Processo que já tem audiência designada no órgão: a tela oferece redesigná-la (padrão) ou tirar
//   o processo da lista (D32).

import type { Audiencia } from '../pje/api';
import type { EntradaPauta } from '../regras/pauta';
import { MINUTOS_DO_DIA, paraMinutos } from './pauta';

/** O que a conferência precisa de cada audiência da pauta montada. */
export interface ItemParaConferir {
  chave: string;
  idProcesso: number;
  /** Minutos desde 00:00. */
  inicio: number;
  duracao: number;
  /** Audiência designada no órgão logado, que seria redesignada (D32). */
  antiga?: Audiencia;
}

export type Achado =
  | { tipo: 'vermelho'; outro: string; inicio: number }
  | { tipo: 'amarelo'; outro: string; inicio: number }
  | { tipo: 'do-lote'; outro: string; inicio: number }
  | { tipo: 'ciclo'; outro: string; inicio: number }
  | { tipo: 'existente'; antiga: Audiencia };

/** Achados que bloqueiam o "Continuar" (D66). */
export const BLOQUEIAM: Achado['tipo'][] = ['vermelho', 'ciclo'];

const rotulo = (e: EntradaPauta) => e.nrProcesso ?? String(e.idProcesso);

/**
 * Os achados de cada item, na ordem dos itens. `entradas` é a pauta do dia da mesma sala
 * (`lerPauta`), com as audiências de fora e as antigas dos próprios processos do lote.
 */
export function conferir(itens: ItemParaConferir[], entradas: EntradaPauta[]): Map<string, Achado[]> {
  const doLote = new Map(itens.map((i) => [i.idProcesso, i]));
  const audiencias = entradas.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined);
  const deFora = audiencias.filter((e) => !doLote.has(e.idProcesso!));

  // D67: X depende de Y quando X vai para o minuto que hoje é de Y (que vai sair dali).
  const dependeDe = new Map<string, ItemParaConferir>();
  for (const x of itens) {
    const ocupante = audiencias.find((e) => e.idProcesso !== x.idProcesso && doLote.has(e.idProcesso!) && paraMinutos(e.hora) === x.inicio);
    const y = ocupante ? doLote.get(ocupante.idProcesso!) : undefined;
    // Se Y continua no mesmo minuto, a tela 2 já acusa "mesmo minuto"; aqui só vale quem sai.
    if (y && y.inicio !== x.inicio) dependeDe.set(x.chave, y);
  }
  const emCiclo = (x: ItemParaConferir): boolean => {
    const vistos = new Set<string>();
    let atual = dependeDe.get(x.chave);
    while (atual && !vistos.has(atual.chave)) {
      if (atual.chave === x.chave) return true;
      vistos.add(atual.chave);
      atual = dependeDe.get(atual.chave);
    }
    return false;
  };

  const resultado = new Map<string, Achado[]>();
  for (const x of itens) {
    const achados: Achado[] = [];
    for (const e of deFora) {
      const m = paraMinutos(e.hora);
      if (m === x.inicio) achados.push({ tipo: 'vermelho', outro: rotulo(e), inicio: m });
      else if (m > x.inicio && m < x.inicio + x.duracao) achados.push({ tipo: 'amarelo', outro: rotulo(e), inicio: m });
    }
    const y = dependeDe.get(x.chave);
    if (y) {
      const ocupante = audiencias.find((e) => e.idProcesso === y.idProcesso && paraMinutos(e.hora) === x.inicio)!;
      achados.push({ tipo: emCiclo(x) ? 'ciclo' : 'do-lote', outro: rotulo(ocupante), inicio: x.inicio });
    }
    if (x.antiga) achados.push({ tipo: 'existente', antiga: x.antiga });
    resultado.set(x.chave, achados);
  }
  return resultado;
}

/**
 * O que mudou na pauta da sala desde a tela 2 (D78), em ordem de horário: outro servidor pode ter
 * ocupado um horário entre montar e gravar (§6, item 2). Lista vazia = nada mudou.
 */
export function mudancasDaPauta(antes: EntradaPauta[], depois: EntradaPauta[]): string[] {
  const audiencias = (l: EntradaPauta[]) => new Map(l.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined).map((e) => [e.idProcesso!, e]));
  const vagas = (l: EntradaPauta[]) => new Set(l.filter((e) => e.tipo === 'vaga').map((e) => e.hora));
  const [audAntes, audDepois, vagasAntes, vagasDepois] = [audiencias(antes), audiencias(depois), vagas(antes), vagas(depois)];
  const ocupadaAgora = (hora: string) => [...audDepois.values()].some((e) => e.hora === hora);
  const r: { hora: string; texto: string }[] = [];
  for (const [id, e] of audDepois) {
    const velha = audAntes.get(id);
    const naVaga = vagasAntes.has(e.hora) && !vagasDepois.has(e.hora) ? ', numa vaga' : '';
    if (!velha) r.push({ hora: e.hora, texto: `entrou ${rotulo(e)} às ${e.hora}${naVaga}` });
    else if (velha.hora !== e.hora) r.push({ hora: e.hora, texto: `${rotulo(e)} passou das ${velha.hora} para as ${e.hora}${naVaga}` });
  }
  for (const [id, e] of audAntes) if (!audDepois.has(id)) r.push({ hora: e.hora, texto: `${rotulo(e)} saiu das ${e.hora}` });
  for (const h of vagasAntes) if (!vagasDepois.has(h) && !ocupadaAgora(h)) r.push({ hora: h, texto: `a vaga das ${h} deixou de existir` });
  for (const h of vagasDepois) if (!vagasAntes.has(h)) r.push({ hora: h, texto: `vaga nova às ${h}` });
  return r.sort((a, b) => a.hora.localeCompare(b.hora)).map((x) => x.texto);
}

/**
 * "Encaixar 1 min depois" (D28): o primeiro minuto depois de `minuto` em que nenhum processo de fora
 * e nenhum outro item do lote começa. `null` se passar da meia-noite.
 */
export function minutoLivreDepois(minuto: number, entradas: EntradaPauta[], itens: ItemParaConferir[], chave: string): number | null {
  const lote = new Set(itens.map((i) => i.idProcesso));
  const ocupados = new Set([
    ...entradas.filter((e) => e.tipo === 'audiencia' && e.idProcesso !== undefined && !lote.has(e.idProcesso)).map((e) => paraMinutos(e.hora)),
    ...itens.filter((i) => i.chave !== chave).map((i) => i.inicio),
  ]);
  for (let m = minuto + 1; m < MINUTOS_DO_DIA; m++) if (!ocupados.has(m)) return m;
  return null;
}
