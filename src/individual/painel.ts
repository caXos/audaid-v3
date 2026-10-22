// Controle Individual (§2.2 do blueprint). Entrega 3: completo, mas as escritas são simuladas.

import type { Opcoes } from '../config/opcoes';
import {
  ESCRITA_LIBERADA,
  executarDesignacao,
  transportePje,
  type AcaoSugerida,
  type PedidoDesignacao,
  type RegistroPasso,
  type ResultadoExecucao,
} from '../fluxo/executor';
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
import { somarUmMinuto } from '../pje/escrita';
import { pjeGet, type Resposta } from '../pje/http';
import { lerSessao } from '../pje/sessao';
import { classificarData, hoje } from '../regras/calendario';
import { pendenciaGigs, resolverVariaveis } from '../regras/gigs';
import { lerPauta, ocupanteDoMinuto, type EntradaPauta } from '../regras/pauta';
import {
  aplicabilidade,
  descricaoTipo,
  estadoVideo,
  ehSumarissimo,
  escolhaDaDescricao,
  faseDoProcesso,
  TIPOS_BASE,
  type EscolhaTipo,
  type Fase,
  type Semana,
  type TipoBase,
} from '../regras/tipoComposto';
import { resolverTipo } from '../regras/tipos';
import { formatarDataHora, h } from '../ui/dom';
import { CSS } from './estilo';

const CSS_EXTRA = `.selo.simulado { background: #e8f0fe; color: #1a56c4; }`;

interface Dados {
  processoBruto: Record<string, unknown>;
  processo: Processo;
  audiencias: Audiencia[];
  tipos: TipoAudiencia[];
  salas: Sala[];
  eventos: EventoCalendario[];
  idOrgaoLogado: number;
  descricaoOrgaoLogado: string;
  /** Audiência do órgão logado que seria substituída (D32). */
  antiga?: Audiencia;
}

const ROTULO_ESTADO: Record<RegistroPasso['estado'], string> = {
  ok: 'OK',
  simulado: 'SIMULADO',
  aviso: 'ATENÇÃO',
  erro: 'ERRO',
};

const TEXTO_ACAO: Record<AcaoSugerida, string> = {
  'escolher-outro-horario': 'Escolha outro horário (o botão "Encaixar" acha o próximo minuto livre).',
  'redesignar-antiga': 'Redesigne a audiência antiga pela pauta do PJe, com os dados mostrados acima.',
  'gigs-audiencia-perdida': 'Ou registre um GIGS com os dados da audiência antiga, para não esquecer.',
};

const nomeSala = (s: Sala) => s.nome ?? s.descricao ?? String(s.id);

export class ControleIndividual {
  private readonly host = h('div');
  private readonly raiz = h('div', { class: 'raiz' });
  private painel: HTMLElement | null = null;
  private idProcesso: number | null = null;
  private geracao = 0;

  constructor(
    private readonly ambiente: Ambiente,
    private readonly aoAbrirDiagnostico: () => void,
  ) {
    this.host.id = 'audaid-v3-individual';
    const sombra = this.host.attachShadow({ mode: 'open' });
    sombra.append(h('style', {}, CSS + CSS_EXTRA), this.raiz);
    this.garantirNaPagina();
  }

  garantirNaPagina() {
    if (!this.host.isConnected) document.body.append(this.host);
  }

  definirProcesso(id: number | null) {
    if (id === this.idProcesso) return;
    this.idProcesso = id;
    this.fechar();
  }

  get aberto() {
    return this.painel !== null;
  }

  fechar() {
    this.geracao++;
    this.painel?.remove();
    this.painel = null;
  }

  alternar(opcoes: Opcoes) {
    if (this.painel) this.fechar();
    else this.abrir(opcoes);
  }

