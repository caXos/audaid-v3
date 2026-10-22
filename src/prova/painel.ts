// Entrega 1: prova técnica SÓ DE LEITURA. Nada aqui grava no PJe: só GETs.
// Responde: o fetch funciona nos dois navegadores? A sessão é legível? Os endpoints da 3.0
// respondem como as capturas mostraram?

import type { Ambiente } from '../pje/ambiente';
import {
  caminhos,
  type Audiencia,
  type EventoCalendario,
  type PautaDia,
  type Processo,
  type Sala,
  type TipoAudiencia,
} from '../pje/api';
import { pjeGet, viasDisponiveis, type Resposta, type Via } from '../pje/http';
import { lerSessao, type Sessao } from '../pje/sessao';
import { classificarData, hoje } from '../regras/calendario';
import { lerPauta, ocupanteDoMinuto } from '../regras/pauta';
import { conferirTiposConhecidos } from '../regras/tipos';
import { formatarData, formatarDataHora, h } from '../ui/dom';
import { CSS } from './estilo';

type Estado = 'aguardando' | 'ok' | 'erro' | 'aviso';

const ROTULO: Record<Estado, string> = { aguardando: '…', ok: 'OK', erro: 'ERRO', aviso: 'ATENÇÃO' };

class Cartao {
  readonly raiz: HTMLElement;
  private readonly selo: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly corpo: HTMLElement;

  constructor(titulo: string) {
    this.selo = h('span', { class: 'selo aguardando' }, ROTULO.aguardando);
    this.meta = h('span', { class: 'meta' });
    this.corpo = h('div', { class: 'cartao-corpo suave' }, 'Consultando…');
    this.raiz = h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, titulo), this.meta, this.selo),
      this.corpo,
    );
  }

  definir(estado: Estado, meta: string, ...conteudo: (Node | string)[]) {
    this.selo.className = `selo ${estado}`;
    this.selo.textContent = ROTULO[estado];
    this.meta.textContent = meta;
    this.corpo.className = 'cartao-corpo';
    this.corpo.replaceChildren(...conteudo);
  }
}

/** Relatório em texto, para o usuário copiar e devolver. Sem nomes de partes, sem tokens. */
class Relatorio {
  private readonly linhas = new Map<string, string>();
  readonly area = h('textarea', { readOnly: true });

  registrar(chave: string, linha: string) {
    this.linhas.set(chave, linha);
    this.area.value = [...this.linhas.values()].join('\n');
  }
}

function meta(r: Resposta<unknown>): string {
  return `${r.status || '—'} · ${r.ms} ms · ${r.via}`;
}

function resumoResposta(r: Resposta<unknown>): string {
  return r.ok ? `${r.status} em ${r.ms} ms` : `ERRO ${r.status || 'rede'} em ${r.ms} ms: ${r.erro.mensagem}`;
}

function erroComoNo(r: Resposta<unknown>): HTMLElement {
  if (r.ok) return h('span');
  const e = r.erro;
  return h(
    'div',
    {},
    h('div', { class: 'erro-texto' }, e.mensagem),
    e.codigoErro || e.identificadorRequisicao
      ? h('div', { class: 'suave' }, `código ${e.codigoErro ?? '—'} · requisição ${e.identificadorRequisicao ?? '—'}`)
      : null,
  );
}

function navegador(): string {
  const ua = navigator.userAgent;
  const m = /Firefox\/(\d+)/.exec(ua) ?? /Edg\/(\d+)/.exec(ua) ?? /Chrome\/(\d+)/.exec(ua);
  if (!m) return 'navegador desconhecido';
  const nome = ua.includes('Firefox/') ? 'Firefox' : ua.includes('Edg/') ? 'Edge' : 'Chrome';
  return `${nome} ${m[1]}`;
}

export class ProvaTecnica {
  private readonly host: HTMLElement;
  private readonly raiz: HTMLElement;
  private readonly botao: HTMLButtonElement;
  private painel: HTMLElement | null = null;
  private idProcesso: number | null = null;
  /** Incrementa a cada nova execução, para descartar resultados de uma execução antiga. */
  private geracao = 0;

