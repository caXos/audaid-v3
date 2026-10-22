// Build da extensão: um bundle IIFE por ponto de entrada (content scripts não podem ser módulos
// ES no Chrome) e uma pasta pronta para carregar em cada navegador: dist/chrome e dist/firefox.

import { build } from 'vite';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { manifestChrome, manifestFirefox } from './manifest.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');
const temp = join(dist, '.bundle');

const pacote = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8'));

const ENTRADAS = [{ entrada: 'src/content.ts', saida: 'content.js', nome: 'AudAidContent' }];

await rm(dist, { recursive: true, force: true });

for (const { entrada, saida, nome } of ENTRADAS) {
  await build({
    configFile: false,
    root: raiz,
    logLevel: 'warn',
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

const navegadores = [
  { pasta: 'chrome', manifest: manifestChrome(pacote.version) },
  { pasta: 'firefox', manifest: manifestFirefox(pacote.version) },
];

for (const { pasta, manifest } of navegadores) {
  const destino = join(dist, pasta);
  await mkdir(destino, { recursive: true });
  await cp(temp, destino, { recursive: true });
  await cp(join(raiz, 'public'), destino, { recursive: true });
  await writeFile(join(destino, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

await rm(temp, { recursive: true, force: true });
console.log(`AudAid ${pacote.version}: dist/chrome e dist/firefox prontos.`);
