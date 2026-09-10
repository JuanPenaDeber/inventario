// Re-exporta todos los dominios de tipos desde un solo punto de entrada, para
// que `import { X } from '../types'` siga funcionando sin cambios en ningún
// componente/servicio existente. Antes vivían todos juntos en un único
// types.ts de ~300 líneas para 9 dominios; ahora cada dominio tiene su
// propio archivo, más fácil de ubicar y de revisar en un diff.
export * from './auth';
export * from './common';
export * from './inventory';
export * from './loans';
export * from './assignments';
export * from './purchaseOrders';
export * from './purchaseRequests';
export * from './proformas';
export * from './suggestions';
export * from './app';
