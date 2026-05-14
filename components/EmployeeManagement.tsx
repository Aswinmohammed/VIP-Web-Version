
import React, { useState, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { BranchPieceRate, Employee, WorkLog, SalaryPayment, DRESS_TYPES } from '../types';
import { PlusCircle, Search, User, Phone, DollarSign, Calendar, Clock, Printer, Trash2, ArrowLeft, Save, X, Scissors, List, Filter } from 'lucide-react';
import DressTypeDropdown from './DressTypeDropdown';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { printTailorLabel } from '../utils/labelPrinter';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';

const BRANCH_PIECE_LABEL = 'Branch Piece Count';
const TEMP_ID_PREFIX = 'EMP';

const EmployeeManagement: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const context = useContext(AppContext);
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Add Employee Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newEmployee, setNewEmployee] = useState<{
        name: string,
        phone: string,
        type: 'CutBase' | 'HourBase' | 'BranchEmployee',
        employeeBranchId: string,
        salarySourceBranchId: string,
        branchPieceRate: string,
        branchPieceRateEffectiveFrom: string,
    }>({
        name: '',
        phone: '',
        type: 'CutBase',
        employeeBranchId: '',
        salarySourceBranchId: '',
        branchPieceRate: '',
        branchPieceRateEffectiveFrom: today,
    });

    // Edit Modal States
    const [editingWorkLog, setEditingWorkLog] = useState<{ logId: string, employeeId: string } | null>(null);
    const [editingPayment, setEditingPayment] = useState<{ payId: string, employeeId: string } | null>(null);

    // Work Rate Mapping from Image
    const WORK_LOG_PRICES: Record<string, number> = {
        'Shirt': 320,
        'Shirt (Full Sleeve)': 360,
        'Shirt (Half Sleeve)': 360,
        'Trouser': 400,
        'Trouser (Official)': 510,
        'Trouser (Denim)': 510,
        'Trouser (Cut Model)': 510,
        'School Shirt': 230,
        'School Trouser': 400,
        'Thobe': 500,
        'Kurta': 360,
        'Thobe with pajama': 600,
        'Jubba with pajama': 600,
        'Jubba': 500,
        'Coat': 500,
        'Waist Coat': 230,
        'Elastic Trouser': 400,
        'Elastic Shorts': 230,
        'Band Shorts': 450,
        'Bow': 50
    };

    // Work Entry State
    const [workEntry, setWorkEntry] = useState({
        dressType: 'Hourly Work', // Default for HourBase
        quantity: 0,
        unitPrice: 0,
        startHour: '',
        endHour: '',
        salaryPerHour: 0,
        date: today
    });

    // Payment Entry State
    const [paymentEntry, setPaymentEntry] = useState({
        amount: '',
        date: today,
        note: ''
    });

    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // Filtering State for Detail View
    const [dateFilter, setDateFilter] = useState({ from: '', to: '' });
    const [isDressBreakdownOpen, setIsDressBreakdownOpen] = useState(false);
    const [branchRateForm, setBranchRateForm] = useState<{ id: string | null; rate: string; effectiveFrom: string; note: string }>({
        id: null,
        rate: '',
        effectiveFrom: today,
        note: '',
    });

    if (!context) return <div>Loading...</div>;
    const {
        employees,
        setEmployees,
        saveEmployeeWorkLog,
        deleteEmployeeWorkLog,
        saveEmployeeSalaryPayment,
        deleteEmployeeSalaryPayment,
        clearEmployeeSalaryDetails,
        deleteEmployeeRecord,
        isAllBranchesScope,
        getBranchName,
        branches,
        activeBranchId,
        currentUser,
    } = context;

    // --- Helpers ---

    const calculateTotalEarnings = (logs: WorkLog[] = []) => (logs || []).reduce((sum, log) => sum + (log.totalAmount || 0), 0);
    const calculateTotalPaid = (payments: SalaryPayment[] = []) => (payments || []).reduce((sum, pay) => sum + (pay.amount || 0), 0);
    const getInitialPieceRates = () => ({ ...WORK_LOG_PRICES });
    const getWritableBranchId = () => activeBranchId === 'all' ? currentUser?.branchId || branches[0]?.id || '' : activeBranchId;
    const isPieceBasedEmployee = (type?: Employee['type']) => !type || type === 'CutBase' || type === 'BranchEmployee';
    const createTempEmployeeId = () => `${TEMP_ID_PREFIX}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const createBranchRateId = () => `BRRATE${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const getSortedBranchRateHistory = (employee?: Employee) => [...(employee?.branchPieceRateHistory || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const getLegacyBranchRateFallback = (employee?: Employee) => {
        const values = Object.values(employee?.pieceRates || {}).map((value) => Number(value)).filter((value) => value > 0);
        return values[0] || 0;
    };
    const getBranchEmployeeRateForDate = (employee: Employee | undefined, date: string, fallbackRate = 0) => {
        if (!employee) return fallbackRate;
        const sorted = getSortedBranchRateHistory(employee);
        if (sorted.length > 0) {
            const effectiveRate = [...sorted].reverse().find((entry) => entry.effectiveFrom <= date);
            if (effectiveRate) {
                return effectiveRate.rate;
            }
            return sorted[0].rate;
        }
        return getLegacyBranchRateFallback(employee) || fallbackRate;
    };
    const recalculateBranchEmployeeLogs = (employee: Employee): Employee => {
        if (employee.type !== 'BranchEmployee') {
            return employee;
        }

        return {
            ...employee,
            workLogs: employee.workLogs.map((log) => {
                if (log.salaryPerHour) {
                    return log;
                }

                const rate = getBranchEmployeeRateForDate(employee, log.date, log.unitPrice);
                return {
                    ...log,
                    dressType: log.autoGenerated ? BRANCH_PIECE_LABEL : log.dressType || BRANCH_PIECE_LABEL,
                    unitPrice: rate,
                    totalAmount: Number((log.quantity * rate).toFixed(2)),
                };
            }),
        };
    };
    const resetBranchRateForm = () => setBranchRateForm({ id: null, rate: '', effectiveFrom: today, note: '' });

    const selectedEmployee = useMemo(() =>
        employees.find(e => e.id === selectedEmployeeId),
        [employees, selectedEmployeeId]);

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) return employees;
        const lower = searchTerm.toLowerCase();
        return employees.filter(e => e.name.toLowerCase().includes(lower) || e.phone.includes(lower));
    }, [employees, searchTerm]);

    const updateEmployeePieceRate = (employeeId: string, dressType: string, rate: number) => {
        setEmployees(employees.map((employee) => {
            if (employee.id !== employeeId || employee.type === 'BranchEmployee') {
                return employee;
            }

            const nextPieceRates = {
                ...(employee.pieceRates || {}),
                [dressType]: rate,
            };

            const nextWorkLogs = employee.workLogs.map((log) => {
                if (log.dressType !== dressType || log.salaryPerHour) {
                    return log;
                }

                return {
                    ...log,
                    unitPrice: rate,
                    totalAmount: log.quantity * rate,
                };
            });

            return {
                ...employee,
                pieceRates: nextPieceRates,
                workLogs: nextWorkLogs,
            };
        }));
    };

    // --- Actions ---

    const handleAddEmployee = () => {
        if (!newEmployee.name || !newEmployee.phone) return;
        if (!newEmployee.employeeBranchId) return;
        const normalizedName = newEmployee.name.trim().toLowerCase();
        const normalizedPhone = newEmployee.phone.replace(/\D/g, '');
        const initialBranchPieceRate = parseFloat(newEmployee.branchPieceRate);
        if (newEmployee.type === 'BranchEmployee' && !newEmployee.salarySourceBranchId) return;
        if (newEmployee.type === 'BranchEmployee' && (!newEmployee.branchPieceRateEffectiveFrom || isNaN(initialBranchPieceRate) || initialBranchPieceRate <= 0)) return;

        const duplicateEmployee = employees.find((employee) => (
            employee.branchId === newEmployee.employeeBranchId &&
            employee.type === newEmployee.type &&
            employee.name.trim().toLowerCase() === normalizedName &&
            employee.phone.replace(/\D/g, '') === normalizedPhone
        ));

        if (duplicateEmployee) {
            window.alert('An employee with the same name, phone, branch, and type already exists.');
            return;
        }

        const employee: Employee = {
            id: createTempEmployeeId(),
            branchId: newEmployee.employeeBranchId,
            name: newEmployee.name.trim(),
            phone: newEmployee.phone.trim(),
            type: newEmployee.type,
            salarySourceBranchId: newEmployee.type === 'BranchEmployee' ? newEmployee.salarySourceBranchId : undefined,
            pieceRates: newEmployee.type === 'CutBase' ? getInitialPieceRates() : {},
            branchPieceRateHistory: newEmployee.type === 'BranchEmployee' ? [{
                id: createBranchRateId(),
                rate: initialBranchPieceRate,
                effectiveFrom: newEmployee.branchPieceRateEffectiveFrom,
                createdAt: new Date().toISOString(),
            }] : [],
            workLogs: [],
            salaryPayments: [],
            joinedDate: today
        };
        setEmployees([...employees, employee]);
        setNewEmployee({ name: '', phone: '', type: 'CutBase', employeeBranchId: '', salarySourceBranchId: '', branchPieceRate: '', branchPieceRateEffectiveFrom: today });
        setIsAddModalOpen(false);
    };

    const handleSaveBranchRate = () => {
        if (!selectedEmployee || selectedEmployee.type !== 'BranchEmployee') return;

        const rate = parseFloat(branchRateForm.rate);
        if (!branchRateForm.effectiveFrom || isNaN(rate) || rate < 0) return;

        const previousEntry = selectedEmployee.branchPieceRateHistory?.find((entry) => entry.id === branchRateForm.id);
        const nextEntry: BranchPieceRate = {
            id: branchRateForm.id || createBranchRateId(),
            rate,
            effectiveFrom: branchRateForm.effectiveFrom,
            note: branchRateForm.note.trim() || undefined,
            createdAt: previousEntry?.createdAt || new Date().toISOString(),
        };

        const updatedEmployee = recalculateBranchEmployeeLogs({
            ...selectedEmployee,
            branchPieceRateHistory: [...(selectedEmployee.branchPieceRateHistory || []).filter((entry) => entry.id !== nextEntry.id), nextEntry]
                .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
        });

        setEmployees(employees.map((employee) => employee.id === selectedEmployee.id ? updatedEmployee : employee));
        resetBranchRateForm();
    };

    const startEditBranchRate = (entry: BranchPieceRate) => {
        setBranchRateForm({
            id: entry.id,
            rate: entry.rate.toString(),
            effectiveFrom: entry.effectiveFrom,
            note: entry.note || '',
        });
    };

    const handleDeleteBranchRate = (entryId: string) => {
        if (!selectedEmployee || selectedEmployee.type !== 'BranchEmployee') return;
        if (!window.confirm('Delete this branch piece rate?')) return;

        const updatedEmployee = recalculateBranchEmployeeLogs({
            ...selectedEmployee,
            branchPieceRateHistory: (selectedEmployee.branchPieceRateHistory || []).filter((entry) => entry.id !== entryId),
        });

        setEmployees(employees.map((employee) => employee.id === selectedEmployee.id ? updatedEmployee : employee));
        if (branchRateForm.id === entryId) {
            resetBranchRateForm();
        }
    };

    const handleAddWorkLog = async () => {
        if (!selectedEmployee) return;

        let totalAmount = 0;
        let finalDressType = workEntry.dressType;
        let effectiveUnitPrice = workEntry.unitPrice;

        if (selectedEmployee.type === 'HourBase') {
            if (!workEntry.startHour || !workEntry.endHour || workEntry.salaryPerHour <= 0) return;

            // Calculate duration in hours
            const start = new Date(`1970-01-01T${workEntry.startHour}`);
            const end = new Date(`1970-01-01T${workEntry.endHour}`);
            let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

            if (duration < 0) duration += 24; // Handle overnight shifts if any

            totalAmount = duration * workEntry.salaryPerHour;
            finalDressType = `Hour Based (${workEntry.startHour} - ${workEntry.endHour})`;
        } else if (selectedEmployee.type === 'BranchEmployee') {
            const effectiveRate = getBranchEmployeeRateForDate(selectedEmployee, workEntry.date || today);
            if (workEntry.quantity <= 0 || effectiveRate <= 0) return;
            effectiveUnitPrice = effectiveRate;
            totalAmount = workEntry.quantity * effectiveUnitPrice;
            finalDressType = BRANCH_PIECE_LABEL;
        } else {
            if (!workEntry.dressType || workEntry.quantity <= 0) return;
            effectiveUnitPrice = selectedEmployee.pieceRates?.[workEntry.dressType] ?? workEntry.unitPrice;
            totalAmount = workEntry.quantity * effectiveUnitPrice;
        }

        const newLog: WorkLog = {
            id: `WORK${Date.now()}`,
            dressType: finalDressType,
            quantity: selectedEmployee.type === 'HourBase' ? 1 : workEntry.quantity,
            unitPrice: selectedEmployee.type === 'HourBase' ? workEntry.salaryPerHour : effectiveUnitPrice,
            totalAmount: totalAmount,
            date: workEntry.date || new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            startHour: selectedEmployee.type === 'HourBase' ? workEntry.startHour : undefined,
            endHour: selectedEmployee.type === 'HourBase' ? workEntry.endHour : undefined,
            salaryPerHour: selectedEmployee.type === 'HourBase' ? workEntry.salaryPerHour : undefined,
        };

        void saveEmployeeWorkLog(selectedEmployee.id, newLog);
        setWorkEntry({
            dressType: selectedEmployee.type === 'HourBase' ? 'Hourly Work' : selectedEmployee.type === 'BranchEmployee' ? BRANCH_PIECE_LABEL : '',
            quantity: 0,
            unitPrice: 0,
            startHour: '',
            endHour: '',
            salaryPerHour: 0,
            date: today
        });
    };

    const handleAddPayment = async () => {
        if (!selectedEmployee || !paymentEntry.amount) return;
        const amount = parseFloat(paymentEntry.amount);
        if (isNaN(amount) || amount <= 0) return;

        const newPayment: SalaryPayment = {
            id: `PAY${Date.now()}`,
            amount: amount,
            date: paymentEntry.date || new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            note: paymentEntry.note
        };

        void saveEmployeeSalaryPayment(selectedEmployee.id, newPayment);
        setPaymentEntry({
            amount: '',
            date: today,
            note: ''
        });
    };

    const handleDeleteEmployee = (id: string) => {
        if (window.confirm('Are you sure you want to delete this employee?')) {
            void deleteEmployeeRecord(id);
            if (selectedEmployeeId === id) {
                setView('list');
                setSelectedEmployeeId(null);
            }
        }
    };

    const handleDeleteWorkLog = (logId: string) => {
        if (!selectedEmployee || !window.confirm('Delete this work entry?')) return;
        void deleteEmployeeWorkLog(selectedEmployee.id, logId);
    };

    const handleDeletePayment = (payId: string) => {
        if (!selectedEmployee || !window.confirm('Delete this payment entry?')) return;
        void deleteEmployeeSalaryPayment(selectedEmployee.id, payId);
    };

    const handleEditWorkLog = (logId: string, newQty: number, newPrice: number) => {
        if (!selectedEmployee) return;
        const targetLog = selectedEmployee.workLogs.find((log) => log.id === logId);
        if (!targetLog) return;
        void saveEmployeeWorkLog(selectedEmployee.id, {
            ...targetLog,
            quantity: newQty,
            unitPrice: newPrice,
            totalAmount: newQty * newPrice,
        });
        setEditingWorkLog(null);
    };

    const handleEditPayment = (payId: string, newAmount: number) => {
        if (!selectedEmployee) return;
        const targetPayment = selectedEmployee.salaryPayments.find((payment) => payment.id === payId);
        if (!targetPayment) return;
        void saveEmployeeSalaryPayment(selectedEmployee.id, {
            ...targetPayment,
            amount: newAmount,
        });
        setEditingPayment(null);
    };

    const handleEditExistingWorkLog = (log: WorkLog) => {
        if (!selectedEmployee) return;

        if (selectedEmployee.type === 'BranchEmployee') {
            if (log.autoGenerated) return;
            const nQty = prompt('Enter new Piece Count:', log.quantity.toString());
            if (!nQty) return;
            const nextQuantity = parseInt(nQty, 10);
            if (Number.isNaN(nextQuantity) || nextQuantity < 0) return;
            const rate = getBranchEmployeeRateForDate(selectedEmployee, log.date, log.unitPrice);
            handleEditWorkLog(log.id, nextQuantity, rate);
            return;
        }

        if (log.salaryPerHour) {
            const nPrice = prompt('Enter new Salary Per Hour:', log.salaryPerHour.toString());
            if (!nPrice) return;
            const price = parseFloat(nPrice);
            if (Number.isNaN(price) || price < 0) return;

            const duration = log.totalAmount / log.salaryPerHour;
            void saveEmployeeWorkLog(selectedEmployee.id, {
                ...log,
                salaryPerHour: price,
                totalAmount: price * duration,
                unitPrice: price,
            });
            return;
        }

        const nQty = prompt('Enter new Quantity:', log.quantity.toString());
        const nPrice = prompt('Enter new Unit Price:', log.unitPrice.toString());
        if (nQty && nPrice) {
            handleEditWorkLog(log.id, parseInt(nQty, 10), parseFloat(nPrice));
        }
    };

    const handleClearDetails = async () => {
        if (!selectedEmployee) return;
        if (window.confirm(`Are you sure you want to clear ALL salary and work details for ${selectedEmployee.name}? This action cannot be undone.`)) {
            try {
                await clearEmployeeSalaryDetails(selectedEmployee.id);
            } catch (error) {
                console.error(error);
            }
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const formatPhoneNumber = (phone: string) => {
        if (!phone) return '';
        const cleaned = ('' + phone).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) return `${match[1]} ${match[2]} ${match[3]}`;
        return phone;
    };

    const handleSaveAsPDF = async () => {
        const element = document.getElementById('print-statement');
        if (!element || !selectedEmployee) return;

        setIsGeneratingPDF(true);
        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 10;
            let y = 15;

            // Header
            pdf.setFontSize(18);
            pdf.setFont('helvetica', 'bold');
            pdf.text('VIP TAILORS & FASHION', pageWidth / 2, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text('Zahira College Road, Kalmunai.', pageWidth / 2, y, { align: 'center' });
            y += 5;
            pdf.text('Phone: 067 434 1177 | WhatsApp: 0777 77 0811', pageWidth / 2, y, { align: 'center' });
            y += 8;

            pdf.line(margin, y, pageWidth - margin, y);
            y += 8;

            // Employee Details
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`EMPLOYEE STATEMENT: ${selectedEmployee.name.toUpperCase()}`, margin, y);
            y += 6;
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Phone: ${formatPhoneNumber(selectedEmployee.phone)}`, margin, y);
            pdf.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, y, { align: 'right' });
            y += 6;
            if (dateFilter.from) {
                pdf.text(`Period: ${dateFilter.from} to ${dateFilter.to || 'Present'}`, margin, y);
                y += 6;
            }

            // Total Dress Count for Cut Base
            const isPieceBased = isPieceBasedEmployee(selectedEmployee.type);
            if (isPieceBased) {
                const totalDressCount = selectedEmployee.workLogs.filter(log => {
                    if (dateFilter.from && log.date < dateFilter.from) return false;
                    if (dateFilter.to && log.date > dateFilter.to) return false;
                    return true;
                }).reduce((sum, log) => sum + log.quantity, 0);
                
                pdf.setFont('helvetica', 'bold');
                pdf.text(`Total Dress Count: ${totalDressCount}`, margin, y);
                y += 6;
                pdf.setFont('helvetica', 'normal');
            }

            pdf.line(margin, y, pageWidth - margin, y);
            y += 10;

            // Work History Table
            pdf.setFont('helvetica', 'bold');
            pdf.text('WORK HISTORY', margin, y);
            y += 6;
            
            const workLogs = selectedEmployee.workLogs.filter(log => {
                if (dateFilter.from && log.date < dateFilter.from) return false;
                if (dateFilter.to && log.date > dateFilter.to) return false;
                return true;
            });

            pdf.setFontSize(9);
            pdf.text('Date', margin + 2, y);
            pdf.text('Description', margin + 30, y);
            pdf.text('Rate/Qty', margin + 120, y);
            pdf.text('Amount', pageWidth - margin - 2, y, { align: 'right' });
            y += 4;
            pdf.line(margin, y, pageWidth - margin, y);
            y += 6;

            pdf.setFont('helvetica', 'normal');
            let totalEarned = 0;
            workLogs.forEach(log => {
                if (y > 270) { pdf.addPage(); y = 20; }
                pdf.text(log.date, margin + 2, y);
                const desc = log.dressType.length > 40 ? log.dressType.substring(0, 37) + '...' : log.dressType;
                pdf.text(desc, margin + 30, y);
                const rate = log.salaryPerHour ? `${log.salaryPerHour}/hr` : `${log.quantity}x${log.unitPrice}`;
                pdf.text(rate, margin + 120, y);
                pdf.text(log.totalAmount.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });
                totalEarned += log.totalAmount;
                y += 6;
            });

            y += 2;
            pdf.line(margin, y, pageWidth - margin, y);
            y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.text('TOTAL EARNED:', margin + 120, y);
            pdf.text(totalEarned.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });
            y += 12;

            // Payments Table
            if (y > 250) { pdf.addPage(); y = 20; }
            pdf.text('PAYMENTS RECEIVED', margin, y);
            y += 6;
            
            const payments = selectedEmployee.salaryPayments.filter(pay => {
                if (dateFilter.from && pay.date < dateFilter.from) return false;
                if (dateFilter.to && pay.date > dateFilter.to) return false;
                return true;
            });

            pdf.setFontSize(9);
            pdf.text('Date', margin + 2, y);
            pdf.text('Note', margin + 30, y);
            pdf.text('Amount', pageWidth - margin - 2, y, { align: 'right' });
            y += 4;
            pdf.line(margin, y, pageWidth - margin, y);
            y += 6;

            pdf.setFont('helvetica', 'normal');
            let totalPaid = 0;
            payments.forEach(pay => {
                if (y > 270) { pdf.addPage(); y = 20; }
                pdf.text(pay.date, margin + 2, y);
                pdf.text(pay.note || '-', margin + 30, y);
                pdf.text(pay.amount.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });
                totalPaid += pay.amount;
                y += 6;
            });

            y += 2;
            pdf.line(margin, y, pageWidth - margin, y);
            y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.text('RECEIVED TOTAL:', margin + 120, y);
            pdf.text(totalPaid.toFixed(2), pageWidth - margin - 2, y, { align: 'right' });
            y += 12;

            // Summary Box
            const balance = totalEarned - totalPaid;
            pdf.setFillColor(240, 240, 240);
            pdf.rect(margin, y, pageWidth - (margin * 2), 15, 'F');
            pdf.setFontSize(12);
            const label = balance < 0 ? 'EXTRA PAYMENT:' : 'PENDING SALARY:';
            pdf.text(label, margin + 5, y + 10);
            pdf.text(`Rs. ${Math.abs(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, pageWidth - margin - 5, y + 10, { align: 'right' });

            const filename = `Statement_${selectedEmployee.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
            const pdfOutput = pdf.output('datauristring');

            downloadDataUri(filename, pdfOutput);
            alert('Statement downloaded successfully.');
        } catch (error) {
            console.error(error);
            alert("Failed to generate PDF.");
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    // --- Render ---

    if (view === 'detail' && selectedEmployee) {
        const workLogs = selectedEmployee.workLogs || [];
        const salaryPayments = selectedEmployee.salaryPayments || [];

        const filteredWorkLogs = workLogs.filter(log => {
            if (dateFilter.from && log.date < dateFilter.from) return false;
            if (dateFilter.to && log.date > dateFilter.to) return false;
            return true;
        });

        const filteredPayments = salaryPayments.filter(pay => {
            if (dateFilter.from && pay.date < dateFilter.from) return false;
            if (dateFilter.to && pay.date > dateFilter.to) return false;
            return true;
        });

        const filteredEarnings = calculateTotalEarnings(filteredWorkLogs);
        const filteredPaid = calculateTotalPaid(filteredPayments);
        const pendingAmount = filteredEarnings - filteredPaid;
        const branchRateHistory = getSortedBranchRateHistory(selectedEmployee);
        const branchEmployeeRate = selectedEmployee.type === 'BranchEmployee'
            ? getBranchEmployeeRateForDate(selectedEmployee, workEntry.date || today)
            : 0;
        const branchDailySummary = selectedEmployee.type === 'BranchEmployee'
            ? Object.values(filteredWorkLogs.reduce((summary, log) => {
                const key = `${log.date}__${log.unitPrice}`;
                if (!summary[key]) {
                    summary[key] = {
                        date: log.date,
                        quantity: 0,
                        unitPrice: log.unitPrice,
                        totalAmount: 0,
                    };
                }
                summary[key].quantity += log.quantity;
                summary[key].totalAmount += log.totalAmount;
                return summary;
            }, {} as Record<string, { date: string; quantity: number; unitPrice: number; totalAmount: number }>)).sort((a, b) => b.date.localeCompare(a.date))
            : [];

        // Dress Count Calculations
        const dressBreakdown: Record<string, number> = {};
        filteredWorkLogs.forEach(log => {
            if (isPieceBasedEmployee(selectedEmployee.type)) {
                dressBreakdown[log.dressType] = (dressBreakdown[log.dressType] || 0) + log.quantity;
            }
        });

        const totalDressCount = (Object.values(dressBreakdown) as number[]).reduce((sum, count) => sum + count, 0);

        return (
            <div className="space-y-6">
                <style>{`
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body * { visibility: hidden; }
            #print-statement, #print-statement * { visibility: visible; }
            #print-statement {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 76mm !important; /* Adjusted for printer margins */
              padding: 2mm !important;
              margin: 0 !important;
              background: white !important;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
              border: none !important;
              box-shadow: none !important;
              color: black !important;
              line-height: 1.5;
              box-sizing: border-box !important;
            }
            .no-print { display: none !important; }
            .solid-line { border-top: 1.5pt solid black; margin: 3mm 0; }
            .thin-line { border-top: 0.5pt solid black; margin: 2mm 0; }
            .bold { font-weight: 800; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-xs { font-size: 11px; }
            .text-sm { font-size: 14px; }
            .text-lg { font-size: 18px; }
            .uppercase { text-transform: uppercase; }
            .grand-total-section {
                border: 1.5pt solid black;
                padding: 2mm;
                margin: 2mm 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
          }
        `}</style>

                <div className="flex items-center justify-between print:hidden">
                    <button onClick={() => setView('list')} className="flex items-center text-gray-600 hover:text-indigo-600 transition-colors font-bold">
                        <ArrowLeft size={20} className="mr-2" /> Back to List
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                            <span className="text-sm font-semibold text-gray-500">Date Filter:</span>
                            <input type="date" value={dateFilter.from} onChange={e => setDateFilter({ ...dateFilter, from: e.target.value })} className="border rounded px-2 py-1 text-sm" />
                            <span className="text-gray-400">-</span>
                            <input type="date" value={dateFilter.to} onChange={e => setDateFilter({ ...dateFilter, to: e.target.value })} className="border rounded px-2 py-1 text-sm" />
                            {(dateFilter.from || dateFilter.to) && <button onClick={() => setDateFilter({ from: '', to: '' })}><X size={16} className="text-red-500" /></button>}
                        </div>
                        <button 
                            onClick={handleClearDetails}
                            className="flex items-center px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-lg font-bold hover:bg-red-100 transition-colors"
                        >
                            <Trash2 size={18} className="mr-2" /> Clear
                        </button>
                        <button onClick={handleSaveAsPDF} disabled={isGeneratingPDF} className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                            {isGeneratingPDF ? <Save size={18} className="mr-2 animate-spin" /> : <Save size={18} className="mr-2" />} Save PDF
                        </button>
                        <button onClick={handlePrint} className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg font-bold hover:bg-black transition-colors">
                            <Printer size={18} className="mr-2" /> Print Statement
                        </button>
                    </div>
                </div>

                {/* Employee Header Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex justify-between items-center print:hidden">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">{selectedEmployee.name}</h1>
                        <p className="text-gray-500 font-medium flex items-center mt-1">
                            <Phone size={16} className="mr-2" /> {selectedEmployee.phone}
                            <span className={`ml-4 px-2 py-0.5 rounded text-xs font-bold ${selectedEmployee.type === 'HourBase' ? 'bg-orange-100 text-orange-600' : selectedEmployee.type === 'BranchEmployee' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-600'}`}>
                                {selectedEmployee.type === 'HourBase' ? 'Hour Base' : selectedEmployee.type === 'BranchEmployee' ? 'Branch Employee' : 'Cut Base'}
                            </span>
                        </p>
                        {selectedEmployee.type === 'BranchEmployee' && selectedEmployee.salarySourceBranchId && (
                            <p className="mt-2 text-sm font-semibold text-emerald-700">
                                Piece Count Source Branch: {getBranchName(selectedEmployee.salarySourceBranchId)}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-8 text-right">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtered Earnings</p>
                            <p className="text-2xl font-bold text-gray-900">Rs. {filteredEarnings.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtered Paid</p>
                            <p className="text-2xl font-bold text-emerald-600">Rs. {filteredPaid.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filtered Pending</p>
                            <p className={`text-3xl font-black ${pendingAmount < 0 ? 'text-red-600' : 'text-indigo-600'}`}>
                                {pendingAmount < 0 ? 'Extra: ' : ''}Rs. {Math.abs(pendingAmount).toLocaleString()}
                            </p>
                        </div>
                        {isPieceBasedEmployee(selectedEmployee.type) && (
                            <button 
                                onClick={() => setIsDressBreakdownOpen(true)}
                                className="flex flex-col items-center justify-center bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all group"
                            >
                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">{selectedEmployee.type === 'BranchEmployee' ? 'Piece Count' : 'Dress Count'}</p>
                                <div className="flex items-center gap-2">
                                    <p className="text-3xl font-black text-indigo-700">{totalDressCount}</p>
                                    <Scissors size={20} className="text-indigo-500" />
                                </div>
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
                    {/* Work Entry Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold flex items-center"><PlusCircle size={20} className="mr-2 text-indigo-500" /> Add Work Log</h2>
                            <input 
                                type="date" 
                                value={workEntry.date} 
                                onChange={e => setWorkEntry({ ...workEntry, date: e.target.value })} 
                                className="text-xs border rounded px-2 py-1 font-bold text-gray-600"
                            />
                        </div>
                        <div className="space-y-4">
                            {selectedEmployee.type === 'HourBase' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Hour</label>
                                            <input
                                                type="time"
                                                value={workEntry.startHour}
                                                onChange={e => setWorkEntry({ ...workEntry, startHour: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">End Hour</label>
                                            <input
                                                type="time"
                                                value={workEntry.endHour}
                                                onChange={e => setWorkEntry({ ...workEntry, endHour: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Salary Per Hour (Rs.)</label>
                                        <input
                                            type="number"
                                            value={workEntry.salaryPerHour}
                                            onChange={e => setWorkEntry({ ...workEntry, salaryPerHour: parseFloat(e.target.value) || 0 })}
                                            className="w-full border rounded-lg px-3 py-2 font-bold text-indigo-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    {workEntry.startHour && workEntry.endHour && workEntry.salaryPerHour > 0 && (
                                        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600 font-medium">Estimated Pay:</span>
                                                <span className="font-bold text-indigo-700">
                                                    Rs. {(() => {
                                                        const start = new Date(`1970-01-01T${workEntry.startHour}`);
                                                        const end = new Date(`1970-01-01T${workEntry.endHour}`);
                                                        let duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                                                        if (duration < 0) duration += 24;
                                                        return (duration * workEntry.salaryPerHour).toFixed(2);
                                                    })()}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {selectedEmployee.type === 'BranchEmployee' ? (
                                        <>
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                                                <div className="font-bold text-emerald-800">Piece count source branch</div>
                                                <div className="mt-1 text-emerald-700">{selectedEmployee.salarySourceBranchId ? getBranchName(selectedEmployee.salarySourceBranchId) : 'No branch selected'}</div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Piece Count</label>
                                                    <input
                                                        type="number"
                                                        value={workEntry.quantity}
                                                        onChange={e => setWorkEntry({ ...workEntry, quantity: parseInt(e.target.value) || 0 })}
                                                        className="w-full border rounded-lg px-3 py-2 text-center font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Per Piece Amount</label>
                                                    <div className="w-full rounded-lg border bg-emerald-50 px-3 py-2 text-center font-bold text-emerald-700">
                                                        {branchEmployeeRate.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                                                    <div className="w-full bg-gray-50 border rounded-lg px-3 py-2 text-center font-bold text-indigo-600">
                                                        {(workEntry.quantity * branchEmployeeRate).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="mb-3 flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-800">Per Piece Rate History</p>
                                                        <p className="text-xs text-slate-500">Set the branch employee amount with effective dates. Logs from that date onward recalculate automatically.</p>
                                                    </div>
                                                    {branchRateForm.id && (
                                                        <button
                                                            onClick={resetBranchRateForm}
                                                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-200"
                                                        >
                                                            Cancel Edit
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                                    <div>
                                                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Effective From</label>
                                                        <input
                                                            type="date"
                                                            value={branchRateForm.effectiveFrom}
                                                            onChange={(e) => setBranchRateForm({ ...branchRateForm, effectiveFrom: e.target.value })}
                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Per Piece</label>
                                                        <input
                                                            type="number"
                                                            value={branchRateForm.rate}
                                                            onChange={(e) => setBranchRateForm({ ...branchRateForm, rate: e.target.value })}
                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-emerald-700"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Note</label>
                                                        <input
                                                            type="text"
                                                            value={branchRateForm.note}
                                                            onChange={(e) => setBranchRateForm({ ...branchRateForm, note: e.target.value })}
                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                                            placeholder="Optional reason"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex justify-end">
                                                    <button
                                                        onClick={handleSaveBranchRate}
                                                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                                                    >
                                                        {branchRateForm.id ? 'Update Rate' : 'Add Rate'}
                                                    </button>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                    {branchRateHistory.map((entry) => (
                                                        <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white bg-white px-3 py-2">
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-800">Rs. {entry.rate.toLocaleString()} per piece</div>
                                                                <div className="text-xs text-slate-500">From {entry.effectiveFrom}{entry.note ? ` • ${entry.note}` : ''}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button onClick={() => startEditBranchRate(entry)} className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600">Edit</button>
                                                                <button onClick={() => handleDeleteBranchRate(entry.id)} className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">Delete</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {branchRateHistory.length === 0 && (
                                                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm italic text-slate-400">
                                                            No branch piece rates added yet.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Select Dress</label>
                                                <DressTypeDropdown
                                                    value={workEntry.dressType}
                                                    onChange={(val) => setWorkEntry({
                                                        ...workEntry,
                                                        dressType: val,
                                                        unitPrice: selectedEmployee.pieceRates?.[val] || WORK_LOG_PRICES[val] || 0
                                                    })}
                                                    dressTypes={DRESS_TYPES}
                                                />
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                                                    <input
                                                        type="number"
                                                        value={workEntry.quantity}
                                                        onChange={e => setWorkEntry({ ...workEntry, quantity: parseInt(e.target.value) || 0 })}
                                                        className="w-full border rounded-lg px-3 py-2 text-center font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                                                    <input
                                                        type="number"
                                                        value={workEntry.unitPrice}
                                                        onChange={e => setWorkEntry({ ...workEntry, unitPrice: parseFloat(e.target.value) || 0 })}
                                                        className="w-full border rounded-lg px-3 py-2 text-center"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                                                    <div className="w-full bg-gray-50 border rounded-lg px-3 py-2 text-center font-bold text-indigo-600">
                                                        {(workEntry.quantity * workEntry.unitPrice).toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                            <button onClick={handleAddWorkLog} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">
                                {selectedEmployee.type === 'BranchEmployee' ? 'Add Manual Piece Count' : 'Add Work Entry'}
                            </button>
                        </div>
                    </div>

                    {/* Payment Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold mb-4 flex items-center"><DollarSign size={20} className="mr-2 text-emerald-500" /> Salary Payment</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rs.</span>
                                    <input
                                        type="number"
                                        value={paymentEntry.amount}
                                        onChange={e => setPaymentEntry({ ...paymentEntry, amount: e.target.value })}
                                        className="w-full border rounded-lg pl-10 pr-4 py-3 text-lg font-bold"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                                    <input
                                        type="date"
                                        value={paymentEntry.date}
                                        onChange={e => setPaymentEntry({ ...paymentEntry, date: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Note / Reference</label>
                                    <input
                                        type="text"
                                        value={paymentEntry.note}
                                        onChange={e => setPaymentEntry({ ...paymentEntry, note: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="Advance, etc.."
                                    />
                                </div>
                            </div>
                            <button onClick={handleAddPayment} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                                Add Payment
                            </button>
                            <div className="bg-emerald-50 rounded-lg p-4 mt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-emerald-800">Recent Payment</span>
                                    <span className="text-xs text-emerald-600">{selectedEmployee.salaryPayments[0]?.date || '-'}</span>
                                </div>
                                <div className="text-2xl font-black text-emerald-700">
                                    Rs. {selectedEmployee.salaryPayments[0]?.amount.toLocaleString() || '0.00'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {selectedEmployee.type === 'BranchEmployee' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-bold text-gray-700">Daily Piece Count Summary</h3>
                            <p className="mt-1 text-xs text-slate-500">Auto-generated and manual branch piece counts grouped by day.</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3 text-right">Piece Count</th>
                                        <th className="px-6 py-3 text-right">Per Piece</th>
                                        <th className="px-6 py-3 text-right">Total Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {branchDailySummary.map((entry) => (
                                        <tr key={`${entry.date}-${entry.unitPrice}`} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-semibold text-slate-800">{entry.date}</td>
                                            <td className="px-6 py-3 text-right font-bold text-slate-800">{entry.quantity}</td>
                                            <td className="px-6 py-3 text-right font-bold text-emerald-700">Rs. {entry.unitPrice.toLocaleString()}</td>
                                            <td className="px-6 py-3 text-right font-black text-indigo-600">Rs. {entry.totalAmount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {branchDailySummary.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center italic text-slate-400">No branch piece counts found for the selected period.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Data Tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-bold text-gray-700">Work History</h3>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Item</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredWorkLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-3 text-gray-500 text-xs">{log.date}</td>
                                            <td className="px-6 py-3">
                                                <div className="font-bold text-gray-800">{selectedEmployee.type === 'BranchEmployee' ? BRANCH_PIECE_LABEL : log.dressType}</div>
                                                <div className="text-xs text-gray-500">
                                                    {log.salaryPerHour ? (
                                                        <span>Rate: {log.salaryPerHour}/hr</span>
                                                    ) : (
                                                        <span>{log.quantity} x {log.unitPrice}</span>
                                                    )}
                                                </div>
                                                {selectedEmployee.type === 'BranchEmployee' && log.autoGenerated && (
                                                    <div className="mt-1 text-[11px] font-semibold text-emerald-600">Auto from order tracking</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-right font-bold text-gray-900">
                                                {log.totalAmount.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => handleEditExistingWorkLog(log)}
                                                        disabled={selectedEmployee.type === 'BranchEmployee' && log.autoGenerated}
                                                        className="p-1 text-blue-500 hover:bg-blue-50 rounded disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                                                        title="Edit"
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteWorkLog(log.id)}
                                                        disabled={selectedEmployee.type === 'BranchEmployee' && log.autoGenerated}
                                                        className="p-1 text-red-500 hover:bg-red-50 rounded disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredWorkLogs.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic">No work entries found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                            <h3 className="font-bold text-gray-700">Payment History</h3>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Note</th>
                                        <th className="px-6 py-3 text-right">Amount</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPayments.map(pay => (
                                        <tr key={pay.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-3 text-gray-500 text-xs">{pay.date}</td>
                                            <td className="px-6 py-3 text-xs text-gray-800 font-medium">{pay.note || '-'}</td>
                                            <td className="px-6 py-3 text-right font-bold text-emerald-600">
                                                {pay.amount.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => {
                                                            const nAmount = prompt('Enter new Amount:', pay.amount.toString());
                                                            if (nAmount) handleEditPayment(pay.id, parseFloat(nAmount));
                                                        }}
                                                        className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                                                        title="Edit"
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeletePayment(pay.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredPayments.length === 0 && (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400 italic">No payments found</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* --- 80mm THERMAL PRINT STATEMENT --- */}
                <div id="print-statement" className="hidden print:block bg-white text-black" style={{ width: '80mm' }}>
                    {/* Header */}
                    <div className="text-center">
                        <h1 className="text-lg bold uppercase">VIP Tailors</h1>
                        <p className="text-xs">
                            Zahira College Road, Kalmunai.<br />
                             <span className="bold">☎️: 067 434 1177</span>
                        </p>
                    </div>

                    <div className="solid-line"></div>

                    {/* Employee & Date Info */}
                    <div className="text-sm">
                        <div className="flex justify-between items-center border-b border-black pb-1 mb-1">
                            <span className="bold uppercase" style={{ fontSize: '13px' }}>Employee: {selectedEmployee.name}</span>

                        </div>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span>Phone: {selectedEmployee.phone}</span>
                            <span>Date: {new Date().toLocaleDateString()}</span>
                        </div>
                        {dateFilter.from && (
                            <div className="flex justify-between text-[10px]">
                                <span className="bold">Period:</span>
                                <span>{dateFilter.from} to {dateFilter.to || 'Now'}</span>
                            </div>
                        )}
                        {isPieceBasedEmployee(selectedEmployee.type) && (
                            <div className="flex justify-between text-[10px] mt-1 pt-1 border-t border-dotted border-black">
                                <span className="bold uppercase">{selectedEmployee.type === 'BranchEmployee' ? 'Total Piece Count:' : 'Total Dress Count:'}</span>
                                <span className="bold">{totalDressCount}</span>
                            </div>
                        )}
                    </div>

                    <div className="solid-line"></div>

                    {/* Work Log Summary */}
                    <div className="text-sm">
                        <div className="bold uppercase mb-2 text-center" style={{ fontSize: '12px' }}>-- Work Log Summary --</div>
                        <div className="flex justify-between bold text-xs uppercase mb-1">
                            <span>Description</span>
                            <span>Total</span>
                        </div>
                        {filteredWorkLogs.map(log => (
                            <div key={log.id} className="mb-2">
                                <div className="bold uppercase" style={{ fontSize: '11px' }}>{log.dressType}</div>
                                <div className="flex justify-between text-xs">
                                    <span>
                                        {log.date} {log.salaryPerHour ? `(Rate: ${log.salaryPerHour})` : `(${log.quantity} x ${log.unitPrice})`}
                                    </span>
                                    <span className="bold">{log.totalAmount.toFixed(2)}</span>
                                </div>
                            </div>
                        ))}
                        <div className="thin-line"></div>
                        <div className="flex justify-between bold">
                            <span>Total Earned:</span>
                            <span>Rs. {filteredEarnings.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="solid-line"></div>

                    {/* Payments */}
                    <div className="text-sm">
                        <div className="bold uppercase mb-2 text-center" style={{ fontSize: '12px' }}>-- Payments Received --</div>
                        <div className="flex justify-between bold text-xs uppercase mb-1">
                            <span>Date / Note</span>
                            <span>Amount</span>
                        </div>
                        {filteredPayments.map(pay => (
                            <div key={pay.id} className="mb-2">
                                <div className="flex justify-between text-xs">
                                    <span className="bold">{pay.date}</span>
                                    <span className="bold">{pay.amount.toFixed(2)}</span>
                                </div>
                                {pay.note && <div className="text-[10px] italic">{pay.note}</div>}
                            </div>
                        ))}
                        <div className="thin-line"></div>
                        <div className="flex justify-between bold">
                            <span>Received Total:</span>
                            <span>Rs. {filteredPaid.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="solid-line"></div>

                    {/* Grand Total */}
                    <div className="text-sm">
                        <div className="grand-total-section flex justify-between items-center">
                            <span className="bold uppercase text-sm">{pendingAmount < 0 ? 'Extra Payment:' : 'Pending Salary:'}</span>
                            <span className="bold" style={{ fontSize: '13px' }}>Rs. {Math.abs(pendingAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div className="solid-line"></div>

                    <div className="text-center text-xs">
                        <p className="mt-4">__________________________</p>
                        <p className="bold">Authorized Signature</p>
                        <p className="mt-2 text-[10px] italic">Software By ARM.ASWIN - 0778514532</p>
                    </div>
                </div>

                {/* Dress Breakdown Modal */}
                {isDressBreakdownOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:hidden">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                                <div className="flex items-center gap-3">
                                    <div className="bg-white/20 p-2 rounded-lg">
                                        <Scissors size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">{selectedEmployee.type === 'BranchEmployee' ? 'Piece Count Breakdown' : 'Dress Count Breakdown'}</h2>
                                        <p className="text-indigo-100 text-xs">{selectedEmployee.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsDressBreakdownOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6">
                                {/* Summary Section */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Total Qty</p>
                                        <p className="text-3xl font-black text-indigo-700">{totalDressCount}</p>
                                    </div>
                                    {(selectedEmployee.type === 'BranchEmployee'
                                        ? branchDailySummary.map((entry) => [entry.date, entry.quantity] as const)
                                        : Object.entries(dressBreakdown)
                                    ).map(([type, count]) => (
                                        <div key={type} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate" title={type}>
                                                {selectedEmployee.type === 'BranchEmployee' ? `Date ${type}` : type}
                                            </p>
                                            <p className="text-xl font-bold text-gray-800">{count}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* List Section */}
                                <div className="border rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <List size={16} /> Daily Breakdown
                                        </h3>
                                        <div className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full uppercase">
                                            {dateFilter.from ? `${dateFilter.from} to ${dateFilter.to || 'Now'}` : 'All Time'}
                                        </div>
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-3">Date</th>
                                                    <th className="px-4 py-3">{selectedEmployee.type === 'BranchEmployee' ? 'Per Piece' : 'Dress Type'}</th>
                                                    <th className="px-4 py-3 text-right">{selectedEmployee.type === 'BranchEmployee' ? 'Piece Count' : 'Count'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedEmployee.type === 'BranchEmployee'
                                                    ? branchDailySummary.map((entry) => (
                                                        <tr key={`${entry.date}-${entry.unitPrice}`} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-4 py-3 text-gray-500 text-xs font-medium">{entry.date}</td>
                                                            <td className="px-4 py-3 font-semibold text-gray-800">Rs. {entry.unitPrice.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-right font-black text-indigo-600">{entry.quantity}</td>
                                                        </tr>
                                                    ))
                                                    : filteredWorkLogs
                                                        .filter(() => isPieceBasedEmployee(selectedEmployee.type))
                                                        .map(log => (
                                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                                <td className="px-4 py-3 text-gray-500 text-xs font-medium">{log.date}</td>
                                                                <td className="px-4 py-3 font-semibold text-gray-800">{log.dressType}</td>
                                                                <td className="px-4 py-3 text-right font-black text-indigo-600">{log.quantity}</td>
                                                            </tr>
                                                        ))}
                                                {(selectedEmployee.type === 'BranchEmployee' ? branchDailySummary.length === 0 : filteredWorkLogs.filter(() => isPieceBasedEmployee(selectedEmployee.type)).length === 0) && (
                                                    <tr>
                                                        <td colSpan={3} className="px-6 py-10 text-center text-gray-400 italic">
                                                            {selectedEmployee.type === 'BranchEmployee' ? 'No piece records found for the selected period.' : 'No dress records found for the selected period.'}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-between items-center gap-4">
                                    <div className="flex items-center gap-2 text-gray-500">
                                        <Filter size={16} />
                                        <span className="text-xs font-medium italic">Already following the main page filter</span>
                                    </div>
                                    <button 
                                        onClick={() => setIsDressBreakdownOpen(false)}
                                        className="px-6 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- List View calculations with filter ---
    const allWorkLogs = employees.flatMap(e => e.workLogs);
    const allPayments = employees.flatMap(e => e.salaryPayments);

    const filteredAllWorkLogs = allWorkLogs.filter(log => {
        if (dateFilter.from && log.date < dateFilter.from) return false;
        if (dateFilter.to && log.date > dateFilter.to) return false;
        return true;
    });

    const filteredAllPayments = allPayments.filter(pay => {
        if (dateFilter.from && pay.date < dateFilter.from) return false;
        if (dateFilter.to && pay.date > dateFilter.to) return false;
        return true;
    });

    const allEmployeesTotalEarnings = calculateTotalEarnings(filteredAllWorkLogs);
    const allEmployeesTotalPaid = calculateTotalPaid(filteredAllPayments);
    const allEmployeesPending = allEmployeesTotalEarnings - allEmployeesTotalPaid;

    return (
        <div className="space-y-6">
            <div className="sm:flex sm:items-center sm:justify-between">
                <h1 className="text-4xl font-bold text-gray-800">Employee Management</h1>
                <div className="mt-4 sm:mt-0">
                    <button onClick={() => { setNewEmployee({ name: '', phone: '', type: 'CutBase', employeeBranchId: '', salarySourceBranchId: '', branchPieceRate: '', branchPieceRateEffectiveFrom: today }); setIsAddModalOpen(true); }} className="inline-flex items-center justify-center px-4 py-2 text-sm font-bold text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
                        <PlusCircle className="w-5 h-5 mr-2" /> Add Employee
                    </button>
                </div>
            </div>

            <AdminFilterBar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Search employee name or phone..."
                fromDate={dateFilter.from}
                toDate={dateFilter.to}
                onFromDateChange={(value) => setDateFilter((current) => ({ ...current, from: value }))}
                onToDateChange={(value) => setDateFilter((current) => ({ ...current, to: value }))}
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Employees</p>
                    <p className="text-3xl font-black text-gray-900 mt-2">{employees.length}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{dateFilter.from || dateFilter.to ? 'Filtered Earnings' : 'Total Earnings Logged'}</p>
                    <p className="text-3xl font-black text-indigo-600 mt-2">Rs. {allEmployeesTotalEarnings.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{dateFilter.from || dateFilter.to ? 'Filtered Paid' : 'Total Paid Salary'}</p>
                    <p className="text-3xl font-black text-emerald-600 mt-2">Rs. {allEmployeesTotalPaid.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{dateFilter.from || dateFilter.to ? 'Filtered Pending' : 'Total Pending'}</p>
                    <p className="text-3xl font-black text-orange-600 mt-2">Rs. {allEmployeesPending.toLocaleString()}</p>
                </div>
            </div>

            <div className="space-y-4 md:hidden">
                {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => {
                    const empFilteredWorkLogs = emp.workLogs.filter(log => {
                        if (dateFilter.from && log.date < dateFilter.from) return false;
                        if (dateFilter.to && log.date > dateFilter.to) return false;
                        return true;
                    });
                    const empFilteredPayments = emp.salaryPayments.filter(pay => {
                        if (dateFilter.from && pay.date < dateFilter.from) return false;
                        if (dateFilter.to && pay.date > dateFilter.to) return false;
                        return true;
                    });
                    const earned = calculateTotalEarnings(empFilteredWorkLogs);
                    const paid = calculateTotalPaid(empFilteredPayments);
                    const pending = earned - paid;
                    const dressCount = isPieceBasedEmployee(emp.type) ? empFilteredWorkLogs.reduce((sum, log) => sum + log.quantity, 0) : 0;

                    return (
                        <div key={emp.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-bold text-slate-900">{emp.name}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-600">{emp.phone}</p>
                                </div>
                                <button onClick={() => handleDeleteEmployee(emp.id)} className="rounded-lg bg-red-50 p-2 text-red-600">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Dress Count</p>
                                    <p className="mt-1 font-bold text-slate-900">{isPieceBasedEmployee(emp.type) ? dressCount : '-'}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pending</p>
                                    <p className="mt-1 font-bold text-orange-600">Rs. {pending.toLocaleString()}</p>
                                </div>
                            </div>
                            {isAllBranchesScope && (
                                <div className="mt-3">
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                                        {getBranchName(emp.branchId)}
                                    </span>
                                </div>
                            )}
                            <div className="mt-4 flex items-center gap-2">
                                <button onClick={() => { setSelectedEmployeeId(emp.id); setView('detail'); }} className="flex-1 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600">View</button>
                                <button onClick={() => printTailorLabel(emp.name)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Label</button>
                            </div>
                        </div>
                    );
                }) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
                        No employees found.
                    </div>
                )}
            </div>

            <div className="hidden overflow-hidden rounded-lg bg-white shadow-md md:block">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 font-bold">
                        <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Phone</th>
                            <th className="px-6 py-4 text-center">Dress Count</th>
                            <th className="px-6 py-4 text-right">Total Earnings</th>
                            <th className="px-6 py-4 text-right">Paid Amount</th>
                            <th className="px-6 py-4 text-right">Pending</th>
                            {isAllBranchesScope && <th className="px-6 py-4">Branch</th>}
                            <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEmployees.map(emp => {
                            const empFilteredWorkLogs = emp.workLogs.filter(log => {
                                if (dateFilter.from && log.date < dateFilter.from) return false;
                                if (dateFilter.to && log.date > dateFilter.to) return false;
                                return true;
                            });
                            const empFilteredPayments = emp.salaryPayments.filter(pay => {
                                if (dateFilter.from && pay.date < dateFilter.from) return false;
                                if (dateFilter.to && pay.date > dateFilter.to) return false;
                                return true;
                            });

                            const earned = calculateTotalEarnings(empFilteredWorkLogs);
                            const paid = calculateTotalPaid(empFilteredPayments);
                            const pending = earned - paid;
                            // Default to CutBase if type is missing (legacy records)
                            const isPieceBased = isPieceBasedEmployee(emp.type);
                            const dressCount = isPieceBased 
                                ? empFilteredWorkLogs.reduce((sum, log) => sum + log.quantity, 0)
                                : '-';

                            return (
                                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900">{emp.name}</td>
                                    <td className="px-6 py-4">{emp.phone}</td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md text-indigo-700 font-bold border border-indigo-100">
                                            {dressCount}
                                            {isPieceBased && <Scissors size={12} className="text-indigo-400" />}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-indigo-600">{earned.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-medium text-emerald-600">{paid.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-black text-orange-600">{pending.toLocaleString()}</td>
                                    {isAllBranchesScope && <td className="px-6 py-4 font-semibold text-slate-600">{getBranchName(emp.branchId)}</td>}
                                    <td className="px-6 py-4 flex justify-center gap-2">
                                        <button 
                                            onClick={() => { 
                                                setSelectedEmployeeId(emp.id); 
                                                setView('detail'); 
                                                if (isPieceBasedEmployee(emp.type)) setIsDressBreakdownOpen(true);
                                            }} 
                                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-100 border border-indigo-200"
                                            title="View Dress Breakdown"
                                        >
                                            <Scissors size={16} />
                                        </button>
                                        <button 
                                            onClick={() => printTailorLabel(emp.name)} 
                                            className="p-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-black border border-black shadow-sm flex items-center gap-1"
                                            title="Print Tailor Label"
                                        >
                                            <Printer size={16} />
                                            <span>Label</span>
                                        </button>
                                        <button onClick={() => { setSelectedEmployeeId(emp.id); setView('detail'); }} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-100 border border-indigo-200">
                                            View
                                        </button>
                                        <button onClick={() => handleDeleteEmployee(emp.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded-md hover:bg-red-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredEmployees.length === 0 && (
                            <tr>
                                <td colSpan={isAllBranchesScope ? 8 : 7} className="px-6 py-12 text-center text-gray-500 italic">No employees found. Add one to get started.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold mb-4">Add New Employee</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Name</label>
                                <input type="text" value={newEmployee.name} onChange={e => setNewEmployee({ ...newEmployee, name: e.target.value })} className="mt-1 w-full border rounded-md px-3 py-2" placeholder="Full Name" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Phone</label>
                                <input type="text" value={newEmployee.phone} onChange={e => setNewEmployee({ ...newEmployee, phone: e.target.value })} className="mt-1 w-full border rounded-md px-3 py-2" placeholder="Phone Number" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Employee Type</label>
                                <select
                                    value={newEmployee.type}
                                    onChange={e => setNewEmployee({
                                        ...newEmployee,
                                        type: e.target.value as 'CutBase' | 'HourBase' | 'BranchEmployee',
                                        salarySourceBranchId: e.target.value === 'BranchEmployee' ? newEmployee.salarySourceBranchId : '',
                                        branchPieceRate: e.target.value === 'BranchEmployee' ? newEmployee.branchPieceRate : '',
                                        branchPieceRateEffectiveFrom: e.target.value === 'BranchEmployee' ? newEmployee.branchPieceRateEffectiveFrom : today,
                                    })}
                                    className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
                                >
                                    <option value="CutBase">Cut Base Salary (Piece Rate)</option>
                                    <option value="HourBase">Hour Base Salary</option>
                                    <option value="BranchEmployee">Branch Employee</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Employee Branch</label>
                                <select
                                    value={newEmployee.employeeBranchId}
                                    onChange={e => setNewEmployee({ ...newEmployee, employeeBranchId: e.target.value })}
                                    className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
                                >
                                    <option value="">Select Branch</option>
                                    {branches.map((branch) => (
                                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                                    ))}
                                </select>
                            </div>
                            {newEmployee.type === 'BranchEmployee' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Piece Count Source Branch</label>
                                        <select
                                            value={newEmployee.salarySourceBranchId}
                                            onChange={e => setNewEmployee({ ...newEmployee, salarySourceBranchId: e.target.value })}
                                            className="mt-1 w-full border rounded-md px-3 py-2 bg-white"
                                        >
                                            <option value="">Select Branch</option>
                                            {branches.map((branch) => (
                                                <option key={branch.id} value={branch.id}>{branch.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Per Piece Amount</label>
                                            <input
                                                type="number"
                                                value={newEmployee.branchPieceRate}
                                                onChange={e => setNewEmployee({ ...newEmployee, branchPieceRate: e.target.value })}
                                                className="mt-1 w-full border rounded-md px-3 py-2"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Effective From</label>
                                            <input
                                                type="date"
                                                value={newEmployee.branchPieceRateEffectiveFrom}
                                                onChange={e => setNewEmployee({ ...newEmployee, branchPieceRateEffectiveFrom: e.target.value })}
                                                className="mt-1 w-full border rounded-md px-3 py-2"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                                <button onClick={handleAddEmployee} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Save Employee</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default EmployeeManagement;
