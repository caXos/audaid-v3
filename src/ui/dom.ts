type Filho = Node | string | number | null | undefined | false;

type Props = {
  class?: string;
  title?: string;
  type?: string;
  value?: string;
  readOnly?: boolean;
  disabled?: boolean;
  onclick?: (ev: MouseEvent) => void;
  onchange?: (ev: Event) => void;
};

/**
 * Cria um elemento. Texto vira sempre `textContent` (nunca `innerHTML`), então nada vindo do PJe
 * é interpretado como HTML.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: classe, ...resto } = props;
  if (classe) el.className = classe;
  Object.assign(el, resto);
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    el.append(typeof f === 'number' ? String(f) : f);
  }
  return el;
}

/** "2026-10-20T10:10:00" → "20/10/2026 10:10". */
export function formatarDataHora(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const data = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? `${data} ${m[4]}:${m[5]}` : data;
}

/** "2026-10-20" → "20/10/2026". */
export function formatarData(iso: string): string {
  return formatarDataHora(iso.slice(0, 10));
}
