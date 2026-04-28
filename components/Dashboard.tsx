import React, { useContext, useState, useMemo } from 'react';
import { Page, Order } from '../types';
import { AppContext } from '../context/AppContext';
import { Users, ShoppingCart, Package, BarChart2, ArrowUpRight, Coins, Receipt, X, Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';

interface DashboardProps {
  navigate: (page: Page, orderId?: string) => void;
}

const DetailModal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in duration-200">
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

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  onClick?: () => void
}> = ({ title, value, icon: Icon, color, onClick }) => {
  return (
    <div
      className="p-6 bg-white rounded-xl shadow-sm flex items-center justify-between transition-all hover:shadow-md cursor-pointer border border-gray-100 group"
      onClick={onClick}
    >
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
      </div>
      <div className={`p-4 rounded-full ${color} text-white shadow-lg shadow-current/20 transition-transform group-hover:scale-110`}>
        <Icon size={24} />
      </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ navigate }) => {
  const context = useContext(AppContext);
  const [activeModal, setActiveModal] = useState<'today' | null>(null);
  const [modalView, setModalView] = useState<'incomes' | 'expenses'>('incomes');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const formatOrderId = (id: string) => {
    if (id.startsWith('ORD') && !id.includes('-')) {
      return `ORD-${id.substring(3)}`;
    }
    return id;
  };

  if (!context) return <div>Loading...</div>;
  const { customers, orders, inventory, materialSales, expenses, employees, settings, currentBranch, isAllBranchesScope, getBranchName } = context;
  const branchScopeLabel = isAllBranchesScope ? 'All Branches' : currentBranch?.name || 'Branch Overview';

  const todayStr = new Date().toISOString().split('T')[0];
  const normalizePaymentMethod = (method?: string) => {
    if (method === 'Bank Transfer') return 'Bank';
    return method || 'Cash';
  };

  const todaysPayments = useMemo(() => {
    const list: { customer: string; orderId: string; amount: number; type: string; method: string }[] = [];

    // Process Orders
    orders.forEach(order => {
      const cust = customers.find(c => c.id === order.customerId)?.name || 'Unknown';
      if (order.payments && order.payments.length > 0) {
        order.payments.forEach(p => {
          if (p.date === todayStr) {
            list.push({
              customer: cust,
              orderId: order.id,
              amount: p.amount,
              type: 'Order Payment',
              method: p.method || 'Cash'
            });
          }
        });
      } else if (order.orderDate === todayStr && order.advance > 0) {
        list.push({
          customer: cust,
          orderId: order.id,
          amount: order.advance,
          type: 'Advance',
          method: 'Cash'
        });
      }
    });

    // Process Material Sales
    materialSales.forEach(sale => {
      if (sale.date === todayStr) {
        list.push({
          customer: sale.customerName || 'Walk-in Customer',
          orderId: sale.id,
          amount: sale.paidAmount !== undefined ? sale.paidAmount : sale.totalAmount,
          type: 'Material Sale',
          method: sale.paymentMethod || 'Cash'
        });
      }
    });

    return list;
  }, [orders, customers, todayStr, materialSales]);

  const todaysNetCash = todaysPayments.reduce((sum, p) => sum + p.amount, 0);
  const pendingOrdersCount = orders.filter(o => o.status === 'Pending' || o.status === 'In Progress').length;
  const todaysPaymentBreakdown = useMemo(() => {
    return todaysPayments.reduce<Record<string, number>>((totals, payment) => {
      const method = normalizePaymentMethod(payment.method);
      totals[method] = (totals[method] || 0) + payment.amount;
      return totals;
    }, {});
  }, [todaysPayments]);

  // Today's expenses and salaries
  const todaysExpenses = useMemo(() => {
    return expenses.filter(e => e.date === todayStr);
  }, [expenses, todayStr]);

  const todaysSalaries = useMemo(() => {
    return employees.flatMap(emp =>
      (emp.salaryPayments || [])
        .filter(payment => payment.date === todayStr)
        .map(payment => ({ ...payment, employeeName: emp.name }))
    );
  }, [employees, todayStr]);

  const totalExpensesToday = todaysExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSalariesToday = todaysSalaries.reduce((sum, s) => sum + s.amount, 0);
  const netCashInHand = todaysNetCash - totalExpensesToday - totalSalariesToday;
  const handOnCash = netCashInHand - (todaysPaymentBreakdown.Card || 0);

  // Today's orders
  const todaysOrders = useMemo(() => {
    return orders.filter(o => o.orderDate === todayStr);
  }, [orders, todayStr]);

  // Outstanding for today's orders
  const todaysOutstanding = useMemo(() => {
    return todaysOrders.reduce((sum, order) => {
      const total = order.items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
      const discount = Number(order.discount) || 0;
      const final = Math.max(0, total - discount);
      const paid = (order.payments || []).reduce((s, p) => s + p.amount, 0) || (order.advance || 0);
      return sum + Math.max(0, final - paid);
    }, 0);
  }, [todaysOrders]);

  const handleDownloadDailyReport = async () => {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);

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
      pdf.text(settings?.shopName || 'VIP Tailors', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Daily Accounting Report - ${branchScopeLabel}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Date: ${new Date(todayStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin, yPos);
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

      // Payment method breakdown
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Collections:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Rs. ${todaysNetCash.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.text('Payment Method Breakdown:', margin + 10, yPos);
      yPos += 5;

      Object.entries(todaysPaymentBreakdown).forEach(([method, amount]) => {
        checkNewPage(5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${method}:`, margin + 15, yPos);
        pdf.text(`Rs. ${amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 4;
      });
      yPos += 6;

      // Payment Details Table
      if (todaysPayments.length > 0) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(9);
        pdf.text('Payment Details:', margin + 10, yPos);
        yPos += 5;

        todaysPayments.forEach(payment => {
          checkNewPage(8);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.text(`${payment.customer}`, margin + 15, yPos);
          yPos += 3;
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Order: ${payment.orderId} | ${payment.method}`, margin + 20, yPos);
          pdf.text(`Rs. ${payment.amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 5;
        });
      }
      yPos += 5;

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
      pdf.text(`Rs. ${totalExpensesToday.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      if (todaysExpenses.length > 0) {
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Expense Details:', margin + 10, yPos);
        yPos += 5;

        todaysExpenses.forEach(exp => {
          checkNewPage(5);
          pdf.setFont('helvetica', 'normal');
          const expText = `${exp.description.substring(0, 50)}${exp.description.length > 50 ? '...' : ''}`;
          pdf.text(expText, margin + 15, yPos);
          pdf.text(`Rs. ${exp.amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
        });
      } else {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        pdf.text('No expenses recorded today', margin + 15, yPos);
        yPos += 4;
      }
      yPos += 5;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Salaries Paid:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(75, 0, 130);
      pdf.text(`Rs. ${totalSalariesToday.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      if (todaysSalaries.length > 0) {
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Salary Details:', margin + 10, yPos);
        yPos += 5;

        todaysSalaries.forEach(salary => {
          checkNewPage(5);
          pdf.setFont('helvetica', 'normal');
          pdf.text(salary.employeeName, margin + 15, yPos);
          pdf.text(`Rs. ${salary.amount.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
        });
      } else {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        pdf.text('No salaries paid today', margin + 15, yPos);
        yPos += 4;
      }
      yPos += 8;

      // Section 3: Orders Summary
      checkNewPage(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 144, 255);
      pdf.text('3. ORDERS TAKEN TODAY', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Total Orders:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${todaysOrders.length} orders`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      const todaysStatusCounts = {
        'Pending': todaysOrders.filter(o => o.status === 'Pending').length,
        'In Progress': todaysOrders.filter(o => o.status === 'In Progress').length,
        'Completed': todaysOrders.filter(o => o.status === 'Completed').length,
        'Packed': todaysOrders.filter(o => o.status === 'Packed').length,
        'Delivered': todaysOrders.filter(o => o.status === 'Delivered').length,
      };

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'italic');
      pdf.text('Status Breakdown:', margin + 10, yPos);
      yPos += 5;

      Object.entries(todaysStatusCounts).forEach(([status, count]) => {
        if (count > 0) {
          checkNewPage(5);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${status}:`, margin + 15, yPos);
          pdf.text(`${count} orders`, pageWidth - margin, yPos, { align: 'right' });
          yPos += 4;
        }
      });
      yPos += 8;

      // Section 4: Cash Summary
      checkNewPage(40);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 128, 128);
      pdf.text('4. CASH SUMMARY', margin, yPos);
      yPos += 7;

      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');

      pdf.text(`Collections:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(34, 139, 34);
      pdf.text(`Rs. ${todaysNetCash.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Less: Expenses:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(220, 20, 60);
      pdf.text(`Rs. ${totalExpensesToday.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Less: Salaries:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(75, 0, 130);
      pdf.text(`Rs. ${totalSalariesToday.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      pdf.setDrawColor(0, 0, 0);
      pdf.line(margin + 5, yPos, pageWidth - margin, yPos);
      yPos += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(`Net Cash in Hand:`, margin + 5, yPos);
      pdf.setTextColor(netCashInHand >= 0 ? 34 : 220, netCashInHand >= 0 ? 139 : 20, netCashInHand >= 0 ? 34 : 60);
      pdf.text(`Rs. ${netCashInHand.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Hand on cash:`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(handOnCash >= 0 ? 34 : 220, handOnCash >= 0 ? 139 : 20, handOnCash >= 0 ? 34 : 60);
      pdf.text(`Rs. ${handOnCash.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Outstanding Balance (Today's Orders):`, margin + 5, yPos);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 140, 0);
      pdf.text(`Rs. ${todaysOutstanding.toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
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

      const fileName = `Daily_Report_${todayStr}.pdf`;
      const pdfOutput = pdf.output('datauristring');

      downloadDataUri(fileName, pdfOutput);
      alert('Daily report downloaded successfully.');
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const salesData = useMemo(() => {
    const monthsData = orders.reduce((acc, order) => {
      const month = new Date(order.orderDate).toLocaleString('default', { month: 'short' });
      const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
      const finalAmount = Math.max(0, itemsTotal - (order.discount || 0));
      acc[month] = (acc[month] || 0) + finalAmount;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(monthsData).map(([name, sales]) => ({ name, sales })).slice(-6);
  }, [orders]);

  const recentOrders = useMemo(() =>
    [...orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()).slice(0, 5),
    [orders]
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{branchScopeLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <p className="text-sm font-medium text-slate-500">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <button
            onClick={handleDownloadDailyReport}
            disabled={isGeneratingReport}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-lg shadow-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isGeneratingReport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
            {isGeneratingReport ? "Generating..." : "Download Today's Report"}
          </button>
        </div>
      </div>

      <AdminFilterBar />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Customers" value={customers.length} icon={Users} color="bg-blue-600" onClick={() => navigate('Customers')} />
        <StatCard title="Today's Net Cash" value={`Rs. ${todaysNetCash.toLocaleString()}`} icon={Coins} color="bg-emerald-600" onClick={() => setActiveModal('today')} />
        <StatCard title="Pending Orders" value={pendingOrdersCount} icon={ShoppingCart} color="bg-yellow-500" onClick={() => navigate('Orders')} />
        <StatCard title="Inventory Items" value={inventory.length} icon={Package} color="bg-indigo-600" onClick={() => navigate('Inventory')} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 p-6 bg-white rounded-xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
            Monthly Sales
          </h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
            Recent Orders
          </h2>
          <div className="space-y-4">
            {recentOrders.map(order => {
              const itemsTotal = order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0);
              const finalAmount = Math.max(0, itemsTotal - (order.discount || 0));
              return (
                <div key={order.id} className="flex items-center justify-between group p-3 hover:bg-slate-50 rounded-lg transition-all border border-transparent hover:border-slate-100">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{customers.find(c => c.id === order.customerId)?.name || 'Unknown'}</p>
                    {isAllBranchesScope && (
                      <p className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {getBranchName(order.branchId)}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-slate-600 mt-1">{formatOrderId(order.id)} • Rs. {finalAmount.toLocaleString()}</p>
                  </div>
                  <button onClick={() => navigate('Invoice', order.id)} className="p-2 bg-white text-slate-400 rounded-lg hover:text-indigo-600 hover:shadow-sm transition-all border border-gray-100">
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {activeModal === 'today' && (
        <DetailModal title={modalView === 'incomes' ? "Today's Received Payments" : "Today's Expenses & Salaries"} onClose={() => setActiveModal(null)}>
          {/* Toggle View */}
          <div className="flex justify-center mb-8">
            <div className="bg-slate-100 p-1 rounded-xl flex">
              <button
                onClick={() => setModalView('incomes')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${modalView === 'incomes'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Incomes
              </button>
              <button
                onClick={() => setModalView('expenses')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${modalView === 'expenses'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                Expenses
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Total Sales Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl border border-emerald-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Total Sales</p>
                <Coins className="text-emerald-600" size={20} />
              </div>
              <p className="text-3xl font-bold text-emerald-900">Rs. {todaysNetCash.toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-2 font-medium">Collections Today</p>
            </div>

            {/* Total Expenses Card */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-red-700 uppercase tracking-wide">Total Expenses</p>
                <ArrowUpRight className="text-red-600" size={20} />
              </div>
              <p className="text-3xl font-bold text-red-900">Rs. {(totalExpensesToday + totalSalariesToday).toLocaleString()}</p>
              <p className="text-xs text-red-600 mt-2 font-medium">Expenses + Salaries</p>
            </div>

            {/* Taken Orders Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Taken Order Count</p>
                <ShoppingCart className="text-blue-600" size={20} />
              </div>
              <p className="text-3xl font-bold text-blue-900">{todaysOrders.length}</p>
              <p className="text-xs text-blue-600 mt-2 font-medium">Orders Taken Today</p>
            </div>
          </div>

          {/* Incomes View */}
          {modalView === 'incomes' && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b">
                  <tr>
                    <th className="px-6 py-4">Customer Name</th>
                    <th className="px-6 py-4">Order ID</th>
                    <th className="px-6 py-4">Payment Method</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaysPayments.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">{p.customer}</td>
                      <td className="px-6 py-4 text-slate-500 text-sm">{formatOrderId(p.orderId)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${p.method === 'Cash' ? 'bg-emerald-100 text-emerald-700' :
                          p.method === 'Card' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>{p.method}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-800">Rs. {p.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {todaysPayments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No payments recorded today</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t">
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-right font-bold text-slate-600">Total Collected Today</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600 text-xl">Rs. {todaysNetCash.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Expenses View */}
          {modalView === 'expenses' && (
            <div className="space-y-6">
              {/* General Expenses */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b">
                    <tr>
                      <th className="px-6 py-4">Expense Description</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todaysExpenses.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800">{e.description}</td>
                        <td className="px-6 py-4 text-right font-bold text-red-600">Rs. {e.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    {todaysExpenses.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-6 py-4 text-center text-slate-400 italic">No general expenses today</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Salaries Paid */}
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mt-6">Employee Salaries Paid</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider border-b">
                    <tr>
                      <th className="px-6 py-4">Employee Name</th>
                      <th className="px-6 py-4">Payment Time</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {todaysSalaries.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800">{s.employeeName}</td>
                        <td className="px-6 py-4 text-slate-500 text-sm">{s.timestamp || 'Today'}</td>
                        <td className="px-6 py-4 text-right font-bold text-purple-600">Rs. {s.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    {todaysSalaries.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-slate-400 italic">No salaries paid today</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex justify-between items-center mt-6">
                <span className="font-bold text-red-800">Total Expenses for Today</span>
                <span className="text-2xl font-black text-red-600">Rs. {(totalExpensesToday + totalSalariesToday).toLocaleString()}</span>
              </div>
            </div>
          )}

        </DetailModal>
      )}
    </div>
  );
};

export default Dashboard;
