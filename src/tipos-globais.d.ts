// Constantes definidas pelo build (scripts/build.mjs).
declare const __AUDAID_DEV__: boolean;
declare const __AUDAID_VERSAO__: string;

declare module '*.svg?raw' {
  const conteudo: string;
  export default conteudo;
}

// Componentes Vue. O TypeScript 7 (nativo) não roda o vue-tsc, então o que está dentro dos .vue
// não é checado: a lógica fica em .ts, e os .vue só mostram e ligam (testes de DOM cobrem).
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const componente: DefineComponent<any, any, any>;
  export default componente;
}