  constructor(private readonly ambiente: Ambiente) {
    this.host = h('div');
    this.host.id = 'audaid-v3';
    const sombra = this.host.attachShadow({ mode: 'open' });
    sombra.append(h('style', {}, CSS));
    this.botao = h('button', { class: 'botao-abrir', type: 'button', onclick: () => this.abrir() }, 'AudAid · prova técnica');
    this.raiz = h('div', { class: 'raiz' });
    sombra.append(this.raiz);
    this.garantirNaPagina();
  }

  /** O PJe é uma SPA e pode recriar o `body`: recoloca o host se ele sumir. */
  garantirNaPagina() {
    if (!this.host.isConnected) document.body.append(this.host);
  }

  definirProcesso(id: number | null) {
    if (id === this.idProcesso) return;
    this.idProcesso = id;
    this.fechar();
    this.raiz.replaceChildren(...(id === null ? [] : [this.botao]));
  }

  private fechar() {
    this.geracao++;
    this.painel?.remove();
    this.painel = null;
  }

  private abrir() {
    if (this.idProcesso === null) return;
    this.fechar();
    const relatorio = new Relatorio();
    const corpo = h('div', { class: 'corpo' });
    this.painel = h(
      'aside',
      { class: 'painel' },
      h(
        'header',
        { class: 'cabecalho' },
        h('h1', {}, 'AudAid 3.0 · prova técnica'),
        h('p', {}, 'Somente leitura: nada é gravado no PJe.'),
        h('button', { class: 'fechar', type: 'button', title: 'Fechar', onclick: () => this.fechar() }, '×'),
      ),
      corpo,
    );
    this.raiz.append(this.painel);
    void this.executar(this.idProcesso, corpo, relatorio, this.geracao);
  }

