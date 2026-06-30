
import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { Order, OrderItem, Measurement, Page, DEFAULT_MEASUREMENTS, DressType, Payment, Customer } from '../types';
import { PlusCircle, Trash2, Save, XCircle, Ruler, Calculator, FileText, Search, ChevronRight, ChevronDown, UserPlus, History, Clock, Scan, Scissors } from 'lucide-react';
import CustomerForm from './CustomerForm';
import { calculateOrderTotals } from '../utils/orderUtils';

interface OrderFormProps {
  orderId?: string | null;
  navigate: (page: Page, orderId?: string) => void;
}

interface MeasurementSuggestion {
  id: string;
  value: string;
}

interface MeasurementInputState {
  itemIndex: number;
  measIndex: number;
  isOpen: boolean;
  suggestions: MeasurementSuggestion[];
  selectedIndex: number;
}

const DRESS_HIERARCHY = [
  { label: 'Shirt', variants: ['Full Sleeve', 'Half Sleeve'] },
  { label: 'School Shirt' },
  { label: 'Trouser', variants: ['Official', 'Denim', 'Cut Model'] },
  { label: 'School Trouser' },
  { label: 'Thobe' },
  { label: 'Kurta' },
  { label: 'Thobe with pajama' },
  { label: 'Jubba' },
  { label: 'Jubba with pajama' },
  { label: 'Coat' },
  { label: 'Waist Coat' },
  { label: 'Bow' },
  { label: 'Elastic Trouser' },
  { label: 'Elastic Shorts' },
  { label: 'Band Shorts' }
];

