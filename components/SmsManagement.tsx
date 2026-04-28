import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  CalendarClock,
  Clock3,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import {
  cancelCloudSmsCampaign,
  createCloudSmsCampaign,
  fetchCloudSmsAnalytics,
  fetchCloudSmsCampaigns,
  fetchCloudSmsLogs,
  fetchCloudSmsSettings,
  fetchCloudSmsTemplates,
  launchCloudSmsCampaign,
  previewCloudSmsCampaign,
  sendCloudTestSms,
  updateCloudSmsSettings,
  updateCloudSmsTemplate,
} from '../utils/cloudApi';
import {
  Branch,
  SmsAnalytics,
  SmsCampaign,
  SmsCampaignFilter,
  SmsCampaignPreview,
  SmsCampaignStatus,
  SmsLog,
  SmsLogStatus,
  SmsManualSendResult,
  SmsSettings,
  SmsTemplate,
  SmsTemplateCategory,
} from '../types';

type SmsTab = 'overview' | 'templates' | 'campaigns' | 'logs';

type NoticeTone = 'success' | 'error' | 'info';

const TEMPLATE_VARIABLES = ['{Name}', '{OrderID}', '{Amount}', '{PaidAmount}', '{Balance}', '{Date}', '{BranchName}', '{BranchPhone}'];
const TEMPLATE_PREVIEW_SAMPLE = {
  Name: 'Ahamed',
  OrderID: 'ORD-1001',
  Amount: '1500.00',
  PaidAmount: '500.00',
  Balance: '350.00',
  Date: '2026-04-22',
  BranchName: 'STR Branch',
  BranchPhone: '077 777 0811',
};

const FESTIVAL_PRESETS = [
  { code: 'festival_eid', label: 'Eid Greeting' },
  { code: 'festival_new_year', label: 'New Year Greeting' },
  { code: 'festival_seasonal', label: 'Seasonal Greeting' },
];

const LOG_STATUS_OPTIONS: Array<{ value: 'all' | SmsLogStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

const emptySettingsForm = {
  providerName: '',
  senderId: '',
  apiBaseUrl: '',
  apiKeyRef: '',
  isEnabled: false,
  transactionalEnabled: true,
  marketingEnabled: false,
  dailySmsLimit: 2,
  campaignRecipientLimit: 500,
  costPerSegment: 0,
  dueReminderDelayDays: 1,
  inactiveCustomerDays: 365,
  quietHoursStart: '09:00',
  quietHoursEnd: '19:00',
  maxRetries: 3,
};

const emptyTemplateForm = {
  name: '',
  category: 'transactional' as SmsTemplateCategory,
  triggerEvent: '',
  isEnabled: true,
  content: '',
};

const emptyCampaignForm = {
  name: '',
  campaignType: 'promo',
  templateCode: '',
  messageTemplate: '',
  branchId: '',
  lastVisitFrom: '',
  lastVisitTo: '',
  totalOrdersMin: '',
  outstandingBalanceMin: '',
  includeInactive: false,
  scheduledAt: '',
};

const emptyTestForm = {
  branchId: '',
  phone: '',
  message: 'VIP Tailors SMS test message. Your SMS gateway is configured and ready.',
};

const INTECH_GATEWAY_BASE_URL = 'https://sms.intechitsolutions.com/api/send';
const INTECH_API_KEY_REFERENCE = 'env:VIP_SMS_API_KEY';
const INTECH_PROVIDER_NAME = 'Intech SMS';
const INTECH_TEST_MESSAGE = 'VIP Tailors test SMS via Intech SMS gateway. If you received this message, the gateway is working correctly.';

function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Something went wrong while talking to the SMS module.';
  }

  const message = error.message || 'Something went wrong while talking to the SMS module.';
  try {
    const parsed = JSON.parse(message) as { detail?: string | { msg?: string }[] };
    if (typeof parsed.detail === 'string') {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail[0].msg;
    }
  } catch {
    return message;
  }

  return message;
}

