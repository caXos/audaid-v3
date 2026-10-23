// Gera os pacotes para as lojas a partir do build de RELEASE (rode via `npm run pacotes`):
//   pacotes/audaid-<versão>-firefox.zip  → AMO
//   pacotes/audaid-<versão>-chrome.zip   → Chrome Web Store / Edge Add-ons
//   pacotes/audaid-<versão>-fonte.zip    → AMO (código-fonte, exigido porque usamos empacotador)

import webExt from 'web-ext';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, 'pacotes');
const { version } = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8'));

// O fonte sai do último commit: com alterações pendentes, ele não corresponderia ao pacote.
const pendentes = execFileSync('git', ['status', '--porcelain'], { cwd: raiz, encoding: 'utf8' }).trim();
if (pendentes) {
  console.error('Há alterações não commitadas. Faça o commit antes de gerar os pacotes:\n' + pendentes);
  process.exit(1);
}

// O build precisa ser o de release: o modo simulação vem desligado (e escondido nas Opções).
const opcoes = await readFile(join(raiz, 'dist', 'firefox', 'opcoes.js'), 'utf8');
if (!/\b(?:const|let|var) DEV = false\b/.test(opcoes)) {
  console.error('dist/ não é um build de release. Rode `npm run pacotes` (ele faz o build:release antes).');
  process.exit(1);
}

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

for (const navegador of ['firefox', 'chrome']) {
  await webExt.cmd.build(
    {
      sourceDir: join(raiz, 'dist', navegador),
      artifactsDir: destino,
      filename: `audaid-${version}-${navegador}.zip`,
      overwriteDest: true,
    },
    { shouldExitProgram: false },
  );
}

execFileSync('git', ['archive', '--format=zip', '-o', join(destino, `audaid-${version}-fonte.zip`), 'HEAD'], { cwd: raiz });

console.log(`Pacotes da versão ${version} em pacotes/: firefox, chrome e fonte.`);
