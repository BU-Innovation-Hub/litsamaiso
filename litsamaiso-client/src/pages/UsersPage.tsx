import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Search, Trash2, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '../services/userService';
import type { Role, User } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { getInstitutionName, getRoleName } from '../utils/userDisplay';
import { useAuth } from '../hooks/useAuth';

const getUserId = (user: User) => user.id || user._id || '';

const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const currentRole = getRoleName(currentUser);
  const isAppAdmin = currentRole === 'AppAdmin';
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await userService.getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        limit: 100,
      });
      setUsers(response || []);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to fetch users'));
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search]);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        setRoles(await userService.getRoles());
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to fetch roles'));
      }
    };

    const timeout = window.setTimeout(() => {
      void loadRoles();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadUsers]);

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    users.forEach((user) => {
      const roleName = getRoleName(user) || 'Unknown';
      counts.set(roleName, (counts.get(roleName) || 0) + 1);
    });
    return Array.from(counts.entries());
  }, [users]);

  const handleRoleChange = async (targetUser: User, roleId: string) => {
    const userId = getUserId(targetUser);
    if (!userId) return;

    try {
      await userService.updateUser(userId, { role: roleId });
      toast.success('User role updated');
      await loadUsers();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update user role'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetUser = deleteTarget;
    const userId = getUserId(targetUser);
    if (!userId) return;

    try {
      await userService.deleteUser(userId);
      toast.success('User deleted');
      setDeleteTarget(null);
      await loadUsers();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete user'));
    }
  };

  const handlePasswordReset = async () => {
    if (!passwordTarget) return;
    const userId = getUserId(passwordTarget);
    if (!userId) return;

    if (passwordForm.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      await userService.updateUser(userId, { password: passwordForm.password });
      toast.success('Password updated');
      setPasswordTarget(null);
      setPasswordForm({ password: '', confirmPassword: '' });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update password'));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 mt-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>
          <p className="text-gray-600">
            {isAppAdmin ? 'Manage all users across institutions.' : 'Manage users in your institution scope.'}
          </p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              </div>
            </div>
          </div>
          {roleCounts.slice(0, 3).map(([roleName, count]) => (
            <div key={roleName} className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-center">
                <UserCog className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{roleName}</p>
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
                placeholder="Search users..."
                className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">All roles</option>
              {roles.map((role) => (
                <option key={role._id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Institution</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-500">Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-6 text-center text-gray-500">No users found</td></tr>
                ) : (
                  users.map((user) => {
                    const userRole = getRoleName(user);
                    const roleId = typeof user.role === 'string' ? user.role : user.role?._id;

                    return (
                      <tr key={getUserId(user)}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{user.email}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {isAppAdmin ? (
                            <select
                              value={roleId || ''}
                              onChange={(event) => handleRoleChange(user, event.target.value)}
                              className="rounded border border-gray-300 px-2 py-1 text-sm"
                            >
                              <option value="">{userRole || 'Select role'}</option>
                              {roles.map((role) => (
                                <option key={role._id} value={role._id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            userRole || '-'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{getInstitutionName(user) || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{user.studentId || '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex items-center gap-3">
                            {isAppAdmin && (
                              <button
                                className="text-blue-600 hover:text-blue-900"
                                title="Reset password"
                                type="button"
                                onClick={() => {
                                  setPasswordTarget(user);
                                  setPasswordForm({ password: '', confirmPassword: '' });
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              className="text-red-600 hover:text-red-900"
                              title="Delete user"
                              type="button"
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete user</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <span className="font-semibold">{deleteTarget.email}</span>.
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
                Delete user
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Reset password</h2>
            <p className="mt-2 text-sm text-gray-600">
              Set a new password for <span className="font-semibold">{passwordTarget.email}</span>.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPasswordTarget(null);
                  setPasswordForm({ password: '', confirmPassword: '' });
                }}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasswordReset}
                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
              >
                Update password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
