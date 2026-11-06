/** Uma opção da combobox (CampoBusca.vue, D90). */
export interface OpcaoBusca {
  valor: string;
  rotulo: string;
  /** Texto menor ao lado, que também conta no filtro (ex.: o nome completo do órgão). */
  detalhe?: string;
}
