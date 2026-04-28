import {
  AccessArea,
  BranchPieceRate,
  Branch,
  CurrentUser,
  Customer,
  Employee,
  Expense,
  InventoryItem,
  MaterialSale,
  Measurement,
  Order,
  OrderAction,
  OrderItem,
  Payment,
  SalaryPayment,
  SmsAnalytics,
  SmsCampaign,
  SmsCampaignFilter,
  SmsCampaignPreview,
  SmsCampaignPreviewRecipient,
  SmsLog,
  SmsLogStatus,
  SmsManualSendResult,
  SmsSettings,
  SmsTemplate,
  SmsTemplateCategory,
  Supplier,
  SupplierPayment,
  SupplierPurchase,
  TenantUser,
  WorkLog,
} from '../types';

const API_BASE = '/api/v1';

type LoginPayload = {
  tenantCode: string;
  username: string;
  password: string;
};

type TokenUser = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  username: string;
  role: 'master_admin' | 'branch_admin';
  is_active: boolean;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  user: TokenUser;
};

type ApiBranch = {
  id: string;
  tenant_id?: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  is_production_hub?: boolean;
  access_areas?: AccessArea[] | null;
  order_actions?: OrderAction[] | null;
};

type ApiUser = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  username: string;
  role: 'master_admin' | 'branch_admin';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type ApiCustomer = {
  id: string;
  branch_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
};

type ApiMeasurementValue = {
  id: string;
  legacy_id?: string | null;
  name: string;
  value?: string | null;
};

type ApiOrderItem = {
  id: string;
  legacy_id?: string | null;
  dress_type: string;
  inventory_item_id?: string | null;
  cloth_code?: string | null;
  cloth_name?: string | null;
  cloth_size?: number | null;
  stitch_fee?: number | null;
  quantity: number;
  price_per_unit: number;
  note?: string | null;
  is_cut: boolean;
  quality?: string | null;
  completed_quantity: number;
  completion_data?: boolean[] | null;
  completion_status: 'pending' | 'partial' | 'completed';
  measurements?: ApiMeasurementValue[];
};

type ApiPayment = {
  id: string;
  legacy_id?: string | null;
  branch_id: string;
  collector_user_id?: string | null;
  amount: number;
  payment_date: string;
  method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | null;
  note?: string | null;
};

type ApiOrder = {
  id: string;
  branch_id: string;
  branch_name?: string | null;
  branch_code?: string | null;
  branch_address?: string | null;
  branch_phone?: string | null;
  customer_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  order_number: string;
  order_date: string;
  due_date?: string | null;
  status: Order['status'];
  discount: number;
  advance: number;
  emergency: boolean;
  is_called: boolean;
  called_timestamp?: string | null;
  call_history?: string[] | null;
  bag_count?: number | null;
  items: ApiOrderItem[];
  payments: ApiPayment[];
};

type ApiProductionNotification = {
  branch_id: string;
  branch_name: string;
  latest_order_number: string;
  count: number;
};

type ApiInventoryItem = {
  id: string;
  branch_id: string;
  item_code?: string | null;
  barcode_value?: string | null;
  name: string;
  category: string;
  quantity: number;
  unit_price: number;
  mrp: number;
  wholesale_price?: number;
  last_updated?: string | null;
};

type ApiExpense = {
  id: string;
  branch_id: string;
  description: string;
  amount: number;
  expense_date: string;
};

type ApiMaterialSaleItem = {
  id: string;
  inventory_item_id?: string | null;
  source_inventory_legacy_id?: string | null;
  category: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  amount: number;
};

type ApiMaterialSale = {
  id: string;
  branch_id: string;
  sale_date: string;
  total_amount: number;
  discount: number;
  paid_amount: number;
  payment_method?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | null;
  customer_name?: string | null;
  status?: 'Paid' | 'Due' | null;
  items: ApiMaterialSaleItem[];
};

type ApiEmployeeWorkLog = {
  id: string;
  legacy_id?: string | null;
  dress_type: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  work_date: string;
  recorded_at?: string | null;
  start_hour?: string | null;
  end_hour?: string | null;
  salary_per_hour?: number | null;
  auto_generated?: boolean;
  source_branch_id?: string | null;
  source_order_id?: string | null;
  source_order_item_id?: string | null;
};

type ApiEmployeeSalaryPayment = {
  id: string;
  legacy_id?: string | null;
  amount: number;
  payment_date: string;
  recorded_at?: string | null;
  note?: string | null;
};

type ApiEmployee = {
  id: string;
  branch_id: string;
  name: string;
  phone?: string | null;
  type: 'CutBase' | 'HourBase' | 'BranchEmployee';
  salary_source_branch_id?: string | null;
  piece_rates?: Record<string, number> | null;
  branch_piece_rate_history?: Array<{
    id?: string | null;
    rate: number;
    effective_from: string;
    note?: string | null;
    created_at?: string | null;
  }> | null;
  joined_date?: string | null;
  work_logs: ApiEmployeeWorkLog[];
  salary_payments: ApiEmployeeSalaryPayment[];
};

type ApiSupplierPurchase = {
  id: string;
  legacy_id?: string | null;
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount: number;
  purchase_date: string;
  recorded_at?: string | null;
};

type ApiSupplierPayment = {
  id: string;
  legacy_id?: string | null;
  amount: number;
  payment_date: string;
  method: 'Cheque' | 'Bank Transfer' | 'Money';
  recorded_at?: string | null;
  note?: string | null;
};

type ApiSupplier = {
  id: string;
  branch_id: string;
  name: string;
  phone?: string | null;
  joined_date?: string | null;
  purchases: ApiSupplierPurchase[];
  payments: ApiSupplierPayment[];
};

type ApiSmsSettings = {
  id: string;
  tenant_id: string;
  provider_name?: string | null;
  sender_id?: string | null;
  api_base_url?: string | null;
  api_key_ref?: string | null;
  is_enabled: boolean;
  transactional_enabled: boolean;
  marketing_enabled: boolean;
  daily_sms_limit: number;
  campaign_recipient_limit: number;
  cost_per_segment: number | string;
  due_reminder_delay_days: number;
  inactive_customer_days: number;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  max_retries: number;
  created_at: string;
  updated_at: string;
};

