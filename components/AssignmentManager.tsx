import React, { useState, useEffect, useMemo } from 'react';
import {
    UserCheck,
    Search,
    User,
    Building2,
    Calendar,
    Plus,
    Package,
    Printer,
    CheckCircle,
    FileBadge,
    Edit,
    ArrowLeft,
    UserPlus,
    Image as ImageIcon
} from 'lucide-react';
import { InventoryItem, Assignment, Employee } from '../types';
import {
    getInventory,
    getAssignments,
    createAssignment,
    updateAssignment,
    getEmployees,
    createAssignmentEquipo,
    getAssignmentItems,
    updateInventoryItem
} from '../services/inventoryService';
import { isWithinDateRange, downloadXlsx, formatDate, rangeSuffix } from '../services/reportUtils';
import DateRangeBar from './DateRangeBar';

const AssignmentManager: React.FC = () => {
    const [viewMode, setViewMode] = useState<'dashboard' | 'form'>('dashboard');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

    // Detail State
    const [currentAssignmentItems, setCurrentAssignmentItems] = useState<InventoryItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);

    const [loading, setLoading] = useState(false);

    // Form State
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
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [itemSearch, setItemSearch] = useState('');
    const [assignmentSearch, setAssignmentSearch] = useState('');
    // Filtro por fecha de asignación (vacío = sin filtrar).
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        refreshData();
    }, []);

    // Fetch items when selection changes
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

    const refreshData = async () => {
        setLoading(true);
        const [aData, iData, eData] = await Promise.all([
            getAssignments(),
            getInventory(),
            getEmployees()
        ]);
        setAssignments(aData);
        setInventory(iData);
        setEmployees(eData);
        setLoading(false);
    };

    const availableItems = useMemo(() => {
        return inventory.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
                (i.serie && i.serie.toLowerCase().includes(itemSearch.toLowerCase())) ||
                i.category.toLowerCase().includes(itemSearch.toLowerCase());
            return matchesSearch;
        });
    }, [inventory, itemSearch]);

    const toggleItemSelection = (id: string) => {
        const newSet = new Set(selectedItemIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedItemIds(newSet);
    };

    const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setEmployeeId(id);
        const emp = employees.find(x => x.id === id);
        if (emp) {
            setEmployeeName(emp.name);
            setEquipo(emp.equipo);
        }
    };

    const handleAuthorizerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setAuthorizerId(id);
        const emp = employees.find(x => x.id === id);
        if (emp) {
            setAuthorizerName(emp.name);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedItemIds.size === 0) {
            alert("Seleccione al menos un equipo.");
            return;
        }

        setLoading(true);
        const data = {
            name,
            employeeId,
            employeeName,
            equipo, // This is mapped to 'area' in the service
            authorizerId,
            authorizerName,
            fecha,
            observacion,
            description,
            itemIds: Array.from(selectedItemIds) as string[]
        };

        if (isEditing && formId) {
            // 1. Update Assignment Header and Relations
            await updateAssignment(formId, data);

            // 2. EXPLICITLY update the Inventory Items to reflect the new (or current) employee
            const itemUpdates = data.itemIds.map(itemId =>
                updateInventoryItem(itemId, {
                    assignedEmployeeId: data.employeeId,
                    assignedEmployeeName: data.employeeName
                })
            );
            await Promise.all(itemUpdates);

            // Refresh details for the edited assignment immediately
            const updatedItems = await getAssignmentItems(formId);
            setCurrentAssignmentItems(updatedItems);
            setSelectedAssignmentId(formId);
        } else {
            const newAssignment = await createAssignment(data);
            if (newAssignment && newAssignment.id) {
                await createAssignmentEquipo(data.itemIds, newAssignment.id);

                // Explicitly update items to set the Assigned Employee ID
                const itemUpdates = data.itemIds.map(itemId =>
                    updateInventoryItem(itemId, {
                        assignedEmployeeId: data.employeeId,
                        assignedEmployeeName: data.employeeName
                    })
                );
                await Promise.all(itemUpdates);

                setSelectedAssignmentId(newAssignment.id);
            }
        }

        resetForm();
        await refreshData(); // Refresh the dashboard list to show updated values
        setViewMode('dashboard');
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
        setSelectedItemIds(new Set());
        setIsEditing(false);
        setFormId(null);
    };

    const handleEditStart = async () => {
        if (!selectedAssignment) return;
        setIsEditing(true);
        setFormId(selectedAssignment.id);

        if (selectedAssignment.employeeId) {
            setEmployeeId(selectedAssignment.employeeId);
        } else {
            const found = employees.find(e => e.name === selectedAssignment.employeeName);
            if (found) setEmployeeId(found.id);
        }

        setEmployeeName(selectedAssignment.employeeName);
        setName(selectedAssignment.name);
        setEquipo(selectedAssignment.equipo);
        setAuthorizerId(selectedAssignment.authorizerId);
        setAuthorizerName(selectedAssignment.authorizerName || '');
        setDescription(selectedAssignment.description || '');
        setObservacion(selectedAssignment.observacion || '');
        setFecha(selectedAssignment.fecha);

        // Use the items we already fetched for the detail view
        const itemIds = currentAssignmentItems.map(i => i.id);
        setSelectedItemIds(new Set(itemIds));

        setViewMode('form');
    };

    const filteredAssignments = useMemo(() => {
        const q = assignmentSearch.toLowerCase();
        return assignments.filter(a => {
            const matchesSearch =
                (a.employeeName ? a.employeeName.toLowerCase().includes(q) : false) ||
                (a.equipo ? a.equipo.toLowerCase().includes(q) : false);
            const matchesDate = isWithinDateRange(a.fecha, startDate, endDate);
            return matchesSearch && matchesDate;
        }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    }, [assignments, assignmentSearch, startDate, endDate]);

    /** Exporta a Excel (.xlsx) las asignaciones que se están mostrando. */
    const handleExportAssignments = () => {
        const header = [
            'ID', 'Empleado', 'Área / Equipo', 'Fecha',
            'Autorizado por', 'Nº de equipos', 'Descripción',
        ];
        const rows = filteredAssignments.map(a => [
            a.id,
            a.employeeName || '',
            a.equipo || '',
            formatDate(a.fecha),
            a.authorizerName || '',
            a.itemIds ? a.itemIds.length : 0,
            a.description || '',
        ]);
        downloadXlsx(
            `asignaciones_${rangeSuffix(startDate, endDate)}.xlsx`,
            'Asignaciones',
            [header, ...rows],
            [20, 26, 22, 14, 24, 14, 35],
        );
    };

    const selectedAssignment = useMemo(() => {
        return assignments.find(a => a.id === selectedAssignmentId);
    }, [assignments, selectedAssignmentId]);

    const handlePrint = () => {
        if (selectedAssignment) {
            setTimeout(() => window.print(), 100);
        }
    };

    return (
        <div className="h-[calc(100vh-8rem)] flex flex-col">

            {/* --- PRINTABLE PDF VIEW --- */}
            {selectedAssignment && (
                <div className="hidden-on-screen print-area bg-white text-black">
                    <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-8">

                        <div>
                            <img src="http://172.20.16.38/fotos/edlogo.png" width="100" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold uppercase">Acta de Asignación</h1>
                            <p className="text-sm mt-2 text-gray-600">Entrega de Equipamiento y Responsabilidad</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold">Fecha: <span className="font-normal">{selectedAssignment.fecha}</span></p>
                            <p className="text-sm font-bold">Ref: <span className="font-normal">{selectedAssignment.id.toUpperCase()}</span></p>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 border border-black mb-8">
                        {selectedAssignment.name && (
                            <div className="mb-4 pb-4 border-b border-gray-300">
                                <p className="text-sm italic">{selectedAssignment.name}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <p className="font-bold text-xs uppercase text-gray-500 mb-1">Empleado Responsable</p>
                                <p className="text-lg font-bold">{selectedAssignment.employeeName}</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase text-gray-500 mb-1">Departamento / Área</p>
                                <p className="text-lg">{selectedAssignment.equipo}</p>
                            </div>
                        </div>
                        {selectedAssignment.description && (
                            <div className="mt-4 pt-4 border-t border-gray-300">
                                <p className="font-bold text-xs uppercase text-gray-500">Descripción</p>
                                <p className="text-sm italic">{selectedAssignment.description}</p>
                            </div>
                        )}
                    </div>

                    <div className="mb-8">
                        <h3 className="font-bold mb-2 uppercase text-sm">Equipos Asignados</h3>
                        <table className="w-full border-collapse border border-black text-sm">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-center w-12 font-bold">Nº</th>
                                    <th className="border border-black p-2 text-center w-20 font-bold">Foto</th>
                                    <th className="border border-black p-2 text-left font-bold">Equipo</th>
                                    <th className="border border-black p-2 text-left font-bold">Categoría</th>
                                    <th className="border border-black p-2 text-left font-bold">Serial / Código</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentAssignmentItems.map((item, index) => (
                                    <tr key={item.id}>
                                        <td className="border border-black p-2 text-center">{index + 1}</td>
                                        <td className="border border-black p-2 text-center">
                                            {item.foto ? (
                                                <img
                                                    src={!item.foto.includes("/") ? ("http://172.20.16.38/fotos/uploads/pequena/" + item.foto) : item.foto}
                                                    alt=""
                                                    className="w-12 h-12 object-cover mx-auto border border-gray-300"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 bg-gray-100 mx-auto flex items-center justify-center">
                                                    <ImageIcon size={16} className="text-gray-400" />
                                                </div>
                                            )}
                                        </td>
                                        <td className="border border-black p-2">{item.name}</td>
                                        <td className="border border-black p-2">{item.category}</td>
                                        <td className="border border-black p-2 font-mono">{item.serie}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="text-xs text-justify mb-24 leading-relaxed text-gray-700 mt-8">
                        <p>Declaro recibir los equipos detallados en perfectas condiciones de uso y funcionamiento. Me comprometo a utilizarlos exclusivamente para labores profesionales y a cuidarlos diligentemente. Entiendo que los equipos son propiedad de la empresa y deberán ser devueltos al finalizar mi relación laboral o cuando sean requeridos.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-16">
                        <div className="text-center">
                            <div className="border-b border-black mb-2 h-12"></div>
                            <p className="font-bold text-sm">{selectedAssignment.employeeName}</p>
                            <p className="text-xs text-gray-500">Recibí conforme</p>
                        </div>
                        <div className="text-center">
                            <div className="border-b border-black mb-2 h-12"></div>
                            <p className="font-bold text-sm">{selectedAssignment.authorizerName}</p>
                            <p className="text-xs text-gray-500">Entregué conforme</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Screen UI */}
            <div className="flex justify-between items-center mb-6 shrink-0 no-print">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                        <UserCheck size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Asignaciones</h1>
                        <p className="text-slate-500 text-sm">Gestión de entrega permanente de equipos.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    {viewMode === 'form' ? (
                        <button onClick={() => { setViewMode('dashboard'); resetForm(); }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors flex items-center gap-2">
                            <ArrowLeft size={18} /> Cancelar
                        </button>
                    ) : (
                        <button onClick={() => { resetForm(); setViewMode('form'); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm">
                            <Plus size={18} /> Nueva Asignación
                        </button>
                    )}
                </div>
            </div>

            {viewMode === 'form' ? (
                // CREATE/EDIT FORM
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden no-print">
                    <div className="lg:col-span-1 h-full overflow-y-auto">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h2 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2 border-b pb-2">
                                <User size={20} className="text-indigo-500" /> {isEditing ? 'Editar Datos' : 'Datos del Empleado'}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Referencia</label>
                                    <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white" placeholder="Referencia" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Asignado a</label>
                                    <div className="flex gap-2">
                                        <select
                                            required
                                            value={employeeId}
                                            onChange={handleEmployeeChange}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                        >
                                            <option value="">Seleccionar...</option>
                                            {employees.map(e => (
                                                <option key={e.id} value={e.id}>{e.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Departamento / Area</label>
                                    <input
                                        type="text"
                                        value={equipo}
                                        onChange={e => setEquipo(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Entregado Por</label>
                                    <select
                                        required
                                        value={authorizerId}
                                        onChange={handleAuthorizerChange}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                    >
                                        <option value="">Seleccionar Autorizador</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de asignación</label>
                                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg outline-none cursor-not-allowed" placeholder="" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" rows={3} placeholder="Notas adicionales..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones</label>
                                    <textarea value={observacion} onChange={e => setObservacion(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" rows={3} placeholder="Notas adicionales..." />
                                </div>

                                <div className="pt-4 border-t border-slate-100 mt-4">
                                    <button type="submit" disabled={loading || selectedItemIds.size === 0} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all">
                                        {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Generar Acta de Entrega')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                    <div className="lg:col-span-2 h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                            <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <Package size={20} className="text-indigo-500" /> Seleccionar Equipos
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input type="text" placeholder="Buscar equipos..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {availableItems.map(item => {
                                    const isSelected = selectedItemIds.has(item.id);
                                    const isAssignedToSomeoneElse = item.assignedEmployeeName && item.assignedEmployeeName !== employeeName;

                                    return (
                                        <div key={item.id} onClick={() => toggleItemSelection(item.id)} className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all ${isSelected ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 bg-white'}`}>
                                                {isSelected && <CheckCircle size={14} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-800 truncate">{item.name}</p>
                                                <div className="flex items-center gap-2 text-xs text-slate-500">

                                                    <div className="truncate">{item.serie}</div>
                                                    <span className="truncate">{item.category}</span>
                                                    {isAssignedToSomeoneElse && <span className="text-orange-600 font-bold bg-orange-50 px-1 rounded">Reasignar</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
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
                    onExport={handleExportAssignments}
                    shown={filteredAssignments.length}
                    total={assignments.length}
                    accent="indigo"
                    label="asignaciones"
                />

                {/* DASHBOARD */}
                <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 no-print">
                    <div className="w-full md:w-1/3 border-r border-slate-200 flex flex-col">
                        <div className="p-4 border-b border-slate-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input type="text" placeholder="Buscar empleado..." value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="p-8 text-center text-slate-400">Cargando...</div>
                            ) : filteredAssignments.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">No hay asignaciones.</div>
                            ) : filteredAssignments.map(a => (
                                <div key={a.id} onClick={() => setSelectedAssignmentId(a.id)} className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${a.id === selectedAssignmentId ? 'bg-indigo-50/60 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}>
                                    <h3 className="font-medium text-sm text-slate-800">{a.employeeName}</h3>
                                    <p className="text-xs text-slate-500">{a.equipo}</p>
                                    <div className="flex justify-between mt-2 text-xs text-slate-400">
                                        {/* <span>{(a.itemIds)?a.itemIds.length:"0"} Equipos</span> */}
                                        <span>{new Date(a.fecha).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="w-full md:w-2/3 flex flex-col bg-slate-50/30">
                        {selectedAssignment ? (
                            <>
                                <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{selectedAssignment.employeeName}</h2>
                                        <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                                            <span className="flex items-center gap-1"><Building2 size={14} /> {selectedAssignment.equipo}</span>
                                            <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(selectedAssignment.fecha).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleEditStart} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Editar Asignación">
                                            <Edit size={18} />
                                        </button>
                                        <button onClick={handlePrint} className="p-2 border rounded hover:bg-slate-50 text-slate-600" title="Imprimir Acta">
                                            <Printer size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    {selectedAssignment.description && (
                                        <div className="mb-6 p-3 ">
                                            <span className="font-bold">Descripción:</span> {selectedAssignment.description}
                                        </div>
                                    )}
                                    {selectedAssignment.observacion && (
                                        <div className="mb-6 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                                            <span className="font-bold">Observaciones:</span> {selectedAssignment.observacion}
                                        </div>
                                    )}
                                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Equipos en Custodia</h3>
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        {loadingItems ? (
                                            <div className="p-4 text-center text-slate-400">Cargando equipos...</div>
                                        ) : (
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                                                    <tr>
                                                        <th className="px-4 py-3">Equipo</th>
                                                        <th className="px-4 py-3">Categoría</th>
                                                        <th className="px-4 py-3">Serial</th>
                                                        <th className="px-4 py-3">Estado Actual</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {currentAssignmentItems.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-3 text-center text-slate-400 italic">No hay equipos asociados.</td>
                                                        </tr>
                                                    ) : (
                                                        currentAssignmentItems.map(i => (
                                                            <tr key={i.id}>
                                                                <td className="px-4 py-3 font-medium">{i.name}</td>
                                                                <td className="px-4 py-3">{i.category}</td>
                                                                <td className="px-4 py-3 font-mono text-slate-500">{i.serie}</td>
                                                                <td className="px-4 py-3">
                                                                    {i.assignedEmployeeId === selectedAssignment.employeeId ?
                                                                        <span className="text-green-600 font-bold text-xs bg-green-50 px-2 py-0.5 rounded">Vigente</span> :
                                                                        <span className="text-slate-400 text-xs italic">Reasignado a {i.assignedEmployeeName || 'Nadie'}</span>
                                                                    }
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                <FileBadge size={48} className="opacity-20 mb-4" />
                                <p>Seleccione una asignación</p>
                            </div>
                        )}
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default AssignmentManager;