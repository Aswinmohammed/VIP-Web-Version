import React, { useState, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { Order, Page } from '../types';
import { Phone, Edit, DollarSign, X, Search, Filter, Printer, Download, Loader2, Eye, MessageSquare, Send } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { sendCloudOrderSms, addCloudPayment } from '../utils/cloudApi';
import { downloadDataUri } from '../utils/downloads';
import { calculateOrderTotals } from '../utils/orderUtils';

const OWNER_CONTACT_PHONE = '077 777 0811';
const OWNER_CONTACT_INDENT = '                             ';

interface CollectionModalProps {
  order: Order;
  customer: any;
  computeFinal: (o: Order) => any;
  onClose: () => void;
  onSubmit: (amount: number, date: string, method: string, note: string) => Promise<void>;
  isSubmitting?: boolean;
  formatOrderId: (id: string) => string;
  formatPhoneNumber: (phone: string | undefined | null) => string;
}

const CollectionModal: React.FC<CollectionModalProps> = ({ order, customer, computeFinal, onClose, onSubmit, isSubmitting, formatOrderId, formatPhoneNumber }) => {
  const { balance } = computeFinal(order);
  const [amount, setAmount] = useState(balance.toString());
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<'Cash' | 'Card' | 'Bank Transfer' | 'Cheque'>('Cash');
  const [note, setNote] = useState('');

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (numAmount > balance) {
      alert(`Amount cannot exceed due balance of Rs. ${balance.toFixed(2)}`);
      return;
    }
    await onSubmit(numAmount, date, method, note);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form onSubmit={handleFormSubmit} className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-green-50">
          <div className="flex items-center">
            <div className="bg-emerald-500 p-3 rounded-xl mr-3 shadow-lg shadow-emerald-500/20">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Collect Payment</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Customer Details</p>
            <p className="text-lg font-black text-slate-900">{customer?.name}</p>
            <div className="flex items-center text-indigo-600 font-semibold">
              <Phone size={16} className="mr-2" /> {formatPhoneNumber(customer?.phone)}
            </div>
            <p className="text-xs text-slate-500">Order: {formatOrderId(order.id)}</p>
          </div>

          <div className="bg-red-50 p-4 rounded-xl border border-red-100">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Total Due</p>
            <p className="text-3xl font-black text-red-600">Rs. {balance.toFixed(2)}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Amount to Collect *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500 font-bold">Rs.</span>
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  max={balance}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Method</label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as any)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Notes (Optional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Payment details..."
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-bold transition-colors"
          >
            Cancel
          </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-emerald-500 text-white rounded-xl py-3 font-bold text-sm hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
              {isSubmitting ? 'Saving...' : 'Record Payment'}
            </button>
        </div>
      </form>
    </div>
  );
};

interface DueSmsModalProps {
  order: Order;
  customer: any;
  branchName: string;
  branchPhone: string;
  initialMessage: string;
  computeFinal: (o: Order) => any;
  onClose: () => void;
  onSubmit: (phone: string, message: string) => Promise<void>;
  formatOrderId: (id: string) => string;
  formatPhoneNumber: (phone: string | undefined | null) => string;
}

const DueSmsModal: React.FC<DueSmsModalProps> = ({
  order,
  customer,
  branchName,
  branchPhone,
  initialMessage,
  computeFinal,
  onClose,
  onSubmit,
  formatOrderId,
  formatPhoneNumber,
}) => {
  const { balance } = computeFinal(order);
  const [phone, setPhone] = useState(customer?.phone || order.customerPhone || '');
  const [message, setMessage] = useState(initialMessage);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Customer phone number is required.');
      return;
    }
    if (!message.trim()) {
      setError('SMS message cannot be empty.');
      return;
    }

    setIsSending(true);
    setError('');
    try {
      await onSubmit(phone, message);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to send SMS.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form onSubmit={handleFormSubmit} className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center">
            <div className="bg-blue-600 p-3 rounded-xl mr-3 shadow-lg shadow-blue-600/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Send Due SMS</h2>
              <p className="text-sm text-slate-500">Edit the message before sending it to the customer.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/60 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</p>
              <p className="text-lg font-black text-slate-900">{customer?.name || order.customerName || 'Unknown'}</p>
              <div className="flex items-center text-indigo-600 font-semibold">
                <Phone size={16} className="mr-2" /> {formatPhoneNumber(phone)}
              </div>
              <p className="text-xs text-slate-500">Order: {formatOrderId(order.id)}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Branch Details</p>
              <p className="text-lg font-black text-slate-900">{branchName}</p>
              <div className="flex items-center text-blue-700 font-semibold">
                <Phone size={16} className="mr-2" /> {branchPhone}
              </div>
              <p className="text-xs text-blue-700">Due Balance: Rs. {balance.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0771234567"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">SMS Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm leading-6 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Type your due reminder SMS..."
              required
            />
            <p className="mt-2 text-xs text-slate-500">The customer will receive exactly the message shown here.</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSending}
            className="flex-1 px-4 py-2.5 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 font-bold transition-colors shadow-md inline-flex items-center justify-center"
          >
            {isSending ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Send size={18} className="mr-2" />}
            Send SMS
          </button>
        </div>
      </form>
    </div>
  );
};

