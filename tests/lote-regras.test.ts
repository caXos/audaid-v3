// Regras puras da tela 1 do Lote (D12, D27, D48, D53): números, partes e resolução da lista.
// Todos os números de processo são fictícios (com dígito válido).

import { describe, expect, it } from 'vitest';
import { avisoHorario, dicaAdvogados, resumoGigs, resumoPolo, rotuloEtapa, rotuloRascunho } from '../src/lote/apresentacao';
import { CONSULTAS_SIMULTANEAS, idDaBusca, resolverLista, type Leitor } from '../src/lote/resolver';
import type { Resposta } from '../src/pje/http';
import { extrairNumeros, formatarNumero, numeroValido } from '../src/regras/numeros';
import { lerPartes } from '../src/regras/partes';
import partes from './fixtures/partes-ficticias.json';

const N1 = '0000101-52.2026.5.09.0001';
const N2 = '0000102-37.2026.5.09.0001';

describe('extrairNumeros (D12)', () => {
  it('formatados e 20 dígitos, na ordem do texto, sem repetir', () => {
    const texto = `Pauta: 00001023720265090001 (sumaríssimo); depois ${N1}.\nDe novo: ${N1} e ${N2.replace(/\D/g, '')}`;
    expect(extrairNumeros(texto)).toEqual([N2, N1]);
  });

  it('ignora 19 e 21 dígitos e número colado em outros dígitos', () => {
    expect(extrairNumeros('0000101522026509000 · 000010152202650900011 · 10000101-52.2026.5.09.0001 · 0000101-52.2026.5.09.00011')).toEqual([]);
  });

  it('formata 20 dígitos no padrão CNJ', () => {
    expect(formatarNumero('00001015220265090001')).toBe(N1);
  });
});

describe('numeroValido (dígito verificador do CNJ)', () => {
  it('confere o módulo 97', () => {
    expect(numeroValido(N1)).toBe(true);
    expect(numeroValido(N2)).toBe(true);
    expect(numeroValido('0000109-13.2026.5.09.0071')).toBe(true);
    expect(numeroValido('0000101-00.2026.5.09.0001')).toBe(false);
    expect(numeroValido('0000101-53.2026.5.09.0001')).toBe(false);
    expect(numeroValido('0000101-52.2026.5.09.001')).toBe(false); // 19 dígitos
  });
});

describe('lerPartes (D48)', () => {
  const { autores, reus } = lerPartes(partes);

  it('só partes ativas, na ordem do polo, sem terceiros', () => {
    expect(autores.map((p) => p.nome)).toEqual(['ANA EXEMPLO', 'BRUNA FICTICIA']);
    expect(reus.map((p) => p.nome)).toEqual(['EMPRESA MODELO LTDA', 'OUTRA EMPRESA S.A.']);
  });

  it('só advogados ativos, sem repetir a mesma pessoa', () => {
    expect(autores[0]!.advogados).toEqual([]); // inativo e procurador ficam de fora
    expect(autores[1]!.advogados.map((a) => a.nome)).toEqual(['ZETA ADVOGADO TESTE', 'ALFA ADVOGADA TESTE']);
    expect(reus[0]!.advogados).toEqual([{ nome: 'BETA ADVOGADO TESTE', oab: 'SC000014' }]);
  });

  it('resposta vazia ou ausente', () => {
    expect(lerPartes(null)).toEqual({ autores: [], reus: [] });
    expect(lerPartes({})).toEqual({ autores: [], reus: [] });
  });

  it('primeira parte com "(+X)" (D61) e advogados no "(?)"', () => {
    expect(resumoPolo(autores)).toEqual({ nome: 'ANA EXEMPLO', mais: 1, outros: 'BRUNA FICTICIA' });
    expect(resumoPolo([...reus, ...reus])).toEqual({ nome: 'EMPRESA MODELO LTDA', mais: 3, outros: 'OUTRA EMPRESA S.A.\nEMPRESA MODELO LTDA\nOUTRA EMPRESA S.A.' });
    expect(resumoPolo(reus.slice(0, 1))).toEqual({ nome: 'EMPRESA MODELO LTDA', mais: 0, outros: '' });
    expect(resumoPolo([])).toEqual({ nome: '—', mais: 0, outros: '' });
    expect(dicaAdvogados(autores)).toBe('ANA EXEMPLO: sem advogado\nBRUNA FICTICIA: ZETA ADVOGADO TESTE, ALFA ADVOGADA TESTE');
  });
});

