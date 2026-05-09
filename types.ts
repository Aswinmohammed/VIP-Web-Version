

export interface Customer {
  id: string;
  // Added branchId for multi-branch support
  branchId: string;
  name: string;
  phone: string;
  address: string;
  email: string;
}

export interface Measurement {
  id: string;
  name: string;
  value: string;
}

export type DressType =
  | 'Shirt' | 'Shirt (Full Sleeve)' | 'Shirt (Half Sleeve)'
  | 'Trouser' | 'Trouser (Official)' | 'Trouser (Denim)' | 'Trouser (Cut Model)'
  | 'Jubba' | 'Coat' | 'Waist Coat'
  // School Wear
  | 'School Shirt' | 'School Trouser'
  // Middle Eastern
  | 'Thobe' | 'Thobe with pajama' | 'Jubba with pajama' | 'Kurta'
  // Bottom Wear
  | 'Elastic Trouser' | 'Elastic Shorts' | 'Band Shorts'
  // Accessories
  | 'Bow';

export const DRESS_TYPES: DressType[] = [
  'Shirt', 'Shirt (Full Sleeve)', 'Shirt (Half Sleeve)',
  'Trouser', 'Trouser (Official)', 'Trouser (Denim)', 'Trouser (Cut Model)',
  'School Shirt', 'School Trouser',
  'Thobe', 'Kurta', 'Thobe with pajama', 'Jubba with pajama', 'Jubba',
  'Coat', 'Waist Coat', 'Elastic Trouser', 'Elastic Shorts', 'Band Shorts', 'Bow'
];

