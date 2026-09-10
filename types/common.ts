export interface MovementHistory {
  date: string;
  action: 'CREADO' | 'ACTUALIZADO' | 'ASIGNADO' | 'MANTENIMIENTO' | 'RETIRADO' | 'PRESTADO' | 'DESAPARECIDO' | 'DEVUELTO' | 'DEVOLUCION_PARCIAL' | 'DES_ASIGNADO';
  user: string;
  details: string;
}

export interface Provider {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
}

export interface Employee {
  id: string;
  name: string;
  equipo: string;
  /**
   * Rol crudo tal como llega de EspoCRM, si CRegistroEmpleados tiene un campo
   * para eso (ver el mapeo en catalogService.ts, que prueba varios nombres de
   * campo posibles). No siempre está poblado — cuando falta, `resolveRole()`
   * en shared/auth/roleResolution.ts sigue con la tabla local por nombre.
   */
  rawRole?: string;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}
