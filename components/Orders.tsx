
import React, { useEffect, useState, useContext, useMemo, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { Order, Page, OrderItem, Measurement } from '../types';
import { PlusCircle, Search, Eye, Edit, Trash2, Scissors, X, Printer, CheckSquare, Download, Loader2, StickyNote, Filter, Phone, Package, PhoneCall, Copy, Check, BellRing } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import DressQuantityTracker from './DressQuantityTracker';
import { fetchProductionNotifications, fetchCloudOrderSearch } from '../utils/cloudApi';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';
import { calculateOrderTotals } from '../utils/orderUtils';

interface OrdersProps {
  navigate: (page: Page, orderId?: string) => void;
}

const formatOrderId = (id: string) => {
  if (id.startsWith('ORD') && !id.includes('-')) {
    return `ORD-${id.substring(3)}`;
  }
  return id;
};

const BRANCH_PIECE_LABEL = 'Branch Piece Count';
const PRODUCTION_NOTIFICATION_REFRESH_MS = 20000;

const CopyButton: React.FC<{ text: string }> = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`ml-2 p-1.5 rounded-lg transition-all active:scale-95 ${copied ? 'bg-emerald-100 text-emerald-600 shadow-sm' : 'hover:bg-slate-100 text-slate-400'}`}
      title="Copy Order ID"
    >
      {copied ? <Check size={14} className="animate-in zoom-in duration-200" /> : <Copy size={14} />}
    </button>
  );
};


