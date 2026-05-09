
import { createContext, Dispatch, SetStateAction } from 'react';
import { Branch, CurrentUser, Customer, Order, InventoryItem, Expense, Settings, MaterialSale, Employee, SalaryPayment, Supplier, WorkLog, OrderAction, Page } from '../types';

interface AppContextType {
  isCloudMode: boolean;
  currentUser: CurrentUser | null;
  accessToken: string | null;
  branches: Branch[];
  currentBranch: Branch | null;
  isAllBranchesScope: boolean;
  getBranchName: (branchId?: string | null) => string;
  canAccessPage: (page: Page) => boolean;
  canUseOrderAction: (action: OrderAction) => boolean;
  activeBranchId: string;
  setActiveBranchId: Dispatch<SetStateAction<string>>;
  saveCustomer: (customer: Customer) => Promise<Customer>;
  deleteCustomer: (customerId: string) => Promise<void>;
  saveOrder: (order: Order) => Promise<Order>;
  deleteOrder: (orderId: string) => Promise<void>;
  saveInventoryItem: (item: InventoryItem) => Promise<InventoryItem>;
  deleteInventoryItem: (itemId: string) => Promise<void>;
  saveEmployeeRecord: (employee: Employee) => Promise<Employee>;
  deleteEmployeeRecord: (employeeId: string) => Promise<void>;
  saveEmployeeWorkLog: (employeeId: string, workLog: WorkLog) => Promise<WorkLog>;
  deleteEmployeeWorkLog: (employeeId: string, workLogId: string) => Promise<void>;
  saveEmployeeSalaryPayment: (employeeId: string, payment: SalaryPayment) => Promise<SalaryPayment>;
  deleteEmployeeSalaryPayment: (employeeId: string, paymentId: string) => Promise<void>;
  refreshCloudData: (options?: { silent?: boolean }) => Promise<void>;
  isPageLoading: boolean;
  pageLoadingLabel: string;
  getInvoiceUrl: (orderId: string) => string | null;
  customers: Customer[];
  setCustomers: Dispatch<SetStateAction<Customer[]>>;
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  inventory: InventoryItem[];
  setInventory: Dispatch<SetStateAction<InventoryItem[]>>;
  expenses: Expense[];
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  materialSales: MaterialSale[];
  setMaterialSales: Dispatch<SetStateAction<MaterialSale[]>>;
  employees: Employee[];
  setEmployees: Dispatch<SetStateAction<Employee[]>>;
  suppliers: Supplier[];
  setSuppliers: Dispatch<SetStateAction<Supplier[]>>;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