type ApiSmsTemplate = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  code: string;
  name: string;
  category: SmsTemplateCategory;
  trigger_event?: string | null;
  is_enabled: boolean;
  content: string;
  variables_json: string[];
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

type ApiSmsLog = {
  id: string;
  tenant_id: string;
  branch_id: string;
  customer_id?: string | null;
  order_id?: string | null;
  payment_id?: string | null;
  campaign_id?: string | null;
  template_id?: string | null;
  sms_type: string;
  trigger_event?: string | null;
  dedupe_key: string;
  phone_raw?: string | null;
  phone_normalized?: string | null;
  message_body: string;
  status: SmsLogStatus;
  provider_name?: string | null;
  provider_message_id?: string | null;
  segment_count: number;
  estimated_cost: number | string;
  actual_cost: number | string;
  retry_count: number;
  error_message?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ApiSmsAnalytics = {
  queued_count: number;
  sent_today: number;
  failed_today: number;
  delivered_today: number;
  sent_this_month: number;
  estimated_cost_today: number | string;
  estimated_cost_this_month: number | string;
};

type ApiSmsManualSendResponse = {
  status: SmsLogStatus;
  phone_normalized?: string | null;
  provider_message_id?: string | null;
  segment_count: number;
  estimated_cost: number | string;
  message: string;
};

type ApiSmsCampaignPreviewRecipient = {
  customer_id: string;
  customer_name: string;
  phone_normalized?: string | null;
  rendered_message: string;
};

type ApiSmsCampaignPreview = {
  recipient_count: number;
  total_segments: number;
  estimated_cost: number | string;
  samples: ApiSmsCampaignPreviewRecipient[];
};

type ApiSmsCampaign = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  created_by?: string | null;
  template_id?: string | null;
  name: string;
  campaign_type: string;
  status: SmsCampaign['status'];
  message_template: string;
  filter_json: Record<string, unknown>;
  recipient_count_estimate: number;
  recipient_count_actual: number;
  estimated_cost: number | string;
  actual_cost: number | string;
  scheduled_at?: string | null;
  launched_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

function jsonHeaders(token?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed with ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function toNumericValue(value: number | string | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function isUuid(value?: string | null): boolean {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function toIsoDateTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return `${trimmedValue}T00:00:00Z`;
  }
  if (trimmedValue.includes('T')) {
    return trimmedValue;
  }

  const localizedMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (localizedMatch) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = localizedMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }

  const parsedValue = Date.parse(trimmedValue);
  if (!Number.isNaN(parsedValue)) {
    return new Date(parsedValue).toISOString();
  }

  return `${trimmedValue}T00:00:00Z`;
}

function toCurrentUser(user: TokenUser): CurrentUser {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    branchId: user.branch_id ?? undefined,
    username: user.username,
    role: user.role,
    isActive: user.is_active,
  };
}

function toBranch(branch: ApiBranch): Branch {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    isActive: branch.is_active,
    isProductionHub: Boolean(branch.is_production_hub),
    accessAreas: branch.access_areas ?? [],
    orderActions: branch.order_actions ?? [],
  };
}

