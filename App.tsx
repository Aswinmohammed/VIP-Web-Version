import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Orders from './components/Orders';
import DueOrders from './components/DueOrders';
import Inventory from './components/Inventory';
import Reports from './components/Reports';
import Login from './components/Login';
import OrderForm from './components/OrderForm';
import Invoice from './components/Invoice';
import Expenses from './components/Expenses';
import MaterialSales from './components/MaterialSales';
import EmployeeManagement from './components/EmployeeManagement';
import SupplierManagement from './components/SupplierManagement';
import SmsManagement from './components/SmsManagement';
import UserManagement from './components/UserManagement';
import { AppContext } from './context/AppContext';
import { Branch, CurrentUser, Customer, Employee, Expense, InventoryItem, MaterialSale, Order, OrderAction, Page, SalaryPayment, Settings, Supplier, WorkLog } from './types';
import {
  createCloudEmployee,
  createCloudEmployeeSalaryPayment,
  createCloudEmployeeWorkLog,
  createCloudExpense,
  createCloudCustomer,
  createCloudInventoryItem,
  createCloudOrder,
  createCloudMaterialSale,
  createCloudSupplier,
  deleteCloudEmployee,
  deleteCloudEmployeeSalaryPayment,
  deleteCloudEmployeeWorkLog,
  deleteCloudExpense,
  deleteCloudCustomer,
  deleteCloudInventoryItem,
  deleteCloudOrder,
  deleteCloudMaterialSale,
  deleteCloudSupplier,
  fetchCloudBranches,
  fetchCloudEmployees,
  fetchCloudExpenses,
  fetchCloudCustomers,
  fetchCloudInventory,
  fetchCloudOrders,
  fetchCloudMaterialSales,
  fetchCloudSuppliers,
  getCloudInvoiceUrl,
  loginToCloud,
  updateCloudEmployee,
  updateCloudEmployeeSalaryPayment,
  updateCloudEmployeeWorkLog,
  updateCloudExpense,
  updateCloudCustomer,
  updateCloudInventoryItem,
  updateCloudOrder,
  updateCloudMaterialSale,
  updateCloudSupplier,
} from './utils/cloudApi';

const SETTINGS_STORAGE_KEY = 'vip_tailors_cloud_settings';
const COLLECTION_SYNC_DEBOUNCE_MS = 400;
const CLOUD_REFRESH_INTERVAL_MS = 45000;

const DEFAULT_LOCATIONS = [
  'Kalmunai',
  'Sammanthurai',
  'Akkaraipattu',
  'Sainthamaruthu',
  'Addalaichenai',
  'Nintavur',
  'Karaitivu',
  'Pottuvil',
  'Central Camp',
  'Maliyakadu',
  'Panthiruppu',
  'Palamunai',
  'Neelavanai',
  'Maruthamunai',
  'Oluvil',
  'Natpiddimunai',
  'Periyaneelavanai',
  'Thambiluvil',
  'Thirukkovil',
];

