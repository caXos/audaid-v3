import { describe, expect, it } from 'vitest';
import { aceiteValido, normalizarOpcoes, novoAceite, opcoesPadrao, POSICOES_FAB, VERSAO_TERMOS } from '../src/config/opcoes';
import { cssDaPosicao, cssDoEstilo } from '../src/config/posicao';

describe('opções', () => {
  it('padrão do blueprint: topo-centro, só o ícone, 4 sugestões de GIGS', () => {
    const o = opcoesPadrao(false);
    expect(o.fab.posicao).toBe('topo-centro');
    expect(o.fab.estilo.fundo.ativo).toBe(false);
    expect(o.fab.estilo.borda.ativo).toBe(false);
    expect(o.gigs.sugestoes.map((s) => s.texto)).toEqual([
      '@RJ1',
      'Analisar',
      'Audiência gerada pelo AudAid',
      'Audiência gerada pelo AudAid em {data e hora}',
    ]);
    expect(o.gigs.sugestoes.every((s) => s.prazo === 2)).toBe(true);
  });

  it('modo simulação: ligado no desenvolvimento, desligado na versão das lojas (D39)', () => {
    expect(opcoesPadrao(true).simulacao).toBe(true);
    expect(opcoesPadrao(false).simulacao).toBe(false);
    expect(normalizarOpcoes(undefined, true).simulacao).toBe(true);
  });

  it('nada salvo, ou lixo salvo, volta ao padrão', () => {
    expect(normalizarOpcoes(undefined, false)).toEqual(opcoesPadrao(false));
    expect(normalizarOpcoes('lixo', false)).toEqual(opcoesPadrao(false));
    expect(normalizarOpcoes({ fab: { posicao: 'lua' } }, false).fab.posicao).toBe('topo-centro');
  });

  it('limita números, valida cores e descarta sugestões vazias', () => {
    const o = normalizarOpcoes(
      {
        fab: {
          posicao: 'abaixo-direita',
          estilo: { corIcone: '#ABCDEF', tamanho: 999, fundo: { ativo: true, cor: 'vermelho' }, borda: { ativo: true, espessura: 0 } },
        },
        gigs: { sugestoes: [{ texto: '  Analisar  ', prazo: -3 }, { texto: '   ', prazo: 2 }, { prazo: 5 }, { texto: 'Prazo longo', prazo: 9999 }] },
        simulacao: true,
      },
      false,
    );
    expect(o.fab.posicao).toBe('abaixo-direita');
    expect(o.fab.estilo.corIcone).toBe('#abcdef');
    expect(o.fab.estilo.tamanho).toBe(64);
    expect(o.fab.estilo.fundo).toEqual({ ativo: true, cor: '#ffffff' });
    expect(o.fab.estilo.borda.espessura).toBe(1);
    expect(o.gigs.sugestoes).toEqual([
      { texto: 'Analisar', prazo: 0 },
      { texto: 'Prazo longo', prazo: 240 },
    ]);
    expect(o.simulacao).toBe(true);
  });

  it('lista de sugestões vazia é respeitada (o usuário apagou todas)', () => {
    expect(normalizarOpcoes({ gigs: { sugestoes: [] } }, false).gigs.sugestoes).toEqual([]);
  });
});

describe('aceite dos termos (D22)', () => {
  it('aceite na versão atual vale', () => {
    expect(aceiteValido(novoAceite(new Date('2026-10-22T14:00:00Z')))).toBe(true);
  });

  it('aceite de versão antiga ou malformado não vale', () => {
    expect(aceiteValido({ versao: VERSAO_TERMOS - 1, aceitoEm: '2026-01-01' })).toBe(false);
    expect(aceiteValido({ versao: VERSAO_TERMOS })).toBe(false);
    expect(aceiteValido(null)).toBe(false);
    expect(aceiteValido(true)).toBe(false);
  });
});

describe('posição e estilo do FAB (§2.6)', () => {
  it('as 8 posições geram CSS coerente', () => {
    expect(cssDaPosicao('topo-centro')).toEqual({ top: '8px', left: '50%', transform: 'translateX(-50%)' });
    expect(cssDaPosicao('centro-direita')).toEqual({ top: '50%', right: '8px', transform: 'translateY(-50%)' });
    expect(cssDaPosicao('abaixo-esquerda')).toEqual({ bottom: '8px', left: '8px', transform: 'none' });
    for (const p of POSICOES_FAB) {
      const css = cssDaPosicao(p);
      expect(('top' in css) !== ('bottom' in css), p).toBe(true);
      expect(('left' in css) !== ('right' in css), p).toBe(true);
    }
  });

  it('sem fundo e sem borda, o botão é só o ícone', () => {
    const css = cssDoEstilo(opcoesPadrao(false).fab.estilo);
    expect(css['background']).toBe('transparent');
    expect(css['border']).toBe('0');
    expect(css['padding']).toBe('0');
  });

  it('com fundo ou borda, vira um círculo', () => {
    const estilo = { ...opcoesPadrao(false).fab.estilo, borda: { ativo: true, cor: '#00838f', espessura: 3 } };
    const css = cssDoEstilo(estilo);
    expect(css['border']).toBe('3px solid #00838f');
    expect(css['border-radius']).toBe('50%');
  });
});