function toTenantUser(user: ApiUser): TenantUser {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    branchId: user.branch_id ?? undefined,
    username: user.username,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function toCustomer(customer: ApiCustomer): Customer {
  return {
    id: customer.id,
    branchId: customer.branch_id,
    name: customer.name,
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    email: customer.email ?? '',
  };
}

function toMeasurement(measurement: ApiMeasurementValue): Measurement {
  return {
    id: measurement.legacy_id || measurement.id,
    name: measurement.name,
    value: measurement.value ?? '',
  };
}

function toOrderItem(item: ApiOrderItem, measurementsByLegacyId: Map<string, Measurement[]>): OrderItem {
  const clientId = item.legacy_id || item.id;
  const directMeasurements = (item.measurements || []).map(toMeasurement);
  return {
    id: clientId,
    serverId: item.id,
    dressType: item.dress_type,
    inventoryItemId: item.inventory_item_id ?? undefined,
    clothCode: item.cloth_code ?? '',
    clothName: item.cloth_name ?? '',
    clothSize: item.cloth_size ?? 0,
    stitchFee: item.stitch_fee != null ? Number(item.stitch_fee) : 0,
    quantity: item.quantity,
    pricePerUnit: Number(item.price_per_unit),
    measurements: directMeasurements.length > 0 ? directMeasurements : measurementsByLegacyId.get(clientId) || [],
    note: item.note ?? '',
    isCut: item.is_cut,
    quality: item.quality ?? '',
    completedQuantity: item.completed_quantity ?? 0,
    completionData: item.completion_data ?? [],
    completionStatus: item.completion_status,
  };
}

function toPayment(payment: ApiPayment): Payment {
  return {
    id: payment.legacy_id || payment.id,
    serverId: payment.id,
    branchId: payment.branch_id,
    collectorId: payment.collector_user_id ?? undefined,
    amount: Number(payment.amount),
    date: payment.payment_date,
    method: payment.method ?? undefined,
    note: payment.note ?? '',
  };
}

function toOrder(order: ApiOrder): Order {
  const measurementsByLegacyId = new Map<string, Measurement[]>();
  order.items.forEach((item) => {
    measurementsByLegacyId.set(item.legacy_id || item.id, []);
  });
  return {
    id: order.order_number,
    serverId: order.id,
    branchId: order.branch_id,
    branchName: order.branch_name ?? undefined,
    branchCode: order.branch_code ?? undefined,
    branchAddress: order.branch_address ?? undefined,
    branchPhone: order.branch_phone ?? undefined,
    customerId: order.customer_id,
    customerName: order.customer_name ?? undefined,
    customerPhone: order.customer_phone ?? undefined,
    orderDate: order.order_date,
    dueDate: order.due_date ?? '',
    status: order.status,
    items: order.items.map((item) => toOrderItem(item, measurementsByLegacyId)),
    discount: Number(order.discount),
    advance: Number(order.advance),
    payments: order.payments.map(toPayment),
    emergency: order.emergency,
    isCalled: order.is_called,
    calledTimestamp: order.called_timestamp ?? undefined,
    callHistory: order.call_history ?? [],
    bagCount: order.bag_count ?? undefined,
  };
}

function toInventoryItem(item: ApiInventoryItem): InventoryItem {
  return {
    id: item.id,
    branchId: item.branch_id,
    itemCode: item.item_code ?? '',
    barcodeValue: item.barcode_value ?? item.item_code ?? '',
    name: item.name,
    category: item.category,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    mrp: Number(item.mrp),
    wholesalePrice: Number(item.wholesale_price ?? 0),
    lastUpdated: item.last_updated ? item.last_updated.split('T')[0] : '',
  };
}

function toExpense(expense: ApiExpense): Expense {
  return {
    id: expense.id,
    branchId: expense.branch_id,
    description: expense.description,
    amount: Number(expense.amount),
    date: expense.expense_date,
  };
}

function toMaterialSale(sale: ApiMaterialSale): MaterialSale {
  return {
    id: sale.id,
    branchId: sale.branch_id,
    date: sale.sale_date,
    totalAmount: Number(sale.total_amount),
    discount: Number(sale.discount),
    paidAmount: Number(sale.paid_amount),
    paymentMethod: sale.payment_method ?? undefined,
    customerName: sale.customer_name ?? undefined,
    status: sale.status ?? undefined,
    items: sale.items.map((item) => ({
      itemId: item.inventory_item_id || item.source_inventory_legacy_id || item.id,
      category: item.category,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      costPrice: Number(item.cost_price),
      amount: Number(item.amount),
    })),
  };
}

function toWorkLog(workLog: ApiEmployeeWorkLog): WorkLog {
  return {
    id: workLog.legacy_id || workLog.id,
    dressType: workLog.dress_type,
    quantity: Number(workLog.quantity),
    unitPrice: Number(workLog.unit_price),
    totalAmount: Number(workLog.total_amount),
    date: workLog.work_date,
    timestamp: workLog.recorded_at || workLog.work_date,
    startHour: workLog.start_hour ?? undefined,
    endHour: workLog.end_hour ?? undefined,
    salaryPerHour: workLog.salary_per_hour != null ? Number(workLog.salary_per_hour) : undefined,
    autoGenerated: Boolean(workLog.auto_generated),
    sourceBranchId: workLog.source_branch_id ?? undefined,
    sourceOrderId: workLog.source_order_id ?? undefined,
    sourceOrderItemId: workLog.source_order_item_id ?? undefined,
  };
}

function toSalaryPayment(payment: ApiEmployeeSalaryPayment): SalaryPayment {
  return {
    id: payment.legacy_id || payment.id,
    amount: Number(payment.amount),
    date: payment.payment_date,
    timestamp: payment.recorded_at || payment.payment_date,
    note: payment.note ?? undefined,
  };
}

function toEmployee(employee: ApiEmployee): Employee {
  return {
    id: employee.id,
    branchId: employee.branch_id,
    name: employee.name,
    phone: employee.phone ?? '',
    type: employee.type,
    salarySourceBranchId: employee.salary_source_branch_id ?? undefined,
    pieceRates: employee.piece_rates ?? {},
    branchPieceRateHistory: (employee.branch_piece_rate_history ?? []).map((entry): BranchPieceRate => ({
      id: entry.id || `BRRATE-${entry.effective_from}-${entry.rate}`,
      rate: Number(entry.rate),
      effectiveFrom: entry.effective_from,
      note: entry.note ?? undefined,
      createdAt: entry.created_at ?? undefined,
    })),
    joinedDate: employee.joined_date ?? '',
    workLogs: employee.work_logs.map(toWorkLog),
    salaryPayments: employee.salary_payments.map(toSalaryPayment),
  };
}

function toSupplierPurchase(purchase: ApiSupplierPurchase): SupplierPurchase {
  return {
    id: purchase.legacy_id || purchase.id,
    description: purchase.description,
    quantity: purchase.quantity != null ? Number(purchase.quantity) : undefined,
    unitPrice: purchase.unit_price != null ? Number(purchase.unit_price) : undefined,
    amount: Number(purchase.amount),
    date: purchase.purchase_date,
    timestamp: purchase.recorded_at || purchase.purchase_date,
  };
}

function toSupplierPayment(payment: ApiSupplierPayment): SupplierPayment {
  return {
    id: payment.legacy_id || payment.id,
    amount: Number(payment.amount),
    date: payment.payment_date,
    method: payment.method,
    timestamp: payment.recorded_at || payment.payment_date,
    note: payment.note ?? undefined,
  };
}

function toSupplier(supplier: ApiSupplier): Supplier {
  return {
    id: supplier.id,
    branchId: supplier.branch_id,
    name: supplier.name,
    phone: supplier.phone ?? '',
    joinedDate: supplier.joined_date ?? '',
    purchases: supplier.purchases.map(toSupplierPurchase),
    payments: supplier.payments.map(toSupplierPayment),
  };
}

function toSmsSettings(settings: ApiSmsSettings): SmsSettings {
  return {
    id: settings.id,
    tenantId: settings.tenant_id,
    providerName: settings.provider_name ?? undefined,
    senderId: settings.sender_id ?? undefined,
    apiBaseUrl: settings.api_base_url ?? undefined,
    apiKeyRef: settings.api_key_ref ?? undefined,
    isEnabled: settings.is_enabled,
    transactionalEnabled: settings.transactional_enabled,
    marketingEnabled: settings.marketing_enabled,
    dailySmsLimit: settings.daily_sms_limit,
    campaignRecipientLimit: settings.campaign_recipient_limit,
    costPerSegment: toNumericValue(settings.cost_per_segment),
    dueReminderDelayDays: settings.due_reminder_delay_days,
    inactiveCustomerDays: settings.inactive_customer_days,
    quietHoursStart: settings.quiet_hours_start ?? undefined,
    quietHoursEnd: settings.quiet_hours_end ?? undefined,
    maxRetries: settings.max_retries,
    createdAt: settings.created_at,
    updatedAt: settings.updated_at,
  };
}

function toSmsTemplate(template: ApiSmsTemplate): SmsTemplate {
  return {
    id: template.id,
    tenantId: template.tenant_id,
    branchId: template.branch_id ?? undefined,
    code: template.code,
    name: template.name,
    category: template.category,
    triggerEvent: template.trigger_event ?? undefined,
    isEnabled: template.is_enabled,
    content: template.content,
    variables: template.variables_json ?? [],
    updatedBy: template.updated_by ?? undefined,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function toSmsLog(log: ApiSmsLog): SmsLog {
  return {
    id: log.id,
    tenantId: log.tenant_id,
    branchId: log.branch_id,
    customerId: log.customer_id ?? undefined,
    orderId: log.order_id ?? undefined,
    paymentId: log.payment_id ?? undefined,
    campaignId: log.campaign_id ?? undefined,
    templateId: log.template_id ?? undefined,
    smsType: log.sms_type,
    triggerEvent: log.trigger_event ?? undefined,
    dedupeKey: log.dedupe_key,
    phoneRaw: log.phone_raw ?? undefined,
    phoneNormalized: log.phone_normalized ?? undefined,
    messageBody: log.message_body,
    status: log.status,
    providerName: log.provider_name ?? undefined,
    providerMessageId: log.provider_message_id ?? undefined,
    segmentCount: log.segment_count,
    estimatedCost: toNumericValue(log.estimated_cost),
    actualCost: toNumericValue(log.actual_cost),
    retryCount: log.retry_count,
    errorMessage: log.error_message ?? undefined,
    scheduledAt: log.scheduled_at ?? undefined,
    sentAt: log.sent_at ?? undefined,
    deliveredAt: log.delivered_at ?? undefined,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
  };
}

function toSmsAnalytics(analytics: ApiSmsAnalytics): SmsAnalytics {
  return {
    queuedCount: analytics.queued_count,
    sentToday: analytics.sent_today,
    failedToday: analytics.failed_today,
    deliveredToday: analytics.delivered_today,
    sentThisMonth: analytics.sent_this_month,
    estimatedCostToday: toNumericValue(analytics.estimated_cost_today),
    estimatedCostThisMonth: toNumericValue(analytics.estimated_cost_this_month),
  };
}

function toSmsManualSendResult(result: ApiSmsManualSendResponse): SmsManualSendResult {
  return {
    status: result.status,
    phoneNormalized: result.phone_normalized ?? undefined,
    providerMessageId: result.provider_message_id ?? undefined,
    segmentCount: result.segment_count,
    estimatedCost: toNumericValue(result.estimated_cost),
    message: result.message,
  };
}

function toSmsCampaignPreviewRecipient(recipient: ApiSmsCampaignPreviewRecipient): SmsCampaignPreviewRecipient {
  return {
    customerId: recipient.customer_id,
    customerName: recipient.customer_name,
    phoneNormalized: recipient.phone_normalized ?? undefined,
    renderedMessage: recipient.rendered_message,
  };
}

function toSmsCampaignPreview(preview: ApiSmsCampaignPreview): SmsCampaignPreview {
  return {
    recipientCount: preview.recipient_count,
    totalSegments: preview.total_segments,
    estimatedCost: toNumericValue(preview.estimated_cost),
    samples: preview.samples.map(toSmsCampaignPreviewRecipient),
  };
}

function toSmsCampaign(campaign: ApiSmsCampaign): SmsCampaign {
  return {
    id: campaign.id,
    tenantId: campaign.tenant_id,
    branchId: campaign.branch_id ?? undefined,
    createdBy: campaign.created_by ?? undefined,
    templateId: campaign.template_id ?? undefined,
    name: campaign.name,
    campaignType: campaign.campaign_type,
    status: campaign.status,
    messageTemplate: campaign.message_template,
    filter: campaign.filter_json ?? {},
    recipientCountEstimate: campaign.recipient_count_estimate,
    recipientCountActual: campaign.recipient_count_actual,
    estimatedCost: toNumericValue(campaign.estimated_cost),
    actualCost: toNumericValue(campaign.actual_cost),
    scheduledAt: campaign.scheduled_at ?? undefined,
    launchedAt: campaign.launched_at ?? undefined,
    completedAt: campaign.completed_at ?? undefined,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
  };
}

function fromPayment(payment: Payment) {
  return {
    amount: Number(payment.amount || 0),
    payment_date: payment.date,
    method: payment.method || null,
    note: payment.note || null,
  };
}

function fromOrder(order: Order) {
  return {
    branch_id: order.branchId || null,
    customer_id: order.customerId,
    order_number: order.id,
    order_date: order.orderDate,
    due_date: order.dueDate || null,
    status: order.status,
    discount: Number(order.discount || 0),
    advance: Number(order.advance || 0),
    emergency: Boolean(order.emergency),
    is_called: Boolean(order.isCalled),
    called_timestamp: order.calledTimestamp || null,
    call_history: order.callHistory || [],
    bag_count: order.bagCount ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      dress_type: item.dressType,
      inventory_item_id: isUuid(item.inventoryItemId) ? item.inventoryItemId : null,
      cloth_code: item.clothCode || null,
      cloth_name: item.clothName || null,
      cloth_size: item.clothSize ?? null,
      stitch_fee: Number(item.stitchFee || 0),
      quantity: Number(item.quantity || 0),
      price_per_unit: Number(item.pricePerUnit || 0),
      measurements: (item.measurements || []).map((measurement, index) => ({
        id: measurement.id,
        name: measurement.name,
        value: measurement.value,
        sort_order: index,
      })),
      note: item.note || null,
      is_cut: Boolean(item.isCut),
      quality: item.quality || null,
      completed_quantity: Number(item.completedQuantity || 0),
      completion_data: item.completionData || [],
      completion_status: item.completionStatus || 'pending',
    })),
    payments: (order.payments || []).map(fromPayment),
  };
}

