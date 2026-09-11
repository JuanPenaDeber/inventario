// =============================================================================
// Estado y acciones del módulo de Asignaciones.
//
// Separado del componente para que AssignmentManager.tsx quede como lo que es:
// un orquestador que decide qué pantalla mostrar. Aquí vive todo lo que hay que
// entender para modificar el comportamiento —qué se pide al servidor, qué pasa
// al guardar, qué campos tiene el formulario— sin tener que leer JSX.
//
// No se parte en varios hooks a propósito: el formulario, el detalle y la lista
// comparten estado real (al editar, el formulario se rellena con los equipos
// que ya cargó el detalle), y trocearlo obligaría a pasarse datos entre hooks.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Assignment, InventoryItem } from '@/types';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';
import {
  createAssignmentWithItems,
  getAssignmentItems,
  getAssignments,
  getInventory,
  getInventoryErrorMessage,
  PartialWriteError,
  unassignInventoryItem,
  updateAssignment,
  updateInventoryItem,
} from '@/shared/api/inventoryService';
import { downloadXlsx, formatDate, isWithinDateRange, rangeSuffix, today } from '@/shared/utils/reportUtils';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { useItemSelection } from '@/shared/hooks/useItemSelection';
import { matchesItemSearch } from '@/shared/components/ItemPicker';
import type { ConfirmDialogState } from '@/shared/components/ConfirmDialog';

export type AssignmentViewMode = 'dashboard' | 'form';

