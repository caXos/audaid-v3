// A forma de uma resposta do PJe, para o diagnóstico da Pauta (D86b): os nomes dos campos e os
// tipos, sem os valores. Só aparecem valores que não identificam ninguém: códigos curtos ("F"),
// booleanos, datas e horas, que é o que se precisa para entender uma resposta nova.

type Descritor =
  | { t: 'nulo' }
  | { t: 'numero' }
  | { t: 'texto' }
  | { t: 'data' }
  | { t: 'hora' }
  | { t: 'codigo'; valores: Set<string> }
  | { t: 'booleano'; valores: Set<boolean> }
  | { t: 'lista'; n: number; item?: Descritor }
  | { t: 'objeto'; campos: Map<string, Descritor> }
  | { t: 'misto'; opcoes: Descritor[] };

/** Itens de uma lista examinados para juntar os campos (os seguintes raramente trazem campo novo). */
const ITENS_EXAMINADOS = 60;
/** Quantos valores de um código aparecem antes de "…". */
const CODIGOS_MOSTRADOS = 8;
const PROFUNDIDADE = 3;

const CODIGO = /^[A-Z]{1,3}$/;
const DATA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

function descrever(valor: unknown, prof: number): Descritor {
  if (valor === null || valor === undefined) return { t: 'nulo' };
  if (typeof valor === 'number') return { t: 'numero' };
  if (typeof valor === 'boolean') return { t: 'booleano', valores: new Set([valor]) };
  if (typeof valor === 'string') {
    if (CODIGO.test(valor)) return { t: 'codigo', valores: new Set([valor]) };
    if (DATA.test(valor)) return { t: 'data' };
    if (HORA.test(valor)) return { t: 'hora' };
    return { t: 'texto' };
  }
  if (Array.isArray(valor)) {
    let item: Descritor | undefined;
    for (const v of valor.slice(0, ITENS_EXAMINADOS)) {
      const d = descrever(v, prof + 1);
      item = item ? mesclar(item, d) : d;
    }
    return { t: 'lista', n: valor.length, item };
  }
  if (typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>);
    // Fundo demais: só quantos campos há (a forma de cima já diz o que interessa).
    if (prof >= PROFUNDIDADE) return { t: 'objeto', campos: new Map([[`…${entradas.length} campos`, { t: 'nulo' }]]) };
    return { t: 'objeto', campos: new Map(entradas.map(([k, v]) => [k, descrever(v, prof + 1)])) };
  }
  return { t: 'texto' };
}

function mesclar(a: Descritor, b: Descritor): Descritor {
  if (a.t === 'misto') return { t: 'misto', opcoes: juntarOpcao(a.opcoes, b) };
  if (b.t === 'misto') return { t: 'misto', opcoes: b.opcoes.reduce<Descritor[]>((acc, o) => juntarOpcao(acc, o), [a]) };
  if (a.t !== b.t) return { t: 'misto', opcoes: [a, b] };
  switch (a.t) {
    case 'codigo':
      return { t: 'codigo', valores: new Set([...a.valores, ...(b as typeof a).valores]) };
    case 'booleano':
      return { t: 'booleano', valores: new Set([...a.valores, ...(b as typeof a).valores]) };
    case 'lista': {
      const ib = (b as typeof a).item;
      return { t: 'lista', n: Math.max(a.n, (b as typeof a).n), item: a.item && ib ? mesclar(a.item, ib) : (a.item ?? ib) };
    }
    case 'objeto': {
      const campos = new Map(a.campos);
      for (const [k, d] of (b as typeof a).campos) campos.set(k, campos.has(k) ? mesclar(campos.get(k)!, d) : d);
      return { t: 'objeto', campos };
    }
    default:
      return a;
  }
}

function juntarOpcao(opcoes: Descritor[], d: Descritor): Descritor[] {
  const i = opcoes.findIndex((o) => o.t === d.t);
  if (i < 0) return [...opcoes, d];
  const copia = [...opcoes];
  copia[i] = mesclar(copia[i]!, d);
  return copia;
}

function formatar(d: Descritor): string {
  switch (d.t) {
    case 'nulo':
      return 'null';
    case 'numero':
      return 'nº';
    case 'texto':
      return 'texto';
    case 'data':
      return 'data';
    case 'hora':
      return 'hora';
    case 'codigo': {
      const v = [...d.valores].sort();
      const mostrados = v.slice(0, CODIGOS_MOSTRADOS).map((c) => `"${c}"`).join('|');
      return v.length > CODIGOS_MOSTRADOS ? `${mostrados}|…` : mostrados;
    }
    case 'booleano':
      return `bool(${[...d.valores].sort().join(',')})`;
    case 'lista':
      return d.item ? `[${d.n} × ${formatar(d.item)}]` : `[${d.n}]`;
    case 'objeto':
      return `{ ${[...d.campos].map(([k, v]) => (k.startsWith('…') ? k : `${k}: ${formatar(v)}`)).join(', ')} }`;
    case 'misto':
      return d.opcoes.map(formatar).join(' | ');
  }
}