function fromInventoryItem(item: InventoryItem) {
  return {
    branch_id: isUuid(item.branchId) ? item.branchId : null,
    item_code: item.itemCode || null,
    barcode_value: item.barcodeValue || item.itemCode || null,
    name: item.name,
    category: item.category || 'Material',
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unitPrice || 0),
    mrp: Number(item.mrp || 0),
    wholesale_price: Number(item.wholesalePrice || 0),
    last_updated: toIsoDateTime(item.lastUpdated),
  };
}

function fromExpense(expense: Expense) {
  return {
    branch_id: isUuid(expense.branchId) ? expense.branchId : null,
    description: expense.description,
    amount: Number(expense.amount || 0),
    expense_date: expense.date,
  };
}

function fromMaterialSale(sale: MaterialSale) {
  const totalAfterDiscount = Math.max(0, Number(sale.totalAmount || 0) - Number(sale.discount || 0));
  const paidAmount = Number(sale.paidAmount ?? totalAfterDiscount);
  return {
    branch_id: isUuid(sale.branchId) ? sale.branchId : null,
    sale_date: sale.date,
    total_amount: Number(sale.totalAmount || 0),
    discount: Number(sale.discount || 0),
    paid_amount: paidAmount,
    payment_method: sale.paymentMethod || null,
    customer_name: sale.customerName || null,
    status: sale.status || (paidAmount < totalAfterDiscount ? 'Due' : 'Paid'),
    items: (sale.items || []).map((item) => ({
      inventory_item_id: isUuid(item.itemId) ? item.itemId : null,
      source_inventory_legacy_id: isUuid(item.itemId) ? null : item.itemId,
      category: item.category,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unitPrice || 0),
      cost_price: Number(item.costPrice || 0),
      amount: Number(item.amount || 0),
    })),
  };
}

