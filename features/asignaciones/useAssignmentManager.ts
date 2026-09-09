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
import { Assignment, Employee, InventoryItem } from '@/types';
import {
  createAssignment,
  createAssignmentEquipo,
  getAssignmentItems,
  getAssignments,
  getEmployees,
  getInventory,
  getInventoryErrorMessage,
  updateAssignment,
  updateInventoryItem,
} from '@/shared/api/inventoryService';
import { downloadXlsx, formatDate, isWithinDateRange, rangeSuffix } from '@/shared/utils/reportUtils';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { useItemSelection } from '@/shared/hooks/useItemSelection';
import { matchesItemSearch } from '@/shared/components/ItemPicker';

export type AssignmentViewMode = 'dashboard' | 'form';

export function useAssignmentManager() {
  const [viewMode, setViewMode] = useState<AssignmentViewMode>('dashboard');

  const {
    data: { assignments, inventory, employees },
    loading,
    refresh: refreshData,
  } = useAsyncData<{ assignments: Assignment[]; inventory: InventoryItem[]; employees: Employee[] }>(
    async () => {
      const [aData, iData, eData] = await Promise.all([
        getAssignments(),
        getInventory(),
        getEmployees(),
      ]);
      return { assignments: aData, inventory: iData, employees: eData };
    },
    { assignments: [], inventory: [], employees: [] },
    { errorMessage: 'No se pudieron cargar las asignaciones.' },
  );

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  // Equipos de la asignación abierta en el detalle.
  const [currentAssignmentItems, setCurrentAssignmentItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Distinto de `loading` (carga de datos): marca un guardado en curso.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    const fetchItems = async () => {
      if (selectedAssignmentId) {
        setLoadingItems(true);
        const items = await getAssignmentItems(selectedAssignmentId);
        setCurrentAssignmentItems(items);
        setLoadingItems(false);
      } else {
        setCurrentAssignmentItems([]);
      }
    };
    fetchItems();
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
    setFecha('');
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
        // al empleado anterior.
        await Promise.all(
          data.itemIds.map((itemId) =>
            updateInventoryItem(itemId, {
              assignedEmployeeId: data.employeeId,
              assignedEmployeeName: data.employeeName,
            }),
          ),
        );

        const updatedItems = await getAssignmentItems(formId);
        setCurrentAssignmentItems(updatedItems);
        setSelectedAssignmentId(formId);
      } else {
        const newAssignment = await createAssignment(data);
        if (newAssignment && newAssignment.id) {
          await createAssignmentEquipo(data.itemIds, newAssignment.id);
          await Promise.all(
            data.itemIds.map((itemId) =>
              updateInventoryItem(itemId, {
                assignedEmployeeId: data.employeeId,
                assignedEmployeeName: data.employeeName,
              }),
            ),
          );
          setSelectedAssignmentId(newAssignment.id);
        }
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
    if (!selectedAssignment) return;
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
    setFecha(selectedAssignment.fecha);

    // Reusa los equipos que el detalle ya trajo, en vez de volver a pedirlos.
    replaceSelectedItems(currentAssignmentItems.map((i) => i.id));

    setViewMode('form');
  };

  const handlePrint = () => {
    if (selectedAssignment) setTimeout(() => window.print(), 100);
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