function toOrderPrefix(branchCode?: string, isProductionHub?: boolean): string {
  if (isProductionHub) {
    return 'ORD-';
  }

  const normalizedCode = (branchCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return normalizedCode ? `${normalizedCode}-ORD-` : 'ORD-';
}

function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function parseFlexibleNumber(value: string): number {
  const normalized = value
    .replace('¼', '.25')
    .replace('½', '.5')
    .replace('¾', '.75')
    .replace('Â¼', '.25')
    .replace('Â½', '.5')
    .replace('Â¾', '.75')
    .trim();
  return parseFloat(normalized) || 0;
}

const OrderForm: React.FC<OrderFormProps> = ({ orderId, navigate }) => {
  const context = useContext(AppContext);
  const { customers, orders, inventory, activeBranchId, currentUser, currentBranch, settings, setSettings, saveCustomer, saveOrder, canUseOrderAction, isAllBranchesScope } = context!;
  const canManageProductionStatuses = isAllBranchesScope || currentBranch?.isProductionHub || canUseOrderAction('track_completion');
  const blockedStatusValues: Order['status'][] = ['In Progress', 'Completed', 'Packed'];
  const persistedOrder = orderId ? orders.find((existing) => existing.id === orderId) || null : null;
  const availableStatusOptions: Array<{ value: Order['status']; label: string; disabled?: boolean }> = [
    { value: 'Pending', label: 'Pending' },
    { value: 'Hold', label: 'Hold' },
    { value: 'Due', label: 'Due' },
    { value: 'Delivered', label: 'Delivered' },
  ];

  if (canManageProductionStatuses) {
    availableStatusOptions.splice(1, 0,
      { value: 'In Progress', label: 'In Progress' },
      { value: 'Completed', label: 'Completed' },
      { value: 'Packed', label: 'Packed' },
    );
  } else if (persistedOrder && blockedStatusValues.includes(persistedOrder.status)) {
    availableStatusOptions.splice(1, 0, {
      value: persistedOrder.status,
      label: `${persistedOrder.status} (Main Branch Controlled)`,
      disabled: true,
    });
  }

  const initialOrderState: Order = {
    id: '',
    branchId: activeBranchId === 'all' ? currentUser?.branchId || '' : activeBranchId,
    customerId: '',
    orderDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    status: 'Pending',
    items: [{ id: createClientId('ITEM'), dressType: '', inventoryItemId: '', clothCode: '', clothName: '', clothSize: 0, stitchFee: 0, quantity: 1, pricePerUnit: 0, measurements: [], note: '' }],
    discount: 0,
    advance: 0,
    payments: [],
    emergency: false
  };

  const [order, setOrder] = useState<Order>(initialOrderState);
  // Removed showEmergencyDropdown and emergencyType/reason
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState<number | null>(null);
  const [activeInventoryDropdownIndex, setActiveInventoryDropdownIndex] = useState<number | null>(null);
  const [inventorySearchTerms, setInventorySearchTerms] = useState<Record<number, string>>({});
  const [scanSuccessIndex, setScanSuccessIndex] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [newPayment, setNewPayment] = useState<{ amount: string, date: string, method: 'Cash' | 'Card' | 'Bank Transfer' }>({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Cash'
  });

  const [historicalMeasurements, setHistoricalMeasurements] = useState<Record<string, { measurements: Measurement[], note?: string }>>({});

  const [measurementInput, setMeasurementInput] = useState<MeasurementInputState>({
    itemIndex: -1,
    measIndex: -1,
    isOpen: false,
    suggestions: [],
    selectedIndex: 0
  });
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const measurementSuggestionsRef = useRef<HTMLDivElement>(null);
  const hydratedOrderIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);

  const markDirty = () => {
    isDirtyRef.current = true;
  };

  useEffect(() => {
    if (!orderId) {
      hydratedOrderIdRef.current = null;
      isDirtyRef.current = false;
      return;
    }

    const existingOrder = orders.find(o => o.id === orderId);
    if (!existingOrder) {
      return;
    }

    const shouldHydrate = hydratedOrderIdRef.current !== existingOrder.id || !isDirtyRef.current;
    if (!shouldHydrate) {
      return;
    }

    let currentPayments = existingOrder.payments || [];
    if (currentPayments.length === 0 && (existingOrder.advance || 0) > 0) {
      currentPayments = [{
        id: createClientId('PAY'),
        branchId: existingOrder.branchId,
        collectorId: currentUser?.id || 'SYSTEM',
        amount: existingOrder.advance || 0,
        date: existingOrder.orderDate,
        method: 'Cash',
        note: 'Initial Advance (Migrated)'
      }];
    }

    setOrder({
      ...existingOrder,
      discount: existingOrder.discount || 0,
      advance: existingOrder.advance || 0,
      payments: currentPayments
    });
    hydratedOrderIdRef.current = existingOrder.id;
    isDirtyRef.current = false;

    const cust = customers.find(c => c.id === existingOrder.customerId);
    if (cust) setCustomerSearch(cust.name);
  }, [orderId, orders, customers, currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
      // Close custom dress type dropdowns
      if (!(event.target as HTMLElement).closest('.dress-type-dropdown')) {
        setActiveDropdownIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (measurementSuggestionsRef.current && !measurementSuggestionsRef.current.contains(event.target as Node)) {
        setMeasurementInput(prev => ({ ...prev, isOpen: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name === 'status' && !canManageProductionStatuses && blockedStatusValues.includes(value as Order['status'])) {
      return;
    }
    markDirty();
    setOrder(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const filteredResults = useMemo(() => {
    const scopedCustomers = currentBranch?.isProductionHub && order.branchId
      ? customers.filter((customer) => customer.branchId === order.branchId)
      : customers;
    const baseCustomers = [...scopedCustomers].reverse();
    const search = customerSearch.toLowerCase().trim();
    
    // Normalize string by removing dashes and extra spaces
    const normalizedSearch = search.replace(/[- ]/g, '');
    
    // Detect if search looks like an Order ID (startsWith 'ord')
    const isOrderIdSearch = normalizedSearch.startsWith('ord');
    let matchingOrders: Order[] = [];
    
    if (isOrderIdSearch && normalizedSearch.length >= 3) {
      matchingOrders = orders.filter(o => 
        o.id.toLowerCase().replace(/[- ]/g, '').includes(normalizedSearch)
      ).slice(0, 8);
    }

    const filteredCusts = !customerSearch ? baseCustomers : baseCustomers.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.phone.includes(search)
    );

    return {
      customers: filteredCusts,
      matchingOrders
    };
  }, [currentBranch?.isProductionHub, customerSearch, customers, order.branchId, orders]);


  const loadOrderDetails = (oldOrder: Order) => {
    const customer = customers.find(c => c.id === oldOrder.customerId);
    if (!customer) return;

    // Deep clone items with fresh IDs but same measurements, quantities, and prices
    const clonedItems: OrderItem[] = oldOrder.items.map(item => ({
      ...item,
      id: createClientId('ITEM'),
      measurements: item.measurements.map(m => ({
        ...m,
        id: createClientId('MEAS'),
      })),
      isCut: false,
      completedQuantity: 0,
      completionStatus: 'pending',
      completionData: []
    }));

    markDirty();
    setOrder(prev => ({
      ...prev,
      customerId: oldOrder.customerId,
      items: clonedItems,
      status: 'Pending', // New order is always Pending
      discount: oldOrder.discount || 0,
      advance: 0,
      payments: []
    }));
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  const selectCustomer = (customer: Customer) => {
    const newCustomerId = customer.id;
    markDirty();
    setOrder(prev => ({ ...prev, customerId: newCustomerId }));
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);

    const customerOrders = orders
      .filter(o => o.customerId === newCustomerId)
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

    if (customerOrders.length > 0) {
      const lastOrder = customerOrders[0];
      if (window.confirm(`This customer has a previous order. Would you like to load its details into this new form for faster processing?`)) {
        loadOrderDetails(lastOrder);
      }
    }
  };

  const handleSaveCustomer = async (customer: Customer) => {
    try {
      const savedCustomer = await saveCustomer({
        ...customer,
        id: customer.id || createClientId('CUST'),
        branchId: order.branchId || (activeBranchId === 'all' ? currentUser?.branchId || '' : activeBranchId),
      });
      markDirty();
      setOrder(prev => ({ ...prev, customerId: savedCustomer.id }));
      setCustomerSearch(savedCustomer.name);
      setIsCustomerModalOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save customer.');
    }
  };

  const setDressTypeDirectly = (itemIndex: number, type: string) => {
    markDirty();
    const newItems = [...order.items];
    const item = newItems[itemIndex];
    const dressType = type as DressType;
    item.dressType = dressType;
    item.inventoryItemId = '';
    item.clothCode = '';
    item.clothName = '';
    item.clothSize = 0;
    item.stitchFee = 0;
    item.pricePerUnit = 0;

    // Normalize for matching: remove variant in parentheses and lowercase
    const normalize = (str: string) => str.replace(/\s*\(.*\)\s*/, '').toLowerCase();
    const normalizedType = normalize(dressType);
    let matchedKey = Object.keys(historicalMeasurements).find(key => normalize(key) === normalizedType);

    if (matchedKey) {
      const histData = historicalMeasurements[matchedKey];
      item.measurements = histData.measurements.map(m => ({ ...m, id: createClientId('MEAS') }));
      item.note = histData.note || '';
    } else {
      item.measurements = DEFAULT_MEASUREMENTS[dressType]?.map(m => ({ ...m, id: createClientId('MEAS') })) || [];
    }

    // Ensure at least 8 measurement boxes
    while (item.measurements.length < 8) {
      item.measurements.push({ id: createClientId('MEAS'), name: '', value: '' });
    }

    setOrder(prev => ({ ...prev, items: newItems }));
    setActiveDropdownIndex(null);
  };

  const handleItemChange = (index: number, e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    markDirty();
    const newItems = [...order.items];
    const item = newItems[index];

    newItems[index] = { ...newItems[index], [name]: value };

    if (name === 'inventoryItemId') {
      const selectedItem = inventory.find(i => i.id === value);
      if (selectedItem) {
        newItems[index].pricePerUnit = selectedItem.wholesalePrice || selectedItem.mrp || selectedItem.unitPrice || 0;
      }
    } else if (name === 'quantity' || name === 'clothSize' || name === 'pricePerUnit' || name === 'stitchFee') {
        // @ts-ignore
        newItems[index][name] = parseFlexibleNumber(value);
    }
    setOrder(prev => ({ ...prev, items: newItems }));
  };

  const handleInventorySearch = (index: number, term: string) => {
    setInventorySearchTerms(prev => ({ ...prev, [index]: term }));
    setActiveInventoryDropdownIndex(index);
  };

  const selectInventoryItem = (index: number, invItem: any) => {
    const newItems = [...order.items];
    newItems[index] = {
      ...newItems[index],
      inventoryItemId: invItem.id,
      clothName: invItem.name,
      pricePerUnit: invItem.wholesalePrice || invItem.mrp || invItem.unitPrice || 0
    };
    setOrder(prev => ({ ...prev, items: newItems }));
    setActiveInventoryDropdownIndex(null);
    setInventorySearchTerms(prev => ({ ...prev, [index]: '' }));
  };

  const handleBarcodeScan = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = e.currentTarget.value.trim().toUpperCase();
      if (!code) return;
      // Search by barcodeValue, itemCode (exact match, case-insensitive)
      const matchedItem = inventory.find(i =>
        i.barcodeValue?.toUpperCase() === code ||
        i.itemCode?.toUpperCase() === code
      );
      if (matchedItem) {
        selectInventoryItem(index, matchedItem);
        // Clear the barcode field and flash success
        e.currentTarget.value = '';
        setScanSuccessIndex(index);
        setTimeout(() => setScanSuccessIndex(null), 1500);
      } else {
        alert(`Item not found: "${code}". Check the item code or barcode value in Inventory.`);
      }
    }
  };

  const handleMeasurementChange = (itemIndex: number, measIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    markDirty();
    const newItems = [...order.items];
    newItems[itemIndex].measurements[measIndex] = { ...newItems[itemIndex].measurements[measIndex], [name]: value };
    setOrder(prev => ({ ...prev, items: newItems }));

    if (name === 'value' && value.trim() !== '') {
      const suggestions = generateMeasurementSuggestions(value);
      if (suggestions.length > 0) {
        setMeasurementInput({ itemIndex, measIndex, isOpen: true, suggestions, selectedIndex: 0 });
      } else {
        setMeasurementInput(prev => ({ ...prev, isOpen: false }));
      }
    } else {
      setMeasurementInput(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleMeasurementKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, itemIndex: number, measIndex: number) => {
    if (!measurementInput.isOpen) {
      const currentValue = order.items[itemIndex].measurements[measIndex].value;
      if (currentValue && e.key !== 'Tab' && e.key !== 'Enter') {
        const suggestions = generateMeasurementSuggestions(currentValue);
        if (suggestions.length > 0 && e.key !== 'Escape') {
          setMeasurementInput({ itemIndex, measIndex, isOpen: true, suggestions, selectedIndex: 0 });
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setMeasurementInput(prev => ({ ...prev, selectedIndex: (prev.selectedIndex + 1) % prev.suggestions.length }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setMeasurementInput(prev => ({ ...prev, selectedIndex: prev.selectedIndex === 0 ? prev.suggestions.length - 1 : prev.selectedIndex - 1 }));
        break;
      case 'Tab':
      case 'Enter':
        e.preventDefault();
        const suggestion = measurementInput.suggestions[measurementInput.selectedIndex];
        if (suggestion) {
          markDirty();
          const newItems = [...order.items];
          newItems[itemIndex].measurements[measIndex].value = suggestion.value;
          setOrder(prev => ({ ...prev, items: newItems }));
          setMeasurementInput(prev => ({ ...prev, isOpen: false }));
          if (e.key === 'Tab') {
            const nextInput = document.querySelector(`[data-measurement-next="${itemIndex}-${measIndex}"]`) as HTMLElement;
            if (nextInput) setTimeout(() => nextInput.focus(), 0);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        setMeasurementInput(prev => ({ ...prev, isOpen: false }));
        break;
    }
  };

  const selectMeasurementSuggestion = (itemIndex: number, measIndex: number, suggestion: MeasurementSuggestion) => {
    markDirty();
    const newItems = [...order.items];
    newItems[itemIndex].measurements[measIndex].value = suggestion.value;
    setOrder(prev => ({ ...prev, items: newItems }));
    setMeasurementInput(prev => ({ ...prev, isOpen: false }));
  };

  const addItem = () => {
    const newItem: OrderItem = { id: createClientId('ITEM'), dressType: '', inventoryItemId: '', clothCode: '', clothName: '', clothSize: 0, stitchFee: 0, quantity: 1, pricePerUnit: 0, measurements: [], note: '' };
    markDirty();
    setOrder(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const removeItem = (index: number) => {
    markDirty();
    setOrder(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const addMeasurement = (itemIndex: number) => {
    const newMeasurement: Measurement = { id: createClientId('MEAS'), name: '', value: '' };
    const newItems = [...order.items];
    newItems[itemIndex].measurements.push(newMeasurement);
    markDirty();
    setOrder(prev => ({ ...prev, items: newItems }));
  };

  const removeMeasurement = (itemIndex: number, measIndex: number) => {
    const newItems = [...order.items];
    newItems[itemIndex].measurements = newItems[itemIndex].measurements.filter((_, i) => i !== measIndex);
    markDirty();
    setOrder(prev => ({ ...prev, items: newItems }));
  };

  const generateMeasurementSuggestions = (baseValue: string): MeasurementSuggestion[] => {
    const num = parseFlexibleNumber(baseValue);
    if (isNaN(num) || num <= 0) return [];
    // Always show the actual input value as the first suggestion
    const suggestions: MeasurementSuggestion[] = [
      { id: `actual-${num}`, value: baseValue }
    ];
    // Add fractional suggestions with unicode characters
    suggestions.push(
      { id: `quarter-${num}`, value: `${num}¼` },
      { id: `half-${num}`, value: `${num}½` },
      { id: `threequarter-${num}`, value: `${num}¾` }
    );
    return suggestions;
  };

  const handleAddPayment = () => {
    const amount = parseFloat(newPayment.amount);
    if (!amount || amount <= 0) return;
    const payment: Payment = {
      id: createClientId('PAY'),
      branchId: order.branchId,
      collectorId: currentUser?.id || 'SYSTEM',
      amount: amount,
      date: newPayment.date,
      method: newPayment.method
    };
    const updatedPayments = [...(order.payments || []), payment];
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
    markDirty();
    setOrder(prev => ({ ...prev, payments: updatedPayments, advance: totalPaid }));
    setNewPayment({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Cash' });
  };

  const handleRemovePayment = (paymentId: string) => {
    const updatedPayments = (order.payments || []).filter(p => p.id !== paymentId);
    const totalPaid = updatedPayments.reduce((sum, p) => sum + p.amount, 0);
    markDirty();
    setOrder(prev => ({ ...prev, payments: updatedPayments, advance: totalPaid }));
  };

  const handleHoldSubmit = async () => {
    if (!order.customerId) {
      alert("Please select a customer before putting the order on hold.");
      return;
    }

    if (!order.branchId && activeBranchId === 'all' && currentUser?.role === 'master_admin') {
      alert('Select a branch before holding this order.');
      return;
    }

    const finalTotalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);

    let finalOrder = {
      ...order,
      branchId: order.branchId || (activeBranchId === 'all' ? currentUser?.branchId || '' : activeBranchId),
      items: order.items,
      advance: finalTotalPaid,
      status: 'Hold' as Order['status'],
    };

    if (!orderId) {
      const branchCodePrefix = toOrderPrefix(currentBranch?.code, currentBranch?.isProductionHub);
      const usedNumbers = new Set(
        orders
          .map(o => o.id)
          .filter(id => id.startsWith(branchCodePrefix))
          .map(id => {
            const numPart = id.replace(branchCodePrefix, '');
            return parseInt(numPart, 10);
          })
          .filter(num => !isNaN(num))
      );
      let nextNum = 1;
      while (usedNumbers.has(nextNum)) {
        nextNum++;
      }
      const formattedId = `${branchCodePrefix}${String(nextNum).padStart(4, '0')}`;
      if (orders.some(o => o.id === formattedId)) {
        alert('Error: Duplicate Order ID detected. Please try again.');
        return;
      }
      finalOrder = { ...finalOrder, id: formattedId };
      setSettings(prev => ({ ...prev, lastOrderNumber: Math.max(prev.lastOrderNumber || 0, nextNum) }));
    }

    try {
      await saveOrder(finalOrder);
      alert('Order successfully put on Hold!');
      
      if (orderId) {
        navigate('Orders');
      } else {
        setOrder(initialOrderState);
        setCustomerSearch('');
        setNewPayment({ amount: '', date: new Date().toISOString().split('T')[0], method: 'Cash' });
        isDirtyRef.current = false;
        window.scrollTo(0, 0);
      }
    } catch (error) {
      console.error('Hold order failed:', error);
      const message = error instanceof Error ? error.message : 'Unable to hold order.';
      // Surface the actual server error for debugging
      if (message.includes('500') || message.toLowerCase().includes('internal server error')) {
        alert(`Server Error: The "Hold" status may not be configured in the database. Please contact your administrator to run the Hold migration.\n\nTechnical details: ${message}`);
      } else {
        alert(message);
      }
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order.customerId) {
      alert("Please select a customer.");
      return;
    }

    if (!order.branchId && activeBranchId === 'all' && currentUser?.role === 'master_admin') {
      alert('Select a branch before saving this order.');
      return;
    }

    const finalTotalPaid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const resolvedStatus: Order['status'] =
      !canManageProductionStatuses && blockedStatusValues.includes(order.status)
        ? persistedOrder?.status && blockedStatusValues.includes(persistedOrder.status)
          ? persistedOrder.status
          : 'Pending'
        : order.status;

    let finalOrder = {
      ...order,
      branchId: order.branchId || (activeBranchId === 'all' ? currentUser?.branchId || '' : activeBranchId),
      items: order.items,
      advance: finalTotalPaid,
      status: resolvedStatus,
    };

    if (!orderId) {
      const branchCodePrefix = toOrderPrefix(currentBranch?.code, currentBranch?.isProductionHub);
      const usedNumbers = new Set(
        orders
          .map(o => o.id)
          .filter(id => id.startsWith(branchCodePrefix))
          .map(id => {
            const numPart = id.replace(branchCodePrefix, '');
            return parseInt(numPart, 10);
          })
          .filter(num => !isNaN(num))
      );
      let nextNum = 1;
      while (usedNumbers.has(nextNum)) {
        nextNum++;
      }
      const formattedId = `${branchCodePrefix}${String(nextNum).padStart(4, '0')}`;
      if (orders.some(o => o.id === formattedId)) {
        alert('Error: Duplicate Order ID detected. Please try again.');
        return;
      }
      finalOrder = { ...finalOrder, id: formattedId };

      setSettings(prev => ({ ...prev, lastOrderNumber: Math.max(prev.lastOrderNumber || 0, nextNum) }));
    }

    try {
      const savedOrder = await saveOrder(finalOrder);
      sessionStorage.setItem('vip:autoPrintInvoiceOrderId', savedOrder.id);
      navigate('Invoice', savedOrder.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save order.');
    }
  };

  const { itemsTotal: grandTotal, finalAmount: roundedFinalAmount, paid: totalPaid, balance } = useMemo(() => {
    return calculateOrderTotals(order);
  }, [order]);

  const totalStitchFee = useMemo(() => {
    return order.items.reduce((sum, item) => sum + ((item.stitchFee || 0) * (item.quantity || 1)), 0);
  }, [order.items]);

  return (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md">
      <div className="mb-4 flex gap-4">
        <button
          type="button"
          className="px-4 py-2 bg-red-600 text-white rounded font-bold shadow hover:bg-red-700 transition-colors"
          onClick={() => {
            markDirty();
            setOrder(prev => ({ ...prev, emergency: !prev.emergency }));
          }}
        >
          {order.emergency ? 'Emergency Order Active' : 'Mark as Emergency'}
        </button>
      </div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">{orderId ? 'Edit Order' : 'Create New Order'}</h1>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="p-6 border rounded-lg space-y-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Order Details</h2>
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md shadow-sm hover:bg-primary-700 transition-all hover:scale-105 active:scale-95"
            >
              <UserPlus className="w-5 h-5 mr-2" /> Add Customer
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="relative" ref={dropdownRef}>
              <label className="block text-sm font-medium text-gray-700">Search Customer</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Type name or phone..."
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
                <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
              </div>
              {showCustomerDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-72 overflow-auto shadow-indigo-500/10">
                  {/* Order Results First (Priority) */}
                  {filteredResults.matchingOrders.length > 0 && (
                    <div className="bg-white">
                      {filteredResults.matchingOrders.map(o => (
                        <div key={o.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 group flex flex-col" onClick={() => loadOrderDetails(o)}>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#2563eb] text-[15px] tracking-tight">{o.id}</span>
                              <span className="bg-[#dbeafe] text-[#1d4ed8] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter">ORDER</span>
                            </div>
                            <span className="text-xs text-slate-400 mt-0.5 w-10 text-right leading-tight">{o.orderDate}</span>
                          </div>
                          <p className="text-[13px] text-slate-600 font-bold mt-1">Cust: {customers.find(c => c.id === o.customerId)?.name || 'Unknown'}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {o.items.slice(0, 3).map((item, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-500 font-medium text-[11px] px-2 py-0.5 rounded-md border border-slate-200">
                                {(item.dressType as string)?.split(' ')[0] || 'Item'}
                              </span>
                            ))}
                            {o.items.length > 3 && (
                              <span className="text-slate-400 text-[11px] font-medium py-0.5 pl-1">
                                +{o.items.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Customer Results */}
                  {filteredResults.customers.length > 0 ? (
                    <div>
                      {filteredResults.matchingOrders.length > 0 && (
                        <div className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 border-y border-slate-100">
                          Customers
                        </div>
                      )}
                      {filteredResults.customers.map(c => (
                        <div key={c.id} className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-50 last:border-0" onClick={() => selectCustomer(c)}>
                          <p className="font-bold text-gray-800">{c.name}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1.5">
                            <Clock size={10} /> {c.phone}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : filteredResults.matchingOrders.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-gray-400 italic">No matches found</div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Order Date</label>
              <input type="date" name="orderDate" value={order.orderDate} onChange={handleOrderChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date</label>
              <input type="date" name="dueDate" value={order.dueDate} onChange={handleOrderChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select name="status" value={order.status} onChange={handleOrderChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3">
                {availableStatusOptions.map((statusOption) => (
                  <option key={statusOption.value} value={statusOption.value} disabled={statusOption.disabled}>
                    {statusOption.label}
                  </option>
                ))}
              </select>
              {!canManageProductionStatuses && (
                <p className="mt-2 text-xs font-medium text-amber-600">
                  Production statuses are controlled by the main branch.
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Items & Measurements</h2>
          <div className="space-y-4">
            {order.items.map((item, itemIndex) => (
              <div key={item.id} className="border border-gray-200 rounded-lg overflow-visible shadow-sm">
                <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex-none font-bold text-gray-500 mr-2">#{itemIndex + 1}</div>

                  {/* Custom Dress Type Dropdown with Hover Sub-menus */}
                  <div className="flex-1 min-w-[200px] relative dress-type-dropdown">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Dress Type</label>
                    <button
                      type="button"
                      onClick={() => setActiveDropdownIndex(activeDropdownIndex === itemIndex ? null : itemIndex)}
                      className="w-full text-left bg-white border border-gray-300 rounded-md py-1.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-500 flex justify-between items-center"
                    >
                      <span className={item.dressType ? 'text-gray-900 font-semibold' : 'text-gray-400 italic'}>
                        {item.dressType || 'Select Dress Type'}
                      </span>
                      <ChevronDown size={14} className="text-gray-400" />
                    </button>

                    {activeDropdownIndex === itemIndex && (
                      <div className="absolute z-50 left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-2xl overflow-visible">
                        <div className="py-1">
                          {DRESS_HIERARCHY.map((cat, catIdx) => (
                            <div key={catIdx} className="relative group">
                              <button
                                type="button"
                                onClick={() => !cat.variants && setDressTypeDirectly(itemIndex, cat.label)}
                                className="w-full flex items-center justify-between px-4 py-2 text-sm font-bold text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                              >
                                <span>{cat.label}</span>
                                {cat.variants && <ChevronRight size={14} className="text-gray-400" />}
                              </button>

                              {cat.variants && (
                                <div className="absolute left-full top-0 ml-0.5 w-48 bg-white border border-gray-200 rounded-lg shadow-xl hidden group-hover:block animate-in fade-in slide-in-from-left-2 duration-150">
                                  <div className="py-1">
                                    {cat.variants.map((v, vIdx) => (
                                      <button
                                        key={vIdx}
                                        type="button"
                                        onClick={() => setDressTypeDirectly(itemIndex, `${cat.label} (${v})`)}
                                        className="w-full text-left px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                      >
                                        {v}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Material / Cloth Search + Barcode Scanner */}
                  <div className="min-w-[240px] flex-1 relative inventory-dropdown">
                    <label className="mb-1 block text-xs font-medium text-gray-500">Cloth / Material</label>
                    <div className="flex flex-col gap-1">
                      {/* Barcode Scanner Row */}
                      <div className="relative flex items-center">
                        <span className="absolute left-2 text-gray-400 pointer-events-none">
                          <Scan size={13} />
                        </span>
                        <input
                          type="text"
                          name="barcodeScan"
                          placeholder="Scan barcode & press Enter..."
                          onKeyDown={e => handleBarcodeScan(itemIndex, e)}
                          className={`block w-full rounded-md border py-1 pl-7 pr-3 text-xs transition-all duration-300 focus:outline-none focus:ring-1 ${
                            scanSuccessIndex === itemIndex
                              ? 'border-green-500 bg-green-50 ring-green-400 text-green-700 font-bold'
                              : 'border-gray-300 bg-gray-50 focus:border-indigo-400 focus:ring-indigo-300'
                          }`}
                          title="Focus here, then scan barcode with scanner. Press Enter to confirm."
                        />
                        {scanSuccessIndex === itemIndex && (
                          <span className="absolute right-2 text-green-600 text-xs font-bold animate-pulse">✓ Found!</span>
                        )}
                      </div>
                      {/* Text Search Row */}
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-gray-400 pointer-events-none">
                          <Search size={13} />
                        </span>
                        <input
                          type="text"
                          name="clothName"
                          value={activeInventoryDropdownIndex === itemIndex ? (inventorySearchTerms[itemIndex] ?? '') : (item.clothName || '')}
                          onChange={e => {
                            handleItemChange(itemIndex, e);
                            handleInventorySearch(itemIndex, e.target.value);
                          }}
                          onFocus={() => handleInventorySearch(itemIndex, item.clothName || '')}
                          placeholder="Search by name or item code..."
                          className="block w-full rounded-md border border-gray-300 py-1 pl-7 pr-3 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 focus:outline-none"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    {activeInventoryDropdownIndex === itemIndex && (
                      <div className="absolute z-50 left-0 top-full mt-1 w-full max-h-52 overflow-y-auto bg-white border border-indigo-200 rounded-lg shadow-xl">
                        {(() => {
                          const searchTerm = (inventorySearchTerms[itemIndex] || '').toLowerCase().trim();
                          const filtered = inventory
                            .filter(inv => inv.isActive !== false)
                            .filter(inv => !searchTerm ||
                              inv.name.toLowerCase().includes(searchTerm) ||
                              inv.itemCode?.toLowerCase().includes(searchTerm) ||
                              inv.barcodeValue?.toLowerCase().includes(searchTerm)
                            )
                            .slice(0, 12);
                          if (inventory.length === 0) return (
                            <div className="px-3 py-4 text-center text-xs text-gray-500 italic">No inventory items available. Add items in the Inventory module.</div>
                          );
                          if (filtered.length === 0) return (
                            <div className="px-3 py-4 text-center text-xs text-gray-500 italic">No match for "{searchTerm}"</div>
                          );
                          return filtered.map(inv => (
                            <div
                              key={inv.id}
                              onClick={() => selectInventoryItem(itemIndex, inv)}
                              className="px-3 py-2 cursor-pointer hover:bg-indigo-50 border-b border-gray-50 last:border-0 group"
                            >
                              <div className="text-sm font-bold text-gray-800 group-hover:text-indigo-700">{inv.name}</div>
                              <div className="flex justify-between items-center text-xs text-gray-500 mt-0.5">
                                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{inv.itemCode || '—'}</span>
                                <span>Stock: <span className={(inv.quantity || 0) > 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>{inv.quantity || 0}</span></span>
                                <span className="font-bold text-indigo-600">Rs. {inv.wholesalePrice || inv.mrp || inv.unitPrice || 0}</span>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="w-24">
                    <label className="mb-1 block text-xs font-medium text-gray-500">Cloth Size</label>
                    <input
                      type="number"
                      name="clothSize"
                      value={item.clothSize || ''}
                      onChange={e => handleItemChange(itemIndex, e)}
                      min="0"
                      step="0.01"
                      className="block w-full rounded-md border border-gray-300 py-1.5 px-3 text-sm font-bold text-indigo-600 focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                    <input type="number" name="quantity" value={item.quantity} onChange={e => handleItemChange(itemIndex, e)} min="1" required className="block w-full border border-gray-300 rounded-md py-1.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price Per Unit</label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-gray-500 sm:text-sm">Rs.</span></div>
                      <input type="number" name="pricePerUnit" value={item.pricePerUnit || 0} onChange={e => handleItemChange(itemIndex, e)} min="0" step="0.01" className="block w-full rounded-md border border-gray-300 py-1.5 px-3 pl-9 text-sm font-bold text-slate-700 focus:border-primary-500 focus:ring-primary-500" />
                    </div>
                  </div>
                  {/* Stitching Fee field */}
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <Scissors size={11} className="text-purple-400" /> Stitching Fee
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-gray-500 sm:text-sm">Rs.</span></div>
                      <input
                        type="number"
                        name="stitchFee"
                        value={item.stitchFee || 0}
                        onChange={e => handleItemChange(itemIndex, e)}
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="block w-full rounded-md border border-purple-200 bg-purple-50 py-1.5 px-3 pl-9 text-sm font-bold text-purple-700 focus:border-purple-400 focus:ring-purple-300 focus:ring-1 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="w-28 text-right">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Subtotal</label>
                    <span className="font-bold text-gray-800">Rs. {(((item.clothSize || 0) * (item.pricePerUnit || 0) * (item.quantity || 1)) + ((item.stitchFee || 0) * (item.quantity || 1))).toFixed(2)}</span>
                  </div>
                  <div className="flex-none ml-auto pt-5">
                    {order.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(itemIndex)} className="text-red-500 hover:text-red-700 bg-white p-2 rounded-full border border-transparent hover:border-red-200 hover:bg-red-50 transition-colors"><Trash2 size={18} /></button>
                    )}
                  </div>
                </div>
                <div className="p-4 bg-white grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center mb-2"><Ruler className="w-4 h-4 text-gray-400 mr-2" /><h4 className="text-sm font-medium text-gray-600">Measurements</h4></div>
                    <div className="flex flex-wrap items-center gap-3">
                      {item.measurements.map((meas, measIndex) => (
                        <div key={meas.id} className="relative">
                          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                            {/* <span className="text-[10px] font-bold text-gray-400 mr-2 uppercase">{meas.name}:</span> */}
                            <input
                              type="text"
                              name="value"
                              placeholder="Value"
                              value={meas.value}
                              onChange={e => handleMeasurementChange(itemIndex, measIndex, e)}
                              onKeyDown={e => handleMeasurementKeyDown(e, itemIndex, measIndex)}
                              className="w-16 bg-white border border-gray-300 rounded px-1 py-0.5 text-sm text-black font-semibold focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <button type="button" onClick={() => removeMeasurement(itemIndex, measIndex)} className="ml-2 text-gray-400 hover:text-red-500" data-measurement-next={`${itemIndex}-${measIndex}`}>
                              <XCircle size={14} />
                            </button>
                          </div>
                          {measurementInput.isOpen && measurementInput.itemIndex === itemIndex && measurementInput.measIndex === measIndex && (
                            <div ref={measurementSuggestionsRef} className="absolute z-50 top-full mt-1 w-max bg-white border border-primary-300 rounded-md shadow-2xl">
                              {measurementInput.suggestions.map((suggestion, idx) => (
                                <button key={suggestion.id} type="button" onClick={() => selectMeasurementSuggestion(itemIndex, measIndex, suggestion)} className={`block w-full text-left px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${idx === measurementInput.selectedIndex ? 'bg-primary-100 text-primary-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                                  {suggestion.value}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addMeasurement(itemIndex)} className="flex items-center justify-center px-3 py-1 text-xs font-medium text-primary-600 bg-primary-50 border border-dashed border-primary-300 rounded-md hover:bg-primary-100"><PlusCircle size={14} className="mr-1" /> Add</button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center mb-2"><FileText className="w-4 h-4 text-gray-400 mr-2" /><h4 className="text-sm font-medium text-gray-600">Notes</h4></div>
                    <textarea name="note" value={item.note || ''} onChange={e => handleItemChange(itemIndex, e)} placeholder="Special instructions..." className="w-full h-20 border border-gray-300 rounded-md p-2 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="mt-6 flex items-center justify-center w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors font-medium"><PlusCircle size={20} className="mr-2" /> Add Another Item</button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 p-6 border rounded-lg bg-gray-50 h-fit">
            <div className="flex items-center mb-4"><Calculator className="w-5 h-5 text-gray-500 mr-2" /><h2 className="text-xl font-semibold">Payment Details</h2></div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">Discount (Rs.)</label>
              <input type="number" name="discount" value={order.discount} onChange={handleOrderChange} min="0" className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-primary-500 focus:border-primary-500" />
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Payment History</h3>
              <div className="bg-white border rounded-md overflow-hidden mb-4">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {order.payments && order.payments.length > 0 ? (
                      order.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 text-sm text-gray-700">{p.date}</td>
                          <td className="px-3 py-2 text-sm font-medium">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${p.method === 'Bank Transfer' ? 'bg-purple-100 text-purple-700' :
                              p.method === 'Card' ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                              {p.method || 'Cash'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700 text-right font-bold">Rs. {p.amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => handleRemovePayment(p.id)} className="text-red-400 hover:text-red-600 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400 italic">No payments recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Enhanced Payment Entry Bar */}
              <div className="bg-[#f0f7ff] p-4 rounded-xl border border-blue-100 shadow-sm space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-blue-600 mb-1">Amount</label>
                    <input
                      type="number"
                      value={newPayment.amount}
                      onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })}
                      className="block w-full bg-white border-2 border-slate-900 rounded-lg py-2.5 px-3 text-lg font-bold text-slate-800 focus:ring-0 focus:border-blue-600 transition-all outline-none md:max-w-md"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="w-48">
                    <label className="block text-sm font-bold text-blue-600 mb-1">Date</label>
                    <input
                      type="date"
                      value={newPayment.date}
                      onChange={e => setNewPayment({ ...newPayment, date: e.target.value })}
                      className="block w-full bg-white border-2 border-slate-200 rounded-lg py-2.5 px-3 text-sm font-medium text-slate-700 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPayment}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg text-base font-black uppercase tracking-tight hover:bg-blue-700 active:scale-95 transition-all shadow-md h-[50px] flex items-center justify-center whitespace-nowrap"
                  >
                    Add Payment
                  </button>
                </div>

                {/* Payment Method Selector */}
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mr-2">Method:</span>
                  {(['Bank Transfer', 'Card', 'Cash'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setNewPayment({ ...newPayment, method: m })}
                      className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all border-2 ${newPayment.method === m
                        ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="w-full lg:w-96 bg-white border border-gray-200 rounded-lg shadow-sm p-6 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex items-center justify-between">
              Payment Summary
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-gray-500 font-medium">
                <span>Material Subtotal</span>
                <span>Rs. {order.items.reduce((s, i) => s + ((i.clothSize || 0) * (i.pricePerUnit || 0) * (i.quantity || 1)), 0).toFixed(2)}</span>
              </div>
              {totalStitchFee > 0 && (
                <div className="flex justify-between items-center text-purple-600 font-medium">
                  <span className="flex items-center gap-1"><Scissors size={13} /> Stitching Fee</span>
                  <span>Rs. {totalStitchFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-gray-700 font-semibold border-t border-gray-100 pt-2">
                <span>Subtotal</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-500 font-medium">
                <span>Discount</span>
                <span className="text-red-500">- Rs. {(order.discount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-green-600 border-b border-gray-100 pb-4 font-bold">
                <span>Total Paid</span>
                <span>- Rs. {totalPaid.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-lg font-black text-slate-800 uppercase tracking-tighter">Final Amount</span>
                <span className="text-3xl font-black text-indigo-600">Rs. {roundedFinalAmount.toLocaleString()}</span>
              </div>

              <div className={`flex justify-between items-center mt-4 p-4 rounded-xl border-2 transition-all ${balance > 0
                ? 'bg-orange-50 border-orange-200 text-orange-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                <span className="text-sm font-black uppercase tracking-wider">
                  {balance > 0 ? 'Balance Due' : 'Fully Paid'}
                </span>
                <span className="text-xl font-black">
                  Rs. {balance > 0 ? balance.toLocaleString() : '0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-6 border-t items-center">
          <button
            type="button"
            onClick={handleHoldSubmit}
            className={`flex items-center px-6 py-2.5 rounded-md font-bold transition-all border-2 ${order.status === 'Hold' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-500 text-amber-600 hover:bg-amber-50'}`}
          >
            Hold
          </button>
          <button
            type="button"
            onClick={() => {
              markDirty();
              setOrder(prev => ({ ...prev, status: 'Due' }));
            }}
            className={`flex items-center px-6 py-2.5 rounded-md font-bold transition-all border-2 ${order.status === 'Due' ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-red-600 text-red-600 hover:bg-red-50'}`}
          >
            Due
          </button>
          <button
            type="button"
            onClick={() => {
              markDirty();
              setOrder(prev => ({ ...prev, status: 'Delivered' }));
            }}
            className={`flex items-center px-6 py-2.5 rounded-md font-bold transition-all border-2 ${order.status === 'Delivered' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-green-600 text-green-600 hover:bg-green-50'}`}
          >
            Deliver
          </button>
          <div className="w-px h-8 bg-gray-200 mx-2"></div>
          <button type="button" onClick={() => navigate('Orders')} className="flex items-center px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm font-medium"><XCircle size={20} className="mr-2" /> Cancel</button>
          <button type="submit" className="flex items-center px-6 py-2.5 text-white bg-primary-600 rounded-md hover:bg-primary-700 shadow-sm font-medium"><Save size={20} className="mr-2" /> {orderId ? 'Update & Print Order' : 'Save & Print Order'}</button>
        </div>
      </form>
      {isCustomerModalOpen && (
        <CustomerForm
          onSave={handleSaveCustomer}
          onCancel={() => setIsCustomerModalOpen(false)}
        />
      )}
    </div>
  );
};

export default OrderForm;