function fromEmployee(employee: Employee) {
  return {
    branch_id: isUuid(employee.branchId) ? employee.branchId : null,
    name: employee.name,
    phone: employee.phone || null,
    type: employee.type,
    salary_source_branch_id: isUuid(employee.salarySourceBranchId) ? employee.salarySourceBranchId : null,
    piece_rates: employee.pieceRates || {},
    branch_piece_rate_history: (employee.branchPieceRateHistory || []).map((entry) => ({
      id: entry.id || null,
      rate: Number(entry.rate || 0),
      effective_from: entry.effectiveFrom,
      note: entry.note || null,
      created_at: toIsoDateTime(entry.createdAt || entry.effectiveFrom),
    })),
    joined_date: employee.joinedDate || null,
    work_logs: (employee.workLogs || []).map((workLog) => ({
      id: workLog.id || null,
      dress_type: workLog.dressType,
      quantity: Number(workLog.quantity || 0),
      unit_price: Number(workLog.unitPrice || 0),
      total_amount: Number(workLog.totalAmount || 0),
      work_date: workLog.date,
      recorded_at: toIsoDateTime(workLog.timestamp),
      start_hour: workLog.startHour || null,
      end_hour: workLog.endHour || null,
      salary_per_hour: workLog.salaryPerHour != null ? Number(workLog.salaryPerHour) : null,
      auto_generated: Boolean(workLog.autoGenerated),
      source_branch_id: isUuid(workLog.sourceBranchId) ? workLog.sourceBranchId : null,
      source_order_id: isUuid(workLog.sourceOrderId) ? workLog.sourceOrderId : null,
      source_order_item_id: isUuid(workLog.sourceOrderItemId) ? workLog.sourceOrderItemId : null,
    })),
    salary_payments: (employee.salaryPayments || []).map((payment) => ({
      id: payment.id || null,
      amount: Number(payment.amount || 0),
      payment_date: payment.date,
      recorded_at: toIsoDateTime(payment.timestamp),
      note: payment.note || null,
    })),
  };
}

function fromEmployeeWorkLog(workLog: WorkLog) {
  return {
    id: workLog.id || null,
    dress_type: workLog.dressType,
    quantity: Number(workLog.quantity || 0),
    unit_price: Number(workLog.unitPrice || 0),
    total_amount: Number(workLog.totalAmount || 0),
    work_date: workLog.date,
    recorded_at: toIsoDateTime(workLog.timestamp),
    start_hour: workLog.startHour || null,
    end_hour: workLog.endHour || null,
    salary_per_hour: workLog.salaryPerHour != null ? Number(workLog.salaryPerHour) : null,
    auto_generated: Boolean(workLog.autoGenerated),
    source_branch_id: isUuid(workLog.sourceBranchId) ? workLog.sourceBranchId : null,
    source_order_id: isUuid(workLog.sourceOrderId) ? workLog.sourceOrderId : null,
    source_order_item_id: isUuid(workLog.sourceOrderItemId) ? workLog.sourceOrderItemId : null,
  };
}

function fromEmployeeSalaryPayment(payment: SalaryPayment) {
  return {
    id: payment.id || null,
    amount: Number(payment.amount || 0),
    payment_date: payment.date,
    recorded_at: toIsoDateTime(payment.timestamp),
    note: payment.note || null,
  };
}

function fromSupplier(supplier: Supplier) {
  return {
    branch_id: isUuid(supplier.branchId) ? supplier.branchId : null,
    name: supplier.name,
    phone: supplier.phone || null,
    joined_date: supplier.joinedDate || null,
    purchases: (supplier.purchases || []).map((purchase) => ({
      id: purchase.id || null,
      description: purchase.description,
      quantity: purchase.quantity != null ? Number(purchase.quantity) : null,
      unit_price: purchase.unitPrice != null ? Number(purchase.unitPrice) : null,
      amount: Number(purchase.amount || 0),
      purchase_date: purchase.date,
      recorded_at: toIsoDateTime(purchase.timestamp),
    })),
    payments: (supplier.payments || []).map((payment) => ({
      id: payment.id || null,
      amount: Number(payment.amount || 0),
      payment_date: payment.date,
      method: payment.method,
      recorded_at: toIsoDateTime(payment.timestamp),
      note: payment.note || null,
    })),
  };
}

function fromSmsCampaignFilter(filter: SmsCampaignFilter) {
  return {
    branch_id: isUuid(filter.branchId) ? filter.branchId : null,
    last_visit_from: filter.lastVisitFrom || null,
    last_visit_to: filter.lastVisitTo || null,
    total_orders_min: filter.totalOrdersMin != null ? Number(filter.totalOrdersMin) : null,
    outstanding_balance_min: filter.outstandingBalanceMin != null ? Number(filter.outstandingBalanceMin) : null,
    include_inactive: Boolean(filter.includeInactive),
  };
}

export async function loginToCloud(payload: LoginPayload): Promise<{
  accessToken: string;
  refreshToken: string;
  currentUser: CurrentUser;
}> {
  const response = await apiRequest<TokenResponse>('/auth/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      tenant_code: payload.tenantCode,
      username: payload.username,
      password: payload.password,
    }),
  });

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    currentUser: toCurrentUser(response.user),
  };
}