  private abrir(opcoes: Opcoes) {
    if (this.idProcesso === null) return;
    this.fechar();
    const geracao = this.geracao;
    const simulando = opcoes.simulacao || !ESCRITA_LIBERADA;

    const titulo = h('h1', {}, 'AudAid · Controle Individual');
    const subtitulo = h('p', {}, 'Carregando o processo…');
    const corpo = h('div', { class: 'corpo' });
    this.painel = h(
      'aside',
      { class: 'painel' },
      h(
        'header',
        { class: 'cabecalho' },
        titulo,
        h('div', { class: 'linha-cab' }, subtitulo, h('button', { class: 'link', type: 'button', onclick: () => this.aoAbrirDiagnostico() }, 'Diagnóstico')),
        h('button', { class: 'fechar', type: 'button', title: 'Fechar', onclick: () => this.fechar() }, '×'),
      ),
      simulando
        ? h(
            'div',
            { class: 'faixa-simulacao' },
            ESCRITA_LIBERADA ? 'SIMULAÇÃO: nada será gravado no PJe' : 'SIMULAÇÃO: nada será gravado no PJe (envio real liberado só na entrega 4)',
          )
        : null,
      corpo,
    );
    this.raiz.append(this.painel);
    void this.carregar(this.idProcesso, opcoes, simulando, corpo, subtitulo, geracao);
  }

  private async carregar(idProcesso: number, opcoes: Opcoes, simulando: boolean, corpo: HTMLElement, subtitulo: HTMLElement, geracao: number) {
    const vivo = () => geracao === this.geracao;
    const sessao = lerSessao(document.cookie);
    if (!sessao.orgaoLogado) {
      corpo.append(this.cartaoErro('Não foi possível identificar o órgão em que você está logado (o token do PJe não está legível). Recarregue o PJe e tente de novo.'));
      subtitulo.textContent = '';
      return;
    }
    const oj = sessao.orgaoLogado;
    const get = <T>(c: string) => pjeGet<T>(this.ambiente.origem + c, { xsrfToken: lerSessao(document.cookie).xsrfToken });

    const [rProc, rAud, rTipos, rSalas, rCal] = await Promise.all([
      get<Record<string, unknown>>(caminhos.processo(idProcesso)),
      get<Audiencia[]>(caminhos.audiencias(idProcesso)),
      get<TipoAudiencia[]>(caminhos.tiposAudiencia()),
      get<Sala[]>(caminhos.salas(oj.id)),
      get<EventoCalendario[]>(caminhos.calendario(oj.id)),
    ]);
    if (!vivo()) return;

    const falhas = (
      [
        ['dados do processo', rProc],
        ['audiências', rAud],
        ['tipos de audiência', rTipos],
        ['salas', rSalas],
        ['calendário', rCal],
      ] as [string, Resposta<unknown>][]
    ).filter(([, r]) => !r.ok);
    if (falhas.length || !rProc.ok || !rAud.ok || !rTipos.ok || !rSalas.ok || !rCal.ok) {
      subtitulo.textContent = '';
      corpo.append(
        this.cartaoErro(
          `Não foi possível carregar: ${falhas.map(([n, r]) => `${n} (${r.ok ? '' : r.erro.mensagem})`).join('; ')}. Recarregue o PJe e tente de novo.`,
        ),
      );
      return;
    }

    const processo = rProc.dados as unknown as Processo;
    const audiencias = [...rAud.dados].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));
    const antiga = audiencias.find((a) => a.salaFisica?.orgaoJulgador?.id === oj.id && a.status === 'Designada');
    const dados: Dados = {
      processoBruto: rProc.dados,
      processo,
      audiencias,
      tipos: rTipos.dados,
      salas: rSalas.dados,
      eventos: rCal.dados,
      idOrgaoLogado: oj.id,
      descricaoOrgaoLogado: oj.descricao,
      antiga,
    };

    subtitulo.textContent = `${processo.numero} · ${processo.classeJudicial?.sigla ?? '?'} · logado em ${oj.descricao}`;
    corpo.append(this.secaoAudiencias(dados));
    const formulario = new Formulario(this.ambiente, dados, opcoes, simulando, vivo);
    corpo.append(...formulario.elementos);
  }

  private cartaoErro(texto: string): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, 'Não foi possível abrir'), h('span', { class: 'selo erro' }, 'ERRO')),
      h('div', { class: 'cartao-corpo erro-texto' }, texto),
    );
  }

  private secaoAudiencias(d: Dados): HTMLElement {
    const itens = d.audiencias.map((a) => {
      const doOrgao = a.salaFisica?.orgaoJulgador?.id === d.idOrgaoLogado;
      return h(
        'li',
        {},
        `${formatarDataHora(a.dataInicio)} · ${a.tipo?.descricao ?? '?'} · ${a.salaFisica?.nome ?? '?'} `,
        doOrgao
          ? h('strong', { class: a === d.antiga ? 'aviso-texto' : 'ok-texto' }, a === d.antiga ? '· será substituída (redesignação)' : '· órgão logado')
          : h('span', { class: 'suave' }, `· ${a.salaFisica?.orgaoJulgador?.descricao ?? 'outro órgão'} (só consulta)`),
      );
    });
    return h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, 'Audiências designadas')),
      h('div', { class: 'cartao-corpo' }, itens.length ? h('ul', {}, ...itens) : h('div', { class: 'suave' }, 'Nenhuma audiência designada.')),
    );
  }
}

