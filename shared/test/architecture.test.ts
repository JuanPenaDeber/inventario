// =============================================================================
// La regla de dependencias de ARCHITECTURE.md, verificada en cada `npm test`.
//
//     app/  →  features/  →  shared/  →  types/
//
// Estaba documentada pero no comprobada: nada impedía que `shared/` importara
// de `features/` por descuido, y ese es justo el error que una refactorización
// grande introduce sin querer —al mover una pieza a shared/ arrastrando un
// import que apuntaba hacia adentro de un feature.
//
// Cubre también los ciclos de importación. `madge --circular` ya lo hacía, pero
// como paso manual que hay que acordarse de correr; aquí falla solo.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const CAPAS = ['app', 'features', 'shared', 'types'] as const;

/** Todos los .ts/.tsx del proyecto, excluyendo los propios tests. */
function listarFuentes(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules' || entrada === 'dist') continue;
      listarFuentes(ruta, acc);
    } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acc.push(ruta);
    }
  }
  return acc;
}

const FUENTES = CAPAS.flatMap((capa) => listarFuentes(join(ROOT, capa)));

/** Ruta relativa al root con separadores POSIX: `features/prestamos/LoanManager.tsx`. */
const aRelativo = (absoluta: string): string => relative(ROOT, absoluta).split('\\').join('/');

/** Primer segmento de la ruta: la capa a la que pertenece el archivo. */
const capaDe = (rutaRelativa: string): string => rutaRelativa.split('/')[0];

const RE_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const RE_IMPORT_DINAMICO = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Especificadores de import de un archivo, tanto estáticos como dinámicos. */
function importsDe(absoluta: string): string[] {
  const codigo = readFileSync(absoluta, 'utf8');
  const encontrados: string[] = [];
  for (const re of [RE_IMPORT, RE_IMPORT_DINAMICO]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) encontrados.push(m[1]);
  }
  return encontrados;
}

/**
 * Convierte un especificador en la ruta del proyecto a la que apunta, o null si
 * es una dependencia externa (react, lucide-react, …).
 */
function resolverEspecificador(especificador: string, desde: string): string | null {
  let crudo: string;
  if (especificador.startsWith('@/')) {
    crudo = especificador.slice(2);
  } else if (especificador.startsWith('.')) {
    crudo = relative(ROOT, resolve(dirname(desde), especificador)).split('\\').join('/');
  } else {
    return null; // paquete de node_modules
  }
  return CAPAS.some((capa) => crudo === capa || crudo.startsWith(`${capa}/`)) ? crudo : null;
}

describe('regla de dependencias (ARCHITECTURE.md)', () => {
  it('encuentra los archivos del proyecto', () => {
    // Guarda contra un falso verde: si el listado quedara vacío por un cambio
    // de estructura, todos los tests de abajo pasarían sin comprobar nada.
    expect(FUENTES.length).toBeGreaterThan(30);
  });

  it('shared/ no importa de features/ ni de app/', () => {
    const infracciones: string[] = [];

    for (const archivo of FUENTES) {
      const rel = aRelativo(archivo);
      if (capaDe(rel) !== 'shared') continue;

      for (const esp of importsDe(archivo)) {
        const destino = resolverEspecificador(esp, archivo);
        if (!destino) continue;
        const capaDestino = capaDe(destino);
        if (capaDestino === 'features' || capaDestino === 'app') {
          infracciones.push(`${rel} → ${esp}`);
        }
      }
    }

    expect(infracciones).toEqual([]);
  });

  it('types/ no importa de ninguna otra capa', () => {
    const infracciones: string[] = [];

    for (const archivo of FUENTES) {
      const rel = aRelativo(archivo);
      if (capaDe(rel) !== 'types') continue;

      for (const esp of importsDe(archivo)) {
        const destino = resolverEspecificador(esp, archivo);
        if (destino && capaDe(destino) !== 'types') {
          infracciones.push(`${rel} → ${esp}`);
        }
      }
    }

    expect(infracciones).toEqual([]);
  });

  it('features/ no importa de app/', () => {
    const infracciones: string[] = [];

    for (const archivo of FUENTES) {
      const rel = aRelativo(archivo);
      if (capaDe(rel) !== 'features') continue;

      for (const esp of importsDe(archivo)) {
        const destino = resolverEspecificador(esp, archivo);
        if (destino && capaDe(destino) === 'app') {
          infracciones.push(`${rel} → ${esp}`);
        }
      }
    }

    expect(infracciones).toEqual([]);
  });

  it('no hay dependencias circulares', () => {
    // Grafo dirigido archivo → archivos que importa, resuelto a rutas sin
    // extensión para que `@/types` y `types/index.tsx` sean el mismo nodo.
    const sinExtension = (r: string): string => r.replace(/\.tsx?$/, '').replace(/\/index$/, '');
    const grafo = new Map<string, string[]>();

    for (const archivo of FUENTES) {
      const origen = sinExtension(aRelativo(archivo));
      const destinos = importsDe(archivo)
        .map((esp) => resolverEspecificador(esp, archivo))
        .filter((d): d is string => d !== null)
        .map(sinExtension);
      grafo.set(origen, [...(grafo.get(origen) ?? []), ...destinos]);
    }

    const ciclos: string[] = [];
    const estado = new Map<string, 'visitando' | 'listo'>();

    const recorrer = (nodo: string, camino: string[]): void => {
      if (estado.get(nodo) === 'listo') return;
      if (estado.get(nodo) === 'visitando') {
        ciclos.push([...camino.slice(camino.indexOf(nodo)), nodo].join(' → '));
        return;
      }
      estado.set(nodo, 'visitando');
      for (const vecino of grafo.get(nodo) ?? []) recorrer(vecino, [...camino, nodo]);
      estado.set(nodo, 'listo');
    };

    for (const nodo of grafo.keys()) recorrer(nodo, []);

    expect(ciclos).toEqual([]);
  });
});
