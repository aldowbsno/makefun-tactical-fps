// Package Neon Breach as static files and the official, deterministic dossier.
// Run locally with MAKEFUN_OUTPUT_DIR=/tmp/neon-breach-output node main.ts.
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repository = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Validate the repository first; the gate requires at least three game renders.
const screenshots = readdirSync(join(repository, 'screenshots'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'));
if (screenshots.length < 3) throw new Error('screenshots/ must contain 3 or 4 game renders');
buildDossier(repository, caps);

mkdirSync(output, { recursive: true });
for (const directory of ['game', 'screenshots']) {
  cpSync(join(repository, directory), join(output, directory), { recursive: true });
}

// Build from the copied files: these exact bytes are what the gate recomputes.
const dossier = buildDossier(output, caps);
if (dossier.byteLength > 1572864) throw new Error('dossier.json exceeds the gate limit of 1.5 MiB');
writeFileSync(join(output, 'dossier.json'), dossier);