export async function fetchCloudBranches(token: string): Promise<Branch[]> {
  const response = await apiRequest<ApiBranch[]>('/branches', { headers: jsonHeaders(token) });
  return response.map(toBranch);
}

export async function createCloudBranch(
  token: string,
  branch: { code: string; name: string; address?: string; phone?: string; isActive?: boolean; isProductionHub?: boolean; accessAreas?: AccessArea[]; orderActions?: OrderAction[] },
): Promise<Branch> {
  const response = await apiRequest<ApiBranch>('/branches', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      code: branch.code,
      name: branch.name,
      address: branch.address || null,
      phone: branch.phone || null,
      is_active: branch.isActive ?? true,
      is_production_hub: branch.isProductionHub ?? false,
      access_areas: branch.accessAreas || [],
      order_actions: branch.orderActions || [],
    }),
  });
  return toBranch(response);
}

export async function updateCloudBranch(
  token: string,
  branchId: string,
  branch: { code: string; name: string; address?: string; phone?: string; isActive?: boolean; isProductionHub?: boolean; accessAreas?: AccessArea[]; orderActions?: OrderAction[] },
): Promise<Branch> {
  const response = await apiRequest<ApiBranch>(`/branches/${branchId}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      code: branch.code,
      name: branch.name,
      address: branch.address || null,
      phone: branch.phone || null,
      is_active: branch.isActive ?? true,
      is_production_hub: branch.isProductionHub ?? false,
      access_areas: branch.accessAreas || [],
      order_actions: branch.orderActions || [],
    }),
  });
  return toBranch(response);
}

export async function deleteCloudBranch(token: string, branchId: string): Promise<void> {
  await apiRequest<void>(`/branches/${branchId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function fetchCloudUsers(token: string): Promise<TenantUser[]> {
  const response = await apiRequest<ApiUser[]>('/users', { headers: jsonHeaders(token) });
  return response.map(toTenantUser);
}

export async function createCloudUser(
  token: string,
  user: { username: string; password: string; role: 'master_admin' | 'branch_admin'; branchId?: string | null; isActive?: boolean },
): Promise<TenantUser> {
  const response = await apiRequest<ApiUser>('/users', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      username: user.username,
      password: user.password,
      role: user.role,
      branch_id: user.branchId || null,
      is_active: user.isActive ?? true,
    }),
  });
  return toTenantUser(response);
}

export async function updateCloudUser(
  token: string,
  userId: string,
  user: { username: string; password?: string; role: 'master_admin' | 'branch_admin'; branchId?: string | null; isActive?: boolean },
): Promise<TenantUser> {
  const response = await apiRequest<ApiUser>(`/users/${userId}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      username: user.username,
      password: user.password || null,
      role: user.role,
      branch_id: user.branchId || null,
      is_active: user.isActive ?? true,
    }),
  });
  return toTenantUser(response);
}

export async function deleteCloudUser(token: string, userId: string): Promise<void> {
  await apiRequest<void>(`/users/${userId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function fetchCloudCustomers(token: string, branchId?: string): Promise<Customer[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiCustomer[]>(`/customers${query}`, { headers: jsonHeaders(token) });
  return response.map(toCustomer);
}

export async function fetchCloudOrders(token: string, branchId?: string): Promise<Order[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiOrder[]>(`/orders${query}`, { headers: jsonHeaders(token) });
  return response.map(toOrder);
}

export async function fetchProductionNotifications(
  token: string,
): Promise<Array<{ branchId: string; branchName: string; latestOrderNumber: string; count: number }>> {
  const response = await apiRequest<ApiProductionNotification[]>('/orders/production-notifications', { headers: jsonHeaders(token) });
  return response.map((item) => ({
    branchId: item.branch_id,
    branchName: item.branch_name,
    latestOrderNumber: item.latest_order_number,
    count: item.count,
  }));
}

export async function fetchCloudInventory(token: string, branchId?: string): Promise<InventoryItem[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiInventoryItem[]>(`/inventory${query}`, { headers: jsonHeaders(token) });
  return response.map(toInventoryItem);
}

export async function fetchCloudExpenses(token: string, branchId?: string): Promise<Expense[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiExpense[]>(`/expenses${query}`, { headers: jsonHeaders(token) });
  return response.map(toExpense);
}

export async function fetchCloudMaterialSales(token: string, branchId?: string): Promise<MaterialSale[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiMaterialSale[]>(`/material-sales${query}`, { headers: jsonHeaders(token) });
  return response.map(toMaterialSale);
}

export async function fetchCloudEmployees(token: string, branchId?: string): Promise<Employee[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiEmployee[]>(`/employees${query}`, { headers: jsonHeaders(token) });
  return response.map(toEmployee);
}

export async function fetchCloudSuppliers(token: string, branchId?: string): Promise<Supplier[]> {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiSupplier[]>(`/suppliers${query}`, { headers: jsonHeaders(token) });
  return response.map(toSupplier);
}

export async function createCloudCustomer(token: string, customer: Customer): Promise<Customer> {
  const response = await apiRequest<ApiCustomer>('/customers', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      branch_id: customer.branchId || null,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      email: customer.email,
    }),
  });
  return toCustomer(response);
}

