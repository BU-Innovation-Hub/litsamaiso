/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Users,
  CreditCard,
  Download,
  Upload,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Edit,
  Trash2,
  X,
  Coins,
  Receipt,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface User {
  _id: string;
  name: string;
  email: string;
  studentId: string;
  role: { name: string };
  createdAt: string;
}

export interface Account {
  _id: string;
  fullnames: string;
  firstName?: string;
  surname?: string;
  contractNumber: string;
  courseOfStudy: string;
  bankName: string;
  accountNumber: string;
  studentId?: string;
  status: "pending" | "confirmed" | "erroneous" | "paid";
  confirmationDate?: string;
  signature?: string;
  batchNumber?: number;
  paidDate?: string;
  createdAt: string;
}

interface Role {
  _id: string;
  name: string;
}

interface AdminIssue {
  _id: string;
  contractNumber: string;
  studentId: string;
  bankName: string;
  accountNumber: string;
  proofUrls?: string[];
  notes?: string;
  status?: string;
  createdAt?: string;
}

export default function FinanceDashboardClient({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "users" | "accounts" | "announcements" | "issues"
  >("users");
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<AdminIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortField, setSortField] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showStudentImportModal, setShowStudentImportModal] = useState(false);
  const [studentImportFile, setStudentImportFile] = useState<File | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [allBatches, setAllBatches] = useState<number[]>([]);
  const [availableBatches, setAvailableBatches] = useState<number[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [editForm, setEditForm] = useState({
    fullnames: "",
    contractNumber: "",
    courseOfStudy: "",
    bankName: "",
    accountNumber: "",
    studentId: "",
    status: "pending" as "pending" | "confirmed" | "erroneous" | "paid",
  });

  // Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAccounts: 0,
    confirmedAccounts: 0,
    pendingAccounts: 0,
    erroneousAccounts: 0,
    paidAccounts: 0,
  });

  // Percentage calculations
  const percentages = useMemo(() => {
    const total = stats.totalAccounts;

    if (total === 0) {
      return {
        confirmed: 0,
        paid: 0,
        pending: 0,
        erroneous: 0,
      };
    }
    // Calculate percentages and round to 1 decimal place
    return {
      confirmed: Number(
        ((stats.confirmedAccounts / total) * 100).toFixed(1)
      ),
      paid: Number(((stats.paidAccounts / total) * 100).toFixed(1)),
      pending: Number(((stats.pendingAccounts / total) * 100).toFixed(1)),
      erroneous: Number(((stats.erroneousAccounts / total) * 100).toFixed(1)),
    };
  }, [stats]);

  useEffect(() => {
    fetchRoles();
    if (activeTab === "users") {
      fetchUsers();
    } else if (activeTab === "accounts") {
      fetchAccounts();
    } else if (activeTab === "issues") {
      fetchIssues();
    }
  }, [
    activeTab,
    searchTerm,
    statusFilter,
    roleFilter,
    batchFilter,
    startDate,
    endDate,
    sortField,
    sortOrder,
  ]);

  // Preload accounts on mount so stats cards show immediately after login
  useEffect(() => {
    fetchAccounts();
  }, []);
  // Reset selections when filters change
  useEffect(() => {
    setSelectedAccountIds([]);
    setIsSelectAll(false);
  }, [statusFilter, batchFilter, startDate, endDate, searchTerm]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (roleFilter) params.append("role", roleFilter);

      const response = await fetch(`/api/admin/users?${params}`);
      const data = await response.json();

      if (response.ok) {
        setUsers(data.data);
        setStats((prev) => ({ ...prev, totalUsers: data.pagination.total }));
      } else {
        toast.error(data.error || "Failed to fetch users");
      }
    } catch (error) {
      toast.error(`Failed to fetch users: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter) params.append("status", statusFilter);
      if (batchFilter) params.append("batch", batchFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (sortField) params.append("sortField", sortField);
      if (sortOrder) params.append("sortOrder", sortOrder);

      const response = await fetch(`/api/admin/accounts?${params}`);
      const data = await response.json();

      if (response.ok) {
        setAccounts(data.data);

        // Prepare batch numbers (typed as number[])
        const batchNumbers: number[] = data.data
          .map((acc: Account) => acc.batchNumber)
          .filter((b: number): b is number => typeof b === "number");

        const uniqueBatches: number[] = Array.from(new Set(batchNumbers)).sort(
          (a, b) => b - a
        );

        // Only set allBatches once
        if (allBatches.length === 0) {
          setAllBatches(uniqueBatches);
        }

        // Always display from cached list
        setAvailableBatches(allBatches.length > 0 ? allBatches : uniqueBatches);

        setStats((prev) => ({
          ...prev,
          totalAccounts: data.pagination.total,
          confirmedAccounts: data.statusCounts.confirmed || 0,
          pendingAccounts: data.statusCounts.pending || 0,
          erroneousAccounts: data.statusCounts.erroneous || 0,
          paidAccounts: data.statusCounts.paid || 0,
        }));
      } else {
        toast.error(data.error || "Failed to fetch accounts");
      }
    } catch (error) {
      toast.error(`Failed to fetch accounts: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch("/api/admin/roles");
      const data = await response.json();

      if (response.ok) {
        setRoles(data.data);
      }
    } catch (error) {
      console.error(`Failed to fetch roles: ${error}`);
    }
  };

  const fetchIssues = async () => {
    setIssuesLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      // default to submitted issues
      params.append("status", "submitted");
      const response = await fetch(`/api/admin/issues?${params.toString()}`);
      const data = await response.json();
      if (response.ok) {
        setIssues(data.data || []);
      } else {
        toast.error(data.error || "Failed to fetch issues");
      }
    } catch (err) {
      toast.error(`Failed to fetch issues: ${err}`);
    } finally {
      setIssuesLoading(false);
    }
  };

  const handleApproveIssue = async (issueId: string) => {
    if (!confirm("Approve this issue and update account records?")) return;
    try {
      const res = await fetch(`/api/admin/issues/${issueId}/approve`, { method: "PUT" });
      const json = await res.json();
      if (res.ok) {
        toast.success("Issue approved and account updated");
        fetchIssues();
        fetchAccounts();
      } else {
        toast.error(json.error || "Failed to approve issue");
      }
    } catch (err) {
      toast.error(`Failed to approve: ${err}`);
    }
  };

  const handleRejectIssue = async (issueId: string) => {
    const reason = prompt("Enter reason for rejection (optional):");
    try {
      const res = await fetch(`/api/admin/issues/${issueId}/reject`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("Issue rejected");
        fetchIssues();
      } else {
        toast.error(json.error || "Failed to reject issue");
      }
    } catch (err) {
      toast.error(`Failed to reject: ${err}`);
    }
  };

  const updateUserRole = async (userId: string, roleId: string) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, roleId }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("User role updated successfully");
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to update user role");
      }
    } catch (error) {
      toast.error(`Failed to update user role: ${error}`);
    }
  };

  const updateAccountStatus = async (accountId: string, status: string) => {
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, status }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Account status updated successfully");
        fetchAccounts();
      } else {
        toast.error(data.error || "Failed to update account status");
      }
    } catch (error) {
      toast.error(`Failed to update account status: ${error}`);
    }
  };

  const exportData = async (
    type: "users" | "accounts",
    format: "xlsx" | "json" = "xlsx"
  ) => {
    try {
      const params = new URLSearchParams();
      params.append("format", format);

      // Add filters for accounts export
      if (type === "accounts") {
        if (statusFilter) params.append("status", statusFilter);
        if (batchFilter) params.append("batch", batchFilter);
        if (startDate) params.append("startDate", startDate);
        if (endDate) params.append("endDate", endDate);
      }

      const url = `/api/admin/export/${type}?${params}`;
      const response = await fetch(url);

      if (response.ok) {
        if (format === "json") {
          const data = await response.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${type}_export_${new Date().toISOString().split("T")[0]
            }.json`;
          a.click();
          window.URL.revokeObjectURL(url);
        } else {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${type}_export_${new Date().toISOString().split("T")[0]
            }.xlsx`;
          a.click();
          window.URL.revokeObjectURL(url);
        }
        toast.success(`${type} exported successfully`);
      } else {
        toast.error(`Failed to export ${type}`);
      }
    } catch (error) {
      toast.error(`Failed to export ${type}`);
      console.log("Error: ", error);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please select a file to import");
      return;
    }

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await fetch("/api/admin/import/accounts", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Successfully imported ${data.imported} records as Batch #${data.batchNumber}`
        );
        setShowImportModal(false);
        setImportFile(null);
        if (activeTab === "accounts") {
          fetchAccounts();
        }
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (error) {
      toast.error(`Import failed: ${error}`);
    }
  };

  const handleStudentImport = async () => {
    if (!studentImportFile) {
      toast.error("Please select a file to import");
      return;
    }

    const formData = new FormData();
    formData.append("file", studentImportFile);

    try {
      const response = await fetch("/api/admin/import/students", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        const message =
          data.skipped > 0
            ? `Successfully imported ${data.imported} students. ${data.skipped} rows skipped due to validation errors.`
            : `Successfully imported ${data.imported} students`;
        toast.success(message);

        if (data.badRows && data.badRows.length > 0) {
          console.warn("Skipped rows:", data.badRows);
        }

        setShowStudentImportModal(false);
        setStudentImportFile(null);
        fetchUsers(); // Refresh the users list
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (error) {
      toast.error(`Import failed: ${error}`);
    }
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      fullnames: account.fullnames || "",
      contractNumber: account.contractNumber || "",
      courseOfStudy: account.courseOfStudy || "",
      bankName: account.bankName || "",
      accountNumber: account.accountNumber || "",
      studentId: account.studentId || "",
      status: account.status,
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      const response = await fetch(
        `/api/admin/accounts/${editingAccount._id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success("Account updated successfully");
        setShowEditModal(false);
        setEditingAccount(null);
        fetchAccounts();
      } else {
        toast.error(data.error || "Failed to update account");
      }
    } catch (error) {
      toast.error(`Failed to update account: ${error}`);
    }
  };

  const handleSelectAll = () => {
    if (isSelectAll) {
      setSelectedAccountIds([]);
      setIsSelectAll(false);
    } else {
      setSelectedAccountIds(accounts.map((acc) => acc._id));
      setIsSelectAll(true);
    }
  };

  const handleSelectAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      if (prev.includes(accountId)) {
        const newSelection = prev.filter((id) => id !== accountId);
        setIsSelectAll(false);
        return newSelection;
      } else {
        const newSelection = [...prev, accountId];
        setIsSelectAll(newSelection.length === accounts.length);
        return newSelection;
      }
    });
  };

  const handleBulkMarkAsPaid = async () => {
    if (selectedAccountIds.length === 0) {
      toast.error("Please select at least one account");
      return;
    }

    // Only include accounts that are confirmed and have a studentId
    const eligibleIds = selectedAccountIds.filter((id) => {
      const acc = accounts.find((a) => a._id === id);
      return acc && acc.status === "confirmed" && acc.studentId && acc.studentId.trim() !== "";
    });

    if (eligibleIds.length === 0) {
      toast.error("No selected accounts are confirmed with student IDs. Cannot mark as paid.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to mark ${eligibleIds.length} account(s) as paid?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch("/api/admin/accounts/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: eligibleIds }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `Successfully marked ${data.modifiedCount} accounts as paid`
        );
        setSelectedAccountIds([]);
        setIsSelectAll(false);
        fetchAccounts();
      } else {
        toast.error(data.error || "Failed to update accounts");
      }
    } catch (error) {
      toast.error(`Failed to update accounts: ${error}`);
    }
  };

  const handleDeleteAccount = async (accountId: string, fullnames: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the account for "${fullnames}"?\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Account deleted successfully");
        // Remove from selected if it was selected
        setSelectedAccountIds((prev) => prev.filter((id) => id !== accountId));
        fetchAccounts();
      } else {
        toast.error(data.error || "Failed to delete account");
      }
    } catch (error) {
      toast.error(`Failed to delete account: ${error}`);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the user "${userName}"?\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("User deleted successfully");
        fetchUsers();
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch (error) {
      toast.error(`Failed to delete user: ${error}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "paid":
        return <Coins className="w-4 h-4 text-blue-600" aria-hidden="true" />;
      case "erroneous":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "paid":
        return "bg-blue-100 text-blue-800";
      case "erroneous":
        return "bg-red-100 text-red-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 mt-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-gray-600">Welcome back, {userName}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {/* Total Accounts */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-50">
                <CreditCard className="w-7 h-7 text-purple-600" />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Total Accounts
                </p>

                <p className="text-3xl font-bold text-gray-900 leading-tight">
                  {stats.totalAccounts}
                </p>
              </div>
            </div>
          </div>

          {/* Confirmed */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-50">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Confirmed
                </p>

                <p className="text-3xl font-bold text-gray-900 leading-tight">
                  {stats.confirmedAccounts}
                </p>

                <p
                  className={`text-xs font-semibold mt-1 ${percentages.confirmed < 50
                      ? "text-slate-600"
                      : "text-green-600"
                    }`}
                >
                  {percentages.confirmed}% 
                </p>
              </div>
            </div>
          </div>

          {/* Paid */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-50">
                <Coins className="w-7 h-7 text-blue-600" aria-hidden="true" />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Paid
                </p>

                <p className="text-3xl font-bold text-gray-900 leading-tight">
                  {stats.paidAccounts}
                </p>

                <p
                  className={`text-xs font-semibold mt-1 ${percentages.paid < 49
                      ? "text-slate-600"
                      : "text-green-600"
                    }`}
                >
                  {percentages.paid}% 
                </p>
              </div>
            </div>
          </div>

          {/* Pending */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-yellow-50">
                <Clock className="w-7 h-7 text-yellow-600" />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Pending
                </p>

                <p className="text-3xl font-bold text-gray-900 leading-tight">
                  {stats.pendingAccounts}
                </p>

                <p className="text-xs font-semibold mt-1 text-slate-600">
                  {percentages.pending}% 
                </p>
              </div>
            </div>
          </div>

          {/* Erroneous */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 hover:shadow-md">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-50">
                <XCircle className="w-7 h-7 text-red-600" />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Erroneous
                </p>

                <p className="text-3xl font-bold text-gray-900 leading-tight">
                  {stats.erroneousAccounts}
                </p>

                <p className="text-xs font-semibold mt-1 text-slate-600">
                  {percentages.erroneous}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab("users")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "users"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                User Management
              </button>
              <button
                onClick={() => setActiveTab("accounts")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === "accounts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                <CreditCard className="w-4 h-4 inline mr-2" />
                Account Records
              </button>
              <button
                onClick={() => setActiveTab("issues")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "issues"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Eye className="w-4 h-4 inline mr-2" />
                Issues Review
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Bulk Actions Bar - Only for accounts tab */}
            {activeTab === "accounts" && selectedAccountIds.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    {selectedAccountIds.length} account
                    {selectedAccountIds.length !== 1 ? "s" : ""} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleBulkMarkAsPaid}
                    className="bg-blue-600 hover:bg-blue-700"
                    aria-label="Mark selected accounts as paid"
                  >
                    Mark as Paid
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedAccountIds([]);
                      setIsSelectAll(false);
                    }}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder={`Search ${activeTab}...`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {activeTab === "users" && (
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Roles</option>
                    {roles.map((role) => (
                      <option key={role._id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2">
                  {activeTab === "users" && (
                    <Button
                      onClick={() => setShowStudentImportModal(true)}
                      variant="outline"
                      size="lg"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Import Academia Data
                    </Button>
                  )}

                  <Button
                    onClick={() =>
                      exportData(
                        activeTab === "users" ? "users" : "accounts",
                        "xlsx"
                      )
                    }
                    variant="outline"
                    size="lg"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export {statusFilter ? `(${statusFilter})` : ""}
                  </Button>

                  {activeTab === "accounts" && (
                    <Button
                      onClick={() => setShowImportModal(true)}
                      variant="outline"
                      size="lg"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Import Accounts
                    </Button>
                  )}
                </div>
              </div>

              {/* Additional Filters for Accounts */}
              {activeTab === "accounts" && (
                <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      Filters:
                    </span>
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                    <option value="erroneous">Erroneous</option>
                  </select>

                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">All Batches</option>
                    {availableBatches.map((batch) => (
                      <option key={batch} value={batch}>
                        Batch {batch}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-3 items-end">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="admin-date-from"
                        className="text-xs font-medium text-gray-600"
                      >
                        Date From
                      </label>
                      <input
                        id="admin-date-from"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        aria-label="Date From"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="admin-date-to"
                        className="text-xs font-medium text-gray-600"
                      >
                        Date To
                      </label>
                      <input
                        id="admin-date-to"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        aria-label="Date To"
                      />
                    </div>
                  </div>

                  {(statusFilter || batchFilter || startDate || endDate) && (
                    <Button
                      onClick={() => {
                        setStatusFilter("");
                        setBatchFilter("");
                        setStartDate("");
                        setEndDate("");
                      }}
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Users Table */}
            {activeTab === "users" && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-center">
                          Loading...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-4 text-center text-gray-500"
                        >
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr key={user._id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {user.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {user.email}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.studentId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <select
                              value={user.role?.name || ""}
                              onChange={(e) => {
                                const selectedRole = roles.find(
                                  (r) => r.name === e.target.value
                                );
                                if (selectedRole) {
                                  updateUserRole(user._id, selectedRole._id);
                                }
                              }}
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            >
                              {roles.map((role) => (
                                <option key={role._id} value={role.name}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleDeleteUser(user._id, user.name)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Accounts Table */}
            {activeTab === "accounts" && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={isSelectAll && accounts.length > 0}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => toggleSort("firstName")}
                          className="flex items-center gap-2"
                          aria-label="Sort by first name"
                        >
                          First Name
                          {sortField === "firstName" && (
                            <span className="text-xs">{sortOrder === "asc" ? "▲" : "▼"}</span>
                          )}
                        </button>
                      </th>

                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => toggleSort("surname")}
                          className="flex items-center gap-2"
                          aria-label="Sort by surname"
                        >
                          Surname
                          {sortField === "surname" && (
                            <span className="text-xs">{sortOrder === "asc" ? "▲" : "▼"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => toggleSort("contractNumber")}
                          className="flex items-center gap-2"
                          aria-label="Sort by contract number"
                        >
                          Contract Number
                          {sortField === "contractNumber" && (
                            <span className="text-xs">{sortOrder === "asc" ? "▲" : "▼"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Bank Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => toggleSort("batchNumber")}
                          className="flex items-center gap-2"
                          aria-label="Sort by batch"
                        >
                          Batch
                          {sortField === "batchNumber" && (
                            <span className="text-xs">{sortOrder === "asc" ? "▲" : "▼"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Student ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-4 text-center">
                          Loading...
                        </td>
                      </tr>
                    ) : accounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-6 py-4 text-center text-gray-500"
                        >
                          No accounts found
                        </td>
                      </tr>
                    ) : (
                      accounts.map((account) => (
                        <tr
                          key={account._id}
                          className={
                            selectedAccountIds.includes(account._id)
                              ? "bg-blue-50"
                              : ""
                          }
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.includes(account._id)}
                              onChange={() => handleSelectAccount(account._id)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {account.firstName || ""}
                            </div>
                            <div className="text-sm text-gray-500">
                              {account.courseOfStudy}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {account.surname || ""}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {account.contractNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {account.bankName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {account.accountNumber}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              #{account.batchNumber || "-"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getStatusIcon(account.status)}
                              <select
                                value={account.status}
                                onChange={(e) => {
                                  const newStatus = e.target.value as
                                    | "pending"
                                    | "confirmed"
                                    | "erroneous"
                                    | "paid";
                                  if (
                                    newStatus === "paid" &&
                                    (account.status !== "confirmed" ||
                                      !account.studentId ||
                                      account.studentId.trim() === "")
                                  ) {
                                    toast.error(
                                      "Account must be confirmed and have a student ID before being marked as paid"
                                    );
                                    return;
                                  }
                                  updateAccountStatus(account._id, newStatus);
                                }}
                                className={`ml-2 text-xs px-2 py-1 rounded-full border-0 ${getStatusColor(
                                  account.status
                                )}`}
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="paid">Paid</option>
                                <option value="erroneous">Erroneous</option>
                              </select>
                            </div>
                            {account.paidDate && (
                              <div className="text-xs text-gray-500 mt-1">
                                Paid:{" "}
                                {new Date(
                                  account.paidDate
                                ).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {account.studentId || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() =>
                                handleDeleteAccount(
                                  account._id,
                                  (`${account.firstName || ""} ${account.surname || ""}`.trim() || account.fullnames)
                                )
                              }
                              className="text-red-600 hover:text-red-900 mr-3"
                              title="Delete account"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(account)}
                              className="text-gray-600 hover:text-gray-900"
                              title="Edit account"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Issues Review */}
            {activeTab === "issues" && (
              <div>
                {issuesLoading ? (
                  <div className="text-center py-8">Loading issues...</div>
                ) : issues.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No issues to review</div>
                ) : (
                  <div className="space-y-4">
                    {issues.map((issue) => (
                      <div key={issue._id} className="bg-white rounded-lg p-4 shadow">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-sm text-gray-500">Contract</div>
                            <div className="font-medium text-gray-900">{issue.contractNumber}</div>
                            <div className="text-sm text-gray-500 mt-1">Student ID: {issue.studentId}</div>
                          </div>
                          <div className="text-sm text-gray-500">{issue.createdAt ? new Date(issue.createdAt).toLocaleString() : "-"}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                          <div>
                            <div className="text-xs text-gray-500">Bank</div>
                            <div className="font-medium">{issue.bankName}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Account</div>
                            <div className="font-mono">{issue.accountNumber}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Status</div>
                            <div className="inline-flex items-center px-2 py-1 rounded text-xs bg-yellow-50 text-yellow-800">{issue.status}</div>
                          </div>
                        </div>

                        {issue.notes && (
                          <div className="mt-3 text-sm text-gray-700">{issue.notes}</div>
                        )}

                        {issue.proofUrls && issue.proofUrls.length > 0 && (
                          <div className="mt-3 flex gap-3 overflow-x-auto">
                            {issue.proofUrls.map((u: string, idx: number) => (
                              <a key={idx} href={u} target="_blank" rel="noreferrer" className="block w-28 h-20 bg-gray-100 rounded overflow-hidden">
                                <Image src={u} alt={`proof-${idx}`} width={112} height={80} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex gap-2">
                          <Button onClick={() => handleApproveIssue(issue._id)} className="bg-green-600 hover:bg-green-700">Approve</Button>
                          <Button variant="outline" onClick={() => handleRejectIssue(issue._id)}>Reject</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Import Account Records
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Excel file
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!importFile}>
                Import
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Student Import Modal */}
      {showStudentImportModal && (
        <div className="fixed inset-0 bg-black/80 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              Import Student Records
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Excel file
              </label>
              <p className="text-xs text-gray-600 mb-2">
                Expected columns: name, surname, email, studentId, studentStatus
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) =>
                  setStudentImportFile(e.target.files?.[0] || null)
                }
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowStudentImportModal(false);
                  setStudentImportFile(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStudentImport}
                disabled={!studentImportFile}
              >
                Import
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Account Modal */}
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Edit Account Record</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingAccount(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Names
                  </label>
                  <input
                    type="text"
                    value={editForm.fullnames}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        fullnames: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contract Number
                  </label>
                  <input
                    type="text"
                    value={editForm.contractNumber}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        contractNumber: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course of Study
                  </label>
                  <input
                    type="text"
                    value={editForm.courseOfStudy}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        courseOfStudy: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={editForm.bankName}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        bankName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={editForm.accountNumber}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        accountNumber: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={editForm.studentId}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        studentId: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: e.target.value as
                          | "pending"
                          | "confirmed"
                          | "erroneous"
                          | "paid",
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                    <option value="erroneous">Erroneous</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingAccount(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Update Account</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
