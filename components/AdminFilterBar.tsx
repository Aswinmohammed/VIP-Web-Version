import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { Filter, Search, X } from 'lucide-react';

type SelectOption = {
  label: string;
  value: string;
};

interface AdminFilterBarProps {
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (value: string) => void;
  onToDateChange?: (value: string) => void;
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  statusOptions?: SelectOption[];
  categoryFilter?: string;
  onCategoryFilterChange?: (value: string) => void;
  categoryOptions?: SelectOption[];
  customerFilter?: string;
  onCustomerFilterChange?: (value: string) => void;
  customerOptions?: SelectOption[];
  extraActions?: React.ReactNode;
}

const selectBaseClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

const AdminFilterBar: React.FC<AdminFilterBarProps> = ({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  customerFilter,
  onCustomerFilterChange,
  customerOptions,
  extraActions,
}) => {
  const context = useContext(AppContext);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canClear = useMemo(() => {
    return Boolean(
      (searchTerm && searchTerm.trim()) ||
      fromDate ||
      toDate ||
      (statusFilter && statusFilter !== 'All') ||
      (categoryFilter && categoryFilter !== 'All') ||
      (customerFilter && customerFilter !== 'All'),
    );
  }, [categoryFilter, customerFilter, fromDate, searchTerm, statusFilter, toDate]);

  if (!context) {
    return null;
  }

  const hasLocalFilters = Boolean(
    onSearchChange ||
    onFromDateChange ||
    onToDateChange ||
    (statusOptions && onStatusFilterChange) ||
    (categoryOptions && onCategoryFilterChange) ||
    (customerOptions && onCustomerFilterChange) ||
    extraActions,
  );

  if (context.currentUser?.role !== 'master_admin' && !hasLocalFilters) {
    return null;
  }

  const showBranchScopeSelector =
    context.currentUser?.role === 'master_admin' &&
    context.isAllBranchesScope &&
    context.branches.length > 1;

  const clearFilters = () => {
    onSearchChange?.('');
    onFromDateChange?.('');
    onToDateChange?.('');
    onStatusFilterChange?.('All');
    onCategoryFilterChange?.('All');
    onCustomerFilterChange?.('All');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {onSearchChange && (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm || ''}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:flex-nowrap">
            {showBranchScopeSelector && (
              <select
                value={context.activeBranchId}
                onChange={(event) => context.setActiveBranchId(event.target.value)}
                className={`${selectBaseClass} min-w-[200px]`}
              >
                <option value="all">All Branches</option>
                {context.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}

            {(onFromDateChange || onToDateChange || categoryOptions || customerOptions) && (
              <button
                type="button"
                onClick={() => setShowAdvanced((current) => !current)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </button>
            )}

            {canClear && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                <X className="mr-2 h-4 w-4" />
                Clear
              </button>
            )}

            {extraActions}
          </div>
        </div>

        {/* Status filter is always visible — never hidden behind the Filters toggle */}
        {statusOptions && onStatusFilterChange && (
          <div className="flex flex-wrap gap-3">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onStatusFilterChange(option.value)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                  (statusFilter || 'All') === option.value
                    ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {(onFromDateChange || onToDateChange || categoryOptions || customerOptions) && (
          <div className={`${showAdvanced ? 'grid' : 'hidden'} gap-3 border-t border-slate-100 pt-4 md:grid md:grid-cols-2 xl:grid-cols-4`}>
            {(onFromDateChange || onToDateChange) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-2">
                {onFromDateChange && (
                  <input
                    type="date"
                    value={fromDate || ''}
                    onChange={(event) => onFromDateChange(event.target.value)}
                    className={selectBaseClass}
                  />
                )}
                {onToDateChange && (
                  <input
                    type="date"
                    value={toDate || ''}
                    onChange={(event) => onToDateChange(event.target.value)}
                    className={selectBaseClass}
                  />
                )}
              </div>
            )}

            {categoryOptions && onCategoryFilterChange && (
              <select value={categoryFilter || 'All'} onChange={(event) => onCategoryFilterChange(event.target.value)} className={selectBaseClass}>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {customerOptions && onCustomerFilterChange && (
              <select value={customerFilter || 'All'} onChange={(event) => onCustomerFilterChange(event.target.value)} className={selectBaseClass}>
                {customerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminFilterBar;
