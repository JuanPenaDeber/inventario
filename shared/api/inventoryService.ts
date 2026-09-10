// =============================================================================
// NOTA DE ARQUITECTURA — por qué este servicio maneja errores distinto a
// incidentsService.ts / purchaseOrderService.ts / purchaseRequestService.ts /
// proformaService.ts / suggestionService.ts:
//
// Este archivo (Inventario, Préstamos, Asignaciones, Proveedores, Empleados)
// atrapa cualquier fallo de red y devuelve datos de respaldo (MOCK_*) o
// null/valores parciales en vez de lanzar una excepción — es el módulo más
// usado a diario, y una caída momentánea de EspoCRM no debe dejar al usuario
// sin poder ver siquiera el inventario.
//
// Los servicios de Compras (Fase 1-4) hacen lo opuesto a propósito: lanzan el
// error y lo muestran en un banner explícito. Ahí ocultar el fallo sería
// peor — una aprobación, una proforma o una orden de compra que "parece"
// haberse guardado pero en realidad no llegó a EspoCRM es un problema mucho
// más serio que ver un mensaje de error.
//
// Es una diferencia intencional según el costo de cada error, no un
// descuido de consistencia entre archivos.
// =============================================================================
//
// ESTE ARCHIVO ES SOLO LA ENTRADA PÚBLICA. El contenido se dividió por dominio
// —eran cuatro conviviendo en 755 líneas— y se reexporta desde aquí para que
// los diez consumidores no tengan que cambiar de import a la vez:
//
//   inventoryClient.ts     fetch, paginación, caché, mocks (uso interno)
//   catalogService.ts      equipos, proveedores, empleados
//   loanService.ts         préstamos
//   assignmentService.ts   asignaciones
//
// Al tocar un módulo conviene apuntar su import al archivo concreto.

export {
    InventoryApiError,
    PartialWriteError,
    getInventoryErrorMessage,
    invalidateCache,
    uploadInventoryImage,
} from '@/shared/api/inventoryClient';

export {
    getInventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    unassignInventoryItem,
    getProviders,
    addProvider,
    deleteProvider,
    getEmployees,
    addEmployee,
} from '@/shared/api/catalogService';

export {
    getLoans,
    getLoanItems,
    createLoanItems,
    removeLoanItems,
    createLoan,
    updateLoan,
    returnLoanItems,
} from '@/shared/api/loanService';

export {
    getAssignments,
    getAssignmentItems,
    deleteAssignmentItems,
    removeAssignmentItems,
    createAssignmentEquipo,
    createAssignment,
    createAssignmentWithItems,
    updateAssignment,
} from '@/shared/api/assignmentService';
