import React from 'react';
import { InventoryItem } from '../types';

interface AssignmentFormProps {
  items: InventoryItem[];
  onClose: () => void;
}

const AssignmentForm: React.FC<AssignmentFormProps> = ({ items, onClose }) => {
  // Calculate Total Value
  const totalValue = items.reduce((sum, item) => sum + (Number(item.precio) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-auto">
      {/* Print Toolbar - Hidden when printing */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-slate-800 text-white p-4 flex justify-between items-center shadow-md">
         <h2 className="font-bold text-lg">Print Preview</h2>
         <div className="flex gap-4">
            <button onClick={onClose} className="px-4 py-2 text-sm hover:bg-slate-700 rounded">Close</button>
            <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">Print Form</button>
         </div>
      </div>

      {/* Printable Content */}
      <div className="max-w-[21cm] mx-auto bg-white pt-24 pb-12 px-8 min-h-screen print:pt-0 print:px-0">
        
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-8 flex justify-between items-end">
           <div>
              <h1 className="text-3xl font-bold uppercase tracking-wider">Equipo Assignment</h1>
              <p className="text-sm text-gray-600 mt-1">Inventory Handover Document</p>
           </div>
           <div className="text-right">
              <p className="text-sm font-semibold">Date: <span className="font-normal underline decoration-dotted">{new Date().toLocaleDateString()}</span></p>
              <p className="text-sm font-semibold mt-1">Ref No: <span className="font-normal">ASN-{Math.floor(Math.random() * 10000)}</span></p>
           </div>
        </div>

        {/* Employee Section */}
        <div className="bg-gray-50 p-4 rounded border border-gray-200 mb-8 print:bg-transparent print:border-black print:border">
           <div className="grid grid-cols-2 gap-8">
              <div>
                 <p className="text-xs font-bold uppercase text-gray-500 mb-1">Assigned To (Employee)</p>
                 <div className="border-b border-black h-8"></div>
              </div>
              <div>
                 <p className="text-xs font-bold uppercase text-gray-500 mb-1">Department / Location</p>
                 <div className="border-b border-black h-8"></div>
              </div>
           </div>
        </div>

        {/* Items Table */}
        <div className="mb-8">
           <h3 className="font-bold text-lg mb-2">Assigned Items</h3>
           <table className="w-full text-left border-collapse border border-black">
              <thead>
                 <tr className="bg-gray-100 print:bg-gray-200">
                    <th className="border border-black p-2 text-sm">Item Name</th>
                    <th className="border border-black p-2 text-sm">Category</th>
                    <th className="border border-black p-2 text-sm">Barcode/Serial</th>
                    <th className="border border-black p-2 text-sm">Condition</th>
                    <th className="border border-black p-2 text-sm text-right">Value</th>
                 </tr>
              </thead>
              <tbody>
                 {items.map((item) => (
                    <tr key={item.id}>
                       <td className="border border-black p-2 text-sm">{item.name}</td>
                       <td className="border border-black p-2 text-sm">{item.category}</td>
                       <td className="border border-black p-2 text-sm font-mono">{item.serie}</td>
                       <td className="border border-black p-2 text-sm">{item.condition}</td>
                       <td className="border border-black p-2 text-sm text-right">${Number(item.precio).toLocaleString()}</td>
                    </tr>
                 ))}
              </tbody>
              <tfoot>
                 <tr>
                    <td colSpan={4} className="border border-black p-2 text-right font-bold">Total Value</td>
                    <td className="border border-black p-2 text-right font-bold">${totalValue.toLocaleString()}</td>
                 </tr>
              </tfoot>
           </table>
        </div>

        {/* Terms */}
        <div className="mb-12 text-xs text-gray-600 text-justify leading-relaxed">
           <p>I hereby acknowledge receipt of the Equipo listed above. I agree to maintain the Equipo in good condition and return it upon request or termination of employment. I understand that I am responsible for any loss or damage resulting from negligence.</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-16 mt-16">
           <div>
              <div className="border-b border-black mb-2"></div>
              <p className="text-sm font-bold">Employee Signature</p>
              <p className="text-xs text-gray-500">Received By</p>
           </div>
           <div>
              <div className="border-b border-black mb-2"></div>
              <p className="text-sm font-bold">Manager / Admin Signature</p>
              <p className="text-xs text-gray-500">Authorized By</p>
           </div>
        </div>

      </div>
    </div>
  );
};

export default AssignmentForm;