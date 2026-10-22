import svgBruto from '../../public/icons/audaid.svg?raw';

/**
 * Ícone do AudAid como SVG inline. A parte escura passa a usar `currentColor`, para obedecer à
 * "cor do ícone" das Opções; o detalhe verde fica como está.
 */
export function criarIcone(): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svgBruto, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  for (const el of svg.querySelectorAll('[fill]')) {
    if (el.getAttribute('fill')?.toLowerCase() === '#1a1a1a') el.setAttribute('fill', 'currentColor');
  }
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}