  private async executar(idProcesso: number, corpo: HTMLElement, rel: Relatorio, geracao: number) {
    const vivo = () => geracao === this.geracao;
    const amb = this.ambiente;
    const url = (caminho: string) => amb.origem + caminho;
    const cartao = (titulo: string) => {
      const c = new Cartao(titulo);
      corpo.append(c.raiz);
      return c;
    };

    // Relatório: a seção final do painel, mas criada primeiro para receber as linhas.
    const copiar = h('button', { class: 'acao', type: 'button' }, 'Copiar relatório');
    const avisoCopia = h('span', { class: 'suave' });
    copiar.onclick = async () => {
      rel.area.select();
      try {
        await navigator.clipboard.writeText(rel.area.value);
        avisoCopia.textContent = 'Copiado.';
      } catch {
        avisoCopia.textContent = document.execCommand('copy') ? 'Copiado.' : 'Selecionado: use Ctrl+C.';
      }
    };
    const secaoRelatorio = h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, 'Relatório para devolver')),
      h('div', { class: 'cartao-corpo' }, h('p', { class: 'suave' }, 'Sem nomes de partes e sem tokens. Copie e cole na conversa.'), rel.area, h('div', { class: 'linha-form' }, copiar, avisoCopia)),
    );

    rel.registrar('cabecalho', `AudAid 3.0 · prova técnica (entrega 1) · ${navegador()} · ${new Date().toLocaleString('pt-BR')}`);

    // 1. Ambiente
    cartao('Ambiente').definir('ok', '', `${amb.ambiente} · ${amb.tribunal} · ${amb.origem}`);
    rel.registrar('ambiente', `Ambiente: ${amb.ambiente} · ${amb.tribunal} · processo ${idProcesso}`);

    // 2. Sessão
    const sessao = lerSessao(document.cookie);
    this.mostrarSessao(cartao('Sessão (cookies)'), sessao, rel);

    // 3. Vias de requisição: no Firefox compara content.fetch × fetch no mesmo GET.
    const cVias = cartao('Vias de requisição');
    const vias = viasDisponiveis();
    const tentativas: Resposta<Processo>[] = [];
    for (const via of vias) {
      tentativas.push(await pjeGet<Processo>(url(caminhos.processo(idProcesso)), { xsrfToken: sessao.xsrfToken, via }));
      if (!vivo()) return;
    }
    const escolhida = tentativas.find((t) => t.ok) ?? tentativas[0];
    if (!escolhida) return;
    const via: Via = escolhida.via;
    cVias.definir(
      tentativas.some((t) => t.ok) ? 'ok' : 'erro',
      `via escolhida: ${via}`,
      h('ul', {}, ...tentativas.map((t) => h('li', {}, `${t.via}: ${resumoResposta(t)}`))),
      vias.length === 1 ? h('div', { class: 'suave' }, 'Só existe "fetch" neste navegador (Chrome/Edge).') : '',
    );
    rel.registrar('vias', `Vias (GET processo): ${tentativas.map((t) => `${t.via}=${resumoResposta(t)}`).join(' · ')} → via escolhida: ${via}`);

    const get = <T>(caminho: string) => pjeGet<T>(url(caminho), { xsrfToken: sessao.xsrfToken, via });

    // 4. Processo
    const cProc = cartao('Processo');
    let processo: Processo | undefined;
    if (escolhida.ok) {
      processo = escolhida.dados;
      const ojProc = processo.orgaoJulgador;
      const mesmoOrgao = ojProc && sessao.orgaoLogado ? ojProc.id === sessao.orgaoLogado.id : undefined;
      cProc.definir(
        'ok',
        meta(escolhida),
        h(
          'ul',
          {},
          h('li', {}, `Número: ${processo.numero}`),
          h('li', {}, `Classe: ${processo.classeJudicial?.sigla ?? '—'} · fase: ${processo.faseProcessual ?? '—'}`),
          h('li', {}, `Órgão do processo: ${ojProc ? `${ojProc.descricao} (${ojProc.id})` : '—'}`),
          h('li', {}, `Juízo 100% Digital: ${processo.juizoDigital ? 'sim' : 'não'}`),
          mesmoOrgao === false
            ? h('li', { class: 'aviso-texto' }, 'O processo está em outro órgão que não o logado (D5: a extensão usaria o logado).')
            : null,
        ),
      );
      rel.registrar(
        'processo',
        `Processo: ${resumoResposta(escolhida)} · ${processo.classeJudicial?.sigla ?? '?'} · 100% Digital=${processo.juizoDigital ? 'sim' : 'não'} · órgão do processo=${ojProc?.id ?? '?'}${mesmoOrgao === undefined ? '' : mesmoOrgao ? ' (igual ao logado)' : ' (DIFERENTE do logado)'}`,
      );
    } else {
      cProc.definir('erro', meta(escolhida), erroComoNo(escolhida));
      rel.registrar('processo', `Processo: ${resumoResposta(escolhida)}`);
    }

    // 5. Audiências do processo
    const cAud = cartao('Audiências designadas');
    const rAud = await get<Audiencia[]>(caminhos.audiencias(idProcesso));
    if (!vivo()) return;
    const idLogado = sessao.orgaoLogado?.id;
    let proximaNoLogado: Audiencia | undefined;
    if (rAud.ok) {
      const lista = [...rAud.dados].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
      proximaNoLogado = lista.find((a) => a.salaFisica?.orgaoJulgador?.id === idLogado);
      const noLogado = lista.filter((a) => a.salaFisica?.orgaoJulgador?.id === idLogado).length;
      cAud.definir(
        'ok',
        meta(rAud),
        lista.length === 0
          ? h('div', { class: 'suave' }, 'Nenhuma audiência designada.')
          : h(
              'ul',
              {},
              ...lista.map((a) =>
                h(
                  'li',
                  {},
                  `${formatarDataHora(a.dataInicio)} · ${a.tipo?.descricao ?? '?'} · ${a.salaFisica?.nome ?? '?'} · `,
                  h(
                    'span',
                    { class: a.salaFisica?.orgaoJulgador?.id === idLogado ? 'ok-texto' : 'suave' },
                    a.salaFisica?.orgaoJulgador?.id === idLogado ? 'órgão logado' : `outro órgão: ${a.salaFisica?.orgaoJulgador?.descricao ?? '?'}`,
                  ),
                ),
              ),
            ),
      );
      rel.registrar('audiencias', `Audiências: ${resumoResposta(rAud)} · ${lista.length} designada(s), ${noLogado} no órgão logado`);
    } else {
      cAud.definir('erro', meta(rAud), erroComoNo(rAud));
      rel.registrar('audiencias', `Audiências: ${resumoResposta(rAud)}`);
    }

    // 6. Tipos de audiência (D6: resolver pelo nome, nunca por ID fixo)
    const cTipos = cartao('Tipos de audiência');
    const rTipos = await get<TipoAudiencia[]>(caminhos.tiposAudiencia());
    if (!vivo()) return;
    if (rTipos.ok) {
      const conf = conferirTiposConhecidos(rTipos.dados);
      cTipos.definir(
        conf.faltando.length ? 'aviso' : 'ok',
        meta(rTipos),
        h('div', {}, `${rTipos.dados.length} tipos no PJe. Descrições que o formulário monta: ${conf.encontradas} de ${conf.encontradas + conf.faltando.length} encontradas.`),
        conf.faltando.length ? h('ul', { class: 'aviso-texto' }, ...conf.faltando.map((d) => h('li', {}, `não encontrada: ${d}`))) : '',
      );
      rel.registrar('tipos', `Tipos: ${resumoResposta(rTipos)} · ${rTipos.dados.length} tipos · conhecidas ${conf.encontradas}/${conf.encontradas + conf.faltando.length}${conf.faltando.length ? ` · faltando: ${conf.faltando.join('; ')}` : ''}`);
    } else {
      cTipos.definir('erro', meta(rTipos), erroComoNo(rTipos));
      rel.registrar('tipos', `Tipos: ${resumoResposta(rTipos)}`);
    }

    // Órgão usado para salas e calendário: o logado (D5). Sem JWT legível, cai no do processo.
    const idOrgao = idLogado ?? processo?.orgaoJulgador?.id;
    const origemOrgao = idLogado ? 'logado' : 'do processo (JWT ilegível)';
    if (idOrgao === undefined) {
      cartao('Salas, calendário e pauta').definir('erro', '', 'Sem órgão: não deu para ler o JWT nem o processo.');
      rel.registrar('orgao', 'Órgão: indisponível (sem JWT e sem processo)');
      corpo.append(secaoRelatorio);
      return;
    }

    // 7. Salas
    const cSalas = cartao(`Salas do órgão ${origemOrgao} (${idOrgao})`);
    const rSalas = await get<Sala[]>(caminhos.salas(idOrgao));
    if (!vivo()) return;
    const salas = rSalas.ok ? rSalas.dados : [];
    if (rSalas.ok) {
      cSalas.definir('ok', meta(rSalas), h('ul', {}, ...salas.map((s) => h('li', {}, `${s.nome ?? s.descricao ?? '?'} (${s.id})`))));
      rel.registrar('salas', `Salas do órgão ${idOrgao}: ${resumoResposta(rSalas)} · ${salas.length} sala(s)`);
    } else {
      cSalas.definir('erro', meta(rSalas), erroComoNo(rSalas));
      rel.registrar('salas', `Salas do órgão ${idOrgao}: ${resumoResposta(rSalas)}`);
    }

    // 8. Calendário
    const cCal = cartao(`Calendário do órgão ${origemOrgao} (${idOrgao})`);
    const rCal = await get<EventoCalendario[]>(caminhos.calendario(idOrgao));
    if (!vivo()) return;
    const eventos = rCal.ok ? rCal.dados : [];
    if (rCal.ok) {
      const hojeIso = hoje();
      const proximos = eventos
        .filter((e) => (e.dataFim || e.dataInicio) >= hojeIso)
        .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
        .slice(0, 6);
      const ultimo = eventos.reduce((max, e) => ((e.dataFim || e.dataInicio) > max ? e.dataFim || e.dataInicio : max), '');
      cCal.definir(
        'ok',
        meta(rCal),
        h('div', {}, `${eventos.length} eventos cadastrados, o último termina em ${ultimo ? formatarData(ultimo) : '—'}. Próximos:`),
        h(
          'ul',
          {},
          ...proximos.map((e) => {
            const nivel = classificarData(e.dataInicio, [e]).nivel;
            return h(
              'li',
              { class: nivel === 'bloqueia' ? 'erro-texto' : 'aviso-texto' },
              `${formatarData(e.dataInicio)}${e.dataFim && e.dataFim !== e.dataInicio ? ` a ${formatarData(e.dataFim)}` : ''} · ${e.descricao.trim()} → ${nivel}`,
            );
          }),
        ),
      );
      rel.registrar('calendario', `Calendário do órgão ${idOrgao}: ${resumoResposta(rCal)} · ${eventos.length} eventos · último termina em ${ultimo || '?'}`);
    } else {
      cCal.definir('erro', meta(rCal), erroComoNo(rCal));
      rel.registrar('calendario', `Calendário do órgão ${idOrgao}: ${resumoResposta(rCal)}`);
    }

    // 9. Pauta do dia (interativa): sala + data + horário a testar.
    const cPauta = cartao('Pauta do dia e regras de data/horário');
    const seletorSala = h('select', {}, ...salas.map((s) => {
      const op = h('option', { value: String(s.id) }, s.nome ?? s.descricao ?? String(s.id));
      return op;
    }));
    const salaPadrao = proximaNoLogado?.salaFisica?.id;
    if (salaPadrao !== undefined && salas.some((s) => s.id === salaPadrao)) seletorSala.value = String(salaPadrao);
    const campoData = h('input', { type: 'date', value: proximaNoLogado?.dataInicio.slice(0, 10) ?? hoje() });
    const campoHora = h('input', { type: 'time', value: proximaNoLogado?.dataInicio.slice(11, 16) || '09:00' });
    const resultado = h('div', { class: 'suave' }, 'Escolha sala, data e horário.');
    const buscar = h('button', { class: 'acao secundaria', type: 'button' }, 'Consultar');

    const consultarPauta = async () => {
      const idSala = Number(seletorSala.value);
      const data = campoData.value;
      const hora = campoHora.value;
      if (!idSala || !data) {
        resultado.replaceChildren('Faltam sala ou data.');
        return;
      }
      resultado.replaceChildren('Consultando…');
      const cls = classificarData(data, eventos);
      const rPauta = await get<PautaDia>(caminhos.pautaDia(idSala, data));
      if (!vivo()) return;

      const linhaData = h(
        'div',
        { class: cls.nivel === 'bloqueia' ? 'erro-texto' : cls.nivel === 'avisa' ? 'aviso-texto' : 'ok-texto' },
        `Data ${formatarData(data)}: ${cls.nivel === 'bloqueia' ? 'BLOQUEADA' : cls.nivel === 'avisa' ? 'aviso' : 'livre'}`,
        cls.bloqueios.length || cls.avisos.length ? ` (${[...cls.bloqueios, ...cls.avisos].join('; ')})` : '',
      );
      rel.registrar('data', `Data ${data}: ${cls.nivel}${cls.bloqueios.length || cls.avisos.length ? ` (${[...cls.bloqueios, ...cls.avisos].join('; ')})` : ''}`);

      if (!rPauta.ok) {
        cPauta.definir('erro', meta(rPauta), linhaData, erroComoNo(rPauta), formulario);
        rel.registrar('pauta', `Pauta sala ${idSala} em ${data}: ${resumoResposta(rPauta)}`);
        return;
      }
      const entradas = lerPauta(rPauta.dados);
      const vagas = entradas.filter((e) => e.tipo === 'vaga').length;
      const ocupante = hora ? ocupanteDoMinuto(entradas, hora, idProcesso) : undefined;
      const linhaHora = hora
        ? h(
            'div',
            { class: ocupante ? 'erro-texto' : 'ok-texto' },
            ocupante
              ? `Horário ${hora}: ocupado pelo processo ${ocupante.nrProcesso ?? ocupante.idProcesso} (o PJe recusaria com PJE-064).`
              : `Horário ${hora}: livre para este processo.`,
          )
        : '';
      cPauta.definir(
        'ok',
        meta(rPauta),
        linhaData,
        linhaHora,
        h('div', { class: 'suave' }, `${entradas.length} entradas: ${entradas.length - vagas} audiência(s), ${vagas} vaga(s).`),
        h(
          'table',
          {},
          ...entradas.map((e) =>
            h(
              'tr',
              { class: e.tipo === 'vaga' ? 'vaga' : e.hora === hora ? 'destaque' : '' },
              h('td', { class: 'hora' }, e.hora),
              h('td', {}, e.tipo === 'vaga' ? `vaga · ${e.descricaoTipo ?? ''}` : `${e.nrProcesso ?? e.idProcesso} · ${e.descricaoTipo ?? ''}`),
            ),
          ),
        ),
        formulario,
      );
      rel.registrar(
        'pauta',
        `Pauta sala ${idSala} em ${data}: ${resumoResposta(rPauta)} · ${entradas.length} entradas (${entradas.length - vagas} audiências, ${vagas} vagas)${hora ? ` · horário ${hora} ${ocupante ? 'OCUPADO' : 'livre'}` : ''}`,
      );
    };
    buscar.onclick = () => void consultarPauta();

    const formulario = h(
      'div',
      {},
      h('div', { class: 'linha-form' }, h('label', {}, 'Sala'), seletorSala),
      h('div', { class: 'linha-form' }, h('label', {}, 'Data'), campoData, h('label', {}, 'Horário'), campoHora, buscar),
    );
    cPauta.definir('aguardando', '', resultado, formulario);

    corpo.append(secaoRelatorio);
    if (salas.length) await consultarPauta();
  }

  private mostrarSessao(c: Cartao, s: Sessao, rel: Relatorio) {
    const agora = new Date();
    const expirada = s.expiraEm ? s.expiraEm < agora : undefined;
    const problemas = !s.xsrfToken || !s.accessTokenLegivel || !s.orgaoLogado;
    c.definir(
      problemas || expirada ? 'aviso' : 'ok',
      '',
      h(
        'ul',
        {},
        h('li', {}, `Cookie Xsrf-Token: ${s.xsrfToken ? 'encontrado' : 'NÃO encontrado'}`),
        h('li', {}, `Cookie access_token legível pela extensão: ${s.accessTokenLegivel ? 'sim' : 'NÃO (HttpOnly?)'}`),
        h('li', {}, `Órgão logado (JWT): ${s.orgaoLogado ? `${s.orgaoLogado.descricao} (${s.orgaoLogado.id})` : 'não identificado'}`),
        h(
          'li',
          { class: expirada ? 'erro-texto' : '' },
          `Sessão expira: ${s.expiraEm ? s.expiraEm.toLocaleString('pt-BR') : '—'}${expirada ? ' (EXPIRADA: recarregue o PJe)' : ''}`,
        ),
      ),
    );
    rel.registrar(
      'sessao',
      `Sessão: xsrf=${s.xsrfToken ? 'sim' : 'NÃO'} · access_token legível=${s.accessTokenLegivel ? 'sim' : 'NÃO'} · órgão logado=${s.orgaoLogado?.id ?? 'NÃO'} · ${expirada === undefined ? 'expiração ?' : expirada ? 'EXPIRADA' : 'válida'}`,
    );
  }
}