function isUuid(value: string | undefined | null): boolean {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function withDefaultSettings(settings?: Settings): Settings {
  return {
    ...(settings || {}),
    locations: settings?.locations && settings.locations.length > 0 ? settings.locations : DEFAULT_LOCATIONS,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong while talking to the cloud backend.';
}

const BRANCH_PIECE_LABEL = 'Branch Piece Count';

function getBranchEmployeeAutoLogId(employeeId: string, sourceOrderId?: string, sourceOrderItemId?: string): string {
  const sourceReference = sourceOrderItemId || sourceOrderId || 'unknown';
  return `AUTO-BRANCH-${employeeId}-${sourceReference}`;
}

function buildBranchEmployeeAutoLogKeys(
  orderId?: string,
  orderServerId?: string,
  orderItemId?: string,
  orderItemServerId?: string,
  workDate?: string,
): string[] {
  if (!workDate) {
    return [];
  }

  const orderIds = [orderServerId, orderId].filter((value): value is string => Boolean(value));
  const orderItemIds = [orderItemServerId, orderItemId].filter((value): value is string => Boolean(value));
  const keys = new Set<string>();

  for (const currentOrderId of orderIds) {
    for (const currentOrderItemId of orderItemIds) {
      keys.add(`${currentOrderId}|${currentOrderItemId}|${workDate}`);
    }
  }

  return [...keys];
}

function getLegacyBranchRateFallback(employee: Employee): number {
  const values = Object.values(employee.pieceRates || {})
    .map((value) => Number(value))
    .filter((value) => value > 0);
  return values[0] || 0;
}

function getBranchEmployeeRateForDate(employee: Employee, date: string, fallbackRate = 0): number {
  const sortedHistory = [...(employee.branchPieceRateHistory || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (sortedHistory.length > 0) {
    const effectiveRate = [...sortedHistory].reverse().find((entry) => entry.effectiveFrom <= date);
    if (effectiveRate) {
      return effectiveRate.rate;
    }
    return sortedHistory[0].rate;
  }
  return getLegacyBranchRateFallback(employee) || fallbackRate;
}

function reconcileBranchEmployeeWorkLogs(employee: Employee, orders: Order[]): Employee {
  if (employee.type !== 'BranchEmployee' || !employee.salarySourceBranchId) {
    return employee;
  }

  const existingAutoLogs = new Map<string, WorkLog>();
  employee.workLogs
    .filter((log) => log.autoGenerated)
    .forEach((log) => {
      const keys = buildBranchEmployeeAutoLogKeys(
        log.sourceOrderId,
        undefined,
        log.sourceOrderItemId,
        undefined,
        log.date,
      );
      keys.forEach((key) => existingAutoLogs.set(key, log));
    });

  const nextAutoLogs = orders
    .filter((order) => order.branchId === employee.salarySourceBranchId)
    .flatMap((order) =>
      order.items.map((item) => {
        const keys = buildBranchEmployeeAutoLogKeys(order.id, order.serverId, item.id, item.serverId, order.orderDate);
        const existing = keys.map((key) => existingAutoLogs.get(key)).find((log): log is WorkLog => Boolean(log));
        const rate = getBranchEmployeeRateForDate(employee, order.orderDate, existing?.unitPrice || 0);
        const quantity = Number(item.quantity || 0);

        return {
          id: getBranchEmployeeAutoLogId(employee.id, order.serverId || order.id, item.serverId || item.id),
          dressType: BRANCH_PIECE_LABEL,
          quantity,
          unitPrice: rate,
          totalAmount: Number((quantity * rate).toFixed(2)),
          date: order.orderDate,
          timestamp: existing?.timestamp || new Date().toISOString(),
          autoGenerated: true,
          sourceBranchId: order.branchId,
          sourceOrderId: order.serverId || order.id,
          sourceOrderItemId: item.serverId || item.id,
        };
      }),
    );

  const manualLogs = employee.workLogs.filter((log) => !log.autoGenerated);
  const nextWorkLogs = [...nextAutoLogs, ...manualLogs].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return b.timestamp.localeCompare(a.timestamp);
  });

  return {
    ...employee,
    workLogs: nextWorkLogs,
  };
}

type PendingCollectionSync<T> = {
  baseline: T[] | null;
  next: T[] | null;
  timeoutId: number | null;
};

type CloudDataset = 'customers' | 'orders' | 'inventory' | 'expenses' | 'materialSales' | 'employees' | 'suppliers';

type DatasetCacheEntry = {
  customers: Customer[];
  orders: Order[];
  inventory: InventoryItem[];
  expenses: Expense[];
  materialSales: MaterialSale[];
  employees: Employee[];
  suppliers: Supplier[];
};

type CloudScope = {
  resolvedBranchId: string;
  branchFilter?: string;
  orderDataBranchFilter?: string;
  customerDataBranchFilter?: string;
  hasProductionAccess: boolean;
};

const ALL_DATASETS: CloudDataset[] = ['customers', 'orders', 'inventory', 'expenses', 'materialSales', 'employees', 'suppliers'];

const PAGE_DATASETS: Record<Page, CloudDataset[]> = {
  Dashboard: ['customers', 'orders', 'inventory', 'expenses', 'materialSales', 'employees'],
  Customers: ['customers'],
  Orders: ['customers', 'orders', 'employees'],
  'Due Orders': ['customers', 'orders'],
  'Add Order': ['customers', 'orders'],
  'Edit Order': ['customers', 'orders'],
  Invoice: ['customers', 'orders'],
  Inventory: ['inventory'],
  Reports: ['customers', 'orders', 'inventory', 'expenses', 'materialSales', 'employees'],
  Expenses: ['expenses'],
  'Material Sales': ['customers', 'inventory', 'materialSales'],
  Employees: ['employees', 'orders'],
  Suppliers: ['suppliers'],
  SMS: [],
  Users: [],
};

function createEmptyDatasetCache(): Record<CloudDataset, Map<string, unknown[]>> {
  return {
    customers: new Map<string, Customer[]>(),
    orders: new Map<string, Order[]>(),
    inventory: new Map<string, InventoryItem[]>(),
    expenses: new Map<string, Expense[]>(),
    materialSales: new Map<string, MaterialSale[]>(),
    employees: new Map<string, Employee[]>(),
    suppliers: new Map<string, Supplier[]>(),
  };
}

const App: React.FC = () => {
  const [page, setPage] = useState<Page>('Dashboard');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>('all');

  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [orders, setOrdersState] = useState<Order[]>([]);
  const [inventory, setInventoryState] = useState<InventoryItem[]>([]);
  const [expenses, setExpensesState] = useState<Expense[]>([]);
  const [materialSales, setMaterialSalesState] = useState<MaterialSale[]>([]);
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [suppliers, setSuppliersState] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<Settings>(() => withDefaultSettings());

  const [isBooting, setIsBooting] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isInitialCloudLoadComplete, setIsInitialCloudLoadComplete] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageLoadingLabel, setPageLoadingLabel] = useState('Loading data...');

  const accessTokenRef = useRef<string | null>(null);
  const activeBranchIdRef = useRef<string>('all');
  const currentUserRef = useRef<CurrentUser | null>(null);
  const currentBranchRef = useRef<Branch | null>(null);
  const customersRef = useRef<Customer[]>([]);
  const ordersRef = useRef<Order[]>([]);
  const inventoryRef = useRef<InventoryItem[]>([]);
  const expensesRef = useRef<Expense[]>([]);
  const materialSalesRef = useRef<MaterialSale[]>([]);
  const suppliersRef = useRef<Supplier[]>([]);
  const employeesRef = useRef<Employee[]>([]);
  const isDataLoadingRef = useRef<boolean>(false);
  const branchesLoadedRef = useRef(false);
  const isInitialCloudLoadCompleteRef = useRef(false);
  const lastCloudRefreshAtRef = useRef<number>(0);
  const datasetCacheRef = useRef<Record<CloudDataset, Map<string, unknown[]>>>(createEmptyDatasetCache());
  const activeDatasetCacheKeysRef = useRef<Partial<Record<CloudDataset, string>>>({});
  const customerSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const orderSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const inventorySyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const expenseSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const materialSaleSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const employeeSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const employeeCreateInFlightRef = useRef<Map<string, Promise<Employee>>>(new Map());
  const employeeIdAliasesRef = useRef<Map<string, string>>(new Map());
  const deletedEmployeeIdsRef = useRef<Set<string>>(new Set());
  const supplierSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const customerPendingSyncRef = useRef<PendingCollectionSync<Customer>>({ baseline: null, next: null, timeoutId: null });
  const orderPendingSyncRef = useRef<PendingCollectionSync<Order>>({ baseline: null, next: null, timeoutId: null });
  const inventoryPendingSyncRef = useRef<PendingCollectionSync<InventoryItem>>({ baseline: null, next: null, timeoutId: null });
  const expensePendingSyncRef = useRef<PendingCollectionSync<Expense>>({ baseline: null, next: null, timeoutId: null });
  const materialSalePendingSyncRef = useRef<PendingCollectionSync<MaterialSale>>({ baseline: null, next: null, timeoutId: null });
  const employeePendingSyncRef = useRef<PendingCollectionSync<Employee>>({ baseline: null, next: null, timeoutId: null });
  const supplierPendingSyncRef = useRef<PendingCollectionSync<Supplier>>({ baseline: null, next: null, timeoutId: null });
  const refreshCloudDataRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => {});

  useEffect(() => {
    accessTokenRef.current = accessToken;
    activeBranchIdRef.current = activeBranchId;
    currentUserRef.current = currentUser;
  }, [accessToken, activeBranchId, currentUser]);

  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);

  useEffect(() => {
    materialSalesRef.current = materialSales;
  }, [materialSales]);

  useEffect(() => {
    employeesRef.current = employees;
  }, [employees]);

  useEffect(() => {
    suppliersRef.current = suppliers;
  }, [suppliers]);

  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        setSettings(withDefaultSettings(JSON.parse(storedSettings) as Settings));
      }
    } catch (error) {
      console.warn('Failed to restore cloud session:', error);
    } finally {
      setIsBooting(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(withDefaultSettings(settings)));
  }, [settings]);

  const clearPendingCollectionSync = useCallback(function clearPendingCollectionSync<T>(
    syncRef: React.MutableRefObject<PendingCollectionSync<T>>,
  ) {
    if (syncRef.current.timeoutId !== null) {
      window.clearTimeout(syncRef.current.timeoutId);
    }
    syncRef.current = { baseline: null, next: null, timeoutId: null };
  }, []);

  const scheduleCollectionSync = useCallback(function scheduleCollectionSync<T>(
    syncRef: React.MutableRefObject<PendingCollectionSync<T>>,
    previous: T[],
    next: T[],
    execute: (previousItems: T[], nextItems: T[]) => void,
  ) {
    if (!accessTokenRef.current) {
      return;
    }

    if (syncRef.current.baseline === null) {
      syncRef.current.baseline = previous;
    }
    syncRef.current.next = next;

    if (syncRef.current.timeoutId !== null) {
      window.clearTimeout(syncRef.current.timeoutId);
    }

    syncRef.current.timeoutId = window.setTimeout(() => {
      const baseline = syncRef.current.baseline;
      const latestNext = syncRef.current.next;
      syncRef.current = { baseline: null, next: null, timeoutId: null };
      if (baseline === null || latestNext === null) {
        return;
      }
      execute(baseline, latestNext);
    }, COLLECTION_SYNC_DEBOUNCE_MS);
  }, []);

  const hasPendingLocalSync = useCallback(() => (
    customerPendingSyncRef.current.timeoutId !== null ||
    orderPendingSyncRef.current.timeoutId !== null ||
    inventoryPendingSyncRef.current.timeoutId !== null ||
    expensePendingSyncRef.current.timeoutId !== null ||
    materialSalePendingSyncRef.current.timeoutId !== null ||
    employeePendingSyncRef.current.timeoutId !== null ||
    supplierPendingSyncRef.current.timeoutId !== null ||
    employeeCreateInFlightRef.current.size > 0
  ), []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setCurrentUser(null);
    setIsInitialCloudLoadComplete(false);
    setIsPageLoading(false);
    setPageLoadingLabel('Loading data...');
    clearPendingCollectionSync(customerPendingSyncRef);
    clearPendingCollectionSync(orderPendingSyncRef);
    clearPendingCollectionSync(inventoryPendingSyncRef);
    clearPendingCollectionSync(expensePendingSyncRef);
    clearPendingCollectionSync(materialSalePendingSyncRef);
    clearPendingCollectionSync(employeePendingSyncRef);
    clearPendingCollectionSync(supplierPendingSyncRef);
    employeeCreateInFlightRef.current.clear();
    employeeIdAliasesRef.current.clear();
    deletedEmployeeIdsRef.current.clear();
    datasetCacheRef.current = createEmptyDatasetCache();
    activeDatasetCacheKeysRef.current = {};
    branchesLoadedRef.current = false;
    isInitialCloudLoadCompleteRef.current = false;
    lastCloudRefreshAtRef.current = 0;
    setBranches([]);
    setActiveBranchId('all');
    setCustomersState([]);
    setOrdersState([]);
    setInventoryState([]);
    setExpensesState([]);
    setMaterialSalesState([]);
    setEmployeesState([]);
    setSuppliersState([]);
  }, [clearPendingCollectionSync]);

  const resolveWritableBranchId = useCallback((branchId?: string) => {
    const actor = currentUserRef.current;
    if (actor?.role === 'branch_admin') {
      if (currentBranchRef.current?.isProductionHub && branchId && branchId !== 'all' && isUuid(branchId)) {
        return branchId;
      }
      return actor.branchId || '';
    }
    if (branchId && branchId !== 'all' && isUuid(branchId)) {
      return branchId;
    }
    if (activeBranchIdRef.current && activeBranchIdRef.current !== 'all' && isUuid(activeBranchIdRef.current)) {
      return activeBranchIdRef.current;
    }
    return '';
  }, []);

  const getDatasetsForPage = useCallback((targetPage: Page) => PAGE_DATASETS[targetPage] || [], []);

  const getPageLoadingText = useCallback((targetPage: Page) => {
    switch (targetPage) {
      case 'Orders':
      case 'Due Orders':
      case 'Add Order':
      case 'Edit Order':
      case 'Invoice':
        return 'Loading orders...';
      case 'Customers':
        return 'Loading customers...';
      case 'Inventory':
        return 'Loading inventory...';
      case 'Reports':
        return 'Loading reports...';
      case 'Expenses':
        return 'Loading expenses...';
      case 'Material Sales':
        return 'Loading material sales...';
      case 'Employees':
        return 'Loading employees...';
      case 'Suppliers':
        return 'Loading suppliers...';
      default:
        return 'Loading dashboard...';
    }
  }, []);

  const getCollectionState = useCallback((dataset: CloudDataset): DatasetCacheEntry[CloudDataset] => {
    switch (dataset) {
      case 'customers':
        return customersRef.current;
      case 'orders':
        return ordersRef.current;
      case 'inventory':
        return inventoryRef.current;
      case 'expenses':
        return expensesRef.current;
      case 'materialSales':
        return materialSalesRef.current;
      case 'employees':
        return employeesRef.current;
      case 'suppliers':
        return suppliersRef.current;
      default:
        return [];
    }
  }, []);

  const applyDatasetState = useCallback((dataset: CloudDataset, data: DatasetCacheEntry[CloudDataset]) => {
    switch (dataset) {
      case 'customers':
        setCustomersState(data as Customer[]);
        break;
      case 'orders':
        setOrdersState(data as Order[]);
        break;
      case 'inventory':
        setInventoryState(data as InventoryItem[]);
        break;
      case 'expenses':
        setExpensesState(data as Expense[]);
        break;
      case 'materialSales':
        setMaterialSalesState(data as MaterialSale[]);
        break;
      case 'employees':
        setEmployeesState(data as Employee[]);
        break;
      case 'suppliers':
        setSuppliersState(data as Supplier[]);
        break;
      default:
        break;
    }
  }, []);

  const getScopeCacheKey = useCallback((dataset: CloudDataset, scope: CloudScope) => {
    const filterValue = dataset === 'customers'
      ? scope.customerDataBranchFilter
      : dataset === 'orders'
        ? scope.orderDataBranchFilter
        : scope.branchFilter;
    return filterValue || 'all';
  }, []);

  const writeDatasetCache = useCallback((dataset: CloudDataset, cacheKey: string, data: DatasetCacheEntry[CloudDataset]) => {
    datasetCacheRef.current[dataset].set(cacheKey, [...data] as unknown[]);
  }, []);

  const readDatasetCache = useCallback((dataset: CloudDataset, cacheKey: string): DatasetCacheEntry[CloudDataset] | null => {
    const cached = datasetCacheRef.current[dataset].get(cacheKey);
    return cached ? ([...cached] as DatasetCacheEntry[CloudDataset]) : null;
  }, []);

  const resolveBranchScope = useCallback((loadedBranches: Branch[]): CloudScope => {
    const actor = currentUserRef.current;
    if (!actor) {
      return {
        resolvedBranchId: 'all',
        branchFilter: undefined,
        customerDataBranchFilter: undefined,
        orderDataBranchFilter: undefined,
        hasProductionAccess: false,
      };
    }

    let resolvedBranchId =
      actor.role === 'branch_admin'
        ? actor.branchId || loadedBranches[0]?.id || ''
        : activeBranchIdRef.current || 'all';

    if (actor.role === 'master_admin' && resolvedBranchId !== 'all' && !loadedBranches.some((branch) => branch.id === resolvedBranchId)) {
      resolvedBranchId = 'all';
    }

    const selectedBranch = resolvedBranchId !== 'all'
      ? loadedBranches.find((branch) => branch.id === resolvedBranchId) || null
      : null;
    const hasProductionAccess = Boolean(selectedBranch?.isProductionHub);
    const branchFilter = actor.role === 'master_admin' && resolvedBranchId === 'all' ? undefined : resolvedBranchId;
    const orderDataBranchFilter = actor.role === 'master_admin' && resolvedBranchId === 'all'
      ? undefined
      : hasProductionAccess
        ? undefined
        : resolvedBranchId;
    const customerDataBranchFilter = actor.role === 'master_admin' && resolvedBranchId === 'all'
      ? undefined
      : hasProductionAccess
        ? undefined
        : resolvedBranchId;

    return {
      resolvedBranchId,
      branchFilter,
      orderDataBranchFilter,
      customerDataBranchFilter,
      hasProductionAccess,
    };
  }, []);

  const fetchDataset = useCallback(async (dataset: CloudDataset, token: string, scope: CloudScope) => {
    switch (dataset) {
      case 'customers':
        return fetchCloudCustomers(token, scope.customerDataBranchFilter);
      case 'orders':
        return fetchCloudOrders(token, scope.orderDataBranchFilter);
      case 'inventory':
        return fetchCloudInventory(token, scope.branchFilter);
      case 'expenses':
        return fetchCloudExpenses(token, scope.branchFilter);
      case 'materialSales':
        return fetchCloudMaterialSales(token, scope.branchFilter);
      case 'employees':
        return fetchCloudEmployees(token, scope.branchFilter);
      case 'suppliers':
        return fetchCloudSuppliers(token, scope.branchFilter);
      default:
        return [];
    }
  }, []);

  const ensureBranchesLoaded = useCallback(async () => {
    if (!accessTokenRef.current) {
      return branches;
    }
    if (branchesLoadedRef.current && branches.length > 0) {
      return branches;
    }

    const loadedBranches = await fetchCloudBranches(accessTokenRef.current);
    branchesLoadedRef.current = true;
    setBranches(loadedBranches);
    return loadedBranches;
  }, [branches]);

  const loadPageDatasets = useCallback(async (
    targetPage: Page,
    scope: CloudScope,
    options?: { silent?: boolean; force?: boolean },
  ) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    const datasets = getDatasetsForPage(targetPage);
    if (datasets.length === 0) {
      return;
    }

    const isSilent = options?.silent ?? false;
    const force = options?.force ?? false;

    let hasAppliedCachedData = false;
    for (const dataset of datasets) {
      const cacheKey = getScopeCacheKey(dataset, scope);
      activeDatasetCacheKeysRef.current[dataset] = cacheKey;
      const cached = readDatasetCache(dataset, cacheKey);
      if (cached) {
        applyDatasetState(dataset, cached);
        hasAppliedCachedData = true;
      }
    }

    const shouldShowPageLoader = !isSilent && (!hasAppliedCachedData || !isInitialCloudLoadCompleteRef.current);
    if (shouldShowPageLoader) {
      setPageLoadingLabel(getPageLoadingText(targetPage));
      setIsPageLoading(true);
    }

    try {
      const loadedEntries = await Promise.all(
        datasets.map(async (dataset) => {
          const cacheKey = getScopeCacheKey(dataset, scope);
          const data = await fetchDataset(dataset, token, scope);
          return { dataset, cacheKey, data };
        }),
      );

      loadedEntries.forEach(({ dataset, cacheKey, data }) => {
        writeDatasetCache(dataset, cacheKey, data as DatasetCacheEntry[CloudDataset]);
        applyDatasetState(dataset, data as DatasetCacheEntry[CloudDataset]);
      });
      lastCloudRefreshAtRef.current = Date.now();
    } catch (error) {
      console.error(`Failed to load datasets for page ${targetPage}:`, error);
    } finally {
      if (shouldShowPageLoader) {
        setIsPageLoading(false);
      }
    }

    if (!isInitialCloudLoadCompleteRef.current) {
      isInitialCloudLoadCompleteRef.current = true;
      setIsInitialCloudLoadComplete(true);
    }
  }, [applyDatasetState, fetchDataset, getDatasetsForPage, getPageLoadingText, getScopeCacheKey, readDatasetCache, writeDatasetCache]);

  const saveCustomer = useCallback(async (customer: Customer) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(customer.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving a customer.');
    }

    const payload = { ...customer, branchId };
    const saved = isUuid(customer.id) ? await updateCloudCustomer(token, payload) : await createCloudCustomer(token, payload);

    setCustomersState((current) => {
      const existingIndex = current.findIndex((item) => item.id === customer.id || item.id === saved.id);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((item, index) => (index === existingIndex ? saved : item));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteCustomerRecord = useCallback(async (customerId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    if (isUuid(customerId)) {
      await deleteCloudCustomer(token, customerId);
    }
    setCustomersState((current) => current.filter((customer) => customer.id !== customerId));
  }, []);

  const saveOrder = useCallback(async (order: Order) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(order.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving an order.');
    }

    const payload = { ...order, branchId };
    const saved = order.serverId ? await updateCloudOrder(token, payload) : await createCloudOrder(token, payload);

    setOrdersState((current) => {
      const existingIndex = current.findIndex((item) => item.id === order.id || item.serverId === order.serverId || item.serverId === saved.serverId);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((item, index) => (index === existingIndex ? saved : item));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteOrderRecord = useCallback(async (orderId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const existingOrder = orders.find((order) => order.id === orderId);
    if (existingOrder?.serverId) {
      await deleteCloudOrder(token, existingOrder.serverId);
    }
    setOrdersState((current) => current.filter((order) => order.id !== orderId));
  }, [orders]);

  const saveInventoryItem = useCallback(async (item: InventoryItem) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(item.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving inventory.');
    }

    const payload = { ...item, branchId };
    const saved = isUuid(item.id) ? await updateCloudInventoryItem(token, payload) : await createCloudInventoryItem(token, payload);

    setInventoryState((current) => {
      const existingIndex = current.findIndex((currentItem) => currentItem.id === item.id || currentItem.id === saved.id);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((currentItem, index) => (index === existingIndex ? saved : currentItem));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteInventoryRecord = useCallback(async (itemId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    if (isUuid(itemId)) {
      await deleteCloudInventoryItem(token, itemId);
    }
    setInventoryState((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const saveExpense = useCallback(async (expense: Expense) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(expense.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving an expense.');
    }

    const payload = { ...expense, branchId };
    const saved = isUuid(expense.id) ? await updateCloudExpense(token, payload) : await createCloudExpense(token, payload);

    setExpensesState((current) => {
      const existingIndex = current.findIndex((currentExpense) => currentExpense.id === expense.id || currentExpense.id === saved.id);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((currentExpense, index) => (index === existingIndex ? saved : currentExpense));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteExpenseRecord = useCallback(async (expenseId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    if (isUuid(expenseId)) {
      await deleteCloudExpense(token, expenseId);
    }
    setExpensesState((current) => current.filter((expense) => expense.id !== expenseId));
  }, []);

  const saveMaterialSale = useCallback(async (sale: MaterialSale) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(sale.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving a material sale.');
    }

    const payload = { ...sale, branchId };
    const saved = isUuid(sale.id) ? await updateCloudMaterialSale(token, payload) : await createCloudMaterialSale(token, payload);

    setMaterialSalesState((current) => {
      const existingIndex = current.findIndex((currentSale) => currentSale.id === sale.id || currentSale.id === saved.id);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((currentSale, index) => (index === existingIndex ? saved : currentSale));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteMaterialSaleRecord = useCallback(async (saleId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    if (isUuid(saleId)) {
      await deleteCloudMaterialSale(token, saleId);
    }
    setMaterialSalesState((current) => current.filter((sale) => sale.id !== saleId));
  }, []);

  const saveEmployee = useCallback(async (employee: Employee) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(employee.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving an employee.');
    }

    const originalId = employee.id;
    const resolvedEmployeeId = isUuid(employee.id) ? employee.id : employeeIdAliasesRef.current.get(employee.id);
    if (deletedEmployeeIdsRef.current.has(originalId) || (resolvedEmployeeId && deletedEmployeeIdsRef.current.has(resolvedEmployeeId))) {
      return employee;
    }
    const payload = { ...employee, id: resolvedEmployeeId || employee.id, branchId };

    const applySavedEmployee = (saved: Employee) => {
      setEmployeesState((current) => {
        const existingIndex = current.findIndex((currentEmployee) => {
          if (currentEmployee.id === saved.id || currentEmployee.id === originalId) {
            return true;
          }
          const aliasedCurrentId = employeeIdAliasesRef.current.get(currentEmployee.id);
          return aliasedCurrentId === saved.id;
        });
        if (existingIndex === -1) {
          return [...current, saved];
        }
        return current.map((currentEmployee, index) => (index === existingIndex ? saved : currentEmployee));
      });
    };

    let saved: Employee;
    if (resolvedEmployeeId) {
      try {
        saved = await updateCloudEmployee(token, payload);
      } catch (error) {
        if (deletedEmployeeIdsRef.current.has(originalId) || deletedEmployeeIdsRef.current.has(resolvedEmployeeId)) {
          return employee;
        }
        throw error;
      }
      applySavedEmployee(saved);
      return saved;
    }

    const pendingCreate = employeeCreateInFlightRef.current.get(originalId);
    if (pendingCreate) {
      const created = await pendingCreate;
      employeeIdAliasesRef.current.set(originalId, created.id);
      const mergedPayload = { ...payload, id: created.id };
      saved = await updateCloudEmployee(token, mergedPayload);
      applySavedEmployee(saved);
      return saved;
    }

    const createPromise = createCloudEmployee(token, payload);
    employeeCreateInFlightRef.current.set(originalId, createPromise);
    try {
      const created = await createPromise;
      employeeIdAliasesRef.current.set(originalId, created.id);
      applySavedEmployee(created);
      saved = created;
    } finally {
      employeeCreateInFlightRef.current.delete(originalId);
    }

    return saved;
  }, [resolveWritableBranchId]);

  const deleteEmployeeRecord = useCallback(async (employeeId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);
    deletedEmployeeIdsRef.current.add(employeeId);
    if (resolvedEmployeeId) {
      deletedEmployeeIdsRef.current.add(resolvedEmployeeId);
    }
    if (resolvedEmployeeId) {
      await deleteCloudEmployee(token, resolvedEmployeeId);
    }
    employeeCreateInFlightRef.current.delete(employeeId);
    employeeIdAliasesRef.current.delete(employeeId);
    for (const [localId, aliasedId] of employeeIdAliasesRef.current.entries()) {
      if (aliasedId === resolvedEmployeeId) {
        employeeIdAliasesRef.current.delete(localId);
      }
    }
    setEmployeesState((current) => current.filter((employee) => employee.id !== employeeId && employee.id !== resolvedEmployeeId));
  }, []);

  const ensureEmployeePersisted = useCallback(async (employeeId: string): Promise<string> => {
    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);
    if (resolvedEmployeeId) {
      return resolvedEmployeeId;
    }

    const employee = employeesRef.current.find((currentEmployee) => currentEmployee.id === employeeId);
    if (!employee) {
      throw new Error('Employee not found.');
    }

    const saved = await saveEmployee(employee);
    return saved.id;
  }, [saveEmployee]);

  const saveEmployeeWorkLog = useCallback(async (employeeId: string, workLog: WorkLog) => {
    const originalWorkLogId = workLog.id;
    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);

    setEmployeesState((current) => current.map((employee) => {
      const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
      if (employee.id !== employeeId && employee.id !== resolvedEmployeeId && currentResolvedId !== resolvedEmployeeId) {
        return employee;
      }

      const existingIndex = employee.workLogs.findIndex((currentLog) => currentLog.id === originalWorkLogId);
      const nextWorkLogs = existingIndex === -1
        ? [workLog, ...employee.workLogs]
        : employee.workLogs.map((currentLog, index) => (index === existingIndex ? { ...currentLog, ...workLog } : currentLog));

      return {
        ...employee,
        workLogs: nextWorkLogs,
      };
    }));

    try {
      const persistedEmployeeId = await ensureEmployeePersisted(employeeId);
      const saved = isUuid(originalWorkLogId)
        ? await updateCloudEmployeeWorkLog(accessTokenRef.current!, persistedEmployeeId, originalWorkLogId, workLog)
        : await createCloudEmployeeWorkLog(accessTokenRef.current!, persistedEmployeeId, workLog);

      setEmployeesState((current) => current.map((employee) => {
        const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
        if (employee.id !== employeeId && employee.id !== persistedEmployeeId && currentResolvedId !== persistedEmployeeId) {
          return employee;
        }

        const existingIndex = employee.workLogs.findIndex((currentLog) => currentLog.id === originalWorkLogId || currentLog.id === saved.id);
        const nextWorkLogs = existingIndex === -1
          ? [saved, ...employee.workLogs]
          : employee.workLogs.map((currentLog, index) => (index === existingIndex ? saved : currentLog));

        return {
          ...employee,
          workLogs: nextWorkLogs,
        };
      }));

      return saved;
    } catch (error) {
      console.error('Employee work log save failed:', error);
      window.alert(getErrorMessage(error));
      void refreshCloudDataRef.current();
      throw error;
    }
  }, [ensureEmployeePersisted]);

  const deleteEmployeeWorkLog = useCallback(async (employeeId: string, workLogId: string) => {
    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);
    const removedWorkLogSnapshots = new Map<string, WorkLog[]>();

    setEmployeesState((current) => current.map((employee) => {
      const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
      if (employee.id !== employeeId && employee.id !== resolvedEmployeeId && currentResolvedId !== resolvedEmployeeId) {
        return employee;
      }

      removedWorkLogSnapshots.set(employee.id, employee.workLogs);
      return {
        ...employee,
        workLogs: employee.workLogs.filter((currentLog) => currentLog.id !== workLogId),
      };
    }));

    try {
      const persistedEmployeeId = await ensureEmployeePersisted(employeeId);
      await deleteCloudEmployeeWorkLog(accessTokenRef.current!, persistedEmployeeId, workLogId);
    } catch (error) {
      setEmployeesState((current) => current.map((employee) => {
        const snapshot = removedWorkLogSnapshots.get(employee.id);
        return snapshot ? { ...employee, workLogs: snapshot } : employee;
      }));
      console.error('Employee work log delete failed:', error);
      window.alert(getErrorMessage(error));
      void refreshCloudDataRef.current();
      throw error;
    }
  }, [ensureEmployeePersisted]);

  const saveEmployeeSalaryPayment = useCallback(async (employeeId: string, payment: SalaryPayment) => {
    const originalPaymentId = payment.id;
    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);

    setEmployeesState((current) => current.map((employee) => {
      const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
      if (employee.id !== employeeId && employee.id !== resolvedEmployeeId && currentResolvedId !== resolvedEmployeeId) {
        return employee;
      }

      const existingIndex = employee.salaryPayments.findIndex((currentPayment) => currentPayment.id === originalPaymentId);
      const nextSalaryPayments = existingIndex === -1
        ? [payment, ...employee.salaryPayments]
        : employee.salaryPayments.map((currentPayment, index) => (index === existingIndex ? { ...currentPayment, ...payment } : currentPayment));

      return {
        ...employee,
        salaryPayments: nextSalaryPayments,
      };
    }));

    try {
      const persistedEmployeeId = await ensureEmployeePersisted(employeeId);
      const saved = isUuid(originalPaymentId)
        ? await updateCloudEmployeeSalaryPayment(accessTokenRef.current!, persistedEmployeeId, originalPaymentId, payment)
        : await createCloudEmployeeSalaryPayment(accessTokenRef.current!, persistedEmployeeId, payment);

      setEmployeesState((current) => current.map((employee) => {
        const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
        if (employee.id !== employeeId && employee.id !== persistedEmployeeId && currentResolvedId !== persistedEmployeeId) {
          return employee;
        }

        const existingIndex = employee.salaryPayments.findIndex((currentPayment) => currentPayment.id === originalPaymentId || currentPayment.id === saved.id);
        const nextSalaryPayments = existingIndex === -1
          ? [saved, ...employee.salaryPayments]
          : employee.salaryPayments.map((currentPayment, index) => (index === existingIndex ? saved : currentPayment));

        return {
          ...employee,
          salaryPayments: nextSalaryPayments,
        };
      }));

      return saved;
    } catch (error) {
      console.error('Employee salary payment save failed:', error);
      window.alert(getErrorMessage(error));
      void refreshCloudDataRef.current();
      throw error;
    }
  }, [ensureEmployeePersisted]);

  const deleteEmployeeSalaryPayment = useCallback(async (employeeId: string, paymentId: string) => {
    const resolvedEmployeeId = isUuid(employeeId) ? employeeId : employeeIdAliasesRef.current.get(employeeId);
    const removedPaymentSnapshots = new Map<string, SalaryPayment[]>();

    setEmployeesState((current) => current.map((employee) => {
      const currentResolvedId = employeeIdAliasesRef.current.get(employee.id);
      if (employee.id !== employeeId && employee.id !== resolvedEmployeeId && currentResolvedId !== resolvedEmployeeId) {
        return employee;
      }

      removedPaymentSnapshots.set(employee.id, employee.salaryPayments);
      return {
        ...employee,
        salaryPayments: employee.salaryPayments.filter((currentPayment) => currentPayment.id !== paymentId),
      };
    }));

    try {
      const persistedEmployeeId = await ensureEmployeePersisted(employeeId);
      await deleteCloudEmployeeSalaryPayment(accessTokenRef.current!, persistedEmployeeId, paymentId);
    } catch (error) {
      setEmployeesState((current) => current.map((employee) => {
        const snapshot = removedPaymentSnapshots.get(employee.id);
        return snapshot ? { ...employee, salaryPayments: snapshot } : employee;
      }));
      console.error('Employee salary payment delete failed:', error);
      window.alert(getErrorMessage(error));
      void refreshCloudDataRef.current();
      throw error;
    }
  }, [ensureEmployeePersisted]);

  const saveSupplier = useCallback(async (supplier: Supplier) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    const branchId = resolveWritableBranchId(supplier.branchId);
    if (!branchId) {
      throw new Error('Select a branch before saving a supplier.');
    }

    const payload = { ...supplier, branchId };
    const saved = isUuid(supplier.id) ? await updateCloudSupplier(token, payload) : await createCloudSupplier(token, payload);

    setSuppliersState((current) => {
      const existingIndex = current.findIndex((currentSupplier) => currentSupplier.id === supplier.id || currentSupplier.id === saved.id);
      if (existingIndex === -1) {
        return [...current, saved];
      }
      return current.map((currentSupplier, index) => (index === existingIndex ? saved : currentSupplier));
    });

    return saved;
  }, [resolveWritableBranchId]);

  const deleteSupplierRecord = useCallback(async (supplierId: string) => {
    const token = accessTokenRef.current;
    if (!token) {
      throw new Error('You are not logged in.');
    }

    if (isUuid(supplierId)) {
      await deleteCloudSupplier(token, supplierId);
    }
    setSuppliersState((current) => current.filter((supplier) => supplier.id !== supplierId));
  }, []);

  const syncCustomersFromState = useCallback((previous: Customer[], next: Customer[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    customerSyncQueueRef.current = customerSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((customer) => [customer.id, customer]));
        const nextById = new Map(next.map((customer) => [customer.id, customer]));

        for (const customer of previous) {
          if (!nextById.has(customer.id) && isUuid(customer.id)) {
            await deleteCloudCustomer(token, customer.id);
          }
        }

        for (const customer of next) {
          const previousCustomer = previousById.get(customer.id);
          if (!previousCustomer || JSON.stringify(previousCustomer) !== JSON.stringify(customer)) {
            await saveCustomer(customer);
          }
        }
      })
      .catch((error) => {
        console.error('Customer sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveCustomer]);

  const syncOrdersFromState = useCallback((previous: Order[], next: Order[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    orderSyncQueueRef.current = orderSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((order) => [order.id, order]));
        const nextById = new Map(next.map((order) => [order.id, order]));

        for (const order of previous) {
          if (!nextById.has(order.id) && order.serverId) {
            await deleteCloudOrder(token, order.serverId);
          }
        }

        for (const order of next) {
          const previousOrder = previousById.get(order.id);
          if (!previousOrder || JSON.stringify(previousOrder) !== JSON.stringify(order)) {
            await saveOrder(order);
          }
        }
      })
      .catch((error) => {
        console.error('Order sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveOrder]);

  const syncInventoryFromState = useCallback((previous: InventoryItem[], next: InventoryItem[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    inventorySyncQueueRef.current = inventorySyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((item) => [item.id, item]));
        const nextById = new Map(next.map((item) => [item.id, item]));

        for (const item of previous) {
          if (!nextById.has(item.id) && isUuid(item.id)) {
            await deleteCloudInventoryItem(token, item.id);
          }
        }

        for (const item of next) {
          const previousItem = previousById.get(item.id);
          if (!previousItem || JSON.stringify(previousItem) !== JSON.stringify(item)) {
            await saveInventoryItem(item);
          }
        }
      })
      .catch((error) => {
        console.error('Inventory sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveInventoryItem]);

  const syncExpensesFromState = useCallback((previous: Expense[], next: Expense[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    expenseSyncQueueRef.current = expenseSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((expense) => [expense.id, expense]));
        const nextById = new Map(next.map((expense) => [expense.id, expense]));

        for (const expense of previous) {
          if (!nextById.has(expense.id) && isUuid(expense.id)) {
            await deleteCloudExpense(token, expense.id);
          }
        }

        for (const expense of next) {
          const previousExpense = previousById.get(expense.id);
          if (!previousExpense || JSON.stringify(previousExpense) !== JSON.stringify(expense)) {
            await saveExpense(expense);
          }
        }
      })
      .catch((error) => {
        console.error('Expense sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveExpense]);

  const syncMaterialSalesFromState = useCallback((previous: MaterialSale[], next: MaterialSale[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    materialSaleSyncQueueRef.current = materialSaleSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((sale) => [sale.id, sale]));
        const nextById = new Map(next.map((sale) => [sale.id, sale]));

        for (const sale of previous) {
          if (!nextById.has(sale.id) && isUuid(sale.id)) {
            await deleteCloudMaterialSale(token, sale.id);
          }
        }

        for (const sale of next) {
          const previousSale = previousById.get(sale.id);
          if (!previousSale || JSON.stringify(previousSale) !== JSON.stringify(sale)) {
            await saveMaterialSale(sale);
          }
        }
      })
      .catch((error) => {
        console.error('Material sale sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveMaterialSale]);

  const syncEmployeesFromState = useCallback((previous: Employee[], next: Employee[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    employeeSyncQueueRef.current = employeeSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((employee) => [employee.id, employee]));
        const nextById = new Map(next.map((employee) => [employee.id, employee]));

        for (const employee of previous) {
          if (!nextById.has(employee.id) && isUuid(employee.id)) {
            await deleteCloudEmployee(token, employee.id);
          }
        }

        for (const employee of next) {
          const resolvedEmployeeId = isUuid(employee.id) ? employee.id : employeeIdAliasesRef.current.get(employee.id);
          if (deletedEmployeeIdsRef.current.has(employee.id) || (resolvedEmployeeId && deletedEmployeeIdsRef.current.has(resolvedEmployeeId))) {
            continue;
          }
          const previousEmployee = previousById.get(employee.id);
          if (!previousEmployee || JSON.stringify(previousEmployee) !== JSON.stringify(employee)) {
            await saveEmployee(employee);
          }
        }
      })
      .catch((error) => {
        console.error('Employee sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveEmployee]);

  const syncSuppliersFromState = useCallback((previous: Supplier[], next: Supplier[]) => {
    const token = accessTokenRef.current;
    if (!token) {
      return;
    }

    supplierSyncQueueRef.current = supplierSyncQueueRef.current
      .then(async () => {
        const previousById = new Map(previous.map((supplier) => [supplier.id, supplier]));
        const nextById = new Map(next.map((supplier) => [supplier.id, supplier]));

        for (const supplier of previous) {
          if (!nextById.has(supplier.id) && isUuid(supplier.id)) {
            await deleteCloudSupplier(token, supplier.id);
          }
        }

        for (const supplier of next) {
          const previousSupplier = previousById.get(supplier.id);
          if (!previousSupplier || JSON.stringify(previousSupplier) !== JSON.stringify(supplier)) {
            await saveSupplier(supplier);
          }
        }
      })
      .catch((error) => {
        console.error('Supplier sync failed:', error);
        window.alert(getErrorMessage(error));
        void refreshCloudDataRef.current();
      });
  }, [saveSupplier]);

  useEffect(() => {
    if (isDataLoadingRef.current) {
      return;
    }

    setEmployeesState((previous) => {
      const next = previous.map((employee) => reconcileBranchEmployeeWorkLogs(employee, orders));
      if (JSON.stringify(previous) === JSON.stringify(next)) {
        return previous;
      }
      scheduleCollectionSync(employeePendingSyncRef, previous, next, syncEmployeesFromState);
      return next;
    });
  }, [orders, scheduleCollectionSync, syncEmployeesFromState]);

  const setCustomers = useCallback<React.Dispatch<React.SetStateAction<Customer[]>>>((value) => {
    setCustomersState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(customerPendingSyncRef, previous, next, syncCustomersFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncCustomersFromState]);

  const setOrders = useCallback<React.Dispatch<React.SetStateAction<Order[]>>>((value) => {
    setOrdersState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(orderPendingSyncRef, previous, next, syncOrdersFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncOrdersFromState]);

  const setInventory = useCallback<React.Dispatch<React.SetStateAction<InventoryItem[]>>>((value) => {
    setInventoryState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(inventoryPendingSyncRef, previous, next, syncInventoryFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncInventoryFromState]);

  const setExpenses = useCallback<React.Dispatch<React.SetStateAction<Expense[]>>>((value) => {
    setExpensesState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(expensePendingSyncRef, previous, next, syncExpensesFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncExpensesFromState]);

  const setMaterialSales = useCallback<React.Dispatch<React.SetStateAction<MaterialSale[]>>>((value) => {
    setMaterialSalesState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(materialSalePendingSyncRef, previous, next, syncMaterialSalesFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncMaterialSalesFromState]);

  const setEmployees = useCallback<React.Dispatch<React.SetStateAction<Employee[]>>>((value) => {
    setEmployeesState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(employeePendingSyncRef, previous, next, syncEmployeesFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncEmployeesFromState]);

  const setSuppliers = useCallback<React.Dispatch<React.SetStateAction<Supplier[]>>>((value) => {
    setSuppliersState((previous) => {
      const next = typeof value === 'function' ? value(previous) : value;
      scheduleCollectionSync(supplierPendingSyncRef, previous, next, syncSuppliersFromState);
      return next;
    });
  }, [scheduleCollectionSync, syncSuppliersFromState]);

  useEffect(() => {
    const cacheKeys = activeDatasetCacheKeysRef.current;
    if (cacheKeys.customers) {
      writeDatasetCache('customers', cacheKeys.customers, customers);
    }
    if (cacheKeys.orders) {
      writeDatasetCache('orders', cacheKeys.orders, orders);
    }
    if (cacheKeys.inventory) {
      writeDatasetCache('inventory', cacheKeys.inventory, inventory);
    }
    if (cacheKeys.expenses) {
      writeDatasetCache('expenses', cacheKeys.expenses, expenses);
    }
    if (cacheKeys.materialSales) {
      writeDatasetCache('materialSales', cacheKeys.materialSales, materialSales);
    }
    if (cacheKeys.employees) {
      writeDatasetCache('employees', cacheKeys.employees, employees);
    }
    if (cacheKeys.suppliers) {
      writeDatasetCache('suppliers', cacheKeys.suppliers, suppliers);
    }
  }, [customers, orders, inventory, expenses, materialSales, employees, suppliers, writeDatasetCache]);

  const navigateTo = (newPage: Page, orderId?: string) => {
    if (newPage === 'Edit Order' && orderId) setEditingOrderId(orderId);
    else setEditingOrderId(null);
    if (newPage === 'Invoice' && orderId) setViewingInvoiceId(orderId);
    else setViewingInvoiceId(null);
    setPage(newPage);
  };

  const currentBranch = currentUser?.role === 'branch_admin'
    ? branches.find((branch) => branch.id === currentUser.branchId) || null
    : activeBranchId !== 'all'
      ? branches.find((branch) => branch.id === activeBranchId) || null
      : null;
  const isAllBranchesScope = currentUser?.role === 'master_admin' && activeBranchId === 'all';

  const getBranchName = useCallback((branchId?: string | null) => {
    if (!branchId) {
      return 'Unassigned Branch';
    }
    return branches.find((branch) => branch.id === branchId)?.name || 'Unknown Branch';
  }, [branches]);

  const canAccessPage = useCallback((candidatePage: Page) => {
    if (candidatePage === 'SMS') {
      return currentUser?.role === 'master_admin';
    }

    if (candidatePage === 'Users') {
      return currentUser?.role === 'master_admin';
    }

    if (currentUser?.role === 'master_admin' && activeBranchId === 'all') {
      return candidatePage !== 'Users';
    }

    const accessAreas = currentBranch?.accessAreas || [];
    if (accessAreas.length === 0) {
      return true;
    }

    const areaByPage: Partial<Record<Page, string[]>> = {
      Dashboard: ['dashboard'],
      Customers: ['customers'],
      Orders: ['orders'],
      'Due Orders': ['orders'],
      'Add Order': ['add_order'],
      'Edit Order': ['orders', 'add_order'],
      Invoice: ['orders', 'add_order'],
      Inventory: ['inventory'],
      'Material Sales': ['material_sales'],
      Suppliers: ['suppliers'],
      Employees: ['employees'],
      Expenses: ['expenses'],
      Reports: ['reports'],
    };

    const allowedAreas = areaByPage[candidatePage] || [];
    return allowedAreas.some((area) => accessAreas.includes(area));
  }, [activeBranchId, currentBranch?.accessAreas, currentUser?.role]);

  const canUseOrderAction = useCallback((action: OrderAction) => {
    if (currentUser?.role === 'master_admin' && activeBranchId === 'all') {
      return true;
    }

    const orderActions = currentBranch?.orderActions || [];
    if (orderActions.length === 0) {
      return true;
    }
    return orderActions.includes(action);
  }, [activeBranchId, currentBranch?.orderActions, currentUser?.role]);

  const refreshCloudData = useCallback(async (options?: { silent?: boolean }) => {
    if (!accessTokenRef.current || !currentUserRef.current) {
      return;
    }

    const isSilent = options?.silent ?? false;
    if (isSilent && hasPendingLocalSync()) {
      return;
    }

    try {
      const loadedBranches = await ensureBranchesLoaded();
      const resolvedScope = resolveBranchScope(loadedBranches);

      if (resolvedScope.resolvedBranchId !== activeBranchIdRef.current) {
        setActiveBranchId(resolvedScope.resolvedBranchId);
        return;
      }
      isDataLoadingRef.current = true;
      if (!isSilent) {
        setIsDataLoading(true);
      }
      await loadPageDatasets(page, resolvedScope, { silent: isSilent });
    } catch (error) {
      console.error('Cloud bootstrap failed:', error);
      window.alert(getErrorMessage(error));
      clearSession();
    } finally {
      isDataLoadingRef.current = false;
      if (!isSilent) {
        setIsDataLoading(false);
      }
    }
  }, [clearSession, ensureBranchesLoaded, hasPendingLocalSync, loadPageDatasets, page, resolveBranchScope]);

  useEffect(() => {
    refreshCloudDataRef.current = refreshCloudData;
  }, [refreshCloudData]);

  useEffect(() => {
    currentBranchRef.current = currentBranch;
  }, [currentBranch]);

  useEffect(() => {
    if (!isBooting && accessToken && currentUser) {
      void refreshCloudData();
    }
  }, [isBooting, accessToken, currentUser, activeBranchId, page, refreshCloudData]);

  useEffect(() => {
    if (!accessToken || !currentUser) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.hidden || isDataLoadingRef.current) {
        return;
      }
      if (Date.now() - lastCloudRefreshAtRef.current < CLOUD_REFRESH_INTERVAL_MS) {
        return;
      }
      void refreshCloudDataRef.current({ silent: true });
    }, CLOUD_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [accessToken, currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    if (!canAccessPage(page)) {
      if (canAccessPage('Dashboard')) {
        setPage('Dashboard');
        return;
      }
      if (canAccessPage('Add Order')) {
        setPage('Add Order');
        return;
      }
      if (canAccessPage('Customers')) {
        setPage('Customers');
      }
    }
  }, [canAccessPage, currentUser, page]);

  const handleLogin = useCallback(async (payload: { tenantCode: string; username: string; password: string }) => {
    setIsAuthenticating(true);
    try {
      const session = await loginToCloud(payload);
      const nextBranchId = session.currentUser.role === 'branch_admin' ? session.currentUser.branchId || '' : 'all';
      datasetCacheRef.current = createEmptyDatasetCache();
      activeDatasetCacheKeysRef.current = {};
      branchesLoadedRef.current = false;
      isInitialCloudLoadCompleteRef.current = false;
      setIsInitialCloudLoadComplete(false);
      setIsPageLoading(false);
      setAccessToken(session.accessToken);
      setCurrentUser(session.currentUser);
      setActiveBranchId(nextBranchId);
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setPage('Dashboard');
    setEditingOrderId(null);
    setViewingInvoiceId(null);
    setInventoryState([]);
    setExpensesState([]);
    setMaterialSalesState([]);
    setEmployeesState([]);
    setSuppliersState([]);
  }, [clearSession]);

  const renderPage = () => {
    switch (page) {
      case 'Dashboard': return <Dashboard navigate={navigateTo} />;
      case 'Customers': return <Customers />;
      case 'Orders': return <Orders navigate={navigateTo} />;
      case 'Due Orders': return <DueOrders navigate={navigateTo} />;
      case 'Add Order': return <OrderForm navigate={navigateTo} />;
      case 'Edit Order': return <OrderForm orderId={editingOrderId} navigate={navigateTo} />;
      case 'Invoice': return viewingInvoiceId ? <Invoice orderId={viewingInvoiceId} navigate={navigateTo} /> : null;
      case 'Inventory': return <Inventory />;
      case 'Reports': return <Reports navigate={navigateTo} />;
      case 'Expenses': return <Expenses />;
      case 'Material Sales': return <MaterialSales />;
      case 'Employees': return <EmployeeManagement />;
      case 'Suppliers': return <SupplierManagement />;
      case 'SMS': return <SmsManagement />;
      case 'Users': return <UserManagement />;
      default: return <Dashboard navigate={navigateTo} />;
    }
  };

  const getInvoiceUrl = useCallback((orderId: string) => {
    const order = orders.find((current) => current.id === orderId);
    return order ? getCloudInvoiceUrl(order, accessToken) : null;
  }, [orders, accessToken]);

  if (isBooting || (accessToken && currentUser && !isInitialCloudLoadComplete)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#020617]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-white mx-auto mb-6" />
          <h2 className="text-sm font-black text-slate-500 uppercase tracking-[0.3em]">Connecting To Cloud...</h2>
        </div>
      </div>
    );
  }

  if (!accessToken || !currentUser) {
    return <Login onLogin={handleLogin} isLoading={isAuthenticating} />;
  }

  return (
    <AppContext.Provider value={{
      isCloudMode: true,
      currentUser,
      accessToken,
      branches,
      currentBranch,
      isAllBranchesScope,
      getBranchName,
      canAccessPage,
      canUseOrderAction,
      activeBranchId,
      setActiveBranchId,
      saveCustomer,
      deleteCustomer: deleteCustomerRecord,
      saveOrder,
      deleteOrder: deleteOrderRecord,
      saveInventoryItem,
      deleteInventoryItem: deleteInventoryRecord,
      saveEmployeeRecord: saveEmployee,
      deleteEmployeeRecord,
      saveEmployeeWorkLog,
      deleteEmployeeWorkLog,
      saveEmployeeSalaryPayment,
      deleteEmployeeSalaryPayment,
      refreshCloudData,
      isPageLoading,
      pageLoadingLabel,
      getInvoiceUrl,
      customers, setCustomers,
      orders, setOrders,
      inventory, setInventory,
      expenses, setExpenses,
      materialSales, setMaterialSales,
      employees, setEmployees,
      suppliers, setSuppliers,
      settings, setSettings
    }}>
      <div className="flex flex-col h-screen bg-gray-100">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar navigate={navigateTo} currentPage={page} onLogout={handleLogout} />
          <main className="relative flex-1 p-6 sm:p-8 overflow-y-auto">
            {isPageLoading && (
              <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary-600" />
                {pageLoadingLabel}
              </div>
            )}
            {renderPage()}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
};

export default App;