function formatCurrency(value: number): string {
  return `Rs. ${value.toLocaleString('en-LK', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function renderTemplatePreviewMessage(content: string): string {
  return content.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    const normalizedKey = key as keyof typeof TEMPLATE_PREVIEW_SAMPLE;
    return TEMPLATE_PREVIEW_SAMPLE[normalizedKey] ?? match;
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'Not available';
  }
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dateValue);
}

function formatDateOnly(value?: string | null): string {
  if (!value) {
    return 'Any time';
  }
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'medium',
  }).format(dateValue);
}

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) {
    return '';
  }
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '';
  }
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateValue.getDate()}`.padStart(2, '0');
  const hours = `${dateValue.getHours()}`.padStart(2, '0');
  const minutes = `${dateValue.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoDateTime(value: string): string | null {
  if (!value) {
    return null;
  }
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }
  return dateValue.toISOString();
}

function toCampaignFilter(form: typeof emptyCampaignForm): SmsCampaignFilter {
  return {
    branchId: form.branchId || undefined,
    lastVisitFrom: form.lastVisitFrom || undefined,
    lastVisitTo: form.lastVisitTo || undefined,
    totalOrdersMin: form.totalOrdersMin ? Number(form.totalOrdersMin) : undefined,
    outstandingBalanceMin: form.outstandingBalanceMin ? Number(form.outstandingBalanceMin) : undefined,
    includeInactive: form.includeInactive,
  };
}

function toSettingsFormState(settings: SmsSettings) {
  return {
    providerName: settings.providerName || '',
    senderId: settings.senderId || '',
    apiBaseUrl: settings.apiBaseUrl || '',
    apiKeyRef: settings.apiKeyRef || '',
    isEnabled: settings.isEnabled,
    transactionalEnabled: settings.transactionalEnabled,
    marketingEnabled: settings.marketingEnabled,
    dailySmsLimit: settings.dailySmsLimit,
    campaignRecipientLimit: settings.campaignRecipientLimit,
    costPerSegment: settings.costPerSegment,
    dueReminderDelayDays: settings.dueReminderDelayDays,
    inactiveCustomerDays: settings.inactiveCustomerDays,
    quietHoursStart: settings.quietHoursStart || '09:00',
    quietHoursEnd: settings.quietHoursEnd || '19:00',
    maxRetries: settings.maxRetries,
  };
}

function StatCard({
  title,
  value,
  helper,
  accent,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  accent: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`mt-3 text-3xl font-black ${accent}`}>{value}</p>
          <p className="mt-2 text-sm text-slate-500">{helper}</p>
        </div>
        <div className="rounded-full bg-slate-100 p-4 text-slate-600 shadow-sm">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  isActive,
  label,
  onClick,
  icon: Icon,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  icon: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition ${
        isActive
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-blue-50 hover:text-blue-700'
      }`}
      type="button"
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: SmsLogStatus | SmsCampaignStatus }) {
  const styles: Record<string, string> = {
    queued: 'bg-amber-100 text-amber-800',
    sending: 'bg-sky-100 text-sky-800',
    sent: 'bg-blue-100 text-blue-800',
    delivered: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-rose-100 text-rose-800',
    skipped: 'bg-slate-200 text-slate-700',
    cancelled: 'bg-slate-200 text-slate-700',
    draft: 'bg-slate-200 text-slate-700',
    scheduled: 'bg-violet-100 text-violet-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${styles[status] || styles.queued}`}>
      {status}
    </span>
  );
}