// ── Formulário ────────────────────────────────────────────────────────────────────────────

class Formulario {
  readonly elementos: HTMLElement[];

  private readonly selSala = h('select');
  private readonly inData = h('input', { type: 'date' });
  private readonly msgData = h('div', { class: 'msg' });
  private readonly inHora = h('input', { type: 'time' });
  private readonly btnEncaixar = h('button', { class: 'acao secundaria', type: 'button' }, 'Encaixar no próximo minuto livre');
  private readonly msgHora = h('div', { class: 'msg' });
  private readonly pautaMini = h('div', { class: 'pauta-mini' });

  private readonly selBase = h('select');
  private readonly chkVideo = h('input', { type: 'checkbox' });
  private readonly rotuloVideo = h('label', { class: 'rotulo-check' }, this.chkVideo, ' por videoconferência');
  private readonly selFase = h('select');
  private readonly selSemana = h('select');
  private readonly txtFase = h('span', { class: 'suave' });
  private readonly txtRito = h('span', { class: 'suave' });
  private readonly resultadoTipo = h('div', { class: 'resultado-tipo' });
  private readonly avisoDigital = h('div', { class: 'aviso-digital' });

  private readonly selGigs = h('select');
  private readonly inGigsTexto = h('input', { type: 'text', class: 'largo' });
  private readonly inGigsPrazo = h('input', { type: 'number' });
  private readonly previaGigs = h('div', { class: 'previa-gigs' });

  private readonly btnEnviar = h('button', { class: 'acao', type: 'button' });
  private readonly listaPendencias = h('ul', { class: 'pendencias' });
  private readonly areaResultado = h('div', { class: 'cartao-corpo suave' }, 'O resultado aparece aqui, com cada requisição que seria feita.');
  private readonly btnCopiar = h('button', { class: 'acao secundaria', type: 'button', disabled: true }, 'Copiar requisições');

  private pauta: { chave: string; carregando: boolean; entradas?: EntradaPauta[]; erro?: string } = { chave: '', carregando: false };
  private temporizadorPauta: ReturnType<typeof setTimeout> | undefined;
  private executando = false;
  private ultimoResultado: ResultadoExecucao | null = null;

  constructor(
    private readonly ambiente: Ambiente,
    private readonly d: Dados,
    private readonly opcoes: Opcoes,
    private readonly simulando: boolean,
    private readonly vivo: () => boolean,
  ) {
    this.montarOpcoes();
    this.preencherPadroes();
    this.ligarEventos();
    this.elementos = [this.secaoFormulario(), this.secaoResultado()];
    this.atualizar();
  }

  // ── Montagem ──

  private montarOpcoes() {
    for (const s of this.d.salas) this.selSala.append(h('option', { value: String(s.id) }, nomeSala(s)));
    this.selBase.append(h('option', { value: '' }, '— escolha o tipo —'), ...TIPOS_BASE.map((b) => h('option', { value: b }, b)));
    this.selFase.append(h('option', { value: 'Conhecimento' }, 'Conhecimento'), h('option', { value: 'Execução' }, 'Execução'));
    this.selSemana.append(
      h('option', { value: 'nenhuma' }, 'Sem Semana Nacional'),
      h('option', { value: 'conciliacao' }, 'Semana Nacional de Conciliação'),
      h('option', { value: 'execucao' }, 'Semana Nacional de Execução'),
    );
    this.selGigs.append(
      h('option', { value: '' }, '— não lançar GIGS —'),
      ...this.opcoes.gigs.sugestoes.map((s, i) => h('option', { value: `s${i}` }, s.texto.length > 60 ? `${s.texto.slice(0, 57)}…` : s.texto)),
      h('option', { value: 'outro' }, 'Outro…'),
    );
    this.inGigsPrazo.min = '0';
    this.inGigsPrazo.max = '240';
  }

