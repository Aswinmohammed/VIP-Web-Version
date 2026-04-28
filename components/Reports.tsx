import React, { useState, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Lock, Download, Calendar, Filter, X, Receipt, ShoppingBag, History, Search, ArrowUpRight, Loader2, Ban, Scale, Coins, HelpCircle, Info, BarChart2, Phone, Tag, AlertCircle, Edit, Eye } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { downloadDataUri } from '../utils/downloads';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const DetailModal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in duration-200">
      <div className="p-6 border-b flex justify-between items-center bg-white">
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
          <X size={24} />
        </button>
      </div>
      <div className="p-6 overflow-y-auto flex-1 bg-white">
        {children}
      </div>
    </div>
  </div>
);

interface ReportsProps {
  navigate: (page: string, customerId?: string) => void;
}

const Reports: React.FC<ReportsProps> = ({ navigate }) => {
  const context = useContext(AppContext);
  // Changed default year to 'All' to prevent orders from hiding if date is set to different year
  const [yearFilter, setYearFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');
  const [customerFilter, setCustomerFilter] = useState('All');

  const [isAccessGranted, setIsAccessGranted] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [activeModal, setActiveModal] = useState<'net' | 'outstanding' | 'discount' | 'pending_delivery' | 'order_summary' | null>(null);

  // Extra state for modal filtering
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [modalSearch, setModalSearch] = useState('');

  // Main page date range filters
  const [mainFromDate, setMainFromDate] = useState('');
  const [mainToDate, setMainToDate] = useState('');

  const reportRef = useRef<HTMLDivElement>(null);

  if (!context) return <div>Loading...</div>;
  const { orders, customers, expenses, employees, materialSales, inventory, currentBranch, isAllBranchesScope } = context;
  const branchScopeLabel = isAllBranchesScope ? 'All Branches' : currentBranch?.name || 'Branch Reports';

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === 'VIPT' || passwordInput === 'vipt') {
      setIsAccessGranted(true);
    } else {
      alert('Incorrect Password');
      setPasswordInput('');
    }
  };

  const formatOrderId = (id: string) => {
    if (id.startsWith('ORD') && !id.includes('-')) {
      return `ORD-${id.substring(3)}`;
    }
    return id;
  };

  const handleDownloadReport = async () => {
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
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(context.settings?.shopName || 'VIP Tailors', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Accounting Report - ${branchScopeLabel}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      let dateRangeText = 'Period: ';
      if (mainFromDate || mainToDate) {
        dateRangeText += `${mainFromDate || 'Start'} to ${mainToDate || 'End'}`;
      } else if (yearFilter !== 'All' || monthFilter !== 'All') {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateRangeText += yearFilter !== 'All' ? yearFilter : 'All Years';
        if (monthFilter !== 'All') dateRangeText += ` - ${monthNames[parseInt(monthFilter)]}`;
      } else {
        dateRangeText += 'All Time';
      }
      pdf.text(dateRangeText, margin, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      // Section 1: Sales Summary
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(34, 139, 34);
      pdf.text('1. SALES SUMMARY', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Sales Revenue:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Rs. ${totalSalesRevenue.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`  - Order Sales: Rs. ${totalOrdersRevenue.toLocaleString()}`, margin + 10, yPos);
      yPos += 5;

      // Calculate Order Payment Methods (Local Scope)
      const methodTotals = { Cash: 0, Card: 0, Bank: 0 };
      const localPeriodCheck = (d: string) => {
        if (!d) return false;
        if (mainFromDate || mainToDate) {
          if (mainFromDate && d < mainFromDate) return false;
          if (mainToDate && d > mainToDate) return false;
          return true;
        }
        const parts = d.split('-');
        if (parts.length < 2) return false;
        const yr = parseInt(parts[0]);
        const mo = parseInt(parts[1]) - 1;
        const yMatch = yearFilter === 'All' || yr.toString() === yearFilter;
        const mMatch = monthFilter === 'All' || mo.toString() === monthFilter;
        return yMatch && mMatch;
      };

      orders.forEach(o => {
        if (customerFilter !== 'All' && o.customerId !== customerFilter) return;
        if (o.payments && o.payments.length > 0) {
          o.payments.forEach(p => {
            if (localPeriodCheck(p.date)) {
              const m = p.method === 'Bank Transfer' ? 'Bank' : (p.method || 'Cash');
              if (methodTotals[m as keyof typeof methodTotals] !== undefined) {
                methodTotals[m as keyof typeof methodTotals] += p.amount;
              } else {
                methodTotals['Cash'] += p.amount;
              }
            }
          });
        } else if ((o.advance || 0) > 0) {
          if (localPeriodCheck(o.orderDate)) {
            methodTotals.Cash += o.advance;
          }
        }
      });

      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`    [ Cash: ${methodTotals.Cash.toLocaleString()} | Card: ${methodTotals.Card.toLocaleString()} | Bank: ${methodTotals.Bank.toLocaleString()} ]`, margin + 15, yPos);
      yPos += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);

      pdf.text(`  - Material Sales: Rs. ${totalMaterialRevenue.toLocaleString()}`, margin + 10, yPos);
      yPos += 5;

      // Calculate Material Sales by Payment Method
      const matMethodTotals = { Cash: 0, Card: 0, Bank: 0 };
      if (!isCustomerSelected) {
        (materialSales || []).filter(s => localPeriodCheck(s.date)).forEach(s => {
          const m = s.paymentMethod === 'Bank Transfer' ? 'Bank' : (s.paymentMethod || 'Cash');
          const amt = s.paidAmount !== undefined ? s.paidAmount : s.totalAmount;
          if (matMethodTotals[m as keyof typeof matMethodTotals] !== undefined) {
            matMethodTotals[m as keyof typeof matMethodTotals] += amt;
          } else {
            matMethodTotals['Cash'] += amt;
          }
        });
      }
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`    [ Cash: ${matMethodTotals.Cash.toLocaleString()} | Card: ${matMethodTotals.Card.toLocaleString()} | Bank: ${matMethodTotals.Bank.toLocaleString()} ]`, margin + 15, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.text(`Net Cash Collected:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Rs. ${totalCollections.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      pdf.setFont('helvetica', 'normal');
      pdf.text(`Outstanding Balance:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 140, 0);
      pdf.text(`Rs. ${totalOutstanding.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Discounts Given:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(128, 0, 128);
      pdf.text(`Rs. ${totalDiscounts.toLocaleString()} (${totalDiscountCount} orders)`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Material Sales Profit:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(16, 185, 129); // emerald-600
      pdf.text(`Rs. ${totalMaterialProfit.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 10;

      // Section 2: Expenses
      checkNewPage(30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(220, 20, 60);
      pdf.text('2. EXPENSES', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Expenses:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(220, 20, 60);
      pdf.text(`Rs. ${totalExpensesInPeriod.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      if (filteredExpenses.length > 0) {
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Recent Expenses:', margin + 10, yPos);
        yPos += 5;

        const topExpenses = filteredExpenses.slice(0, 5);
        topExpenses.forEach(exp => {
          checkNewPage(5);
          pdf.setFont('helvetica', 'normal');
          const expText = `${exp.date}: ${exp.description.substring(0, 40)}${exp.description.length > 40 ? '...' : ''}`;
          pdf.text(expText, margin + 15, yPos);
          pdf.text(`Rs. ${exp.amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
        });
      }
      yPos += 5;

      // Section 3: Salaries
      checkNewPage(30);

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(75, 0, 130);
      pdf.text('3. SALARY PAYMENTS', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Salary Paid:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(75, 0, 130);
      pdf.text(`Rs. ${totalSalaryPaid.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      if (employees.length > 0) {
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Employee-wise breakdown:', margin + 10, yPos);
        yPos += 5;

        employees.forEach(emp => {
          const empSalary = (emp.salaryPayments || [])
            .filter(payment => isDateInPeriod(payment.date))
            .reduce((sum, payment) => sum + payment.amount, 0);

          if (empSalary > 0) {
            checkNewPage(5);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`${emp.name}:`, margin + 15, yPos);
            pdf.text(`Rs. ${empSalary.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
            yPos += 4;
          }
        });
      }
      yPos += 8;

      // Section 4: Orders Summary
      checkNewPage(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 144, 255);
      pdf.text('4. ORDERS SUMMARY', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Orders Taken:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${filteredOrders.length} orders`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Dresses:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${totalDresses} pieces`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      const statusStats: Record<string, { count: number; amount: number; pieces: number }> = {
        'Pending': { count: 0, amount: 0, pieces: 0 },
        'In Progress': { count: 0, amount: 0, pieces: 0 },
        'Completed': { count: 0, amount: 0, pieces: 0 },
        'Packed': { count: 0, amount: 0, pieces: 0 },
        'Delivered': { count: 0, amount: 0, pieces: 0 },
        'Due': { count: 0, amount: 0, pieces: 0 },
      };

      filteredOrders.forEach(o => {
        const s = o.status || 'Pending';
        if (statusStats[s]) {
          statusStats[s].count++;
          const orderTotal = o.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
          const discount = Number(o.discount) || 0;
          const finalVal = Math.max(0, orderTotal - discount);
          
          if (s === 'Due') {
            const paid = (o.payments || []).reduce((sum, p) => sum + p.amount, 0) || (o.advance || 0);
            statusStats[s].amount += Math.max(0, finalVal - paid);
          } else {
            statusStats[s].amount += finalVal;
          }
          statusStats[s].pieces += o.items.reduce((sum, item) => sum + item.quantity, 0);
        }
      });

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.text('Order Status Breakdown:', margin + 10, yPos);
      yPos += 5;

      Object.entries(statusStats).forEach(([status, stats]) => {
        if (stats.count > 0) {
          checkNewPage(5);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${status}:`, margin + 15, yPos);
          pdf.text(`${stats.pieces} pieces (${stats.count} orders) — Rs. ${stats.amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
        }
      });
      yPos += 6;

      pdf.setFont('helvetica', 'italic');
      pdf.text('Dress Type Breakdown (with Status):', margin + 10, yPos);
      yPos += 5;

      const dressTypeStats: Record<string, { pending: number; completed: number; delivered: number; total: number }> = {};

      filteredOrders.forEach(order => {
        order.items.forEach(item => {
          if (!dressTypeStats[item.dressType]) {
            dressTypeStats[item.dressType] = { pending: 0, completed: 0, delivered: 0, total: 0 };
          }

          const qty = item.quantity;
          dressTypeStats[item.dressType].total += qty;

          if (order.status === 'Delivered') {
            dressTypeStats[item.dressType].delivered += qty;
          } else if (order.status === 'Completed' || order.status === 'Packed') {
            dressTypeStats[item.dressType].completed += qty;
          } else {
            dressTypeStats[item.dressType].pending += qty;
          }
        });
      });

      const sortedDressTypes = Object.entries(dressTypeStats).sort((a, b) => b[1].total - a[1].total);

      sortedDressTypes.forEach(([dressType, stats]) => {
        checkNewPage(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(`${dressType}:`, margin + 15, yPos);
        pdf.text(`${stats.total} pcs`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(`P: ${stats.pending} | C: ${stats.completed} | D: ${stats.delivered}`, margin + 20, yPos);
        yPos += 5;
      });
      yPos += 8;

      // Section 5: Financial Summary
      checkNewPage(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 128, 128);
      pdf.text('5. FINANCIAL SUMMARY', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      const netProfit = totalCollections - totalExpensesInPeriod - totalSalaryPaid;

      pdf.text(`Cash Collected:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(34, 139, 34);
      pdf.text(`Rs. ${totalCollections.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Less: Expenses:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(220, 20, 60);
      pdf.text(`Rs. ${totalExpensesInPeriod.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Less: Salaries Paid:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(75, 0, 130);
      pdf.text(`Rs. ${totalSalaryPaid.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      pdf.setDrawColor(0, 0, 0);
      pdf.line(margin + 5, yPos, pageWidth - margin, yPos);
      yPos += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(`Net Cash in Hand:`, margin + 5, yPos);
      pdf.setTextColor(netProfit >= 0 ? 34 : 220, netProfit >= 0 ? 139 : 20, netProfit >= 0 ? 34 : 60);
      pdf.text(`Rs. ${netProfit.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 10;

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.setFont('helvetica', 'italic');
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, 285, { align: 'center' });
        pdf.text('Generated by VIP Tailors Management System', pageWidth / 2, 290, { align: 'center' });
      }

      const fileName = `Accounting_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfOutput = pdf.output('datauristring');

      downloadDataUri(fileName, pdfOutput);
      alert('Accounting report downloaded successfully.');
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- ACCOUNTING HELPER FUNCTIONS ---

  // Safe date parsing to avoid timezone issues
  const parseDateStr = (dateStr: string) => {
    if (!dateStr) return { year: 0, month: -1 };
    const parts = dateStr.split('-');
    if (parts.length < 3) return { year: 0, month: -1 }; // Invalid format fallback
    return {
      year: parseInt(parts[0]),
      month: parseInt(parts[1]) - 1 // 0-indexed month
    };
  };

  // Get unique years from BOTH orders and expenses
  const availableYears = useMemo(() => {
    const orderYears = orders.map(o => parseDateStr(o.orderDate).year).filter(y => y > 0);
    const expenseYears = expenses.map(e => parseDateStr(e.date).year).filter(y => y > 0);
    const unique = new Set([...orderYears, ...expenseYears]);
    return Array.from(unique).sort().reverse();
  }, [orders, expenses]);

  const isDateInPeriod = React.useCallback((dateStr: string) => {
    if (!dateStr) return false;

    // If a specific date range is set, it takes priority
    if (mainFromDate || mainToDate) {
      if (mainFromDate && dateStr < mainFromDate) return false;
      if (mainToDate && dateStr > mainToDate) return false;
      return true;
    }

    // Otherwise fallback to Year/Month dropdowns
    const { year, month } = parseDateStr(dateStr);
    const y = year.toString();
    const m = month.toString(); // 0-11
    return (yearFilter === 'All' || y === yearFilter) &&
      (monthFilter === 'All' || m === monthFilter);
  }, [mainFromDate, mainToDate, yearFilter, monthFilter]);

  const isCustomerSelected = customerFilter !== 'All';

  // 1. REVENUE (Sales Accrual): Based on Order Date
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const dateMatch = isDateInPeriod(o.orderDate);
      const customerMatch = customerFilter === 'All' || o.customerId === customerFilter;
      return dateMatch && customerMatch;
    });
  }, [orders, yearFilter, monthFilter, customerFilter, mainFromDate, mainToDate]);

  const totalOrdersRevenue = filteredOrders.reduce((sum, o) => {
    const total = o.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
    return sum + Math.max(0, total - (Number(o.discount) || 0));
  }, 0);

  // Material sales are direct/walk-in, so they shouldn't show when a specific customer is selected
  const totalMaterialRevenue = isCustomerSelected
    ? 0
    : (materialSales || []).filter(s => isDateInPeriod(s.date)).reduce((sum, s) => sum + s.totalAmount, 0);

  const totalSalesRevenue = totalOrdersRevenue + totalMaterialRevenue;

  // Material Sales Profit Calculation with Dynamic Fallback for old records
  const totalMaterialProfit = useMemo(() => {
    if (isCustomerSelected) return 0;
    return (materialSales || []).filter(s => isDateInPeriod(s.date)).reduce((sum, s) => {
      const saleProfit = s.items.reduce((itemSum, item) => {
        // Fallback: If costPrice is missing (old data), try to find it in current inventory
        let cost = item.costPrice;
        if (cost === undefined || cost === null) {
          const invItem = inventory.find(i => i.id === item.itemId || i.name === item.category);
          cost = invItem?.unitPrice || 0;
        }
        return itemSum + ((item.unitPrice - cost) * item.quantity);
      }, 0);
      return sum + saleProfit;
    }, 0);
  }, [materialSales, inventory, isCustomerSelected, isDateInPeriod]);

  // Daily & Weekly Snapshots for Material Profit (Dynamic)
  const todayProfit = useMemo(() => {
    if (isCustomerSelected) return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    return (materialSales || []).filter(s => s.date === todayStr).reduce((sum, s) => {
      const saleProfit = s.items.reduce((itemSum, item) => {
        let cost = item.costPrice;
        if (cost === undefined || cost === null) {
          const invItem = inventory.find(i => i.id === item.itemId || i.name === item.category);
          cost = invItem?.unitPrice || 0;
        }
        return itemSum + ((item.unitPrice - cost) * item.quantity);
      }, 0);
      return sum + saleProfit;
    }, 0);
  }, [materialSales, inventory, isCustomerSelected]);

  const weeklyProfit = useMemo(() => {
    if (isCustomerSelected) return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff)).toISOString().split('T')[0];
    };
    const weekStart = getWeekStart(new Date());

    return (materialSales || []).filter(s => s.date >= weekStart && s.date <= todayStr).reduce((sum, s) => {
      const saleProfit = s.items.reduce((itemSum, item) => {
        let cost = item.costPrice;
        if (cost === undefined || cost === null) {
          const invItem = inventory.find(i => i.id === item.itemId || i.name === item.category);
          cost = invItem?.unitPrice || 0;
        }
        return itemSum + ((item.unitPrice - cost) * item.quantity);
      }, 0);
      return sum + saleProfit;
    }, 0);
  }, [materialSales, inventory, isCustomerSelected]);

  const totalDiscounts = filteredOrders.reduce((sum, o) => sum + (Number(o.discount) || 0), 0);
  const totalDiscountCount = filteredOrders.filter(o => (Number(o.discount) || 0) > 0).length;

  // 2. EXPENSES
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => isDateInPeriod(e.date));
  }, [expenses, yearFilter, monthFilter, mainFromDate, mainToDate]);

  const totalExpensesInPeriod = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const salariesInPeriod = useMemo(() => {
    return employees.flatMap(emp =>
      (emp.salaryPayments || [])
        .filter(payment => isDateInPeriod(payment.date))
        .map(payment => ({ ...payment, employeeName: emp.name }))
    );
  }, [employees, isDateInPeriod]);
  const totalSalaryPaid = salariesInPeriod.reduce((sum, payment) => sum + payment.amount, 0);

  // 3. CALCULATION MODES

  // A. OUTSTANDING CALCULATION (Global - ignoring period to match Due Orders page)
  const outstandingList = useMemo(() => {
    // We use all orders here because 'Outstanding' usually refers to total shop debt, 
    // and to match the 'Due Orders' page which has no date filter.
    const allOrdersOfCustomer = orders.filter(o => 
      customerFilter === 'All' || o.customerId === customerFilter
    );

    const list = allOrdersOfCustomer.map(o => {
      const itemsTotal = o.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
      const discount = Number(o.discount) || 0;
      const final = Math.max(0, itemsTotal - discount);
      const paid = (o.payments || []).reduce((s, p) => s + p.amount, 0) || (o.advance || 0);
      const customerData = customers.find(c => c.id === o.customerId);
      return {
        customer: customerData?.name || 'Unknown',
        phone: customerData?.phone || '',
        status: o.status,
        orderId: o.id,
        total: final,
        discount: discount,
        paid,
        balance: Math.max(0, final - paid),
        date: o.orderDate
      };
    });

    // Add Material Due Sales (Global or Period-based? Keeping global for total consistency)
    if (!isCustomerSelected) {
      (materialSales || []).forEach(s => {
        const balance = s.totalAmount - (s.paidAmount !== undefined ? s.paidAmount : s.totalAmount);
        if (balance > 0) {
          list.push({
            customer: s.customerName || 'Walk in Customer',
            phone: '',
            status: 'Delivered' as any, // Material sales are always delivered
            orderId: s.id,
            total: s.totalAmount,
            discount: 0,
            paid: s.paidAmount !== undefined ? s.paidAmount : s.totalAmount,
            balance: balance,
            date: s.date
          });
        }
      });
    }

    // Match DueOrders.tsx: Only include orders with status 'Due' (delivered but unpaid)
    return list.filter(o => o.status === 'Due' && o.balance > 0);
  }, [orders, customers, materialSales, customerFilter, isCustomerSelected]);

  const totalOutstanding = outstandingList.reduce((sum, o) => sum + o.balance, 0);
  const totalDresses = filteredOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

  // Discount Detail List
  const discountList = useMemo(() => {
    return filteredOrders
      .filter(o => (Number(o.discount) || 0) > 0)
      .map(o => {
        const itemsTotal = o.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
        const disc = Number(o.discount) || 0;
        const customerData = customers.find(c => c.id === o.customerId);

        // Check for Full Discount (tolerance for floating point)
        const isFullDiscount = Math.abs(itemsTotal - disc) < 1;

        return {
          orderId: o.id,
          date: o.orderDate,
          customer: customerData?.name || 'Unknown',
          phone: customerData?.phone || '',
          originalTotal: itemsTotal,
          discount: disc,
          isFullDiscount
        };
      });
  }, [filteredOrders, customers]);

  // B. NET CASH CALCULATION (CASH FLOW LOGIC ONLY)
  let netCashInHand = 0;
  let collectionsInPeriodList: any[] = [];

  // CASH FLOW LOGIC
  const paymentsList: any[] = [];
  orders.forEach(o => {
    if (customerFilter !== 'All' && o.customerId !== customerFilter) return;
    const cust = customers.find(c => c.id === o.customerId)?.name || 'Unknown';
    if (o.payments && o.payments.length > 0) {
      o.payments.forEach(p => {
        if (isDateInPeriod(p.date)) paymentsList.push({ ...p, customer: cust, orderId: o.id });
      });
    } else if ((o.advance || 0) > 0) {
      if (isDateInPeriod(o.orderDate)) paymentsList.push({ id: `ADV-${o.id}`, amount: o.advance, date: o.orderDate, customer: cust, orderId: o.id });
    }
  });

  // Add Material Sales Collections
  if (!isCustomerSelected) {
    (materialSales || []).forEach(s => {
      const paid = s.paidAmount !== undefined ? s.paidAmount : s.totalAmount;
      if (isDateInPeriod(s.date) && paid > 0) {
        paymentsList.push({
          id: s.id,
          amount: paid,
          date: s.date,
          customer: s.customerName || 'Walk in Customer',
          orderId: s.id,
          method: s.paymentMethod || 'Cash',
          type: 'Material Sale'
        });
      }
    });
  }

  collectionsInPeriodList = paymentsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalCollections = collectionsInPeriodList.reduce((sum, p) => sum + p.amount, 0);
  netCashInHand = isCustomerSelected ? totalCollections : (totalCollections - totalExpensesInPeriod - totalSalaryPaid);

  // C. PENDING DELIVERY CALCULATION
  const pendingDeliveryList = useMemo(() => {
    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

    return orders.filter(o => {
      // Must be status 'Completed' (meaning ready but not delivered)
      if (o.status !== 'Completed') return false;

      // Since we don't have a completionDate field, we use dueDate as the proxy 
      // for when the order was ready for pickup.
      return o.dueDate && o.dueDate < fourteenDaysAgoStr;
    }).map(o => {
      const customerData = customers.find(c => c.id === o.customerId);
      const itemsTotal = o.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
      const discount = Number(o.discount) || 0;
      const final = Math.max(0, itemsTotal - discount);
      return {
        orderId: o.id,
        customer: customerData?.name || 'Unknown',
        phone: customerData?.phone || '',
        amount: final,
        date: o.orderDate,
        dueDate: o.dueDate
      };
    });
  }, [orders, customers]);

  // --- CHARTS DATA ---
  const dressTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach(o => o.items.forEach(i => {
      counts[i.dressType] = (counts[i.dressType] || 0) + i.quantity;
    }));
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredOrders]);

  const salesPerformanceData = useMemo(() => {
    if (monthFilter !== 'All') {
      const dailyData = filteredOrders.reduce((acc, order) => {
        const day = new Date(order.orderDate).getDate();
        const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
        const finalAmount = Math.max(0, itemsTotal - (Number(order.discount) || 0));
        acc[day] = (acc[day] || 0) + finalAmount;
        return acc;
      }, {} as Record<number, number>);

      return Object.entries(dailyData)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([day, sales]) => ({ name: `Day ${day}`, sales }));
    } else {
      const monthsData = filteredOrders.reduce((acc, order) => {
        const month = new Date(order.orderDate).toLocaleString('default', { month: 'short' });
        const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
        const finalAmount = Math.max(0, itemsTotal - (Number(order.discount) || 0));
        acc[month] = (acc[month] || 0) + finalAmount;
        return acc;
      }, {} as Record<string, number>);
      return Object.entries(monthsData).map(([name, sales]) => ({ name, sales }));
    }
  }, [filteredOrders, monthFilter]);

  const orderSummaryData = useMemo(() => {
    const summary: Record<string, { total: number; totalAmount: number; ordersCount: number; types: Record<string, number> }> = {
      'Pending': { total: 0, totalAmount: 0, ordersCount: 0, types: {} },
      'In Progress': { total: 0, totalAmount: 0, ordersCount: 0, types: {} },
      'Completed': { total: 0, totalAmount: 0, ordersCount: 0, types: {} },
      'Packed': { total: 0, totalAmount: 0, ordersCount: 0, types: {} },
      'Due': { total: 0, totalAmount: 0, ordersCount: 0, types: {} },
      'Delivered': { total: 0, totalAmount: 0, ordersCount: 0, types: {} }
    };

    // For 'Due' status, we use all orders (global) to match the Due Orders page.
    // For other statuses, we use filteredOrders (period-specific).
    const allRelevantOrders = orders.filter(o => customerFilter === 'All' || o.customerId === customerFilter);

    orders.forEach(order => {
      const status = order.status || 'Pending';
      if (!summary[status]) return;

      const isForThisPeriod = isDateInPeriod(order.orderDate);
      const isForThisCustomer = customerFilter === 'All' || order.customerId === customerFilter;

      if (!isForThisCustomer) return;

      // Special case: 'Due' status is always global to match Due Orders page
      // Others are only counted if in the current period and customer filter
      if (status !== 'Due' && !isForThisPeriod) return;

      summary[status].ordersCount++;

      const orderTotal = order.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
      const discount = Number(order.discount) || 0;
      const finalVal = Math.max(0, orderTotal - discount);
      
      if (status === 'Due') {
        const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0) || (order.advance || 0);
        summary[status].totalAmount += Math.max(0, finalVal - paid);
      } else {
        summary[status].totalAmount += finalVal;
      }

      order.items.forEach(item => {
        summary[status].total += item.quantity;
        summary[status].types[item.dressType] = (summary[status].types[item.dressType] || 0) + item.quantity;
      });
    });

    return summary;
  }, [orders, filteredOrders, customerFilter, isDateInPeriod]);

  // --- MODAL FILTERING ---
  const filteredNetCashModal = useMemo(() => {
    return collectionsInPeriodList.filter(p => {
      const matchesSearch = p.customer.toLowerCase().includes(modalSearch.toLowerCase()) || p.orderId.toLowerCase().includes(modalSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (fromDate && p.date < fromDate) return false;
      if (toDate && p.date > toDate) return false;
      return true;
    });
  }, [collectionsInPeriodList, fromDate, toDate, modalSearch]);

  const filteredOutstandingModal = useMemo(() => {
    return outstandingList.filter(o => {
      const matchesSearch = o.customer.toLowerCase().includes(modalSearch.toLowerCase()) || (o.phone && o.phone.includes(modalSearch)) || o.orderId.toLowerCase().includes(modalSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (fromDate && o.date < fromDate) return false;
      if (toDate && o.date > toDate) return false;
      return true;
    });
  }, [outstandingList, fromDate, toDate, modalSearch]);

  const filteredDiscountModal = useMemo(() => {
    return discountList.filter(item => {
      const matchesSearch = item.customer.toLowerCase().includes(modalSearch.toLowerCase()) ||
        (item.phone && item.phone.includes(modalSearch)) ||
        item.orderId.toLowerCase().includes(modalSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (fromDate && item.date < fromDate) return false;
      if (toDate && item.date > toDate) return false;
      return true;
    });
  }, [discountList, fromDate, toDate, modalSearch]);

  const modalTotal = useMemo(() => {
    if (activeModal === 'net') return filteredNetCashModal.reduce((sum, p) => sum + p.amount, 0);
    if (activeModal === 'outstanding') return filteredOutstandingModal.reduce((sum, o) => sum + o.balance, 0);
    if (activeModal === 'discount') return filteredDiscountModal.reduce((sum, d) => sum + d.discount, 0);
    if (activeModal === 'pending_delivery') return pendingDeliveryList.reduce((sum, o) => sum + o.amount, 0);
    return 0;
  }, [activeModal, filteredNetCashModal, filteredOutstandingModal, filteredDiscountModal]);

  if (!isAccessGranted) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <div className="bg-white p-12 rounded-2xl shadow-xl w-full max-w-sm text-center border border-gray-100">
          <div className="bg-indigo-50 p-6 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Admin Reports</h2>
          <p className="text-gray-500 font-medium text-xs mb-8">Financial verification required</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="••••••"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none text-center font-bold text-xl tracking-widest focus:ring-2 focus:ring-indigo-500 transition-all"
              autoFocus
            />
            <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-md hover:bg-indigo-700 transition-all">Verify & Unlock</button>
          </form>
        </div>
      </div>
    );
  }

  return (
      <div className="space-y-8 pb-12 animate-in fade-in duration-700" ref={reportRef}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Sales Reports</h1>
            <p className="text-gray-500 text-sm font-medium mt-1">{branchScopeLabel}</p>
          </div>

        <div className="flex gap-3">
          <button
            onClick={handleDownloadReport}
            disabled={isGenerating}
            className="flex items-center px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download size={18} className="mr-2" />}
            {isGenerating ? "Generating..." : "Download Report"}
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-6">
        {/* CUSTOMER FILTER */}
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
          <span className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center"><Filter size={16} className="mr-2 text-indigo-500" /> Customer</span>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-md py-1.5 px-3 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="All">All Customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="h-8 w-px bg-gray-200 hidden lg:block"></div>

        {/* DATE RANGE FILTER (AS PER IMAGE) */}
        <div className="flex items-center gap-3 bg-gray-50/50 p-2 rounded-xl border border-gray-100">
          <div className="flex items-center px-2">
            <Filter size={18} className="text-slate-400" />
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <input
              type="date"
              value={mainFromDate}
              onChange={e => setMainFromDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-none border-none focus:ring-0 p-1"
            />
            <span className="text-slate-300 font-bold">—</span>
            <input
              type="date"
              value={mainToDate}
              onChange={e => setMainToDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-none border-none focus:ring-0 p-1"
            />
          </div>
        </div>

        {/* PERIOD DROPDOWNS (SECONDARY) */}
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); if (e.target.value !== 'All') { setMainFromDate(''); setMainToDate(''); } }} className="bg-white border border-gray-200 rounded-md py-1.5 px-2 text-xs font-semibold text-gray-500 outline-none hover:border-indigo-500 transition-colors">
              <option value="All">Annual</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={monthFilter} onChange={e => { setMonthFilter(e.target.value); if (e.target.value !== 'All') { setMainFromDate(''); setMainToDate(''); } }} className="bg-white border border-gray-200 rounded-md py-1.5 px-2 text-xs font-semibold text-gray-500 outline-none hover:border-indigo-500 transition-colors">
              <option value="All">All Mo.</option>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          {(mainFromDate || mainToDate || yearFilter !== 'All' || monthFilter !== 'All' || customerFilter !== 'All') && (
            <button
              onClick={() => { setMainFromDate(''); setMainToDate(''); setYearFilter('All'); setMonthFilter('All'); setCustomerFilter('All'); }}
              className="p-1.5 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-all"
              title="Reset All Filters"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-emerald-500 relative group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Total Sales (Revenue)</p>
              <p className="text-3xl font-bold text-emerald-600">Rs. {totalSalesRevenue.toLocaleString()}</p>
            </div>
          </div>
          <div className="absolute top-4 right-4 text-emerald-100 group-hover:text-emerald-500 transition-colors">
            <Receipt size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-teal-500 relative group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2 font-bold flex items-center gap-1.5">
                <Coins size={14} className="text-teal-500" /> Material Sales Profit
              </p>
              <p className="text-3xl font-bold text-teal-600">Rs. {totalMaterialProfit.toLocaleString()}</p>
              <div className="mt-3 flex gap-4 border-t border-teal-50 pt-2">
                <div className="flex flex-col">
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">Today</p>
                  <p className="text-xs font-bold text-teal-700">Rs. {todayProfit.toLocaleString()}</p>
                </div>
                <div className="w-px h-6 bg-teal-100 self-center"></div>
                <div className="flex flex-col">
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">Current Week</p>
                  <p className="text-xs font-bold text-teal-700">Rs. {weeklyProfit.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-4 right-4 text-teal-100 group-hover:text-teal-500 transition-colors">
            <BarChart2 size={24} />
          </div>
        </div>

        <div className={`p-6 rounded-lg shadow-sm border-b-4 relative group ${isCustomerSelected ? 'bg-gray-50 border-gray-300' : 'bg-white border-red-500'}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Total Expenses</p>
              {isCustomerSelected ? (
                <div className="flex items-center text-gray-400 mt-2">
                  <Ban size={20} className="mr-2" />
                  <span className="text-sm font-bold italic">Shop Wide Only</span>
                </div>
              ) : (
                <p className="text-3xl font-bold text-red-600">Rs. {totalExpensesInPeriod.toLocaleString()}</p>
              )}
            </div>
          </div>
          <div className={`absolute top-4 right-4 transition-colors ${isCustomerSelected ? 'text-gray-200' : 'text-red-100 group-hover:text-red-500'}`}>
            <ArrowUpRight size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-purple-500 cursor-pointer group hover:bg-purple-50 transition-all relative" onClick={() => setActiveModal('discount')}>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2 group-hover:text-purple-700">Total Discounts Given</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-purple-600">Rs. {totalDiscounts.toLocaleString()}</p>
              {totalDiscountCount > 0 && (
                <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {totalDiscountCount} Orders
                </span>
              )}
            </div>
          </div>
          <div className="absolute top-4 right-4 text-purple-100 group-hover:text-purple-500 transition-colors">
            <Tag size={24} />
          </div>
        </div>

        <div
          className="p-6 rounded-lg shadow-sm border-b-4 border-indigo-600 bg-white cursor-pointer group hover:bg-indigo-50 relative transition-all"
          onClick={() => setActiveModal('net')}
        >
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2 group-hover:text-indigo-700">Net Cash In Hand</p>
            <p className="text-3xl font-bold text-indigo-600">Rs. {netCashInHand.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 mt-2 font-medium flex items-center bg-gray-100 w-fit px-2 py-0.5 rounded">
              {isCustomerSelected ? 'Collections Only' : 'Collections - Expenses - Salaries'}
            </p>
          </div>
          <div className="absolute top-4 right-4 text-indigo-100 group-hover:text-indigo-500 transition-colors">
            <History size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-orange-500 cursor-pointer group hover:bg-orange-50 transition-all relative" onClick={() => setActiveModal('outstanding')}>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2 group-hover:text-orange-700">Outstanding Balance</p>
            <p className="text-3xl font-bold text-orange-600">Rs. {totalOutstanding.toLocaleString()}</p>
          </div>
          <div className="absolute top-4 right-4 text-orange-100 group-hover:text-orange-500 transition-colors">
            <Lock size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-blue-600 relative group">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">Total Dresses</p>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold text-blue-600">{totalDresses}</p>
              <span className="text-xs font-bold text-blue-400">({filteredOrders.length} Orders)</span>
            </div>
          </div>
          <div className="absolute top-4 right-4 text-blue-100 group-hover:text-blue-500 transition-colors">
            <ShoppingBag size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-rose-500 cursor-pointer group hover:bg-rose-50 transition-all relative" onClick={() => setActiveModal('pending_delivery')}>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2 group-hover:text-rose-700">Pending Delivery</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-rose-600">{pendingDeliveryList.length}</p>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Orders</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 font-medium bg-rose-50 w-fit px-2 py-0.5 rounded text-rose-600">
              Ready {'>'} 14 Days
            </p>
          </div>
          <div className="absolute top-4 right-4 text-rose-100 group-hover:text-rose-500 transition-colors">
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-sm border-b-4 border-slate-700 cursor-pointer group hover:bg-slate-50 transition-all relative" onClick={() => setActiveModal('order_summary')}>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2 group-hover:text-slate-800">Order Summary</p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-700">{totalDresses}</p>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{filteredOrders.length} Orders</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 font-medium bg-slate-100 w-fit px-2 py-0.5 rounded text-slate-600">
              Click for Status Breakdown
            </p>
          </div>
          <div className="absolute top-4 right-4 text-slate-100 group-hover:text-slate-500 transition-colors">
            <BarChart size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
            <ShoppingBag className="mr-2 text-indigo-500" size={20} /> Sales Performance
          </h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="sales" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-center">
            <Receipt className="mr-2 text-indigo-500" size={20} /> Dress Type Distribution
          </h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dressTypeData} cx="50%" cy="50%" innerRadius={80} outerRadius={105} fill="#8884d8" paddingAngle={5} dataKey="value">
                  {dressTypeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-6">
            {dressTypeData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                <span className="text-sm font-medium text-gray-500">{d.name} <span className="text-gray-900 font-bold ml-1">{d.value}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center pt-8 border-t border-gray-100">
        <p className="text-xs text-gray-400">Developed by ARM.Aswin — 0778514532</p>
      </div>

      {activeModal === 'net' && (
        <DetailModal title="Received Cash Details (Cash Flow)" onClose={() => { setActiveModal(null); setFromDate(''); setToDate(''); setModalSearch(''); }}>
          <div className="mb-6 flex flex-wrap gap-4 bg-gray-50 p-4 rounded-xl items-center border border-gray-100">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by Customer or Order ID..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter size={18} className="text-indigo-600" />
              <div className="flex items-center gap-2">
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
                <span className="text-gray-400 font-bold">—</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold border-b">
                <tr>
                  <th className="px-6 py-4">Payment Date</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Order Reference</th>
                  <th className="px-6 py-4 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredNetCashModal.map((p, i) => (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 text-gray-600 font-medium text-sm">{p.date}</td>
                    <td className="px-6 py-4 font-bold text-gray-800">{p.customer}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{formatOrderId(p.orderId)}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">Rs. {p.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {filteredNetCashModal.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 font-medium italic">No payment records found matching filters</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right font-bold text-gray-500 text-sm">Total for Selection</td>
                  <td className="px-6 py-4 text-right font-bold text-indigo-600 text-xl">Rs. {modalTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DetailModal>
      )}

      {activeModal === 'outstanding' && (
        <DetailModal title="Unpaid Balances (For Orders in this Period)" onClose={() => { setActiveModal(null); setFromDate(''); setToDate(''); setModalSearch(''); }}>
          <div className="mb-6 flex flex-wrap gap-4 bg-gray-50 p-4 rounded-xl items-center border border-gray-100">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search who owes money..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <History size={18} className="text-orange-600" />
              <div className="flex items-center gap-2">
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
                <span className="text-gray-400 font-bold">—</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold border-b">
                <tr>
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4 text-right">Total Order</th>
                  <th className="px-6 py-4 text-right">Discount</th>
                  <th className="px-6 py-4 text-right">Already Paid</th>
                  <th className="px-6 py-4 text-right">Remaining Balance</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOutstandingModal.map((o, i) => (
                  <tr key={i} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-800">{o.customer}</p>
                      {o.phone && (
                        <p className="text-xs text-indigo-500 font-medium mt-0.5 flex items-center">
                          <Phone size={10} className="mr-1" />
                          {o.phone}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{o.date}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{formatOrderId(o.orderId)}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600 font-medium text-sm">Rs. {o.total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-red-500 font-medium text-sm">
                      {o.discount > 0 ? `- Rs. ${o.discount.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-bold text-sm">Rs. {o.paid.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-orange-600 text-lg">Rs. {o.balance.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          setActiveModal(null);
                          setFromDate('');
                          setToDate('');
                          setModalSearch('');
                          navigate('Edit Order', o.orderId);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold text-xs rounded-md transition-colors"
                        title="Edit order and manage payments"
                      >
                        <Edit size={14} />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredOutstandingModal.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 font-medium italic">No outstanding balances found for selection</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-right font-bold text-gray-500 text-sm">Total Outstanding in this view</td>
                  <td className="px-6 py-4 text-right font-bold text-orange-600 text-xl">Rs. {modalTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DetailModal>
      )}

      {activeModal === 'discount' && (
        <DetailModal title="Discounts Given (Detail View)" onClose={() => { setActiveModal(null); setFromDate(''); setToDate(''); setModalSearch(''); }}>
          <div className="mb-6 flex flex-wrap gap-4 bg-gray-50 p-4 rounded-xl items-center border border-gray-100">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by name, phone or order..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <Tag size={18} className="text-purple-600" />
              <div className="flex items-center gap-2">
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
                <span className="text-gray-400 font-bold">—</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-gray-300 bg-white rounded-lg py-1.5 px-3 text-sm text-gray-600" />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold border-b">
                <tr>
                  <th className="px-6 py-4">Customer Name</th>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4 text-right">Order Value</th>
                  <th className="px-6 py-4 text-right">Discount Given</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDiscountModal.map((d, i) => (
                  <tr key={i} className={`transition-colors ${d.isFullDiscount ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-purple-50/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <p className="font-bold text-gray-800 mr-2">{d.customer}</p>
                        {d.isFullDiscount && (
                          <span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            100% OFF
                          </span>
                        )}
                      </div>
                      {d.phone && (
                        <p className="text-xs text-indigo-500 font-medium mt-0.5 flex items-center">
                          <Phone size={10} className="mr-1" />
                          {d.phone}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{d.date}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{formatOrderId(d.orderId)}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-600 font-medium text-sm">Rs. {d.originalTotal.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-purple-600 text-lg">- Rs. {d.discount.toLocaleString()}</td>
                  </tr>
                ))}
                {filteredDiscountModal.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 font-medium italic">No discounts found for selection</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right font-bold text-gray-500 text-sm">Total Discounts in this view</td>
                  <td className="px-6 py-4 text-right font-bold text-purple-600 text-xl">Rs. {modalTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DetailModal>
      )}

      {activeModal === 'pending_delivery' && (
        <DetailModal title="Pending Deliveries (> 14 Days Since Ready)" onClose={() => { setActiveModal(null); setModalSearch(''); }}>
          <div className="mb-6 flex flex-wrap gap-4 bg-gray-50 p-4 rounded-xl items-center border border-gray-100">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by customer or phone..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
            <div className="bg-rose-50 px-4 py-2 rounded-lg border border-rose-100">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Alert: Not picked up for 14+ days</span>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold border-b">
                <tr>
                  <th className="px-6 py-4">Customer Details</th>
                  <th className="px-6 py-4">Order ID</th>
                  <th className="px-6 py-4">Order Date</th>
                  <th className="px-6 py-4">Due Date</th>
                  <th className="px-6 py-4 text-right">Total Amount</th>
                  <th className="px-6 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingDeliveryList
                  .filter(o => o.customer.toLowerCase().includes(modalSearch.toLowerCase()) || o.phone.includes(modalSearch))
                  .map((o, i) => (
                    <tr key={i} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-gray-800">{o.customer}</p>
                        <p className="text-xs text-indigo-500 font-medium mt-0.5 flex items-center">
                          <Phone size={10} className="mr-1" />
                          {o.phone}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{formatOrderId(o.orderId)}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm">{o.date}</td>
                      <td className="px-6 py-4 text-rose-500 font-bold text-sm italic">{o.dueDate}</td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">Rs. {o.amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            setActiveModal(null);
                            navigate('Invoice', o.orderId);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold text-xs rounded-md transition-colors"
                        >
                          <Eye size={14} />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                {pendingDeliveryList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 font-medium italic">No pending deliveries found</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-right font-bold text-gray-500 text-sm">Total Uncollected Value</td>
                  <td className="px-6 py-4 text-right font-bold text-rose-600 text-xl">Rs. {modalTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DetailModal>
      )}
      {activeModal === 'order_summary' && (
        <DetailModal title="Order Status Summary (By Dress Type)" onClose={() => setActiveModal(null)}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(orderSummaryData).map(([status, data]) => {
              const d = data as { total: number; totalAmount: number; ordersCount: number; types: Record<string, number> };
              const isDueAmountSame = status === 'Due' && d.totalAmount === totalOutstanding;
              return (
              <div key={status} className={`p-6 rounded-xl border ${d.total > 0 ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-slate-800 uppercase tracking-wider">{status}</h3>
                  <div className="flex flex-col items-end">
                    <span className={`px-3 py-1 rounded-full text-sm font-black ${
                      status === 'Pending' ? 'bg-orange-100 text-orange-600' :
                      status === 'In Progress' ? 'bg-blue-100 text-blue-600' :
                      status === 'Completed' ? 'bg-emerald-100 text-emerald-600' :
                      status === 'Packed' ? 'bg-purple-100 text-purple-600' :
                      status === 'Due' ? 'bg-rose-100 text-rose-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {d.total} Pieces ({d.ordersCount} Orders)
                    </span>
                    {d.total > 0 && (status !== 'Due' || isDueAmountSame) && <span className="text-[10px] font-bold text-slate-400 mt-1">Rs. {d.totalAmount.toLocaleString()}</span>}
                  </div>
                </div>
                
                {d.total > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(d.types).map(([type, count]) => (
                      <div key={type} className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 font-medium">{type}</span>
                        <div className="flex items-center">
                          <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{count}</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                        {(status !== 'Due' || isDueAmountSame) && (
                           <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{status === 'Due' ? 'Due Amount' : 'Total Value'}</span>
                              <span className="text-md font-black text-emerald-600">Rs. {d.totalAmount.toLocaleString()}</span>
                           </div>
                        )}
                        <div className="flex justify-between items-center border-t border-dotted border-slate-100 pt-1">
                           <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Pieces</span>
                           <span className="text-lg font-black text-slate-800">{d.total} Pieces ({d.ordersCount} Orders)</span>
                        </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-4">No dresses in this status</p>
                )}
              </div>
            );})}
          </div>
        </DetailModal>
      )}
    </div>
  );
};

export default Reports;
