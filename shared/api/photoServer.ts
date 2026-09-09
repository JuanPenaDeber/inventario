// =============================================================================
// Servidor de fotos — un servicio HTTP aparte de EspoCRM (solo sirve/recibe
// imágenes de equipos y el logo institucional). Antes su dirección vivía
// repetida como literal en 6 archivos distintos; ahora es un solo lugar para
// cambiarla si el servidor se muda de IP.
// =============================================================================

export const PHOTOS_BASE_URL = import.meta.env.VITE_PHOTOS_BASE_URL ?? 'http://172.20.16.38';

export type PhotoSize = 'pequena' | 'mediana';

/**
 * URL completa para mostrar la foto de un equipo, o `undefined` si no tiene.
 *
 * `foto` puede venir como:
 * - Un nombre de archivo simple (`foto_123.jpg`) subido a este servidor -> se
 *   arma la URL completa con el tamaño pedido.
 * - Una URL/data-URL ya completa (ej. si la subida al servidor de fotos
 *   falló y se guardó el base64 tal cual — ver `uploadInventoryImage` en
 *   inventoryService.ts) -> se usa tal cual, sin tocar.
 */
export function getPhotoUrl(foto: string | undefined | null, size: PhotoSize): string | undefined {
  if (!foto) return undefined;
  if (foto.includes('/')) return foto;
  return `${PHOTOS_BASE_URL}/fotos/uploads/${size}/${foto}`;
}

/** Logo institucional usado en los encabezados de impresión (préstamos, asignaciones, órdenes). */
export function getLogoUrl(): string {
  return `${PHOTOS_BASE_URL}/fotos/edlogo.png`;
}

/** Endpoint al que se sube la foto de un equipo (ver uploadInventoryImage). */
export function getPhotoUploadUrl(fileName: string): string {
  return `${PHOTOS_BASE_URL}/fotos/index.php?filename=${fileName}`;
}
