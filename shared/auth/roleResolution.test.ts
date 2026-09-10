// =============================================================================
// Tests de resolveRole() y sus piezas.
//
// Es la lógica que más silenciosamente puede fallar de todo este sistema: si
// normalizeName() no matchea un nombre por una tilde de más, o si
// interpretRawRole() no reconoce "Jefe de Sistemas" como JEFE, el síntoma no
// es un error — es que alguien queda con CONSULTA sin que nadie se entere de
// por qué. Por eso se prueba cada capa por separado.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  lookupRoleByName,
  interpretRawRole,
  resolveRole,
} from '@/shared/auth/roleResolution';

describe('normalizeName', () => {
  it('quita tildes y diéresis', () => {
    expect(normalizeName('María José Núñez')).toBe('maria jose nunez');
  });

  it('pasa a minúsculas', () => {
    expect(normalizeName('ANA ROJAS')).toBe('ana rojas');
  });

  it('recorta espacios en los bordes y colapsa los del medio', () => {
    expect(normalizeName('  Ana   Rojas  ')).toBe('ana rojas');
  });

  it('dos formas distintas del mismo nombre normalizan igual', () => {
    expect(normalizeName('José Pérez')).toBe(normalizeName('Jose Perez'));
  });
});

describe('lookupRoleByName', () => {
  it('encuentra un nombre cargado tal cual', () => {
    // Usa la tabla de ejemplo tal como queda en el archivo — si alguien la
    // reemplaza por nombres reales, hay que reemplazar también estos tests.
    expect(lookupRoleByName('Nombre Apellido (ejemplo — reemplazar)')).toBe('ADMINISTRADOR');
  });

  it('encuentra el mismo nombre con distinta capitalización y espaciado', () => {
    expect(lookupRoleByName('  nombre   apellido (EJEMPLO — reemplazar)  ')).toBe('ADMINISTRADOR');
  });

  it('un nombre que no está en la tabla no devuelve nada', () => {
    expect(lookupRoleByName('Persona Que No Existe')).toBeUndefined();
  });
});

describe('interpretRawRole', () => {
  it('un valor exacto de Role se reconoce tal cual', () => {
    expect(interpretRawRole('JEFE')).toBe('JEFE');
    expect(interpretRawRole('compras')).toBe('COMPRAS'); // sin importar mayúsculas
  });

  it('reconoce cargos con texto alrededor de la palabra clave', () => {
    expect(interpretRawRole('Jefe de Sistemas')).toBe('JEFE');
    expect(interpretRawRole('Encargado de Compras')).toBe('COMPRAS');
    expect(interpretRawRole('Analista de Sistemas')).toBe('SISTEMAS');
  });

  it('"Administrador de Sistemas" es ADMINISTRADOR, no SISTEMAS', () => {
    // El cargo de más alcance gana: la regla de "admin" se evalúa antes que
    // la de "sistemas" a propósito (ver el comentario en el código).
    expect(interpretRawRole('Administrador de Sistemas')).toBe('ADMINISTRADOR');
  });

  it('"Jefe de Compras" es JEFE, no COMPRAS', () => {
    // Regresión real: la regla de "compras" se evaluaba antes que la de
    // "jefe", así que cualquier jefatura de Compras (o Sistemas) perdía el
    // rol que aprueba gente y quedaba con el rol de línea del departamento.
    expect(interpretRawRole('Jefe de Compras')).toBe('JEFE');
    expect(interpretRawRole('Gerente de Compras')).toBe('JEFE');
    expect(interpretRawRole('Supervisor de Sistemas')).toBe('JEFE');
  });

  it('vacío, null o undefined no resuelven nada', () => {
    expect(interpretRawRole('')).toBeUndefined();
    expect(interpretRawRole('   ')).toBeUndefined();
    expect(interpretRawRole(null)).toBeUndefined();
    expect(interpretRawRole(undefined)).toBeUndefined();
  });

  it('un texto sin ninguna palabra clave reconocible no resuelve nada', () => {
    expect(interpretRawRole('Fotógrafo')).toBeUndefined();
  });
});

describe('resolveRole', () => {
  it('EspoCRM (rawRole) gana sobre la tabla local', () => {
    // "Otro Ejemplo (reemplazar)" está en ROLE_BY_NAME como JEFE, pero acá
    // EspoCRM dice COMPRAS — y EspoCRM tiene que ganar.
    expect(
      resolveRole({ name: 'Otro Ejemplo (reemplazar)', rawRole: 'Compras' }),
    ).toBe('COMPRAS');
  });

  it('sin rawRole, cae a la tabla local por nombre', () => {
    expect(resolveRole({ name: 'Otro Ejemplo (reemplazar)' })).toBe('JEFE');
  });

  it('sin rawRole y sin match en la tabla, cae a CONSULTA', () => {
    expect(resolveRole({ name: 'Alguien Sin Rol Asignado' })).toBe('CONSULTA');
  });

  it('un rawRole con texto irreconocible también cae a la tabla local', () => {
    // "Otro Ejemplo (reemplazar)" en EspoCRM viene con un cargo que no dice
    // nada reconocible ("Fotógrafo") — no debería ganarle a la tabla local
    // sólo por estar presente; interpretRawRole ya devuelve undefined en ese
    // caso, y resolveRole sigue la cadena.
    expect(
      resolveRole({ name: 'Otro Ejemplo (reemplazar)', rawRole: 'Fotógrafo' }),
    ).toBe('JEFE');
  });
});
