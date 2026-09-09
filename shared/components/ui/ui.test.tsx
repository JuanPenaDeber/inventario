// =============================================================================
// Tests de los primitivos de UI.
//
// Dos cosas que importan más de lo que parece:
//
// 1. Que las clases de Tailwind sean literales completas. Si alguien "mejora"
//    accents.ts armando `focus:ring-${accent}-500`, el código compila, el test
//    de render pasa, y la clase simplemente no existe en el CSS: el anillo de
//    foco desaparece en producción sin ningún error. El último test de este
//    archivo es la única red contra eso.
// 2. Que los controles no se traguen props (name, required, disabled…), que es
//    el error clásico al envolver un <input> nativo.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Field, Input, Select, Textarea, ReadOnlyInput, controlClass } from '@/shared/components/ui/Field';
import { StatusChip } from '@/shared/components/ui/StatusChip';
import { LoadingState, EmptyState, NoSelection, ErrorBanner } from '@/shared/components/ui/States';
import { FOCUS_RING, SOLID_BUTTON, SELECTED_ROW, SELECTED_TITLE, ICON_TINT } from '@/shared/components/ui/accents';

describe('Field', () => {
  it('asocia la etiqueta con el control', () => {
    render(
      <Field label="Referencia" htmlFor="ref">
        <Input id="ref" />
      </Field>,
    );

    expect(screen.getByLabelText('Referencia')).toBeTruthy();
  });

  it('marca los campos obligatorios', () => {
    render(
      <Field label="Proveedor" required>
        <Input />
      </Field>,
    );

    expect(screen.getByText('*')).toBeTruthy();
  });

  it('muestra el error y esconde la ayuda cuando hay error', () => {
    render(
      <Field label="Cantidad" error="Debe ser mayor a cero" hint="Unidades enteras">
        <Input />
      </Field>,
    );

    expect(screen.getByText('Debe ser mayor a cero')).toBeTruthy();
    // Apilar error y ayuda deja dos líneas compitiendo bajo el mismo campo.
    expect(screen.queryByText('Unidades enteras')).toBeNull();
  });

  it('muestra la ayuda cuando no hay error', () => {
    render(
      <Field label="Cantidad" hint="Unidades enteras">
        <Input />
      </Field>,
    );

    expect(screen.getByText('Unidades enteras')).toBeTruthy();
  });
});

describe('controles', () => {
  it('Input propaga las props nativas', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="Ej: OC-2025-001" name="reference" required onChange={onChange} />);

    const input = screen.getByPlaceholderText('Ej: OC-2025-001') as HTMLInputElement;
    expect(input.name).toBe('reference');
    expect(input.required).toBe(true);

    await user.type(input, 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('Select renderiza sus opciones y respeta el valor', () => {
    render(
      <Select value="BOB" onChange={() => {}} aria-label="Moneda">
        <option value="BOB">BOB</option>
        <option value="USD">USD</option>
      </Select>,
    );

    expect((screen.getByLabelText('Moneda') as HTMLSelectElement).value).toBe('BOB');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('Textarea propaga rows', () => {
    render(<Textarea rows={5} aria-label="Observaciones" />);

    expect((screen.getByLabelText('Observaciones') as HTMLTextAreaElement).rows).toBe(5);
  });

  it('ReadOnlyInput es de solo lectura siempre', () => {
    // `readOnly` se fuerza dentro del componente: es su razón de existir, y
    // permitir sobreescribirlo lo convertiría en un Input normal por accidente.
    render(<ReadOnlyInput value="Redacción" aria-label="Departamento" onChange={() => {}} />);

    expect((screen.getByLabelText('Departamento') as HTMLInputElement).readOnly).toBe(true);
  });

  it('controlClass cambia el anillo de foco según el acento', () => {
    expect(controlClass('teal')).toContain('focus:ring-teal-500');
    expect(controlClass('orange')).toContain('focus:ring-orange-500');
    expect(controlClass('cyan', 'sm')).toContain('text-sm');
  });
});

describe('StatusChip', () => {
  it('traduce los guiones bajos a espacios', () => {
    render(<StatusChip status="PENDIENTE_APROBACION" tone="text-amber-600" />);

    expect(screen.getByText('PENDIENTE APROBACION')).toBeTruthy();
  });

  it('aplica el tono del dominio que recibe', () => {
    render(<StatusChip status="APROBADA" tone="text-emerald-600 border-emerald-300" />);

    expect(screen.getByText('APROBADA').className).toContain('text-emerald-600');
  });
});

describe('estados', () => {
  it('LoadingState y EmptyState muestran su mensaje', () => {
    const { unmount } = render(<LoadingState message="Cargando órdenes..." />);
    expect(screen.getByText('Cargando órdenes...')).toBeTruthy();
    unmount();

    render(<EmptyState message="No hay órdenes de compra registradas." />);
    expect(screen.getByText('No hay órdenes de compra registradas.')).toBeTruthy();
  });

  it('NoSelection dibuja el icono junto al mensaje', () => {
    const Icono = () => <svg data-testid="icono" />;
    render(<NoSelection icon={Icono} message="Selecciona una orden para ver el detalle" />);

    expect(screen.getByTestId('icono')).toBeTruthy();
    expect(screen.getByText('Selecciona una orden para ver el detalle')).toBeTruthy();
  });

  it('ErrorBanner ofrece reintentar y cerrar solo si le dan los callbacks', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    render(<ErrorBanner message="No se pudo cargar." onRetry={onRetry} onDismiss={onDismiss} />);

    // role="alert" para que un lector de pantalla lo anuncie sin tener que
    // buscarlo: es un error que aparece de golpe.
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.click(screen.getByText('Reintentar'));
    await user.click(screen.getByLabelText('Cerrar aviso'));

    expect(onRetry).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('ErrorBanner sin callbacks no muestra botones', () => {
    render(<ErrorBanner message="No se pudo cargar." />);

    expect(screen.queryByText('Reintentar')).toBeNull();
    expect(screen.queryByLabelText('Cerrar aviso')).toBeNull();
  });
});

describe('accents.ts', () => {
  it('todos los mapas cubren los mismos acentos', () => {
    const claves = Object.keys(FOCUS_RING).sort();
    for (const mapa of [SOLID_BUTTON, SELECTED_ROW, SELECTED_TITLE, ICON_TINT]) {
      expect(Object.keys(mapa).sort()).toEqual(claves);
    }
  });

  it('no arma ninguna clase de Tailwind por interpolación', () => {
    // Tailwind escanea el código fuente: una clase construida en runtime no
    // llega al CSS y el estilo desaparece en silencio, sin romper ningún test
    // de render. Por eso se comprueba el archivo, no el comportamiento.
    const fuente = readFileSync(join(__dirname, 'accents.ts'), 'utf8');
    // Se quitan los comentarios antes de mirar: la cabecera del archivo cita
    // justamente el patrón prohibido como ejemplo de lo que no hay que hacer.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const interpolaciones = codigo.match(/`[^`]*\$\{[^}]*\}[^`]*`/g) ?? [];

    expect(interpolaciones).toEqual([]);
  });
});
