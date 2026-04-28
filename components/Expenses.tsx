
import React, { useState, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { Expense } from '../types';
import { PlusCircle, Trash2, Printer, Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';

const Expenses: React.FC = () => {
    const context = useContext(AppContext);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const printRef = useRef<HTMLDivElement>(null);

    if (!context) return <div>Loading...</div>;
    const { expenses, setExpenses, activeBranchId, isAllBranchesScope, getBranchName } = context;
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleAddExpense = (e: React.FormEvent) => {
        e.preventDefault();
        if (!description || !amount || !date) return;

        if (editingId) {
            setExpenses(prev => prev.map(exp => exp.id === editingId ? { ...exp, description, amount: parseFloat(amount), date } : exp));
            setEditingId(null);
        } else {
            const newExpense: Expense = {
                id: `EXP${Date.now()}`,
                branchId: activeBranchId || 'BR001',
                description,
                amount: parseFloat(amount),
                date
            };
            setExpenses([...expenses, newExpense]);
        }

        setDescription('');
        setAmount('');
        setDate(new Date().toISOString().split('T')[0]);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this expense?')) {
            setExpenses(expenses.filter(e => e.id !== id));
        }
    };

    const filteredExpenses = useMemo(() => {
        return expenses.filter(expense => {
            if (fromDate && expense.date < fromDate) return false;
            if (toDate && expense.date > toDate) return false;
            if (searchTerm && !expense.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [expenses, fromDate, searchTerm, toDate]);

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    const handlePrint = () => {
        const printContent = printRef.current?.innerHTML;
        if (printContent) {
            const printWindow = window.open('', '', 'height=800,width=1200');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Expenses Report</title>');
                printWindow.document.write(`
                    <style>
                        body { font-family: Arial, sans-serif; background: #fff; color: #111827; padding: 32px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
                        th { background: #f3f4f6; }
                    </style>
                `);
                printWindow.document.write('</head><body>');
                printWindow.document.write(printContent);
                printWindow.document.write('</body></html>');
                printWindow.document.close();
                printWindow.onload = function () {
                    printWindow.focus();
                    printWindow.print();
                    printWindow.close();
                };
            }
        }
    };

    const handleDownloadPDF = async () => {
        if (isGenerating) return;
        setIsGenerating(true);

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 15;
            let yPos = 20;

            const checkNewPage = (requiredSpace: number) => {
                if (yPos + requiredSpace > 280) {
                    pdf.addPage();
                    yPos = 20;
                    return true;
                }
                return false;
            };

            // Header
            pdf.setFontSize(22);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(31, 41, 55); // slate-800
            pdf.text('EXPENSE REPORT', pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(107, 114, 128); // gray-500
            const periodText = `Period: ${fromDate || 'All Time'} ${toDate ? `to ${toDate}` : ''}`;
            pdf.text(periodText, margin, yPos);
            pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
            yPos += 8;

            // Summary Box
            pdf.setDrawColor(229, 231, 235); // gray-200
            pdf.setFillColor(249, 250, 251); // gray-50
            pdf.roundedRect(margin, yPos, pageWidth - (margin * 2), 15, 2, 2, 'FD');

            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(220, 38, 38); // red-600
            pdf.text(`TOTAL EXPENSES:`, margin + 5, yPos + 10);
            pdf.text(`Rs. ${totalExpenses.toLocaleString()}`, pageWidth - margin - 5, yPos + 10, { align: 'right' });
            yPos += 25;

            // Table Header
            pdf.setFillColor(31, 41, 55); // slate-800
            pdf.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
            pdf.setFontSize(10);
            pdf.setTextColor(255, 255, 255);
            pdf.text('Date', margin + 5, yPos + 6.5);
            pdf.text('Description', margin + 35, yPos + 6.5);
            pdf.text('Amount', pageWidth - margin - 5, yPos + 6.5, { align: 'right' });
            yPos += 10;

            // Table Body
            pdf.setTextColor(31, 41, 55); // slate-800
            filteredExpenses.forEach((exp, idx) => {
                checkNewPage(10);

                // Zebra striping
                if (idx % 2 === 1) {
                    pdf.setFillColor(249, 250, 251);
                    pdf.rect(margin, yPos, pageWidth - (margin * 2), 10, 'F');
                }

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9);
                pdf.text(exp.date, margin + 5, yPos + 6.5);

                // Truncate description if too long
                const desc = exp.description.length > 55 ? exp.description.substring(0, 52) + '...' : exp.description;
                pdf.text(desc, margin + 35, yPos + 6.5);

                pdf.setFont('helvetica', 'bold');
                pdf.text(`Rs. ${exp.amount.toFixed(2)}`, pageWidth - margin - 5, yPos + 6.5, { align: 'right' });

                pdf.setDrawColor(243, 244, 246);
                pdf.line(margin, yPos + 10, pageWidth - margin, yPos + 10);
                yPos += 10;
            });

            // Footer
            const totalPages = pdf.internal.pages.length - 1;
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(156, 163, 175);
                pdf.text(`Page ${i} of ${totalPages} | VIP Tailors Management System`, pageWidth / 2, 285, { align: 'center' });
            }

            const fileName = `Expense_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            const pdfOutput = pdf.output('datauristring');

            downloadDataUri(fileName, pdfOutput);
            alert('Report downloaded successfully.');
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate readable PDF.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center sm:justify-between">
                <h1 className="text-4xl font-bold text-gray-800">Expenses</h1>
                <div className="flex space-x-3 mt-4 sm:mt-0">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isGenerating}
                        className="flex items-center px-6 py-2.5 text-sm font-black uppercase tracking-widest text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all shadow-lg shadow-green-600/20"
                    >
                        {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
                        {isGenerating ? "Saving..." : "Download PDF"}
                    </button>
                    <button onClick={handlePrint} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-md hover:bg-gray-700">
                        <Printer size={16} className="mr-2" /> Print
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center">
                        <PlusCircle className="w-5 h-5 mr-2 text-primary-600" /> Add New Expense
                    </h2>
                    <form onSubmit={handleAddExpense} className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="e.g., Shop Rent, Electricity"
                                required
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>
                        <div className="w-32">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                placeholder="0.00"
                                required
                                min="0"
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>
                        <div className="w-40">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                required
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>
                        <button type="submit" className="bg-primary-600 text-white px-6 py-2 rounded-md font-medium hover:bg-primary-700 transition-colors">
                            {editingId ? 'Update' : 'Add'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingId(null);
                                    setDescription('');
                                    setAmount('');
                                    setDate(new Date().toISOString().split('T')[0]);
                                }}
                                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md font-medium hover:bg-gray-300 transition-colors ml-2"
                            >
                                Cancel
                            </button>
                        )}
                    </form>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-white p-6 rounded-lg shadow-md border border-red-100 flex flex-col justify-center">
                    <p className="text-gray-500 font-medium text-sm uppercase tracking-wide">Total Expenses</p>
                    <h3 className="text-4xl font-bold text-red-600 mt-2">Rs. {totalExpenses.toLocaleString()}</h3>
                    <p className="text-xs text-gray-400 mt-2">
                        {fromDate || toDate ? 'For selected period' : 'All time'}
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="border-b bg-gray-50 p-4">
                    <h3 className="mb-4 text-lg font-semibold text-gray-700">Expense History</h3>
                    <AdminFilterBar
                        searchTerm={searchTerm}
                        onSearchChange={setSearchTerm}
                        searchPlaceholder="Search expense description..."
                        fromDate={fromDate}
                        toDate={toDate}
                        onFromDateChange={setFromDate}
                        onToDateChange={setToDate}
                    />
                </div>

                <div ref={printRef} className="p-0 bg-white">
                    <div className="hidden print:block p-8 mb-4 border-b">
                        <h1 className="text-2xl font-bold text-gray-800">Expense Report</h1>
                        <p className="text-gray-600">Period: {fromDate || 'Start'} to {toDate || 'Present'}</p>
                        <p className="text-gray-600 mt-2 font-bold">Total: Rs. {totalExpenses.toLocaleString()}</p>
                    </div>

                    <div className="space-y-4 p-4 md:hidden">
                        {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                            <div key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black uppercase tracking-widest text-slate-400">{expense.date}</p>
                                        <p className="mt-2 text-base font-bold text-slate-900">{expense.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(expense.id)}
                                        className="rounded-lg bg-red-50 p-2 text-red-600"
                                        title="Delete Expense"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-500">Amount</span>
                                    <span className="text-lg font-black text-red-600">Rs. {expense.amount.toFixed(2)}</span>
                                </div>
                                {isAllBranchesScope && (
                                    <div className="mt-3">
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                                            {getBranchName(expense.branchId)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
                                No expenses found for this period.
                            </div>
                        )}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">Date</th>
                                    <th className="px-6 py-3">Description</th>
                                    <th className="px-6 py-3 text-right">Amount</th>
                                    {isAllBranchesScope && <th className="px-6 py-3">Branch</th>}
                                    <th className="px-6 py-3 text-center print:hidden">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredExpenses.length > 0 ? (
                                    filteredExpenses.map(expense => (
                                        <tr key={expense.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">{expense.date}</td>
                                            <td className="px-6 py-4">{expense.description}</td>
                                            <td className="px-6 py-4 text-right font-semibold text-red-600">Rs. {expense.amount.toFixed(2)}</td>
                                            {isAllBranchesScope && <td className="px-6 py-4 font-semibold text-slate-600">{getBranchName(expense.branchId)}</td>}
                                            <td className="px-6 py-4 text-center print:hidden flex justify-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingId(expense.id);
                                                        setDescription(expense.description);
                                                        setAmount(expense.amount.toString());
                                                        setDate(expense.date);
                                                    }}
                                                    className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 transition-colors"
                                                    title="Edit Expense"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"
                                                    title="Delete Expense"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={isAllBranchesScope ? 5 : 4} className="px-6 py-8 text-center text-gray-500 italic">
                                            No expenses found for this period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="hidden print:flex justify-end p-8 mt-4 border-t">
                        <div className="text-right">
                            <p className="text-sm text-gray-500">Total Expenses</p>
                            <p className="text-2xl font-bold text-gray-800">Rs. {totalExpenses.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Expenses;