interface DueListModalProps {
  onClose: () => void;
  dueOrders: Order[];
  customers: any[];
  computeFinal: (o: Order) => any;
  handleDownloadDueListPDF: () => void;
  isGeneratingPDF: boolean;
  handlePrintDueList: () => void;
  formatOrderId: (id: string) => string;
  formatPhoneNumber: (phone: string | undefined | null) => string;
}

const DueListModal: React.FC<DueListModalProps> = ({ onClose, dueOrders, customers, computeFinal, handleDownloadDueListPDF, isGeneratingPDF, handlePrintDueList, formatOrderId, formatPhoneNumber }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300 print:bg-white print:p-0 print:block">
      <div className="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 print:hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-white shrink-0">
          <h3 className="text-xl font-bold text-slate-800 uppercase italic tracking-tighter">Due Orders Report</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadDueListPDF} disabled={isGeneratingPDF} className="px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm flex items-center hover:bg-emerald-600 disabled:opacity-50 font-bold">
              {isGeneratingPDF ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />} PDF
            </button>
            <button onClick={handlePrintDueList} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm flex items-center hover:bg-black font-bold">
              <Printer size={16} className="mr-2" /> Print
            </button>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"><X size={24} /></button>
          </div>
        </div>
        <div className="p-8 overflow-y-auto flex-1 bg-white">
          <table className="w-full text-left">
            <thead className="text-[10px] text-gray-500 uppercase tracking-widest bg-gray-50 font-bold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 border-b">Order ID</th>
                <th className="px-4 py-3 border-b">Customer Name</th>
                <th className="px-4 py-3 border-b">Phone Number</th>
                <th className="px-4 py-3 border-b text-right">Total Amnt</th>
                <th className="px-4 py-3 border-b text-right">Due Balance</th>
                <th className="px-4 py-3 border-b">Order Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dueOrders.map(o => {
                const cust = customers.find(cu => cu.id === o.customerId);
                const c = computeFinal(o);
                return (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 font-mono text-xs text-gray-500">{formatOrderId(o.id)}</td>
                    <td className="px-4 py-4 font-black text-slate-900">{cust?.name || 'Unknown'}</td>
                    <td className="px-4 py-4 text-indigo-600 font-black flex items-center">
                      <Phone size={14} className="mr-2" /> {formatPhoneNumber(cust?.phone)}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-gray-600">Rs. {c.final.toLocaleString()}</td>
                    <td className="px-4 py-4 text-right text-red-600 font-black italic">Rs. {c.balance.toFixed(2)}</td>
                    <td className="px-4 py-4 text-gray-400 italic text-xs">{o.orderDate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t bg-slate-50 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-slate-400 italic">
          <div>VIP Tailors Due Orders Report</div>
        </div>
      </div>

      <div className="hidden print:block">
        <style>{`
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body * { visibility: hidden; }
            .print-due-list, .print-due-list * { visibility: visible; }
            .print-due-list {
              position: absolute !important; left: 0 !important; top: 0 !important;
              width: 80mm !important; padding: 4mm !important; margin: 0 !important;
              background: white; color: black; font-family: 'Courier New', Courier, monospace;
            }
            .dashed-line { border-top: 1px dashed black; margin: 3mm 0; }
            .item-row { margin-bottom: 4mm; border-bottom: 0.5px solid #ccc; padding-bottom: 2mm; page-break-inside: avoid; }
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
        <div className="print-due-list">
          <div className="text-center">
            <h1 className="text-lg bold uppercase">VIP Tailors </h1>
            <p className="text-md bold uppercase">Due Orders Report</p>
            <p className="text-sm">{new Date().toLocaleDateString()}</p>
          </div>
          <div className="dashed-line"></div>
          {dueOrders.length === 0 ? (
            <p className="text-center text-sm italic">No due orders found.</p>
          ) : (
            dueOrders.map((o) => {
              const cust = customers.find(cu => cu.id === o.customerId);
              const c = computeFinal(o);
              return (
                <div key={o.id} className="item-row">
                  <p className="text-md bold uppercase">{cust?.name || 'Unknown'}</p>
                  <p className="text-md bold">TEL: {formatPhoneNumber(cust?.phone)}</p>
                  <div className="flex justify-between text-sm">
                    <span>ID: {formatOrderId(o.id)}</span>
                    <span>Date: {o.orderDate}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Total Amnt:</span>
                    <span>Rs. {c.final.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-md bold">
                    <span>DUE BALANCE:</span>
                    <span>Rs. {c.balance.toFixed(2)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

interface DueOrdersProps {
  navigate: (page: Page, orderId?: string) => void;
}

const DueOrders: React.FC<DueOrdersProps> = ({ navigate }) => {
  const context = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [dueSmsModalOpen, setDueSmsModalOpen] = useState(false);
  const [selectedSmsOrder, setSelectedSmsOrder] = useState<Order | null>(null);
  const [dueListModalOpen, setDueListModalOpen] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  if (!context) return <div>Loading...</div>;
  const { orders, setOrders, customers, currentUser, activeBranchId, accessToken, branches, isCloudMode } = context;

  const formatOrderId = (id: string) => {
    if (id.startsWith('ORD') && !id.includes('-')) {
      return `ORD-${id.substring(3)}`;
    }
    return id;
  };

  const formatPhoneNumber = (phone: string | undefined | null) => {
    if (!phone) return 'N/A';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) return `${match[1]} ${match[2]} ${match[3]}`;
    return phone;
  };

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Unknown';
  const getCustomerPhone = (id: string) => formatPhoneNumber(customers.find(c => c.id === id)?.phone);
  const getBranchName = (order: Order) => order.branchName || branches.find(branch => branch.id === order.branchId)?.name || 'Current Branch';
  const getBranchPhone = (order: Order) => formatPhoneNumber(order.branchPhone || branches.find(branch => branch.id === order.branchId)?.phone);

  const formatSmsAmount = (amount: number) => amount.toFixed(2);

  const extractErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) {
      return 'Unable to send the SMS right now.';
    }

    try {
      const parsed = JSON.parse(error.message) as { detail?: string | { msg?: string }[] };
      if (typeof parsed.detail === 'string') {
        return parsed.detail;
      }
      if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
        return parsed.detail[0].msg;
      }
    } catch {
      return error.message || 'Unable to send the SMS right now.';
    }

    return error.message || 'Unable to send the SMS right now.';
  };

  const computeFinal = (o: Order) => {
    const totals = calculateOrderTotals(o);
    return { final: totals.finalAmount, paid: totals.paid, balance: totals.balance };
  };

  const dueOrders = useMemo(() => {
    return orders
      .filter(order => order.status === 'Due')
      .filter(order => {
        const customerName = getCustomerName(order.customerId).toLowerCase();
        const lowerSearchTerm = searchTerm.toLowerCase();
        return customerName.includes(lowerSearchTerm) || order.id.toLowerCase().includes(lowerSearchTerm);
      })
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [orders, searchTerm, customers]);

  const handleCollect = (order: Order) => {
    setSelectedOrder(order);
    setCollectionModalOpen(true);
  };

  const buildDueSmsMessage = (order: Order) => {
    const customer = customers.find(c => c.id === order.customerId);
    const { balance } = computeFinal(order);
    const branchPhone = getBranchPhone(order);
    const dueDate = order.dueDate || order.orderDate;
    return [
      `Dear ${customer?.name || order.customerName || 'Customer'}, your order ${formatOrderId(order.id)} is pending payment.`,
      `Due amount: Rs.${formatSmsAmount(balance)}.`,
      `Due date: ${dueDate}.`,
      `For More Details: ${branchPhone}`,
      `${OWNER_CONTACT_INDENT}${OWNER_CONTACT_PHONE}`,
      'Thank you - VIP Tailors & Fashion Pvt Ltd.',
    ].join('\n');
  };

  const handleOpenDueSms = (order: Order) => {
    setSelectedSmsOrder(order);
    setDueSmsModalOpen(true);
  };

  const handleSendDueSms = async (phone: string, message: string) => {
    if (!isCloudMode || !accessToken) {
      throw new Error('SMS sending is available only in cloud mode.');
    }
    if (!selectedSmsOrder?.serverId) {
      throw new Error('This order must be saved to the cloud before sending an SMS.');
    }

    const result = await sendCloudOrderSms(accessToken, {
      orderId: selectedSmsOrder.serverId,
      phone,
      message,
    });

    if (result.status === 'failed' || result.status === 'skipped' || result.status === 'cancelled') {
      throw new Error(result.message || 'The SMS could not be sent.');
    }

    alert(`SMS sent successfully to ${formatPhoneNumber(result.phoneNormalized || phone)}.`);
  };

  const handleSubmitCollection = async (amount: number, date: string, method: string, note: string) => {
    if (!selectedOrder) return;
    if (!accessToken) {
      alert('Authentication required. Please log in again.');
      return;
    }
    if (!selectedOrder.serverId) {
      alert('This order must be synced to the cloud before collecting a payment.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const newPayment = await addCloudPayment(accessToken, selectedOrder.serverId, {
        amount,
        payment_date: date,
        method: method as 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque',
        note: note || undefined,
      });

      const updatedOrders = orders.map(o => {
        if (o.id !== selectedOrder.id) return o;

        const updatedPayments = [...(o.payments || []), newPayment];
        const totals = calculateOrderTotals({ ...o, payments: updatedPayments });
        const newBalance = totals.balance;

        const newStatus: Order['status'] = newBalance === 0 ? 'Delivered' : 'Due';

        return { ...o, status: newStatus, payments: updatedPayments };
      });

      setOrders(updatedOrders);
      alert(`✅ Payment of Rs. ${amount.toLocaleString()} recorded successfully! SMS notification sent to customer.`);
      setCollectionModalOpen(false);
      setSelectedOrder(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      alert(`❌ Failed to record payment: ${message}`);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handlePrintDueList = () => {
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const handleDownloadDueListPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
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

      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(31, 41, 55);
      pdf.text('DUE ORDERS REPORT', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(107, 114, 128);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 10;

      pdf.setFillColor(31, 41, 55);
      pdf.rect(margin, yPos, pageWidth - (margin * 2), 11, 'F');
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      pdf.text('ID', margin + 3, yPos + 7);
      pdf.text('Customer Name', margin + 25, yPos + 7);
      pdf.text('Phone', margin + 75, yPos + 7);
      pdf.text('Total', margin + 115, yPos + 7);
      pdf.text('Due Balance', margin + 145, yPos + 7);
      pdf.text('Order Date', pageWidth - margin - 3, yPos + 7, { align: 'right' });
      yPos += 11;

      dueOrders.forEach((o, idx) => {
        checkNewPage(12);
        const cust = customers.find(cu => cu.id === o.customerId);
        const c = computeFinal(o);
        if (idx % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPos, pageWidth - (margin * 2), 12, 'F');
        }
        pdf.setFontSize(9);
        pdf.setTextColor(31, 41, 55);
        pdf.setFontSize(8);
        pdf.setFont('courier', 'normal');
        pdf.text(formatOrderId(o.id), margin + 3, yPos + 7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        const name = cust?.name || 'Unknown';
        pdf.text(name.length > 25 ? name.substring(0, 22) + '...' : name, margin + 25, yPos + 7.5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(formatPhoneNumber(cust?.phone), margin + 75, yPos + 7.5);
        pdf.text(c.final.toLocaleString(), margin + 115, yPos + 7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(220, 38, 38);
        pdf.text(c.balance.toFixed(2), margin + 145, yPos + 7.5);
        pdf.setTextColor(156, 163, 175);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8);
        pdf.text(o.orderDate, pageWidth - margin - 3, yPos + 7.5, { align: 'right' });
        pdf.setDrawColor(243, 244, 246);
        pdf.line(margin, yPos + 12, pageWidth - margin, yPos + 12);
        yPos += 12;
      });

      const filename = `Due_Orders_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfOutput = pdf.output('datauristring');
      
      try {
        downloadDataUri(filename, pdfOutput);
        alert('Due Orders report downloaded successfully.');
      } catch (backendError) {
        pdf.save(filename);
      }
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Error saving PDF.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">Due Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Delivered orders awaiting payment</p>
        </div>
        <div className="mt-4 sm:mt-0 px-4 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-red-600 font-semibold">Total Due: <span className="text-xl font-black text-red-700">Rs. {dueOrders.reduce((sum, o) => sum + computeFinal(o).balance, 0).toFixed(2)}</span></p>
          </div>
          <button
            onClick={() => setDueListModalOpen(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-all flex items-center gap-2 text-sm"
          >
            <Printer size={16} /> Reports
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 relative">
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search Order ID or Customer..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full py-2 pl-10 pr-4 border border-gray-300 rounded-md text-sm focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 font-bold border-b">
            <tr>
              <th className="px-6 py-3">Order ID</th>
              <th className="px-6 py-3">Customer Name</th>
              <th className="px-6 py-3">Phone</th>
              <th className="px-6 py-3 text-right">Total Amount</th>
              <th className="px-6 py-3 text-right">Due Amount</th>
              <th className="px-6 py-3">Order Date</th>
              <th className="px-6 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dueOrders.length > 0 ? (
              dueOrders.map(order => {
                const { final, balance } = computeFinal(order);
                return (
                  <tr key={order.id} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{formatOrderId(order.id)}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{getCustomerName(order.customerId)}</td>
                    <td className="px-6 py-4 text-indigo-600 font-semibold flex items-center">
                      <Phone size={14} className="mr-2" /> {getCustomerPhone(order.customerId)}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-700 text-right">Rs. {final.toLocaleString()}</td>
                    <td className="px-6 py-4 font-black text-red-600 text-right">Rs. {balance.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-500 text-xs">{order.orderDate}</td>
                    <td className="px-6 py-4 flex justify-center space-x-2">
                      <button
                        onClick={() => handleOpenDueSms(order)}
                        className="p-1.5 text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-100"
                        title="Send Due SMS"
                      >
                        <MessageSquare size={16} />
                      </button>
                       <button
                        onClick={() => navigate('Invoice', order.id)}
                        className="p-1.5 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200"
                        title="View Invoice"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => navigate('Edit Order', order.id)}
                        className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleCollect(order)}
                        className="px-3 py-1.5 text-emerald-600 bg-emerald-50 rounded-lg text-xs font-bold border border-emerald-100 hover:bg-emerald-100"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500 italic">No due orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {collectionModalOpen && selectedOrder && (
        <CollectionModal
          order={selectedOrder}
          customer={customers.find(c => c.id === selectedOrder.customerId)}
          computeFinal={computeFinal}
          onClose={() => {
            if (!isSubmittingPayment) {
              setCollectionModalOpen(false);
              setSelectedOrder(null);
            }
          }}
          onSubmit={handleSubmitCollection}
          isSubmitting={isSubmittingPayment}
          formatOrderId={formatOrderId}
          formatPhoneNumber={formatPhoneNumber}
        />
      )}

      {dueSmsModalOpen && selectedSmsOrder && (
        <DueSmsModal
          order={selectedSmsOrder}
          customer={customers.find(c => c.id === selectedSmsOrder.customerId)}
          branchName={getBranchName(selectedSmsOrder)}
          branchPhone={getBranchPhone(selectedSmsOrder)}
          initialMessage={buildDueSmsMessage(selectedSmsOrder)}
          computeFinal={computeFinal}
          onClose={() => {
            setDueSmsModalOpen(false);
            setSelectedSmsOrder(null);
          }}
          onSubmit={async (phone, message) => {
            try {
              await handleSendDueSms(phone, message);
            } catch (error) {
              throw new Error(extractErrorMessage(error));
            }
          }}
          formatOrderId={formatOrderId}
          formatPhoneNumber={formatPhoneNumber}
        />
      )}

      {dueListModalOpen && (
        <DueListModal
          onClose={() => setDueListModalOpen(false)}
          dueOrders={dueOrders}
          customers={customers}
          computeFinal={computeFinal}
          handleDownloadDueListPDF={handleDownloadDueListPDF}
          isGeneratingPDF={isGeneratingPDF}
          handlePrintDueList={handlePrintDueList}
          formatOrderId={formatOrderId}
          formatPhoneNumber={formatPhoneNumber}
        />
      )}
    </div>
  );
};

export default DueOrders;
