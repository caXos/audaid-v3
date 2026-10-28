// Página de Opções (§2.6), em Vue desde a 3.1 (D50a). Este arquivo só monta o app e entrega a ele
// a API da extensão; a página é src/paginas/opcoes/PaginaOpcoes.vue.

import { montarNaPagina } from '../componentes/montar';
import { aoMudarArmazenado, ext, lerArmazenado, salvarAceite, salvarOpcoes } from '../ext/api';
import type { ApiOpcoes } from './estadoOpcoes';
import PaginaOpcoes from './opcoes/PaginaOpcoes.vue';

// scripts/pacotes.mjs confere esta linha no build de release (`const DEV = false`).
const DEV = __AUDAID_DEV__;

const api: ApiOpcoes = {
  ler: () => lerArmazenado(DEV),
  salvarOpcoes,
  salvarAceite,
  aoMudar: aoMudarArmazenado,
  abrirTermos: () => void ext.tabs.create({ url: ext.runtime.getURL('termos.html') }),
};

montarNaPagina(PaginaOpcoes, { api, desenvolvimento: DEV, versao: __AUDAID_VERSAO__ }, document.getElementById('app')!);
