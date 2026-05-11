import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { MaterialSale } from '../types';
import { Save, Plus, Trash2, Calendar, Printer, CreditCard, Banknote, Building2, Search, History } from 'lucide-react';

import MaterialInvoiceModal from './MaterialInvoiceModal';
import AdminFilterBar from './AdminFilterBar';

const MaterialSales: React.FC = () => {
    const context = useContext(AppContext);
    if (!context) return null;

    const { materialSales, setMaterialSales, settings, inventory, setInventory, customers, currentBranch, currentUser, activeBranchId, isAllBranchesScope, getBranchName } = context;
    const branchId = currentBranch?.id || (activeBranchId !== 'all' ? activeBranchId : currentUser?.branchId || 'MAIN');
    const [salesSearchTerm, setSalesSearchTerm] = useState('');

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card' | 'Bank Transfer'>('Cash');
    const [customerName, setCustomerName] = useState<string>('Walk in Customer');
    const [discount, setDiscount] = useState<string>(''); // Added discount state
    const [paidAmount, setPaidAmount] = useState<string>('');
    const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<MaterialSale | null>(null);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowCustomerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredCustomers = useMemo(() => {
        if (!customerName || customerName === 'Walk in Customer') return [...customers].reverse();
        return [...customers].reverse().filter(c =>
            c.name.toLowerCase().includes(customerName.toLowerCase()) ||
            c.phone.includes(customerName)
        );
    }, [customers, customerName]);

    // Sale Items State (Dynamic Rows)
    const [saleRows, setSaleRows] = useState<{ itemId: string; quantity: string; unitPrice: string }[]>([
        { itemId: '', quantity: '', unitPrice: '' }
    ]);

    const addRow = () => setSaleRows([...saleRows, { itemId: '', quantity: '', unitPrice: '' }]);
    const removeRow = (index: number) => setSaleRows(saleRows.filter((_, i) => i !== index));

    const updateRow = (index: number, field: 'itemId' | 'quantity' | 'unitPrice', value: string) => {
        const newRows = [...saleRows];
        newRows[index] = { ...newRows[index], [field]: value };

        // Auto-fill price if item is selected
        if (field === 'itemId') {
            const selectedItem = inventory.find(i => i.id === value);
            if (selectedItem) {
                // Now using mrp as the default selling price
                newRows[index].unitPrice = (selectedItem.mrp || selectedItem.unitPrice).toString();
            }
        }
        setSaleRows(newRows);
    };

    const grandTotalBeforeDiscount = useMemo(() => {
        return saleRows.reduce((sum, row) => {
            const qty = parseFloat(row.quantity);
            const price = parseFloat(row.unitPrice);
            if (isNaN(qty) || isNaN(price)) return sum;
            return sum + (qty * price);
        }, 0);
    }, [saleRows]);

    const grandTotal = useMemo(() => {
        const disc = parseFloat(discount) || 0;
        return Math.max(0, grandTotalBeforeDiscount - disc);
    }, [grandTotalBeforeDiscount, discount]);

    // Filter for today's sales list (Daily Total)
    const todaysSales = useMemo(() => {
        return materialSales.filter(sale => {
            if (sale.date !== date) return false;
            if (!salesSearchTerm.trim()) return true;
            const search = salesSearchTerm.toLowerCase();
            return (
                (sale.customerName || 'walk in customer').toLowerCase().includes(search) ||
                sale.items.some(item => item.category.toLowerCase().includes(search)) ||
                sale.id.toLowerCase().includes(search)
            );
        });
    }, [date, materialSales, salesSearchTerm]);

    // Calculate all-time shop total for materials
    const totalShopMaterialSales = useMemo(() => {
        return (materialSales || []).reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);
    }, [materialSales]);

    const todaysTotalRevenue = useMemo(() => {
        return todaysSales.reduce((sum, sale) => sum + (Number(sale.totalAmount) || 0), 0);
    }, [todaysSales]);

    const handleSave = () => {
        const validRows = saleRows.filter(r => r.itemId && parseFloat(r.quantity) > 0 && parseFloat(r.unitPrice) > 0);

        if (validRows.length === 0) {
            alert("Please select at least one item and enter valid quantity/price.");
            return;
        }

        // Check stock availability
        for (const row of validRows) {
            const invItem = inventory.find(i => i.id === row.itemId);
            if (invItem && invItem.quantity < parseFloat(row.quantity)) {
                alert(`Insufficient stock for ${invItem.name}. Available: ${invItem.quantity}`);
                return;
            }
        }

        const finalPaid = paidAmount === '' ? grandTotal : parseFloat(paidAmount);

        const newSale: MaterialSale = {
            id: `MS-${Date.now()}`,
            branchId,
            date,
            items: validRows.map(row => {
                const invItem = inventory.find(i => i.id === row.itemId);
                const q = parseFloat(row.quantity);
                const p = parseFloat(row.unitPrice);
                return {
                    itemId: row.itemId, // Store itemId for reversion
                    category: invItem?.name || 'Unknown',
                    quantity: q,
                    unitPrice: p,
                    costPrice: invItem?.unitPrice || 0, // Storing cost price for profit calculation
                    amount: q * p
                };
            }),
            totalAmount: grandTotalBeforeDiscount,
            discount: parseFloat(discount) || 0,
            paidAmount: finalPaid,
            paymentMethod: paymentMethod,
            customerName: customerName || 'Walk in Customer',
            status: finalPaid < grandTotal ? 'Due' : 'Paid'
        };

        // Update Inventory Stock
        const updatedInventory = [...inventory];
        validRows.forEach(row => {
            const idx = updatedInventory.findIndex(i => i.id === row.itemId);
            if (idx !== -1) {
                updatedInventory[idx] = {
                    ...updatedInventory[idx],
                    quantity: updatedInventory[idx].quantity - parseFloat(row.quantity),
                    lastUpdated: new Date().toISOString().split('T')[0]
                };
            }
        });

        setMaterialSales(prev => [...prev, newSale]);
        setInventory(updatedInventory);

        // Reset Form
        setSaleRows([{ itemId: '', quantity: '', unitPrice: '' }]);
        setPaymentMethod('Cash');
        setCustomerName('Walk in Customer');
        setDiscount('');
        setPaidAmount('');

        if (window.confirm("Sale Processed! Would you like to print the invoice?")) {
            setSelectedSaleForInvoice(newSale);
        }
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this sale? This will revert the inventory stock. Continue?")) {
            const saleToDelete = materialSales.find(s => s.id === id);
            if (saleToDelete) {
                // Revert Inventory Stock
                const updatedInventory = [...inventory];
                saleToDelete.items.forEach(item => {
                    const idx = updatedInventory.findIndex(i => i.id === item.itemId);
                    if (idx !== -1) {
                        updatedInventory[idx] = {
                            ...updatedInventory[idx],
                            quantity: updatedInventory[idx].quantity + item.quantity,
                            lastUpdated: new Date().toISOString().split('T')[0]
                        };
                    }
                });
                setInventory(updatedInventory);
            }
            setMaterialSales(prev => prev.filter(s => s.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Material Sales</h1>
                <div className="flex items-center space-x-2">
                    <Calendar className="text-gray-500" size={20} />
                    <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>

            <AdminFilterBar
                searchTerm={salesSearchTerm}
                onSearchChange={setSalesSearchTerm}
                searchPlaceholder="Search customer, material, or sale ID..."
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Entry Form */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">

                        {/* Customer Selection */}
                        <div className="mb-6 relative" ref={dropdownRef}>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Customer Name</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    className="w-full border p-3 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-semibold pr-10"
                                    placeholder="Type name or phone..."
                                    value={customerName}
                                    onChange={(e) => {
                                        setCustomerName(e.target.value);
                                        setShowCustomerDropdown(true);
                                    }}
                                    onFocus={() => setShowCustomerDropdown(true)}
                                />
                                <Search className="absolute right-3 top-3 text-gray-400" size={18} />
                            </div>

                            {showCustomerDropdown && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                                    <div
                                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm font-bold text-indigo-600"
                                        onClick={() => {
                                            setCustomerName('Walk in Customer');
                                            setShowCustomerDropdown(false);
                                        }}
                                    >
                                        Walk in Customer
                                    </div>
                                    {filteredCustomers.length > 0 ? (
                                        filteredCustomers.map(c => (
                                            <div key={c.id} className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm border-t border-gray-50" onClick={() => {
                                                setCustomerName(c.name);
                                                setShowCustomerDropdown(false);
                                            }}>
                                                <p className="font-bold text-gray-800">{c.name}</p>
                                                <p className="text-xs text-gray-500">{c.phone}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="px-4 py-2 text-sm text-gray-400 italic">No customers found</div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="p-5 bg-indigo-50 rounded-xl border border-indigo-100 text-center shadow-sm cursor-pointer hover:bg-indigo-100 transition-all group"
                            >
                                <h2 className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest mb-1 group-hover:text-indigo-600">Total Shop Material Sales</h2>
                                <p className="text-3xl font-black text-indigo-900">Rs. {totalShopMaterialSales.toLocaleString()}</p>
                                <p className="text-[10px] text-indigo-400 mt-1 font-bold animate-pulse">Click to view history</p>
                            </div>

                            <div className="p-5 rounded-xl border transition-all duration-300 text-center shadow-sm bg-gray-50 border-gray-100">
                                <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Sub Total</h2>
                                <p className="text-2xl font-black text-gray-700">
                                    Rs. {grandTotalBeforeDiscount.toLocaleString()}
                                </p>
                            </div>

                            <div className={`p-5 rounded-xl border transition-all duration-300 text-center shadow-sm ${grandTotal > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Final Total</h2>
                                <p className={`text-3xl font-black ${grandTotal > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                                    Rs. {grandTotal.toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Header */}
                            <div className="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 uppercase mb-2">
                                <div className="col-span-5">Select Item</div>
                                <div className="col-span-2 text-center">Qty</div>
                                <div className="col-span-2 text-center">Price</div>
                                <div className="col-span-2 text-right">Amnt</div>
                                <div className="col-span-1"></div>
                            </div>

                            {/* Rows */}
                            {saleRows.map((row, index) => (
                                <div key={index} className="grid grid-cols-12 gap-4 items-center animate-in slide-in-from-left-2 duration-200">
                                    <div className="col-span-5">
                                        <select
                                            value={row.itemId}
                                            onChange={e => updateRow(index, 'itemId', e.target.value)}
                                            className="w-full border p-2 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        >
                                            <option value="">Choose Material...</option>
                                            {inventory.filter(item => {
                                                const cat = item.category.toLowerCase();
                                                const name = item.name.toLowerCase();
                                                // Include items if category is Material/Cloth OR if it's a specific dress type OR if name has material keywords
                                                const isMaterialType = ['material', 'cloth', 'fabric', 'piece', 'shirt', 'trouser', 'school shirt', 'school trouser', 'thobe', 'jubbah', 'kurta', 'coat', 'waistcoat'].some(c => cat.includes(c));
                                                const hasMaterialKeyword = name.includes('material') || name.includes('cloth') || name.includes('fabric') || name.includes('piece');
                                                return isMaterialType || hasMaterialKeyword;
                                            }).map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.quantity} available)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            placeholder="0"
                                            className="w-full border p-2 rounded-lg text-center text-sm"
                                            value={row.quantity}
                                            onChange={e => updateRow(index, 'quantity', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            className="w-full border p-2 rounded-lg text-center text-sm"
                                            value={row.unitPrice}
                                            onChange={e => updateRow(index, 'unitPrice', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-span-2 text-right font-bold text-gray-800 text-sm">
                                        {(parseFloat(row.quantity) * parseFloat(row.unitPrice) || 0).toLocaleString()}
                                    </div>
                                    <div className="col-span-1 text-right">
                                        {saleRows.length > 1 && (
                                            <button onClick={() => removeRow(index)} className="text-red-400 hover:text-red-600 p-1">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={addRow}
                                className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:text-indigo-800 transition-colors py-2"
                            >
                                <Plus size={16} />
                                Add Another Item
                            </button>
                        </div>

                        {/* Payment Details */}
                        <div className="mt-8 pt-6 border-t border-slate-100">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Discount (Rs.)</label>
                                    <input
                                        type="number"
                                        className="w-full border-2 border-slate-200 p-3 rounded-xl text-lg font-black text-red-600 focus:border-red-400 outline-none transition-all"
                                        placeholder="0.00"
                                        value={discount}
                                        onChange={(e) => setDiscount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Amount Paid (Rs.)</label>
                                    <input
                                        type="number"
                                        className="w-full border-2 border-slate-200 p-3 rounded-xl text-lg font-black text-emerald-700 focus:border-emerald-500 outline-none transition-all"
                                        placeholder={grandTotal.toString()}
                                        value={paidAmount}
                                        onChange={(e) => setPaidAmount(e.target.value)}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1 italic">Leave empty for full payment</p>
                                </div>
                                <div className="flex flex-col justify-center items-end p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Due Balance</span>
                                    <span className={`text-2xl font-black ${grandTotal - (paidAmount === '' ? grandTotal : parseFloat(paidAmount)) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        Rs. {(grandTotal - (paidAmount === '' ? grandTotal : parseFloat(paidAmount))).toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Payment Method</label>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('Cash')}
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 transition-all ${paymentMethod === 'Cash'
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                >
                                    <Banknote size={18} /> Cash
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('Card')}
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 transition-all ${paymentMethod === 'Card'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                >
                                    <CreditCard size={18} /> Card
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('Bank Transfer')}
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 transition-all ${paymentMethod === 'Bank Transfer'
                                        ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                >
                                    <Building2 size={18} /> Bank
                                </button>
                            </div>
                        </div>

                        <div className="mt-6">
                            <button
                                onClick={handleSave}
                                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition shadow-lg flex items-center justify-center gap-2"
                            >
                                <Save size={20} />
                                Record Sale
                            </button>
                        </div>
                    </div>
                </div>

                {/* Daily Summary Side Panel */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center justify-between">
                            <span>Sales For {date}</span>
                            <span className="text-emerald-600">Rs. {todaysTotalRevenue.toLocaleString()}</span>
                        </h3>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                            {todaysSales.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 italic">No sales recorded today</div>
                            ) : (
                                todaysSales.map(sale => (
                                    <div key={sale.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-indigo-100 transition group relative">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-xs font-bold text-gray-400">#{sale.id.slice(-6)}</span>
                                                <p className="text-xs font-black text-slate-800 uppercase mt-1">{sale.customerName || 'Walk in Customer'}</p>
                                                {sale.status === 'Due' && <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[9px] font-black uppercase">Due: Rs. {(sale.totalAmount - sale.paidAmount).toLocaleString()}</span>}
                                                {isAllBranchesScope && (
                                                    <span className="mt-2 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                                                        {getBranchName(sale.branchId)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSelectedSaleForInvoice(sale)}
                                                    className="bg-indigo-100 text-indigo-600 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:text-white"
                                                    title="Print Invoice"
                                                >
                                                    <Printer size={12} />
                                                </button>
                                                <div className="text-right">
                                                    <p className="font-bold text-indigo-700">Rs. {sale.totalAmount.toLocaleString()}</p>
                                                    <p className="text-[9px] text-gray-400 italic">Paid: {(sale.paidAmount ?? sale.totalAmount).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            {sale.items.map((item, idx) => (
                                                <div key={idx} className="text-xs text-gray-600 flex justify-between">
                                                    <span>{item.category} ({item.quantity})</span>
                                                    <span>{item.amount.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => handleDelete(sale.id)}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-md hover:bg-red-600"
                                            title="Delete Sale"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-100">
                        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">Material Sales History</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Complete shop-wide records</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                                    <p className="text-[8px] font-black text-emerald-600 uppercase">Total Volume</p>
                                    <p className="text-xl font-black text-emerald-700">Rs. {totalShopMaterialSales.toLocaleString()}</p>
                                </div>
                                <button
                                    onClick={() => setIsHistoryModalOpen(false)}
                                    className="p-2.5 bg-slate-100 rounded-full hover:bg-red-50 hover:text-red-500 transition-all text-slate-500 active:scale-90"
                                >
                                    <Plus className="rotate-45" size={24} />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
                            {materialSales.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                                    <History size={64} className="mb-4" />
                                    <p className="font-bold text-xl uppercase italic">No sale records found</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {[...materialSales].reverse().map(sale => (
                                        <div key={sale.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded italic">#{sale.id.slice(-8).toUpperCase()}</span>
                                                        <span className="text-xs font-bold text-slate-400">{sale.date}</span>
                                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${sale.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                            {sale.status}
                                                        </span>
                                                        {isAllBranchesScope && (
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                                                                {getBranchName(sale.branchId)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">{sale.customerName || 'Walk in Customer'}</h3>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {sale.items.map((item, idx) => (
                                                            <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                                                <span className="text-indigo-600">{item.quantity}x</span>
                                                                <span className="flex-1 truncate">{item.category}</span>
                                                                <span className="text-slate-700">Rs. {item.amount.toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6 pl-4 md:border-l border-slate-100">
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Sale Details</p>
                                                        <p className="text-xs font-bold text-slate-500">Sub: Rs. {sale.totalAmount.toLocaleString()}</p>
                                                        {sale.discount ? <p className="text-xs font-bold text-red-500">Disc: -Rs. {sale.discount.toLocaleString()}</p> : null}
                                                        <p className="text-xl font-black text-slate-900">Total: Rs. {(sale.totalAmount - (sale.discount || 0)).toLocaleString()}</p>
                                                        <p className="text-[10px] font-bold text-emerald-600">Paid: Rs. {sale.paidAmount?.toLocaleString() || (sale.totalAmount - (sale.discount || 0)).toLocaleString()}</p>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <button
                                                            onClick={() => setSelectedSaleForInvoice(sale)}
                                                            className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-95"
                                                            title="Print Invoice"
                                                        >
                                                            <Printer size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(sale.id)}
                                                            className="p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                                                            title="Undo / Delete Sale"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span>Showing {materialSales.length} Total Records</span>
                            <span>VIP Tailors Management System</span>
                        </div>
                    </div>
                </div>
            )}

            {selectedSaleForInvoice && (
                <MaterialInvoiceModal
                    sale={selectedSaleForInvoice}
                    onClose={() => setSelectedSaleForInvoice(null)}
                />
            )}
        </div>
    );
};


export default MaterialSales;