describe('idDaBusca', () => {
  it('o PJe responde só o id (teste real de 27/10/2026)', () => {
    expect(idDaBusca(2143468, N1)).toBe(2143468);
    expect(idDaBusca(0, N1)).toBeNull();
    expect(idDaBusca(-1, N1)).toBeNull();
    expect(idDaBusca(1.5, N1)).toBeNull();
  });

  it('formas alternativas, por segurança: lista, objeto só e página', () => {
    expect(idDaBusca([{ id: 7, numero: N1 }], N1)).toBe(7);
    expect(idDaBusca({ id: 8, numero: N1 }, N1)).toBe(8);
    expect(idDaBusca({ resultado: [{ id: 9, numero: N1 }] }, N1)).toBe(9);
    expect(idDaBusca({ content: [{ id: 3, numero: N2 }, { id: 4, numero: N1 }] }, N1)).toBe(4);
  });

  it('nada, ou vários sem o mesmo número: não encontrado', () => {
    expect(idDaBusca([], N1)).toBeNull();
    expect(idDaBusca(null, N1)).toBeNull();
    expect(idDaBusca([{ id: 1 }, { id: 2 }], N1)).toBeNull();
    expect(idDaBusca([{ id: 1 }], N1)).toBe(1); // um só, sem número: é ele
  });
});

