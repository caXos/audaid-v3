<script setup lang="ts">
// Os ícones do AudAid (D100): desenhos nossos em SVG, sem pacote de ícones (a fonte de ícones não
// funciona no Shadow DOM, e um CDN seria requisição a terceiros). Pegam a cor do texto
// (`currentColor`). O ícone é só desenho: quem o usa dá o nome no `title` e no `aria-label`.
export type NomeIcone = 'lixeira' | 'calendario-mais' | 'pessoa' | 'copiar' | 'ok';

defineProps<{ nome: NomeIcone }>();
</script>

<template>
  <svg
    class="icone"
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :data-icone="nome"
  >
    <!-- O "×" que cancela (D100): tampa, alça e caçamba com dois frisos. -->
    <template v-if="nome === 'lixeira'">
      <path d="M2.5 4h11" />
      <path d="M6 4V2.5h4V4" />
      <path d="M3.8 4l.7 9.2a1 1 0 0 0 1 .8h5a1 1 0 0 0 1-.8l.7-9.2" />
      <path d="M6.5 6.8v4.4M9.5 6.8v4.4" />
    </template>
    <!-- O "+" da vaga (D100): designar nela. -->
    <template v-else-if="nome === 'calendario-mais'">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
      <path d="M8 8.3v4M6 10.3h4" />
    </template>
    <!-- O "(?)" dos advogados (D100). -->
    <template v-else-if="nome === 'pessoa'">
      <circle cx="8" cy="5" r="2.75" />
      <path d="M2.75 14a5.25 5.25 0 0 1 10.5 0" />
    </template>
    <template v-else-if="nome === 'copiar'">
      <rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5" />
      <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6.5A1.5 1.5 0 0 0 4 11h1.5" />
    </template>
    <path v-else d="M3 8.5l3.2 3L13 4.5" stroke-width="2" />
  </svg>
</template>

<style>
.icone { display: block; width: 14px; height: 14px; flex: none; }
</style>
