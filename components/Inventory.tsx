import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { InventoryItem } from '../types';
import { PlusCircle, Edit, Trash2, Package, Download, Loader2, Printer, AlertCircle, Tag, X, Eye } from 'lucide-react';
import jsPDF from 'jspdf';
import AdminFilterBar from './AdminFilterBar';
import { downloadDataUri } from '../utils/downloads';
import JsBarcode from 'jsbarcode';

// Removed createInventoryCode since backend handles it
const InventoryForm: React.FC<{
  item?: InventoryItem;
  inventory: InventoryItem[];
  onSave: (item: InventoryItem) => Promise<void>;
  onCancel: () => void;
}> = ({ item, inventory, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Omit<InventoryItem, 'id'>>(
    item || {
      branchId: '',
      itemCode: '',
      barcodeValue: '',
      name: '',
      category: 'Material',
      quantity: 0,
      unitPrice: 0,
      mrp: 0,
      wholesalePrice: 0,
      lastUpdated: new Date().toISOString().split('T')[0],
    }
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const unitPrice = Number(formData.unitPrice || 0);
      await onSave({
        ...formData,
        id: item?.id || `INV${Date.now()}`,
        itemCode: formData.itemCode?.trim().toUpperCase() || '',
        barcodeValue: formData.barcodeValue?.trim() || '',
        mrp: formData.mrp || unitPrice,
        wholesalePrice: formData.wholesalePrice || unitPrice,
        isActive: formData.isActive !== false,
        lastUpdated: new Date().toISOString().split('T')[0],
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-8 shadow-2xl">
        <h2 className="border-b pb-4 text-xl font-bold text-gray-800">{item ? 'Edit Item' : 'Add New Item'}</h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Item Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
              <input
                type="text"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Quantity</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Unit Price (Rs.)</label>
              <input
                type="number"
                name="unitPrice"
                value={formData.unitPrice}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">MRP (Rs.)</label>
              <input
                type="number"
                name="mrp"
                value={formData.mrp}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Wholesale Price (Rs.)</label>
              <input
                type="number"
                name="wholesalePrice"
                value={formData.wholesalePrice}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Item Code (Leave empty to auto-generate)</label>
              <input
                type="text"
                name="itemCode"
                value={formData.itemCode || ''}
                onChange={handleChange}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="e.g. FAB0001"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Barcode (Optional)</label>
              <input
                type="text"
                name="barcodeValue"
                value={formData.barcodeValue || ''}
                onChange={handleChange}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="Scanner input here"
              />
            </div>
            <div className="flex items-center mt-6">
              <input
                type="checkbox"
                name="isActive"
                id="isActive"
                checked={formData.isActive !== false}
                onChange={handleChange}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                Active (Available for orders)
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-3 border-t pt-6">
            <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-700 disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Inventory: React.FC = () => {
  const context = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const [previewItem, setPreviewItem] = useState<InventoryItem | null>(null);

  /**
   * generateBarcodeSvg — uses JsBarcode on a detached SVG element to produce
   * a fully self-contained SVG string that does NOT depend on React or the DOM
   * being mounted. This is the core fix for the print reliability issue.
   */
  const generateBarcodeSvg = (value: string): string => {
    try {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svgEl, value, {
        format: 'CODE128',
        width: 1.8,
        height: 48,
        displayValue: true,
        fontSize: 11,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return svgEl.outerHTML;
    } catch {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><text x="10" y="30" font-size="10" fill="red">Invalid barcode</text></svg>';
    }
  };

  /**
   * buildLabelHtml — constructs a complete, self-contained HTML document for the
   * print window. Contains all CSS inline; no external dependencies.
   * Label spec: Item Code + Item Name + Barcode
   */
  const buildLabelHtml = (item: InventoryItem): string => {
    const barcodeValue = item.barcodeValue || item.itemCode || 'UNKNOWN';
    const svgContent = generateBarcodeSvg(barcodeValue);
    const itemName = item.name.length > 28 ? item.name.slice(0, 26) + '…' : item.name;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Label – ${item.itemCode}</title>
  <style>
    @page { size: 58mm 40mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 58mm;
      height: 40mm;
      font-family: Arial, Helvetica, sans-serif;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label {
      width: 58mm;
      padding: 2mm 3mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 1.5mm;
    }
    .item-code {
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #555;
      text-transform: uppercase;
    }
    .item-name {
      font-size: 11px;
      font-weight: bold;
      color: #000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 52mm;
    }
    svg {
      max-width: 52mm;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="item-code">${item.itemCode || ''}</div>
    <div class="item-name">${itemName}</div>
    ${svgContent}
  </div>
</body>
</html>`;
  };

  const handlePrintLabel = (item: InventoryItem) => {
    setPreviewItem(item);
  };

  const executePrint = (item: InventoryItem) => {
    const html = buildLabelHtml(item);
    const printWindow = window.open('', '_blank', 'width=320,height=260,toolbar=0,menubar=0,scrollbars=0');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print labels.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // Use setTimeout as a reliable cross-browser print trigger
    // (window.onload is inconsistent in Chromium for about:blank windows)
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // Delay close to allow print dialog to fully open
      setTimeout(() => {
        try { printWindow.close(); } catch { /* may already be closed by user */ }
      }, 1000);
    }, 250);
    setPreviewItem(null);
  };

  if (!context) return <div>Loading...</div>;
  const {
    inventory,
    saveInventoryItem,
    deleteInventoryItem,
    isAllBranchesScope,
    getBranchName,
  } = context;

  const handleSave = async (item: InventoryItem) => {
    try {
      await saveInventoryItem(item);
      setIsModalOpen(false);
      setEditingItem(undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save inventory item.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
      return;
    }
    try {
      await deleteInventoryItem(id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to delete inventory item.');
    }
  };

  const filteredInventory = useMemo(
    () =>
      inventory.filter((item) => {
        const search = searchTerm.toLowerCase().trim();
        if (!search) {
          return true;
        }
        return (
          item.name.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search)
        );
      }),
    [inventory, searchTerm]
  );

  const totalStockValue = useMemo(
    () => inventory.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [inventory]
  );

  const handleDownloadPDF = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;
      let yPos = 16;

      const ensurePage = (required: number) => {
        if (yPos + required > 285) {
          pdf.addPage();
          yPos = 16;
        }
      };

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text('INVENTORY REPORT', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 10;

      pdf.setFillColor(31, 41, 55);
      pdf.rect(margin, yPos, pageWidth - margin * 2, 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('Name', margin + 2, yPos + 6.5);
      pdf.text('Category', margin + 78, yPos + 6.5);
      pdf.text('Qty', margin + 128, yPos + 6.5);
      pdf.text('Price', margin + 144, yPos + 6.5);
      pdf.text('Updated', pageWidth - margin - 2, yPos + 6.5, { align: 'right' });
      yPos += 10;

      filteredInventory.forEach((item, index) => {
        ensurePage(9);
        if (index % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, yPos, pageWidth - margin * 2, 9, 'F');
        }
        pdf.setTextColor(31, 41, 55);
        pdf.setFont('helvetica', 'bold');
        pdf.text(item.name.length > 32 ? `${item.name.slice(0, 29)}...` : item.name, margin + 2, yPos + 6);
        pdf.setFont('helvetica', 'normal');
        pdf.text(item.category.length > 22 ? `${item.category.slice(0, 19)}...` : item.category, margin + 78, yPos + 6);
        pdf.text(String(item.quantity), margin + 128, yPos + 6);
        pdf.text(item.unitPrice.toFixed(2), margin + 144, yPos + 6);
        pdf.text(item.lastUpdated || '-', pageWidth - margin - 2, yPos + 6, { align: 'right' });
        yPos += 9;
      });

      const fileName = `Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfOutput = pdf.output('datauristring');

      downloadDataUri(fileName, pdfOutput);
      alert('Inventory report downloaded successfully.');
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Error saving inventory PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    const printContent = inventoryRef.current?.innerHTML;
    if (!printContent) {
      return;
    }
    const printWindow = window.open('', '', 'height=900,width=1200');
    if (!printWindow) {
      return;
    }
    printWindow.document.write('<html><head><title>Inventory Report</title>');
    printWindow.document.write(`
      <style>
        body { font-family: Arial, sans-serif; background: #fff; color: #111827; padding: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
        th { background: #f3f4f6; }
      </style>
    `);
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Inventory</h1>
        <div className="mt-4 flex space-x-3 sm:mt-0">
          <button onClick={handleDownloadPDF} disabled={isGenerating} className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-green-700 disabled:opacity-50">
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download size={18} className="mr-2" />}
            {isGenerating ? 'Saving...' : 'Stock PDF'}
          </button>
          <button onClick={() => { setEditingItem(undefined); setIsModalOpen(true); }} className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-700">
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-500">Total Stock Value</p>
            <p className="text-3xl font-bold text-gray-800">Rs. {totalStockValue.toLocaleString()}</p>
          </div>
          <div className="flex gap-4">
            <button onClick={handlePrint} className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <Printer size={20} />
            </button>
            <div className="rounded-full bg-indigo-100 p-4 text-indigo-600">
              <Package size={24} />
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-800">Low Stock Alerts (Below 5)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {inventory.filter((item) => item.quantity < 5).length > 0 ? (
              inventory.filter((item) => item.quantity < 5).map((item) => (
                <span key={item.id} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">
                  {item.name}: {item.quantity}
                </span>
              ))
            ) : (
              <p className="text-xs italic text-amber-600">No low stock items right now.</p>
            )}
          </div>
        </div>
      </div>

      <AdminFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name or category..."
      />

      <div className="space-y-4 md:hidden">
        {filteredInventory.length > 0 ? filteredInventory.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mt-1 text-lg font-bold text-slate-900">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500">{item.category}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="rounded-lg bg-blue-50 p-2 text-blue-600" title="Edit Item"><Edit size={18} /></button>
                <button onClick={() => void handleDelete(item.id)} className="rounded-lg bg-red-50 p-2 text-red-600" title="Delete Item"><Trash2 size={18} /></button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Quantity</p>
                <p className="mt-1 font-bold text-slate-900">{item.quantity}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Unit Price</p>
                <p className="mt-1 font-bold text-slate-900">Rs. {item.unitPrice.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm italic text-slate-400">
            No inventory items found.
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <div ref={inventoryRef} className="bg-white">
          <div className="hidden border-b p-8 print:block">
            <h1 className="text-2xl font-bold text-gray-800">Current Stock Inventory</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">Generated on: {new Date().toLocaleDateString()}</p>
            <div className="mt-4 inline-block rounded-lg border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Valuation</p>
              <p className="text-2xl font-bold text-indigo-600">Rs. {totalStockValue.toLocaleString()}</p>
            </div>
          </div>
          <table className="w-full text-left text-sm text-gray-500">
            <thead className="border-b bg-gray-50 text-xs font-bold uppercase text-gray-700">
              <tr>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Quantity</th>
                <th className="px-6 py-4">Unit Price</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInventory.map((item) => (
                <tr key={item.id} className="bg-white transition-colors hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900">{item.name}</td>
                  <td className="px-6 py-4">{item.category}</td>
                  <td className="px-6 py-4 font-medium">{item.quantity}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">Rs. {item.unitPrice.toFixed(2)}</td>
                  <td className="px-6 py-4 text-xs">
                    {item.isActive !== false ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-green-700 font-bold">Active</span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-red-700 font-bold">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 print:hidden">
                    <div className="flex justify-center space-x-2">
                      <button onClick={() => handlePrintLabel(item)} className="rounded-lg p-2 text-indigo-600 transition-colors hover:bg-indigo-50" title="Print Label"><Tag size={18} /></button>
                      <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50" title="Edit Item"><Edit size={18} /></button>
                      <button onClick={() => void handleDelete(item.id)} className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50" title="Delete Item"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={isAllBranchesScope ? 7 : 6} className="px-6 py-12 text-center italic text-gray-500">No inventory items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isModalOpen && <InventoryForm item={editingItem} inventory={inventory} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />}

      {/* ── Print Preview Modal ── */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-indigo-600" />
                <h2 className="text-base font-bold text-slate-800">Label Preview</h2>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Label Preview Area — mirrors the printed label layout */}
            <div className="flex flex-col items-center justify-center py-8 px-6 bg-slate-50">
              <div
                className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center gap-2 shadow-inner"
                style={{ width: 220, minHeight: 140 }}
              >
                {/* Item Code */}
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {previewItem.itemCode || '—'}
                </p>
                {/* Item Name */}
                <p className="text-sm font-bold text-slate-900 text-center leading-tight max-w-[190px] truncate">
                  {previewItem.name}
                </p>
                {/* Live Barcode Preview rendered via useEffect on canvas */}
                <BarcodePreview value={previewItem.barcodeValue || previewItem.itemCode || 'UNKNOWN'} />
                <p className="text-[9px] text-slate-400 font-mono">
                  {previewItem.barcodeValue || previewItem.itemCode}
                </p>
              </div>
              <p className="mt-3 text-xs text-slate-400 italic">Prints on 58mm × 40mm label</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => setPreviewItem(null)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => executePrint(previewItem)}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Printer size={15} /> Print Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Small helper component: renders a barcode into a canvas for preview */
const BarcodePreview: React.FC<{ value: string }> = ({ value }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !value) return;
    try {
      JsBarcode(canvasRef.current, value, {
        format: 'CODE128',
        width: 1.4,
        height: 36,
        displayValue: false,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      // If value is invalid, leave canvas blank
    }
  }, [value]);
  return <canvas ref={canvasRef} className="max-w-full" />;
};

export default Inventory;
