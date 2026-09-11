import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Camera, Building2, UserCheck, Upload, Image as ImageIcon, AlertTriangle, FileText, Check } from 'lucide-react';
import { InventoryItem, Provider } from '@/types';
import { getProviders, createAssignmentWithItems, getInventoryErrorMessage } from '@/shared/api/inventoryService';
import { getPhotoUrl } from '@/shared/api/photoServer';
import CameraModal from '@/features/inventario/CameraModal';
import { controlClass } from '@/shared/components/ui/Field';
import { useCurrentUser } from '@/shared/auth/CurrentUserContext';

interface InventoryFormProps {
  initialData?: InventoryItem;
  onSave: (item: any) => void;
  onCancel: () => void;
}

// Clases de campo compartidas (shared/components/ui/Field.tsx). El acento
// indigo es el de este módulo.
const inputCls = controlClass('indigo');

const InventoryForm: React.FC<InventoryFormProps> = ({ initialData, onSave, onCancel }) => {
  // "Quién soy" ya trae la lista de empleados una sola vez para toda la app
  // (shared/auth/CurrentUserContext.tsx) — antes este formulario pedía su
  // propia copia por separado, redundante con esa.
  const { employees } = useCurrentUser();
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    serie: '',
    status: 'Activo',
    condition: 'Funcional',
    location: '',
    precio: 0,
    foto: '',
    description: '',
    providerId: '',
    assignedEmployeeName: '', 
    fechaCompra: '',
    assignedEmployeeId: ''  
  });
  
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assignment Modal State
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assignmentAuthorizerId, setAssignmentAuthorizerId] = useState('');
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  useEffect(() => {
    getProviders().then(setProviders);

    if (initialData) {
      setFormData({
        name: initialData.name,
        category: initialData.category,
        serie: initialData.serie,
        status: initialData.status, 
        condition: initialData.condition,
        location: initialData.location,
        precio: initialData.precio || 0,
        foto: initialData.foto || '',
        fechaCompra: initialData.fechaCompra || '',
        description: initialData.description || '',
        providerId: initialData.providerId || '',
        assignedEmployeeName: initialData.assignedEmployeeName || '',
        assignedEmployeeId: initialData.assignedEmployeeId || ''
      });
    }
  }, [initialData]);

  // Sync Employee ID once employees are loaded if editing
  useEffect(() => {
      if (initialData && initialData.assignedEmployeeName && employees.length > 0) {
          const found = employees.find(e => e.name === initialData.assignedEmployeeName);
          if (found) {
              setFormData(prev => ({ ...prev, assignedEmployeeId: found.id }));
          }
      }
  }, [initialData, employees]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const empId = e.target.value;
    const emp = employees.find(x => x.id === empId);
    setFormData(prev => ({
        ...prev,
        assignedEmployeeId: empId,
        assignedEmployeeName: emp ? emp.name : ''
    }));
  };

  const handleImageCapture = (imageSrc: string) => {
    setFormData(prev => ({ ...prev, foto: imageSrc }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setFormData(prev => ({ ...prev, foto: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  // Main Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if employee changed and is not empty
    const oldEmployeeId = initialData?.assignedEmployeeId || '';
    const newEmployeeId = formData.assignedEmployeeId || '';

    if (newEmployeeId && newEmployeeId !== oldEmployeeId) {
        // Trigger Modal
        setShowAssignmentModal(true);
    } else {
        // Normal Save
        processSave();
    }
  };

  // The logic to actually save the Item data
  const processSave = () => {
    const finalStatus = formData.status;
    const dataToSave = {
        ...formData,
        status: finalStatus,
        id: initialData?.id
    };
    onSave(dataToSave);
  };

  // Logic to Create Assignment AND Save Item
  const handleCreateAssignmentAndSave = async () => {
    if (!assignmentAuthorizerId) {
        alert("Por favor seleccione un autorizador.");
        return;
    }

    setIsSavingAssignment(true);
    try {
        const emp = employees.find(e => e.id === formData.assignedEmployeeId);
        const auth = employees.find(e => e.id === assignmentAuthorizerId);

        if (emp && initialData?.id) {
            const assignmentData = {
                name: "Asignación desde Inventario",
                employeeId: emp.id,
                employeeName: emp.name,
                equipo: emp.equipo, // area
                authorizerId: auth?.id || '',
                authorizerName: auth?.name || '',
                fecha: new Date().toISOString().slice(0, 10),
                description: `Asignación automática generada al actualizar el equipo: ${formData.name}`,
                itemIds: [initialData.id]
            };

            // Cabecera + vínculo de equipos en un solo paso, con su propio
            // aviso si el segundo falla habiendo ya creado el acta (ver
            // PartialWriteError en assignmentService.ts). No se le pasa
            // employeeId/employeeName: el responsable del equipo ya se
            // escribe aparte, en processSave() de abajo — duplicarlo acá
            // sería la misma escritura dos veces.
            await createAssignmentWithItems(assignmentData);
        }

        // After creating assignment, proceed to save the item changes
        processSave();
        setShowAssignmentModal(false);

    } catch (error) {
        console.error("Error creating assignment", error);
        alert(getInventoryErrorMessage(error, "Error al generar el acta de asignación."));
    } finally {
        setIsSavingAssignment(false);
    }
  };

  const openCamera = () => {
    // Basic browser support check
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Tu navegador no soporta acceso a cámara. Por favor, usa Chrome, Firefox o Edge.');
      return;
    }
    // Removed specific protocol check to allow HTTP on local IPs (requires browser flags)
    setIsCameraOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto pb-12 no-print relative">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <ArrowLeft className="text-slate-600" />
            </button>
            <h1 className="text-2xl font-bold text-slate-800">
                {initialData ? 'Modificar equipo' : 'Registrar equipo'}
            </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Image */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          {/* Hidden File Input */}
          <input 
             type="file" 
             ref={fileInputRef} 
             onChange={handleFileUpload} 
             accept="image/*" 
             className="hidden" 
          />
          
          <div className="aspect-square bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group">
            {formData.foto ? (
              <>
                <img src={getPhotoUrl(formData.foto, 'mediana')} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                    <button 
                      type="button"
                      onClick={() => openCamera()}
                      className="bg-white text-slate-900 px-4 py-2 rounded-lg font-medium hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Camera size={18} /> Tomar otra foto
                    </button>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white text-slate-900 px-4 py-2 rounded-lg font-medium hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Upload size={18} /> Cargar otra imagen
                    </button>
                </div>
              </>
            ) : (
              <div className="text-center p-6 w-full">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ImageIcon size={32} />
                </div>
                <p className="text-slate-500 text-sm mb-4">Agrega una foto</p>
                <div className="flex flex-col gap-2">
                    <button 
                        type="button"
                        onClick={() => openCamera()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 w-full flex items-center justify-center gap-2"
                    >
                        <Camera size={18} /> Tomar foto
                    </button>
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 w-full flex items-center justify-center gap-2"
                    >
                        <Upload size={18} /> Cargar Imagen
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Form Fields */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre, modelo</label>
              <input 
                type="text" 
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
              <textarea 
                name="description"
                rows={3}
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Ingresa una descripción detallada del equipo, incluyendo características importantes."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
              <input 
                type="text" 
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                list="categories"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <datalist id="categories">
                <option value="Adaptador"/>
                <option value="Audio"/>
                <option value="Batería"/>
                <option value="Red"/>
                <option value="Cámara"/>
                <option value="Cargador"/>
                <option value="Celular"/>
                <option value="PC"/>
                <option value="Consola de audio"/>
                <option value="Control"/>
                <option value="Control Stream"/>
                <option value="Difusor"/>
                <option value="Iluminación"/>
                <option value="Comunicación"/>
                <option value="Laptop"/>
                <option value="Licencia"/>
                <option value="Tripode"/>
                <option value="Maleta"/>
                <option value="Pedestal"/>
                <option value="Switch"/>
                <option value="Tablet"/>
                <option value="Teclado"/>
                <option value="Transmisor de video"/>
              </datalist>
            </div>

            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Serie / Codigo de barra</label>
               <input
                 type="text"
                 name="serie"
                 value={formData.serie}
                 onChange={handleInputChange}
                 className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
               />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Condición</label>
              <select 
                name="condition"
                value={formData.condition}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option>Funcional</option>
                <option>Necesita renovarse</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select 
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option>Activo</option>
                <option>En Mantenimiento</option>
                <option>En Prestamo</option>
                <option>Dado de baja</option>
                <option>Extraviado</option>
              </select>
            </div>

             <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación</label>
              <input 
                type="text" 
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                list="ubicaciones"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <datalist id="ubicaciones">
                <option value="Piso 4"/>
                <option value="Piso 1"/>
                <option value="Agencia Sur"/>
                <option value="Bulla"/>
                <option value="Ventura"/>
                <option value="Las Brisas"/>
                <option value="La Paz"/>
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor (USD)</label>
              <input 
                type="number" 
                name="precio"
                value={formData.precio}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preveedor</label>
                <div className="relative">
                    <select 
                        name="providerId"
                        value={formData.providerId}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                    >
                        <option value="">Elije un proveedor</option>
                        {providers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <Building2 className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de compra</label> 
                <input 
                    type="date" 
                    name="fechaCompra"
                    value={formData.fechaCompra}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
            </div>
            
            {/* Assignment Section */}
            <div className="col-span-2 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <h3 className="text-indigo-900 font-semibold mb-3 flex items-center gap-2">
                    <UserCheck size={18} /> Asignación de equipo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-indigo-700 mb-1">Persona asignada</label>
                        <select
                            name="assignedEmployeeId"
                            value={formData.assignedEmployeeId}
                            onChange={handleEmployeeChange}
                            className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        >
                            <option value="">-- no asignado --</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.equipo})</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <div className="text-xs text-indigo-600 leading-relaxed">
                            Al cambiar el responsable, se le ofrecerá la opción de generar un <strong>Acta de Asignación</strong> automática al guardar.
                        </div>
                    </div>
                </div>
            </div>

          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button 
              type="button" 
              onClick={onCancel}
              className="px-6 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm shadow-blue-500/30 transition-all active:scale-95"
            >
              {'Guardar'}
            </button>
          </div>
        </div>
      </form>
      
      {/* Auto-Assignment Modal */}
      {showAssignmentModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-indigo-600 p-4 flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-lg text-white">
                          <FileText size={24} />
                      </div>
                      <h3 className="text-white font-bold text-lg">Nueva Asignación Detectada</h3>
                  </div>
                  
                  <div className="p-6">
                      <div className="flex gap-4 mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                           <AlertTriangle className="text-indigo-500 shrink-0" size={24} />
                           <p className="text-sm text-indigo-900">
                               Se ha cambiado el responsable a <strong>{employees.find(e => e.id === formData.assignedEmployeeId)?.name}</strong>. 
                               <br/>¿Desea generar un acta oficial de asignación?
                           </p>
                      </div>

                      <div className="mb-6">
                          <label className="block text-sm font-medium text-slate-700 mb-2">Autorizado Por:</label>
                          <select 
                             className={inputCls}
                             value={assignmentAuthorizerId}
                             onChange={(e) => setAssignmentAuthorizerId(e.target.value)}
                          >
                              <option value="">Seleccione autorizador...</option>
                              {employees.map(e => (
                                  <option key={e.id} value={e.id}>{e.name}</option>
                              ))}
                          </select>
                      </div>

                      <div className="flex flex-col gap-3">
                          <button 
                              onClick={handleCreateAssignmentAndSave}
                              disabled={!assignmentAuthorizerId || isSavingAssignment}
                              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30"
                          >
                              {isSavingAssignment ? 'Procesando...' : (
                                  <>
                                    <Check size={18} /> Generar Acta y Guardar
                                  </>
                              )}
                          </button>
                          
                          <button 
                              onClick={() => { setShowAssignmentModal(false); processSave(); }}
                              disabled={isSavingAssignment}
                              className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium"
                          >
                              Solo Guardar Cambios
                          </button>

                          <button 
                              onClick={() => setShowAssignmentModal(false)}
                              disabled={isSavingAssignment}
                              className="w-full py-2 text-slate-500 hover:text-slate-800 hover:underline font-medium text-sm"
                          >
                              Cancelar
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleImageCapture}
      />
    </div>
  );
};

export default InventoryForm;