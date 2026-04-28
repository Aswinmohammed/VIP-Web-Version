import React from 'react';
import { MaterialSale } from '../types';
import { Printer, X } from 'lucide-react';

interface MaterialInvoiceModalProps {
    sale: MaterialSale;
    onClose: () => void;
}

const MaterialInvoiceModal: React.FC<MaterialInvoiceModalProps> = ({ sale, onClose }) => {
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300 print:bg-white print:p-0 print:block">
            <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 print:hidden">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-white shrink-0">
                    <h3 className="text-xl font-bold text-slate-800 uppercase italic tracking-tighter">Material Invoice</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm flex items-center hover:bg-black font-bold transition-all active:scale-95 shadow-lg shadow-slate-200"
                        >
                            <Printer size={16} className="mr-2" /> Print Invoice
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-500"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-gray-50 flex justify-center">
                    <div id="material-receipt" className="receipt-container shadow-xl rounded-sm">
                        <style>{`
              @media print {
                @page { margin: 0; size: 80mm auto; }
                body * { visibility: hidden; }
                #material-receipt, #material-receipt * { visibility: visible; }
                #material-receipt {
                  position: absolute !important;
                  left: 0 !important; top: 0 !important;
                  width: 72mm !important; /* Adjusted for printer margins */
                  padding: 2mm !important;
                  margin: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: white !important;
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
              .uppercase { text-transform: uppercase; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              
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
                            <h1 className="text-lg bold uppercase">VIP Tailors</h1>
                            <p className="text-xs">
                                Zahira College Road, Kalmunai.<br />
                                <span className="bold">☎️: 067 434 1177</span>
                            </p>
                        </div>

                        <div className="solid-line"></div>

                        {/* Sale Info */}
                        <div className="text-sm">
                            <div className="flex justify-between">
                                <span className="bold">Invoice No:</span>
                                <span>#{sale.id.slice(-8).toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="bold">Date:</span>
                                <span>{sale.date}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="bold">Type:</span>
                                <span>Material Sale</span>
                            </div>

                            <div className="thin-line"></div>

                            <div className="flex justify-between">
                                <span className="bold">Customer:</span>
                                <span className="uppercase text-right" style={{ maxWidth: '60%' }}>{sale.customerName || 'Walk-in Customer'}</span>
                            </div>
                        </div>

                        <div className="solid-line"></div>

                        {/* Items List */}
                        <div className="text-sm">
                            <div className="flex justify-between bold text-xs uppercase mb-1">
                                <span>Description</span>
                                <span>Amount</span>
                            </div>
                            {sale.items.map((item, idx) => (
                                <div key={idx} className="mb-2">
                                    <div className="bold uppercase" style={{ fontSize: '12px' }}>{item.category}</div>
                                    <div className="flex justify-between text-xs">
                                        <span>{item.quantity} x {item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        <span className="bold">{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="solid-line"></div>

                        {/* Totals Section */}
                        <div className="text-sm">
                            <div className="flex justify-between items-center mb-1 text-xs">
                                <span className="text-gray-500 uppercase">Sub Total:</span>
                                <span className="font-bold">Rs. {sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            {sale.discount && sale.discount > 0 && (
                                <div className="flex justify-between items-center mb-1 text-xs text-red-600">
                                    <span className="uppercase">Discount:</span>
                                    <span className="font-bold">- Rs. {sale.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center mb-1">
                                <span className="bold uppercase text-xs">Final Total:</span>
                                <span className="bold">Rs. {((sale.totalAmount || 0) - (sale.discount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="grand-total-section flex justify-between items-center bg-gray-50">
                                <span className="bold uppercase text-sm">Amount Paid:</span>
                                <span className="bold text-lg">Rs. {(sale.paidAmount !== undefined ? sale.paidAmount : ((sale.totalAmount || 0) - (sale.discount || 0))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>

                            {(((sale.totalAmount || 0) - (sale.discount || 0)) - (sale.paidAmount !== undefined ? sale.paidAmount : ((sale.totalAmount || 0) - (sale.discount || 0)))) > 0.01 && (
                                <div className="flex justify-between bold border-t border-black pt-1 mt-2 text-md uppercase">
                                    <span>Balance Due:</span>
                                    <span>Rs. {(((sale.totalAmount || 0) - (sale.discount || 0)) - (sale.paidAmount !== undefined ? sale.paidAmount : ((sale.totalAmount || 0) - (sale.discount || 0)))).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            <div className="flex justify-between text-[10px] mt-2 italic text-gray-400">
                                <span>Method:</span>
                                <span>{sale.paymentMethod || 'Cash'}</span>
                            </div>
                        </div>

                        <div className="solid-line"></div>

                        <div className="text-center text-xs">
                            <p className="bold mt-2 italic">Thank You for Your Business!</p>
                            <p className="mt-1">Software By ARM.ASWIN - 0778514532</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actual Print Content for the Browser */}
            <div className="hidden print:block">
                {/* The #material-receipt above handles this via visibility: visible */}
            </div>
        </div>
    );
};

export default MaterialInvoiceModal;
