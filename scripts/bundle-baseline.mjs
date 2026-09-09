// =============================================================================
// Baseline del tamaño del bundle.
//
// Criterio de cierre de cada fase de la refactorización: extraer componentes no
// debe hacer crecer lo que descarga el navegador. Una extracción mal hecha —un
// import que arrastra un módulo pesado a un chunk que antes no lo tenía— no
// rompe ningún test ni ninguna pantalla; solo se nota en el tamaño.
//
//   npm run bundle:save   guarda dist/ actual como referencia
//   npm run bundle:check  compara dist/ contra la referencia
//
// Compara por *nombre lógico* de chunk (sin el hash que Vite le pone a cada
// build), porque el hash cambia en cada compilación aunque el contenido no.
// =============================================================================

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASELINE = join(ROOT, 'bundle-baseline.json');

/** Umbral de tolerancia: por debajo de esto es ruido del compilador, no una regresión. */
const TOLERANCIA_PCT = 2;

/**
 * `index-D4f8Xa2b.js` → `index.js`. El hash cambia en cada build.
 *
 * Son exactamente 8 caracteres del alfabeto base64url, que incluye `-`: por eso
 * el patrón es {8} exacto y no {8,}. Con `{8,}` y sin admitir guiones, un chunk
 * como `purchaseOrderService-Bz-T-j5G.js` no se reconocía y aparecía como
 * ELIMINADO + NUEVO en cada comparación en vez de compararse consigo mismo.
 */
const nombreLogico = (archivo) => archivo.replace(/-[A-Za-z0-9_-]{8}(\.[a-z]+)$/, '$1');

function recolectar(dir, acc = {}) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      recolectar(ruta, acc);
    } else if (/\.(js|css)$/.test(entrada)) {
      const contenido = readFileSync(ruta);
      acc[nombreLogico(entrada)] = {
        bytes: contenido.length,
        gzip: gzipSync(contenido).length,
      };
    }
  }
  return acc;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (!existsSync(DIST)) {
  console.error('No existe dist/. Corré `npm run build` primero.');
  process.exit(1);
}

const actual = recolectar(DIST);
const totalActual = Object.values(actual).reduce((a, c) => a + c.gzip, 0);

if (process.argv.includes('--save')) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ fecha: new Date().toISOString(), chunks: actual }, null, 2)}\n`,
  );
  console.log(`Baseline guardado: ${Object.keys(actual).length} chunks, ${kb(totalActual)} gzip.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('No hay baseline. Corré `npm run bundle:save` sobre una build sana.');
  process.exit(1);
}

const referencia = JSON.parse(readFileSync(BASELINE, 'utf8')).chunks;
const totalReferencia = Object.values(referencia).reduce((a, c) => a + c.gzip, 0);
const nombres = [...new Set([...Object.keys(referencia), ...Object.keys(actual)])].sort();

console.log('chunk                                        antes      ahora      dif');
console.log('─'.repeat(76));

for (const nombre of nombres) {
  const antes = referencia[nombre]?.gzip ?? 0;
  const ahora = actual[nombre]?.gzip ?? 0;
  if (antes === ahora) continue;
  const dif = ahora - antes;
  const marca = !antes ? 'NUEVO' : !ahora ? 'ELIMINADO' : `${dif > 0 ? '+' : ''}${kb(dif)}`;
  console.log(
    `${nombre.padEnd(42)} ${kb(antes).padStart(9)} ${kb(ahora).padStart(9)}  ${marca}`,
  );
}

const dif = totalActual - totalReferencia;
const pct = (dif / totalReferencia) * 100;
console.log('─'.repeat(76));
console.log(
  `total (gzip)${' '.repeat(30)} ${kb(totalReferencia).padStart(9)} ${kb(totalActual).padStart(9)}  ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
);

if (pct > TOLERANCIA_PCT) {
  console.error(
    `\nEl bundle creció ${pct.toFixed(1)}% (tolerancia ${TOLERANCIA_PCT}%). ` +
      'Revisá qué import nuevo arrastró peso a un chunk antes liviano.',
  );
  process.exit(1);
}

console.log('\nSin regresión de tamaño.');
