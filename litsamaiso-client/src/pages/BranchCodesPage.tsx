import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { branchCodeService } from '../services/branchCodeService';
import { institutionService } from '../services/institutionService';
import type { BranchCode, Institution } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../hooks/useAuth';
import { getRoleName } from '../utils/userDisplay';

const BranchCodesPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const currentRole = getRoleName(currentUser);
  const isAppAdmin = currentRole === 'AppAdmin';

  const [items, setItems] = useState<BranchCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ bankName: '', branchCode: '', description: '' });
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BranchCode | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await branchCodeService.list({ search: search || undefined });
      setItems(result || []);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to fetch branch codes'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadItems();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadItems]);

  useEffect(() => {
    if (isAppAdmin) {
      const timeout = window.setTimeout(async () => {
        try {
          const insts = await institutionService.getInstitutions();
          setInstitutions(insts || []);
        } catch {
          // silent
        }
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [isAppAdmin]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ bankName: '', branchCode: '', description: '' });
    setSelectedInstitutionId('');
    setShowModal(true);
  };

  const openEditModal = (item: BranchCode) => {
    setEditingId(item._id);
    setForm({
      bankName: item.bankName,
      branchCode: item.branchCode,
      description: item.description || '',
    });
    const inst = item.institution;
    setSelectedInstitutionId(typeof inst === 'string' ? inst : inst?._id || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.bankName.trim()) {
      toast.error('Bank name is required');
      return;
    }
    if (!form.branchCode.trim()) {
      toast.error('Branch code is required');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await branchCodeService.update(editingId, {
          bankName: form.bankName.trim(),
          branchCode: form.branchCode.trim(),
          description: form.description.trim() || undefined,
        });
        toast.success('Branch code updated');
      } else {
        await branchCodeService.create({
          bankName: form.bankName.trim(),
          branchCode: form.branchCode.trim(),
          description: form.description.trim() || undefined,
          institutionId: selectedInstitutionId || undefined,
        });
        toast.success('Branch code created');
      }
      setShowModal(false);
      await loadItems();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, editingId ? 'Failed to update branch code' : 'Failed to create branch code'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await branchCodeService.delete(deleteTarget._id);
      toast.success('Branch code deleted');
      setDeleteTarget(null);
      await loadItems();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete branch code'));
    }
  };

  const stats = useMemo(() => {
    const bankNameCounts = new Map<string, number>();
    items.forEach((item) => {
      const name = item.bankName || 'Unknown';
      bankNameCounts.set(name, (bankNameCounts.get(name) || 0) + 1);
    });
    const sorted = Array.from(bankNameCounts.entries()).sort((a, b) => b[1] - a[1]);
    return { total: items.length, topBanks: sorted.slice(0, 3) };
  }, [items]);

  const getInstitutionName = (item: BranchCode): string => {
    const inst = item.institution;
    if (typeof inst === 'object' && inst !== null && 'name' in inst) {
      return (inst as Institution).name;
    }
    const found = institutions.find((i) => i._id === inst);
    return found?.name || '-';
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-5 pb-10 mt-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Branch Codes</h1>
          <p className="text-gray-600">
            {isAppAdmin
              ? 'Manage branch code mappings across all institutions.'
              : 'Manage branch code mappings for your institution.'}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center">
              <GitBranch className="h-8 w-8 text-active-clr" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Mappings</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </div>
          {stats.topBanks.map(([bankName, count]) => (
            <div key={bankName} className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-center">
                <GitBranch className="h-8 w-8 text-active-clr" />
                <div className="ml-4 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-600">{bankName}</p>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white shadow">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-6 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by bank name or branch code..."
                className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-md bg-primary-clr px-3 py-2 font-semibold text-white hover:bg-active transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Branch Code
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bank Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Branch Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Description</th>
                  {isAppAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Institution</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={isAppAdmin ? 5 : 4} className="px-6 py-6 text-center text-gray-500">Loading...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={isAppAdmin ? 5 : 4} className="px-6 py-6 text-center text-gray-500">No branch codes found</td></tr>
                ) : (
                  items.map((item) => (
                    <tr key={item._id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{item.bankName}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 font-mono">{item.branchCode}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{item.description || '-'}</td>
                      {isAppAdmin && (
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{getInstitutionName(item)}</td>
                      )}
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <div className="flex items-center gap-3">
                          <button
                            className="text-primary-clr hover:text-active"
                            title="Edit"
                            type="button"
                            onClick={() => openEditModal(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Branch Code' : 'Create Branch Code'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {editingId
                ? 'Update the branch code mapping details below.'
                : 'Add a new branch code mapping for a bank.'}
            </p>
            <div className="mt-5 space-y-4">
              {isAppAdmin && !editingId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Institution</label>
                  <select
                    value={selectedInstitutionId}
                    onChange={(e) => setSelectedInstitutionId(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">Select institution</option>
                    {institutions.map((inst) => (
                      <option key={inst._id} value={inst._id}>{inst.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bank Name</label>
                <input
                  value={form.bankName}
                  onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
                  placeholder="e.g. Standard Bank Lesotho"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Branch Code</label>
                <input
                  value={form.branchCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, branchCode: e.target.value }))}
                  placeholder="e.g. 051001"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. Main branch Maseru"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                }}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary-clr px-4 py-2 font-semibold text-white hover:bg-active transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete Branch Code</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete the mapping for{' '}
              <span className="font-semibold">{deleteTarget.bankName} ({deleteTarget.branchCode})</span>.
              This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchCodesPage;