/**
 * A forma de um valor, numa linha. Ex.: `[22 × { dia: data, tipo: "F"|"U" }]`.
 * Texto livre vira só `texto`: nenhum nome de parte, advogado ou usuário passa.
 */
export function formaDe(valor: unknown): string {
  return formatar(descrever(valor, 0));
}

export interface OrgaoDoPerfil {
  id: number;
  /** O nome do órgão, se o perfil o trouxer. Nome de órgão é público. */
  descricao?: string;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Os órgãos dos perfis do usuário (`token/perfis`, D87b), sem repetir e na ordem em que vêm. A
 * leitura é defensiva: a v1 lia `idOrgaoJulgador`, mas a resposta de hoje não tem captura.
 */
export function orgaosDosPerfis(dados: unknown): OrgaoDoPerfil[] {
  let itens: unknown[] = [];
  if (Array.isArray(dados)) itens = dados;
  else if (ehObjeto(dados)) itens = ['resultado', 'content', 'perfis', 'itens'].map((c) => dados[c]).find(Array.isArray) ?? [dados];

  const vistos = new Map<number, OrgaoDoPerfil>();
  for (const item of itens.filter(ehObjeto)) {
    const oj = ehObjeto(item['orgaoJulgador']) ? item['orgaoJulgador'] : undefined;
    const id = [item['idOrgaoJulgador'], oj?.['id'], item['idOrgao']].find((v): v is number => typeof v === 'number' && v > 0);
    if (id === undefined) continue;
    const descricao = [oj?.['descricao'], item['orgaoJulgador'], item['descricaoOrgaoJulgador'], item['nomeOrgaoJulgador'], item['orgao']].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    const atual = vistos.get(id);
    if (!atual) vistos.set(id, descricao ? { id, descricao: descricao.trim() } : { id });
    else if (!atual.descricao && descricao) atual.descricao = descricao.trim();
  }
  return [...vistos.values()];
}

/** Um órgão do `audpje/oj` (captura de 19/10/2026). */
export interface OrgaoDoTribunal {
  id: number;
  nome: string;
  sigla?: string;
  municipio?: string;
}

/** Lê a lista do `audpje/oj`; o que não tiver id numérico fica de fora. */
export function lerOrgaosDoTribunal(dados: unknown): OrgaoDoTribunal[] {
  if (!Array.isArray(dados)) return [];
  return dados.filter(ehObjeto).flatMap((o) => {
    const id = o['idOrgaoJulgador'];
    if (typeof id !== 'number') return [];
    const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const nome = texto(o['nomeOrgaoJulgador']) ?? String(id);
    const sigla = texto(o['sigla']);
    const municipio = texto(o['nomeMunicipio']);
    return [{ id, nome, ...(sigla ? { sigla } : {}), ...(municipio ? { municipio } : {}) }];
  });
}

/**
 * A entrada de um dia na resposta do mês (`classificacoes?idSala=&ano=&mes=`). Procura por um campo
 * com a data; sem ele, usa a posição, como a v1 fazia (`diasUteis[dia - 1]`).
 */
export function entradaDoDia(mes: unknown, dia: string): unknown {
  const lista = Array.isArray(mes) ? mes : ehObjeto(mes) ? (Object.values(mes).find(Array.isArray) ?? []) : [];
  const porData = lista.find((e) => ehObjeto(e) && Object.values(e).some((v) => typeof v === 'string' && v.startsWith(dia)));
  if (porData !== undefined) return porData;
  return lista[Number(dia.slice(8, 10)) - 1];
}

/**
 * Os campos simples de um objeto com os valores, quando eles não identificam ninguém: números,
 * booleanos, códigos curtos, datas e horas. Texto livre vira `texto`. Serve para a entrada do dia
 * na resposta do mês, que não tem nomes.
 */
export function camposSimples(valor: unknown): string {
  if (!ehObjeto(valor)) return formaDe(valor);
  const partes = Object.entries(valor).map(([k, v]) => {
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) return `${k}=${String(v)}`;
    if (typeof v === 'string') return CODIGO.test(v) || DATA.test(v) || HORA.test(v) ? `${k}=${v}` : `${k}=texto`;
    return `${k}=${formaDe(v)}`;
  });
  return `{ ${partes.join(', ')} }`;
}

/** Os próximos `n` dias úteis (segunda a sexta), a partir de `inicio` (inclusive), em AAAA-MM-DD. */
export function proximosDiasUteis(inicio: string, n: number): string[] {
  const [a, m, d] = inicio.split('-').map(Number);
  const data = new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1));
  const dias: string[] = [];
  while (dias.length < n) {
    const semana = data.getUTCDay();
    if (semana !== 0 && semana !== 6) dias.push(data.toISOString().slice(0, 10));
    data.setUTCDate(data.getUTCDate() + 1);
  }
  return dias;
}

/** A data `dias` depois de `inicio`, em AAAA-MM-DD. */
export function somarDias(inicio: string, dias: number): string {
  const [a, m, d] = inicio.split('-').map(Number);
  const data = new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
