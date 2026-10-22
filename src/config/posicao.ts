import type { EstiloFab, PosicaoFab } from './opcoes';

const MARGEM = '8px';

/** Propriedades CSS de posição para cada uma das 8 posições do FAB (§2.6). */
export function cssDaPosicao(posicao: PosicaoFab): Record<string, string> {
  const [vertical, horizontal] = posicao.split('-') as ['topo' | 'centro' | 'abaixo', 'esquerda' | 'centro' | 'direita'];
  const css: Record<string, string> = {};
  const translacao: string[] = [];

  if (vertical === 'topo') css['top'] = MARGEM;
  else if (vertical === 'abaixo') css['bottom'] = MARGEM;
  else {
    css['top'] = '50%';
    translacao.push('translateY(-50%)');
  }

  if (horizontal === 'esquerda') css['left'] = MARGEM;
  else if (horizontal === 'direita') css['right'] = MARGEM;
  else {
    css['left'] = '50%';
    translacao.push('translateX(-50%)');
  }

  css['transform'] = translacao.length ? translacao.join(' ') : 'none';
  return css;
}

/** Estilo visual do botão (cor, tamanho, fundo, borda). */
export function cssDoEstilo(estilo: EstiloFab): Record<string, string> {
  const temCaixa = estilo.fundo.ativo || estilo.borda.ativo;
  return {
    color: estilo.corIcone,
    width: `${estilo.tamanho}px`,
    height: `${estilo.tamanho}px`,
    padding: temCaixa ? `${Math.round(estilo.tamanho * 0.18)}px` : '0',
    'box-sizing': 'content-box',
    background: estilo.fundo.ativo ? estilo.fundo.cor : 'transparent',
    border: estilo.borda.ativo ? `${estilo.borda.espessura}px solid ${estilo.borda.cor}` : '0',
    'border-radius': temCaixa ? '50%' : '0',
    // Sombra discreta: o círculo aparece tanto na barra escura quanto no fundo branco do PJe.
    'box-shadow': temCaixa ? '0 1px 4px rgba(0, 0, 0, 0.35)' : 'none',
  };
}
