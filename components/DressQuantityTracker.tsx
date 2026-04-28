import React, { useState, useEffect } from 'react';
import { OrderItem, Customer, Order } from '../types';
import { CheckSquare, Square, Printer, X } from 'lucide-react';
import { printLabels, LabelData } from '../utils/labelPrinter';

interface DressQuantityTrackerProps {
  order: Order;
  customer?: Customer;
  onClose: () => void;
  onUpdate: (itemId: string, completedQuantity: number, status: 'pending' | 'partial' | 'completed', completionData: boolean[]) => void;
  onCompleteOrder: () => void;
}

const DressQuantityTracker: React.FC<DressQuantityTrackerProps> = ({
  order,
  customer,
  onClose,
  onUpdate,
  onCompleteOrder
}) => {

  // Track per-unit completion for each item
  const [itemCompletion, setItemCompletion] = useState<Record<string, boolean[]>>(() => {
    // Priority 1: Use existing data from order object if available
    const initial: Record<string, boolean[]> = {};
    order.items.forEach(item => {
      if (item.completionData && Array.isArray(item.completionData) && item.completionData.length === item.quantity) {
        initial[item.id] = [...item.completionData];
      } else {
        // Fallback to localStorage for migration/legacy (Optional, but safer for the user right now)
        const saved = localStorage.getItem(`order-completion-${order.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed[item.id] && parsed[item.id].length === item.quantity) {
            initial[item.id] = parsed[item.id];
            return;
          }
        }
        initial[item.id] = Array(item.quantity).fill(false);
      }
    });
    return initial;
  });

  // Auto-adjust checkboxes when item quantity changes, preserving existing state
  useEffect(() => {
    setItemCompletion(prev => {
      const updated: Record<string, boolean[]> = { ...prev };
      let hasChanges = false;

      order.items.forEach(item => {
        const prevArr = updated[item.id] || [];
        // Use completionData from order if available and consistent
        if (item.completionData && Array.isArray(item.completionData) && item.completionData.length === item.quantity) {
          // If local state is different from order state, sync it
          if (JSON.stringify(prevArr) !== JSON.stringify(item.completionData)) {
            updated[item.id] = [...item.completionData];
            hasChanges = true;
          }
          return;
        }

        // Standard length check adjustment
        if (prevArr.length !== item.quantity) {
          hasChanges = true;
          const newArr = Array(item.quantity).fill(false);
          // Copy existing states
          for (let i = 0; i < Math.min(prevArr.length, item.quantity); i++) {
            newArr[i] = prevArr[i];
          }
          updated[item.id] = newArr;
        } else if (!updated[item.id]) {
          // New item added to order
          hasChanges = true;
          updated[item.id] = Array(item.quantity).fill(false);
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [order.items]);

  // Persist to parent (which persists to DB) whenever itemCompletion changes
  useEffect(() => {
    if (Object.keys(itemCompletion).length > 0) {
      // We don't need localStorage anymore, but we'll keep a clean sync to parents
      // The handleToggleUnit already calls onUpdate, so this effect is mainly for initialization sync if needed
    }
  }, [itemCompletion, order.id]);


  // Calculate per-unit completion
  const totalUnits = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCompletedUnits = Object.values(itemCompletion).reduce((sum: number, arr) => {
    // Ensure arr is an array before filtering
    if (Array.isArray(arr)) {
      return sum + arr.filter(Boolean).length;
    }
    return sum;
  }, 0);

  const isAllComplete = totalCompletedUnits === totalUnits && totalUnits > 0;


  const handleToggleUnit = (itemId: string, idx: number) => {
    const newArr = [...(itemCompletion[itemId] || [])];
    newArr[idx] = !newArr[idx];

    // Immediate local update for UI snappy feel
    setItemCompletion(prev => ({ ...prev, [itemId]: newArr }));

    // Update parent with new completed count AND the full boolean array for DB storage
    const completedCount = newArr.filter(Boolean).length;
    let status: 'pending' | 'partial' | 'completed' = 'pending';
    if (completedCount === newArr.length && completedCount > 0) status = 'completed';
    else if (completedCount > 0) status = 'partial';

    onUpdate(itemId, completedCount, status, newArr);
  };


  const handlePrintLabel = () => {
    if (!customer) {
      alert('Customer details are required before printing labels.');
      return;
    }

    // Collect all labels to print in a single batch
    const labelsToPrint: LabelData[] = [];

    order.items.forEach(item => {
      const completedCount = (itemCompletion[item.id] || []).filter(Boolean).length;
      if (completedCount > 0) {
        labelsToPrint.push({
          orderId: order.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          dressType: item.dressType as string,
          quantity: completedCount
        });
      }
    });

    if (labelsToPrint.length === 0) {
      alert('Mark at least one completed unit before printing labels.');
      return;
    }

    const didOpenPrintDialog = printLabels(labelsToPrint);
    if (didOpenPrintDialog) {
      onCompleteOrder();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Order Track Status</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          <span className="font-bold">{customer?.name}</span> • Order: <span className="font-bold">{order.id}</span>
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Completed:</strong> {totalCompletedUnits}/{totalUnits} units
          </p>
          {isAllComplete && (
            <p className="text-sm text-green-600 mt-2 font-bold">✓ All items completed!</p>
          )}
        </div>


        <div className="bg-gray-50 rounded p-4 mb-4 overflow-y-auto max-h-[60vh]">
          <p className="text-sm font-bold mb-3">Mark each unit as complete:</p>
          <div className="space-y-6">
            {order.items.map((item) => (
              <div key={item.id} className="space-y-2">
                <span className="block font-bold text-xs uppercase text-gray-500 tracking-wider">{item.dressType}</span>
                <div className="flex flex-wrap gap-2">
                  {(itemCompletion[item.id] || []).map((checked, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleToggleUnit(item.id, idx)}
                      className={`w-9 h-9 flex items-center justify-center border-2 rounded-lg transition-all shadow-sm ${checked
                        ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-200'
                        : 'bg-white border-gray-200 text-gray-300 hover:border-indigo-300 hover:text-indigo-400'
                        }`}
                      aria-label={`Mark ${item.dressType} #${idx + 1} as complete`}
                    >
                      {checked ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePrintLabel}
            className="flex items-center justify-center flex-1 px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex-col gap-1 bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200"
          >
            <div className="flex items-center gap-2">
              <Printer size={20} />
              <span>Print Labels & Complete</span>
            </div>
          </button>
          <button
            onClick={onClose}
            className="px-8 py-4 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors font-bold shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DressQuantityTracker;
