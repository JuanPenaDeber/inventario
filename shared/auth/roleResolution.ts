// =============================================================================
// Cómo se decide el rol de un empleado.
//
// En ese orden, y se detiene en el primero que dé resultado:
//
//   1. EspoCRM — si CRegistroEmpleados trae un campo de rol/cargo poblado
//      (Employee.rawRole, ver el mapeo en catalogService.ts), se interpreta
//      ese texto.
//   2. Tabla local por nombre — ROLE_BY_NAME de abajo. Es el plan B mientras
//      EspoCRM no tenga ese campo, o para gente que EspoCRM no cubre todavía.
//   3. DEFAULT_ROLE (CONSULTA) — nadie queda sin rol; el que no se pudo
//      resolver por ningún medio entra con el de menor privilegio.
//
// Es exactamente el mismo lugar que se va a tocar el día que haya login real:
// esta función seguiría existiendo igual, sólo que en vez de resolver el rol
// de "el empleado que alguien eligió en un desplegable" resolvería el rol de
// "el usuario autenticado". El resto de la aplicación no se entera del
// cambio, porque todos consumen `resolveRole()`, no la fuente de datos.
// =============================================================================

import { DEFAULT_ROLE, Employee, Role, ROLES } from '@/types';

/**
 * Normaliza un nombre para comparar: minúsculas, sin tildes, espacios
 * repetidos colapsados, sin espacios en los bordes. Los nombres cargados a
 * mano en EspoCRM y en esta tabla casi nunca coinciden carácter por
 * carácter — "María José" vs "Maria Jose" no debería fallar por eso.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los diacríticos (tildes, diéresis)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tabla local: nombre de empleado → rol. Es el plan B mientras EspoCRM no
 * tenga (o no tenga poblado) un campo de rol en CRegistroEmpleados.
 *
 * Las claves se comparan normalizadas (ver normalizeName), así que "Ana
 * Rojas" también matchea "ana rojas" o "Ana  Rojas". Usar el nombre TAL COMO
 * aparece en EspoCRM le sigue funcionando a cualquiera que edite esto sin
 * pensar en la normalización.
 *
 * Los tres nombres de abajo son de ejemplo — bórralos y cargá los reales.
 */
export const ROLE_BY_NAME: Record<string, Role> = {
  'Nombre Apellido (ejemplo — reemplazar)': 'ADMINISTRADOR',
  'Otro Ejemplo (reemplazar)': 'JEFE',
  'Tercer Ejemplo (reemplazar)': 'COMPRAS',
};

const NORMALIZED_ROLE_BY_NAME: Map<string, Role> = new Map(
  Object.entries(ROLE_BY_NAME).map(([name, role]) => [normalizeName(name), role]),
);

/** Busca `name` en la tabla local, normalizando de los dos lados. */
export function lookupRoleByName(name: string): Role | undefined {
  return NORMALIZED_ROLE_BY_NAME.get(normalizeName(name));
}

/**
 * Interpreta el texto crudo de un campo de rol/cargo de EspoCRM. No asume que
 * el campo tenga exactamente uno de los seis valores de `Role` — en la
 * práctica un campo de texto libre de un CRM trae cosas como "Jefe de
 * Sistemas" o "Encargado de Compras", no "JEFE" pelado. Por eso primero se
 * prueba una coincidencia exacta y después palabras clave, en un orden donde
 * lo más específico va antes que lo más genérico (ver el comentario junto a
 * cada regla).
 */
export function interpretRawRole(raw: string | undefined | null): Role | undefined {
  if (!raw || !raw.trim()) return undefined;

  const exact = raw.trim().toUpperCase() as Role;
  if ((ROLES as string[]).includes(exact)) return exact;

  const text = normalizeName(raw);

  // Administrador antes que Jefe/Sistemas/Compras: alguien puede ser
  // "Administrador de Sistemas" de cargo, y ese título es de más alcance que
  // "Sistemas" solo.
  if (/\badmin/.test(text)) return 'ADMINISTRADOR';
  // "Jefe" antes que Sistemas/Compras: cubre "Jefe de Sistemas" o "Jefe de
  // Compras" como JEFE, que es el cargo real (aprueba gente), sin importar el
  // departamento que gestione — no como SISTEMAS/COMPRAS (mantienen datos).
  if (/\bjefe\b|\bsupervisor\b|\bgerente\b/.test(text)) return 'JEFE';
  if (/\bcompras?\b/.test(text)) return 'COMPRAS';
  if (/\bsistemas?\b|\bti\b|\bsoporte\b/.test(text)) return 'SISTEMAS';
  if (/\bconsulta\b|\blectura\b|\bsolo lectura\b/.test(text)) return 'CONSULTA';
  if (/\bsolicitante\b/.test(text)) return 'SOLICITANTE';

  return undefined;
}

/**
 * Resuelve el rol de un empleado: EspoCRM primero, tabla local por nombre
 * después, CONSULTA si ninguno de los dos dio resultado.
 */
export function resolveRole(employee: Pick<Employee, 'name' | 'rawRole'>): Role {
  return (
    interpretRawRole(employee.rawRole) ??
    lookupRoleByName(employee.name) ??
    DEFAULT_ROLE
  );
}
