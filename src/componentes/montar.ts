// Base do Vue (D50, D50a). O CSS de cada componente chega como texto em `styles`
// (scripts/vue.mjs) e é injetado na primeira vez que o componente aparece, antes de ele ser
// desenhado:
// - no PJe, dentro de um Shadow DOM (`RaizVue`), para o CSS do PJe não entrar e o nosso não sair;
// - nas páginas da própria extensão, como as Opções (`montarNaPagina`), no `<head>`.

import { createApp, type App, type Component, type ComponentPublicInstance } from 'vue';

function estilo(css: string): HTMLStyleElement {
  const el = document.createElement('style');
  el.textContent = css;
  return el;
}

/** Cria o app com o mixin que entrega o CSS de cada tipo de componente a `inserir`, uma vez só. */
function criarAppComEstilos(componente: Component, props: Record<string, unknown>, inserir: (estilos: HTMLStyleElement[]) => void): App {
  const app = createApp(componente, props);
  const injetados = new Set<unknown>();
  app.mixin({
    beforeCreate(this: ComponentPublicInstance) {
      const tipo = this.$.type as { styles?: string[] };
      if (!tipo.styles?.length || injetados.has(tipo)) return;
      injetados.add(tipo);
      inserir(tipo.styles.map(estilo));
    },
  });
  return app;
}

export class RaizVue {
  private readonly sombra: ShadowRoot;
  private readonly raiz = document.createElement('div');
  private app: App | null = null;

  constructor(host: HTMLElement, cssBase: string) {
    this.sombra = host.attachShadow({ mode: 'open' });
    this.raiz.className = 'raiz';
    this.sombra.append(estilo(cssBase), this.raiz);
  }

  get montado(): boolean {
    return this.app !== null;
  }

  montar(componente: Component, props: Record<string, unknown>) {
    this.desmontar();
    // Depois do CSS base e dos componentes anteriores: a ordem é a do CSS único da 3.0. Um tipo de
    // componente que já pôs o CSS na sombra numa abertura anterior não o põe de novo.
    const app = criarAppComEstilos(componente, props, (estilos) => {
      const novos = estilos.filter((e) => ![...this.sombra.querySelectorAll('style')].some((s) => s.textContent === e.textContent));
      if (novos.length) this.raiz.before(...novos);
    });
    app.mount(this.raiz);
    this.app = app;
  }

  desmontar() {
    this.app?.unmount();
    this.app = null;
  }
}

/** Para as páginas da extensão (Opções): sem Shadow DOM, o CSS dos componentes vai para o `<head>`. */
export function montarNaPagina(componente: Component, props: Record<string, unknown>, alvo: HTMLElement): App {
  const app = criarAppComEstilos(componente, props, (estilos) => document.head.append(...estilos));
  app.mount(alvo);
  return app;
}