describe('resolverLista (D12, D27)', () => {
  const ok = <T>(dados: unknown, status = 200): Resposta<T> => ({ ok: true, status, ms: 1, via: 'fetch', dados: dados as T });
  const falha = <T>(status: number, mensagem: string): Resposta<T> => ({ ok: false, status, ms: 1, via: 'fetch', erro: { mensagem } });

  const nOk = N1;
  const nNada = N2;
  const nSemAcesso = '0000103-22.2026.5.09.0001';
  const nOutro = '0000104-07.2026.5.09.0001';
  const nErro = '0000105-89.2026.5.09.0001';
  const nTroca = '0000106-74.2026.5.09.0001';
  const n404 = '0000107-59.2026.5.09.0001';
  const nInvalido = '0000108-00.2026.5.09.0001';
  const numeros = [nOk, nNada, nSemAcesso, nOutro, nErro, nTroca, n404, nInvalido];

  function pjeFalso(atraso = 0) {
    let emAndamento = 0;
    let maximo = 0;
    const buscados: string[] = [];
    const ler: Leitor = async <T>(caminho: string): Promise<Resposta<T>> => {
      emAndamento++;
      maximo = Math.max(maximo, emAndamento);
      await new Promise((r) => setTimeout(r, atraso));
      emAndamento--;
      if (caminho.includes('processos?numero=')) {
        const numero = decodeURIComponent(/numero=([^&]+)/.exec(caminho)?.[1] ?? '');
        buscados.push(numero);
        if (numero === nNada) return ok<T>(null); // 200 sem corpo
        if (numero === n404) return falha<T>(404, 'Processo não encontrado');
        if (numero === nSemAcesso) return falha<T>(403, 'Acesso negado');
        if (numero === nErro) return falha<T>(500, 'Erro interno no servidor');
        if (numero === nTroca) return ok<T>(99); // id de outro processo
        return ok<T>(numero === nOutro ? 40 : 10); // como o PJe real: só o id
      }
      if (caminho.endsWith('/partes')) return ok<T>(partes);
      if (caminho.includes('/audiencias')) {
        // O 1º processo tem uma audiência designada no órgão logado (seria redesignada).
        return ok<T>(/id\/10\//.test(caminho) ? [{ id: 444, dataInicio: '2026-10-20T10:10:00', status: 'Designada', salaFisica: { id: 503, nome: 'Sala 01', orgaoJulgador: { id: 174, descricao: 'CEJUSC' } } }] : []);
      }
      const id = Number(/processos\/id\/(\d+)/.exec(caminho)?.[1]);
      const numero = id === 40 ? nOutro : id === 99 ? '0009999-99.2020.5.09.0001' : nOk;
      // Originário de outra vara, mas tramitando no CEJUSC: `orgaoJulgador` é o atual (captura de 19/10).
      const orgao = id === 40 ? { id: 49, descricao: '1ª VT DE CASCAVEL' } : { id: 174, descricao: 'CEJUSC', cejusc: true };
      return ok<T>({ id, numero, classeJudicial: { sigla: 'ATOrd' }, orgaoJulgador: orgao });
    };
    return { ler, maximo: () => maximo, buscados };
  }

  it('incluídos e não incluídos, com o motivo, na ordem do texto', async () => {
    const progresso: number[] = [];
    const pje = pjeFalso();
    const r = await resolverLista(numeros, { ler: pje.ler, idOrgaoLogado: 174 }, (n) => progresso.push(n));
    expect(r.incluidos.map((p) => [p.numero, p.id])).toEqual([[nOk, 10]]);
    expect(r.incluidos[0]!.partes.autores.map((p) => p.nome)).toEqual(['ANA EXEMPLO', 'BRUNA FICTICIA']);
    expect(r.incluidos[0]!.antiga?.id).toBe(444);
    expect(r.naoIncluidos).toEqual([
      { numero: nNada, motivo: 'não encontrado no PJe' },
      { numero: nSemAcesso, motivo: 'sem acesso a este processo (HTTP 403)' },
      { numero: nOutro, motivo: 'tramita em outro órgão: 1ª VT DE CASCAVEL' },
      { numero: nErro, motivo: 'erro ao consultar o número: Erro interno no servidor' },
      { numero: nTroca, motivo: 'a busca por número devolveu outro processo: 0009999-99.2020.5.09.0001' },
      { numero: n404, motivo: 'não encontrado no PJe' },
      { numero: nInvalido, motivo: 'número inválido (o dígito verificador não confere)' },
    ]);
    expect(pje.buscados).not.toContain(nInvalido); // inválido nem vai ao PJe
    expect(progresso.at(-1)).toBe(numeros.length);
  });

  it(`no máximo ${CONSULTAS_SIMULTANEAS} processos ao mesmo tempo`, async () => {
    const pje = pjeFalso(5);
    const muitos = Array.from({ length: 12 }, () => nOk);
    await resolverLista(muitos, { ler: pje.ler, idOrgaoLogado: 174 });
    // Cada processo faz até 3 leituras simultâneas (processo, partes e audiências).
    expect(pje.maximo()).toBeLessThanOrEqual(CONSULTAS_SIMULTANEAS * 3);
    expect(pje.maximo()).toBeGreaterThan(1);
  });
});

describe('textos da tela 2', () => {
  it('aviso de horário, resumo do GIGS e oferta do rascunho', () => {
    expect(avisoHorario('ok')).toBeNull();
    expect(avisoHorario('sobreposto')).toContain('com confirmação');
    expect(avisoHorario('mesmo-minuto')).toContain('o PJe recusaria');
    expect(resumoGigs(false, 'x', 2)).toBe('Sem GIGS');
    expect(resumoGigs(true, 'Analisar', 2)).toBe('GIGS: Analisar · 2 d.u.');
    expect(resumoGigs(true, 'Audiência gerada pelo AudAid em 10/11/2026, às 09h00', 0, 20)).toBe('GIGS: Audiência gerada pe… · sem prazo');
    expect(rotuloRascunho('2026-10-28T12:30:00.000Z', 9)).toMatch(/^Retomar rascunho de 28\/10\/2026, \d{2}:30 \(9 processos\)$/);
    expect(rotuloRascunho('x', 1)).toBe('Retomar rascunho (1 processo)');
    expect([rotuloEtapa('texto'), rotuloEtapa('consultando'), rotuloEtapa('pauta'), rotuloEtapa('resumo')]).toEqual([
      'Etapa 1 - Lista de processos',
      'Etapa 1 - Lista de processos',
      'Etapa 2 - Formulário',
      'Etapa 3 - Conferência (provisória)',
    ]);
  });
});
