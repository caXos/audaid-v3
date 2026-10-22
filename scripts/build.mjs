// Build da extensão: um bundle IIFE por ponto de entrada (content scripts não podem ser módulos
// ES no Chrome) e uma pasta pronta para carregar em cada navegador: dist/chrome e dist/firefox.
//
//   node scripts/build.mjs            → versão de desenvolvimento (modo simulação ligado por padrão)
//   node scripts/build.mjs --release  → versão para as lojas (simulação desligada e escondida)

import { build } from 'vite';
import { Resvg } from '@resvg/resvg-js';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { manifestChrome, manifestFirefox, TAMANHOS_ICONE } from './manifest.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const temp = join(dist, '.bundle');
const release = process.argv.includes('--release');

const pacote = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8'));

const ENTRADAS = [
  { entrada: 'src/content.ts', saida: 'content.js', nome: 'AudAidContent' },
  { entrada: 'src/background.ts', saida: 'background.js', nome: 'AudAidBackground' },
  { entrada: 'src/paginas/termos.ts', saida: 'termos.js', nome: 'AudAidTermos' },
  { entrada: 'src/paginas/opcoes.ts', saida: 'opcoes.js', nome: 'AudAidOpcoes' },
];

await rm(dist, { recursive: true, force: true });

for (const { entrada, saida, nome } of ENTRADAS) {
  await build({
    configFile: false,
    root: raiz,
    logLevel: 'warn',
    define: {
      __AUDAID_DEV__: JSON.stringify(!release),
      __AUDAID_VERSAO__: JSON.stringify(pacote.version),
    },
    build: {
      outDir: temp,
      emptyOutDir: false,
      target: 'es2022',
      // Sem minificação: a revisão da AMO lê o código, e o pacote fica auditável.
      minify: false,
      sourcemap: false,
      lib: { entry: join(raiz, entrada), formats: ['iife'], name: nome, fileName: () => saida },
    },
  });
}

// Ícone da barra e do menu de extensões: o desenho sobre um fundo branco arredondado (D41). Só o
// desenho preto sumia no tema escuro do navegador. O Chrome não aceita SVG no manifest, então ele
// recebe PNGs gerados a partir desse mesmo SVG.
const svgOriginal = await readFile(join(raiz, 'public', 'icons', 'audaid.svg'), 'utf8');
const partes = /<svg([^>]*)>([\s\S]*)<\/svg>/.exec(svgOriginal);
if (!partes || !/viewBox=/.test(partes[1])) throw new Error('public/icons/audaid.svg em formato inesperado');
// Os atributos da tag raiz (viewBox, fill-rule="evenodd"…) vão junto: o "✓" é um recorte que
// depende do evenodd.
const atributos = partes[1].replace(/\s+xmlns(:\w+)?="[^"]*"/g, '');
const svgBarra =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
  `<rect width="100" height="100" rx="22" fill="#ffffff"/>` +
  `<svg x="12" y="12" width="76" height="76"${atributos}>${partes[2]}</svg>` +
  `</svg>\n`;
const pngs = TAMANHOS_ICONE.map((tamanho) => ({
  tamanho,
  dados: new Resvg(svgBarra, { fitTo: { mode: 'width', value: tamanho } }).render().asPng(),
}));

const navegadores = [
  { pasta: 'chrome', manifest: manifestChrome(pacote.version), comPng: true },
  { pasta: 'firefox', manifest: manifestFirefox(pacote.version), comPng: false },
];

for (const { pasta, manifest, comPng } of navegadores) {
  const destino = join(dist, pasta);
  await mkdir(join(destino, 'icons'), { recursive: true });
  await cp(temp, destino, { recursive: true });
  await cp(join(raiz, 'public'), destino, { recursive: true });
  await writeFile(join(destino, 'icons', 'audaid-barra.svg'), svgBarra);
  if (comPng) {
    for (const { tamanho, dados } of pngs) await writeFile(join(destino, 'icons', `audaid-${tamanho}.png`), dados);
  }
  await writeFile(join(destino, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

await rm(temp, { recursive: true, force: true });
console.log(`AudAid ${pacote.version} (${release ? 'release' : 'desenvolvimento'}): dist/chrome e dist/firefox prontos.`);