export function useAssignmentManager() {
  // "Quién soy" ya trae y cachea la lista de empleados para toda la app —
  // este hook usaba tener su propia copia, pedida por separado.
  const { can, employees } = useCurrentUser();
  // Antes cualquier rol podía crear o editar una asignación — no había
  // ningún control. assignment.create/assignment.edit en permissions.ts ya
  // lo limitan a SISTEMAS/ADMINISTRADOR.
  const canCreateAssignment = can('assignment.create');
  const canEditAssignment = can('assignment.edit');
  // Antes no había ningún botón que desasigne un equipo (dejarlo "sin dueño"
  // en Inventario sin borrar el acta ni reasignarlo a otra persona) — la
  // función de servicio (unassignInventoryItem) y el permiso ya existían,
  // pero no estaban conectados a ninguna pantalla.
  const canUnassignItem = can('inventory.unassign');
  const [viewMode, setViewMode] = useState<AssignmentViewMode>('dashboard');

  const {
    data: { assignments, inventory },
    loading,
    refresh: refreshData,
  } = useAsyncData<{ assignments: Assignment[]; inventory: InventoryItem[] }>(
    async () => {
      const [aData, iData] = await Promise.all([getAssignments(), getInventory()]);
      return { assignments: aData, inventory: iData };
    },
    { assignments: [], inventory: [] },
    { errorMessage: 'No se pudieron cargar las asignaciones.' },
  );

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  // Equipos de la asignación abierta en el detalle.
  const [currentAssignmentItems, setCurrentAssignmentItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Distinto de `loading` (carga de datos): marca un guardado en curso.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  // --- Formulario ---
  const [isEditing, setIsEditing] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [equipo, setEquipo] = useState('');
  const [fecha, setFecha] = useState('');
  const [authorizerId, setAuthorizerId] = useState('');
  const [authorizerName, setAuthorizerName] = useState('');
  const [description, setDescription] = useState('');
  const [observacion, setObservacion] = useState('');

  const {
    selectedIds: selectedItemIds,
    toggle: toggleItemSelection,
    replace: replaceSelectedItems,
    clear: clearSelectedItems,
  } = useItemSelection();

  const [itemSearch, setItemSearch] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  // Filtro por fecha de asignación (vacío = sin filtrar).
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Trae los equipos cada vez que cambia la asignación seleccionada.
  useEffect(() => {
    let cancelled = false;
    const fetchItems = async () => {
      if (selectedAssignmentId) {
        setLoadingItems(true);
        const items = await getAssignmentItems(selectedAssignmentId);
        // Sin esto, seleccionar rápido la asignación A y después la B puede
        // dejar en pantalla los equipos de A si su respuesta llega después
        // que la de B.
        if (cancelled) return;
        setCurrentAssignmentItems(items);
        setLoadingItems(false);
      } else {
        setCurrentAssignmentItems([]);
        // Sin esto, deseleccionar mientras una carga anterior sigue en
        // vuelo dejaba loadingItems en `true` para siempre: el efecto
        // anterior se cancela y ya no llega a apagarlo (guardado por
        // `cancelled`), y esta rama tampoco lo tocaba.
        setLoadingItems(false);
      }
    };
    fetchItems();
    return () => {
      cancelled = true;
    };
  }, [selectedAssignmentId]);

  // Asignaciones ofrece todo el inventario: a diferencia de Préstamos, aquí no
  // hay regla de disponibilidad, solo la búsqueda.
  const availableItems = useMemo(
    () => inventory.filter((i) => matchesItemSearch(i, itemSearch)),
    [inventory, itemSearch],
  );

  const filteredAssignments = useMemo(() => {
    const q = assignmentSearch.toLowerCase();
    return assignments
      .filter((a) => {
        const matchesSearch =
          (a.employeeName ? a.employeeName.toLowerCase().includes(q) : false) ||
          (a.equipo ? a.equipo.toLowerCase().includes(q) : false);
        const matchesDate = isWithinDateRange(a.fecha, startDate, endDate);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [assignments, assignmentSearch, startDate, endDate]);

  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedAssignmentId),
    [assignments, selectedAssignmentId],
  );

  const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setEmployeeId(id);
    const emp = employees.find((x) => x.id === id);
    if (emp) {
      setEmployeeName(emp.name);
      setEquipo(emp.equipo);
    }
  };

  const handleAuthorizerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setAuthorizerId(id);
    const emp = employees.find((x) => x.id === id);
    if (emp) setAuthorizerName(emp.name);
  };

  const resetForm = () => {
    setEmployeeId('');
    setEmployeeName('');
    setEquipo('');
    setName('');
    // Por defecto, hoy en hora local — el campo ahora es `required` y
    // editable de verdad (antes parecía autocompletado por estilo, pero no
    // lo estaba ni tenía valor por defecto).
    setFecha(today());
    setAuthorizerId('');
    setAuthorizerName('');
    setDescription('');
    setObservacion('');
    clearSelectedItems();
    setIsEditing(false);
    setFormId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing ? !canEditAssignment : !canCreateAssignment) return;
    if (selectedItemIds.size === 0) {
      alert('Seleccione al menos un equipo.');
      return;
    }

    setSaving(true);
    const data = {
      name,
      employeeId,
      employeeName,
      equipo, // el servicio lo mapea a 'area'
      authorizerId,
      authorizerName,
      fecha,
      observacion,
      description,
      itemIds: Array.from(selectedItemIds) as string[],
    };

    try {
      if (isEditing && formId) {
        await updateAssignment(formId, data);

        // Los equipos se actualizan explícitamente para que apunten al empleado
        // correcto: actualizar solo la cabecera dejaba el inventario apuntando
        // al empleado anterior. La asignación en sí ya quedó bien: si esto
        // falla, se avisa qué exactamente no se sincronizó, en vez de reportar
        // el guardado entero como fallido.
        try {
          await Promise.all(
            data.itemIds.map((itemId) =>
              updateInventoryItem(itemId, {
                assignedEmployeeId: data.employeeId,
                assignedEmployeeName: data.employeeName,
              }),
            ),
          );
        } catch (err) {
          throw new PartialWriteError(
            `La asignación "${data.name || formId}" se actualizó, pero no se pudo poner al día el ` +
            `responsable en el inventario de todos sus equipos. Verifica manualmente los equipos de ` +
            `la asignación ${formId}.`,
            { cause: err },
          );
        }

        const updatedItems = await getAssignmentItems(formId);
        setCurrentAssignmentItems(updatedItems);
        setSelectedAssignmentId(formId);
      } else {
        // createAssignmentWithItems ya cubre cabecera + vínculo de equipos con
        // su propio aviso de desincronización (ver assignmentService.ts). Acá
        // solo falta el responsable en el inventario, que es un paso aparte.
        const newAssignment = await createAssignmentWithItems(data);
        try {
          await Promise.all(
            data.itemIds.map((itemId) =>
              updateInventoryItem(itemId, {
                assignedEmployeeId: data.employeeId,
                assignedEmployeeName: data.employeeName,
              }),
            ),
          );
        } catch (err) {
          throw new PartialWriteError(
            `La asignación "${data.name || newAssignment.id}" y sus equipos se guardaron, pero no se ` +
            `pudo actualizar el responsable en el inventario de todos los equipos. Verifica ` +
            `manualmente los equipos de la asignación ${newAssignment.id}.`,
            { cause: err },
          );
        }
        setSelectedAssignmentId(newAssignment.id);
      }

      resetForm();
      await refreshData();
      setViewMode('dashboard');
    } catch (err) {
      setSaveError(getInventoryErrorMessage(err, 'No se pudo guardar la asignación.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = async () => {
    if (!selectedAssignment || !canEditAssignment) return;
    setIsEditing(true);
    setFormId(selectedAssignment.id);

    if (selectedAssignment.employeeId) {
      setEmployeeId(selectedAssignment.employeeId);
    } else {
      // Asignaciones viejas guardaban solo el nombre, sin el id del empleado.
      const found = employees.find((e) => e.name === selectedAssignment.employeeName);
      if (found) setEmployeeId(found.id);
    }

    setEmployeeName(selectedAssignment.employeeName);
    setName(selectedAssignment.name);
    setEquipo(selectedAssignment.equipo);
    setAuthorizerId(selectedAssignment.authorizerId || '');
    setAuthorizerName(selectedAssignment.authorizerName || '');
    setDescription(selectedAssignment.description || '');
    setObservacion(selectedAssignment.observacion || '');
    // <input type="date"> solo acepta YYYY-MM-DD exacto — igual que
    // useLoanManager.handleEditStart. Si EspoCRM devuelve la fecha con hora
    // (datetime completo en vez de solo fecha), asignarla tal cual dejaba el
    // campo vacío en el navegador pese a que el estado de React sí tenía un
    // valor — y ahora que el campo es `required`, eso bloquea el guardado
    // sin ningún aviso visible de por qué.
    setFecha(
      selectedAssignment.fecha
        ? new Date(selectedAssignment.fecha).toISOString().slice(0, 10)
        : '',
    );

    // Reusa los equipos que el detalle ya trajo, en vez de volver a pedirlos.
    replaceSelectedItems(currentAssignmentItems.map((i) => i.id));

    setViewMode('form');
  };

  const handlePrint = () => {
    if (selectedAssignment) setTimeout(() => window.print(), 100);
  };

  const doUnassignItem = async (item: InventoryItem) => {
    setConfirmState(null);
    setSaveError(null);
    try {
      await unassignInventoryItem(item.id);
      // El acta no cambia (sigue existiendo), pero el equipo ya no figura
      // asignado a este empleado en Inventario — se refleja acá recargando
      // los equipos del detalle abierto.
      if (selectedAssignmentId) {
        const items = await getAssignmentItems(selectedAssignmentId);
        setCurrentAssignmentItems(items);
      }
    } catch (err) {
      setSaveError(getInventoryErrorMessage(err, 'No se pudo desasignar el equipo.'));
    }
  };

  const handleUnassignItem = (item: InventoryItem) => {
    if (!canUnassignItem) return;
    setConfirmState({
      title: 'Desasignar equipo',
      message: `¿Desasignar "${item.name}"? Queda sin responsable en Inventario, pero el acta de esta asignación no se modifica.`,
      tone: 'danger',
      confirmLabel: 'Desasignar',
      onConfirm: () => doUnassignItem(item),
    });
  };

  /** Exporta a Excel (.xlsx) las asignaciones que se están mostrando. */
  const handleExportAssignments = async () => {
    const header = [
      'ID',
      'Empleado',
      'Área / Equipo',
      'Fecha',
      'Autorizado por',
      'Nº de equipos',
      'Descripción',
    ];
    const rows = filteredAssignments.map((a) => [
      a.id,
      a.employeeName || '',
      a.equipo || '',
      formatDate(a.fecha),
      a.authorizerName || '',
      a.itemIds ? a.itemIds.length : 0,
      a.description || '',
    ]);
    await downloadXlsx(
      `asignaciones_${rangeSuffix(startDate, endDate)}.xlsx`,
      'Asignaciones',
      [header, ...rows],
      [20, 26, 22, 14, 24, 14, 35],
    );
  };

  return {
    // vista
    viewMode,
    setViewMode,
    // datos
    assignments,
    employees,
    loading,
    filteredAssignments,
    selectedAssignmentId,
    setSelectedAssignmentId,
    selectedAssignment,
    currentAssignmentItems,
    loadingItems,
    availableItems,
    canCreateAssignment,
    canEditAssignment,
    canUnassignItem,
    handleUnassignItem,
    confirmState,
    setConfirmState,
    // formulario
    isEditing,
    name,
    setName,
    employeeId,
    employeeName,
    equipo,
    setEquipo,
    fecha,
    setFecha,
    authorizerId,
    description,
    setDescription,
    observacion,
    setObservacion,
    selectedItemIds,
    toggleItemSelection,
    itemSearch,
    setItemSearch,
    handleEmployeeChange,
    handleAuthorizerChange,
    handleSubmit,
    resetForm,
    handleEditStart,
    saving,
    saveError,
    setSaveError,
    // filtros y acciones de lista
    assignmentSearch,
    setAssignmentSearch,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    handleExportAssignments,
    handlePrint,
  };
}