export const INVENTORY_CATEGORIES = ['Shirt', 'School Shirt', 'Trouser', 'School Trouser', 'Thobe', 'Kurta', 'Jubba', 'Coat', 'Waist Coat', 'Elastic Trouser', 'Elastic Shorts', 'Band Shorts', 'Bow', 'Others'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

const SHIRT_BASE = [
  { id: 'm1', name: 'Neck', value: '' },
  { id: 'm2', name: 'Shoulder', value: '' },
  { id: 'm3', name: 'Chest', value: '' },
  { id: 'm4', name: 'Waist', value: '' },
  { id: 'm5', name: 'Hip', value: '' },
  { id: 'm6', name: 'Sleeve Length', value: '' },
  { id: 'm7', name: 'Cuff', value: '' },
  { id: 'm8', name: 'Length', value: '' }
];

const TROUSER_BASE = [
  { id: 'm9', name: 'Waist', value: '' },
  { id: 'm10', name: 'Hip', value: '' },
  { id: 'm11', name: 'Rise', value: '' },
  { id: 'm12', name: 'Thigh', value: '' },
  { id: 'm13', name: 'Knee', value: '' },
  { id: 'm14', name: 'Inseam', value: '' },
  { id: 'm15', name: 'Length', value: '' },
  { id: 'm16', name: 'Bottom', value: '' }
];

export const DEFAULT_MEASUREMENTS: Record<string, Measurement[]> = {
  'Shirt': SHIRT_BASE,
  'Shirt (Full Sleeve)': SHIRT_BASE,
  'Shirt (Half Sleeve)': SHIRT_BASE,
  'School Shirt': [
    { id: 'm1a', name: 'Neck', value: '' },
    { id: 'm2a', name: 'Shoulder', value: '' },
    { id: 'm3a', name: 'Chest', value: '' },
    { id: 'm6a', name: 'Sleeve Length', value: '' },
    { id: 'm8a', name: 'Length', value: '' }
  ],
  'Trouser': TROUSER_BASE,
  'Trouser (Official)': TROUSER_BASE,
  'Trouser (Denim)': TROUSER_BASE,
  'Trouser (Cut Model)': TROUSER_BASE,
  'School Trouser': [
    { id: 'm9a', name: 'Waist', value: '' },
    { id: 'm12a', name: 'Thigh', value: '' },
    { id: 'm14a', name: 'Inseam', value: '' },
    { id: 'm16a', name: 'Bottom', value: '' }
  ],
  'Jubba': [
    { id: 'm17', name: 'Neck', value: '' },
    { id: 'm18', name: 'Shoulder', value: '' },
    { id: 'm19', name: 'Chest', value: '' },
    { id: 'm20', name: 'Waist', value: '' },
    { id: 'm21', name: 'Sleeve', value: '' },
    { id: 'm22', name: 'Length', value: '' }
  ],
  'Thobe': [
    { id: 'm23', name: 'Neck', value: '' },
    { id: 'm24', name: 'Shoulder', value: '' },
    { id: 'm25', name: 'Chest', value: '' },
    { id: 'm26', name: 'Sleeve', value: '' },
    { id: 'm27', name: 'Length', value: '' }
  ],
  'Thobe with pajama': [
    { id: 'm28', name: 'Thobe Neck', value: '' },
    { id: 'm29', name: 'Thobe Shoulder', value: '' },
    { id: 'm30', name: 'Thobe Chest', value: '' },
    { id: 'm31', name: 'Thobe Sleeve', value: '' },
    { id: 'm32', name: 'Thobe Length', value: '' },
    { id: 'm33', name: 'Pajama Waist', value: '' },
    { id: 'm34', name: 'Pajama Inseam', value: '' }
  ],
  'Jubba with pajama': [
    { id: 'm35', name: 'Jubba Neck', value: '' },
    { id: 'm36', name: 'Jubba Shoulder', value: '' },
    { id: 'm37', name: 'Jubba Chest', value: '' },
    { id: 'm38', name: 'Jubba Sleeve', value: '' },
    { id: 'm39', name: 'Jubba Length', value: '' },
    { id: 'm40', name: 'Pajama Waist', value: '' },
    { id: 'm41', name: 'Pajama Inseam', value: '' }
  ],
  'Kurta': [
    { id: 'm42', name: 'Neck', value: '' },
    { id: 'm43', name: 'Shoulder', value: '' },
    { id: 'm44', name: 'Chest', value: '' },
    { id: 'm45', name: 'Sleeve', value: '' },
    { id: 'm46', name: 'Length', value: '' }
  ],
  'Coat': [
    { id: 'm47', name: 'Neck', value: '' },
    { id: 'm48', name: 'Shoulder', value: '' },
    { id: 'm49', name: 'Chest', value: '' },
    { id: 'm50', name: 'Sleeve Length', value: '' },
    { id: 'm51', name: 'Length', value: '' }
  ],
  'Waist Coat': [
    { id: 'm52', name: 'Chest', value: '' },
    { id: 'm53', name: 'Waist', value: '' },
    { id: 'm54', name: 'Length', value: '' }
  ],
  'Elastic Trouser': [
    { id: 'm55', name: 'Waist', value: '' },
    { id: 'm56', name: 'Hip', value: '' },
    { id: 'm57', name: 'Inseam', value: '' },
    { id: 'm58', name: 'Bottom', value: '' }
  ],
  'Elastic Shorts': [
    { id: 'm59', name: 'Waist', value: '' },
    { id: 'm60', name: 'Hip', value: '' },
    { id: 'm61', name: 'Length', value: '' }
  ],
  'Band Shorts': [
    { id: 'm62', name: 'Waist', value: '' },
    { id: 'm63', name: 'Hip', value: '' },
    { id: 'm64', name: 'Length', value: '' }
  ],
  'Bow': [
    { id: 'm65', name: 'Width', value: '' },
    { id: 'm66', name: 'Length', value: '' }
  ]
};

export interface OrderItem {
  id: string;
  serverId?: string;
  dressType: DressType | string;
  inventoryItemId?: string;
  clothCode?: string;
  clothName?: string;
  clothSize?: number;
  stitchFee?: number;
  quantity: number;
  pricePerUnit: number;
  measurements: Measurement[];
  note?: string;
  isCut?: boolean;
  quality?: string;
  completedQuantity?: number;
  completionStatus?: 'pending' | 'partial' | 'completed';
  completionData?: boolean[];
}

export interface Payment {
  id: string;
  serverId?: string;
  // Added branchId for tracking payment source branch
  branchId?: string;
  // Added collectorId to track the user who collected the payment
  collectorId?: string;
  amount: number;
  date: string;
  method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque';
  note?: string;
}

export interface Order {
  id: string;
  serverId?: string;
  // Added branchId for multi-branch operation support
  branchId?: string;
  branchName?: string;
  branchCode?: string;
  branchAddress?: string;
  branchPhone?: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  orderDate: string;
  dueDate: string;
  status: 'Pending' | 'Hold' | 'In Progress' | 'Completed' | 'Due' | 'Delivered' | 'Packed';
  items: OrderItem[];
  discount: number;
  advance: number;
  payments?: Payment[];
  emergency?: boolean;
  isCalled?: boolean;
  calledTimestamp?: string;
  callHistory?: string[];
  bagCount?: number;
}

export interface InventoryItem {
  id: string;
  // Added branchId for multi-branch operation support
  branchId: string;
  itemCode: string;
  barcodeValue?: string;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  wholesalePrice: number;
  lastUpdated: string;
}

export interface Expense {
  id: string;
  // Added branchId for multi-branch operation support
  branchId: string;
  description: string;
  amount: number;
  date: string;
}

export interface Settings {
  appExpiryDate?: string;
  lifetimeLicense?: boolean;
  centerName?: string;
  shopName?: string;
  lastOrderNumber?: number;
  locations?: string[];
}

export interface MaterialSale {
  id: string;
  branchId: string;
  date: string;
  items: {
    itemId: string; // Added to track which item to revert stock for
    category: string;
    quantity: number;
    unitPrice: number; // This is the selling price
    costPrice: number; // Added costPrice to snap the cost at time of sale
    amount: number;
  }[];
  totalAmount: number;
  discount?: number; // Added discount field
  paidAmount?: number;
  paymentMethod?: 'Cash' | 'Card' | 'Bank Transfer';
  customerName?: string;
  status?: 'Paid' | 'Due';
}

export interface SalaryPayment {
  id: string;
  amount: number;
  date: string; // ISO date string YYYY-MM-DD
  timestamp: string; // Readable timestamp or ISO string
  note?: string;
}

export interface WorkLog {
  id: string;
  dressType: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  date: string; // ISO date string YYYY-MM-DD
  timestamp: string;
  // Hour-based fields
  startHour?: string;
  endHour?: string;
  salaryPerHour?: number;
  autoGenerated?: boolean;
  sourceBranchId?: string;
  sourceOrderId?: string;
  sourceOrderItemId?: string;
}

export interface BranchPieceRate {
  id: string;
  rate: number;
  effectiveFrom: string;
  note?: string;
  createdAt?: string;
}

export type EmployeeType = 'CutBase' | 'HourBase' | 'BranchEmployee';

export interface Employee {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  type: EmployeeType; // Added type field
  salarySourceBranchId?: string;
  pieceRates?: Record<string, number>;
  branchPieceRateHistory?: BranchPieceRate[];
  workLogs: WorkLog[];
  salaryPayments: SalaryPayment[];
  joinedDate: string;
}

export interface SupplierPurchase {
  id: string;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  date: string;
  timestamp: string;
}

export interface SupplierPayment {
  id: string;
  amount: number;
  date: string;
  method: 'Cheque' | 'Bank Transfer' | 'Money';
  timestamp: string;
  note?: string;
}

export interface Supplier {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  purchases: SupplierPurchase[];
  payments: SupplierPayment[];
  joinedDate: string;
}

export type UserRole = 'master_admin' | 'branch_admin';

export const ACCESS_AREAS = [
  'dashboard',
  'customers',
  'orders',
  'add_order',
  'inventory',
  'material_sales',
  'suppliers',
  'employees',
  'expenses',
  'reports',
] as const;

export type AccessArea = (typeof ACCESS_AREAS)[number];

export const ORDER_ACTIONS = [
  'cut_sheet',
  'track_completion',
  'invoice',
  'edit',
  'delete',
] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
  isProductionHub: boolean;
  accessAreas: AccessArea[];
  orderActions: OrderAction[];
}

