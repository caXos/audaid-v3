// Constantes definidas pelo build (scripts/build.mjs).
declare const __AUDAID_DEV__: boolean;
declare const __AUDAID_VERSAO__: string;

declare module '*.svg?raw' {
  const conteudo: string;
  export default conteudo;
}
