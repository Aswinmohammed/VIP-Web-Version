import React, { useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { Supplier, SupplierPurchase, SupplierPayment, SupplierCheque } from '../types';
import {
    PlusCircle, Search, User, Phone, DollarSign, Calendar, Printer, Trash2, ArrowLeft, X,
    Truck, Banknote, Landmark, Eye, Edit, Loader2, Filter, Check, CheckCircle2, Clock, CreditCard,
    FileText, CheckSquare, AlertCircle
} from 'lucide-react';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';
import {
    fetchCloudSupplierCheques,
    createCloudSupplierCheque,
    updateCloudSupplierCheque,
    updateCloudSupplierChequeStatus,
    deleteCloudSupplierCheque,
} from '../utils/cloudApi';

const SupplierManagement: React.FC = () => {
    const context = useContext(AppContext);
    const [view, setView] = useState<'list' | 'detail' | 'cheques'>('list');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

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

    // Date filtering for supplier detail
    const [dateFilter, setDateFilter] = useState({ from: '', to: '' });

    // Cheque Management States
    const [cheques, setCheques] = useState<SupplierCheque[]>([]);
    const [isChequesLoading, setIsChequesLoading] = useState(false);
    const [chequesError, setChequesError] = useState<string | null>(null);
    const [chequeActionId, setChequeActionId] = useState<string | null>(null);

    const [chequeSearchTerm, setChequeSearchTerm] = useState('');
    const [chequeStatusFilter, setChequeStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
    const [chequeDateFilter, setChequeDateFilter] = useState({ from: '', to: '' });
    const [chequeMonthFilter, setChequeMonthFilter] = useState<string>('all');

    // Add / Edit Cheque Modal
    const [isChequeModalOpen, setIsChequeModalOpen] = useState(false);
    const [editingCheque, setEditingCheque] = useState<SupplierCheque | null>(null);
    const [chequeForm, setChequeForm] = useState({
        payeeName: '',
        chequeNumber: '',
        amount: '',
        chequeDate: new Date().toISOString().split('T')[0],
        status: 'pending' as 'pending' | 'paid',
        note: '',
    });

    // Auto-calculate purchase amount
    useEffect(() => {
        const q = parseFloat(purchaseEntry.quantity);
        const u = parseFloat(purchaseEntry.unitPrice);
        if (!isNaN(q) && !isNaN(u)) {
            setPurchaseEntry(prev => ({ ...prev, amount: (q * u).toFixed(2) }));
        }
    }, [purchaseEntry.quantity, purchaseEntry.unitPrice]);

    const getScopedBranchQuery = useCallback(() => {
        return context?.activeBranchId && context.activeBranchId !== 'all' ? context.activeBranchId : undefined;
    }, [context?.activeBranchId]);

    const loadCheques = useCallback(async () => {
        if (!context?.accessToken) return;
        setIsChequesLoading(true);
        setChequesError(null);
        try {
            const data = await fetchCloudSupplierCheques(context.accessToken, {
                branchId: getScopedBranchQuery(),
            });
            setCheques(data);
        } catch (err) {
            console.error('Failed to load supplier cheques', err);
            setChequesError(err instanceof Error ? err.message : 'Failed to load supplier cheques');
        } finally {
            setIsChequesLoading(false);
        }
    }, [context?.accessToken, getScopedBranchQuery]);

    useEffect(() => {
        if (context?.accessToken) {
            loadCheques();
        }
    }, [loadCheques, context?.accessToken]);

    if (!context) return <div>Loading...</div>;
    const { suppliers, setSuppliers, isAllBranchesScope, getBranchName } = context;

    const calculateTotalPurchases = (purchases: SupplierPurchase[] = []) => purchases.reduce((sum, p) => sum + p.amount, 0);
    const calculateTotalPaid = (payments: SupplierPayment[] = []) => payments.reduce((sum, p) => sum + p.amount, 0);
    const normaliseSupplierName = (name: string) => name.trim().toLocaleLowerCase();
    const chequeBelongsToSupplier = (cheque: SupplierCheque, supplier: Supplier) => {
        if (cheque.supplierId) return cheque.supplierId === supplier.id;

        // Legacy cheques may not have a supplier ID, so match their payee name within the same branch.
        return (!cheque.branchId || cheque.branchId === supplier.branchId)
            && normaliseSupplierName(cheque.payeeName) === normaliseSupplierName(supplier.name);
    };
    const calculatePaidCheques = (supplier: Supplier, fromDate = '', toDate = '') => cheques
        .filter((cheque) => cheque.status === 'paid'
            && chequeBelongsToSupplier(cheque, supplier)
            && (!fromDate || cheque.chequeDate >= fromDate)
            && (!toDate || cheque.chequeDate <= toDate))
        .reduce((sum, cheque) => sum + cheque.amount, 0);
    const calculateSupplierTotalPaid = (supplier: Supplier) =>
        calculateTotalPaid(supplier.payments) + calculatePaidCheques(supplier);

    const filteredSuppliers = useMemo(() => {
        const list = [...suppliers].reverse();
        if (!searchTerm) return list;
        const lower = searchTerm.toLowerCase();
        return list.filter(s => s.name.toLowerCase().includes(lower) || s.phone.includes(lower));
    }, [suppliers, searchTerm]);

    const selectedSupplier = useMemo(() => suppliers.find(s => s.id === selectedSupplierId), [suppliers, selectedSupplierId]);

    // Cheques filtering
    const filteredCheques = useMemo(() => {
        return cheques.filter((cheque) => {
            if (chequeStatusFilter !== 'all' && cheque.status !== chequeStatusFilter) {
                return false;
            }
            if (chequeSearchTerm) {
                const term = chequeSearchTerm.toLowerCase();
                const matchName = cheque.payeeName.toLowerCase().includes(term);
                const matchNumber = cheque.chequeNumber.toLowerCase().includes(term);
                const matchNote = cheque.note?.toLowerCase().includes(term) || false;
                if (!matchName && !matchNumber && !matchNote) return false;
            }
            if (chequeMonthFilter !== 'all') {
                if (!cheque.chequeDate.startsWith(chequeMonthFilter)) return false;
            }
            if (chequeDateFilter.from && cheque.chequeDate < chequeDateFilter.from) {
                return false;
            }
            if (chequeDateFilter.to && cheque.chequeDate > chequeDateFilter.to) {
                return false;
            }
            return true;
        }).sort((a, b) => b.chequeDate.localeCompare(a.chequeDate));
    }, [cheques, chequeStatusFilter, chequeSearchTerm, chequeMonthFilter, chequeDateFilter]);

    // Stats calculations
    const chequeTotalAmount = useMemo(() => {
        return filteredCheques.reduce((sum, c) => sum + c.amount, 0);
    }, [filteredCheques]);

    const clearAmount = useMemo(() => {
        return filteredCheques.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0);
    }, [filteredCheques]);

    const balanceAmount = useMemo(() => {
        return chequeTotalAmount - clearAmount;
    }, [chequeTotalAmount, clearAmount]);

    // Cheque Actions
    const handleToggleChequeStatus = async (cheque: SupplierCheque) => {
        const nextStatus: 'pending' | 'paid' = cheque.status === 'paid' ? 'pending' : 'paid';
        const nextClearedAt = nextStatus === 'paid' ? new Date().toISOString() : null;

        // Optimistic local state update
        setCheques((prev) =>
            prev.map((c) => (c.id === cheque.id ? { ...c, status: nextStatus, clearedAt: nextClearedAt } : c))
        );

        if (context.accessToken) {
            setChequeActionId(cheque.id);
            try {
                const updated = await updateCloudSupplierChequeStatus(
                    context.accessToken,
                    cheque.id,
                    nextStatus,
                    nextClearedAt
                );
                setCheques((prev) => prev.map((c) => (c.id === cheque.id ? updated : c)));
            } catch (err) {
                console.error('Failed to update cheque status', err);
                // Revert
                setCheques((prev) => prev.map((c) => (c.id === cheque.id ? cheque : c)));
                setChequesError(err instanceof Error ? err.message : 'Failed to update status');
            } finally {
                setChequeActionId(null);
            }
        }
    };

    const handleOpenAddChequeModal = () => {
        setEditingCheque(null);
        setChequeForm({
            payeeName: '',
            chequeNumber: '',
            amount: '',
            chequeDate: new Date().toISOString().split('T')[0],
            status: 'pending',
            note: '',
        });
        setChequesError(null);
        setIsChequeModalOpen(true);
    };

    const handleOpenEditChequeModal = (cheque: SupplierCheque) => {
        setEditingCheque(cheque);
        setChequeForm({
            payeeName: cheque.payeeName,
            chequeNumber: cheque.chequeNumber,
            amount: cheque.amount.toString(),
            chequeDate: cheque.chequeDate,
            status: cheque.status,
            note: cheque.note || '',
        });
        setChequesError(null);
        setIsChequeModalOpen(true);
    };

    const handleSaveCheque = async () => {
        if (!chequeForm.payeeName.trim() || !chequeForm.chequeNumber.trim() || !chequeForm.amount || !chequeForm.chequeDate) {
            setChequesError('Please fill in Date, Name, Amount, and Cheque Number.');
            return;
        }
        const amt = parseFloat(chequeForm.amount);
        if (isNaN(amt) || amt <= 0) {
            setChequesError('Please enter a valid amount.');
            return;
        }

        const enteredPayeeName = chequeForm.payeeName.trim();
        const scopedBranchId = getScopedBranchQuery();
        const matchedSupplier = suppliers.find(
            (supplier) => supplier.branchId === scopedBranchId
                && normaliseSupplierName(supplier.name) === normaliseSupplierName(enteredPayeeName)
        ) || suppliers.find(
            (supplier) => normaliseSupplierName(supplier.name) === normaliseSupplierName(enteredPayeeName)
        );

        const payload = {
            branchId: scopedBranchId || matchedSupplier?.branchId || (suppliers[0]?.branchId) || undefined,
            supplierId: matchedSupplier?.id || null,
            payeeName: matchedSupplier?.name || enteredPayeeName,
            chequeNumber: chequeForm.chequeNumber.trim(),
            amount: amt,
            chequeDate: chequeForm.chequeDate,
            status: chequeForm.status,
            clearedAt: chequeForm.status === 'paid' ? new Date().toISOString() : null,
            note: chequeForm.note.trim() || null,
        };

        if (context.accessToken) {
            setChequeActionId('saving');
            try {
                if (editingCheque) {
                    const updated = await updateCloudSupplierCheque(context.accessToken, editingCheque.id, payload);
                    setCheques((prev) => prev.map((c) => (c.id === editingCheque.id ? updated : c)));
                } else {
                    const created = await createCloudSupplierCheque(context.accessToken, payload);
                    setCheques((prev) => [created, ...prev]);
                }
                setIsChequeModalOpen(false);
            } catch (err) {
                console.error('Failed to save cheque', err);
                setChequesError(err instanceof Error ? err.message : 'Failed to save cheque');
            } finally {
                setChequeActionId(null);
            }
        } else {
            // Local fallback
            if (editingCheque) {
                setCheques((prev) =>
                    prev.map((c) =>
                        c.id === editingCheque.id
                            ? { ...c, ...payload, updatedAt: new Date().toISOString() }
                            : c
                    )
                );
            } else {
                const localCheque: SupplierCheque = {
                    id: `CHQ${Date.now()}`,
                    ...payload,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                setCheques((prev) => [localCheque, ...prev]);
            }
            setIsChequeModalOpen(false);
        }
    };

    const handleDeleteCheque = async (chequeId: string) => {
        if (!window.confirm('Are you sure you want to delete this cheque record?')) return;
        if (context.accessToken) {
            try {
                await deleteCloudSupplierCheque(context.accessToken, chequeId);
                setCheques((prev) => prev.filter((c) => c.id !== chequeId));
            } catch (err) {
                console.error('Failed to delete cheque', err);
                setChequesError(err instanceof Error ? err.message : 'Failed to delete cheque');
            }
        } else {
            setCheques((prev) => prev.filter((c) => c.id !== chequeId));
        }
    };

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
        setPaymentEntry({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Money', note: '' });
    };

    const startEditPayment = (payment: SupplierPayment) => {
        setEditingPaymentId(payment.id);
        setPaymentEntry({
            amount: payment.amount.toString(),
            date: payment.date,
            method: payment.method,
            note: payment.note || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeletePurchase = (purchaseId: string) => {
        if (!selectedSupplier) return;
        const updatedPurchases = selectedSupplier.purchases.filter(p => p.id !== purchaseId);
        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? { ...selectedSupplier, purchases: updatedPurchases } : s));
    };

    const handleDeletePayment = (paymentId: string) => {
        if (!selectedSupplier) return;
        const updatedPayments = selectedSupplier.payments.filter(p => p.id !== paymentId);
        setSuppliers(suppliers.map(s => s.id === selectedSupplier.id ? { ...selectedSupplier, payments: updatedPayments } : s));
    };

    const handleDeleteSupplier = (supplierId: string) => {
        if (window.confirm('Are you sure you want to delete this supplier and all their transactions?')) {
            setSuppliers(suppliers.filter(s => s.id !== supplierId));
            if (selectedSupplierId === supplierId) {
                setView('list');
                setSelectedSupplierId(null);
            }
        }
    };

    const handleDownloadStatement = async () => {
        if (!selectedSupplier) return;
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            doc.text(`Supplier Statement: ${selectedSupplier.name}`, 10, 10);
            const uri = doc.output('datauristring');
            downloadDataUri(uri, `Supplier_${selectedSupplier.name}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    // -------------------------------------------------------------
    // VIEW: CHEQUES (CHEQUE DETAILS)
    // -------------------------------------------------------------
    if (view === 'cheques') {
        return (
            <div className="space-y-6">
                {/* Header */}
                <div className="sm:flex sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setView('list')}
                            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                            title="Back to Suppliers"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                                <Landmark className="h-8 w-8 text-indigo-600" />
                                Cheque Details
                            </h1>
                            <p className="text-sm font-medium text-slate-500 mt-0.5">
                                Supplier cheque ledger, clearance tracker, and outstanding balances
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-3">
                        <button
                            onClick={handleOpenAddChequeModal}
                            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                        >
                            <PlusCircle className="w-5 h-5 mr-2" /> Add Cheque
                        </button>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setView('list')}
                        className="px-6 py-3 font-bold text-sm text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors"
                    >
                        Suppliers List
                    </button>
                    <button
                        onClick={() => setView('cheques')}
                        className="px-6 py-3 font-bold text-sm text-indigo-600 border-b-2 border-indigo-600 transition-colors"
                    >
                        Cheque Details
                    </button>
                </div>

                {/* Top Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Card 1: Cheque Total Amount */}
                    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-md">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Cheque Total Amount
                            </p>
                            <p className="text-3xl font-black text-slate-900">
                                Rs. {chequeTotalAmount.toLocaleString()}
                            </p>
                            <p className="text-xs font-semibold text-slate-400 mt-1">
                                {filteredCheques.length} total cheques listed
                            </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm">
                            <CreditCard size={28} />
                        </div>
                    </div>

                    {/* Card 2: Clear Amount */}
                    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-md">
                        <div>
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                Clear Amount (Paid)
                            </p>
                            <p className="text-3xl font-black text-emerald-600">
                                Rs. {clearAmount.toLocaleString()}
                            </p>
                            <p className="text-xs font-semibold text-emerald-600/70 mt-1">
                                {filteredCheques.filter(c => c.status === 'paid').length} cheques cleared / paid
                            </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm">
                            <CheckCircle2 size={28} />
                        </div>
                    </div>

                    {/* Card 3: Balance Amount */}
                    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-md">
                        <div>
                            <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                                Balance Amount (Pending)
                            </p>
                            <p className="text-3xl font-black text-orange-600">
                                Rs. {balanceAmount.toLocaleString()}
                            </p>
                            <p className="text-xs font-semibold text-orange-600/70 mt-1">
                                {filteredCheques.filter(c => c.status === 'pending').length} cheques pending clearance
                            </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-orange-50 text-orange-600 border border-orange-100 shadow-sm">
                            <Clock size={28} />
                        </div>
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {/* Search Input */}
                        <div className="relative md:col-span-2">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                value={chequeSearchTerm}
                                onChange={(e) => setChequeSearchTerm(e.target.value)}
                                placeholder="Search by Payee Name or Cheque No..."
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            />
                        </div>

                        {/* Status Filter */}
                        <div>
                            <select
                                value={chequeStatusFilter}
                                onChange={(e) => setChequeStatusFilter(e.target.value as 'all' | 'pending' | 'paid')}
                                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                            >
                                <option value="all">All Statuses (Pending & Paid)</option>
                                <option value="pending">Pending Only</option>
                                <option value="paid">Paid / Cleared Only</option>
                            </select>
                        </div>

                        {/* Month Filter */}
                        <div>
                            <input
                                type="month"
                                value={chequeMonthFilter === 'all' ? '' : chequeMonthFilter}
                                onChange={(e) => setChequeMonthFilter(e.target.value || 'all')}
                                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                title="Filter by Month"
                            />
                        </div>
                    </div>

                    {/* Date Range & Clear Filters */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs font-semibold text-slate-600">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-400 uppercase tracking-wider text-[11px] font-bold">Date Range:</span>
                            <input
                                type="date"
                                value={chequeDateFilter.from}
                                onChange={(e) => setChequeDateFilter(prev => ({ ...prev, from: e.target.value }))}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-xs font-semibold"
                            />
                            <span>to</span>
                            <input
                                type="date"
                                value={chequeDateFilter.to}
                                onChange={(e) => setChequeDateFilter(prev => ({ ...prev, to: e.target.value }))}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-xs font-semibold"
                            />
                            {(chequeDateFilter.from || chequeDateFilter.to || chequeMonthFilter !== 'all' || chequeSearchTerm || chequeStatusFilter !== 'all') && (
                                <button
                                    onClick={() => {
                                        setChequeSearchTerm('');
                                        setChequeStatusFilter('all');
                                        setChequeMonthFilter('all');
                                        setChequeDateFilter({ from: '', to: '' });
                                    }}
                                    className="ml-2 text-indigo-600 hover:text-indigo-800 underline font-bold"
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                        <div className="text-slate-500">
                            Showing <span className="font-black text-slate-800">{filteredCheques.length}</span> records
                        </div>
                    </div>
                </div>

                {chequesError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{chequesError}</span>
                    </div>
                )}

                {/* Cheques Ledger Table */}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Amount</th>
                                    <th className="px-6 py-4">Name (Supplier / Payee)</th>
                                    <th className="px-6 py-4">C. Number</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {filteredCheques.map((cheque) => {
                                    const isPaid = cheque.status === 'paid';
                                    const isUpdating = chequeActionId === cheque.id;

                                    return (
                                        <tr key={cheque.id} className="hover:bg-slate-50/80 transition-colors">
                                            {/* Date */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2 font-bold text-slate-900">
                                                    <Calendar className="w-4 h-4 text-slate-400" />
                                                    {cheque.chequeDate}
                                                </div>
                                            </td>

                                            {/* Amount */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="text-base font-black text-slate-900">
                                                    Rs. {cheque.amount.toLocaleString()}
                                                </span>
                                            </td>

                                            {/* Name */}
                                            <td className="px-6 py-4">
                                                <div>
                                                    <span className="font-bold text-slate-900 text-sm">
                                                        {cheque.payeeName}
                                                    </span>
                                                    {cheque.note && (
                                                        <p className="text-xs text-slate-400 font-normal mt-0.5">
                                                            {cheque.note}
                                                        </p>
                                                    )}
                                                </div>
                                            </td>

                                            {/* C. Number */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                                    {cheque.chequeNumber}
                                                </span>
                                            </td>

                                            {/* Status Button (Clickable Paid/Pending) */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => handleToggleChequeStatus(cheque)}
                                                    disabled={isUpdating}
                                                    title={isPaid ? 'Click to mark as Pending' : 'Click to mark as Paid / Cleared'}
                                                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer shadow-sm ${
                                                        isPaid
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                                            : 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                                    } disabled:opacity-50`}
                                                >
                                                    {isUpdating ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : isPaid ? (
                                                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                    ) : (
                                                        <Clock className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>{isPaid ? 'Paid / OK' : 'Pending'}</span>
                                                </button>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditChequeModal(cheque)}
                                                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        title="Edit Cheque"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCheque(cheque.id)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete Cheque"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filteredCheques.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-14 text-center text-slate-400 italic font-medium">
                                            {isChequesLoading ? 'Loading cheque details...' : 'No cheques found matching the selected filters.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add / Edit Cheque Modal */}
                {isChequeModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
                            <div className="bg-indigo-600 p-5 flex justify-between items-center text-white">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/20 p-2 rounded-xl">
                                        <Landmark size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">
                                            {editingCheque ? 'Edit Cheque Record' : 'Add New Cheque'}
                                        </h3>
                                        <p className="text-indigo-100 text-xs">
                                            Enter date, payee name, amount, cheque number, and clearance status
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsChequeModalOpen(false)}
                                    className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Date */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                            Cheque Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={chequeForm.chequeDate}
                                            onChange={(e) => setChequeForm({ ...chequeForm, chequeDate: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>

                                    {/* Amount */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                            Amount (Rs.) *
                                        </label>
                                        <input
                                            type="number"
                                            value={chequeForm.amount}
                                            onChange={(e) => setChequeForm({ ...chequeForm, amount: e.target.value })}
                                            placeholder="50000.00"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                </div>

                                {/* Payee Name (with auto-suggestion datalist) */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                        Payee Name (Supplier / Vendor) *
                                    </label>
                                    <input
                                        type="text"
                                        list="supplier-payee-list"
                                        value={chequeForm.payeeName}
                                        onChange={(e) => setChequeForm({ ...chequeForm, payeeName: e.target.value })}
                                        placeholder="e.g. Malwana, Oceanic, Next, Star Offset"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                    <datalist id="supplier-payee-list">
                                        {suppliers.map((s) => (
                                            <option key={s.id} value={s.name} />
                                        ))}
                                    </datalist>
                                </div>

                                {/* Cheque Number */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                        Cheque Number (C. Number) *
                                    </label>
                                    <input
                                        type="text"
                                        value={chequeForm.chequeNumber}
                                        onChange={(e) => setChequeForm({ ...chequeForm, chequeNumber: e.target.value })}
                                        placeholder="e.g. 000028"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono"
                                    />
                                </div>

                                {/* Status Toggle */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                        Status
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setChequeForm({ ...chequeForm, status: 'pending' })}
                                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-black transition-all ${
                                                chequeForm.status === 'pending'
                                                    ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-sm'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                            }`}
                                        >
                                            <Clock size={16} /> Pending
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setChequeForm({ ...chequeForm, status: 'paid' })}
                                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-black transition-all ${
                                                chequeForm.status === 'paid'
                                                    ? 'bg-emerald-100 border-emerald-400 text-emerald-900 shadow-sm'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                            }`}
                                        >
                                            <CheckCircle2 size={16} /> Paid / OK (Cleared)
                                        </button>
                                    </div>
                                </div>

                                {/* Note */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                        Note / Remarks (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={chequeForm.note}
                                        onChange={(e) => setChequeForm({ ...chequeForm, note: e.target.value })}
                                        placeholder="Optional payment reference or remark..."
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                    />
                                </div>

                                {chequesError && (
                                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                                        {chequesError}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsChequeModalOpen(false)}
                                        className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={chequeActionId === 'saving'}
                                        onClick={handleSaveCheque}
                                        className="inline-flex items-center px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all disabled:opacity-50"
                                    >
                                        {chequeActionId === 'saving' ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                                            </>
                                        ) : editingCheque ? (
                                            'Update Cheque'
                                        ) : (
                                            'Save Cheque'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // -------------------------------------------------------------
    // VIEW: SUPPLIER DETAIL
    // -------------------------------------------------------------
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

        const currentPurchases = calculateTotalPurchases(filteredPurchases);
        const currentPaidCheques = calculatePaidCheques(selectedSupplier, dateFilter.from, dateFilter.to);
        const currentPaid = calculateTotalPaid(filteredPayments) + currentPaidCheques;
        const currentBalance = currentPurchases - currentPaid;

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button onClick={() => { setView('list'); setSelectedSupplierId(null); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">{selectedSupplier.name}</h1>
                            <p className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                <Phone size={14} /> {selectedSupplier.phone}
                                {isAllBranchesScope && <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold text-slate-600">{getBranchName(selectedSupplier.branchId)}</span>}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleDownloadStatement}
                            disabled={isGenerating}
                            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                            Print Statement
                        </button>
                        <button 
                            onClick={() => handleDeleteSupplier(selectedSupplier.id)}
                            className="inline-flex items-center px-4 py-2 border border-red-200 rounded-md shadow-sm text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </button>
                    </div>
                </div>

                {/* Balance Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-1">{dateFilter.from || dateFilter.to ? 'Filtered Purchases' : 'Total Purchases'}</p>
                        <p className="text-3xl font-bold text-gray-800">Rs. {currentPurchases.toLocaleString()}</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-1">{dateFilter.from || dateFilter.to ? 'Filtered Paid' : 'Total Paid (incl. cleared cheques)'}</p>
                        <p className="text-3xl font-bold text-emerald-600">Rs. {currentPaid.toLocaleString()}</p>
                        {currentPaidCheques > 0 && <p className="mt-1 text-xs font-semibold text-emerald-600">Rs. {currentPaidCheques.toLocaleString()} from cleared cheques</p>}
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-sm font-medium text-gray-500 mb-1">{dateFilter.from || dateFilter.to ? 'Filtered Balance Due' : 'Balance Due'}</p>
                        <p className="text-3xl font-bold text-red-600">Rs. {currentBalance.toLocaleString()}</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar size={18} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">Filter By Date:</span>
                        <input type="date" value={dateFilter.from} onChange={e => setDateFilter({ ...dateFilter, from: e.target.value })} className="border rounded-md px-2 py-1 text-sm bg-gray-50" />
                        <span className="text-gray-400">to</span>
                        <input type="date" value={dateFilter.to} onChange={e => setDateFilter({ ...dateFilter, to: e.target.value })} className="border rounded-md px-2 py-1 text-sm bg-gray-50" />
                        {(dateFilter.from || dateFilter.to) && (
                            <button onClick={() => setDateFilter({ from: '', to: '' })} className="text-xs text-indigo-600 hover:underline">Clear</button>
                        )}
                    </div>
                </div>

                {/* Two Column Grid for Actions & Records */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Purchases Column */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-lg font-bold text-gray-800 mb-4">{editingPurchaseId ? 'Edit Purchase Entry' : 'Add New Purchase'}</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                                    <input type="text" value={purchaseEntry.description} onChange={e => setPurchaseEntry({ ...purchaseEntry, description: e.target.value })} placeholder="e.g. 50m Cotton Fabric" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Qty</label>
                                        <input type="number" value={purchaseEntry.quantity} onChange={e => setPurchaseEntry({ ...purchaseEntry, quantity: e.target.value })} placeholder="1" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Unit Price</label>
                                        <input type="number" value={purchaseEntry.unitPrice} onChange={e => setPurchaseEntry({ ...purchaseEntry, unitPrice: e.target.value })} placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Total Amount</label>
                                        <input type="number" value={purchaseEntry.amount} onChange={e => setPurchaseEntry({ ...purchaseEntry, amount: e.target.value })} placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 font-bold" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Purchase Date</label>
                                        <input type="date" value={purchaseEntry.date} onChange={e => setPurchaseEntry({ ...purchaseEntry, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                    </div>
                                    <div className="flex items-end">
                                        <button onClick={handleAddPurchase} className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                                            {editingPurchaseId ? 'Update Purchase' : 'Add Purchase'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Purchases Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Purchase History</h3>
                                <span className="text-xs text-gray-500 font-medium">{filteredPurchases.length} records</span>
                            </div>
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Description</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPurchases.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-xs font-medium text-gray-500 whitespace-nowrap">{p.date}</td>
                                            <td className="px-6 py-4 font-bold text-slate-800">
                                                {p.description}
                                                {p.quantity && <span className="text-xs font-normal text-slate-400 block">{p.quantity} x Rs. {p.unitPrice?.toLocaleString()}</span>}
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

                    {/* Right: Payments Column */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-lg font-bold text-gray-800 mb-4">{editingPaymentId ? 'Edit Payment Entry' : 'Record Payment Made'}</h2>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Amount</label>
                                    <input type="number" value={paymentEntry.amount} onChange={e => setPaymentEntry({ ...paymentEntry, amount: e.target.value })} placeholder="0.00" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 font-bold" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Payment Date</label>
                                        <input type="date" value={paymentEntry.date} onChange={e => setPaymentEntry({ ...paymentEntry, date: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Method</label>
                                        <select value={paymentEntry.method} onChange={e => setPaymentEntry({ ...paymentEntry, method: e.target.value as any })} className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50">
                                            <option value="Money">Cash</option>
                                            <option value="Cheque">Cheque</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Note / Reference</label>
                                    <input type="text" value={paymentEntry.note} onChange={e => setPaymentEntry({ ...paymentEntry, note: e.target.value })} placeholder="e.g. Cheque No #12345" className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" />
                                </div>
                                <button onClick={handleAddPayment} className="w-full bg-emerald-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-emerald-700 transition-colors">
                                    {editingPaymentId ? 'Update Payment' : 'Record Payment'}
                                </button>
                            </div>
                        </div>

                        {/* Payments Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Payment History</h3>
                                <span className="text-xs text-gray-500 font-medium">{filteredPayments.length} records</span>
                            </div>
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Method / Note</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPayments.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 text-xs font-medium text-gray-500 whitespace-nowrap">{p.date}</td>
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

    // -------------------------------------------------------------
    // VIEW: SUPPLIER LIST (MAIN)
    // -------------------------------------------------------------
    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-gray-800">Suppliers</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage vendor accounts, procurement ledger, and cheque payments</p>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center gap-3">
                    <button
                        onClick={() => setView('cheques')}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm hover:bg-indigo-100 transition-colors"
                    >
                        <Landmark className="w-5 h-5 mr-2" /> Cheque Details
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg shadow-sm hover:bg-primary-700 transition-colors"
                    >
                        <PlusCircle className="w-5 h-5 mr-2" /> Add Supplier
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setView('list')}
                    className="px-6 py-3 font-bold text-sm text-indigo-600 border-b-2 border-indigo-600 transition-colors"
                >
                    Suppliers List
                </button>
                <button
                    onClick={() => setView('cheques')}
                    className="px-6 py-3 font-bold text-sm text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors"
                >
                    Cheque Details
                </button>
            </div>

            {/* Stats Cards */}
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
                        <p className="text-3xl font-bold text-gray-800">Rs. {suppliers.reduce((sum, s) => sum + calculateSupplierTotalPaid(s), 0).toLocaleString()}</p>
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
                        <p className="text-3xl font-bold text-gray-800">Rs. {suppliers.reduce((sum, s) => sum + (calculateTotalPurchases(s.purchases) - calculateSupplierTotalPaid(s)), 0).toLocaleString()}</p>
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
                    const totalPaid = calculateSupplierTotalPaid(supplier);
                    const balance = totalPurchased - totalPaid;

                    return (
                        <div key={supplier.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-bold text-slate-900">{supplier.name}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-600">{supplier.phone}</p>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${balance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                    {balance > 0 ? 'Due' : 'Clear'}
                                </span>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                                <div>
                                    <p className="text-[11px] font-bold uppercase text-slate-500">Purchased</p>
                                    <p className="mt-1 text-xs font-bold text-slate-900">Rs. {totalPurchased.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold uppercase text-slate-500">Paid</p>
                                    <p className="mt-1 text-xs font-bold text-emerald-600">Rs. {totalPaid.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold uppercase text-slate-500">Balance</p>
                                    <p className="mt-1 text-xs font-black text-rose-600">Rs. {balance.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    onClick={() => { setSelectedSupplierId(supplier.id); setView('detail'); }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                >
                                    <Eye className="h-3.5 w-3.5" /> View Ledger
                                </button>
                                <button
                                    onClick={() => handleDeleteSupplier(supplier.id)}
                                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                                    title="Delete supplier"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
                        No suppliers match your search.
                    </div>
                )}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-6 py-4">Supplier Name</th>
                                <th className="px-6 py-4">Phone Number</th>
                                <th className="px-6 py-4 text-right">Total Purchased</th>
                                <th className="px-6 py-4 text-right">Total Paid</th>
                                <th className="px-6 py-4 text-right">Balance Due</th>
                                {isAllBranchesScope && <th className="px-6 py-4">Branch</th>}
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                            {filteredSuppliers.map((s) => {
                                const totalPurchased = calculateTotalPurchases(s.purchases);
                                const totalPaid = calculateSupplierTotalPaid(s);
                                const balance = totalPurchased - totalPaid;

                                return (
                                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-900">{s.name}</td>
                                        <td className="px-6 py-4 font-semibold text-slate-600">{s.phone}</td>
                                        <td className="px-6 py-4 text-right font-black text-slate-900">Rs. {totalPurchased.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right font-black text-emerald-600">Rs. {totalPaid.toLocaleString()}</td>
                                        <td className={`px-6 py-4 text-right font-black ${balance > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                            Rs. {balance.toLocaleString()}
                                        </td>
                                        {isAllBranchesScope && <td className="px-6 py-4 font-semibold text-slate-600">{getBranchName(s.branchId)}</td>}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => { setSelectedSupplierId(s.id); setView('detail'); }}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                                                >
                                                    <Eye className="h-3.5 w-3.5" /> View Ledger
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteSupplier(s.id)}
                                                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 transition-colors"
                                                    title="Delete supplier"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredSuppliers.length === 0 && (
                                <tr>
                                    <td colSpan={isAllBranchesScope ? 7 : 6} className="px-6 py-12 text-center text-slate-400 italic">
                                        No suppliers found. Add one to get started.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Supplier Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold mb-4 text-slate-900">Add New Supplier</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Supplier Name</label>
                                <input
                                    type="text"
                                    value={newSupplier.name}
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
                                    placeholder="Company / Vendor Name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Phone Number</label>
                                <input
                                    type="text"
                                    value={newSupplier.phone}
                                    onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
                                    placeholder="077XXXXXXX"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddSupplier}
                                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 shadow-md"
                                >
                                    Save Supplier
                                </button>
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
                                            ? calculateSupplierTotalPaid(s)
                                            : calculateTotalPurchases(s.purchases) - calculateSupplierTotalPaid(s);
                                        
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
                                                    ? calculateSupplierTotalPaid(s)
                                                    : calculateTotalPurchases(s.purchases) - calculateSupplierTotalPaid(s);
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
