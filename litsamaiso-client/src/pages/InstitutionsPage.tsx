import React, { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronUp, KeyRound, Lock, Pencil, LayersPlus, Search, Trash2, Unlock, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Institution, User } from '../types';
import { institutionService, type InstitutionUsersResponse } from '../services/institutionService';
import { userService } from '../services/userService';
import { getApiErrorMessage } from '../utils/apiError';
import { getInstitutionName, getRoleName } from '../utils/userDisplay';

const emptyForm = {
  name: '',
  email: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  confirmAdminPassword: '',
};

const getUserId = (user: User) => user.id || user._id || '';

const InstitutionsPage: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lockTarget, setLockTarget] = useState<Institution | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Institution | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [openActionsId, setOpenActionsId] = useState('');
  const [usersTarget, setUsersTarget] = useState<Institution | null>(null);
  const [institutionUsers, setInstitutionUsers] = useState<InstitutionUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRole, setUsersRole] = useState('');
  const [showCreateRoleUser, setShowCreateRoleUser] = useState(false);
  const [openUserActionsId, setOpenUserActionsId] = useState('');
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [passwordUserTarget, setPasswordUserTarget] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    email: '',
    role: 'Student',
    studentId: '',
  });
  const [passwordUserForm, setPasswordUserForm] = useState({
    password: '',
    confirmPassword: '',
  });
  const [roleUserForm, setRoleUserForm] = useState({
    name: '',
    email: '',
    role: 'Finance' as 'InstitutionAdmin' | 'Finance' | 'SAAD',
    password: '',
    confirmPassword: '',
  });

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    try {
      setInstitutions(await institutionService.getInstitutions());
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load institutions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadInstitutions();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadInstitutions]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!editingId && form.adminPassword !== form.confirmAdminPassword) {
      toast.error('Admin passwords do not match');
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await institutionService.updateInstitution(editingId, {
          name: form.name,
          email: form.email,
        });
        toast.success('Institution updated');
      } else {
        const response = await institutionService.createInstitution({
          name: form.name,
          email: form.email,
          adminName: form.adminName || undefined,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
        });
        toast.success(`Institution created. Admin: ${response.admin.email}`);
      }
      setForm(emptyForm);
      setEditingId('');
      await loadInstitutions();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to save institution'));
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (institution: Institution) => {
    setOpenActionsId('');
    setEditingId(institution._id);
    setForm({
      ...emptyForm,
      name: institution.name,
      email: institution.email,
    });
  };

  const handleLock = async () => {
    if (!lockTarget) return;

    try {
      if (lockTarget.locked) {
        await institutionService.unlockInstitution(lockTarget._id);
        toast.success('Institution unlocked');
      } else {
        await institutionService.lockInstitution(lockTarget._id, lockReason);
        toast.success('Institution locked');
      }
      setLockTarget(null);
      setLockReason('');
      await loadInstitutions();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update institution lock'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await institutionService.deleteInstitution(deleteTarget._id);
      toast.success('Institution deleted');
      setDeleteTarget(null);
      await loadInstitutions();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete institution'));
    }
  };

  const loadInstitutionUsers = useCallback(async () => {
    if (!usersTarget) return;

    setUsersLoading(true);
    try {
      setInstitutionUsers(await institutionService.getInstitutionUsers(usersTarget._id, {
        search: usersSearch || undefined,
        role: usersRole || undefined,
      }));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load institution users'));
      setInstitutionUsers(null);
    } finally {
      setUsersLoading(false);
    }
  }, [usersRole, usersSearch, usersTarget]);

  const handleCreateRoleUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!usersTarget) return;

    if (roleUserForm.password !== roleUserForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      const response = await institutionService.createInstitutionRoleUser(usersTarget._id, {
        name: roleUserForm.name || undefined,
        email: roleUserForm.email,
        role: roleUserForm.role,
        password: roleUserForm.password,
      });
      toast.success(response.message || 'Role user created');
      setRoleUserForm({
        name: '',
        email: '',
        role: 'Finance',
        password: '',
        confirmPassword: '',
      });
      await loadInstitutionUsers();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create role user'));
    }
  };

  const beginEditUser = (user: User) => {
    setOpenUserActionsId('');
    setEditUserTarget(user);
    setEditUserForm({
      name: user.name || '',
      email: user.email || '',
      role: getRoleName(user) || 'Student',
      studentId: user.studentId || '',
    });
  };

  const handleUpdateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editUserTarget) return;

    const userId = getUserId(editUserTarget);
    if (!userId) return;

    try {
      await userService.updateUser(userId, {
        name: editUserForm.name,
        email: editUserForm.email,
        role: editUserForm.role,
        studentId: editUserForm.studentId,
      });
      toast.success('User updated');
      setEditUserTarget(null);
      await loadInstitutionUsers();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update user'));
    }
  };

  const handleResetUserPassword = async () => {
    if (!passwordUserTarget) return;

    if (passwordUserForm.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (passwordUserForm.password !== passwordUserForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const userId = getUserId(passwordUserTarget);
    if (!userId) return;

    try {
      await userService.updateUser(userId, { password: passwordUserForm.password });
      toast.success('Password reset');
      setPasswordUserTarget(null);
      setPasswordUserForm({ password: '', confirmPassword: '' });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to reset password'));
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;

    const userId = getUserId(deleteUserTarget);
    if (!userId) return;

    try {
      await userService.deleteUser(userId);
      toast.success('User deleted');
      setDeleteUserTarget(null);
      await loadInstitutionUsers();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete user'));
    }
  };

  useEffect(() => {
    if (!usersTarget) return;

    const timeout = window.setTimeout(() => {
      void loadInstitutionUsers();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadInstitutionUsers, usersTarget]);

  return (
    <div className="min-h-screen bg-gray-50 pt-5 mt-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Institutions</h1>
          <p className="text-gray-600">Create and edit tenant institutions for Litsamaiso.</p>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[380px_1fr]">
          <form className="rounded-lg bg-white p-6 shadow space-y-4" onSubmit={handleSubmit}>
            <div className="flex items-center gap-3">
              {editingId ? <Pencil className="h-6 w-6 text-blue-600" /> : <LayersPlus className="h-6 w-6 text-primary-clr" />}
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Institution' : 'Create Institution'}
              </h2>
            </div>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Institution name"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="institution@example.com"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            {!editingId && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold text-gray-700">
                  First Institution Admin
                </p>
                <input
                  value={form.adminName}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminName: event.target.value }))}
                  placeholder="Admin name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminEmail: event.target.value }))}
                  placeholder="admin@institution.com"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <input
                  type="password"
                  value={form.adminPassword}
                  onChange={(event) => setForm((prev) => ({ ...prev, adminPassword: event.target.value }))}
                  placeholder="Admin password"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <input
                  type="password"
                  value={form.confirmAdminPassword}
                  onChange={(event) => setForm((prev) => ({ ...prev, confirmAdminPassword: event.target.value }))}
                  placeholder="Confirm admin password"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-md bg-button py-2 font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId('');
                    setForm(emptyForm);
                  }}
                  className="rounded-md border px-4 py-2 font-semibold"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="rounded-lg bg-white shadow">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900">Institution Records</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {loading ? (
                <p className="p-6 text-center text-gray-500">Loading...</p>
              ) : institutions.length === 0 ? (
                <p className="p-6 text-center text-gray-500">No institutions found</p>
              ) : (
                institutions.map((institution) => (
                  <div key={institution._id} className="relative flex flex-wrap items-center justify-between gap-4 p-6">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-8 w-8 text-primary-clr" />
                      <div>
                        <p className="font-semibold text-gray-900">{institution.name}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm text-gray-500">{institution.email}</p>
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              institution.locked
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {institution.locked ? 'Locked' : 'Active'}
                          </span>
                        </div>
                        {institution.locked && institution.lockedReason && (
                          <p className="mt-1 text-xs text-red-600">
                            {institution.lockedReason}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenActionsId((current) =>
                            current === institution._id ? '' : institution._id,
                          )
                        }
                        aria-expanded={openActionsId === institution._id}
                        aria-label={`Actions for ${institution.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <ChevronUp
                          className={`h-5 w-5 transition-transform ${
                            openActionsId === institution._id ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {openActionsId === institution._id && (
                        <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId('');
                              setUsersTarget(institution);
                              setUsersSearch('');
                              setUsersRole('');
                              setShowCreateRoleUser(false);
                              setRoleUserForm({
                                name: '',
                                email: '',
                                role: 'Finance',
                                password: '',
                                confirmPassword: '',
                              });
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Users className="h-4 w-4" />
                            Users
                          </button>
                          <button
                            type="button"
                            onClick={() => beginEdit(institution)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId('');
                              setLockTarget(institution);
                              setLockReason(institution.lockedReason || '');
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-gray-50 ${
                              institution.locked ? 'text-green-700' : 'text-amber-700'
                            }`}
                          >
                            {institution.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {institution.locked ? 'Unlock' : 'Lock'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId('');
                              setDeleteTarget(institution);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {lockTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              {lockTarget.locked ? 'Unlock institution' : 'Lock institution'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {lockTarget.locked
                ? `${lockTarget.name} users will be able to log in again.`
                : `${lockTarget.name} users will be blocked from logging in.`}
            </p>
            {!lockTarget.locked && (
              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Lock reason
                </label>
                <textarea
                  value={lockReason}
                  onChange={(event) => setLockReason(event.target.value)}
                  placeholder="Optional message shown during login"
                  className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setLockTarget(null);
                  setLockReason('');
                }}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLock}
                className={`rounded-md px-4 py-2 font-semibold text-white ${
                  lockTarget.locked ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {lockTarget.locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {usersTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {usersTarget.name} Users
                  </h2>
                  <p className="text-sm text-gray-500">
                    {institutionUsers?.total ?? 0} users in this institution
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUsersTarget(null);
                    setInstitutionUsers(null);
                    setUsersSearch('');
                    setUsersRole('');
                  }}
                  className="rounded-md border px-4 py-2 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="border-b p-6">
                <div className="mb-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateRoleUser((open) => !open)}
                    className="rounded-md bg-button px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showCreateRoleUser ? 'Hide create user' : 'Create user'}
                  </button>
                </div>

                {showCreateRoleUser && (
                  <form onSubmit={handleCreateRoleUser} className="mb-5 rounded-md border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-3 text-sm font-semibold text-gray-800">Create role user</p>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                      <input
                        value={roleUserForm.name}
                        onChange={(event) => setRoleUserForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Name"
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                      <input
                        type="email"
                        value={roleUserForm.email}
                        onChange={(event) => setRoleUserForm((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="email@institution.com"
                        required
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                      <select
                        value={roleUserForm.role}
                        onChange={(event) =>
                          setRoleUserForm((prev) => ({
                            ...prev,
                            role: event.target.value as 'InstitutionAdmin' | 'Finance' | 'SAAD',
                          }))
                        }
                        className="rounded-md border border-gray-300 px-3 py-2"
                      >
                        <option value="InstitutionAdmin">Institution Admin</option>
                        <option value="Finance">Finance</option>
                        <option value="SAAD">SAAD</option>
                      </select>
                      <input
                        type="password"
                        value={roleUserForm.password}
                        onChange={(event) => setRoleUserForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder="Password"
                        required
                        minLength={6}
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                      <input
                        type="password"
                        value={roleUserForm.confirmPassword}
                        onChange={(event) => setRoleUserForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                        placeholder="Confirm password"
                        required
                        minLength={6}
                        className="rounded-md border border-gray-300 px-3 py-2"
                      />
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="submit"
                        className="rounded-md bg-button px-4 py-2 text-sm font-semibold text-white"
                      >
                        Create role user
                      </button>
                    </div>
                  </form>
                )}

                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={usersSearch}
                      onChange={(event) => setUsersSearch(event.target.value)}
                      placeholder="Search by name, email, or student ID"
                      className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={usersRole}
                    onChange={(event) => setUsersRole(event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">All roles</option>
                    <option value="InstitutionAdmin">Institution Admin</option>
                    <option value="Finance">Finance</option>
                    <option value="SAAD">SAAD</option>
                    <option value="Student">Student</option>
                  </select>
                </div>
                {institutionUsers && institutionUsers.roleCounts.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {institutionUsers.roleCounts.map((item) => (
                      <span
                        key={item.role}
                        className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700"
                      >
                        {item.role}: {item.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Institution</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student ID</th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading users...</td>
                    </tr>
                  ) : !institutionUsers || institutionUsers.users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No users found</td>
                    </tr>
                  ) : (
                    institutionUsers.users.map((user: User) => (
                      <tr key={user.id || user._id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {getRoleName(user) || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {getInstitutionName(user) || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {user.studentId || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenUserActionsId((current) =>
                                  current === getUserId(user) ? '' : getUserId(user),
                                )
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              aria-label={`Actions for ${user.email}`}
                              aria-expanded={openUserActionsId === getUserId(user)}
                            >
                              <ChevronUp
                                className={`h-4 w-4 transition-transform ${
                                  openUserActionsId === getUserId(user) ? 'rotate-180' : ''
                                }`}
                              />
                            </button>

                            {openUserActionsId === getUserId(user) && (
                              <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => beginEditUser(user)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit user
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenUserActionsId('');
                                    setPasswordUserTarget(user);
                                    setPasswordUserForm({ password: '', confirmPassword: '' });
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  Reset password
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenUserActionsId('');
                                    setDeleteUserTarget(user);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete user
                                </button>
                              </div>
                            )}
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
        </div>
      )}

      {editUserTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 px-4">
          <form onSubmit={handleUpdateUser} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Edit user</h2>
            <p className="mt-1 text-sm text-gray-500">{editUserTarget.email}</p>
            <div className="mt-5 space-y-4">
              <input
                value={editUserForm.name}
                onChange={(event) => setEditUserForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Name"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <input
                type="email"
                value={editUserForm.email}
                onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <div className="grid gap-4 md:grid-cols-2">
                <select
                  value={editUserForm.role}
                  onChange={(event) => setEditUserForm((prev) => ({ ...prev, role: event.target.value }))}
                  className="rounded-md border border-gray-300 px-3 py-2"
                >
                  <option value="InstitutionAdmin">Institution Admin</option>
                  <option value="Finance">Finance</option>
                  <option value="SAAD">SAAD</option>
                  <option value="Student">Student</option>
                </select>
                <input
                  value={editUserForm.studentId}
                  onChange={(event) => setEditUserForm((prev) => ({ ...prev, studentId: event.target.value }))}
                  placeholder="Student ID"
                  className="rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditUserTarget(null)}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-md bg-button px-4 py-2 font-semibold text-white">
                Save user
              </button>
            </div>
          </form>
        </div>
      )}

      {passwordUserTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Reset password</h2>
            <p className="mt-1 text-sm text-gray-500">{passwordUserTarget.email}</p>
            <div className="mt-5 space-y-4">
              <input
                type="password"
                value={passwordUserForm.password}
                onChange={(event) => setPasswordUserForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="New password"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <input
                type="password"
                value={passwordUserForm.confirmPassword}
                onChange={(event) => setPasswordUserForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                placeholder="Confirm password"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPasswordUserTarget(null);
                  setPasswordUserForm({ password: '', confirmPassword: '' });
                }}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetUserPassword}
                className="rounded-md bg-button px-4 py-2 font-semibold text-white"
              >
                Reset password
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteUserTarget && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete user</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{deleteUserTarget.email}</span>.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteUserTarget(null)}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
              >
                Delete user
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete institution</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{deleteTarget.name}</span> and its users, students, accounts, and elections.
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

export default InstitutionsPage;