export async function updateCloudCustomer(token: string, customer: Customer): Promise<Customer> {
  const response = await apiRequest<ApiCustomer>(`/customers/${customer.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      branch_id: customer.branchId || null,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      email: customer.email,
    }),
  });
  return toCustomer(response);
}

export async function deleteCloudCustomer(token: string, customerId: string): Promise<void> {
  await apiRequest<void>(`/customers/${customerId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudOrder(token: string, order: Order): Promise<Order> {
  const response = await apiRequest<ApiOrder>('/orders', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromOrder(order)),
  });
  return toOrder(response);
}

export async function updateCloudOrder(token: string, order: Order): Promise<Order> {
  if (!order.serverId) {
    throw new Error('Missing server order id for update');
  }
  const response = await apiRequest<ApiOrder>(`/orders/${order.serverId}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromOrder(order)),
  });
  return toOrder(response);
}

export async function deleteCloudOrder(token: string, serverOrderId: string): Promise<void> {
  await apiRequest<void>(`/orders/${serverOrderId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudInventoryItem(token: string, item: InventoryItem): Promise<InventoryItem> {
  const response = await apiRequest<ApiInventoryItem>('/inventory', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromInventoryItem(item)),
  });
  return toInventoryItem(response);
}

export async function updateCloudInventoryItem(token: string, item: InventoryItem): Promise<InventoryItem> {
  if (!isUuid(item.id)) {
    throw new Error('Missing server inventory id for update');
  }
  const response = await apiRequest<ApiInventoryItem>(`/inventory/${item.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromInventoryItem(item)),
  });
  return toInventoryItem(response);
}

export async function deleteCloudInventoryItem(token: string, itemId: string): Promise<void> {
  await apiRequest<void>(`/inventory/${itemId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudExpense(token: string, expense: Expense): Promise<Expense> {
  const response = await apiRequest<ApiExpense>('/expenses', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromExpense(expense)),
  });
  return toExpense(response);
}

export async function updateCloudExpense(token: string, expense: Expense): Promise<Expense> {
  if (!isUuid(expense.id)) {
    throw new Error('Missing server expense id for update');
  }
  const response = await apiRequest<ApiExpense>(`/expenses/${expense.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromExpense(expense)),
  });
  return toExpense(response);
}

export async function deleteCloudExpense(token: string, expenseId: string): Promise<void> {
  await apiRequest<void>(`/expenses/${expenseId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudMaterialSale(token: string, sale: MaterialSale): Promise<MaterialSale> {
  const response = await apiRequest<ApiMaterialSale>('/material-sales', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromMaterialSale(sale)),
  });
  return toMaterialSale(response);
}

export async function updateCloudMaterialSale(token: string, sale: MaterialSale): Promise<MaterialSale> {
  if (!isUuid(sale.id)) {
    throw new Error('Missing server material sale id for update');
  }
  const response = await apiRequest<ApiMaterialSale>(`/material-sales/${sale.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromMaterialSale(sale)),
  });
  return toMaterialSale(response);
}

export async function deleteCloudMaterialSale(token: string, saleId: string): Promise<void> {
  await apiRequest<void>(`/material-sales/${saleId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudEmployee(token: string, employee: Employee): Promise<Employee> {
  const response = await apiRequest<ApiEmployee>('/employees', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployee(employee)),
  });
  return toEmployee(response);
}

export async function updateCloudEmployee(token: string, employee: Employee): Promise<Employee> {
  if (!isUuid(employee.id)) {
    throw new Error('Missing server employee id for update');
  }
  const response = await apiRequest<ApiEmployee>(`/employees/${employee.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployee(employee)),
  });
  return toEmployee(response);
}

export async function deleteCloudEmployee(token: string, employeeId: string): Promise<void> {
  await apiRequest<void>(`/employees/${employeeId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudEmployeeWorkLog(token: string, employeeId: string, workLog: WorkLog): Promise<WorkLog> {
  const response = await apiRequest<ApiEmployeeWorkLog>(`/employees/${employeeId}/work-logs`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployeeWorkLog(workLog)),
  });
  return toWorkLog(response);
}

export async function updateCloudEmployeeWorkLog(token: string, employeeId: string, workLogId: string, workLog: WorkLog): Promise<WorkLog> {
  const response = await apiRequest<ApiEmployeeWorkLog>(`/employees/${employeeId}/work-logs/${encodeURIComponent(workLogId)}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployeeWorkLog(workLog)),
  });
  return toWorkLog(response);
}

export async function deleteCloudEmployeeWorkLog(token: string, employeeId: string, workLogId: string): Promise<void> {
  await apiRequest<void>(`/employees/${employeeId}/work-logs/${encodeURIComponent(workLogId)}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudEmployeeSalaryPayment(token: string, employeeId: string, payment: SalaryPayment): Promise<SalaryPayment> {
  const response = await apiRequest<ApiEmployeeSalaryPayment>(`/employees/${employeeId}/salary-payments`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployeeSalaryPayment(payment)),
  });
  return toSalaryPayment(response);
}

export async function updateCloudEmployeeSalaryPayment(token: string, employeeId: string, paymentId: string, payment: SalaryPayment): Promise<SalaryPayment> {
  const response = await apiRequest<ApiEmployeeSalaryPayment>(`/employees/${employeeId}/salary-payments/${encodeURIComponent(paymentId)}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromEmployeeSalaryPayment(payment)),
  });
  return toSalaryPayment(response);
}

export async function deleteCloudEmployeeSalaryPayment(token: string, employeeId: string, paymentId: string): Promise<void> {
  await apiRequest<void>(`/employees/${employeeId}/salary-payments/${encodeURIComponent(paymentId)}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function createCloudSupplier(token: string, supplier: Supplier): Promise<Supplier> {
  const response = await apiRequest<ApiSupplier>('/suppliers', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromSupplier(supplier)),
  });
  return toSupplier(response);
}

export async function updateCloudSupplier(token: string, supplier: Supplier): Promise<Supplier> {
  if (!isUuid(supplier.id)) {
    throw new Error('Missing server supplier id for update');
  }
  const response = await apiRequest<ApiSupplier>(`/suppliers/${supplier.id}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify(fromSupplier(supplier)),
  });
  return toSupplier(response);
}

export async function deleteCloudSupplier(token: string, supplierId: string): Promise<void> {
  await apiRequest<void>(`/suppliers/${supplierId}`, {
    method: 'DELETE',
    headers: jsonHeaders(token),
  });
}

export async function fetchCloudSmsSettings(token: string): Promise<SmsSettings> {
  const response = await apiRequest<ApiSmsSettings>('/sms/settings', {
    headers: jsonHeaders(token),
  });
  return toSmsSettings(response);
}

export async function updateCloudSmsSettings(
  token: string,
  settings: Partial<Omit<SmsSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<SmsSettings> {
  const response = await apiRequest<ApiSmsSettings>('/sms/settings', {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      provider_name: settings.providerName,
      sender_id: settings.senderId,
      api_base_url: settings.apiBaseUrl,
      api_key_ref: settings.apiKeyRef,
      is_enabled: settings.isEnabled,
      transactional_enabled: settings.transactionalEnabled,
      marketing_enabled: settings.marketingEnabled,
      daily_sms_limit: settings.dailySmsLimit,
      campaign_recipient_limit: settings.campaignRecipientLimit,
      cost_per_segment: settings.costPerSegment,
      due_reminder_delay_days: settings.dueReminderDelayDays,
      inactive_customer_days: settings.inactiveCustomerDays,
      quiet_hours_start: settings.quietHoursStart,
      quiet_hours_end: settings.quietHoursEnd,
      max_retries: settings.maxRetries,
    }),
  });
  return toSmsSettings(response);
}

export async function fetchCloudSmsTemplates(token: string, branchId?: string): Promise<SmsTemplate[]> {
  const query = branchId && isUuid(branchId) ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiSmsTemplate[]>(`/sms/templates${query}`, {
    headers: jsonHeaders(token),
  });
  return response.map(toSmsTemplate);
}

export async function updateCloudSmsTemplate(
  token: string,
  code: string,
  template: Partial<Pick<SmsTemplate, 'name' | 'category' | 'triggerEvent' | 'isEnabled' | 'content' | 'variables'>>,
  branchId?: string
): Promise<SmsTemplate> {
  const query = branchId && isUuid(branchId) ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  const response = await apiRequest<ApiSmsTemplate>(`/sms/templates/${encodeURIComponent(code)}${query}`, {
    method: 'PUT',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name: template.name,
      category: template.category,
      trigger_event: template.triggerEvent,
      is_enabled: template.isEnabled,
      content: template.content,
      variables_json: template.variables,
    }),
  });
  return toSmsTemplate(response);
}

export async function sendCloudTestSms(
  token: string,
  payload: {
    branchId?: string | null;
    phone: string;
    message: string;
  }
): Promise<SmsManualSendResult> {
  const response = await apiRequest<ApiSmsManualSendResponse>('/sms/send-test', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      branch_id: isUuid(payload.branchId) ? payload.branchId : null,
      phone: payload.phone,
      message: payload.message,
    }),
  });
  return toSmsManualSendResult(response);
}

export async function sendCloudOrderSms(
  token: string,
  payload: {
    orderId: string;
    phone: string;
    message: string;
  }
): Promise<SmsManualSendResult> {
  const response = await apiRequest<ApiSmsManualSendResponse>('/sms/send-order-message', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      order_id: payload.orderId,
      phone: payload.phone,
      message: payload.message,
    }),
  });
  return toSmsManualSendResult(response);
}

export async function fetchCloudSmsLogs(
  token: string,
  filters: {
    branchId?: string;
    statusFilter?: SmsLogStatus;
    campaignId?: string;
    customerId?: string;
    limit?: number;
  } = {}
): Promise<SmsLog[]> {
  const params = new URLSearchParams();
  if (filters.branchId && isUuid(filters.branchId)) {
    params.set('branch_id', filters.branchId);
  }
  if (filters.statusFilter) {
    params.set('status_filter', filters.statusFilter);
  }
  if (filters.campaignId && isUuid(filters.campaignId)) {
    params.set('campaign_id', filters.campaignId);
  }
  if (filters.customerId && isUuid(filters.customerId)) {
    params.set('customer_id', filters.customerId);
  }
  params.set('limit', String(filters.limit ?? 120));
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await apiRequest<ApiSmsLog[]>(`/sms/logs${query}`, {
    headers: jsonHeaders(token),
  });
  return response.map(toSmsLog);
}

export async function fetchCloudSmsAnalytics(token: string): Promise<SmsAnalytics> {
  const response = await apiRequest<ApiSmsAnalytics>('/sms/analytics', {
    headers: jsonHeaders(token),
  });
  return toSmsAnalytics(response);
}

export async function fetchCloudSmsCampaigns(token: string, statusFilter?: SmsCampaign['status']): Promise<SmsCampaign[]> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
  const response = await apiRequest<ApiSmsCampaign[]>(`/sms/campaigns${query}`, {
    headers: jsonHeaders(token),
  });
  return response.map(toSmsCampaign);
}

export async function previewCloudSmsCampaign(
  token: string,
  payload: {
    templateCode?: string;
    messageTemplate?: string;
    filter: SmsCampaignFilter;
  }
): Promise<SmsCampaignPreview> {
  const response = await apiRequest<ApiSmsCampaignPreview>('/sms/campaigns/preview', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      template_code: payload.templateCode || null,
      message_template: payload.messageTemplate || null,
      filter: fromSmsCampaignFilter(payload.filter),
    }),
  });
  return toSmsCampaignPreview(response);
}

export async function createCloudSmsCampaign(
  token: string,
  payload: {
    branchId?: string | null;
    name: string;
    campaignType: string;
    templateCode?: string;
    messageTemplate?: string;
    filter: SmsCampaignFilter;
    scheduledAt?: string | null;
  }
): Promise<SmsCampaign> {
  const response = await apiRequest<ApiSmsCampaign>('/sms/campaigns', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      branch_id: isUuid(payload.branchId) ? payload.branchId : null,
      name: payload.name,
      campaign_type: payload.campaignType,
      template_code: payload.templateCode || null,
      message_template: payload.messageTemplate || null,
      filter: fromSmsCampaignFilter(payload.filter),
      scheduled_at: payload.scheduledAt || null,
    }),
  });
  return toSmsCampaign(response);
}

export async function launchCloudSmsCampaign(token: string, campaignId: string, scheduledAt?: string | null): Promise<SmsCampaign> {
  const response = await apiRequest<ApiSmsCampaign>(`/sms/campaigns/${encodeURIComponent(campaignId)}/launch`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      scheduled_at: scheduledAt || null,
    }),
  });
  return toSmsCampaign(response);
}

export async function cancelCloudSmsCampaign(token: string, campaignId: string): Promise<SmsCampaign> {
  const response = await apiRequest<ApiSmsCampaign>(`/sms/campaigns/${encodeURIComponent(campaignId)}/cancel`, {
    method: 'POST',
    headers: jsonHeaders(token),
  });
  return toSmsCampaign(response);
}

export function getCloudInvoiceUrl(order: Order, accessToken: string | null): string | null {
  if (!order.serverId || !accessToken) {
    return null;
  }
  return `${API_BASE}/orders/${order.serverId}/invoice.pdf`;
}
