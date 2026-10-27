// Base do Vue (D50, D50a): um app Vue dentro de um Shadow DOM, para o CSS do PJe não entrar e o
// nosso não sair. O CSS de cada componente chega como texto em `styles` (scripts/vue.mjs) e é
// injetado aqui na primeira vez que o componente aparece, antes de ele ser desenhado.

import { createApp, type App, type Component, type ComponentPublicInstance } from 'vue';

export class RaizVue {
  private readonly sombra: ShadowRoot;
  private readonly raiz = document.createElement('div');
  private readonly injetados = new Set<unknown>();
  private app: App | null = null;

  constructor(host: HTMLElement, cssBase: string) {
    this.sombra = host.attachShadow({ mode: 'open' });
    this.raiz.className = 'raiz';
    this.sombra.append(this.estilo(cssBase), this.raiz);
  }

  get montado(): boolean {
    return this.app !== null;
  }

  montar(componente: Component, props: Record<string, unknown>) {
    this.desmontar();
    const app = createApp(componente, props);
    const injetar = (tipo: { styles?: string[] }) => {
      if (!tipo.styles?.length || this.injetados.has(tipo)) return;
      this.injetados.add(tipo);
      // Depois do CSS base e dos componentes anteriores: a ordem é a do CSS único da 3.0.
      this.raiz.before(...tipo.styles.map((css) => this.estilo(css)));
    };
    app.mixin({
      beforeCreate(this: ComponentPublicInstance) {
        injetar(this.$.type as { styles?: string[] });
      },
    });
    app.mount(this.raiz);
    this.app = app;
  }

  desmontar() {
    this.app?.unmount();
    this.app = null;
  }

  private estilo(css: string): HTMLStyleElement {
    const el = document.createElement('style');
    el.textContent = css;
    return el;
  }
}
