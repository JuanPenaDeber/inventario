// =============================================================================
// Estado y acciones del módulo de Préstamos (pañol).
//
// Es el módulo con más estado del proyecto porque tiene tres cosas a la vez:
// el formulario de alta/edición, el detalle del préstamo abierto, y la
// devolución parcial —que es su particularidad: un préstamo puede devolverse
// equipo por equipo, y cuando el último vuelve, el préstamo se cierra solo.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Employee, InventoryItem, Loan } from '@/types';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';
import {
  addEmployee,
  createLoan,
  getEmployees,
  getInventory,
  getInventoryErrorMessage,
  getLoanItems,
  getLoans,
  returnLoanItems,
  updateLoan,
} from '@/shared/api/inventoryService';
import { downloadXlsx, formatDate, isWithinDateRange, rangeSuffix } from '@/shared/utils/reportUtils';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import { useItemSelection } from '@/shared/hooks/useItemSelection';
import { matchesItemSearch } from '@/shared/components/ItemPicker';
import type { ConfirmDialogState } from '@/shared/components/ConfirmDialog';

export type LoanViewMode = 'dashboard' | 'create' | 'edit';

export function useLoanManager() {
  const { can } = useCurrentUser();
  const [viewMode, setViewMode] = useState<LoanViewMode>('dashboard');

  const {
    data: { loans, inventory, employees },
    setData,
    loading,
    refresh,
  } = useAsyncData<{ loans: Loan[]; inventory: InventoryItem[]; employees: Employee[] }>(
    async () => {
      const [lData, iData, eData] = await Promise.all([getLoans(), getInventory(), getEmployees()]);
      return { loans: lData, inventory: iData, employees: eData };
    },
    { loans: [], inventory: [], employees: [] },
    { errorMessage: 'No se pudieron cargar los préstamos.' },
  );

  const setEmployees = (update: (prev: Employee[]) => Employee[]) =>
    setData((prev) => ({ ...prev, employees: update(prev.employees) }));

  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  // Distinto de `loading` (que es la carga de datos): esto marca una
  // operación de guardado/devolución en curso.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  // --- Detalle ---
  const [currentLoanItems, setCurrentLoanItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // --- Formulario ---
  const [formId, setFormId] = useState<string | null>(null);
  const [name, setName] = useState(''); // Referencia
  const [borrowerContact, setBorrowerContact] = useState('');
  const [solicitanteId, setSolicitanteId] = useState('');
  const [entregadoporId, setEntregadoporId] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [fechaEsperadaDevolucion, setFechaEsperadaDevolucion] = useState('');
  const [fechaPrestamo, setfechaPrestamo] = useState('');
  const [fechaHoraDevolucion, setFechaHoraDevolucion] = useState('');
  const [observations, setObservations] = useState('');

  const {
    selectedIds: selectedItemIds,
    toggle: toggleItemSelection,
    replace: replaceSelectedItems,
    clear: clearSelectedItems,
  } = useItemSelection();

  const [itemSearch, setItemSearch] = useState('');
  const [loanSearch, setLoanSearch] = useState('');
  // Filtro por fecha de préstamo (vacío = sin filtrar).
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // --- Devolución parcial ---
  const [itemsToReturn, setItemsToReturn] = useState<Set<string>>(new Set());

  const selectedLoan = useMemo(
    () => loans.find((l) => l.id === selectedLoanId),
    [loans, selectedLoanId],
  );

  // Trae los equipos cada vez que cambia el préstamo seleccionado.
  useEffect(() => {
    const fetchItems = async () => {
      setItemsToReturn(new Set()); // la selección de devolución no se arrastra
      if (selectedLoanId) {
        setLoadingItems(true);
        const items = await getLoanItems(selectedLoanId);
        setCurrentLoanItems(items);
        setLoadingItems(false);
      } else {
        setCurrentLoanItems([]);
      }
    };
    fetchItems();
  }, [selectedLoanId]);

  const refreshData = async () => {
    await refresh();
    setItemsToReturn(new Set());
  };

  // A diferencia de Asignaciones, Préstamos sí tiene regla de disponibilidad:
  // solo ofrece equipos activos o ya asignados, más los que ya forman parte
  // del préstamo que se está editando (si no, al editar desaparecerían de la
  // lista los equipos que el propio préstamo tiene prestados).
  const availableItems = useMemo(() => {
    return inventory.filter((i) => {
      const isAvailable = i.status === 'Activo' || i.status === 'asignado';
      const isInCurrentLoan = formId && selectedItemIds.has(i.id);
      return matchesItemSearch(i, itemSearch) && (isAvailable || isInCurrentLoan);
    });
  }, [inventory, itemSearch, formId, selectedItemIds]);

  const filteredLoans = useMemo(() => {
    const q = loanSearch.toLowerCase();
    return loans
      .filter((l) => {
        const matchesSearch =
          (l.name || '').toLowerCase().includes(q) ||
          (l.area || '').toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q);
        const matchesDate = isWithinDateRange(l.fechaPrestamo, startDate, endDate);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => new Date(b.fechaPrestamo).getTime() - new Date(a.fechaPrestamo).getTime());
  }, [loans, loanSearch, startDate, endDate]);

  const getEmployeeName = (id?: string) => employees.find((e) => e.id === id)?.name || id || '';

  /** Vencido = la fecha esperada ya pasó, sin contar el día de hoy. */
  const isOverdue = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date() && new Date(dateStr).getDate() !== new Date().getDate();
  };

  // --- Formulario ---

  const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const empId = e.target.value;
    setSolicitanteId(empId);
    const emp = employees.find((x) => x.id === empId);
    if (emp) {
      setBorrowerContact(emp.equipo);
      // Si no hay responsable elegido, el solicitante lo es por defecto.
      if (!responsableId) setResponsableId(emp.id);
    } else {
      setBorrowerContact('');
    }
  };

  const handleResponsibleChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setResponsableId(e.target.value);

  const handleEntregadoporChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setEntregadoporId(e.target.value);

  // Antes cualquiera podía crear un empleado desde acá, sin ningún control —
  // y CRegistroEmpleados es de donde salen TODOS los desplegables de la app,
  // no sólo los de Préstamos (ver la revisión de arquitectura). `canAddEmployee`
  // se expone para que el formulario esconda el botón; el chequeo de acá
  // adentro es la segunda línea, por si algo lo llama sin pasar por el botón.
  const canAddEmployee = can('employee.create');

  // Antes cualquier rol podía crear, editar o registrar la devolución de un
  // préstamo — no había ningún control. loan.create/loan.edit/loan.return en
  // permissions.ts ya lo limitan a SISTEMAS/ADMINISTRADOR; esto hace que la
  // interfaz (y el propio hook, como segunda línea) lo respete.
  const canCreateLoan = can('loan.create');
  const canEditLoan = can('loan.edit');
  const canReturnLoan = can('loan.return');

  const handleAddQuickEmployee = async () => {
    if (!canAddEmployee) return;
    const newName = prompt('Nombre del nuevo empleado:');
    if (newName) {
      const dept = prompt('Departamento:') || 'almacen';
      const newEmp = await addEmployee(newName, dept);
      setEmployees((prev) => [...prev, newEmp]);
      setSolicitanteId(newEmp.id);
      setBorrowerContact(newEmp.equipo);
    }
  };

  const resetForm = () => {
    setName('');
    setSolicitanteId('');
    setResponsableId('');
    setEntregadoporId('');
    setBorrowerContact('');
    setFechaEsperadaDevolucion('');
    setFechaHoraDevolucion('');
    // Por defecto, hoy en hora local (no UTC, o el día salta según la zona).
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setfechaPrestamo(now.toISOString().slice(0, 10));
    setObservations('');
    clearSelectedItems();
    setFormId(null);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === 'edit' ? !canEditLoan : !canCreateLoan) return;
    if (selectedItemIds.size === 0) {
      alert('Seleccione al menos un equipo.');
      return;
    }

    setSaving(true);
    const selectedEmp = employees.find((x) => x.id === solicitanteId);
    const nameToSave = selectedEmp ? selectedEmp.name : 'Unknown';
    const solName = selectedEmp?.name || '';

    const loanData = {
      name, // Referencia
      solicitanteId,
      responsableId,
      entregadoporId,
      borrowerName: nameToSave, // campos legados, se mantienen por compatibilidad
      borrowerContact,
      solicitante: solName,
      area: borrowerContact,
      fechaPrestamo,
      fechaEsperadaDevolucion,
      fechaHoraDevolucion,
      description: observations,
      itemIds: Array.from(selectedItemIds) as string[],
    };

    try {
      if (viewMode === 'edit' && formId) {
        // Pasar itemIds dispara la lógica de diferencias del servicio.
        await updateLoan(formId, loanData);
        setSelectedLoanId(formId);
      } else {
        const newLoan = await createLoan(loanData);
        setSelectedLoanId(newLoan.id);
      }

      resetForm();
      await refreshData();
      setViewMode('dashboard');
    } catch (err) {
      setSaveError(getInventoryErrorMessage(err, 'No se pudo guardar el préstamo.'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = () => {
    if (!selectedLoan || !canEditLoan) return;
    setFormId(selectedLoan.id);
    setName(selectedLoan.name || '');
    setSolicitanteId(selectedLoan.solicitanteId || '');
    setResponsableId(selectedLoan.responsableId || '');
    setEntregadoporId(selectedLoan.entregadoporId || '');
    setBorrowerContact(selectedLoan.area || '');

    // Los <input type="date"> solo aceptan YYYY-MM-DD.
    setFechaEsperadaDevolucion(
      selectedLoan.fechaEsperadaDevolucion
        ? new Date(selectedLoan.fechaEsperadaDevolucion).toISOString().slice(0, 10)
        : '',
    );
    setFechaHoraDevolucion(selectedLoan.fechaHoraDevolucion || '');
    setfechaPrestamo(
      selectedLoan.fechaPrestamo
        ? new Date(selectedLoan.fechaPrestamo).toISOString().slice(0, 10)
        : '',
    );

    setObservations(selectedLoan.description || '');
    // Reusa los equipos que el detalle ya trajo, en vez de volver a pedirlos.
    replaceSelectedItems(currentLoanItems.map((i) => i.id));
    setViewMode('edit');
  };

  // --- Devolución parcial ---

  const toggleReturnSelection = (itemId: string) => {
    setItemsToReturn((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const doPartialReturn = async () => {
    setConfirmState(null);
    if (!selectedLoanId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await returnLoanItems(selectedLoanId, Array.from(itemsToReturn));

      const updatedItems = await getLoanItems(selectedLoanId);
      setCurrentLoanItems(updatedItems);

      // Cuando vuelve el último equipo, el préstamo se cierra solo: si no, se
      // quedaría "activo" para siempre y contaría como vencido.
      const allReturned = updatedItems.every((item) => item.fechaDevolucion !== null);
      if (allReturned && selectedLoan) {
        const updates: Partial<Loan> = { status: 'FINALIZADO' };
        if (!selectedLoan.fechaHoraDevolucion) {
          updates.fechaHoraDevolucion = new Date().toISOString();
        }
        await updateLoan(selectedLoanId, updates);
      }

      await refreshData();
      setItemsToReturn(new Set());
    } catch (err) {
      setSaveError(getInventoryErrorMessage(err, 'No se pudo registrar la devolución.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePartialReturn = () => {
    if (!selectedLoanId || itemsToReturn.size === 0 || !canReturnLoan) return;
    setConfirmState({
      message: `¿Registrar la devolución de ${itemsToReturn.size} equipo(s) seleccionado(s)?`,
      confirmLabel: 'Registrar devolución',
      onConfirm: doPartialReturn,
    });
  };

  const handlePrintLoan = () => {
    if (selectedLoan) setTimeout(() => window.print(), 100);
  };

  /** Exporta a Excel (.xlsx) los préstamos que se están mostrando. */
  const handleExportLoans = async () => {
    const header = [
      'ID', 'Referencia', 'Área', 'Solicitante', 'Entregado por',
      'Fecha préstamo', 'Devolución esperada', 'Fecha devolución',
      'Estado', 'Descripción',
    ];
    const rows = filteredLoans.map((l) => [
      l.id,
      l.name || '',
      l.area || '',
      l.solicitante || getEmployeeName(l.solicitanteId),
      getEmployeeName(l.entregadoporId),
      formatDate(l.fechaPrestamo),
      formatDate(l.fechaEsperadaDevolucion),
      formatDate(l.fechaHoraDevolucion),
      l.status || '',
      l.description || l.notes || '',
    ]);
    await downloadXlsx(
      `prestamos_${rangeSuffix(startDate, endDate)}.xlsx`,
      'Prestamos',
      [header, ...rows],
      [20, 22, 18, 22, 22, 15, 18, 16, 14, 35],
    );
  };

  return {
    viewMode,
    setViewMode,
    // datos
    loans,
    employees,
    loading,
    filteredLoans,
    selectedLoanId,
    setSelectedLoanId,
    selectedLoan,
    currentLoanItems,
    loadingItems,
    availableItems,
    getEmployeeName,
    isOverdue,
    // formulario
    formId,
    name,
    setName,
    borrowerContact,
    solicitanteId,
    entregadoporId,
    responsableId,
    fechaEsperadaDevolucion,
    setFechaEsperadaDevolucion,
    fechaPrestamo,
    setfechaPrestamo,
    fechaHoraDevolucion,
    setFechaHoraDevolucion,
    observations,
    setObservations,
    selectedItemIds,
    toggleItemSelection,
    itemSearch,
    setItemSearch,
    handleEmployeeChange,
    handleResponsibleChange,
    handleEntregadoporChange,
    handleAddQuickEmployee,
    canAddEmployee,
    canCreateLoan,
    canEditLoan,
    canReturnLoan,
    handleSaveLoan,
    handleEditStart,
    resetForm,
    // devolución
    itemsToReturn,
    toggleReturnSelection,
    handlePartialReturn,
    // estado transversal
    saving,
    saveError,
    setSaveError,
    confirmState,
    setConfirmState,
    // filtros y acciones de lista
    loanSearch,
    setLoanSearch,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    handleExportLoans,
    handlePrintLoan,
  };
}
