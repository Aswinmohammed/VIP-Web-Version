import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { Customer } from '../types';
import { PlusCircle, Edit, Trash2, MapPin } from 'lucide-react';
import CustomerForm from './CustomerForm';
import AdminFilterBar from './AdminFilterBar';


const Customers: React.FC = () => {
  const context = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);

  if (!context) return <div>Loading...</div>;
  const { customers, saveCustomer, deleteCustomer, isAllBranchesScope, getBranchName } = context;

  const handleSave = async (customer: Customer) => {
    try {
      await saveCustomer(editingCustomer ? { ...customer, id: editingCustomer.id } : { ...customer, id: `CUST${Date.now()}` });
      setIsModalOpen(false);
      setEditingCustomer(undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save customer.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await deleteCustomer(id);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Unable to delete customer.');
      }
    }
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) return `${match[1]} ${match[2]} ${match[3]}`;
    return phone;
  };

  // Logic: Reverses the array to show most recent at the top, then filters by search
  const filteredCustomers = [...customers]
    .reverse()
    .filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      c.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <h1 className="text-4xl font-bold text-gray-800">Customers</h1>
        <button onClick={() => { setEditingCustomer(undefined); setIsModalOpen(true); }} className="inline-flex items-center justify-center px-4 py-2 mt-4 sm:mt-0 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700">
          <PlusCircle className="w-5 h-5 mr-2" /> Add Customer
        </button>
      </div>

      <AdminFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search name, phone, or location..."
      />

      <div className="space-y-4 md:hidden">
        {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
          <div key={customer.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-900">{customer.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{formatPhoneNumber(customer.phone)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }} className="rounded-lg bg-blue-50 p-2 text-blue-600" title="Edit"><Edit size={18} /></button>
                <button onClick={() => handleDelete(customer.id)} className="rounded-lg bg-red-50 p-2 text-red-600" title="Delete"><Trash2 size={18} /></button>
              </div>
            </div>
            <div className="mt-3 flex items-center text-sm text-slate-600">
              <MapPin size={14} className="mr-2 text-slate-400" />
              {customer.address}
            </div>
            {isAllBranchesScope && (
              <div className="mt-3">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                  {getBranchName(customer.branchId)}
                </span>
              </div>
            )}
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
            No customers found.
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg bg-white shadow-md md:block">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3">Name</th>
              <th scope="col" className="px-6 py-3">Phone</th>
              {/* Table header renamed to Location */}
              <th scope="col" className="px-6 py-3">Location</th>
              {isAllBranchesScope && <th scope="col" className="px-6 py-3">Branch</th>}
              <th scope="col" className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map(customer => (
              <tr key={customer.id} className="bg-white border-b hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</td>
                <td className="px-6 py-4">{formatPhoneNumber(customer.phone)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <MapPin size={14} className="mr-1 text-gray-400" />
                    {customer.address}
                  </div>
                </td>
                {isAllBranchesScope && <td className="px-6 py-4 font-semibold text-slate-600">{getBranchName(customer.branchId)}</td>}
                <td className="px-6 py-4 flex space-x-2">
                  <button onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:text-blue-800 transition-colors" title="Edit"><Edit size={18} /></button>
                  <button onClick={() => handleDelete(customer.id)} className="p-2 text-red-600 hover:text-red-800 transition-colors" title="Delete"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && <CustomerForm customer={editingCustomer} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default Customers;
