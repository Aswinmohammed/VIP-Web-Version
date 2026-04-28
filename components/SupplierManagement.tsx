import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { Supplier, SupplierPurchase, SupplierPayment } from '../types';
import { PlusCircle, Search, User, Phone, DollarSign, Calendar, Printer, Trash2, ArrowLeft, X, Truck, Banknote, Landmark, Eye, Lock, Edit, Loader2 } from 'lucide-react';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';

const SupplierManagement: React.FC = () => {
    const context = useContext(AppContext);
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAccessGranted, setIsAccessGranted] = useState(true);
    const [passwordInput, setPasswordInput] = useState('');

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newSupplier, setNewSupplier] = useState({ name: '', phone: '' });

    const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
    const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

    // Entry state
    const [purchaseEntry, setPurchaseEntry] = useState({
        description: '',
        quantity: '',
        unitPrice: '',
        amount: '',
        date: new Date().toISOString().split('T')[0]
    });

    const [paymentEntry, setPaymentEntry] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        method: 'Money' as 'Cheque' | 'Bank Transfer' | 'Money',
        note: ''
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [breakdownModal, setBreakdownModal] = useState<'purchase' | 'paid' | 'due' | null>(null);

    // Auto-calculate purchase amount
    React.useEffect(() => {
        const q = parseFloat(purchaseEntry.quantity);
        const u = parseFloat(purchaseEntry.unitPrice);
        if (!isNaN(q) && !isNaN(u)) {
            setPurchaseEntry(prev => ({ ...prev, amount: (q * u).toFixed(2) }));
        }
    }, [purchaseEntry.quantity, purchaseEntry.unitPrice]);

    // Date filtering
    const [dateFilter, setDateFilter] = useState({ from: '', to: '' });

    if (!context) return <div>Loading...</div>;
    const { suppliers, setSuppliers, isAllBranchesScope, getBranchName } = context;

    const calculateTotalPurchases = (purchases: SupplierPurchase[] = []) => purchases.reduce((sum, p) => sum + p.amount, 0);
    const calculateTotalPaid = (payments: SupplierPayment[] = []) => payments.reduce((sum, p) => sum + p.amount, 0);

    const filteredSuppliers = useMemo(() => {
        const list = [...suppliers].reverse();
        if (!searchTerm) return list;
        const lower = searchTerm.toLowerCase();
        return list.filter(s => s.name.toLowerCase().includes(lower) || s.phone.includes(lower));
    }, [suppliers, searchTerm]);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordInput === 'VIPT' || passwordInput === 'vipt') {
            setIsAccessGranted(true);
        } else {
            alert('Incorrect Password');
            setPasswordInput('');
        }
    };

    const selectedSupplier = useMemo(() => suppliers.find(s => s.id === selectedSupplierId), [suppliers, selectedSupplierId]);

    // Actions
    const handleAddSupplier = () => {
        if (!newSupplier.name || !newSupplier.phone) return;
        const supplier: Supplier = {
            id: `SUP${Date.now()}`,
            branchId: 'BR001',
            name: newSupplier.name,
            phone: newSupplier.phone,
            purchases: [],
            payments: [],
            joinedDate: new Date().toISOString().split('T')[0]
        };
        setSuppliers([...suppliers, supplier]);
        setNewSupplier({ name: '', phone: '' });
        setIsAddModalOpen(false);
    };

    const handleAddPurchase = () => {
        if (!selectedSupplier || !purchaseEntry.description || !purchaseEntry.amount) return;
        const amount = parseFloat(purchaseEntry.amount);
        const quantity = parseFloat(purchaseEntry.quantity) || 0;
        const unitPrice = parseFloat(purchaseEntry.unitPrice) || 0;
        if (isNaN(amount) || amount <= 0) return;

        let updatedPurchases;
        if (editingPurchaseId) {
            updatedPurchases = selectedSupplier.purchases.map(p => 
                p.id === editingPurchaseId 
                ? { ...p, description: purchaseEntry.description, amount, quantity, unitPrice, date: purchaseEntry.date } 
                : p
            );
            setEditingPurchaseId(null);
        } else {
            const purchase: SupplierPurchase = {
                id: `PUR${Date.now()}`,
                description: purchaseEntry.description,
                quantity: quantity > 0 ? quantity : undefined,
                unitPrice: unitPrice > 0 ? unitPrice : undefined,
                amount: amount,
                date: purchaseEntry.date,
                timestamp: new Date().toLocaleString()
            };
            updatedPurchases = [purchase, ...selectedSupplier.purchases];
        }

        const updatedSupplier = {
            ...selectedSupplier,
            purchases: updatedPurchases
        };

        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? updatedSupplier : s));
        setPurchaseEntry({ description: '', quantity: '', unitPrice: '', amount: '', date: new Date().toISOString().split('T')[0] });
    };

    const startEditPurchase = (purchase: SupplierPurchase) => {
        setEditingPurchaseId(purchase.id);
        setPurchaseEntry({
            description: purchase.description,
            quantity: purchase.quantity?.toString() || '',
            unitPrice: purchase.unitPrice?.toString() || '',
            amount: purchase.amount.toString(),
            date: purchase.date
        });
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAddPayment = () => {
        if (!selectedSupplier || !paymentEntry.amount) return;
        const amount = parseFloat(paymentEntry.amount);
        if (isNaN(amount) || amount <= 0) return;

        let updatedPayments;
        if (editingPaymentId) {
            updatedPayments = selectedSupplier.payments.map(p => 
                p.id === editingPaymentId 
                ? { ...p, amount, date: paymentEntry.date, method: paymentEntry.method, note: paymentEntry.note } 
                : p
            );
            setEditingPaymentId(null);
        } else {
            const payment: SupplierPayment = {
                id: `SPAY${Date.now()}`,
                amount: amount,
                date: paymentEntry.date,
                method: paymentEntry.method,
                timestamp: new Date().toLocaleString(),
                note: paymentEntry.note
            };
            updatedPayments = [payment, ...selectedSupplier.payments];
        }

        const updatedSupplier = {
            ...selectedSupplier,
            payments: updatedPayments
        };

        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? updatedSupplier : s));
        setPaymentEntry({
            amount: '',
            date: new Date().toISOString().split('T')[0],
            method: 'Money',
            note: ''
        });
    };

    const startEditPayment = (payment: SupplierPayment) => {
        setEditingPaymentId(payment.id);
        setPaymentEntry({
            amount: payment.amount.toString(),
            date: payment.date,
            method: payment.method,
            note: payment.note || ''
        });
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteSupplier = (id: string) => {
        if (window.confirm('Delete this supplier?')) {
            setSuppliers(suppliers.filter(s => s.id !== id));
            if (selectedSupplierId === id) setView('list');
        }
    };

    const handleDeletePurchase = (id: string) => {
        if (!selectedSupplier || !window.confirm('Delete this purchase?')) return;
        const updated = { ...selectedSupplier, purchases: selectedSupplier.purchases.filter(p => p.id !== id) };
        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? updated : s));
    };

    const handleDeletePayment = (id: string) => {
        if (!selectedSupplier || !window.confirm('Delete this payment?')) return;
        const updated = { ...selectedSupplier, payments: selectedSupplier.payments.filter(p => p.id !== id) };
        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? updated : s));
    };

    const handleDownloadPDF = async () => {
        if (!selectedSupplier || isGenerating) return;
        
        // Import jsPDF dynamically to avoid issues if needed, but we'll assume it's available as in Orders.tsx
        const { default: jsPDF } = await import('jspdf');
        
        setIsGenerating(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 15;
            let yPos = 20;

            // Branding
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(28);
            pdf.setTextColor(17, 24, 39); // Gray 900
            pdf.text('VIP TAILORS', pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            pdf.setDrawColor(229, 231, 235); // Gray 200
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 10;

            // Report Title & Info
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.setTextColor(31, 41, 55); // Gray 800
            pdf.text('SUPPLIER STATEMENT', margin, yPos);
            
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(107, 114, 128);
            pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, { align: 'right' });
            yPos += 10;

            // Supplier Details Box
            pdf.setFillColor(249, 250, 251); // Gray 50
            pdf.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 2, 2, 'F');
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(17, 24, 39);
            pdf.text(selectedSupplier.name, margin + 5, yPos + 8);
            
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(75, 85, 99); // Gray 600
            pdf.text(`Phone: ${selectedSupplier.phone}`, margin + 5, yPos + 15);
            pdf.text(`Period: ${dateFilter.from || 'Beginning'} - ${dateFilter.to || 'Today'}`, margin + 5, yPos + 21);
            
            // Financial Summary in the box
            const filteredPurchases = selectedSupplier.purchases.filter(p => {
                if (dateFilter.from && p.date < dateFilter.from) return false;
                if (dateFilter.to && p.date > dateFilter.to) return false;
                return true;
            });
            const filteredPayments = selectedSupplier.payments.filter(p => {
                if (dateFilter.from && p.date < dateFilter.from) return false;
                if (dateFilter.to && p.date > dateFilter.to) return false;
                return true;
            });

            const totalPurchased = calculateTotalPurchases(filteredPurchases);
            const totalPaid = calculateTotalPaid(filteredPayments);
            const balance = totalPurchased - totalPaid;

            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(75, 85, 99);
            pdf.text('Balance Due:', pageWidth - margin - 5, yPos + 10, { align: 'right' });
            
            pdf.setFontSize(22);
            pdf.setTextColor(37, 99, 235); // Blue 600
            pdf.text(`Rs. ${balance.toLocaleString()}`, pageWidth - margin - 5, yPos + 20, { align: 'right' });
            yPos += 35;

            // --- TWO COLUMN (T-LEDGER) LAYOUT ---
            const colWidth = (pageWidth - (margin * 2) - 5) / 2; // Split page in half with 5mm gap
            const rightColStart = margin + colWidth + 5;

            // Table Headers
            pdf.setFillColor(31, 41, 55); // Slate 800
            // Left Header (Purchases)
            pdf.rect(margin, yPos, colWidth, 10, 'F');
            // Right Header (Payments)
            pdf.rect(rightColStart, yPos, colWidth, 10, 'F');
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.setTextColor(255, 255, 255);
            
            // Left Header Text
            pdf.text('PURCHASES', margin + (colWidth/2), yPos + 6.5, { align: 'center' });
            // Right Header Text
            pdf.text('PAYMENTS', rightColStart + (colWidth/2), yPos + 6.5, { align: 'center' });
            yPos += 10;

            // Sub-Headers
            pdf.setFillColor(243, 244, 246); // Gray 100
            pdf.rect(margin, yPos, colWidth, 7, 'F');
            pdf.rect(rightColStart, yPos, colWidth, 7, 'F');
            
            pdf.setFontSize(7);
            pdf.setTextColor(75, 85, 99);
            pdf.text('DATE', margin + 2, yPos + 4.5);
            pdf.text('DESCRIPTION', margin + 18, yPos + 4.5);
            pdf.text('AMOUNT', margin + colWidth - 2, yPos + 4.5, { align: 'right' });
            
            pdf.text('DATE', rightColStart + 2, yPos + 4.5);
            pdf.text('METHOD/NOTE', rightColStart + 18, yPos + 4.5);
            pdf.text('AMOUNT', rightColStart + colWidth - 2, yPos + 4.5, { align: 'right' });
            yPos += 7;

            // Data Rows
            const purchases = [...filteredPurchases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const payments = [...filteredPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            const maxRows = Math.max(purchases.length, payments.length);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(31, 41, 55);
            
            for (let i = 0; i < maxRows; i++) {
                if (yPos > 270) {
                    pdf.addPage();
                    yPos = 20;
                    // Redraw sub-headers on new page
                    pdf.setFillColor(243, 244, 246);
                    pdf.rect(margin, yPos, colWidth, 7, 'F');
                    pdf.rect(rightColStart, yPos, colWidth, 7, 'F');
                    pdf.text('DATE', margin + 2, yPos + 4.5);
                    pdf.text('DESCRIPTION', margin + 18, yPos + 4.5);
                    pdf.text('AMOUNT', margin + colWidth - 2, yPos + 4.5, { align: 'right' });
                    pdf.text('DATE', rightColStart + 2, yPos + 4.5);
                    pdf.text('METHOD/NOTE', rightColStart + 18, yPos + 4.5);
                    pdf.text('AMOUNT', rightColStart + colWidth - 2, yPos + 4.5, { align: 'right' });
                    yPos += 7;
                }

                // Zebra striping
                if (i % 2 === 1) {
                    pdf.setFillColor(252, 252, 252);
                    pdf.rect(margin, yPos, colWidth, 7, 'F');
                    pdf.rect(rightColStart, yPos, colWidth, 7, 'F');
                }

                // Purchase Row (Left)
                if (purchases[i]) {
                    pdf.text(purchases[i].date, margin + 2, yPos + 5);
                    const desc = purchases[i].description;
                    pdf.text(desc.length > 30 ? desc.substring(0, 27) + '...' : desc, margin + 18, yPos + 5);
                    pdf.text(purchases[i].amount.toLocaleString(), margin + colWidth - 2, yPos + 5, { align: 'right' });
                }

                // Payment Row (Right)
                if (payments[i]) {
                    pdf.text(payments[i].date, rightColStart + 2, yPos + 5);
                    const method = payments[i].method + (payments[i].note ? ` - ${payments[i].note}` : '');
                    pdf.text(method.length > 30 ? method.substring(0, 27) + '...' : method, rightColStart + 18, yPos + 5);
                    pdf.setTextColor(5, 150, 105); // Emerald 600
                    pdf.text(payments[i].amount.toLocaleString(), rightColStart + colWidth - 2, yPos + 5, { align: 'right' });
                    pdf.setTextColor(31, 41, 55);
                }

                // Middle Divider Line
                pdf.setDrawColor(229, 231, 235);
                pdf.line(margin + colWidth + 2.5, yPos, margin + colWidth + 2.5, yPos + 7);

                yPos += 7;
            }

            // Subtotals
            pdf.setDrawColor(31, 41, 55);
            pdf.line(margin, yPos, margin + colWidth, yPos);
            pdf.line(rightColStart, yPos, rightColStart + colWidth, yPos);
            yPos += 5;

            pdf.setFont('helvetica', 'bold');
            pdf.text('Total Purchases:', margin + 2, yPos);
            pdf.text(`Rs. ${totalPurchased.toLocaleString()}`, margin + colWidth - 2, yPos, { align: 'right' });
            
            pdf.text('Total Payments:', rightColStart + 2, yPos);
            pdf.text(`Rs. ${totalPaid.toLocaleString()}`, rightColStart + colWidth - 2, yPos, { align: 'right' });
            yPos += 10;

            // Net Balance Box
            if (yPos > 260) {
                pdf.addPage();
                yPos = 20;
            }
            pdf.setFillColor(31, 41, 55);
            pdf.rect(pageWidth - margin - 80, yPos, 80, 12, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(10);
            pdf.text('NET BALANCE DUE:', pageWidth - margin - 75, yPos + 7.5);
            pdf.setFontSize(12);
            pdf.text(`Rs. ${balance.toLocaleString()}`, pageWidth - margin - 5, yPos + 7.5, { align: 'right' });
            
            // Footer
            const pageCount = (pdf as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(156, 163, 175);
                pdf.text(`Page ${i} of ${pageCount} | Generated by VIP Tailors Management System`, pageWidth / 2, 285, { align: 'center' });
            }

            const filename = `Supplier_${selectedSupplier.name}_${new Date().toISOString().split('T')[0]}.pdf`;
            const pdfData = pdf.output('datauristring');

            downloadDataUri(filename, pdfData);
            alert('Statement downloaded successfully.');

        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Error generating PDF.');
        } finally {
            setIsGenerating(false);
        }
    };

    if (view === 'detail' && selectedSupplier) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
                <div className="bg-white p-12 rounded-2xl shadow-xl w-full max-w-sm text-center border border-gray-100">
                    <div className="bg-primary-50 p-6 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                        <Lock className="w-10 h-10 text-primary-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Supplier Access</h2>
                    <p className="text-gray-500 font-medium text-xs mb-8">Admin verification required</p>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <input
                            type="password"
                            placeholder="••••••"
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none text-center font-bold text-xl tracking-widest focus:ring-2 focus:ring-primary-500 transition-all font-mono"
                            autoFocus
                        />
                        <button type="submit" className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-primary-700 transition-all">Verify & Unlock</button>
                    </form>
                </div>
            </div>
        );
    }

    if (view === 'detail' && selectedSupplier) {
        const filteredPurchases = selectedSupplier.purchases.filter(p => {
            if (dateFilter.from && p.date < dateFilter.from) return false;
            if (dateFilter.to && p.date > dateFilter.to) return false;
            return true;
        });

        const filteredPayments = selectedSupplier.payments.filter(p => {
            if (dateFilter.from && p.date < dateFilter.from) return false;
            if (dateFilter.to && p.date > dateFilter.to) return false;
            return true;
        });

        const totalPurchased = calculateTotalPurchases(filteredPurchases);
        const totalPaid = calculateTotalPaid(filteredPayments);
        const balance = totalPurchased - totalPaid;

        return (
            <div className="space-y-6">
                <div className="sm:flex sm:items-center sm:justify-between">
                    <button onClick={() => setView('list')} className="flex items-center text-gray-600 hover:text-primary-600 font-medium transition-colors">
                        <ArrowLeft size={20} className="mr-2" /> Back to List
                    </button>
                    <div className="flex items-center gap-3 mt-4 sm:mt-0">
                        <div className="flex items-center gap-2 bg-white p-2 rounded-md border shadow-sm text-sm">
                             <input type="date" value={dateFilter.from} onChange={e => setDateFilter({ ...dateFilter, from: e.target.value })} className="border-none focus:ring-0 p-0" />
                             <span className="text-gray-400">-</span>
                             <input type="date" value={dateFilter.to} onChange={e => setDateFilter({ ...dateFilter, to: e.target.value })} className="border-none focus:ring-0 p-0" />
                             {(dateFilter.from || dateFilter.to) && <button onClick={() => setDateFilter({ from: '', to: '' })}><X size={14} /></button>}
                        </div>
                        <button 
                            onClick={handleDownloadPDF} 
                            disabled={isGenerating}
                            className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-md font-bold hover:bg-black transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Printer size={18} className="mr-2" />} 
                            {isGenerating ? 'Generating...' : 'Professional PDF'}
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{selectedSupplier.name}</h1>
                            <p className="text-gray-500 font-medium mt-1 uppercase tracking-wider text-xs">{selectedSupplier.phone}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Purchased</p>
                            <p className="text-xl font-bold text-gray-900">Rs. {totalPurchased.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Paid</p>
                            <p className="text-xl font-bold text-emerald-600">Rs. {totalPaid.toLocaleString()}</p>
                        </div>
                        <div className="bg-primary-50 p-4 rounded-lg border border-primary-100 text-right">
                            <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-1">Balance Due</p>
                            <p className="text-2xl font-bold text-primary-700">Rs. {balance.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
                            <div className="flex items-center">
                                <PlusCircle size={20} className="mr-2 text-primary-600" /> 
                                {editingPurchaseId ? 'Edit Purchase' : 'Log Purchase'}
                            </div>
                            {editingPurchaseId && (
                                <button 
                                    onClick={() => {
                                        setEditingPurchaseId(null);
                                        setPurchaseEntry({ description: '', quantity: '', unitPrice: '', amount: '', date: new Date().toISOString().split('T')[0] });
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold"
                                >
                                    Cancel Edit
                                </button>
                            )}
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <input type="text" value={purchaseEntry.description} onChange={e => setPurchaseEntry({ ...purchaseEntry, description: e.target.value })} placeholder="Ex: Cotton Fabric Roll" className="w-full border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                    <input type="number" value={purchaseEntry.quantity} onChange={e => setPurchaseEntry({ ...purchaseEntry, quantity: e.target.value })} placeholder="0" className="w-full border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (Rs.)</label>
                                    <input type="number" value={purchaseEntry.unitPrice} onChange={e => setPurchaseEntry({ ...purchaseEntry, unitPrice: e.target.value })} placeholder="0.00" className="w-full border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount (Rs.)</label>
                                    <input type="number" value={purchaseEntry.amount} onChange={e => setPurchaseEntry({ ...purchaseEntry, amount: e.target.value })} placeholder="0.00" className="w-full border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 shadow-sm font-bold bg-gray-50" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input type="date" value={purchaseEntry.date} onChange={e => setPurchaseEntry({ ...purchaseEntry, date: e.target.value })} className="w-full border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 shadow-sm" />
                                </div>
                            </div>
                            <button onClick={handleAddPurchase} className={`w-full py-2.5 text-white rounded-md font-bold transition-colors shadow-sm ${editingPurchaseId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary-600 hover:bg-primary-700'}`}>
                                {editingPurchaseId ? 'Update Purchase' : 'Save Purchase'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
                            <div className="flex items-center">
                                <DollarSign size={20} className="mr-2 text-emerald-600" /> 
                                {editingPaymentId ? 'Edit Payment' : 'Record Payment'}
                            </div>
                            {editingPaymentId && (
                                <button 
                                    onClick={() => {
                                        setEditingPaymentId(null);
                                        setPaymentEntry({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Money', note: '' });
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold"
                                >
                                    Cancel Edit
                                </button>
                            )}
                        </h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs.)</label>
                                    <input type="number" value={paymentEntry.amount} onChange={e => setPaymentEntry({ ...paymentEntry, amount: e.target.value })} placeholder="0.00" className="w-full border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 shadow-sm font-bold text-emerald-700" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input type="date" value={paymentEntry.date} onChange={e => setPaymentEntry({ ...paymentEntry, date: e.target.value })} className="w-full border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 shadow-sm" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
                                    <select value={paymentEntry.method} onChange={e => setPaymentEntry({ ...paymentEntry, method: e.target.value as any })} className="w-full border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 shadow-sm">
                                        <option value="Money">Cash</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                                    <input type="text" value={paymentEntry.note} onChange={e => setPaymentEntry({ ...paymentEntry, note: e.target.value })} placeholder="Optional" className="w-full border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 shadow-sm" />
                                </div>
                            </div>
                            <button onClick={handleAddPayment} className={`w-full py-2.5 text-white rounded-md font-bold transition-colors shadow-sm ${editingPaymentId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                {editingPaymentId ? 'Update Payment' : 'Add Payment'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                             <h3 className="font-bold text-gray-700 uppercase tracking-widest text-xs">Purchase History</h3>
                             <Truck size={14} className="text-gray-400" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-6 py-3 text-left">Date</th>
                                        <th className="px-6 py-3 text-left">Item</th>
                                        <th className="px-6 py-3 text-center">Qty / Price</th>
                                        <th className="px-6 py-3 text-right">Total</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPurchases.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{p.date}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900 min-w-[150px]">{p.description}</td>
                                            <td className="px-6 py-4 text-center">
                                                {p.quantity && p.unitPrice ? (
                                                    <span className="inline-block bg-slate-100 px-2 py-1 rounded text-[10px] font-bold text-slate-600 whitespace-nowrap uppercase tracking-tighter">
                                                        {p.quantity} × Rs. {p.unitPrice.toLocaleString()}
                                                    </span>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-slate-900 whitespace-nowrap">Rs. {p.amount.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                                <button onClick={() => startEditPurchase(p)} className="text-blue-400 hover:text-blue-600 p-1 transition-colors" title="Edit"><Edit size={16} /></button>
                                                <button onClick={() => handleDeletePurchase(p.id)} className="text-red-400 hover:text-red-600 p-1 transition-colors" title="Delete"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPurchases.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic">No records</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                             <h3 className="font-bold text-gray-700 uppercase tracking-widest text-xs">Payment History</h3>
                             <Banknote size={14} className="text-gray-400" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-6 py-3 text-left">Date</th>
                                        <th className="px-6 py-3 text-left">Method</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPayments.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-slate-500 text-xs font-mono whitespace-nowrap">{p.date}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1 font-bold text-slate-900">
                                                    {p.method === 'Money' ? 'Cash' : p.method}
                                                </div>
                                                {p.note && <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{p.note}</p>}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-emerald-600 whitespace-nowrap">Rs. {p.amount.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                                <button onClick={() => startEditPayment(p)} className="text-blue-400 hover:text-blue-600 p-1 transition-colors" title="Edit"><Edit size={16} /></button>
                                                <button onClick={() => handleDeletePayment(p.id)} className="text-red-400 hover:text-red-600 p-1 transition-colors" title="Delete"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPayments.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic">No records</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-gray-800">Suppliers</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage vendor accounts and procurement ledger</p>
                </div>
                <div className="mt-4 sm:mt-0">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 transition-colors"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" /> Add Supplier
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div 
                    onClick={() => setBreakdownModal('purchase')}
                    className="p-6 bg-white rounded-xl shadow-sm flex items-center justify-between transition-all hover:shadow-md cursor-pointer border border-gray-100 group"
                >
                    <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Total Purchases</p>
                        <p className="text-3xl font-bold text-gray-800">Rs. {suppliers.reduce((sum, s) => sum + calculateTotalPurchases(s.purchases), 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition-transform group-hover:scale-110">
                        <Truck size={24} />
                    </div>
                </div>

                <div 
                    onClick={() => setBreakdownModal('paid')}
                    className="p-6 bg-white rounded-xl shadow-sm flex items-center justify-between transition-all hover:shadow-md cursor-pointer border border-gray-100 group"
                >
                    <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Total Paid</p>
                        <p className="text-3xl font-bold text-gray-800">Rs. {suppliers.reduce((sum, s) => sum + calculateTotalPaid(s.payments), 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 transition-transform group-hover:scale-110">
                        <Banknote size={24} />
                    </div>
                </div>

                <div 
                    onClick={() => setBreakdownModal('due')}
                    className="p-6 bg-white rounded-xl shadow-sm flex items-center justify-between transition-all hover:shadow-md cursor-pointer border border-gray-100 group"
                >
                    <div>
                        <p className="text-sm font-medium text-gray-500 mb-1">Grand Balance Due</p>
                        <p className="text-3xl font-bold text-gray-800">Rs. {suppliers.reduce((sum, s) => sum + (calculateTotalPurchases(s.purchases) - calculateTotalPaid(s.payments)), 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 transition-transform group-hover:scale-110">
                        <DollarSign size={24} />
                    </div>
                </div>
            </div>

            <AdminFilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Search supplier by name or phone..."
            />

            <div className="space-y-4 md:hidden">
                {filteredSuppliers.length > 0 ? filteredSuppliers.map((supplier) => {
                    const totalPurchased = calculateTotalPurchases(supplier.purchases);
                    const totalPaid = calculateTotalPaid(supplier.payments);
                    const balance = totalPurchased - totalPaid;

                    return (
                        <div key={supplier.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-bold text-slate-900">{supplier.name}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-600">{supplier.phone}</p>
                                </div>
                                <button
                                    onClick={() => handleDeleteSupplier(supplier.id)}
                                    className="rounded-lg bg-red-50 p-2 text-red-600"
                                    title="Delete"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Purchase</p>
                                    <p className="mt-1 font-bold text-slate-900">Rs. {totalPurchased.toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Paid</p>
                                    <p className="mt-1 font-bold text-emerald-600">Rs. {totalPaid.toLocaleString()}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Due</p>
                                    <p className="mt-1 font-bold text-red-600">Rs. {balance.toLocaleString()}</p>
                                </div>
                            </div>
                            {isAllBranchesScope && (
                                <div className="mt-3">
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                                        {getBranchName(supplier.branchId)}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={() => { setSelectedSupplierId(supplier.id); setView('detail'); }}
                                className="mt-4 w-full rounded-xl bg-primary-50 px-4 py-2 text-sm font-bold text-primary-600"
                            >
                                View Ledger
                            </button>
                        </div>
                    );
                }) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
                        No suppliers found.
                    </div>
                )}
            </div>

            <div className="hidden overflow-x-auto rounded-lg bg-white shadow-md md:block">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">Supplier Name</th>
                            <th className="px-6 py-3">Phone</th>
                            <th className="px-6 py-3 text-right">Total Purchased</th>
                            <th className="px-6 py-3 text-right">Total Paid</th>
                            <th className="px-6 py-3 text-right text-primary-600">Balance Due</th>
                            {isAllBranchesScope && <th className="px-6 py-3">Branch</th>}
                            <th className="px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredSuppliers.map(supplier => {
                            const totalPurchased = calculateTotalPurchases(supplier.purchases);
                            const totalPaid = calculateTotalPaid(supplier.payments);
                            const balance = totalPurchased - totalPaid;

                            return (
                                <tr key={supplier.id} className="bg-white hover:bg-gray-50 transition-colors border-b last:border-0 font-medium">
                                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{supplier.name}</td>
                                    <td className="px-6 py-4">{supplier.phone}</td>
                                    <td className="px-6 py-4 text-right">Rs. {totalPurchased.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right text-emerald-600">Rs. {totalPaid.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${balance > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-50 text-gray-400'}`}>
                                            Rs. {balance.toLocaleString()}
                                        </span>
                                    </td>
                                    {isAllBranchesScope && <td className="px-6 py-4 font-semibold text-slate-600">{getBranchName(supplier.branchId)}</td>}
                                    <td className="px-6 py-4">
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => { setSelectedSupplierId(supplier.id); setView('detail'); }}
                                                className="p-2 text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                                title="View Ledger"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSupplier(supplier.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredSuppliers.length === 0 && (
                            <tr><td colSpan={isAllBranchesScope ? 7 : 6} className="px-6 py-10 text-center text-gray-400 italic">No suppliers found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Supplier Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white rounded-lg w-full max-w-md overflow-hidden shadow-2xl">
                        <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                            <h3 className="text-gray-800 font-bold">Add New Supplier</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company / Name</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Enter supplier name"
                                    value={newSupplier.name}
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="07XXXXXXXX"
                                    value={newSupplier.phone}
                                    onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                                <button onClick={handleAddSupplier} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 shadow-sm">Add Supplier</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Breakdown Modal */}
            {breakdownModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="px-8 py-6 border-b flex justify-between items-center bg-white">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                                    {breakdownModal === 'purchase' ? 'Total Purchase' : breakdownModal === 'paid' ? 'Total Paid' : 'Balance Due'} Breakdown
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">All Suppliers</p>
                            </div>
                            <button onClick={() => setBreakdownModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto flex-1">
                            <table className="w-full text-left">
                                <thead className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-black border-b">
                                    <tr>
                                        <th className="pb-3">Supplier Name</th>
                                        <th className="pb-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {suppliers.map(s => {
                                        const amount = breakdownModal === 'purchase' 
                                            ? calculateTotalPurchases(s.purchases) 
                                            : breakdownModal === 'paid' 
                                            ? calculateTotalPaid(s.payments) 
                                            : calculateTotalPurchases(s.purchases) - calculateTotalPaid(s.payments);
                                        
                                        if (amount === 0) return null;

                                        return (
                                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-4 font-black text-slate-700">{s.name}</td>
                                                <td className={`py-4 text-right font-black italic ${breakdownModal === 'due' ? 'text-red-500' : breakdownModal === 'paid' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                    Rs. {amount.toLocaleString()}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="border-t-2 border-slate-100">
                                    <tr className="bg-slate-50">
                                        <td className="py-4 px-4 font-black text-slate-900 uppercase tracking-tighter text-sm">Grand Total</td>
                                        <td className="py-4 px-4 text-right font-black text-xl italic">
                                            Rs. {suppliers.reduce((sum, s) => {
                                                const amount = breakdownModal === 'purchase' 
                                                    ? calculateTotalPurchases(s.purchases) 
                                                    : breakdownModal === 'paid' 
                                                    ? calculateTotalPaid(s.payments) 
                                                    : calculateTotalPurchases(s.purchases) - calculateTotalPaid(s.payments);
                                                return sum + amount;
                                            }, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <div className="px-8 py-4 bg-slate-50 border-t flex justify-end">
                             <button onClick={() => setBreakdownModal(null)} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold uppercase text-xs hover:bg-black transition-all">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SupplierManagement;
