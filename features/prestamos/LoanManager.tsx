import React, { useState, useEffect, useMemo } from 'react';
import {
    ClipboardList,
    Search,
    User,
    Clock,
    CheckCircle,
    Plus,
    Package,
    Printer,
    CheckSquare,
    Square,
    Edit,
    UserPlus,
    ArrowLeft,
    ShieldCheck,
    FileText
} from 'lucide-react';
import { InventoryItem, Loan, Employee } from '@/types';
import { getInventory, getLoans, createLoan, returnLoanItems, updateLoan, getEmployees, addEmployee, getLoanItems, getInventoryErrorMessage } from '@/shared/api/inventoryService';
import { isWithinDateRange, downloadXlsx, formatDate, rangeSuffix } from '@/shared/utils/reportUtils';
import { getLogoUrl } from '@/shared/api/photoServer';
import DateRangeBar from '@/shared/components/DateRangeBar';
import { useAsyncData } from '@/shared/hooks/useAsyncData';
import ConfirmDialog, { ConfirmDialogState } from '@/shared/components/ConfirmDialog';
import MasterDetail from '@/shared/components/MasterDetail';
import { NoSelection } from '@/shared/components/ui/States';
import { controlClass } from '@/shared/components/ui/Field';

// Clases de campo compartidas (shared/components/ui/Field.tsx). El acento
// orange es el de este módulo.
const inputCls = controlClass('orange');