  private preencherPadroes() {
    const salaAntiga = this.d.antiga?.salaFisica?.id;
    if (salaAntiga !== undefined && this.d.salas.some((s) => s.id === salaAntiga)) this.selSala.value = String(salaAntiga);
    // D42: a fase vem sempre do processo (não da audiência antiga).
    this.selFase.value = faseDoProcesso(this.d.processo.faseProcessual);
    this.txtFase.textContent = `fase atual do processo: ${faseDoProcesso(this.d.processo.faseProcessual)}`;
    // Da audiência antiga vem só o tipo base (o caso comum: só muda data/hora). Vídeo segue o
    // processo (D42) e Semana Nacional começa vazia, por ser coisa de evento específico.
    const escolha = this.d.antiga?.tipo?.descricao ? escolhaDaDescricao(this.d.antiga.tipo.descricao) : undefined;
    if (escolha) this.selBase.value = escolha.base;
    this.chkVideo.checked = false;
    this.selSemana.value = 'nenhuma';
    this.inGigsPrazo.value = '2';
  }

  private ligarEventos() {
    const reagir = () => this.atualizar();
    for (const el of [this.selSala, this.inData, this.inHora, this.selBase, this.chkVideo, this.selFase, this.selSemana, this.inGigsTexto, this.inGigsPrazo]) {
      el.addEventListener('input', reagir);
      el.addEventListener('change', reagir);
    }
    this.selGigs.addEventListener('change', () => {
      const v = this.selGigs.value;
      const sugestao = v.startsWith('s') ? this.opcoes.gigs.sugestoes[Number(v.slice(1))] : undefined;
      this.inGigsTexto.value = sugestao?.texto ?? '';
      this.inGigsPrazo.value = String(sugestao?.prazo ?? 2);
      this.atualizar();
      if (v === 'outro') this.inGigsTexto.focus();
    });
    this.btnEncaixar.onclick = () => this.encaixar();
    this.btnEnviar.onclick = () => void this.enviar();
    this.btnCopiar.onclick = () => void this.copiar();
  }

