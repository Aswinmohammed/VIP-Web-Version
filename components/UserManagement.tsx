import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { ACCESS_AREAS, AccessArea, Branch, ORDER_ACTIONS, OrderAction, TenantUser } from '../types';
import { createCloudBranch, createCloudUser, deleteCloudBranch, deleteCloudUser, fetchCloudUsers, updateCloudBranch, updateCloudUser } from '../utils/cloudApi';
import { Building2, Loader2, Pencil, PlusCircle, Shield, Trash2, UserCog, Users } from 'lucide-react';

const emptyBranchForm = {
  code: '',
  name: '',
  address: '',
  phone: '',
  isActive: true,
  isProductionHub: false,
  accessAreas: ['dashboard', 'customers', 'orders', 'add_order', 'inventory', 'material_sales', 'suppliers', 'employees', 'expenses', 'reports'] as AccessArea[],
  orderActions: ['cut_sheet', 'track_completion', 'invoice', 'edit', 'delete'] as OrderAction[],
};

const emptyUserForm = {
  username: '',
  password: '',
  role: 'branch_admin' as 'master_admin' | 'branch_admin',
  branchId: '',
  isActive: true,
};

const UserManagement: React.FC = () => {
  const context = useContext(AppContext);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [userForm, setUserForm] = useState(emptyUserForm);

  if (!context) {
    return <div>Loading...</div>;
  }

  const { accessToken, currentUser, branches, refreshCloudData, activeBranchId, setActiveBranchId } = context;

  const branchNameById = useMemo(() => {
    return new Map(branches.map((branch) => [branch.id, branch.name]));
  }, [branches]);

  const accessAreaLabels: Record<AccessArea, string> = {
    dashboard: 'Dashboard',
    customers: 'Customer',
    orders: 'Order',
    add_order: 'Add Order',
    inventory: 'Inventory',
    material_sales: 'Material Sales',
    suppliers: 'Supplier',
    employees: 'Employee',
    expenses: 'Expenses',
    reports: 'Report',
  };

  const orderActionLabels: Record<OrderAction, string> = {
    cut_sheet: 'Cut Sheet',
    track_completion: 'Track Dress Completion',
    invoice: 'Invoice',
    edit: 'Edit',
    delete: 'Delete',
  };

  const loadUsers = async () => {
    if (!accessToken || currentUser?.role !== 'master_admin') {
      return;
    }
    setIsLoading(true);
    try {
      const loadedUsers = await fetchCloudUsers(accessToken);
      setUsers(loadedUsers);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [accessToken, currentUser?.role]);

  const resetUserForm = () => {
    setUserForm(emptyUserForm);
    setEditingUserId(null);
  };

  const resetBranchForm = () => {
    setBranchForm(emptyBranchForm);
    setEditingBranchId(null);
  };

  const toggleBranchAccessArea = (area: AccessArea) => {
    setBranchForm((current) => {
      const nextAreas = current.accessAreas.includes(area)
        ? current.accessAreas.filter((currentArea) => currentArea !== area)
        : [...current.accessAreas, area];

      const mustClearOrderActions = !nextAreas.includes('orders');
      return {
        ...current,
        accessAreas: nextAreas,
        orderActions: mustClearOrderActions ? [] : current.orderActions,
      };
    });
  };

  const toggleBranchOrderAction = (action: OrderAction) => {
    setBranchForm((current) => ({
      ...current,
      orderActions: current.orderActions.includes(action)
        ? current.orderActions.filter((currentAction) => currentAction !== action)
        : [...current.orderActions, action],
    }));
  };

  const startEditBranch = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setBranchForm({
      code: branch.code,
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      isActive: branch.isActive,
      isProductionHub: branch.isProductionHub,
      accessAreas: branch.accessAreas.length > 0 ? branch.accessAreas : emptyBranchForm.accessAreas,
      orderActions: branch.orderActions.length > 0 ? branch.orderActions : emptyBranchForm.orderActions,
    });
  };

  const handleCreateBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setIsSavingBranch(true);
    try {
      const branchPayload = {
        code: branchForm.code.trim().toUpperCase(),
        name: branchForm.name.trim(),
        address: branchForm.address.trim(),
        phone: branchForm.phone.trim(),
        isActive: branchForm.isActive,
        isProductionHub: branchForm.isProductionHub,
        accessAreas: branchForm.accessAreas,
        orderActions: branchForm.accessAreas.includes('orders') ? branchForm.orderActions : [],
      };

      if (editingBranchId) {
        await updateCloudBranch(accessToken, editingBranchId, branchPayload);
      } else {
        await createCloudBranch(accessToken, branchPayload);
      }
      resetBranchForm();
      await refreshCloudData();
      window.alert(editingBranchId ? 'Branch updated successfully.' : 'Branch created successfully.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to save branch.');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    if (userForm.role === 'branch_admin' && !userForm.branchId) {
      window.alert('Select a branch for the branch admin.');
      return;
    }
    if (!editingUserId && userForm.password.trim().length < 8) {
      window.alert('Password must be at least 8 characters.');
      return;
    }

    setIsSavingUser(true);
    try {
      if (editingUserId) {
        await updateCloudUser(accessToken, editingUserId, {
          username: userForm.username.trim(),
          password: userForm.password.trim() || undefined,
          role: userForm.role,
          branchId: userForm.role === 'branch_admin' ? userForm.branchId : null,
          isActive: userForm.isActive,
        });
      } else {
        await createCloudUser(accessToken, {
          username: userForm.username.trim(),
          password: userForm.password.trim(),
          role: userForm.role,
          branchId: userForm.role === 'branch_admin' ? userForm.branchId : null,
          isActive: userForm.isActive,
        });
      }

      resetUserForm();
      await loadUsers();
      window.alert(editingUserId ? 'User updated successfully.' : 'User created successfully.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to save user.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const startEditUser = (user: TenantUser) => {
    setEditingUserId(user.id);
    setUserForm({
      username: user.username,
      password: '',
      role: user.role,
      branchId: user.branchId || '',
      isActive: user.isActive,
    });
  };

  const handleDeleteUser = async (user: TenantUser) => {
    if (!accessToken) {
      return;
    }
    if (!window.confirm(`Delete user "${user.username}"?`)) {
      return;
    }
    try {
      await deleteCloudUser(accessToken, user.id);
      await loadUsers();
      window.alert('User deleted successfully.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to delete user.');
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (!accessToken) {
      return;
    }
    const confirmMessage = `Delete branch "${branch.name}"?\n\nThis will remove the branch from Configured Branches and Branch Scope. Orders, customers, inventory, expenses, material sales, employees, and suppliers linked to this branch will also be removed from the ERP database.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteCloudBranch(accessToken, branch.id);
      if (editingBranchId === branch.id) {
        resetBranchForm();
      }
      if (activeBranchId === branch.id) {
        setActiveBranchId('all');
      }
      await refreshCloudData();
      await loadUsers();
      window.alert('Branch deleted successfully.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to delete branch.');
    }
  };

  if (currentUser?.role !== 'master_admin') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        This section is available only to the master admin.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Branches & Users</h1>
          <p className="mt-2 text-sm text-slate-500">Create branches and assign branch admin accounts for each shop.</p>
        </div>
        <div className="rounded-xl bg-indigo-50 px-4 py-3 text-right">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Tenant Admin</p>
          <p className="text-sm font-semibold text-indigo-900">{currentUser.username}</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-3 text-blue-600">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{editingBranchId ? 'Edit Branch Access' : 'Create Branch'}</h2>
              <p className="text-sm text-slate-500">Define which modules and order actions that branch can use.</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleCreateBranch}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={branchForm.code}
                onChange={(event) => setBranchForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="Branch code"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                required
              />
              <input
                value={branchForm.name}
                onChange={(event) => setBranchForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Branch name"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
                required
              />
            </div>
            <input
              value={branchForm.address}
              onChange={(event) => setBranchForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="Address"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
            <input
              value={branchForm.phone}
              onChange={(event) => setBranchForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Phone"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Access Area</h3>
                <p className="mt-1 text-xs text-slate-500">Choose the screens this branch can see in the ERP.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ACCESS_AREAS.map((area) => (
                  <label key={area} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={branchForm.accessAreas.includes(area)}
                      onChange={() => toggleBranchAccessArea(area)}
                    />
                    {accessAreaLabels[area]}
                  </label>
                ))}
              </div>
            </div>
            <div className={`rounded-2xl border p-4 ${branchForm.accessAreas.includes('orders') ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
              <div className="mb-3">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Order Actions</h3>
                <p className="mt-1 text-xs text-slate-500">These actions appear inside the Orders screen for this branch.</p>
              </div>
              <div className="space-y-3">
                {ORDER_ACTIONS.map((action) => (
                  <label key={action} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={branchForm.orderActions.includes(action)}
                      onChange={() => toggleBranchOrderAction(action)}
                      disabled={!branchForm.accessAreas.includes('orders')}
                    />
                    {orderActionLabels[action]}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={branchForm.isActive}
                onChange={(event) => setBranchForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              Branch is active
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <input
                type="checkbox"
                checked={branchForm.isProductionHub}
                onChange={(event) => setBranchForm((current) => ({ ...current, isProductionHub: event.target.checked }))}
              />
              This branch is the main production hub
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSavingBranch}
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSavingBranch ? <Loader2 className="mr-2 animate-spin" size={18} /> : <PlusCircle className="mr-2" size={18} />}
                {editingBranchId ? 'Update Branch' : 'Create Branch'}
              </button>
              {editingBranchId && (
                <button
                  type="button"
                  onClick={resetBranchForm}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-full bg-indigo-100 p-3 text-indigo-600">
              <UserCog size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{editingUserId ? 'Edit User' : 'Create Branch Admin'}</h2>
              <p className="text-sm text-slate-500">Set branch access and login credentials for staff management.</p>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleSaveUser}>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={userForm.username}
                onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Username"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                required
              />
              <input
                value={userForm.password}
                onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingUserId ? 'New password (optional)' : 'Password'}
                type="password"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
                required={!editingUserId}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <select
                value={userForm.role}
                onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as 'master_admin' | 'branch_admin', branchId: event.target.value === 'master_admin' ? '' : current.branchId }))}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500"
              >
                <option value="branch_admin">Branch Admin</option>
                <option value="master_admin">Master Admin</option>
              </select>
              <select
                value={userForm.branchId}
                onChange={(event) => setUserForm((current) => ({ ...current, branchId: event.target.value }))}
                disabled={userForm.role !== 'branch_admin'}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100"
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={userForm.isActive}
                onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              User is active
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSavingUser}
                className="inline-flex items-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSavingUser ? <Loader2 className="mr-2 animate-spin" size={18} /> : <Shield className="mr-2" size={18} />}
                {editingUserId ? 'Update User' : 'Create User'}
              </button>
              {editingUserId && (
                <button
                  type="button"
                  onClick={resetUserForm}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-blue-50 p-3 text-blue-600">
            <Building2 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Configured Branches</h2>
            <p className="text-sm text-slate-500">Review and tune each branch to match your client workflow.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Access Areas</th>
                <th className="px-4 py-3">Order Actions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-b border-slate-100 align-top">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-900">{branch.name}</div>
                    <div className="text-xs uppercase tracking-widest text-slate-400">{branch.code}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div className="flex flex-wrap gap-2">
                      {(branch.accessAreas.length > 0 ? branch.accessAreas : emptyBranchForm.accessAreas).map((area) => (
                        <span key={area} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {accessAreaLabels[area]}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div className="flex flex-wrap gap-2">
                      {(branch.orderActions.length > 0 ? branch.orderActions : []).map((action) => (
                        <span key={action} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                          {orderActionLabels[action]}
                        </span>
                      ))}
                      {branch.orderActions.length === 0 && <span className="text-xs text-slate-400">No order actions</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${branch.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {branch.isProductionHub && (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          Production Hub
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEditBranch(branch)}
                        className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                      >
                        <Pencil className="mr-1" size={14} />
                        Edit Branch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(branch)}
                        className="inline-flex items-center rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="mr-1" size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-full bg-slate-100 p-3 text-slate-700">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Tenant Users</h2>
            <p className="text-sm text-slate-500">Review existing accounts and which branch they can access.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-3 animate-spin" size={20} />
            Loading users...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-900">{user.username}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{user.branchId ? branchNameById.get(user.branchId) || user.branchId : 'All branches'}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditUser(user)}
                          className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          disabled={user.id === currentUser.id}
                          className="inline-flex items-center rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="mr-1" size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No tenant users found yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default UserManagement;
