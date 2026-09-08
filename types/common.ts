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
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}