  private secaoFormulario(): HTMLElement {
    const linha = (rotulo: string, ...conteudo: (Node | string)[]) => [h('label', {}, rotulo), h('div', { class: 'controles' }, ...conteudo)];
    const vazio = () => h('span');
    return h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, this.d.antiga ? 'Redesignar audiência' : 'Designar audiência')),
      h(
        'div',
        { class: 'cartao-corpo' },
        h(
          'div',
          { class: 'grade' },
          ...linha('Sala', this.selSala),
          ...linha('Data', this.inData),
          vazio(),
          this.msgData,
          ...linha('Horário', this.inHora, this.btnEncaixar),
          vazio(),
          this.msgHora,
          vazio(),
          this.pautaMini,
          ...linha('Tipo base', this.selBase),
          ...linha('Variações', this.rotuloVideo, this.selSemana),
          ...linha('Fase', this.selFase, this.txtFase),
          ...linha('Rito', this.txtRito),
          this.resultadoTipo,
          this.avisoDigital,
          ...linha('GIGS', this.selGigs),
          ...linha('Texto', this.inGigsTexto),
          ...linha('Prazo', this.inGigsPrazo, h('span', { class: 'suave' }, 'dias úteis (0 = sem prazo)')),
          this.previaGigs,
        ),
        h('div', { class: 'rodape-form' }, this.btnEnviar, this.listaPendencias),
      ),
    );
  }

  private secaoResultado(): HTMLElement {
    return h(
      'section',
      { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', {}, 'Resultado'), this.btnCopiar),
      this.areaResultado,
    );
  }

  // ── Estado derivado ──

  private escolhaTipo(): EscolhaTipo | null {
    if (!this.selBase.value) return null;
    return {
      base: this.selBase.value as TipoBase,
      video: this.chkVideo.checked,
      fase: this.selFase.value as Fase,
      semana: this.selSemana.value as Semana,
      sumarissimo: ehSumarissimo(this.d.processo.classeJudicial?.sigla),
    };
  }

  private tipoResolvido(): { descricao: string; tipo?: TipoAudiencia } | null {
    const e = this.escolhaTipo();
    if (!e) return null;
    const descricao = descricaoTipo(e);
    return { descricao, tipo: resolverTipo(descricao, this.d.tipos) };
  }

  private salaAtual(): Sala | undefined {
    return this.d.salas.find((s) => String(s.id) === this.selSala.value);
  }

  private dataValida(): string | null {
    return /^\d{4}-\d{2}-\d{2}$/.test(this.inData.value) ? this.inData.value : null;
  }

  private horaValida(): string | null {
    return /^\d{2}:\d{2}$/.test(this.inHora.value) ? this.inHora.value : null;
  }

  // ── Atualização da tela (layout estável: só muda texto e habilitação) ──

  private atualizar() {
    const pendencias: string[] = [];
    const sala = this.salaAtual();
    const data = this.dataValida();
    const hora = this.horaValida();
    if (!sala) pendencias.push('Escolha a sala.');

    // Data (D34, D34c)
    if (!data) {
      this.definirMsg(this.msgData, 'suave', '');
      pendencias.push('Escolha a data.');
    } else {
      const c = classificarData(data, this.d.eventos);
      if (c.nivel === 'bloqueia') {
        this.definirMsg(this.msgData, 'bloqueia', `Data bloqueada: ${c.bloqueios.join('; ')}.`);
        pendencias.push('A data está bloqueada pelo calendário do órgão.');
      } else if (c.nivel === 'avisa') {
        this.definirMsg(this.msgData, 'avisa', `Atenção: ${c.avisos.join('; ')}. Dá para designar.`);
      } else if (data < hoje()) {
        this.definirMsg(this.msgData, 'avisa', 'Data no passado.');
      } else {
        this.definirMsg(this.msgData, 'ok', 'Dia útil, sem evento no calendário.');
      }
    }

    // Pauta e horário (D28, D33)
    if (sala && data) this.agendarPauta(sala.id, data);
    const ocupante = this.pauta.entradas && hora ? ocupanteDoMinuto(this.pauta.entradas, hora, this.d.processo.id) : undefined;
    this.btnEncaixar.disabled = !ocupante;
    if (!hora) {
      this.definirMsg(this.msgHora, 'suave', '');
      pendencias.push('Escolha o horário.');
    } else if (!sala || !data) {
      this.definirMsg(this.msgHora, 'suave', 'Escolha sala e data para conferir a pauta.');
    } else if (this.pauta.carregando || !this.pauta.entradas) {
      this.definirMsg(this.msgHora, this.pauta.erro ? 'erro' : 'suave', this.pauta.erro ?? 'Consultando a pauta do dia…');
      pendencias.push(this.pauta.erro ? 'Não foi possível conferir a pauta.' : 'Aguarde a consulta da pauta.');
    } else if (ocupante) {
      this.definirMsg(this.msgHora, 'erro', `${hora} já está ocupado pelo processo ${ocupante.nrProcesso ?? ocupante.idProcesso}: o PJe recusaria (PJE-064).`);
      pendencias.push('O horário está ocupado.');
    } else if (this.pauta.entradas.some((e) => e.tipo === 'vaga' && e.hora === hora)) {
      this.definirMsg(this.msgHora, 'ok', `${hora}: vaga configurada na sala, pode usar.`);
    } else {
      this.definirMsg(this.msgHora, 'ok', `${hora} está livre na sala.`);
    }
    this.desenharPautaMini(hora);

    // Tipo (D6)
    const e = this.escolhaTipo();
    const ap = aplicabilidade((e?.base ?? 'Conciliação') as TipoBase, this.selFase.value as Fase);
    // D42: vídeo segue o processo (100% Digital = sempre por vídeo).
    const ev = e ? estadoVideo(e.base, Boolean(this.d.processo.juizoDigital)) : { habilitada: false };
    this.chkVideo.disabled = !ev.habilitada;
    if (ev.marcada !== undefined) this.chkVideo.checked = ev.marcada;
    this.rotuloVideo.classList.toggle('desabilitado', !ev.habilitada);
    this.rotuloVideo.title = !e
      ? ''
      : !ap.video
        ? 'Este tipo não tem versão por videoconferência.'
        : this.d.processo.juizoDigital
          ? 'Processo 100% Digital: a audiência é sempre por videoconferência.'
          : '';
    this.selFase.disabled = !e || !ap.fase;
    this.selSemana.disabled = !e || !ap.semana;
    const opcaoExecucao = this.selSemana.querySelector<HTMLOptionElement>('option[value="execucao"]');
    if (opcaoExecucao) opcaoExecucao.disabled = !ap.semanaExecucao;
    if (this.selSemana.value === 'execucao' && !ap.semanaExecucao) this.selSemana.value = 'nenhuma';
    this.txtRito.textContent = !e
      ? '—'
      : ap.rito
        ? ehSumarissimo(this.d.processo.classeJudicial?.sigla)
          ? 'Sumaríssimo (classe ATSum)'
          : `Ordinário (classe ${this.d.processo.classeJudicial?.sigla ?? '?'})`
        : 'Não se aplica a este tipo';
    const tr = this.tipoResolvido();
    this.resultadoTipo.className = 'resultado-tipo';
    if (!tr) {
      this.resultadoTipo.textContent = 'Escolha o tipo base para ver o tipo que será designado.';
      pendencias.push('Escolha o tipo de audiência.');
    } else if (!tr.tipo) {
      this.resultadoTipo.className = 'resultado-tipo erro';
      this.resultadoTipo.textContent = `"${tr.descricao}" não existe neste tribunal.`;
      pendencias.push('O tipo escolhido não existe neste tribunal.');
    } else {
      this.resultadoTipo.replaceChildren('Será designada: ', h('strong', {}, tr.tipo.descricao), h('span', { class: 'suave' }, ` (id ${tr.tipo.id})`));
    }

    // 100% Digital (D26)
    const julgamento = e?.base === 'Julgamento';
    this.avisoDigital.textContent = this.d.processo.juizoDigital
      ? julgamento
        ? 'Processo 100% Digital: o AudAid vai retirar o Juízo 100% Digital, designar o Julgamento e recolocar (o PJe não aceita Julgamento em processo 100% Digital).'
        : 'Processo 100% Digital.'
      : '';

    // GIGS (D29, D29b)
    const lancar = this.selGigs.value !== '';
    this.inGigsTexto.disabled = !lancar;
    this.inGigsPrazo.disabled = !lancar;
    const gigs = { lancar, texto: this.inGigsTexto.value, prazo: Number(this.inGigsPrazo.value) };
    const pg = pendenciaGigs(gigs);
    if (pg) pendencias.push(pg);
    this.previaGigs.textContent = !lancar
      ? 'Nenhum GIGS será lançado.'
      : `Será lançado: "${this.textoGigsResolvido() ?? gigs.texto}" · ${gigs.prazo > 0 ? `prazo de ${gigs.prazo} dia(s) útil(eis)` : 'sem prazo'}${data && hora && tr ? '' : ' (as variáveis são preenchidas quando data, hora e tipo estiverem escolhidos)'}`;

    // Botão
    const verbo = this.d.antiga ? 'redesignação' : 'designação';
    this.btnEnviar.textContent = this.executando ? 'Executando…' : this.simulando ? `Simular ${verbo}` : this.d.antiga ? 'Redesignar' : 'Designar';
    this.btnEnviar.disabled = this.executando || pendencias.length > 0;
    this.listaPendencias.replaceChildren(...pendencias.map((p) => h('li', {}, p)));
  }

  private definirMsg(el: HTMLElement, classe: string, texto: string) {
    el.className = `msg ${classe}`;
    el.textContent = texto;
  }

  private textoGigsResolvido(): string | null {
    const data = this.dataValida();
    const hora = this.horaValida();
    const tr = this.tipoResolvido();
    const sala = this.salaAtual();
    if (!data || !hora || !tr?.tipo || !sala) return null;
    return resolverVariaveis(this.inGigsTexto.value, { data, hora, tipo: tr.tipo.descricao, sala: nomeSala(sala) });
  }

  // ── Pauta do dia ──

  private agendarPauta(idSala: number, data: string) {
    const chave = `${idSala}|${data}`;
    if (chave === this.pauta.chave) return;
    this.pauta = { chave, carregando: true };
    clearTimeout(this.temporizadorPauta);
    this.temporizadorPauta = setTimeout(async () => {
      let novo: typeof this.pauta;
      try {
        const r = await pjeGet<PautaDia>(this.ambiente.origem + caminhos.pautaDia(idSala, data), { xsrfToken: lerSessao(document.cookie).xsrfToken });
        novo = r.ok ? { chave, carregando: false, entradas: lerPauta(r.dados) } : { chave, carregando: false, erro: `Erro ao consultar a pauta: ${r.erro.mensagem}` };
      } catch (e) {
        // Nunca deixar o formulário preso em "consultando".
        novo = { chave, carregando: false, erro: `Erro ao ler a pauta: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!this.vivo() || this.pauta.chave !== chave) return;
      this.pauta = novo;
      this.atualizar();
    }, 300);
  }

  private desenharPautaMini(hora: string | null) {
    const entradas = this.pauta.entradas;
    if (!entradas) {
      this.pautaMini.replaceChildren(h('div', { class: 'suave', title: '' }, ' '));
      return;
    }
    if (!entradas.length) {
      this.pautaMini.replaceChildren(h('div', { class: 'suave' }, ' Nenhuma audiência nem vaga nesta sala neste dia.'));
      return;
    }
    this.pautaMini.replaceChildren(
      h(
        'table',
        {},
        ...entradas.map((e) =>
          h(
            'tr',
            { class: e.tipo === 'vaga' ? 'vaga' : e.hora === hora ? 'destaque' : '' },
            h('td', { class: 'hora' }, e.hora),
            h('td', {}, e.tipo === 'vaga' ? 'vaga' : e.idProcesso === this.d.processo.id ? `${e.nrProcesso ?? ''} (este processo)` : (e.nrProcesso ?? String(e.idProcesso))),
            h('td', { class: 'suave' }, e.descricaoTipo ?? ''),
          ),
        ),
      ),
    );
  }

  /** D28: próximo minuto, a partir do escolhido, sem outro processo começando nele. */
  private encaixar() {
    const entradas = this.pauta.entradas;
    let hora = this.horaValida();
    if (!entradas || !hora) return;
    for (let i = 0; i < 180 && ocupanteDoMinuto(entradas, hora, this.d.processo.id); i++) hora = somarUmMinuto(hora);
    this.inHora.value = hora;
    this.atualizar();
  }

  // ── Envio ──

  private async enviar() {
    const sala = this.salaAtual();
    const data = this.dataValida();
    const hora = this.horaValida();
    const tr = this.tipoResolvido();
    if (!sala || !data || !hora || !tr?.tipo) return;

    // D5: o órgão é relido na hora da ação; se mudou em outra aba, para tudo.
    const sessao = lerSessao(document.cookie);
    if (sessao.orgaoLogado?.id !== this.d.idOrgaoLogado) {
      this.areaResultado.className = 'cartao-corpo';
      this.areaResultado.replaceChildren(
        h('div', { class: 'resumo falha' }, 'Você trocou de órgão logado (ou a sessão expirou). Feche e abra o AudAid de novo. Nada foi feito.'),
      );
      return;
    }

    const lancarGigs = this.selGigs.value !== '';
    const pedido: PedidoDesignacao = {
      idProcesso: this.d.processo.id,
      idOrgaoLogado: this.d.idOrgaoLogado,
      processoBruto: this.d.processoBruto,
      juizoDigital: Boolean(this.d.processo.juizoDigital),
      antiga: this.d.antiga
        ? {
            id: this.d.antiga.id,
            dataInicio: this.d.antiga.dataInicio,
            descricaoTipo: this.d.antiga.tipo?.descricao ?? '?',
            nomeSala: this.d.antiga.salaFisica?.nome ?? '?',
          }
        : undefined,
      idSala: sala.id,
      data,
      hora,
      idTipoAudiencia: tr.tipo.id,
      ehJulgamento: this.selBase.value === 'Julgamento',
      gigs: lancarGigs ? { texto: this.textoGigsResolvido() ?? this.inGigsTexto.value, prazo: Number(this.inGigsPrazo.value) } : undefined,
      eventos: this.d.eventos,
      hoje: hoje(),
    };

    this.executando = true;
    this.btnCopiar.disabled = true;
    this.atualizar();
    const transporte = transportePje(this.ambiente.origem, () => lerSessao(document.cookie).xsrfToken, this.opcoes.simulacao);
    let resultado: ResultadoExecucao;
    try {
      resultado = await executarDesignacao(pedido, transporte, (passos) => this.vivo() && this.desenharPassos(passos));
    } catch (e) {
      // Erro inesperado no código: mostra e libera o botão, em vez de travar em "Executando…".
      resultado = {
        desfecho: 'falha',
        resumo: `Erro inesperado no AudAid: ${e instanceof Error ? e.message : String(e)}. Confira no PJe o estado do processo.`,
        passos: [],
        acoes: [],
      };
    }
    if (!this.vivo()) return;
    this.executando = false;
    this.ultimoResultado = resultado;
    this.desenharResultado(resultado);
    this.btnCopiar.disabled = false;
    this.atualizar();
  }

  private desenharPassos(passos: RegistroPasso[], cabecalho?: Node) {
    this.areaResultado.className = 'cartao-corpo';
    this.areaResultado.replaceChildren(...(cabecalho ? [cabecalho] : []), ...passos.map((p) => this.desenharPasso(p)));
  }

  private desenharPasso(p: RegistroPasso): HTMLElement {
    const req = p.requisicao;
    return h(
      'div',
      { class: 'passo' },
      h('div', { class: 'passo-topo' }, h('strong', {}, p.titulo), h('span', { class: `selo ${p.estado === 'aviso' ? 'aviso' : p.estado}` }, ROTULO_ESTADO[p.estado])),
      p.detalhe ? h('div', { class: p.estado === 'erro' ? 'erro-texto' : 'suave' }, p.detalhe) : null,
      p.erro
        ? h(
            'div',
            { class: 'erro-texto' },
            p.erro.mensagem,
            p.erro.codigoErro || p.erro.identificadorRequisicao ? h('span', { class: 'suave' }, ` (código ${p.erro.codigoErro ?? '—'} · requisição ${p.erro.identificadorRequisicao ?? '—'})`) : null,
          )
        : null,
      req ? h('div', { class: 'req' }, `${req.metodo} ${this.ambiente.origem}${req.caminho}${p.estado === 'simulado' ? '  ← não enviado (simulação)' : ''}`) : null,
      req?.corpo !== undefined ? h('pre', {}, JSON.stringify(req.corpo, null, 2)) : null,
    );
  }

  private desenharResultado(r: ResultadoExecucao) {
    const cabecalho = h(
      'div',
      {},
      h('div', { class: `resumo ${r.desfecho}` }, r.resumo),
      r.acoes.length ? h('ul', { class: 'aviso-texto' }, ...r.acoes.map((a) => h('li', {}, TEXTO_ACAO[a]))) : null,
    );
    this.desenharPassos(r.passos, cabecalho);
  }

  /** Texto para comparar com as capturas. O corpo do 100% Digital (o processo inteiro) é resumido. */
  private async copiar() {
    const r = this.ultimoResultado;
    if (!r) return;
    const linhas = [`AudAid 3.0 · entrega 3 · ${this.simulando ? 'SIMULAÇÃO' : 'REAL'} · ${new Date().toLocaleString('pt-BR')}`, `Resultado: ${r.desfecho} · ${r.resumo}`, ''];
    for (const p of r.passos) {
      linhas.push(`# ${p.titulo} [${ROTULO_ESTADO[p.estado]}]${p.detalhe ? ` ${p.detalhe}` : ''}${p.erro ? ` ERRO: ${p.erro.mensagem} (${p.erro.codigoErro ?? '—'})` : ''}`);
      if (p.requisicao) {
        linhas.push(`${p.requisicao.metodo} ${this.ambiente.origem}${p.requisicao.caminho}`);
        const corpo = p.requisicao.corpo;
        if (corpo !== undefined) {
          if (p.requisicao.caminho.includes('alteracaoParcial')) {
            const c = corpo as Record<string, unknown>;
            linhas.push(`(corpo: o processo inteiro, ${Object.keys(c).length} campos, com juizoDigital = ${String(c['juizoDigital'])})`);
          } else {
            linhas.push(JSON.stringify(corpo));
          }
        }
      }
      linhas.push('');
    }
    const texto = linhas.join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      this.btnCopiar.textContent = 'Copiado!';
    } catch {
      this.btnCopiar.textContent = 'Não deu para copiar';
      console.info('[AudAid] Requisições:\n' + texto);
    }
    setTimeout(() => (this.btnCopiar.textContent = 'Copiar requisições'), 2000);
  }
}
