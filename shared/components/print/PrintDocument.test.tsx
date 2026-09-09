// =============================================================================
// Tests de los componentes de documento imprimible.
//
// Estos son papel que se firma: una regresión no se descubre en el navegador
// sino en la oficina, cuando el acta sale sin la columna del código o sin una
// de las tres firmas. Por eso los tests miran el contenido y la estructura de
// la tabla, no solo que el componente monte.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/shared/api/photoServer', () => ({
  getLogoUrl: () => '/logo.png',
  getPhotoUrl: (f?: string) => (f ? `/fotos/${f}` : ''),
}));

import {
  PrintDocument,
  PrintHeader,
  PrintMetaGrid,
  PrintNote,
  PrintTable,
  PrintSignatures,
} from '@/shared/components/print/PrintDocument';

describe('PrintDocument', () => {
  it('se oculta en pantalla y se marca como área de impresión', () => {
    const { container } = render(
      <PrintDocument>
        <p>contenido</p>
      </PrintDocument>,
    );

    const hoja = container.firstElementChild!;
    expect(hoja.className).toContain('hidden-on-screen');
    expect(hoja.className).toContain('print-area');
  });
});

describe('PrintHeader', () => {
  it('muestra logo, título, subtítulo y referencia', () => {
    render(<PrintHeader title="Comprobante de Préstamo" subtitle="Control de Salida Temporal" reference="ID: loan-1" />);

    expect(screen.getByRole('heading', { name: 'Comprobante de Préstamo' })).toBeTruthy();
    expect(screen.getByText('Control de Salida Temporal')).toBeTruthy();
    expect(screen.getByText('ID: loan-1')).toBeTruthy();
    expect(screen.getByAltText('Logo').getAttribute('src')).toBe('/logo.png');
  });

  it('sin subtítulo ni referencia solo muestra el título', () => {
    render(<PrintHeader title="Orden de Compra" />);

    expect(screen.getByRole('heading', { name: 'Orden de Compra' })).toBeTruthy();
    expect(screen.queryByText(/ID:/)).toBeNull();
  });

  it('acepta una columna derecha de metadatos', () => {
    render(<PrintHeader title="Acta de Asignación" meta={<p>Fecha: 2025-03-14</p>} />);

    expect(screen.getByText('Fecha: 2025-03-14')).toBeTruthy();
  });
});

describe('PrintMetaGrid', () => {
  it('dibuja cada campo con su etiqueta y su valor', () => {
    render(
      <PrintMetaGrid
        heading="Préstamo cámaras"
        fields={[
          { label: 'Solicitante', value: 'Ana Rojas' },
          { label: 'Área / Departamento', value: 'Redacción' },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Préstamo cámaras' })).toBeTruthy();
    expect(screen.getByText('Solicitante')).toBeTruthy();
    expect(screen.getByText('Ana Rojas')).toBeTruthy();
  });

  it('separa los campos a partir de la segunda fila', () => {
    // Las tres copias ponían `mt-2` a mano en unos div sí y en otros no; aquí
    // la regla es una sola y depende de la posición.
    const { container } = render(
      <PrintMetaGrid
        fields={[
          { label: 'A', value: '1' },
          { label: 'B', value: '2' },
          { label: 'C', value: '3' },
        ]}
      />,
    );

    const celdas = container.querySelectorAll('.grid > div');
    expect(celdas[0].className).not.toContain('mt-2');
    expect(celdas[1].className).not.toContain('mt-2');
    expect(celdas[2].className).toContain('mt-2');
  });
});

describe('PrintNote', () => {
  it('muestra la etiqueta y el contenido', () => {
    render(<PrintNote label="Observaciones">Devolver antes del viernes</PrintNote>);

    expect(screen.getByText('Observaciones')).toBeTruthy();
    expect(screen.getByText('Devolver antes del viernes')).toBeTruthy();
  });
});

interface Fila {
  id: string;
  nombre: string;
  codigo: string;
}

const FILAS: Fila[] = [
  { id: '1', nombre: 'Cámara Canon R6', codigo: 'CAM-99' },
  { id: '2', nombre: 'Trípode Manfrotto', codigo: 'TRI-01' },
];

const COLUMNAS = [
  { header: 'Equipo', render: (r: Fila) => r.nombre },
  { header: 'Código', cellClassName: 'font-mono', render: (r: Fila) => r.codigo },
];

describe('PrintTable', () => {
  it('dibuja una fila por elemento con todas sus columnas', () => {
    render(
      <PrintTable columns={COLUMNAS} rows={FILAS} getRowId={(r) => r.id} emptyMessage="Sin equipos." />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // cabecera + 2
    const primera = screen.getByText('Cámara Canon R6').closest('tr')!;
    expect(within(primera).getByText('CAM-99')).toBeTruthy();
  });

  it('la fila de "sin datos" ocupa todas las columnas', () => {
    // Si el colSpan no cubre la tabla entera, el acta sale con una celda
    // suelta y el borde partido.
    render(<PrintTable columns={COLUMNAS} rows={[]} getRowId={(r: Fila) => r.id} emptyMessage="Sin equipos." />);

    const celda = screen.getByText('Sin equipos.');
    expect(celda.getAttribute('colspan')).toBe('2');
  });

  it('aplica las clases propias de cada columna', () => {
    render(
      <PrintTable columns={COLUMNAS} rows={FILAS} getRowId={(r) => r.id} emptyMessage="Sin equipos." />,
    );

    expect(screen.getByText('CAM-99').className).toContain('font-mono');
  });
});

describe('PrintSignatures', () => {
  it('dibuja un bloque por firmante', () => {
    render(
      <PrintSignatures
        signers={[
          { name: 'Carlos Méndez', role: 'Entregado Por' },
          { name: 'Ana Rojas', role: 'Recibí Conforme' },
          { name: 'Luis Vaca', role: 'Responsable' },
        ]}
      />,
    );

    expect(screen.getByText('Carlos Méndez')).toBeTruthy();
    expect(screen.getByText('Recibí Conforme')).toBeTruthy();
    expect(screen.getByText('Luis Vaca')).toBeTruthy();
  });

  it('usa dos columnas cuando hay dos firmantes y tres cuando hay tres', () => {
    const { container, unmount } = render(
      <PrintSignatures signers={[{ name: 'A', role: 'r1' }, { name: 'B', role: 'r2' }]} />,
    );
    expect(container.firstElementChild!.className).toContain('grid-cols-2');
    unmount();

    const { container: c3 } = render(
      <PrintSignatures
        signers={[{ name: 'A', role: 'r1' }, { name: 'B', role: 'r2' }, { name: 'C', role: 'r3' }]}
      />,
    );
    expect(c3.firstElementChild!.className).toContain('grid-cols-3');
  });
});