const MeasurementModal: React.FC<{ order: Order; customerName: string; onClose: () => void; onToggleCut: (itemId: string) => void; onUpdateStatus: (status: Order['status']) => void }> = ({
  order,
  customerName,
  onClose,
  onToggleCut,
  onUpdateStatus
}: {
  order: Order;
  customerName: string;
  onClose: () => void;
  onToggleCut: (itemId: string) => void;
  onUpdateStatus: (status: Order['status']) => void;
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [printingItemId, setPrintingItemId] = useState<string | null>(null);

  const handlePrintItem = (itemId: string) => {
    setPrintingItemId(itemId);
    setTimeout(() => {
      window.print();
      setPrintingItemId(null);
    }, 100);
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('cutting-sheet-container');
    if (!element || isGenerating) return;

    setIsGenerating(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

      const safeName = customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `Full_CutSheet_${safeName}_${order.id}.pdf`;
      const pdfOutput = pdf.output('datauristring');

      downloadDataUri(filename, pdfOutput);
      alert(`Downloaded ${filename} successfully.`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Error saving PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 print:p-0 print:bg-white print:block">
      <div className="w-full max-w-[98vw] bg-white rounded-[2rem] shadow-2xl overflow-hidden h-[96vh] flex flex-col border border-slate-800 print:hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-blue-600 px-8 py-6 flex items-center justify-between shrink-0 border-b border-blue-700">
          <div className="flex items-center">
            <div className="bg-white/20 p-3 rounded-xl mr-5 backdrop-blur-sm border border-white/10">
              <Scissors className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Cutting Center</h2>
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.2em] mt-1">{customerName} • {formatOrderId(order.id)}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="bg-[#10b981] text-white hover:bg-[#059669] px-6 py-2.5 rounded-xl font-bold text-xs flex items-center transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />} Save Full PDF
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full">
              <X size={28} />
            </button>
          </div>
        </div>

        <div id="cutting-sheet-container" className="p-8 overflow-y-auto flex-1 bg-[#f9fafb] space-y-8">
          {order.items.map((item: OrderItem, index: number) => (
            <div key={item.id} className={`bg-white border-2 rounded-[1.5rem] shadow-sm overflow-hidden transition-all duration-300 ${item.isCut ? 'border-emerald-500 ring-4 ring-emerald-500/5' : 'border-slate-100'}`}>
              <div className="bg-[#fcfdfe] border-b border-slate-100 px-8 py-5 flex items-center justify-between">
                <div className="flex items-center">
                  <span className="bg-[#111827] text-white rounded-lg w-9 h-9 flex items-center justify-center mr-4 font-black text-sm shadow-md">{index + 1}</span>
                  <h3 className="font-black text-[#111827] uppercase tracking-tight text-xl">{item.dressType}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggleCut(item.id)}
                    className={`flex items-center px-5 py-2 rounded-xl font-bold uppercase text-[11px] transition-all ${item.isCut
                      ? 'bg-[#d1fae5] text-[#065f46] border border-emerald-200'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                  >
                    {item.isCut ? <><CheckSquare size={16} className="mr-2" /> Done</> : <><Scissors size={16} className="mr-2" /> Mark Cut</>}
                  </button>
                  <button
                    onClick={() => handlePrintItem(item.id)}
                    className="flex items-center px-6 py-2.5 bg-[#111827] text-white rounded-xl font-bold uppercase text-[11px] hover:bg-black transition-all shadow-md active:scale-95"
                  >
                    <Printer size={16} className="mr-2" /> Print Item
                  </button>
                </div>
              </div>
              <div className="p-10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {item.measurements.map((meas: Measurement, i: number) => (
                    <div key={i} className="bg-[#fcfdfe] border-2 border-slate-50 rounded-[1.2rem] py-10 px-4 text-center shadow-sm hover:border-indigo-100 transition-colors group">
                      <p className="font-black text-[#111827] text-6xl tracking-tighter group-hover:scale-110 transition-transform duration-300">{meas.value || '-'}</p>
                    </div>
                  ))}
                </div>
                {item.note && (
                  <div className="mt-8 p-5 bg-amber-50 border border-amber-100 rounded-2xl text-sm italic text-amber-900 flex items-start">
                    <StickyNote size={18} className="mr-3 shrink-0 text-amber-500" />
                    <span>{item.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white px-8 py-5 border-t border-slate-100 flex justify-between items-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">VIP Tailors Cutting Management System</div>
          <button
            onClick={() => {
              onUpdateStatus('In Progress');
              onClose();
            }}
            disabled={order.status === 'In Progress'}
            className={`flex items-center px-6 py-2.5 rounded-xl font-bold uppercase text-xs transition-all shadow-md active:scale-95 ${order.status === 'In Progress'
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
              }`}
          >
            <Package size={16} className="mr-2" /> Mark Full Order as In-Progress
          </button>
        </div>
      </div>

      <div id="print-template" className="hidden print:block">
        <style>{`
            @media print {
              @page { margin: 0; size: 80mm auto; }
              body * { visibility: hidden; }
              #print-template, #print-template * { visibility: visible; }
              #print-template {
                position: absolute;
                left: 0;
                top: 0;
                width: 72mm !important; /* Adjusted for printer margins: 72mm is safer for 80mm paper */
                padding: 2mm !important;
                margin: 0 !important;
                background: white;
                color: black;
                font-family: 'Arial', sans-serif;
                box-sizing: border-box !important;
              }
              .item-card { page-break-after: always; display: none; }
              ${printingItemId ? `.card-${printingItemId.replace(/\./g, '\\.')} { display: block !important; }` : '.item-card { display: block !important; }'}
              .sheet-divider { border-top: 1px solid black; margin: 3mm 0; }
              .meas-display { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 700; font-size: 20px; line-height: 1.4; }
              .notes-box { width: 70mm; height: 25mm; border: 1px solid #999; margin: 2mm 0; padding: 2mm; font-size: 12px; overflow: hidden; }
              .bold { font-weight: bold; }
              .text-sm { font-size: 12px; }
              .text-lg { font-size: 22px; }
              .center { text-align: center; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .quality-badge { background: #f0f0f0; padding: 1mm 2mm; margin: 1mm 0; border-left: 3px solid #000; }
            }
          `}</style>
        {order.items.map((item, idx) => (
          <div key={item.id} className={`item-card card-${item.id}`} style={{ marginTop: 0, paddingTop: 0 }}>
            <div className="center" style={{ margin: 0, padding: 0 }}>
              <h1 className="bold uppercase" style={{ fontSize: '15px', margin: 0, padding: 0 }}>CUT SHEET</h1>
            </div>
            <div className="sheet-divider"></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1mm' }}>
              <span className="bold" style={{ fontSize: '24px' }}>{formatOrderId(order.id)}</span>
              {item.quality && <span className="bold" style={{ fontSize: '16px' }}>{item.quality}</span>}
            </div>
            <div className="text-sm">
              <div className="flex justify-between mt-1">
                <span><span className="bold">Name:</span> {customerName}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span><span className="bold">Type:</span> {item.dressType}</span>
                <span><span className="bold">Qty:</span> <span className="bold">{item.quantity}</span></span>
              </div>
              <div className="mt-1">
                <span className="bold uppercase">Due:</span> {order.dueDate}
              </div>
            </div>
            <div className="sheet-divider"></div>
            <div className="meas-display" style={{ marginBottom: '2mm', paddingLeft: '2mm' }}>
              ({item.measurements.map(m => m.value || '--').join(', ')})
            </div>
            <div className="notes-box bold" style={{ width: '70mm', height: '25mm', border: '1px solid #999', margin: '2mm 0', padding: '2mm', fontSize: '12px', overflow: 'hidden' }}>{item.note || ''}</div>
            <div className="sheet-divider"></div>

          </div>
        ))}
      </div>
    </div>
  );
};

const formatDateSafe = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString();
};

const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) return `${match[1]} ${match[2]} ${match[3]}`;
    return phone;
  };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeSearchText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');


const getStatusChip = (status: Order['status']) => {
    const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
    switch (status) {
      case 'Pending': return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'Hold': return `${baseClasses} bg-amber-100 text-amber-800`;
      case 'In Progress': return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'Completed': return `${baseClasses} bg-green-100 text-green-800`;
      case 'Packed': return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'Due': return `${baseClasses} bg-red-100 text-red-800`;
      case 'Delivered': return `${baseClasses} bg-gray-100 text-gray-800`;
      default: return `${baseClasses} bg-gray-200`;
    }
  };



interface CompletedModalProps {
  onClose: () => void;
  fromDate: string;
  toDate: string;
  navigate: (page: Page, orderId?: string) => void;
}
const CompletedModal: React.FC<CompletedModalProps> = ({ onClose, fromDate, toDate, navigate }) => {
  const context = useContext(AppContext);
  const [isPrintingCallList, setIsPrintingCallList] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  if (!context) return null;
  const { orders, setOrders, customers, currentUser, activeBranchId } = context;
    const completedOrders = orders.filter(o => {
      const isCallListEligible = o.status === 'Packed' && (!fromDate || o.orderDate >= fromDate) && (!toDate || o.orderDate <= toDate);
      if (!isCallListEligible) return false;
      if (!modalSearch) return true;
      const cust = customers.find(cu => cu.id === o.customerId);
      const searchLower = modalSearch.toLowerCase();
      return o.id.toLowerCase().includes(searchLower) || (cust?.name || '').toLowerCase().includes(searchLower) || (cust?.phone || '').toLowerCase().includes(searchLower);
    });

    const handleActionCalled = (orderId: string, clear: boolean = false) => {
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        if (clear) return { ...o, isCalled: false, calledTimestamp: undefined, callHistory: [] };
        const now = new Date().toISOString();
        return {
          ...o,
          isCalled: true,
          calledTimestamp: now,
          callHistory: [...(o.callHistory || []), now]
        };
      }));
    };

  const computeFinal = (o: Order) => {
    const totals = calculateOrderTotals(o);
    return { final: totals.finalAmount, paid: totals.paid, balance: totals.balance };
  };

  const handleMarkDelivered = async (orderId: string) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;
    const c = computeFinal(orderToUpdate);
    let updatedOrder = { ...orderToUpdate, status: 'Delivered' as const };
    if (c.balance > 0) {
      updatedOrder.payments = [...(orderToUpdate.payments || []), {
        id: `PAY-${Date.now()}`,
        branchId: orderToUpdate.branchId || activeBranchId,
        collectorId: currentUser?.id || 'SYSTEM',
        amount: c.balance,
        date: new Date().toISOString().split('T')[0],
        note: 'Delivery Pmnt'
      }];
    }
    try {
      if (context.saveOrder) {
        await context.saveOrder(updatedOrder);
      } else {
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      }
      navigate('Invoice', orderId);
    } catch (e) {
      console.error('Failed to mark delivered', e);
      alert('Failed to mark order as delivered.');
    }
  };

  const handleLocalMarkAsDue = async (orderId: string) => {
    if (window.confirm('Mark this order as Due? It will move to the Due Orders list.')) {
      const orderToUpdate = orders.find(o => o.id === orderId);
      if (!orderToUpdate) return;
      const updatedOrder = { ...orderToUpdate, status: 'Due' as const };
      try {
        if (context.saveOrder) {
          await context.saveOrder(updatedOrder);
        } else {
          setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        }
      } catch (e) {
        console.error('Failed to mark due', e);
        alert('Failed to mark order as due.');
      }
    }
  };

  const handlePrint = () => {
    setIsPrintingCallList(true);
    setTimeout(() => {
      window.print();
      setIsPrintingCallList(false);
    }, 300);
  };

  const handleDownloadPDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 12;
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
      pdf.text('CALLING LIST REPORT', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(107, 114, 128); // gray-500
      pdf.text(`Status: Completed & Packed`, margin, yPos);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 10;

      // Table Header
      pdf.setFillColor(31, 41, 55); // slate-800
      pdf.rect(margin, yPos, pageWidth - (margin * 2), 11, 'F');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);

      pdf.text('Customer Name', margin + 3, yPos + 7);
      pdf.text('Phone', margin + 55, yPos + 7);
      pdf.text('ID', margin + 90, yPos + 7);
      pdf.text('Total', margin + 120, yPos + 7);
      pdf.text('Balance', margin + 145, yPos + 7);
      pdf.text('Status', pageWidth - margin - 3, yPos + 7, { align: 'right' });
      yPos += 11;

      // Table Body
      let sumTotal = 0;
      let sumBalance = 0;

      completedOrders.forEach((o, idx) => {
        checkNewPage(10);
        const cust = customers.find(cu => cu.id === o.customerId);
        const c = computeFinal(o);
        sumTotal += c.final;
        sumBalance += c.balance;

        // Zebra striping
        if (idx % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPos, pageWidth - (margin * 2), 9.5, 'F');
        }

        pdf.setFontSize(9);
        pdf.setTextColor(31, 41, 55);

        // Name (truncate if too long)
        pdf.setFont('helvetica', 'bold');
        const name = cust?.name || 'Unknown';
        pdf.text(name.length > 25 ? name.substring(0, 22) + '...' : name, margin + 3, yPos + 6);

        pdf.setFont('helvetica', 'normal');
        pdf.text(formatPhoneNumber(cust?.phone || ''), margin + 55, yPos + 6);

        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(o.id, margin + 90, yPos + 6);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text(c.final.toLocaleString(), margin + 120, yPos + 6);

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(234, 88, 12); // orange-600
        pdf.text(c.balance.toLocaleString(), margin + 145, yPos + 6);

        pdf.setTextColor(31, 41, 55);
        pdf.setFont('helvetica', 'italic');
        pdf.text(o.status, pageWidth - margin - 3, yPos + 6, { align: 'right' });

        pdf.setDrawColor(209, 213, 219); // gray-300
        pdf.setLineDashPattern([1, 1], 0);
        pdf.line(margin, yPos + 9.5, pageWidth - margin, yPos + 9.5);
        pdf.setLineDashPattern([], 0); // reset
        yPos += 9.5;
      });

      // Summary Section
      checkNewPage(30);
      yPos += 5;
      pdf.setDrawColor(31, 41, 55);
      pdf.setLineWidth(0.5);
      pdf.line(margin + 110, yPos, pageWidth - margin, yPos);
      yPos += 7;
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(31, 41, 55);
      pdf.text('Grand Total:', margin + 110, yPos);
      pdf.text(`Rs. ${sumTotal.toLocaleString()}`, pageWidth - margin - 3, yPos, { align: 'right' });
      
      yPos += 6;
      pdf.text('Total Balance:', margin + 110, yPos);
      pdf.setTextColor(234, 88, 12);
      pdf.text(`Rs. ${sumBalance.toLocaleString()}`, pageWidth - margin - 3, yPos, { align: 'right' });

      // Footer
      const totalPages = pdf.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(156, 163, 175);
        pdf.text(`Page ${i} of ${totalPages} | VIP Tailors Calling List`, pageWidth / 2, 285, { align: 'center' });
      }

      const filename = `Calling_List_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfOutput = pdf.output('datauristring');

      downloadDataUri(filename, pdfOutput);
      alert('Calling List downloaded successfully.');
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Error saving readable PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300 print:bg-white print:p-0 print:block">
      <div className="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 print:hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-white shrink-0">
          <h3 className="text-xl font-bold text-slate-800 uppercase italic tracking-tighter">Calling List</h3>
          <div className="flex items-center gap-4 flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search by ID, Name or Phone..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadPDF} disabled={isGenerating} className="px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm flex items-center hover:bg-emerald-600 disabled:opacity-50 font-bold">
              {isGenerating ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />} PDF
            </button>
            <button onClick={handlePrint} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm flex items-center hover:bg-black font-bold">
              <Printer size={16} className="mr-2" /> Print List (3-Inch)
            </button>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X size={24} /></button>
          </div>
        </div>
        <div ref={tableRef} className="p-8 overflow-y-auto flex-1 bg-white">
          <table className="w-full text-left">
            <thead className="text-[10px] text-gray-500 uppercase tracking-widest bg-gray-50 font-bold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 border-b">Customer Name</th>
                <th className="px-4 py-3 border-b">Phone Number</th>
                <th className="px-4 py-3 border-b">Order ID</th>
                <th className="px-4 py-3 border-b text-right">Total Amnt</th>
                <th className="px-4 py-3 border-b text-right">Balance</th>
                <th className="px-4 py-3 border-b text-center">Status</th>
                <th className="px-4 py-3 border-b text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {completedOrders.map(o => {
                const cust = customers.find(cu => cu.id === o.customerId);
                const c = computeFinal(o);
                return (
                  <tr key={o.id} className={`hover:bg-slate-50 transition-colors ${o.isCalled ? 'bg-emerald-50/10' : ''}`}>
                    <td className="px-4 py-4 font-black text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="relative group/call">
                          <button
                            onClick={() => handleActionCalled(o.id)}
                            title="Update Call Time"
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm active:scale-90 ${o.isCalled ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-300 hover:border-emerald-500 bg-white'}`}
                          >
                            {o.isCalled ? <CheckSquare size={14} /> : <div className="w-2 h-2 rounded-full bg-slate-200" />}
                          </button>
                          
                          {/* Call History Tooltip */}
                          {o.callHistory && o.callHistory.length > 0 && (
                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 w-48 z-[60] opacity-0 group-hover/call:opacity-100 pointer-events-none transition-opacity">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-700 pb-1">Call History</p>
                              <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                {o.callHistory.map((h, i) => (
                                  <div key={i} className="text-[11px] font-medium flex items-center justify-between">
                                    <span className="text-emerald-400 flex items-center"><div className="w-1 h-1 rounded-full bg-emerald-500 mr-2" /> Call {i + 1}</span>
                                    <span className="text-slate-300">{formatDateSafe(h).split(',')[0]}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {o.isCalled && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleActionCalled(o.id, true); }}
                              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/call:opacity-100 transition-opacity shadow-sm"
                              title="Clear Call Status"
                            >
                              <X size={8} />
                            </button>
                          )}
                        </div>
                        <span>{cust?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-indigo-600 font-black">
                      <div className="flex items-center text-sm">
                        <Phone size={14} className="mr-2" /> {formatPhoneNumber(cust?.phone || '')}
                      </div>
                      {o.isCalled && (
                        <div className="mt-1.5 flex items-center text-[9px] text-emerald-700 font-black bg-emerald-100/50 w-fit px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-tighter shadow-sm animate-in fade-in slide-in-from-top-1">
                          <PhoneCall size={10} className="mr-1" /> LAST CALLED: {formatDateSafe(o.calledTimestamp)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-gray-500">{o.id}</td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-600">Rs. {c.final.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-orange-600 font-black italic">Rs. {c.balance.toLocaleString()}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={getStatusChip(o.status)}>{o.status}</span>
                        {o.status === 'Packed' && o.bagCount && (
                          <span className="text-[9px] font-black text-indigo-600 mt-1 uppercase tracking-tighter flex items-center gap-1 bg-indigo-50 px-1.5 rounded">
                            <Package size={8} /> {o.bagCount} BAGS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => navigate('Invoice', o.id)} className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200" title="View Invoice"><Eye size={16} /></button>
                        <button onClick={() => handleMarkDelivered(o.id)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100 hover:bg-emerald-100 transition-all">Paid & Deliver</button>
                        <button onClick={() => handleLocalMarkAsDue(o.id)} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all">Mark Due</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t bg-slate-50 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400 italic">
          <div>VIP Tailors Calling List Report</div>
        </div>
      </div>

      <div className="hidden print:block">
        <style>{`
              @media print {
                  @page { margin: 0; size: 80mm auto; }
                  body * { visibility: hidden; }
                  .print-calling-list, .print-calling-list * { visibility: visible; }
                  .print-calling-list {
                      position: absolute !important;
                      left: 0 !important;
                      top: 0 !important;
                      width: 72mm !important;
                      padding: 2mm !important;
                      margin: 0 !important;
                      background: white;
                      color: black;
                      font-family: 'Courier New', Courier, monospace;
                      box-sizing: border-box !important;
                  }
                  .dashed-line { border-top: 1px dashed black; margin: 3mm 0; }
                  .item-row { margin-bottom: 4mm; border-bottom: 1px dashed black; padding-bottom: 2mm; page-break-inside: avoid; }
                  .bold { font-weight: bold; }
                  .text-lg { font-size: 18px; }
                  .text-md { font-size: 14px; }
                  .text-sm { font-size: 11px; }
                  .text-right { text-align: right; }
                  .text-center { text-align: center; }
                  .uppercase { text-transform: uppercase; }
                  .flex { display: flex; }
                  .justify-between { justify-content: space-between; }
              }
          `}</style>
        <div className="print-calling-list">
          <div className="text-center">
            <h1 className="text-lg bold uppercase">VIP Tailors</h1>
            <p className="text-md bold uppercase">Calling List</p>
            <p className="text-sm">Ready For Delivery</p>
            <p className="text-sm">{new Date().toLocaleDateString()}</p>
          </div>
          <div className="dashed-line"></div>

          {completedOrders.length === 0 ? (
            <p className="text-center text-sm italic">No completed orders found.</p>
          ) : (
            completedOrders.map((o) => {
              const cust = customers.find(cu => cu.id === o.customerId);
              const c = computeFinal(o);
              return (
                <div key={o.id} className="item-row">
                  <p className="text-md bold uppercase">{cust?.name || 'Unknown'}</p>
                  <p className="text-md bold">TEL: {formatPhoneNumber(cust?.phone || '')}</p>
                  <div className="flex justify-between text-sm">
                    <span>ID: {formatOrderId(o.id)}</span>
                    <span>Date: {o.orderDate}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Total Amnt:</span>
                    <span>Rs. {c.final.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-md bold">
                    <span>BALANCE DUE:</span>
                    <span>Rs. {c.balance.toLocaleString()}</span>
                  </div>
                </div>
              );
            })
          )}

          <div className="dashed-line"></div>
          <div className="text-center text-sm">
            <p className="bold italic">Software By ARM.Aswin</p>
            <p className="italic">0778514532</p>
          </div>
        </div>
      </div>
    </div>
  );
};


const Orders: React.FC<OrdersProps> = ({ navigate }) => {
  const context = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Server-side search state — null means "no active filter, show context.orders"
  const [searchResults, setSearchResults] = useState<Order[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [viewingMeasurementsOrder, setViewingMeasurementsOrder] = useState<Order | null>(null);
  const [completedModalOpen, setCompletedModalOpen] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [branchNotifications, setBranchNotifications] = useState<Array<{ branchId: string; branchName: string; latestOrderNumber: string; count: number }>>([]);

  if (!context) return <div>Loading...</div>;
  const { orders, setOrders, customers, currentUser, activeBranchId, accessToken, currentBranch, canAccessPage, canUseOrderAction, branches, isAllBranchesScope, getBranchName, employees, setEmployees } = context;

  const customersById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const getCustomerName = useCallback((order: Order) => order.customerName || customersById.get(order.customerId)?.name || 'Unknown', [customersById]);
  const getCustomerPhone = useCallback((order: Order) => order.customerPhone || customersById.get(order.customerId)?.phone || '', [customersById]);
  const branchNameById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const getOrderBranchName = (order: Order) => order.branchName || branchNameById.get(order.branchId || '') || getBranchName(order.branchId) || 'Unknown Branch';

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  // ── Server-side search / filter ──────────────────────────────────────────
  // Fires whenever the debounced search term, status filter, or date range changes.
  // When all filters are cleared we revert to showing context.orders (no API call).
  useEffect(() => {
    const hasActiveFilter =
      debouncedSearchTerm !== '' ||
      statusFilter !== 'All' ||
      fromDate !== '' ||
      toDate !== '';

    if (!hasActiveFilter) {
      // No filter active — show global context.orders without an extra API call
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    if (!accessToken) return;

    // 'Due' navigates to a different page — no search needed here
    if (statusFilter === 'Due') return;

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    const orderDataBranchFilter = (currentUser?.role === 'master_admin' || isAllBranchesScope)
      ? (activeBranchId === 'all' ? undefined : activeBranchId)
      : (activeBranchId || undefined);

    fetchCloudOrderSearch(accessToken, orderDataBranchFilter, {
      // Emergency is a boolean flag — send no status_filter so we get all, then filter client-side
      statusFilter: statusFilter !== 'Emergency' ? (statusFilter as Order['status'] | 'All') : 'All',
      search: debouncedSearchTerm || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })
      .then((results) => {
        if (cancelled) return;
        // Apply Emergency pseudo-filter client-side
        const filtered = statusFilter === 'Emergency'
          ? results.filter((o) => o.emergency)
          : results;
        setSearchResults(filtered);
        setIsSearching(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Order search failed:', err);
        setSearchError('Search failed. Showing cached results.');
        setSearchResults(null);
        setIsSearching(false);
      });

    return () => { cancelled = true; };
  }, [debouncedSearchTerm, statusFilter, fromDate, toDate, accessToken, activeBranchId, currentUser, isAllBranchesScope]);

  useEffect(() => {
    if (!accessToken || !currentBranch || !currentBranch.accessAreas.includes('orders')) {
      setBranchNotifications([]);
      return;
    }

    let isCancelled = false;

    const loadNotifications = async () => {
      if (document.hidden) {
        return;
      }

      try {
        const notifications = await fetchProductionNotifications(accessToken);
        if (!isCancelled) {
          setBranchNotifications(notifications);
        }
      } catch (error) {
        console.error('Unable to load branch notifications:', error);
        if (!isCancelled) {
          setBranchNotifications([]);
        }
      }
    };

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, PRODUCTION_NOTIFICATION_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [accessToken, currentBranch]);

  const handleToggleCut = async (itemId: string) => {
    if (!viewingMeasurementsOrder) return;
    const updatedOrder = {
      ...viewingMeasurementsOrder,
      items: viewingMeasurementsOrder.items.map(item => item.id === itemId ? { ...item, isCut: !item.isCut } : item)
    };
    // Optimistic update
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    setViewingMeasurementsOrder(updatedOrder);
    // Persist to backend
    try {
      if (context.saveOrder) {
        await context.saveOrder(updatedOrder);
      }
    } catch (e) {
      console.error('Failed to persist cut toggle:', e);
    }
  };

  const handleUpdateStatus = async (status: Order['status']) => {
    if (!viewingMeasurementsOrder) return;
    const updatedOrder = { ...viewingMeasurementsOrder, status };
    // Optimistic update for immediate UI feedback
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    setViewingMeasurementsOrder(updatedOrder);
    // Persist to backend so server state stays in sync
    try {
      if (context.saveOrder) {
        await context.saveOrder(updatedOrder);
      }
    } catch (e) {
      console.error('Failed to persist status update:', e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return;
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    // Optimistic update
    setOrders(orders.filter((o) => o.id !== id));
    // Also clear from search results if active
    setSearchResults((prev) => prev ? prev.filter((o) => o.id !== id) : null);
    // Persist deletion to backend
    try {
      if (context.deleteOrder) {
        await context.deleteOrder(order);
      }
    } catch (e) {
      console.error('Failed to delete order on server:', e);
      // Restore the order in local state on failure
      setOrders((prev) => [order, ...prev]);
    }
  };

  const getBranchEmployeeRateForDate = (employee: typeof employees[number], workDate: string, fallbackRate = 0) => {
    const sortedHistory = [...(employee.branchPieceRateHistory || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    if (sortedHistory.length > 0) {
      const effectiveRate = [...sortedHistory].reverse().find((entry) => entry.effectiveFrom <= workDate);
      if (effectiveRate) {
        return effectiveRate.rate;
      }
      return sortedHistory[0].rate;
    }

    const legacyRate = Object.values(employee.pieceRates || {})
      .map((value) => Number(value))
      .find((value) => value > 0);

    return legacyRate || fallbackRate;
  };

  const syncBranchEmployeePieceLogs = (
    order: Order,
    itemId: string,
    completedQuantity: number,
    workDate: string,
  ) => {
    const existingItem = order.items.find((item) => item.id === itemId);
    if (!existingItem || !order.branchId) {
      return;
    }

    const previousCompletedQuantity = existingItem.completedQuantity || 0;
    const quantityDelta = completedQuantity - previousCompletedQuantity;
    if (quantityDelta === 0) {
      return;
    }

    setEmployees((prevEmployees) => prevEmployees.map((employee) => {
      if (employee.type !== 'BranchEmployee' || employee.salarySourceBranchId !== order.branchId) {
        return employee;
      }

      const unitPrice = getBranchEmployeeRateForDate(employee, workDate);
      const existingLogIndex = employee.workLogs.findIndex((log) =>
        log.autoGenerated &&
        log.sourceOrderId === order.id &&
        log.sourceOrderItemId === itemId &&
        log.date === workDate
      );

      const nextLogs = [...employee.workLogs];

      if (existingLogIndex >= 0) {
        const currentLog = nextLogs[existingLogIndex];
        const nextQuantity = currentLog.quantity + quantityDelta;
        if (nextQuantity <= 0) {
          nextLogs.splice(existingLogIndex, 1);
        } else {
          nextLogs[existingLogIndex] = {
            ...currentLog,
            dressType: BRANCH_PIECE_LABEL,
            quantity: nextQuantity,
            unitPrice,
            totalAmount: nextQuantity * unitPrice,
            timestamp: new Date().toISOString(),
          };
        }
      } else if (quantityDelta > 0) {
        nextLogs.unshift({
          id: `AUTO-WORK-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          dressType: BRANCH_PIECE_LABEL,
          quantity: quantityDelta,
          unitPrice,
          totalAmount: quantityDelta * unitPrice,
          date: workDate,
          timestamp: new Date().toISOString(),
          autoGenerated: true,
          sourceBranchId: order.branchId,
          sourceOrderId: order.id,
          sourceOrderItemId: itemId,
        });
      }

      return {
        ...employee,
        workLogs: nextLogs,
      };
    }));
  };

  const handleDressTrackingUpdate = async (itemId: string, completedQuantity: number, status: 'pending' | 'partial' | 'completed', completionData: boolean[]) => {
    if (!trackingOrder) return;

    const updatedOrder = {
      ...trackingOrder,
      items: trackingOrder.items.map(item =>
        item.id === itemId
          ? { ...item, completedQuantity, completionStatus: status, completionData }
          : item
      )
    };

    // Check if order status should change to Completed
    const isOrderFullyComplete = updatedOrder.items.every(item => item.completionStatus === 'completed');
    if (isOrderFullyComplete && updatedOrder.status !== 'Completed' && updatedOrder.status !== 'Delivered') {
      updatedOrder.status = 'Completed';
    } else if (!isOrderFullyComplete && updatedOrder.status === 'Completed') {
      updatedOrder.status = 'In Progress';
    }

    // Optimistic update
    setTrackingOrder(updatedOrder);
    setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    // Persist to backend
    try {
      if (context.saveOrder) {
        await context.saveOrder(updatedOrder);
      }
    } catch (e) {
      console.error('Failed to persist tracking update:', e);
    }
  };

  const handleSetPacked = async (orderId: string, status: Order['status'], bagCount?: number) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;
    const updatedOrder = { ...orderToUpdate, status, bagCount };
    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
    // Persist to backend
    try {
      if (context.saveOrder) {
        await context.saveOrder(updatedOrder);
      }
    } catch (e) {
      console.error('Failed to persist packed status:', e);
    }
  };



  // ── Displayed orders ─────────────────────────────────────────────────────
  // When a search/filter is active: use server-side results (searchResults).
  // When no filter is active:       fall back to context.orders (full in-memory list).
  // The sort is maintained from the backend (order_date DESC, created_at DESC).
  const filteredOrders = useMemo(() => {
    const source = searchResults ?? orders;
    return [...source].sort((a, b) => {
      const dateDiff = new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      const getNum = (idStr: string | number) => {
        const match = String(idStr).match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };
      return getNum(b.id) - getNum(a.id);
    });
  }, [searchResults, orders]);

  const showAddOrderButton = canAccessPage('Add Order');
  const canOpenCutSheet = canUseOrderAction('cut_sheet');
  const canTrackCompletion = canUseOrderAction('track_completion');
  const canOpenInvoice = canUseOrderAction('invoice') || canAccessPage('Add Order');
  const canEditOrder = canUseOrderAction('edit');
  const canDeleteOrder = canUseOrderAction('delete');
  const canFilterProductionStatuses = isAllBranchesScope || currentBranch?.isProductionHub || canTrackCompletion;
  const statusOptions = [
    { label: 'All Status', value: 'All' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Hold', value: 'Hold' },
    ...(canFilterProductionStatuses ? [
      { label: 'In Progress', value: 'In Progress' },
      { label: 'Completed', value: 'Completed' },
      { label: 'Packed', value: 'Packed' },
    ] : []),
    { label: 'Delivered', value: 'Delivered' },
    { label: 'Cancelled', value: 'Cancelled' },
    { label: 'Due Orders', value: 'Due' },
    { label: 'Emergency Orders', value: 'Emergency' },
  ];


  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <h1 className="text-4xl font-bold text-gray-800">Orders</h1>
        {showAddOrderButton && (
          <button onClick={() => navigate('Add Order')} className="inline-flex items-center justify-center px-4 py-2 mt-4 sm:mt-0 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700">
            <PlusCircle className="w-5 h-5 mr-2" /> Add New Order
          </button>
        )}
      </div>

      {/* ─── SEARCH & FILTER BAR – always at top so it is always reachable ─── */}
      <AdminFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by Order ID, Customer Name or Phone..."
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        statusFilter={statusFilter}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          if (value === 'Due') {
            navigate('Due Orders');
          }
        }}
        statusOptions={statusOptions}
        extraActions={canFilterProductionStatuses && (statusFilter === 'Completed' || statusFilter === 'Packed') ? (
          <button
            onClick={() => setCompletedModalOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-600 transition-colors hover:bg-blue-100"
            title="Generate Call List"
          >
            <Package className="mr-2 h-4 w-4" />
            Call List
          </button>
        ) : null}
      />

      {branchNotifications.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {branchNotifications.map((notification) => (
            <div key={notification.branchId} className="rounded-2xl border-2 border-slate-900 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-slate-900">{notification.branchName}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">Latest Order: {notification.latestOrderNumber}</p>
                  <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">Pending production intake</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
                  <div className="relative">
                    <BellRing size={20} />
                    <span className="absolute -right-4 -top-3 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                      {notification.count}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}



      <div className="space-y-4 md:hidden">
        {filteredOrders.length > 0 ? filteredOrders.map((order) => (
          <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center">
                  <span className="text-lg font-bold text-slate-900">{formatOrderId(order.id)}</span>
                  <CopyButton text={formatOrderId(order.id)} />
                </div>
                <p className="mt-2 font-semibold text-slate-900">{getCustomerName(order)}</p>
                <p className="mt-1 text-sm font-bold text-emerald-600">{formatPhoneNumber(getCustomerPhone(order))}</p>
              </div>
              <span className={getStatusChip(order.status)}>{order.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Order Date</p>
                <p className="mt-1 font-semibold text-slate-700">{order.orderDate}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Due Date</p>
                <p className="mt-1 font-semibold text-slate-700">{order.dueDate || '-'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Total</p>
                <p className="mt-1 font-bold text-slate-900">Rs. {order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Bag Count</p>
                <p className="mt-1 font-semibold text-slate-700">{order.bagCount || '-'}</p>
              </div>
            </div>
            {(isAllBranchesScope || (currentBranch?.accessAreas.includes('orders') && order.branchId && order.branchId !== currentBranch.id)) && (
              <div className="mt-3">
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                  {getOrderBranchName(order)}
                </span>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {canOpenCutSheet && <button onClick={() => setViewingMeasurementsOrder(order)} className="rounded-lg bg-indigo-50 p-2 text-indigo-600" title="Cut Sheet"><Scissors size={18} /></button>}
              {canTrackCompletion && <button onClick={() => setTrackingOrder(order)} className="rounded-lg bg-orange-50 p-2 text-orange-600" title="Track Dress Completion"><Package size={18} /></button>}
              {canOpenInvoice && <button onClick={() => navigate('Invoice', order.id)} className="rounded-lg bg-slate-100 p-2 text-slate-600" title="Invoice"><Eye size={18} /></button>}
              {canEditOrder && <button onClick={() => navigate('Edit Order', order.id)} className="rounded-lg bg-blue-50 p-2 text-blue-600" title="Edit"><Edit size={18} /></button>}
              {canDeleteOrder && <button onClick={() => handleDelete(order.id)} className="rounded-lg bg-red-50 p-2 text-red-600" title="Delete"><Trash2 size={18} /></button>}
            </div>
          </div>
        )) : isSearching ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm text-slate-400 italic">Searching orders...</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
            {searchError
              ? searchError
              : searchResults !== null
              ? 'No orders match your search.'
              : 'No orders found.'}
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg bg-white shadow-md md:block">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 font-bold border-b">
            <tr>
              <th className="px-6 py-3">Order ID</th>
              <th className="px-6 py-3">Customer</th>
              <th className="px-6 py-3">Order Date</th>
              <th className="px-6 py-3">Due Date</th>
              <th className="px-6 py-3">Total</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredOrders.length > 0 ? (
              filteredOrders.map(order => (
                <tr key={order.id} className="bg-white hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">
                    <div className="flex items-center">
                      <span>{formatOrderId(order.id)}</span>
                      <CopyButton text={formatOrderId(order.id)} />
                    </div>
                    {(isAllBranchesScope || (currentBranch?.accessAreas.includes('orders') && order.branchId && order.branchId !== currentBranch.id)) && (
                      <div className="mt-2">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                          {getOrderBranchName(order)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <div className="text-gray-900">{getCustomerName(order)}</div>
                    <div className="text-emerald-600 font-bold text-[13px]">{formatPhoneNumber(getCustomerPhone(order))}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{order.orderDate}</td>
                  <td className="px-6 py-4 text-gray-500">{order.dueDate || '-'}{order.emergency && <span className="ml-2 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Emergency</span>}</td>
                  <td className="px-6 py-4 font-bold text-gray-900">Rs. {order.items.reduce((sum, item) => sum + item.quantity * item.pricePerUnit, 0).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {canFilterProductionStatuses && (order.status === 'Completed' || order.status === 'Packed') ? (
                        <div className="relative group/pack">
                          <button
                            onClick={() => handleSetPacked(order.id, order.status === 'Packed' ? 'Completed' : 'Packed', undefined)}
                            className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${
                              order.status === 'Packed' 
                                ? 'bg-slate-900 border-slate-900 text-white' 
                                : 'bg-white border-slate-300 text-transparent hover:border-slate-900'
                            }`}
                          >
                            <CheckSquare size={14} className={order.status === 'Packed' ? 'opacity-100' : 'opacity-0'} />
                          </button>
                          
                          {/* Bag Selection Menu - Redesigned with previous white theme but improved layout */}
                          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-white border border-slate-200 text-slate-800 rounded-xl shadow-2xl p-2.5 min-w-[110px] opacity-0 invisible group-hover/pack:opacity-100 group-hover/pack:visible transition-all z-[60]">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-2 mb-1.5 border-b border-slate-100 pb-1">Select Bags</p>
                            <div className="space-y-1">
                              {[2, 3, 4, 5].map(count => (
                                <button
                                  key={count}
                                  onClick={() => handleSetPacked(order.id, 'Packed', count)}
                                  className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-between ${
                                    order.bagCount === count 
                                      ? 'bg-indigo-600 text-white shadow-md' 
                                      : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                                  }`}
                                >
                                  {count} Bags
                                  <div className={`w-1.5 h-1.5 rounded-full ${order.bagCount === count ? 'bg-white' : 'bg-slate-200'}`} />
                                </button>
                              ))}
                            </div>
                            {/* Pointer Arrow */}
                            <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-r border-t border-slate-200 rotate-45" />
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-col">
                        <span className={getStatusChip(order.status)}>{order.status}</span>
                        {canFilterProductionStatuses && order.status === 'Packed' && order.bagCount && (
                          <span className="text-[10px] font-black text-indigo-600 mt-0.5 uppercase tracking-tighter flex items-center gap-1">
                            <Package size={10} /> {order.bagCount} BAGS
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 flex justify-center space-x-1">
                    {canOpenCutSheet && <button onClick={() => setViewingMeasurementsOrder(order)} className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md" title="Cut Sheet"><Scissors size={18} /></button>}
                    {canTrackCompletion && <button onClick={() => setTrackingOrder(order)} className="p-1.5 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-md" title="Track Dress Completion"><Package size={18} /></button>}
                    {canOpenInvoice && <button onClick={() => navigate('Invoice', order.id)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md" title="Invoice"><Eye size={18} /></button>}
                    {canEditOrder && <button onClick={() => navigate('Edit Order', order.id)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md" title="Edit"><Edit size={18} /></button>}
                    {canDeleteOrder && <button onClick={() => handleDelete(order.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md" title="Delete"><Trash2 size={18} /></button>}
                  </td>
                </tr>
              ))
            ) : isSearching ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-indigo-400" />
                <p className="text-sm text-slate-400 italic">Searching orders...</p>
              </td></tr>
            ) : (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">
                {searchError
                  ? searchError
                  : searchResults !== null
                  ? 'No orders match your search.'
                  : 'No orders found matching your filters.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewingMeasurementsOrder && (
        <MeasurementModal
          order={viewingMeasurementsOrder}
          customerName={getCustomerName(viewingMeasurementsOrder)}
          onClose={() => setViewingMeasurementsOrder(null)}
          onToggleCut={handleToggleCut}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
      {completedModalOpen && <CompletedModal onClose={() => setCompletedModalOpen(false)} fromDate={fromDate} toDate={toDate} navigate={navigate} />}
      {trackingOrder && (
        <DressQuantityTracker
          order={trackingOrder}
          customer={customers.find(c => c.id === trackingOrder.customerId) || {
            id: trackingOrder.customerId,
            branchId: trackingOrder.branchId || '',
            name: trackingOrder.customerName || 'Walk-in',
            phone: trackingOrder.customerPhone || '',
            address: '',
            email: '',
          }}
          onClose={() => setTrackingOrder(null)}
          onUpdate={handleDressTrackingUpdate}
          onCompleteOrder={async () => {
            if (trackingOrder) {
              const updatedOrder = { ...trackingOrder, status: 'Completed' as const };
              setTrackingOrder(updatedOrder);
              setOrders(prevOrders => prevOrders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
              // Persist to backend
              try {
                if (context.saveOrder) {
                  await context.saveOrder(updatedOrder);
                }
              } catch (e) {
                console.error('Failed to persist completed status:', e);
              }
            }
          }}
        />
      )}
    </div>
  );
};

export default Orders;
