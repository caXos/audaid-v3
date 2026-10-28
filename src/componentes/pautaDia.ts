// Pauta do dia de uma sala (D28, D33), consultada quando sala e data mudam. A consulta espera
// 300 ms, para não disparar uma por tecla enquanto a data é digitada.

import { onBeforeUnmount, shallowRef } from 'vue';
import { caminhos, type PautaDia } from '../pje/api';
import { pjeGet } from '../pje/http';
import { lerSessao } from '../pje/sessao';
import { lerPauta, type EntradaPauta } from '../regras/pauta';

export interface EstadoPauta {
  /** `idSala|data` da consulta. */
  chave: string;
  carregando: boolean;
  entradas?: EntradaPauta[];
  erro?: string;
}

export function usePautaDia(origem: string) {
  const estado = shallowRef<EstadoPauta>({ chave: '', carregando: false });
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let vivo = true;
  onBeforeUnmount(() => {
    vivo = false;
    clearTimeout(temporizador);
  });

  /**
   * Consulta a pauta de `idSala` em `data`. A mesma sala e data não são consultadas de novo, a não
   * ser com `forcar` ("Consultar de novo", na tela 3 do Lote).
   */
  function consultar(idSala: number, data: string, forcar = false) {
    const chave = `${idSala}|${data}`;
    if (chave === estado.value.chave && !forcar) return;
    estado.value = { chave, carregando: true };
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      let novo: EstadoPauta;
      try {
        const r = await pjeGet<PautaDia>(origem + caminhos.pautaDia(idSala, data), { xsrfToken: lerSessao(document.cookie).xsrfToken });
        novo = r.ok ? { chave, carregando: false, entradas: lerPauta(r.dados) } : { chave, carregando: false, erro: `Erro ao consultar a pauta: ${r.erro.mensagem}` };
      } catch (e) {
        // Nunca deixar o formulário preso em "consultando".
        novo = { chave, carregando: false, erro: `Erro ao ler a pauta: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!vivo || estado.value.chave !== chave) return;
      estado.value = novo;
    }, 300);
  }

  return { estado, consultar };
}