export interface CurrentUser {
  id: string;
  tenantId: string;
  branchId?: string | null;
  username: string;
  role: UserRole;
  isActive: boolean;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  branchId?: string | null;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type SmsTemplateCategory = 'transactional' | 'marketing' | 'festival';

export type SmsLogStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'skipped' | 'cancelled';

export type SmsCampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled';

export interface SmsSettings {
  id: string;
  tenantId: string;
  providerName?: string | null;
  senderId?: string | null;
  apiBaseUrl?: string | null;
  apiKeyRef?: string | null;
  isEnabled: boolean;
  transactionalEnabled: boolean;
  marketingEnabled: boolean;
  dailySmsLimit: number;
  campaignRecipientLimit: number;
  costPerSegment: number;
  dueReminderDelayDays: number;
  inactiveCustomerDays: number;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplate {
  id: string;
  tenantId: string;
  branchId?: string | null;
  code: string;
  name: string;
  category: SmsTemplateCategory;
  triggerEvent?: string | null;
  isEnabled: boolean;
  content: string;
  variables: string[];
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsLog {
  id: string;
  tenantId: string;
  branchId: string;
  customerId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  campaignId?: string | null;
  templateId?: string | null;
  smsType: string;
  triggerEvent?: string | null;
  dedupeKey: string;
  phoneRaw?: string | null;
  phoneNormalized?: string | null;
  messageBody: string;
  status: SmsLogStatus;
  providerName?: string | null;
  providerMessageId?: string | null;
  segmentCount: number;
  estimatedCost: number;
  actualCost: number;
  retryCount: number;
  errorMessage?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmsAnalytics {
  queuedCount: number;
  sentToday: number;
  failedToday: number;
  deliveredToday: number;
  sentThisMonth: number;
  estimatedCostToday: number;
  estimatedCostThisMonth: number;
}

export interface SmsManualSendResult {
  status: SmsLogStatus;
  phoneNormalized?: string | null;
  providerMessageId?: string | null;
  segmentCount: number;
  estimatedCost: number;
  message: string;
}

export interface SmsCampaignFilter {
  branchId?: string | null;
  lastVisitFrom?: string;
  lastVisitTo?: string;
  totalOrdersMin?: number;
  outstandingBalanceMin?: number;
  includeInactive: boolean;
}

export interface SmsCampaignPreviewRecipient {
  customerId: string;
  customerName: string;
  phoneNormalized?: string | null;
  renderedMessage: string;
}

export interface SmsCampaignPreview {
  recipientCount: number;
  totalSegments: number;
  estimatedCost: number;
  samples: SmsCampaignPreviewRecipient[];
}

export interface SmsCampaign {
  id: string;
  tenantId: string;
  branchId?: string | null;
  createdBy?: string | null;
  templateId?: string | null;
  name: string;
  campaignType: string;
  status: SmsCampaignStatus;
  messageTemplate: string;
  filter: Record<string, unknown>;
  recipientCountEstimate: number;
  recipientCountActual: number;
  estimatedCost: number;
  actualCost: number;
  scheduledAt?: string | null;
  launchedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Page = 'Dashboard' | 'Customers' | 'Orders' | 'Add Order' | 'Edit Order' | 'Invoice' | 'Inventory' | 'Expenses' | 'Reports' | 'Due Orders' | 'Material Sales' | 'Employees' | 'Suppliers' | 'SMS' | 'Users';
