import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { Page } from '../types';
import { Printer, Download, ArrowLeft, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { downloadDataUri } from '../utils/downloads';
import { calculateOrderTotals, calculateItemTotal } from '../utils/orderUtils';

interface InvoiceProps {
    orderId: string;
    navigate: (page: Page) => void;
}

const Invoice: React.FC<InvoiceProps> = ({ orderId, navigate }) => {
    const context = useContext(AppContext);
    const [isSaving, setIsSaving] = useState(false);
    const hasAutoPrintedRef = useRef(false);

    if (!context) return <div>Loading...</div>;
    const { orders, customers, branches, isCloudMode, accessToken, getInvoiceUrl } = context;

    const order = orders.find(o => o.id === orderId);
    if (!order) return <div className="p-8 text-center text-red-500 font-bold text-lg">Order not found.</div>;

    const customer = customers.find(c => c.id === order.customerId);
    const resolvedCustomerName = order.customerName || customer?.name || 'Walk-in';
    const resolvedCustomerPhone = order.customerPhone || customer?.phone || '';
    const orderBranch = branches.find(branch => branch.id === order.branchId);
    const invoiceBranchAddress = order.branchAddress || orderBranch?.address || 'Zahira College Road, Kalmunai.';
    const invoiceBranchPhone = order.branchPhone || orderBranch?.phone || '067 434 1177';
    
    const formatPhoneNumber = (phone: string) => {
        if (!phone) return '';
    
    const formatPhoneNumber = (phone: string) => {
        if (!phone) return '';
        const cleaned = ('' + phone).replace(/\D/g, '');
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) return `${match[1]} ${match[2]} ${match[3]}`;
        return phone;
    };

    const totals = calculateOrderTotals(order);
    const itemsTotal = totals.itemsTotal;
    const discount = totals.discount;
    const grandTotal = totals.finalAmount;
    const totalPaid = totals.paid;
    const balance = totals.balance;

    const handlePrint = () => {
        window.print();
    };

    useEffect(() => {
        if (hasAutoPrintedRef.current) {
            return;
        }

        const pendingAutoPrintOrderId = sessionStorage.getItem('vip:autoPrintInvoiceOrderId');
        if (pendingAutoPrintOrderId !== order.id) {
            return;
        }

        hasAutoPrintedRef.current = true;
        sessionStorage.removeItem('vip:autoPrintInvoiceOrderId');

        const printTimer = window.setTimeout(() => {
            window.print();
        }, 0);

        return () => window.clearTimeout(printTimer);
    }, [order.id]);

    const handleDownloadPDF = async () => {
        const cloudInvoiceUrl = getInvoiceUrl(order.id);
        if (isCloudMode && cloudInvoiceUrl && accessToken) {
            setIsSaving(true);
            try {
                const response = await fetch(cloudInvoiceUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });

                if (!response.ok) {
                    throw new Error('Unable to download invoice PDF.');
                }

                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `${order.id}.pdf`;
                link.click();
                URL.revokeObjectURL(blobUrl);
                return;
            } catch (error) {
                console.warn('Falling back to client-side invoice download:', error);
            } finally {
                setIsSaving(false);
            }
        }

        const element = document.getElementById('thermal-receipt');
        if (!element || isSaving) return;

        setIsSaving(true);
        try {
            const canvas = await html2canvas(element, {
                scale: 3,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdfWidth = 80;
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]);

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const safeName = resolvedCustomerName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'customer';
            const filename = `${safeName}_receipt_${order.id}.pdf`;
            const pdfOutput = pdf.output('datauristring');

            downloadDataUri(filename, pdfOutput);
            alert('Receipt downloaded successfully.');
        } catch (error) {
            alert("Failed to generate PDF.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="pb-12 bg-gray-100 min-h-screen pt-6">
            <div className="mb-6 flex justify-between items-center print:hidden px-4 max-w-[80mm] mx-auto">
                <button onClick={() => navigate('Orders')} className="flex items-center text-gray-600 hover:text-indigo-600 transition-colors font-bold">
                    <ArrowLeft size={20} className="mr-2" /> Back
                </button>
                <div className="flex space-x-3">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={isSaving}
                        className="flex items-center px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                    <button onClick={handlePrint} className="flex items-center px-6 py-2 text-sm font-bold text-white bg-slate-900 rounded-lg shadow-md hover:bg-black">
                        <Printer size={16} className="mr-2" /> PRINT
                    </button>
                </div>
            </div>

            <div id="thermal-receipt" className="receipt-container mx-auto shadow-sm">
                <style>{`
                @media print {
                    @page { margin: 0; size: 80mm auto; }
                    body * { visibility: hidden; }
                    .receipt-container, .receipt-container * { visibility: visible; }
                    .receipt-container {
                        position: absolute !important;
                        left: 0 !important; top: 0 !important;
                        width: 72mm !important; /* Adjusted for printer margins */
                        padding: 2mm !important;
                        margin: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        box-sizing: border-box !important;
                    }
                }

                .receipt-container {
                    width: 72mm; /* Matches print width */
                    background: white;
                    color: black;
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    border: 1px solid #eee;
                    padding: 2mm;
                    line-height: 1.5;
                    box-sizing: border-box;
                    margin: 0 auto;
                }
                
                .solid-line { border-top: 1.5pt solid black; margin: 3mm 0; }
                .thin-line { border-top: 0.5pt solid black; margin: 2mm 0; }
                .bold { font-weight: 800; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .text-xs { font-size: 11px; }
                .text-sm { font-size: 14px; }
                .text-lg { font-size: 18px; }
                .text-xl { font-size: 20px; }
                .text-2xl { font-size: 24px; }
                .text-md { font-size: 16px; }
                .uppercase { text-transform: uppercase; }
                .flex { display: flex; }
                .flex-col { flex-direction: column; }
                .justify-between { justify-content: space-between; }
                .justify-center { justify-content: center; }
                .items-center { align-items: center; }
                .block { display: block; }
                .mt-1 { margin-top: 1mm; }
                .mt-2 { margin-top: 2mm; }
                .my-4 { margin-top: 4mm; margin-bottom: 4mm; }
                .w-25 { width: 25mm; }
                .h-25 { height: 25mm; }
                .object-contain { object-fit: contain; }
                .grand-total-section {
                    border: 1.5pt solid black;
                    padding: 2mm;
                    margin: 2mm 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            `}</style>

                {/* Receipt Header */}
                <div className="text-center">
                    <h1 className="text-lg bold uppercase">VIP Tailors & Fashion</h1>
                    <p className="text-xs mt-1">
                        {invoiceBranchAddress}<br />
                        <span className="bold block mt-1">Phone: {invoiceBranchPhone}</span>
                    </p>
                </div>

                <div className="solid-line"></div>

                {/* Order/Customer Info */}
                <div className="text-sm">
                    <div className="flex items-center justify-center mb-2 border-2 border-black p-1 bg-gray-50 rounded-sm">
                        <span className="bold text-2xl tracking-tighter">
                            {order.id.startsWith('ORD') && !order.id.includes('-') 
                                ? `ORD - ${order.id.substring(3)}` 
                                : order.id}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="bold">Date:</span>
                        <span>{order.orderDate}</span>
                    </div>
                    {order.dueDate && (
                        <div className="flex justify-between">
                            <span className="bold uppercase">Due Date:</span>
                            <span className="bold">{order.dueDate}</span>
                        </div>
                    )}

                    <div className="thin-line"></div>

                    <div className="flex justify-between">
                        <span className="bold">Customer:</span>
                        <span className="uppercase">{resolvedCustomerName}</span>
                    </div>
                    {resolvedCustomerPhone && (
                        <div className="flex justify-between">
                            <span className="bold">Phone:</span>
                            <span>{formatPhoneNumber(resolvedCustomerPhone)}</span>
                        </div>
                    )}
                </div>

                <div className="solid-line"></div>

                {/* Items List */}
                <div className="text-sm">
                    <div className="flex justify-between bold text-xs uppercase mb-1">
                        <span>Item Description</span>
                        <span>Total</span>
                    </div>
                    {order.items.map((item) => (
                        <div key={item.id} className="mb-2">
                            <div className="bold uppercase" style={{ fontSize: '12px' }}>{item.dressType} {item.clothName ? `(${item.clothName})` : ''}</div>
                            <div className="flex justify-between text-xs">
                                <span>{item.quantity} x {Math.round(calculateItemTotal({ ...item, quantity: 1 }))}</span>
                                <span className="bold">{Math.round(calculateItemTotal(item))}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="solid-line"></div>

                {/* Totals Section */}
                <div className="text-sm">
                    <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{itemsTotal}</span>
                    </div>
                    {discount > 0 && (
                        <div className="flex justify-between">
                            <span>Discount:</span>
                            <span>-{discount}</span>
                        </div>
                    )}

                    <div className="grand-total-section flex justify-between items-center">
                        <span className="bold uppercase text-sm">Net Total:</span>
                        <span className="bold text-lg">Rs. {grandTotal}</span>
                    </div>

                    <div className="space-y-1 mt-1">
                        {order.payments && order.payments.length > 0 ? (
                            order.payments.map((p) => (
                                <div key={p.id} className="flex justify-between text-xs">
                                    <span>Paid ({p.date}):</span>
                                    <span>{p.amount}</span>
                                </div>
                            ))
                        ) : (
                            (order.advance || 0) > 0 && (
                                <div className="flex justify-between text-xs">
                                    <span>Paid Advance:</span>
                                    <span>{(order.advance || 0)}</span>
                                </div>
                            )
                        )}
                        <div className="flex justify-between font-bold text-xs pt-1 border-t border-dashed border-gray-400">
                            <span>Total Received:</span>
                            <span>{totalPaid}</span>
                        </div>
                    </div>

                    <div className="flex justify-between bold border-t border-black pt-1 mt-2 text-md uppercase">
                        <span>Balance Due:</span>
                        <span>RS. {balance}</span>
                    </div>
                </div>

                <div className="solid-line"></div>

                <div className="flex flex-col items-center justify-center my-4">
                    <img 
                        src="/images/whatsapp_qr.jpeg" 
                        alt="WhatsApp QR Code"  
                        className="w-25 h-25 object-contain"
                    />
                    <p className="text-xs bold mt-1 text-center">Scan for WhatsApp</p>
                </div>

                <div className="thin-line"></div>

                <div className="text-center text-xs">
                    <p className="bold mt-2">Software By ARM.ASWIN - 0778514532</p>
                </div>
            </div>
        </div>
    );
};

export default Invoice;