const LoanManager: React.FC = () => {
    const [viewMode, setViewMode] = useState<'dashboard' | 'create' | 'edit'>('dashboard');

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

    // Detail State
    const [currentLoanItems, setCurrentLoanItems] = useState<InventoryItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);

    // Form State
    const [formId, setFormId] = useState<string | null>(null);
    const [name, setName] = useState(''); // Referencia
    const [borrowerContact, setBorrowerContact] = useState('');
    const [solicitanteId, setSolicitanteId] = useState('');
    const [entregadoporId, setEntregadoporId] = useState('');
    const [responsableId, setResponsableId] = useState('');
    const [fechaEsperadaDevolucion, setFechaEsperadaDevolucion] = useState('');
    const [fechaPrestamo, setfechaPrestamo] = useState(''); // New: Fecha Prestamo
    const [fechaHoraDevolucion, setFechaHoraDevolucion] = useState(''); // Real Return Date
    const [observations, setObservations] = useState('');
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [itemSearch, setItemSearch] = useState('');
    const [loanSearch, setLoanSearch] = useState('');
    // Filtro por fecha de préstamo (vacío = sin filtrar).
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Return State
    const [itemsToReturn, setItemsToReturn] = useState<Set<string>>(new Set());


    // Fetch Items on selection
    useEffect(() => {
        const fetchItems = async () => {
            setItemsToReturn(new Set()); // Reset selection when loan changes
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

    // --- Logic for Create/Edit Form ---

    const availableItems = useMemo(() => {
        return inventory.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
                (i.serie && i.serie.toLowerCase().includes(itemSearch.toLowerCase())) ||
                i.category.toLowerCase().includes(itemSearch.toLowerCase());

            const isAvailable = (i.status === 'Activo' || i.status === 'asignado');
            const isInCurrentLoan = formId && selectedItemIds.has(i.id);

            return matchesSearch && (isAvailable || isInCurrentLoan);
        });
    }, [inventory, itemSearch, formId, selectedItemIds]);

    const toggleItemSelection = (id: string) => {
        const newSet = new Set(selectedItemIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedItemIds(newSet);
    };

    const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const empId = e.target.value;
        setSolicitanteId(empId);
        const emp = employees.find(emp => emp.id === empId);
        if (emp) {
            setBorrowerContact(emp.equipo);
            // Default responsable to the solicitante if empty
            if (!responsableId) setResponsableId(emp.id);
        } else {
            setBorrowerContact('');
        }
    };

    const handleResponsibleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setResponsableId(e.target.value);
    };

    const handleEntregadoporChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setEntregadoporId(e.target.value);
    };

    const handleAddQuickEmployee = async () => {
        const newName = prompt("Nombre del nuevo empleado:");
        if (newName) {
            const dept = prompt("Departamento:") || "almacen";
            const newEmp = await addEmployee(newName, dept);
            setEmployees(prev => [...prev, newEmp]);
            setSolicitanteId(newEmp.id);
            setBorrowerContact(newEmp.equipo);
        }
    };

    const handleSaveLoan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedItemIds.size === 0) {
            alert("Seleccione al menos un equipo.");
            return;
        }

        setSaving(true);
        const selectedEmp = employees.find(e => e.id === solicitanteId);
        const nameToSave = selectedEmp ? selectedEmp.name : "Unknown";

        // Get actual names for display in table if needed locally
        const solName = employees.find(e => e.id === solicitanteId)?.name || '';

        const loanData = {
            name, // Referencia
            solicitanteId,
            responsableId,
            entregadoporId,
            borrowerName: nameToSave, // kept for backward compatibility / legacy fields
            borrowerContact,
            solicitante: solName,
            area: borrowerContact,
            fechaPrestamo, // Send custom start date
            fechaEsperadaDevolucion, // New specific field
            fechaHoraDevolucion, // Real return
            description: observations,
            itemIds: Array.from(selectedItemIds) as string[]
        };

        try {
            if (viewMode === 'edit' && formId) {
                // Passing itemIds here triggers the new Diff logic in the service
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
        if (!selectedLoan) return;
        setFormId(selectedLoan.id);
        setName(selectedLoan.name || '');
        setSolicitanteId(selectedLoan.solicitanteId || '');
        setResponsableId(selectedLoan.responsableId || '');
        setEntregadoporId(selectedLoan.entregadoporId || '');
        setBorrowerContact(selectedLoan.area || '');

        // Use Expected Return Date. Slice to 10 for YYYY-MM-DD input
        const expectedDate = selectedLoan.fechaEsperadaDevolucion
            ? new Date(selectedLoan.fechaEsperadaDevolucion).toISOString().slice(0, 10)
            : '';
        setFechaEsperadaDevolucion(expectedDate);

        // Real Return date (datetime-local)
        setFechaHoraDevolucion(selectedLoan.fechaHoraDevolucion || '');

        // If we have a checkout date, format it for input (YYYY-MM-DDTHH:mm)
        const formattedCheckout = selectedLoan.fechaPrestamo
            ? new Date(selectedLoan.fechaPrestamo).toISOString().slice(0, 10)
            : '';
        setfechaPrestamo(formattedCheckout);

        setObservations(selectedLoan.description || '');
        // Use items from detail fetch
        setSelectedItemIds(new Set(currentLoanItems.map(i => i.id)));
        setViewMode('edit');
    };

    const resetForm = () => {
        setName('');
        setSolicitanteId('');
        setResponsableId('');
        setEntregadoporId('');
        setBorrowerContact('');
        setFechaEsperadaDevolucion('');
        setFechaHoraDevolucion('');
        // Default to now
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setfechaPrestamo(now.toISOString().slice(0, 10));

        setObservations('');
        setSelectedItemIds(new Set());
        setFormId(null);
    };

    // --- Logic for Dashboard ---

    const filteredLoans = useMemo(() => {
        const q = loanSearch.toLowerCase();
        return loans.filter(l => {
            const matchesSearch =
                (l.name || '').toLowerCase().includes(q) ||
                (l.area || '').toLowerCase().includes(q) ||
                l.id.toLowerCase().includes(q);
            // Se filtra por la fecha del préstamo.
            const matchesDate = isWithinDateRange(l.fechaPrestamo, startDate, endDate);
            return matchesSearch && matchesDate;
        }).sort((a, b) => new Date(b.fechaPrestamo).getTime() - new Date(a.fechaPrestamo).getTime());
    }, [loans, loanSearch, startDate, endDate]);

    /** Exporta a Excel (.xlsx) los préstamos que se están mostrando. */
    const handleExportLoans = async () => {
        const header = [
            'ID', 'Referencia', 'Área', 'Solicitante', 'Entregado por',
            'Fecha préstamo', 'Devolución esperada', 'Fecha devolución',
            'Estado', 'Descripción',
        ];
        const rows = filteredLoans.map(l => [
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

    const selectedLoan = useMemo(() => {
        return loans.find(l => l.id === selectedLoanId);
    }, [loans, selectedLoanId]);

    // Helpers for Display Names in Print View
    const getEmployeeName = (id?: string) => employees.find(e => e.id === id)?.name || id || '';

    const isOverdue = (dateStr: string) => {
        if (!dateStr) return false;
        return new Date(dateStr) < new Date() && new Date(dateStr).getDate() !== new Date().getDate();
    };

    const toggleReturnSelection = (itemId: string) => {
        setItemsToReturn(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const handlePartialReturn = () => {
        if (!selectedLoanId || itemsToReturn.size === 0) return;
        setConfirmState({
            message: `¿Registrar la devolución de ${itemsToReturn.size} equipo(s) seleccionado(s)?`,
            confirmLabel: 'Registrar devolución',
            onConfirm: doPartialReturn,
        });
    };

    const doPartialReturn = async () => {
        setConfirmState(null);
        if (!selectedLoanId) return;
        setSaving(true);
        setSaveError(null);
        try {
            // 1. Process Item Returns
            await returnLoanItems(selectedLoanId, Array.from(itemsToReturn));

            // 2. Fetch updated items to check if everything is returned
            const updatedItems = await getLoanItems(selectedLoanId);
            setCurrentLoanItems(updatedItems);

            const allReturned = updatedItems.every(item => item.fechaDevolucion !== null);

            if (allReturned && selectedLoan) {
                // 3. Close the Loan automatically
                const updates: Partial<Loan> = {
                    status: 'FINALIZADO'
                };

                // Only set end date if not already set
                if (!selectedLoan.fechaHoraDevolucion) {
                    updates.fechaHoraDevolucion = new Date().toISOString();
                }

                await updateLoan(selectedLoanId, updates);
            }

            // Refresh global data to update status in list
            await refreshData();
            setItemsToReturn(new Set());
        } catch (err) {
            setSaveError(getInventoryErrorMessage(err, 'No se pudo registrar la devolución.'));
        } finally {
            setSaving(false);
        }
    };

    const handlePrintLoan = () => {
        window.print();
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">

            {/* --- PRINTABLE PDF VIEW --- */}
            {selectedLoan && (
                <div className="hidden-on-screen print-area bg-white text-black">
                    <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-center">
                        <div>
                            <img src={getLogoUrl()} className="h-12" alt="Logo" />
                        </div>
                        <div className="text-right">
                            <h1 className="text-xl font-bold uppercase">Comprobante de Préstamo</h1>
                            <p className="text-sm">Control de Salida Temporal</p>
                            <p className="text-xs font-mono mt-1">ID: {selectedLoan.id}</p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <h2 className="text-2xl font-bold uppercase mb-2">{selectedLoan.name}</h2>
                        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm border-t border-b border-black py-4">
                            <div>
                                <span className="font-bold block text-gray-500 text-xs uppercase">Solicitante</span>
                                <span className="text-lg">{getEmployeeName(selectedLoan.solicitanteId)}</span>
                            </div>
                            <div>
                                <span className="font-bold block text-gray-500 text-xs uppercase">Área / Departamento</span>
                                <span className="text-lg">{selectedLoan.area}</span>
                            </div>
                            <div className="mt-2">
                                <span className="font-bold block text-gray-500 text-xs uppercase">Fecha de Salida</span>
                                <span>{new Date(selectedLoan.fechaPrestamo).toISOString().split('T')[0]}</span>
                            </div>
                            <div className="mt-2">
                                <span className="font-bold block text-gray-500 text-xs uppercase">Devolución Esperada</span>
                                <span>{selectedLoan.fechaEsperadaDevolucion ? new Date(selectedLoan.fechaEsperadaDevolucion).toISOString().split('T')[0] : 'Indefinido'}</span>
                            </div>
                        </div>
                    </div>

                    {selectedLoan.description && (
                        <div className="mb-6 p-3 bg-gray-50 border border-gray-200 text-sm">
                            <p className="font-bold text-xs uppercase text-gray-500 mb-1">Observaciones Generales</p>
                            <p>{selectedLoan.description}</p>
                        </div>
                    )}

                    <table className="w-full border-collapse border border-black mb-8 text-sm">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-black p-2 text-left">Equipo</th>
                                <th className="border border-black p-2 text-left w-32">Código</th>
                                <th className="border border-black p-2 text-left">Observaciones / Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentLoanItems.length > 0 ? currentLoanItems.map(item => (
                                <tr key={item.id}>
                                    <td className="border border-black p-2">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-gray-500">{item.category}</div>
                                    </td>
                                    <td className="border border-black p-2 font-mono">{item.serie}</td>
                                    <td className="border border-black p-2">
                                        {item.condition}
                                        {item.description && <span className="text-xs block text-gray-500">{item.description}</span>}
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan={3} className="p-4 text-center">No hay equipos registrados.</td></tr>
                            )}
                        </tbody>
                    </table>

                    <div className="mb-12 text-xs text-justify leading-relaxed">
                        <p className="font-bold mb-1">COMPROMISO DE CUIDADO Y USO:</p>
                        <p>El solicitante declara recibir los equipos descritos en las condiciones detalladas anteriormente y se compromete a:</p>
                        <ul className="list-disc pl-5 mt-1 space-y-0.5">
                            <li>Utilizar los equipos exclusivamente para los fines laborales asignados.</li>
                            <li>Mantener los equipos bajo su custodia y cuidado, evitando daños por negligencia o mal uso.</li>
                            <li>Reportar inmediatamente cualquier incidente, pérdida o falla técnica.</li>
                            <li>Devolver los equipos en la fecha esperada o cuando sean requeridos.</li>
                        </ul>
                        <p className="mt-2">En caso de pérdida o daño por negligencia comprobada, el responsable asume la responsabilidad de reposición según las políticas de la empresa.</p>
                    </div>

                    <div className="mt-auto grid grid-cols-3 gap-8 text-center text-xs pt-12">
                        <div>
                            <div className="border-t border-black pt-2 mx-4 mb-1"></div>
                            <p className="font-bold uppercase">{getEmployeeName(selectedLoan.entregadoporId)}</p>
                            <p className="text-gray-500">Entregado Por</p>
                        </div>
                        <div>
                            <div className="border-t border-black pt-2 mx-4 mb-1"></div>
                            <p className="font-bold uppercase">{getEmployeeName(selectedLoan.solicitanteId)}</p>
                            <p className="text-gray-500">Recibí Conforme (Solicitante)</p>
                        </div>
                        <div>
                            <div className="border-t border-black pt-2 mx-4 mb-1"></div>
                            <p className="font-bold uppercase">{getEmployeeName(selectedLoan.responsableId)}</p>
                            <p className="text-gray-500">Responsable / Supervisor</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Screen UI Header */}
            <div className="flex justify-between items-center mb-6 shrink-0 no-print">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
                        <ClipboardList size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Pañol / Préstamos</h1>
                        <p className="text-slate-500 text-sm">Préstamos temporales con fecha de devolución.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    {viewMode !== 'dashboard' ? (
                        <button
                            onClick={() => { setViewMode('dashboard'); resetForm(); }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <ArrowLeft size={18} /> Cancelar
                        </button>
                    ) : (
                        <button
                            onClick={() => { resetForm(); setViewMode('create'); }}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/30"
                        >
                            <Plus size={18} /> Nuevo Préstamo
                        </button>
                    )}
                </div>
            </div>

            {viewMode !== 'dashboard' ? (
                // --- CREATE/EDIT VIEW ---
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden no-print">
                    {/* Form Side */}
                    <div className="lg:col-span-1 h-full overflow-y-auto">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2 border-b pb-2">
                                <User size={20} className="text-orange-500" /> {viewMode === 'edit' ? 'Editar Préstamo' : 'Nuevo Préstamo'}
                            </h2>
                            <form id="loanForm" onSubmit={handleSaveLoan} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Referencia</label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Ej: Préstamo Cámaras Evento X"
                                        className={inputCls}
                                    />
                                </div>

                                {/* Checkout Date Field */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Préstamo</label>
                                    <input
                                        type="date"
                                        required
                                        value={fechaPrestamo}
                                        onChange={e => setfechaPrestamo(e.target.value)}
                                        className={inputCls}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Solicitante (Empleado)</label>
                                    <div className="flex gap-2">
                                        <select
                                            required
                                            value={solicitanteId}
                                            onChange={handleEmployeeChange}
                                            className={inputCls}
                                        >
                                            <option value="">Seleccionar Empleado</option>
                                            {employees.map(e => (
                                                <option key={e.id} value={e.id}>{e.name}</option>
                                            ))}
                                        </select>
                                        <button type="button" onClick={handleAddQuickEmployee} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg" title="Nuevo Empleado">
                                            <UserPlus size={20} />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                                    <input
                                        type="text"
                                        readOnly
                                        value={borrowerContact}
                                        className="w-full px-3 py-2 border border-slate-200 bg-slate-50 text-slate-500 rounded-lg outline-none cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
                                    <select
                                        required
                                        value={responsableId}
                                        onChange={handleResponsibleChange}
                                        className={inputCls}
                                    >
                                        <option value="">Seleccionar Solicitante</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Entregado Por</label>
                                    <select
                                        required
                                        value={entregadoporId}
                                        onChange={handleEntregadoporChange}
                                        className={inputCls}
                                    >
                                        <option value="">Seleccionar Autorizador</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Fecha Esperada - Date Only */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Esperada de Devolución</label>
                                    <input
                                        type="date"
                                        value={fechaEsperadaDevolucion}
                                        onChange={e => setFechaEsperadaDevolucion(e.target.value)}
                                        className={inputCls}
                                    />
                                </div>

                                {/* Fecha Real - DateTime - Only used when closing manually here or editing */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Real de Devolución (Cierre)</label>
                                    <input
                                        type="datetime-local"
                                        value={fechaHoraDevolucion}
                                        onChange={e => setFechaHoraDevolucion(e.target.value)}
                                        className={inputCls}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
                                    <textarea
                                        value={observations}
                                        onChange={e => setObservations(e.target.value)}
                                        className={inputCls}
                                        rows={3}
                                    />
                                </div>

                                <div className="pt-4 border-t border-slate-100 mt-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-slate-600 text-sm">Equipos Seleccionados:</span>
                                        <span className="font-bold text-slate-900 bg-orange-100 px-2 py-0.5 rounded text-sm">{selectedItemIds.size}</span>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={saving || selectedItemIds.size === 0}
                                        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-orange-500/20"
                                    >
                                        {saving ? 'Procesando...' : (viewMode === 'edit' ? 'Guardar Cambios' : 'Confirmar Préstamo')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* Item Selector */}
                    <div className="lg:col-span-2 h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <Package size={20} className="text-orange-500" /> Seleccionar Equipos
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, categoría o código..."
                                    value={itemSearch}
                                    onChange={e => setItemSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {availableItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => toggleItemSelection(item.id)}
                                        className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all ${selectedItemIds.has(item.id) ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-300' : 'bg-white border-slate-100 hover:border-orange-200'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selectedItemIds.has(item.id) ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-300 bg-white'}`}>
                                            {selectedItemIds.has(item.id) && <CheckCircle size={14} />}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-800 truncate">{item.name}</p>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span className="truncate">{item.serie}</span><br />
                                                <span className="truncate">{item.category}</span>
                                                {item.status === 'asignado' && <span className="font-bold bg-indigo-50 text-indigo-600 px-1 rounded text-[10px]">ASIGNADO</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                {/* Filtro por fecha (día o rango) + exportar a Excel */}
                <DateRangeBar
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                    onExport={handleExportLoans}
                    shown={filteredLoans.length}
                    total={loans.length}
                    accent="orange"
                    label="préstamos"
                />

                {/* --- MASTER DETAIL DASHBOARD --- */}
                <MasterDetail
                    items={filteredLoans}
                    selectedId={selectedLoanId}
                    onSelect={setSelectedLoanId}
                    accent="orange"
                    loading={loading}
                    loadingMessage="Cargando datos..."
                    emptyMessage="No hay préstamos registrados."
                    search={loanSearch}
                    onSearchChange={setLoanSearch}
                    searchPlaceholder="Buscar préstamo..."
                    emptyDetail={<NoSelection icon={ClipboardList} message="Seleccione un préstamo para ver detalles" />}
                    renderRow={(loan, isSelected) => {
                        const isReturned =
                            loan.status === 'DEVUELTO' ||
                            loan.status === 'FINALIZADO' ||
                            loan.fechaHoraDevolucion;
                        // Activo = todo lo que no fue devuelto explícitamente.
                        const isActive = !isReturned;
                        const isLoanOverdue =
                            isActive && isOverdue(loan.fechaEsperadaDevolucion || loan.fechaHoraDevolucion);

                        return (
                            <>
                            <div className="flex justify-between items-start mb-1">
                                <h3 className={`font-medium text-sm ${isSelected ? 'text-orange-900' : 'text-slate-800'}`}>{getEmployeeName(loan.solicitanteId)}</h3>
                                {isActive ? (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isLoanOverdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                        {isLoanOverdue ? 'VENCIDO' : 'ACTIVO'}
                                    </span>
                                ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500">FINALIZADO</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mb-1">{loan.area}</p>
                            <p className="text-[10px] text-slate-400 italic mb-2 truncate">{loan.name}</p>
                            <div className="flex justify-between text-xs text-slate-400">
                                <span>{new Date(loan.fechaPrestamo).toISOString().split('T')[0]}</span>
                            </div>
                            </>
                        );
                    }}
                    renderDetail={(selectedLoan) => (
                        <>
                        <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">{getEmployeeName(selectedLoan.solicitanteId)}</h2>
                                <p className="text-sm text-slate-600 font-medium">{selectedLoan.name}</p>
                                <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                                    <span className="flex items-center gap-1"><User size={14} /> {selectedLoan.area}</span>
                                    <span className="flex items-center gap-1"><Clock size={14} /> Devolución: {(selectedLoan.fechaEsperadaDevolucion || selectedLoan.fechaHoraDevolucion) ? new Date(selectedLoan.fechaEsperadaDevolucion || selectedLoan.fechaHoraDevolucion).toISOString().split('T')[0] : 'Indefinido'}</span>
                                </div>
                                {selectedLoan.entregadoporId && <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><ShieldCheck size={12} /> Entregado por: {getEmployeeName(selectedLoan.entregadoporId)}</p>}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleEditStart} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Editar">
                                    <Edit size={18} />
                                </button>
                                <button onClick={handlePrintLoan} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Imprimir">
                                    <Printer size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {selectedLoan.description && (
                                <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                                    <span className="font-bold">Observaciones:</span> {selectedLoan.description}
                                </div>
                            )}

                            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><FileText size={16} /> Equipos Prestados</h3>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                {loadingItems ? (
                                    <div className="p-8 text-center text-slate-400">Cargando equipos...</div>
                                ) : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                                            <tr>
                                                <th className="px-4 py-3 w-8"></th>
                                                <th className="px-4 py-3">Equipo</th>
                                                <th className="px-4 py-3">Código</th>
                                                <th className="px-4 py-3">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {currentLoanItems.length === 0 ? (
                                                <tr><td colSpan={4} className="p-4 text-center text-slate-400">No hay equipos en este préstamo (Todos devueltos).</td></tr>
                                            ) : (
                                                currentLoanItems.map(item => (
                                                    <tr key={item.id} className={item.fechaDevolucion ? 'bg-green-50/30' : ''}>
                                                        <td className="px-4 py-3">
                                                            {/* Only show checkbox if NOT returned */}
                                                            {!item.fechaDevolucion && (
                                                                <button onClick={() => toggleReturnSelection(item.id)} className="text-slate-300 hover:text-blue-500">
                                                                    {itemsToReturn.has(item.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                                                                </button>
                                                            )}
                                                            {item.fechaDevolucion && (
                                                                <CheckCircle size={18} className="text-green-500" />
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 font-medium">{item.name}</td>
                                                        <td className="px-4 py-3 font-mono text-slate-500">{item.serie}</td>
                                                        <td className="px-4 py-3">
                                                            {item.fechaDevolucion ? (
                                                                <div>
                                                                    <span className="text-green-600 font-bold text-xs bg-green-100 px-2 py-0.5 rounded">DEVUELTO</span>
                                                                    <div className="text-[10px] text-slate-500 mt-0.5">{new Date(item.fechaDevolucion).toLocaleDateString()} {new Date(item.fechaDevolucion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-orange-600 font-medium text-xs">PENDIENTE</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* The Button is now ALWAYS visible if the loan is ACTIVE, but disabled if no items selected */}
                            {/* We check !isReturned (Active) instead of status === 'PRESTADO' */}
                            {(selectedLoan.status !== 'DEVUELTO' && selectedLoan.status !== 'FINALIZADO') && currentLoanItems.length > 0 && (
                                <div className="mt-6 flex justify-end">
                                    <button
                                        onClick={handlePartialReturn}
                                        disabled={saving || itemsToReturn.size === 0}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                    >
                                        <CheckCircle size={18} />
                                        Registrar Devolución ({itemsToReturn.size})
                                    </button>
                                </div>
                            )}
                        </div>
                        </>
                    )}
                />
                </>
            )}

            {saveError && (
                <div className="fixed bottom-6 right-6 z-40 max-w-md flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg print:hidden">
                    <span>{saveError}</span>
                    <button onClick={() => setSaveError(null)} aria-label="Cerrar aviso" className="shrink-0 font-medium">×</button>
                </div>
            )}

            <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} busy={saving} />
        </div>
    );
};

export default LoanManager;