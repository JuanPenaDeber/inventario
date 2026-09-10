// =============================================================================
// Tests de ErrorBoundary.
//
// Es la red de seguridad de toda la aplicación y tenía 0% de cobertura: nadie
// había comprobado que atrape de verdad un error de render, ni que la variante
// `compact` —la que se usa por módulo en App.tsx— deje algo utilizable
// alrededor en vez de tapar la pantalla entera.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '@/shared/components/ErrorBoundary';

/** Componente que revienta al montar, para forzar el camino de error. */
const Bomb: React.FC = () => {
  throw new Error('boom de prueba');
};

// React deja un rastro largo en consola cuando un boundary atrapa un error
// (es el comportamiento esperado, no un fallo del test) — se silencia acá
// para no ensuciar la salida, y se restaura después de cada test.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('deja pasar los hijos cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <p>contenido normal</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('contenido normal')).toBeTruthy();
  });

  it('atrapa un error de render y muestra la pantalla de aviso en vez de una pantalla en blanco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Ocurrió un error inesperado')).toBeTruthy();
    // El mensaje técnico queda visible: es lo primero que alguien va a
    // copiar y pegar para reportar el problema.
    expect(screen.getByText('boom de prueba')).toBeTruthy();
  });

  it('el modo compact usa el texto que dice "segui usando el resto de la app"', () => {
    // Es la variante que envuelve cada módulo en App.tsx. El texto por
    // defecto ("La pantalla no se pudo mostrar") no aplica ahí: sólo un
    // módulo falló, no la pantalla entera.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary compact>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Este módulo no se pudo mostrar')).toBeTruthy();
    expect(screen.getByText(/resto de la aplicación desde el menú/)).toBeTruthy();
  });

  it('el modo compact no reserva la pantalla completa: deja lugar para la barra de arriba', () => {
    // Es la razón de ser de `compact`: sin esto, un error en un módulo tapaba
    // la navegación y la única salida era recargar toda la página. Se
    // verifica por ausencia de la clase que reserva el alto de la pantalla.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <ErrorBoundary compact>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(container.querySelector('.min-h-screen')).toBeNull();
  });

  it('el modo normal (sin compact) sí reserva la pantalla completa', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(container.querySelector('.min-h-screen')).toBeTruthy();
  });

  it('ofrece un botón para recargar la página', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /Recargar la página/i })).toBeTruthy();
  });

  it('en modo compact, el botón NO recarga toda la página (solo reintenta ese módulo)', async () => {
    // Regresión real: el botón de compact hacía window.location.reload() como
    // el de pantalla completa, pese a que el texto de al lado promete que se
    // puede seguir usando el resto de la app — un reload completo le borraba
    // el estado a los demás módulos igual.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    const user = userEvent.setup();
    render(
      <ErrorBoundary compact>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /Reintentar este módulo/i }));

    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('en modo normal (sin compact), el botón sí recarga toda la página', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: /Recargar la página/i }));

    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('un hermano que no falla no se ve afectado por el que sí falla', () => {
    // Cada módulo de App.tsx tiene su PROPIO boundary — este test fija que
    // dos boundaries independientes no se interfieren entre sí.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <>
        <ErrorBoundary compact>
          <Bomb />
        </ErrorBoundary>
        <ErrorBoundary compact>
          <p>módulo sano</p>
        </ErrorBoundary>
      </>,
    );

    expect(screen.getByText('Este módulo no se pudo mostrar')).toBeTruthy();
    expect(screen.getByText('módulo sano')).toBeTruthy();
  });
});
