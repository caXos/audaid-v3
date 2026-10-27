// Controle Individual (§2.2 do blueprint). Entrega 3: completo, mas as escritas são simuladas.

import { LIMITES, type Opcoes } from '../config/opcoes';
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
import { pjeGet, type Resposta } from '../pje/http';
import { lerSessao } from '../pje/sessao';
import { classificarData, hoje } from '../regras/calendario';
import { dataBr, gerarHash, pendenciaGigs, resolverVariaveis, VARIAVEIS_GIGS, type DadosVariaveisGigs } from '../regras/gigs';
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
  /** Nome do usuário (JWT), para `{usuario}`/`{eu}` no GIGS (D43). */
  nomeUsuario?: string;
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
  'escolher-outro-horario': 'Escolha outro horário, na pauta do dia ou digitando.',
  'redesignar-antiga': 'Redesigne a audiência antiga pela pauta do PJe, com os dados mostrados acima.',
  'gigs-audiencia-perdida': 'Ou registre um GIGS com os dados da audiência antiga, para não esquecer.',
};

const nomeSala = (s: Sala) => s.nome ?? s.descricao ?? String(s.id);

function resumoPauta(entradas: EntradaPauta[]): string {
  if (!entradas.length) return 'Pauta do dia vazia nesta sala.';
  const vagas = entradas.filter((e) => e.tipo === 'vaga').length;
  return `Pauta do dia: ${entradas.length - vagas} audiência(s), ${vagas} vaga(s).`;
}

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
            ESCRITA_LIBERADA
              ? 'SIMULAÇÃO: nada será gravado no PJe. Para gravar de verdade, desligue o modo simulação nas Opções.'
              : 'SIMULAÇÃO: nada será gravado no PJe (envio real bloqueado nesta versão).',
          )
        : h('div', { class: 'faixa-real' }, 'ENVIO REAL: o que você confirmar será gravado no PJe em seu nome.'),
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
      nomeUsuario: sessao.nomeUsuario,
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
  private readonly msgHora = h('div', { class: 'msg' });
  // A pauta do dia abre por cima, num diálogo: nada no formulário muda de tamanho (§5).
  // Caminho principal: escolher o horário clicando numa vaga da pauta (digitar é a alternativa).
  private readonly btnPauta = h('button', { class: 'acao secundaria', type: 'button', disabled: true }, 'Escolher horário na pauta do dia');
  private readonly tituloPauta = h('h3');
  private readonly dicaPauta = h('p', { class: 'suave' });
  private readonly corpoPauta = h('div', { class: 'corpo-pauta' });
  private readonly dialogoPauta = h(
    'dialog',
    { class: 'dialogo-pauta' },
    this.tituloPauta,
    this.dicaPauta,
    this.corpoPauta,
    h('div', { class: 'rodape-dialogo' }, h('button', { class: 'acao', type: 'button', onclick: () => this.dialogoPauta.close() }, 'Fechar')),
  );

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
  // D43: as variáveis ficam à vista num diálogo, e clicar insere no texto.
  private readonly btnVariaveis = h('button', { class: 'acao secundaria', type: 'button' }, 'Exibir variáveis');
  private readonly corpoVariaveis = h('div', { class: 'corpo-variaveis' });
  private readonly dialogoVariaveis = h(
    'dialog',
    { class: 'dialogo-pauta' },
    h('h3', {}, 'Variáveis do texto do GIGS'),
    h('p', { class: 'suave' }, 'Clique numa variável para inseri-la no texto. Variável que o AudAid não conhece vai como está escrita.'),
    this.corpoVariaveis,
    h('div', { class: 'rodape-dialogo' }, h('button', { class: 'acao', type: 'button', onclick: () => this.dialogoVariaveis.close() }, 'Fechar')),
  );
  /** Código desta execução (D44); renovado depois de cada envio. */
  private hash = gerarHash();
  private readonly inGigsPrazo = h('input', { type: 'number' });
  private readonly previaGigs = h('div', { class: 'previa-gigs' });

  private readonly btnEnviar = h('button', { class: 'acao', type: 'button' });
  private readonly listaPendencias = h('ul', { class: 'pendencias' });
  private readonly areaResultado = h('div', { class: 'cartao-corpo suave' }, 'O resultado aparece aqui, com cada requisição que seria feita.');
  private readonly btnCopiar = h('button', { class: 'acao secundaria', type: 'button', disabled: true }, 'Copiar requisições');

  private pauta: { chave: string; carregando: boolean; entradas?: EntradaPauta[]; erro?: string } = { chave: '', carregando: false };
  private temporizadorPauta: ReturnType<typeof setTimeout> | undefined;
  private executando = false;
  private confirmando = false;
  private ultimoResultado: ResultadoExecucao | null = null;
  /** `{hash}` usado na última execução, se o texto do GIGS o tinha (D44). */
  private hashDaExecucao: string | null = null;

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
    this.btnVariaveis.onclick = () => {
      this.desenharVariaveis();
      if (typeof this.dialogoVariaveis.showModal === 'function') this.dialogoVariaveis.showModal();
      else this.dialogoVariaveis.setAttribute('open', '');
    };
    this.btnPauta.onclick = () => {
      this.desenharPauta(this.horaValida());
      if (typeof this.dialogoPauta.showModal === 'function') this.dialogoPauta.showModal();
      else this.dialogoPauta.setAttribute('open', '');
    };
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
          ...linha('Horário', this.btnPauta),
          vazio(),
          h('div', { class: 'controles' }, h('span', { class: 'suave' }, 'ou digite:'), this.inHora),
          vazio(),
          this.msgHora,
          ...linha('Tipo base', this.selBase),
          ...linha('Variações', this.rotuloVideo, this.selSemana),
          ...linha('Fase', this.selFase, this.txtFase),
          ...linha('Rito', this.txtRito),
          this.resultadoTipo,
          this.avisoDigital,
          ...linha('GIGS', this.selGigs),
          ...linha('Texto', this.inGigsTexto, this.btnVariaveis),
          ...linha('Prazo', this.inGigsPrazo, h('span', { class: 'suave' }, 'dias úteis (0 = sem prazo)')),
          this.previaGigs,
        ),
        h('div', { class: 'rodape-form' }, this.btnEnviar, this.listaPendencias),
      ),
      this.dialogoPauta,
      this.dialogoVariaveis,
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

    // Pauta e horário (D28, D33). Tudo numa linha de altura fixa; a lista fica no diálogo.
    if (sala && data) this.agendarPauta(sala.id, data);
    const entradas = sala && data ? this.pauta.entradas : undefined;
    const ocupante = entradas && hora ? ocupanteDoMinuto(entradas, hora, this.d.processo.id) : undefined;
    this.btnPauta.disabled = !entradas;
    if (!hora) pendencias.push('Escolha o horário.');
    if (!sala || !data) {
      this.definirMsg(this.msgHora, 'suave', 'Escolha sala e data: a pauta do dia é consultada na hora.');
    } else if (this.pauta.erro) {
      this.definirMsg(this.msgHora, 'erro', this.pauta.erro);
      pendencias.push('Não foi possível conferir a pauta.');
    } else if (!entradas) {
      this.definirMsg(this.msgHora, 'carregando', 'Consultando a pauta do dia…');
      pendencias.push('Aguarde a consulta da pauta.');
    } else if (!hora) {
      this.definirMsg(this.msgHora, 'suave', `${resumoPauta(entradas)} Escolha o horário na pauta ou digite.`);
    } else if (ocupante) {
      this.definirMsg(this.msgHora, 'erro', `${hora} já está ocupado pelo processo ${ocupante.nrProcesso ?? ocupante.idProcesso}: o PJe recusaria (PJE-064). Escolha outro horário na pauta ou digite outro.`);
      pendencias.push('O horário está ocupado.');
    } else if (entradas.some((e) => e.tipo === 'vaga' && e.hora === hora)) {
      this.definirMsg(this.msgHora, 'ok', `${hora}: vaga configurada na sala, pode usar.`);
    } else {
      this.definirMsg(this.msgHora, 'ok', `${hora} está livre na sala. ${resumoPauta(entradas)}`);
    }
    this.desenharPauta(hora);

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
    this.btnVariaveis.disabled = !lancar;
    // Validação sobre o texto JÁ resolvido: as variáveis podem fazê-lo passar de 4000 caracteres.
    const textoFinal = this.textoGigsResolvido();
    const gigs = { lancar, texto: textoFinal, prazo: Number(this.inGigsPrazo.value) };
    const pg = pendenciaGigs(gigs);
    if (pg) pendencias.push(pg);
    this.previaGigs.textContent = !lancar
      ? 'Nenhum GIGS será lançado.'
      : `(${textoFinal.length}/${LIMITES.textoGigs}) Será lançado: "${textoFinal}" · ${gigs.prazo > 0 ? `prazo de ${gigs.prazo} dia(s) útil(eis)` : 'sem prazo'}${data && hora && tr?.tipo ? '' : ' (data, hora e tipo entram quando forem escolhidos)'}`;
    this.previaGigs.title = this.previaGigs.textContent;

    // Botão
    const verbo = this.d.antiga ? 'redesignação' : 'designação';
    this.btnEnviar.textContent = this.executando ? 'Executando…' : this.simulando ? `Simular ${verbo}` : this.d.antiga ? 'Redesignar' : 'Designar';
    this.btnEnviar.disabled = this.executando || this.confirmando || pendencias.length > 0;
    this.listaPendencias.replaceChildren(...pendencias.map((p) => h('li', {}, p)));
  }

  private definirMsg(el: HTMLElement, classe: string, texto: string) {
    el.className = `msg ${classe}`;
    el.textContent = texto;
    // A linha tem altura fixa (§5); se o texto não couber, o completo fica no tooltip.
    el.title = texto;
  }

  /** Valores das variáveis do GIGS agora (D43). O que ainda não foi escolhido fica de fora. */
  private dadosVariaveis(): DadosVariaveisGigs {
    const sala = this.salaAtual();
    return {
      data: this.dataValida() ?? undefined,
      hora: this.horaValida() ?? undefined,
      tipo: this.tipoResolvido()?.tipo?.descricao,
      sala: sala ? nomeSala(sala) : undefined,
      acao: this.d.antiga ? 'redesignada' : 'designada',
      usuario: this.d.nomeUsuario,
      orgao: this.d.descricaoOrgaoLogado,
      hash: this.hash,
    };
  }

  private textoGigsResolvido(): string {
    return resolverVariaveis(this.inGigsTexto.value, this.dadosVariaveis());
  }

  /** Diálogo "Exibir variáveis": cada variável com o que vira agora; clicar insere no texto. */
  private desenharVariaveis() {
    const d = this.dadosVariaveis();
    this.corpoVariaveis.replaceChildren(
      h(
        'table',
        {},
        ...VARIAVEIS_GIGS.map((v) => {
          const valor = v.valor(d);
          const linha = h(
            'tr',
            { class: 'clicavel' },
            h('td', {}, h('code', {}, v.variavel)),
            h('td', {}, valor ?? h('span', { class: 'suave' }, '(escolha no formulário)')),
            h('td', { class: 'suave' }, v.descricao),
          );
          linha.title = `Inserir ${v.variavel} no texto`;
          linha.onclick = () => {
            this.inserirNoTexto(v.variavel);
            this.dialogoVariaveis.close();
          };
          return linha;
        }),
      ),
    );
  }

  /** Insere no cursor do campo de texto do GIGS (ou no fim, se o campo nunca recebeu foco). */
  private inserirNoTexto(trecho: string) {
    const campo = this.inGigsTexto;
    const inicio = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? campo.value.length;
    campo.value = campo.value.slice(0, inicio) + trecho + campo.value.slice(fim);
    campo.focus();
    campo.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    this.atualizar();
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

  /** Conteúdo do diálogo da pauta. Texto sozinho fica centralizado (área de tamanho fixo). */
  private desenharPauta(hora: string | null) {
    const sala = this.salaAtual();
    const data = this.dataValida();
    this.tituloPauta.textContent = sala && data ? `Pauta do dia · ${nomeSala(sala)} · ${dataBr(data)}` : 'Pauta do dia';
    const entradas = sala && data ? this.pauta.entradas : undefined;
    const centralizado = (texto: string) => h('div', { class: 'centralizado' }, texto);
    this.dicaPauta.textContent = !entradas?.length
      ? ''
      : entradas.some((e) => e.tipo === 'vaga')
        ? 'Clique numa vaga para usar o horário dela.'
        : 'Esta sala não tem vaga configurada neste dia: feche e digite o horário (o AudAid confere se está livre).';
    if (!entradas) {
      this.corpoPauta.replaceChildren(centralizado(this.pauta.erro ?? 'Consultando a pauta do dia…'));
      return;
    }
    if (!entradas.length) {
      this.corpoPauta.replaceChildren(centralizado('Nenhuma audiência nem vaga nesta sala neste dia. Feche e digite o horário.'));
      return;
    }
    this.corpoPauta.replaceChildren(
      h(
        'table',
        {},
        ...entradas.map((e) => {
          const linha = h(
            'tr',
            { class: [e.tipo === 'vaga' ? 'vaga clicavel' : '', e.hora === hora ? 'destaque' : ''].join(' ').trim() },
            h('td', { class: 'hora' }, e.hora),
            h('td', {}, e.tipo === 'vaga' ? 'vaga' : e.idProcesso === this.d.processo.id ? `${e.nrProcesso ?? ''} (este processo)` : (e.nrProcesso ?? String(e.idProcesso))),
            h('td', { class: 'suave' }, e.descricaoTipo ?? ''),
          );
          if (e.tipo === 'vaga') {
            linha.title = `Usar ${e.hora}`;
            linha.onclick = () => {
              this.inHora.value = e.hora;
              this.dialogoPauta.close();
              this.atualizar();
            };
          }
          return linha;
        }),
      ),
    );
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
      gigs: lancarGigs ? { texto: this.textoGigsResolvido(), prazo: Number(this.inGigsPrazo.value) } : undefined,
      eventos: this.d.eventos,
      hoje: hoje(),
    };

    // Envio real: mostra antes o que será gravado e só segue com a confirmação explícita.
    if (!this.simulando && !(await this.confirmarEnvio(pedido, tr.tipo.descricao, nomeSala(sala)))) return;
    if (!this.vivo()) return;

    // D44: o hash desta execução é o da prévia; depois do envio, outro para o próximo.
    this.hashDaExecucao = lancarGigs && /\{\s*hash\s*\}/i.test(this.inGigsTexto.value) ? this.hash : null;
    this.hash = gerarHash();

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
    // D52: URL e payload só na simulação. No envio real ficam título, selo, detalhe e erro; o
    // completo continua em "Copiar requisições", para suporte.
    const req = this.simulando ? p.requisicao : undefined;
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

  /** Resumo do que será gravado no PJe, com "Confirmar e gravar" / "Cancelar". */
  private confirmarEnvio(p: PedidoDesignacao, descricaoTipo: string, sala: string): Promise<boolean> {
    const quando = `${dataBr(p.data)} às ${p.hora}`;
    const itens: string[] = [
      p.antiga
        ? `Redesignar a audiência de ${formatarDataHora(p.antiga.dataInicio)} (${p.antiga.descricaoTipo}) para ${quando}.`
        : `Designar audiência em ${quando}.`,
      `Tipo: ${descricaoTipo} · ${sala}.`,
    ];
    if (p.juizoDigital && p.ehJulgamento) {
      itens.push('Retirar o Juízo 100% Digital antes e recolocá-lo depois (o PJe lança dois movimentos no processo).');
    }
    if (p.gigs) {
      itens.push(`Lançar GIGS "${p.gigs.texto}" ${p.gigs.prazo > 0 ? `com prazo de ${p.gigs.prazo} dia(s) útil(eis)` : 'sem prazo'}.`);
    }
    const aviso = classificarData(p.data, this.d.eventos);
    if (aviso.nivel === 'avisa') itens.push(`Atenção: ${aviso.avisos.join('; ')}.`);

    this.confirmando = true;
    this.atualizar();
    return new Promise((resolver) => {
      const terminar = (ok: boolean) => {
        this.confirmando = false;
        if (!ok) {
          this.areaResultado.className = 'cartao-corpo suave';
          this.areaResultado.replaceChildren('Cancelado. Nada foi gravado.');
        }
        this.atualizar();
        resolver(ok);
      };
      const gravar = h('button', { class: 'acao perigo', type: 'button', onclick: () => terminar(true) }, 'Confirmar e gravar no PJe');
      this.areaResultado.className = 'cartao-corpo';
      this.areaResultado.replaceChildren(
        h(
          'div',
          { class: 'confirmacao' },
          h('strong', {}, 'Confira o que será gravado no PJe em seu nome:'),
          h('ul', {}, ...itens.map((i) => h('li', {}, i))),
          h('div', { class: 'linha-form' }, gravar, h('button', { class: 'acao secundaria', type: 'button', onclick: () => terminar(false) }, 'Cancelar')),
        ),
      );
      gravar.focus();
    });
  }

  private desenharResultado(r: ResultadoExecucao) {
    const gravouDeVerdade = !this.simulando && (r.desfecho === 'sucesso' || r.desfecho === 'parcial');
    const cabecalho = h(
      'div',
      {},
      h('div', { class: `resumo ${r.desfecho}` }, r.resumo),
      this.hashDaExecucao ? h('div', {}, 'Código desta execução (para buscar no GIGS): ', h('strong', {}, this.hashDaExecucao)) : null,
      r.acoes.length ? h('ul', { class: 'aviso-texto' }, ...r.acoes.map((a) => h('li', {}, TEXTO_ACAO[a]))) : null,
      // §2.2, passo 6: a tela do PJe só mostra a audiência nova depois de recarregar.
      gravouDeVerdade
        ? h(
            'div',
            { class: 'recarregar' },
            'Recarregar a página para ver a audiência no PJe?',
            h('div', { class: 'linha-form' }, h('button', { class: 'acao', type: 'button', onclick: () => location.reload() }, 'Recarregar agora'), h('button', { class: 'acao secundaria', type: 'button', onclick: (ev) => (ev.target as HTMLElement).closest('.recarregar')?.remove() }, 'Agora não')),
          )
        : null,
    );
    this.desenharPassos(r.passos, cabecalho);
  }

  /** Texto para comparar com as capturas. O corpo do 100% Digital (o processo inteiro) é resumido. */
  private async copiar() {
    const r = this.ultimoResultado;
    if (!r) return;
    const linhas = [`AudAid 3.0 · ${this.simulando ? 'SIMULAÇÃO' : 'REAL'} · ${new Date().toLocaleString('pt-BR')}`, `Resultado: ${r.desfecho} · ${r.resumo}`, ...(this.hashDaExecucao ? [`Código desta execução: ${this.hashDaExecucao}`] : []), ''];
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
