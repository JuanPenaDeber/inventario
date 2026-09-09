// =============================================================================
// Preparación global de la suite de tests (ver `test.setupFiles` en vite.config.ts).
//
// Testing Library desmonta lo renderizado después de cada test por su cuenta,
// pero solo si detecta un `afterEach` global — y este proyecto corre vitest sin
// `globals: true` a propósito (los imports explícitos hacen más obvio de dónde
// sale cada cosa). Sin este archivo, el árbol de un test seguía montado durante
// el siguiente y cualquier `getByText` fallaba con "Found multiple elements".
// =============================================================================

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom no implementa `window.print`; los tres módulos con vista de impresión
// lo llaman al pulsar "Imprimir" y sin este doble el test revienta con
// "Not implemented". Se define una vez aquí en vez de en cada archivo.
if (!window.print) {
  window.print = vi.fn();
} else {
  vi.spyOn(window, 'print').mockImplementation(() => {});
}

// Igual que arriba: jsdom no trae matchMedia y algún componente de terceros
// puede consultarlo. Devolver "no coincide" es el comportamiento neutro.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