const SmsManagementContent: React.FC = () => {
  const context = useContext(AppContext);
  const [activeTab, setActiveTab] = useState<SmsTab>('overview');
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isPreviewingCampaign, setIsPreviewingCampaign] = useState(false);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [analytics, setAnalytics] = useState<SmsAnalytics | null>(null);
  const [globalTemplates, setGlobalTemplates] = useState<SmsTemplate[]>([]);
  const [branchTemplates, setBranchTemplates] = useState<SmsTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [preview, setPreview] = useState<SmsCampaignPreview | null>(null);
  const [testResult, setTestResult] = useState<SmsManualSendResult | null>(null);

  const [settingsForm, setSettingsForm] = useState(emptySettingsForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [campaignForm, setCampaignForm] = useState(emptyCampaignForm);
  const [testForm, setTestForm] = useState(emptyTestForm);
  const [templateScopeBranchId, setTemplateScopeBranchId] = useState('');
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('');
  const [campaignMode, setCampaignMode] = useState<'template' | 'custom'>('template');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | SmsLogStatus>('all');

  if (!context) {
    return <div>Loading...</div>;
  }

  const { accessToken, currentUser, branches } = context;

  const branchNameById = useMemo(() => {
    return new Map(branches.map((branch) => [branch.id, branch.name]));
  }, [branches]);

  const branchOverridesByCode = useMemo(() => {
    return new Map(branchTemplates.map((template) => [template.code, template]));
  }, [branchTemplates]);

  const visibleTemplates = useMemo(() => {
    if (!templateScopeBranchId) {
      return globalTemplates;
    }
    return globalTemplates.map((template) => branchOverridesByCode.get(template.code) || template);
  }, [branchOverridesByCode, globalTemplates, templateScopeBranchId]);

  const selectedTemplate = useMemo(() => {
    return visibleTemplates.find((template) => template.code === selectedTemplateCode) || visibleTemplates[0] || null;
  }, [selectedTemplateCode, visibleTemplates]);

  const selectedGlobalTemplate = useMemo(() => {
    return globalTemplates.find((template) => template.code === selectedTemplateCode) || globalTemplates[0] || null;
  }, [globalTemplates, selectedTemplateCode]);

  const hasBranchOverride = Boolean(templateScopeBranchId && selectedTemplateCode && branchOverridesByCode.has(selectedTemplateCode));

  const campaignTemplateOptions = useMemo(() => {
    return globalTemplates.filter((template) => template.category === 'marketing' || template.category === 'festival');
  }, [globalTemplates]);

  const categoryLabels: Record<SmsTemplateCategory, string> = {
    transactional: 'Transactional',
    marketing: 'Marketing',
    festival: 'Festival',
  };

  const loadCoreData = async (showMainSpinner = false) => {
    if (!accessToken || currentUser?.role !== 'master_admin') {
      return;
    }

    if (showMainSpinner) {
      setIsBootstrapping(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const [nextSettings, nextAnalytics, nextGlobalTemplates, nextCampaigns] = await Promise.all([
        fetchCloudSmsSettings(accessToken),
        fetchCloudSmsAnalytics(accessToken),
        fetchCloudSmsTemplates(accessToken),
        fetchCloudSmsCampaigns(accessToken),
      ]);

      setSettings(nextSettings);
      setAnalytics(nextAnalytics);
      setGlobalTemplates(nextGlobalTemplates);
      setCampaigns(nextCampaigns);
      setSettingsForm(toSettingsFormState(nextSettings));
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsBootstrapping(false);
      setIsRefreshing(false);
    }
  };

  const loadScopedTemplates = async () => {
    if (!accessToken || currentUser?.role !== 'master_admin') {
      return;
    }

    if (!templateScopeBranchId) {
      setBranchTemplates([]);
      return;
    }

    try {
      const scopedTemplates = await fetchCloudSmsTemplates(accessToken, templateScopeBranchId);
      setBranchTemplates(scopedTemplates);
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    }
  };

  const loadLogs = async () => {
    if (!accessToken || currentUser?.role !== 'master_admin') {
      return;
    }

    setIsLoadingLogs(true);
    try {
      const nextLogs = await fetchCloudSmsLogs(accessToken, {
        statusFilter: logStatusFilter === 'all' ? undefined : logStatusFilter,
        limit: 150,
      });
      setLogs(nextLogs);
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadCoreData(true);
  }, [accessToken, currentUser?.role]);

  useEffect(() => {
    void loadScopedTemplates();
  }, [accessToken, currentUser?.role, templateScopeBranchId, globalTemplates.length]);

  useEffect(() => {
    void loadLogs();
  }, [accessToken, currentUser?.role, logStatusFilter]);

  useEffect(() => {
    if (!visibleTemplates.length) {
      setSelectedTemplateCode('');
      return;
    }
    if (!selectedTemplateCode || !visibleTemplates.some((template) => template.code === selectedTemplateCode)) {
      setSelectedTemplateCode(visibleTemplates[0].code);
    }
  }, [selectedTemplateCode, visibleTemplates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateForm(emptyTemplateForm);
      return;
    }
    setTemplateForm({
      name: selectedTemplate.name,
      category: selectedTemplate.category,
      triggerEvent: selectedTemplate.triggerEvent || '',
      isEnabled: selectedTemplate.isEnabled,
      content: selectedTemplate.content,
    });
  }, [selectedTemplate?.id, selectedTemplate?.updatedAt]);

  useEffect(() => {
    if (campaignMode === 'template' && !campaignForm.templateCode && campaignTemplateOptions[0]) {
      setCampaignForm((current) => ({
        ...current,
        templateCode: campaignTemplateOptions[0].code,
      }));
    }
  }, [campaignForm.templateCode, campaignMode, campaignTemplateOptions]);

  useEffect(() => {
    if (!testForm.branchId && branches[0]?.id) {
      setTestForm((current) => ({
        ...current,
        branchId: branches[0].id,
      }));
    }
  }, [branches, testForm.branchId]);

  const persistSettingsForm = async (nextForm: typeof emptySettingsForm) => {
    if (!accessToken) {
      throw new Error('Missing access token.');
    }

    const savedSettings = await updateCloudSmsSettings(accessToken, nextForm);
    setSettings(savedSettings);
    setSettingsForm(toSettingsFormState(savedSettings));
    const nextAnalytics = await fetchCloudSmsAnalytics(accessToken);
    setAnalytics(nextAnalytics);
    return savedSettings;
  };

  const handleApplyIntechPreset = () => {
    setSettingsForm((current) => ({
      ...current,
      providerName: INTECH_PROVIDER_NAME,
      apiBaseUrl: INTECH_GATEWAY_BASE_URL,
      apiKeyRef: current.apiKeyRef.trim() || INTECH_API_KEY_REFERENCE,
      isEnabled: true,
      transactionalEnabled: true,
    }));
    setTestForm((current) => ({
      ...current,
      message: current.message.trim() || INTECH_TEST_MESSAGE,
    }));
    setNotice({
      tone: 'info',
      text: 'Intech preset loaded. Enter your approved sender ID, then save or run the guided test.',
    });
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setIsSavingSettings(true);
    try {
      await persistSettingsForm(settingsForm);
      setNotice({ tone: 'success', text: 'SMS settings saved successfully.' });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!accessToken) {
      return;
    }
    const baseTemplate = selectedTemplate || selectedGlobalTemplate;
    if (!baseTemplate || !templateForm.content.trim()) {
      setNotice({ tone: 'error', text: 'Select a template and enter message content before saving.' });
      return;
    }

    setIsSavingTemplate(true);
    try {
      await updateCloudSmsTemplate(
        accessToken,
        baseTemplate.code,
        {
          name: templateForm.name.trim() || baseTemplate.name,
          category: templateForm.category,
          triggerEvent: templateForm.triggerEvent.trim() || undefined,
          isEnabled: templateForm.isEnabled,
          content: templateForm.content.trim(),
          variables: TEMPLATE_VARIABLES,
        },
        templateScopeBranchId || undefined
      );

      if (templateScopeBranchId) {
        await loadScopedTemplates();
      } else {
        const refreshedTemplates = await fetchCloudSmsTemplates(accessToken);
        setGlobalTemplates(refreshedTemplates);
      }

      setNotice({
        tone: 'success',
        text: templateScopeBranchId
          ? hasBranchOverride
            ? 'Branch SMS template updated successfully.'
            : 'Branch SMS template override created successfully.'
          : 'Global SMS template updated successfully.',
      });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handlePreviewCampaign = async () => {
    if (!accessToken) {
      return;
    }

    const templateCode = campaignMode === 'template' ? campaignForm.templateCode : undefined;
    const messageTemplate = campaignMode === 'custom' ? campaignForm.messageTemplate.trim() : undefined;

    if (!templateCode && !messageTemplate) {
      setNotice({ tone: 'error', text: 'Choose a marketing template or write a custom message before previewing.' });
      return;
    }

    setIsPreviewingCampaign(true);
    try {
      const previewResult = await previewCloudSmsCampaign(accessToken, {
        templateCode,
        messageTemplate,
        filter: toCampaignFilter(campaignForm),
      });
      setPreview(previewResult);
      setNotice({ tone: 'info', text: `Preview ready for ${previewResult.recipientCount} recipients.` });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsPreviewingCampaign(false);
    }
  };

  const handleCreateCampaign = async (mode: 'draft' | 'send_now' | 'schedule') => {
    if (!accessToken) {
      return;
    }

    const templateCode = campaignMode === 'template' ? campaignForm.templateCode : undefined;
    const messageTemplate = campaignMode === 'custom' ? campaignForm.messageTemplate.trim() : undefined;

    if (!campaignForm.name.trim()) {
      setNotice({ tone: 'error', text: 'Campaign name is required.' });
      return;
    }
    if (!templateCode && !messageTemplate) {
      setNotice({ tone: 'error', text: 'Choose a template or provide a custom campaign message.' });
      return;
    }
    if (mode === 'schedule' && !campaignForm.scheduledAt) {
      setNotice({ tone: 'error', text: 'Choose a scheduled date and time before scheduling the campaign.' });
      return;
    }

    setIsSavingCampaign(true);
    try {
      const createdCampaign = await createCloudSmsCampaign(accessToken, {
        branchId: campaignForm.branchId || undefined,
        name: campaignForm.name.trim(),
        campaignType: campaignForm.campaignType.trim(),
        templateCode,
        messageTemplate,
        filter: toCampaignFilter(campaignForm),
        scheduledAt: mode === 'schedule' ? toIsoDateTime(campaignForm.scheduledAt) : undefined,
      });

      if (mode === 'send_now') {
        await launchCloudSmsCampaign(accessToken, createdCampaign.id);
      }

      await loadCoreData(false);
      await loadLogs();
      setCampaignForm(emptyCampaignForm);
      setPreview(null);
      setCampaignMode('template');
      setNotice({
        tone: 'success',
        text:
          mode === 'draft'
            ? 'Campaign draft created successfully.'
            : mode === 'schedule'
            ? 'Campaign scheduled successfully.'
            : 'Campaign queued to send now.',
      });
      setActiveTab('campaigns');
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const handleLaunchExistingCampaign = async (campaignId: string) => {
    if (!accessToken) {
      return;
    }
    setIsSavingCampaign(true);
    try {
      await launchCloudSmsCampaign(accessToken, campaignId);
      await loadCoreData(false);
      await loadLogs();
      setNotice({ tone: 'success', text: 'Campaign launched successfully.' });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    if (!accessToken) {
      return;
    }
    setIsSavingCampaign(true);
    try {
      await cancelCloudSmsCampaign(accessToken, campaignId);
      await loadCoreData(false);
      await loadLogs();
      setNotice({ tone: 'success', text: 'Campaign cancelled successfully.' });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingCampaign(false);
    }
  };

  const handleSaveAndSendIntechTest = async () => {
    if (!accessToken) {
      return;
    }
    if (!testForm.phone.trim()) {
      setNotice({ tone: 'error', text: 'Enter your phone number before running the Intech gateway test.' });
      return;
    }

    const nextSettingsForm = {
      ...settingsForm,
      providerName: INTECH_PROVIDER_NAME,
      apiBaseUrl: INTECH_GATEWAY_BASE_URL,
      apiKeyRef: settingsForm.apiKeyRef.trim() || INTECH_API_KEY_REFERENCE,
      isEnabled: true,
      transactionalEnabled: true,
    };

    if (!nextSettingsForm.senderId.trim()) {
      setNotice({ tone: 'error', text: 'Enter your approved Intech sender ID before running the gateway test.' });
      return;
    }

    const nextMessage = testForm.message.trim() || INTECH_TEST_MESSAGE;

    setIsSavingSettings(true);
    setIsSendingTest(true);
    try {
      await persistSettingsForm(nextSettingsForm);
      const result = await sendCloudTestSms(accessToken, {
        branchId: testForm.branchId || undefined,
        phone: testForm.phone.trim(),
        message: nextMessage,
      });
      setTestForm((current) => ({ ...current, message: nextMessage }));
      setTestResult(result);
      await loadLogs();
      setNotice({ tone: 'success', text: `Intech preset saved and test SMS processed. ${result.message}` });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSavingSettings(false);
      setIsSendingTest(false);
    }
  };

  const handleSendTestSms = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    if (!testForm.phone.trim() || !testForm.message.trim()) {
      setNotice({ tone: 'error', text: 'Enter a phone number and message before sending a test SMS.' });
      return;
    }

    setIsSendingTest(true);
    try {
      const result = await sendCloudTestSms(accessToken, {
        branchId: testForm.branchId || undefined,
        phone: testForm.phone.trim(),
        message: testForm.message.trim(),
      });
      setTestResult(result);
      await loadCoreData(false);
      await loadLogs();
      setNotice({ tone: 'success', text: result.message });
    } catch (error) {
      setNotice({ tone: 'error', text: extractErrorMessage(error) });
    } finally {
      setIsSendingTest(false);
    }
  };

  const noticeStyles: Record<NoticeTone, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };

  if (currentUser?.role !== 'master_admin') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        This section is available only to the master admin.
      </div>
    );
  }

  if (isBootstrapping) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          Loading SMS management workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-3 text-blue-600">
                <MessageSquare size={20} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-500">Customer Messaging Hub</p>
                <h1 className="text-3xl font-bold text-slate-900">SMS Notifications & Campaign Control</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
              Manage tailor-shop order alerts, payment confirmations, due reminders, and marketing campaigns from one
              clean control panel. Transactional rules stay cost-aware while campaigns stay previewable before you spend.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                Dedupe protection
              </span>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-700">
                Daily customer caps
              </span>
              <span className="rounded-full bg-indigo-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">
                Branch-aware campaigns
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-5 border border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Current Gateway State</p>
                <p className="mt-1 text-sm text-slate-500">Live summary of the current SMS control settings.</p>
              </div>
              <div className="rounded-xl bg-white px-4 py-3 text-right shadow-sm ring-1 ring-slate-200">
                <p className="text-[11px] font-black uppercase tracking-widest text-indigo-500">Tenant Admin</p>
                <p className="text-sm font-semibold text-slate-900">{currentUser?.username}</p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <span className="text-sm text-slate-700">SMS Engine</span>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.2em] ${settings?.isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {settings?.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Provider</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{settings?.providerName || 'Not configured'}</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Sender ID</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{settings?.senderId || 'Not set'}</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Daily Customer Cap</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{settings?.dailySmsLimit ?? 0} SMS</p>
                </div>
                <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Quiet Hours</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {settings?.quietHoursStart || '--'} - {settings?.quietHoursEnd || '--'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadCoreData(false)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Refresh SMS data
              </button>
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <div className={`rounded-xl border px-5 py-4 text-sm font-medium shadow-sm ${noticeStyles[notice.tone]}`}>
          {notice.text}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Queued Right Now"
          value={`${analytics?.queuedCount ?? 0}`}
          helper="Scheduled or retrying messages still waiting to send"
          accent="text-amber-600"
          icon={BellRing}
        />
        <StatCard
          title="Sent Today"
          value={`${analytics?.sentToday ?? 0}`}
          helper={`${analytics?.deliveredToday ?? 0} already marked delivered`}
          accent="text-blue-600"
          icon={Send}
        />
        <StatCard
          title="Failed Today"
          value={`${analytics?.failedToday ?? 0}`}
          helper="Watch retries and invalid numbers here"
          accent="text-rose-600"
          icon={ShieldCheck}
        />
        <StatCard
          title="Month Cost"
          value={formatCurrency(analytics?.estimatedCostThisMonth ?? 0)}
          helper={`${analytics?.sentThisMonth ?? 0} messages sent this month`}
          accent="text-emerald-600"
          icon={BarChart3}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <TabButton isActive={activeTab === 'overview'} label="Overview" icon={Settings2} onClick={() => setActiveTab('overview')} />
        <TabButton isActive={activeTab === 'templates'} label="Templates" icon={MessageSquare} onClick={() => setActiveTab('templates')} />
        <TabButton isActive={activeTab === 'campaigns'} label="Campaigns" icon={Megaphone} onClick={() => setActiveTab('campaigns')} />
        <TabButton isActive={activeTab === 'logs'} label="Logs" icon={Clock3} onClick={() => setActiveTab('logs')} />
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-8 xl:grid-cols-[1.25fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">SMS Gateway & Rules</h2>
                <p className="text-sm text-slate-500">Control provider details, cost rules, caps, and quiet hours.</p>
              </div>
            </div>

            <form className="mt-6 space-y-6" onSubmit={handleSaveSettings}>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-bold">Intech quick setup</p>
                <p className="mt-2 leading-6">
                  Use <span className="font-semibold">{INTECH_GATEWAY_BASE_URL}</span> as the gateway URL and{' '}
                  <span className="font-semibold">{INTECH_API_KEY_REFERENCE}</span> as the API key reference. Your real
                  API key should stay on the server as an environment variable.
                </p>
                <button
                  type="button"
                  onClick={handleApplyIntechPreset}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <Sparkles size={16} />
                  Use Intech preset
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Provider Name</label>
                  <input
                    value={settingsForm.providerName}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, providerName: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="Twilio / Notify / Vonage"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Sender ID</label>
                  <input
                    value={settingsForm.senderId}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, senderId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="VIPTAILOR"
                  />
                  <p className="mt-2 text-xs text-slate-500">Use the approved sender ID given by Intech, not a random label.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Gateway Base URL</label>
                  <input
                    value={settingsForm.apiBaseUrl}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, apiBaseUrl: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="https://api.sms-provider.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">API Key Reference</label>
                  <input
                    value={settingsForm.apiKeyRef}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, apiKeyRef: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="env:VIP_SMS_API_KEY"
                  />
                  <p className="mt-2 text-xs text-slate-500">Recommended for Intech: <span className="font-semibold">{INTECH_API_KEY_REFERENCE}</span></p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Enable SMS Module</span>
                    <input
                      type="checkbox"
                      checked={settingsForm.isEnabled}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, isEnabled: event.target.checked }))}
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Transactional SMS</span>
                    <input
                      type="checkbox"
                      checked={settingsForm.transactionalEnabled}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, transactionalEnabled: event.target.checked }))}
                    />
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Marketing SMS</span>
                    <input
                      type="checkbox"
                      checked={settingsForm.marketingEnabled}
                      onChange={(event) => setSettingsForm((current) => ({ ...current, marketingEnabled: event.target.checked }))}
                    />
                  </div>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Daily SMS Limit / Customer</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settingsForm.dailySmsLimit}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, dailySmsLimit: Number(event.target.value) || 1 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Campaign Recipient Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={settingsForm.campaignRecipientLimit}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, campaignRecipientLimit: Number(event.target.value) || 1 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Cost / Segment</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={settingsForm.costPerSegment}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, costPerSegment: Number(event.target.value) || 0 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Max Retries</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={settingsForm.maxRetries}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, maxRetries: Number(event.target.value) || 0 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Due Reminder Delay (days)</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={settingsForm.dueReminderDelayDays}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, dueReminderDelayDays: Number(event.target.value) || 0 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Inactive Customer Window (days)</label>
                  <input
                    type="number"
                    min={1}
                    value={settingsForm.inactiveCustomerDays}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, inactiveCustomerDays: Number(event.target.value) || 1 }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Quiet Hours Start</label>
                  <input
                    type="time"
                    value={settingsForm.quietHoursStart}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, quietHoursStart: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Quiet Hours End</label>
                  <input
                    type="time"
                    value={settingsForm.quietHoursEnd}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, quietHoursEnd: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSavingSettings ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                Save SMS settings
              </button>
            </form>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <Send size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Test SMS</h2>
                  <p className="text-sm text-slate-500">Validate phone formatting, cost estimate, and gateway connectivity.</p>
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSendTestSms}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-bold text-slate-900">Ready-made Intech test</p>
                  <p className="mt-2 leading-6">
                    This will save the Intech gateway URL and API key reference into SMS settings, then send a test SMS
                    to the number below using your current sender ID.
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Branch</label>
                  <select
                    value={testForm.branchId}
                    onChange={(event) => setTestForm((current) => ({ ...current, branchId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  >
                    <option value="">Auto-select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Phone Number</label>
                  <input
                    value={testForm.phone}
                    onChange={(event) => setTestForm((current) => ({ ...current, phone: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="0771234567"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Message</label>
                  <textarea
                    value={testForm.message}
                    onChange={(event) => setTestForm((current) => ({ ...current, message: event.target.value }))}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSendingTest}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSendingTest ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Send test SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveAndSendIntechTest()}
                    disabled={isSendingTest || isSavingSettings}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {(isSendingTest || isSavingSettings) ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                    Save & test Intech gateway
                  </button>
                </div>
              </form>

              {testResult && (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-bold">Last test result</p>
                  <p className="mt-2">Status: <span className="font-semibold">{testResult.status}</span></p>
                  <p>Normalized phone: <span className="font-semibold">{testResult.phoneNormalized || 'Invalid / not normalized'}</span></p>
                  <p>Estimated cost: <span className="font-semibold">{formatCurrency(testResult.estimatedCost)}</span></p>
                  <p>Segments: <span className="font-semibold">{testResult.segmentCount}</span></p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Template Variables</h2>
                  <p className="text-sm text-slate-500">These placeholders can be used in transactional and marketing messages.</p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <span key={variable} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    {variable}
                  </span>
                ))}
              </div>
              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                Keep transactional messages short so they stay in fewer SMS segments and cost less. Marketing campaigns
                should always be previewed before sending.
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Template Library</h2>
                <p className="text-sm text-slate-500">Global defaults can be overridden per branch when needed.</p>
              </div>
              <select
                value={templateScopeBranchId}
                onChange={(event) => setTemplateScopeBranchId(event.target.value)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Global defaults</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} override
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 space-y-3">
              {visibleTemplates.map((template) => {
                const isSelected = template.code === selectedTemplateCode;
                const isOverride = Boolean(templateScopeBranchId && branchOverridesByCode.has(template.code));
                return (
                  <button
                    key={template.code}
                    type="button"
                    onClick={() => setSelectedTemplateCode(template.code)}
                    className={`w-full rounded-xl border px-5 py-4 text-left transition ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50 text-slate-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold">{template.name}</p>
                        <p className={`mt-1 text-xs font-black uppercase tracking-[0.22em] ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                          {categoryLabels[template.category]}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${template.isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {template.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {templateScopeBranchId && (
                          <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] ${isOverride ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                            {isOverride ? 'Branch override' : 'Using global'}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={`mt-3 line-clamp-3 whitespace-pre-line text-sm ${isSelected ? 'text-slate-600' : 'text-slate-500'}`}>{template.content}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {templateScopeBranchId
                    ? `${branchNameById.get(templateScopeBranchId) || 'Branch'} Template Override`
                    : 'Global Template Editor'}
                </h2>
                <p className="text-sm text-slate-500">
                  {templateScopeBranchId
                    ? hasBranchOverride
                      ? 'This branch already has its own SMS version for the selected event.'
                      : 'Saving now will create a branch-specific override while keeping the global default unchanged.'
                    : 'Update the default transactional and marketing messages for the whole tenant.'}
                </p>
              </div>
              {selectedTemplate && <StatusBadge status={selectedTemplate.isEnabled ? 'delivered' : 'failed'} />}
            </div>

            {selectedTemplate ? (
              <div className="mt-6 space-y-5">
                {selectedTemplate.code === 'order_confirmation' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    This template is sent once when an order is created. If an initial payment is recorded at the same time,
                    that payment summary is included in this same SMS.
                  </div>
                )}
                {selectedTemplate.code === 'payment_confirmation' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    This template is only used for extra payments added after the order has already been created.
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Template Name</label>
                    <input
                      value={templateForm.name}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Category</label>
                    <select
                      value={templateForm.category}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, category: event.target.value as SmsTemplateCategory }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    >
                      <option value="transactional">Transactional</option>
                      <option value="marketing">Marketing</option>
                      <option value="festival">Festival</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Trigger Event</label>
                    <input
                      value={templateForm.triggerEvent}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, triggerEvent: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                      placeholder="order_created / payment_recorded"
                    />
                  </div>
                  <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Template Enabled</span>
                      <input
                        type="checkbox"
                        checked={templateForm.isEnabled}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, isEnabled: event.target.checked }))}
                      />
                    </div>
                  </label>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Message Content</label>
                  <textarea
                    value={templateForm.content}
                    onChange={(event) => setTemplateForm((current) => ({ ...current, content: event.target.value }))}
                    rows={8}
                    className="w-full rounded-xl border border-slate-300 px-4 py-4 text-sm leading-7 outline-none transition focus:border-slate-900"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Template Preview</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">
                    {renderTemplatePreviewMessage(templateForm.content)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Available Variables</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {TEMPLATE_VARIABLES.map((variable) => (
                      <span key={variable} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={isSavingTemplate}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingTemplate ? <Loader2 className="animate-spin" size={16} /> : <MessageSquare size={16} />}
                  {templateScopeBranchId
                    ? hasBranchOverride
                      ? 'Update branch override'
                      : 'Create branch override'
                    : 'Save global template'}
                </button>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
                No SMS templates available yet.
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="space-y-8">
          <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-100 p-3 text-indigo-700">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Campaign Builder</h2>
                  <p className="text-sm text-slate-500">Preview first, then create a draft, send immediately, or schedule later.</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setCampaignMode('template')}
                  className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${campaignMode === 'template' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Use Template
                </button>
                <button
                  type="button"
                  onClick={() => setCampaignMode('custom')}
                  className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${campaignMode === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Custom Message
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {FESTIVAL_PRESETS.map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => {
                      setCampaignMode('template');
                      setCampaignForm((current) => ({
                        ...current,
                        campaignType: 'festival',
                        templateCode: preset.code,
                        name: current.name || preset.label,
                      }));
                    }}
                    className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Campaign Name</label>
                  <input
                    value={campaignForm.name}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    placeholder="Weekend offer reminder"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Campaign Type</label>
                  <select
                    value={campaignForm.campaignType}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, campaignType: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  >
                    <option value="promo">Promotion</option>
                    <option value="festival">Festival</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Branch Filter</label>
                  <select
                    value={campaignForm.branchId}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, branchId: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  >
                    <option value="">All branches</option>
                    {branches.map((branch: Branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Schedule (optional)</label>
                  <input
                    type="datetime-local"
                    value={campaignForm.scheduledAt}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
              </div>

              {campaignMode === 'template' ? (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Marketing / Festival Template</label>
                  <select
                    value={campaignForm.templateCode}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, templateCode: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  >
                    <option value="">Select a template</option>
                    {campaignTemplateOptions.map((template) => (
                      <option key={template.code} value={template.code}>
                        {template.name} ({categoryLabels[template.category]})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">Custom Campaign Message</label>
                  <textarea
                    value={campaignForm.messageTemplate}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, messageTemplate: event.target.value }))}
                    rows={5}
                    className="w-full rounded-xl border border-slate-300 px-4 py-4 text-sm leading-7 outline-none transition focus:border-slate-900"
                    placeholder="Dear {Name}, enjoy our seasonal tailoring offer this week at VIP Tailors..."
                  />
                </div>
              )}

              <div className="mt-6 rounded-[1.75rem] bg-slate-50 p-5">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Audience Filters</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Last Visit From</label>
                    <input
                      type="date"
                      value={campaignForm.lastVisitFrom}
                      onChange={(event) => setCampaignForm((current) => ({ ...current, lastVisitFrom: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Last Visit To</label>
                    <input
                      type="date"
                      value={campaignForm.lastVisitTo}
                      onChange={(event) => setCampaignForm((current) => ({ ...current, lastVisitTo: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Minimum Total Orders</label>
                    <input
                      type="number"
                      min={0}
                      value={campaignForm.totalOrdersMin}
                      onChange={(event) => setCampaignForm((current) => ({ ...current, totalOrdersMin: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Outstanding Balance Minimum</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={campaignForm.outstandingBalanceMin}
                      onChange={(event) => setCampaignForm((current) => ({ ...current, outstandingBalanceMin: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                    />
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={campaignForm.includeInactive}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, includeInactive: event.target.checked }))}
                  />
                  Include inactive customers too
                </label>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handlePreviewCampaign()}
                  disabled={isPreviewingCampaign}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPreviewingCampaign ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  Preview audience
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateCampaign('draft')}
                  disabled={isSavingCampaign}
                  className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateCampaign('send_now')}
                  disabled={isSavingCampaign}
                  className="rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Send now
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateCampaign('schedule')}
                  disabled={isSavingCampaign}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <CalendarClock size={16} />
                  Schedule
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Preview & Cost</h2>
                  <p className="text-sm text-slate-500">Check counts, message samples, and cost before launching.</p>
                </div>
              </div>

              {preview ? (
                <div className="mt-6 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Recipients</p>
                      <p className="mt-2 text-3xl font-black text-slate-900">{preview.recipientCount}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Segments</p>
                      <p className="mt-2 text-3xl font-black text-slate-900">{preview.totalSegments}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Estimated Cost</p>
                      <p className="mt-2 text-3xl font-black text-emerald-600">{formatCurrency(preview.estimatedCost)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Sample Messages</p>
                    <div className="mt-3 space-y-3">
                      {preview.samples.map((sample) => (
                        <div key={sample.customerId} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-slate-900">{sample.customerName}</p>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {sample.phoneNormalized || 'No valid number'}
                              </p>
                            </div>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{sample.renderedMessage}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                  Build a campaign and click <span className="font-bold">Preview audience</span> to see recipient count,
                  sample messages, and estimated cost.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <CalendarClock size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">Campaign Queue</h2>
                <p className="text-sm text-slate-500">See which campaigns are drafted, scheduled, running, or completed.</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    <th className="pb-3 pr-4">Campaign</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Recipients</th>
                    <th className="pb-3 pr-4">Cost</th>
                    <th className="pb-3 pr-4">Schedule</th>
                    <th className="pb-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="py-4 pr-4 align-top">
                        <p className="font-bold text-slate-900">{campaign.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{campaign.campaignType}</p>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="py-4 pr-4 align-top text-sm text-slate-700">
                        <p>Est: {campaign.recipientCountEstimate}</p>
                        <p>Actual: {campaign.recipientCountActual}</p>
                      </td>
                      <td className="py-4 pr-4 align-top text-sm text-slate-700">
                        <p>Est: {formatCurrency(campaign.estimatedCost)}</p>
                        <p>Actual: {formatCurrency(campaign.actualCost)}</p>
                      </td>
                      <td className="py-4 pr-4 align-top text-sm text-slate-700">
                        {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : 'Send immediately'}
                      </td>
                      <td className="py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {campaign.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => void handleLaunchExistingCampaign(campaign.id)}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                            >
                              Launch
                            </button>
                          )}
                          {(campaign.status === 'draft' || campaign.status === 'scheduled' || campaign.status === 'running') && (
                            <button
                              type="button"
                              onClick={() => void handleCancelCampaign(campaign.id)}
                              className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-200"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {campaigns.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                  No campaigns created yet.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'logs' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900">SMS Delivery Logs</h2>
              <p className="text-sm text-slate-500">Track status, provider responses, retries, and spend per message.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={logStatusFilter}
                onChange={(event) => setLogStatusFilter(event.target.value as 'all' | SmsLogStatus)}
                className="rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                {LOG_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadLogs()}
                disabled={isLoadingLogs}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoadingLogs ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Refresh logs
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Recipient</th>
                  <th className="pb-3 pr-4">Branch</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Cost</th>
                  <th className="pb-3 pr-4">Created</th>
                  <th className="pb-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-4 pr-4 align-top">
                      <p className="font-bold text-slate-900">{log.smsType.replace(/_/g, ' ')}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{log.triggerEvent || 'manual'}</p>
                    </td>
                    <td className="py-4 pr-4 align-top text-sm text-slate-700">
                      <p>{log.phoneNormalized || log.phoneRaw || 'No phone'}</p>
                      <p className="mt-1 text-xs text-slate-500">{log.providerName || 'Provider pending'}</p>
                    </td>
                    <td className="py-4 pr-4 align-top text-sm text-slate-700">
                      {branchNameById.get(log.branchId) || 'Unknown branch'}
                    </td>
                    <td className="py-4 pr-4 align-top">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="py-4 pr-4 align-top text-sm text-slate-700">
                      <p>{formatCurrency(log.estimatedCost)}</p>
                      <p className="mt-1 text-xs text-slate-500">{log.segmentCount} segments</p>
                    </td>
                    <td className="py-4 pr-4 align-top text-sm text-slate-700">
                      <p>{formatDateTime(log.createdAt)}</p>
                      {log.deliveredAt && <p className="mt-1 text-xs text-emerald-600">Delivered {formatDateTime(log.deliveredAt)}</p>}
                    </td>
                    <td className="py-4 align-top text-sm text-slate-700">
                      <p className="line-clamp-3 max-w-sm whitespace-pre-line">{log.messageBody}</p>
                      {(log.errorMessage || log.providerMessageId) && (
                        <p className="mt-2 text-xs text-slate-500">
                          {log.errorMessage || `Provider ID: ${log.providerMessageId}`}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
                No SMS logs match the current filter.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

type SmsManagementErrorBoundaryState = {
  hasError: boolean;
};

class SmsManagementErrorBoundary extends React.Component<React.PropsWithChildren, SmsManagementErrorBoundaryState> {
  state: SmsManagementErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): SmsManagementErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('SMS management screen crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
          <div className="max-w-2xl rounded-xl bg-rose-50 p-6 text-rose-900">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-500">SMS Module Error</p>
            <h2 className="mt-3 text-2xl font-black">This SMS screen hit a runtime error.</h2>
            <p className="mt-3 text-sm leading-7 text-rose-800">
              Refresh the page once. If it still happens, the issue is now isolated to this module instead of blanking
              the full app, and we can trace it from the browser console cleanly.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const SmsManagement: React.FC = () => {
  return (
    <SmsManagementErrorBoundary>
      <SmsManagementContent />
    </SmsManagementErrorBoundary>
  );
};

export default SmsManagement;
