// Partes e advogados do processo (tela 1 do Lote, D12), lidos de `processos/id/{id}/partes`.
// Regras técnicas da D48, que o Auto organizar vai usar:
// - só partes ativas, na `ordem` que o PJe devolve, pelo `nome` (razão social, como na capa);
// - sem terceiros (perito);
// - só representantes ADVOGADO ativos, sem repetir a mesma pessoa (`idPessoa`).

import type { ParteBruta, RespostaPartes } from '../pje/api';

export interface Advogado {
  nome: string;
  oab?: string;
}

export interface Parte {
  nome: string;
  advogados: Advogado[];
}

export interface PartesDoProcesso {
  autores: Parte[];
  reus: Parte[];
}

/** Sem `situacao`, a parte conta como ativa (o endpoint sem `comInativas` já devolve só as ativas). */
const ativa = (p: { situacao?: string }) => p.situacao === undefined || p.situacao === 'Ativo';

function lerPolo(lista: ParteBruta[] | undefined): Parte[] {
  return (lista ?? [])
    .filter((p) => ativa(p) && typeof p.nome === 'string')
    .map((p, i) => ({ p, i }))
    // Ordem do PJe; empate (ou sem `ordem`) mantém a ordem da resposta.
    .sort((a, b) => (a.p.ordem ?? Infinity) - (b.p.ordem ?? Infinity) || a.i - b.i)
    .map(({ p }) => {
      const vistos = new Set<number | string>();
      const advogados: Advogado[] = [];
      for (const r of p.representantes ?? []) {
        if (r.tipo !== 'ADVOGADO' || !ativa(r) || typeof r.nome !== 'string') continue;
        const chave = r.idPessoa ?? r.nome;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        advogados.push({ nome: r.nome.trim(), oab: r.numeroOab || undefined });
      }
      return { nome: (p.nome as string).trim(), advogados };
    });
}

export function lerPartes(resposta: RespostaPartes | null | undefined): PartesDoProcesso {
  return { autores: lerPolo(resposta?.ATIVO), reus: lerPolo(resposta?.PASSIVO) };
}
