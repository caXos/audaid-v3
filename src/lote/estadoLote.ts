// Estado do Controle em Lote (§2.3). Entrega 1: tela 1 (texto) e o resultado da consulta. Os
// .vue só mostram; o padrão é o de src/individual/formulario.ts.

import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';
import type { Ambiente } from '../pje/ambiente';
import { pjeGet, type Resposta } from '../pje/http';
import { lerSessao, type OrgaoLogado } from '../pje/sessao';
import { extrairNumeros } from '../regras/numeros';
import { textoDiagnostico } from './apresentacao';
import { resolverLista, type Leitor, type ResultadoResolucao } from './resolver';

export type TelaLote = 'texto' | 'consultando' | 'resultado';

export function useLote(ambiente: Ambiente, versao: string) {
  // D5: o órgão é o logado ao abrir o lote, e é relido na hora de consultar.
  const orgao: OrgaoLogado | null = lerSessao(document.cookie).orgaoLogado ?? null;
  const tela = ref<TelaLote>('texto');
  const texto = ref('');
  const numeros = computed(() => extrairNumeros(texto.value));
  const progresso = reactive({ feitos: 0, total: 0 });
  const resultado = shallowRef<ResultadoResolucao | null>(null);
  const aviso = ref('');
  const rotuloCopiar = ref('Copiar diagnóstico');
  let vivo = true;
  onBeforeUnmount(() => {
    vivo = false;
  });

  const ler: Leitor = <T>(caminho: string): Promise<Resposta<T>> =>
    pjeGet<T>(ambiente.origem + caminho, { xsrfToken: lerSessao(document.cookie).xsrfToken });

  async function continuar(): Promise<void> {
    const lista = numeros.value;
    if (!orgao || !lista.length || tela.value === 'consultando') return;
    if (lerSessao(document.cookie).orgaoLogado?.id !== orgao.id) {
      aviso.value = 'Você trocou de órgão logado (ou a sessão expirou). Feche e abra o AudAid de novo.';
      return;
    }
    aviso.value = '';
    progresso.feitos = 0;
    progresso.total = lista.length;
    tela.value = 'consultando';
    const r = await resolverLista(lista, { ler, idOrgaoLogado: orgao.id }, (n) => {
      progresso.feitos = n;
    });
    if (!vivo) return;
    resultado.value = r;
    tela.value = 'resultado';
  }

  /** Volta à tela 1 com o texto que foi colado. */
  function voltar(): void {
    tela.value = 'texto';
  }

  async function copiarDiagnostico(): Promise<void> {
    if (!resultado.value) return;
    const t = textoDiagnostico(resultado.value, numeros.value.length, versao);
    try {
      await navigator.clipboard.writeText(t);
      rotuloCopiar.value = 'Copiado!';
    } catch {
      rotuloCopiar.value = 'Não deu para copiar';
      console.info('[AudAid] Diagnóstico do lote:\n' + t);
    }
    setTimeout(() => {
      rotuloCopiar.value = 'Copiar diagnóstico';
    }, 2000);
  }

  return reactive({
    orgao,
    tela,
    texto,
    numeros,
    progresso,
    resultado,
    aviso,
    rotuloCopiar,
    continuar,
    voltar,
    copiarDiagnostico,
  });
}

export type EstadoLote = ReturnType<typeof useLote>;
