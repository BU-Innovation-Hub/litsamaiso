/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle, ChevronLeft, ChevronRight, Clock, CreditCard, Eye, FileText, Filter, Image as ImageIcon, Receipt, RefreshCcw, Search, ShieldCheck, Upload, X, XCircle, Download, Edit, Loader } from 'lucide-react';
import exportData from '../exporters';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { accountService, type AccountReports } from '../services/accountService';
import { institutionService } from '../services/institutionService';
import { studentService } from '../services/studentService';
import { issueService } from '../services/issueService';
import { adminIssueService } from '../services/adminIssueService';
import { getApiErrorMessage } from '../utils/apiError';
import { getRoleName } from '../utils/userDisplay';
import type { Account, Institution } from '../types';
import Lightbox from '../components/Lightbox';

const AccountsPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const role = getRoleName(user);
  const [reports, setReports] = useState<AccountReports | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [availableBatches, setAvailableBatches] = useState<number[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [accountBatch, setAccountBatch] = useState('');
  const [accountStartDate, setAccountStartDate] = useState('');
  const [accountEndDate, setAccountEndDate] = useState('');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [correction, setCorrection] = useState({
    correctedBankName: '',
    correctedAccountNumber: '',
    document: null as File | null,
  });

  const [activeTab, setActiveTab] = useState<'records' | 'issues'>(
    searchParams.get('tab') === 'issues' ? 'issues' : 'records',
  );
  const accountsFileRef = useRef<HTMLInputElement | null>(null);
  const paidFileRef = useRef<HTMLInputElement | null>(null);
  const studentsFileRef = useRef<HTMLInputElement | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [issueList, setIssueList] = useState<any[] | null>(null);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [reviewingIssue, setReviewingIssue] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<any | null>(null);
  const [issuePage, setIssuePage] = useState(1);
  const issuePageSize = 10;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // issue service (student-scoped)
  // lazy import to avoid circular deps - using local service
  // we'll import at top of file

  // UI state for selection, bulk actions and editing
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState<Partial<Account>>({
    fullnames: '',
    contractNumber: '',
    courseOfStudy: '',
    bankName: '',
    accountNumber: '',
    status: 'pending',
  });

  const canViewReports = ['AppAdmin', 'InstitutionAdmin', 'Finance'].includes(role);
  const isAppAdmin = role === 'AppAdmin';

  const loadAccountRows = useCallback(async () => {
    if (!canViewReports) return;

    setAccountsLoading(true);
    try {
      const response = await accountService.listAccounts({
        search: accountSearch || undefined,
        status: accountStatus || undefined,
        batchNumber: accountBatch || undefined,
        startDate: accountStartDate || undefined,
        endDate: accountEndDate || undefined,
        institutionId: selectedInstitutionId || undefined,
        limit: 200,
      });
      setAccounts(response.accounts);
      setAvailableBatches(response.batches || []);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load accounts'));
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, [accountBatch, accountEndDate, accountSearch, accountStartDate, accountStatus, canViewReports, selectedInstitutionId]);

  useEffect(() => {
    const loadReports = async () => {
      if (!canViewReports) return;

      try {
        setReports(await accountService.getReports({
          institutionId: selectedInstitutionId || undefined,
        }));
      } catch {
        setReports(null);
      }
    };

    void loadReports();
  }, [canViewReports, selectedInstitutionId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAccountRows();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadAccountRows]);

  useEffect(() => {
    const loadInstitutions = async () => {
      if (!isAppAdmin) return;

      try {
        setInstitutions(await institutionService.getInstitutions());
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to load institutions'));
      }
    };

    void loadInstitutions();
  }, [isAppAdmin]);

  useEffect(() => {
    const loadIssues = async () => {
      if (activeTab !== 'issues') return;
      if (role !== 'Student') return;
      setIssuesLoading(true);
      try {
        const list = await issueService.listIssues();
        setIssueList(list || []);
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Failed to load issues'));
        setIssueList([]);
      } finally {
        setIssuesLoading(false);
      }
    };

    void loadIssues();
  }, [activeTab, role]);

  // Auto-load issues for Finance users when the page mounts (keeps the manual Refresh button)
  useEffect(() => {
    const loadFinanceIssues = async () => {
      if (role !== 'Finance') return;
      setIssuesLoading(true);
      try {
        const list = await adminIssueService.listIssues({ search: accountSearch || undefined });
        setIssueList(list || []);
        setIssuePage(1);
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, 'Failed to load issues'));
        setIssueList([]);
      } finally {
        setIssuesLoading(false);
      }
    };

    void loadFinanceIssues();
    // Intentionally run when role or accountSearch changes so finance users see relevant results
  }, [role, accountSearch]);

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    uploadType: 'accounts' | 'paid' | 'students'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const response =
        uploadType === 'accounts'
          ? await accountService.uploadAccounts(file)
          : uploadType === 'paid'
            ? await accountService.uploadPaidStudents(file)
            : await studentService.uploadStudents(file);
      toast.success(response.message || 'Upload completed');
      if (canViewReports) {
        setReports(await accountService.getReports({
          institutionId: selectedInstitutionId || undefined,
        }));
        await loadAccountRows();
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Upload failed'));
    } finally {
      event.target.value = '';
    }
  };

  const handleCorrectionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!correction.document) {
      toast.error('Upload a supporting document');
      return;
    }

    try {
      const response = await accountService.submitCorrection({
        correctedBankName: correction.correctedBankName,
        correctedAccountNumber: correction.correctedAccountNumber,
        document: correction.document,
      });
      toast.success(response.message || 'Correction submitted');
      setCorrection({
        correctedBankName: '',
        correctedAccountNumber: '',
        document: null,
      });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Correction submission failed'));
    }
  };

  const handleAccountStatusChange = async (account: Account, status: Account['status']) => {
    try {
      await accountService.updateAccount(account._id, { status });
      toast.success('Account status updated');
      await Promise.all([
        loadAccountRows(),
        accountService.getReports({
          institutionId: selectedInstitutionId || undefined,
        }).then(setReports),
      ]);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update account status'));
    }
  };

  const handleSelectAll = () => {
    if (isSelectAll) {
      setSelectedAccountIds([]);
      setIsSelectAll(false);
    } else {
      const ids = accounts.map((a) => a._id);
      setSelectedAccountIds(ids);
      setIsSelectAll(true);
    }
  };

  const handleSelectAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      if (prev.includes(accountId)) return prev.filter((id) => id !== accountId);
      return [...prev, accountId];
    });
  };

  const handleBulkMarkAsPaid = async () => {
    if (selectedAccountIds.length === 0) return;
    try {
      await Promise.all(selectedAccountIds.map((id) => accountService.updateAccount(id, { status: 'paid' } as any)));
      toast.success(`Marked ${selectedAccountIds.length} accounts as paid`);
      setSelectedAccountIds([]);
      setIsSelectAll(false);
      await Promise.all([loadAccountRows(), accountService.getReports({ institutionId: selectedInstitutionId || undefined }).then(setReports)]);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to mark selected accounts as paid'));
    }
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      fullnames: account.fullnames,
      contractNumber: account.contractNumber,
      courseOfStudy: account.courseOfStudy,
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      status: account.status,
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingAccount(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    try {
      await accountService.updateAccount(editingAccount._id, editForm as any);
      toast.success('Account updated');
      closeEditModal();
      await Promise.all([loadAccountRows(), accountService.getReports({ institutionId: selectedInstitutionId || undefined }).then(setReports)]);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update account'));
    }
  };

  const exportSelectedAsJson = () => {
    const selected = accounts.filter((a) => selectedAccountIds.includes(a._id));
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `accounts_selected_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const summary = reports?.reports.summary;

  const percentages = useMemo(() => {
    const total = summary?.total || 0;
    if (total === 0) return { confirmed: 0, paid: 0, unconfirmed: 0 };
    return {
      confirmed: Math.round(((summary?.confirmed || 0) / total) * 1000) / 10,
      paid: Math.round(((summary?.paid || 0) / total) * 1000) / 10,
      unconfirmed: Math.round(((summary?.unconfirmed || 0) / total) * 1000) / 10,
    };
  }, [summary]);

  const getStatusLabel = (status?: string) => {
    const normalized = (status || 'pending').toLowerCase();
    return normalized === 'undefined' ? 'pending' : normalized;
  };

  const getStatusColor = (status?: string) => {
    switch (getStatusLabel(status)) {
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'paid':
        return 'bg-blue-100 text-blue-800';
      case 'erroneous':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (getStatusLabel(status)) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'paid':
        return <CreditCard className="h-4 w-4 text-blue-600" />;
      case 'erroneous':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getIssueStatusBadgeClass = (status?: string) => {
    const normalized = String(status || 'submitted').toLowerCase();
    if (normalized === 'resolved' || normalized === 'approved') return 'bg-green-100 text-green-800';
    if (normalized === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const formatIssueReason = (reason: string) => {
    const labels: Record<string, string> = {
      accountNumberMismatch: 'Account number mismatch',
      bankNameMismatch: 'Bank name mismatch',
      studentIdMismatch: 'Student does not match account',
      studentSubmitted: 'Student logged issue',
      studentUpdated: 'Student updated correction',
      studentResolutionSubmitted: 'Student submitted correction',
    };
    return labels[reason] || reason.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
  };

  const displayValue = (value: unknown) => {
    const text = String(value || '').trim();
    return text || '-';
  };

  const normalizeComparable = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const hasChanged = (original: unknown, proposed: unknown) => {
    const originalValue = normalizeComparable(original);
    const proposedValue = normalizeComparable(proposed);
    return Boolean(originalValue && proposedValue && originalValue !== proposedValue);
  };

  const getIssueProofImages = (issue: any) => {
    const urls = Array.isArray(issue.proofUrls) ? issue.proofUrls.filter(Boolean) : [];
    if (issue.documentBase64 && String(issue.documentMimeType || '').startsWith('image/')) {
      return [...urls, `data:${issue.documentMimeType};base64,${issue.documentBase64}`];
    }
    return urls;
  };

  const financeIssueRows = Array.isArray(issueList) ? issueList : [];
  const totalIssuePages = Math.max(1, Math.ceil(financeIssueRows.length / issuePageSize));
  const currentIssuePage = Math.min(issuePage, totalIssuePages);
  const paginatedIssueRows = financeIssueRows.slice(
    (currentIssuePage - 1) * issuePageSize,
    currentIssuePage * issuePageSize,
  );
  const issueStart = financeIssueRows.length === 0 ? 0 : (currentIssuePage - 1) * issuePageSize + 1;
  const issueEnd = Math.min(currentIssuePage * issuePageSize, financeIssueRows.length);
  const selectedIssueStatus = String(selectedIssue?.status || 'submitted').toLowerCase();
  const selectedIssueIsPending = selectedIssueStatus === 'submitted' || selectedIssueStatus === 'reported';
  const currentReviewingIssue = reviewingIssue;
  const selectedIssueAction = selectedIssue && currentReviewingIssue && currentReviewingIssue.id === selectedIssue._id
    ? currentReviewingIssue.action
    : null;
  const selectedIssueCurrentBankName = selectedIssue?.recordedBankName || selectedIssue?.account?.bankName;
  const selectedIssueCurrentAccountNumber = selectedIssue?.recordedAccountNumber || selectedIssue?.account?.accountNumber;
  const selectedIssueProposedBankName = selectedIssue?.correctedBankName || selectedIssue?.bankName;
  const selectedIssueProposedAccountNumber = selectedIssue?.correctedAccountNumber || selectedIssue?.accountNumber;
  const selectedIssueBankChanged = hasChanged(selectedIssueCurrentBankName, selectedIssueProposedBankName);
  const selectedIssueAccountChanged = hasChanged(selectedIssueCurrentAccountNumber, selectedIssueProposedAccountNumber);
  const selectedIssueProofImages = selectedIssue ? getIssueProofImages(selectedIssue) : [];
  const selectedIssueReasons = selectedIssue && Array.isArray(selectedIssue.reasons) ? selectedIssue.reasons : [];

  return (
    <div className="global-bg min-h-screen pt-5 pb-14">
      <div className="mx-auto max-w-6xl px-4 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-primary-clr">Accounts</h1>
          <p className="text-muted-foreground">
            Confirm accounts, import records, and resolve payment issues.
          </p>
        </div>

        <div className="bg-white rounded-md shadow-sm">
          <nav className="flex items-center gap-6 px-4 py-3">
            <button onClick={() => setActiveTab('records')} className={`text-sm font-medium ${activeTab === 'records' ? 'text-blue-600 border-b-2 border-blue-600 pb-2' : 'text-gray-600'}`}>Account Records</button>
            <button onClick={() => setActiveTab('issues')} className={`text-sm font-medium ${activeTab === 'issues' ? 'text-blue-600 border-b-2 border-blue-600 pb-2' : 'text-gray-600'}`}>Issues Review</button>
          </nav>
        </div>

        {isAppAdmin && (
          <div className="rounded-lg bg-white p-6 shadow">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Report Scope
            </label>
            <select
              value={selectedInstitutionId}
              onChange={(event) => setSelectedInstitutionId(event.target.value)}
              className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">All institutions</option>
              {institutions.map((institution) => (
                <option key={institution._id} value={institution._id}>
                  {institution.name}
                </option>
              ))}
            </select>
            {reports?.scope && (
              <p className="mt-2 text-sm text-muted-foreground">
                Viewing {reports.scope.allInstitutions ? 'all institutions' : reports.scope.institutionName || 'selected institution'}.
              </p>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Issues</h2>
                <p className="text-sm text-muted-foreground">Student-submitted issues and finance resolutions.</p>
              </div>
            </div>

            <div className="mt-4">
              {role === 'Student' && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button onClick={async () => { setIssuesLoading(true); try { const list = await issueService.listIssues(); setIssueList(list || []); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to refresh issues')); } finally { setIssuesLoading(false); } }} className="rounded-md bg-button px-3 py-2 text-white">Refresh</button>
                    <button onClick={async () => { try { const res = await issueService.deleteIssuesForStudent(); toast.success(res.message || 'Deleted issues'); setIssueList([]); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to delete issues')); } }} className="rounded-md border border-gray-300 px-3 py-2">Delete all</button>
                  </div>
                  {issuesLoading ? (
                    <p className="text-gray-500">Loading issues...</p>
                  ) : !issueList || issueList.length === 0 ? (
                    <p className="text-gray-500">No issues found</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Contract</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Bank</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Submitted</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {issueList.map((it) => (
                            <tr key={(it as any)._id}>
                              <td className="px-6 py-4 text-sm font-medium text-gray-900">{(it as any).contractNumber}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{(it as any).bankName}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{(it as any).accountNumber}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{(it as any).status}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{new Date((it as any).createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {role === 'Finance' && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      disabled={issuesLoading}
                      onClick={async () => {
                        setIssuesLoading(true);
                        try {
                          const list = await adminIssueService.listIssues({ search: accountSearch || undefined });
                          setIssueList(list || []);
                          setIssuePage(1);
                        } catch (err) {
                          toast.error(getApiErrorMessage(err, 'Failed to load issues'));
                          setIssueList([]);
                        } finally {
                          setIssuesLoading(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {issuesLoading ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      {issuesLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>

                  {issuesLoading ? (
                    <div className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-gray-600">
                      <Loader className="h-5 w-5 animate-spin text-active" />
                      Loading issue history...
                    </div>
                  ) : !issueList || issueList.length === 0 ? (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-6 text-gray-600">No issues found</div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Contract</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Student</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Problem</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Student correction</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Proof</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Submitted</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {paginatedIssueRows.map((it: any) => {
                              const issueStatus = String(it.status || 'submitted').toLowerCase();
                              const reasons = Array.isArray(it.reasons) ? it.reasons : [];
                              const proposedBankName = it.correctedBankName || it.bankName;
                              const proposedAccountNumber = it.correctedAccountNumber || it.accountNumber;
                              const proofImages = getIssueProofImages(it);
                              const problemSummary = reasons.length > 0
                                ? reasons.map((reason: string) => formatIssueReason(reason)).join(', ')
                                : 'Manual review';

                              return (
                                <tr
                                  key={it._id}
                                  onClick={() => setSelectedIssue(it)}
                                  className="cursor-pointer transition hover:bg-slate-50"
                                >
                                  <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{displayValue(it.contractNumber)}</td>
                                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{(it.student && it.student.studentId) || it.studentId || '-'}</td>
                                  <td className="max-w-xs px-4 py-4 text-sm text-slate-700">
                                    <div className="line-clamp-2">{problemSummary}</div>
                                  </td>
                                  <td className="px-4 py-4 text-sm text-slate-700">
                                    <p className="font-medium text-slate-950">{displayValue(proposedBankName)}</p>
                                    <p className="text-slate-500">{displayValue(proposedAccountNumber)}</p>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                      <ImageIcon className="h-3.5 w-3.5" />
                                      {proofImages.length || (it.documentFileName ? 1 : 0)}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-4 text-sm">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getIssueStatusBadgeClass(issueStatus)}`}>
                                      {issueStatus}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{it.createdAt ? new Date(it.createdAt).toLocaleDateString() : '-'}</td>
                                  <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedIssue(it);
                                      }}
                                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                                    >
                                      <Eye className="h-4 w-4" />
                                      Review
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-600">
                          Showing {issueStart}-{issueEnd} of {financeIssueRows.length} issues
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentIssuePage <= 1}
                            onClick={() => setIssuePage((page) => Math.max(1, page - 1))}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </button>
                          <span className="rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700">
                            Page {currentIssuePage} of {totalIssuePages}
                          </span>
                          <button
                            type="button"
                            disabled={currentIssuePage >= totalIssuePages}
                            onClick={() => setIssuePage((page) => Math.min(totalIssuePages, page + 1))}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {role !== 'Student' && role !== 'Finance' && (
                <p className="text-gray-600">Listing all student issues is not available on this API. Finance users can resolve issues by Student ID.</p>
              )}
            </div>
          </div>
        )}

        {selectedIssue && (
          <div className="fixed inset-0 z-40">
            <button
              type="button"
              aria-label="Close issue review"
              className="absolute inset-0 bg-slate-950/40"
              onClick={() => setSelectedIssue(null)}
            />
            <aside className="absolute right-0 top-0 flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-950">{displayValue(selectedIssue.contractNumber)}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getIssueStatusBadgeClass(selectedIssueStatus)}`}>
                      {selectedIssueStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Student {(selectedIssue.student && selectedIssue.student.studentId) || selectedIssue.studentId || '-'} submitted this on {selectedIssue.createdAt ? new Date(selectedIssue.createdAt).toLocaleString() : '-'}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIssue(null)}
                  className="rounded-md p-2 text-slate-500 transition hover:bg-white hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  {selectedIssueReasons.length > 0 ? selectedIssueReasons.map((reason: string) => (
                    <span key={reason} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                      <AlertTriangle className="h-3 w-3" />
                      {formatIssueReason(reason)}
                    </span>
                  )) : (
                    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">Manual review</span>
                  )}
                </div>

                <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="grid gap-0 lg:grid-cols-[1fr_auto_1fr]">
                    <section className="px-5 py-5">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary-clr">
                        <XCircle className="h-4 w-4" />
                        Current record
                      </div>
                      <dl className="space-y-3">
                        <div>
                          <dt className="text-xs uppercase text-slate-500">Bank name in system</dt>
                          <dd className="mt-1 text-sm font-medium text-slate-950">{displayValue(selectedIssueCurrentBankName)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-slate-500">Account number in system</dt>
                          <dd className="mt-1 text-sm font-medium text-slate-950">{displayValue(selectedIssueCurrentAccountNumber)}</dd>
                        </div>
                        {!selectedIssue.account && (
                          <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            No matching account record was returned for this contract.
                          </p>
                        )}
                      </dl>
                    </section>

                    <div className="hidden items-center justify-center border-x border-slate-200 px-4 lg:flex">
                      <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    </div>

                    <section className="border-t border-slate-200 px-5 py-5 lg:border-t-0">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        Student says correct
                      </div>
                      <dl className="space-y-3">
                        <div>
                          <dt className="flex items-center gap-2 text-xs uppercase text-slate-500">
                            Correct bank name
                            {selectedIssueBankChanged && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">changed</span>}
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-slate-950">{displayValue(selectedIssueProposedBankName)}</dd>
                        </div>
                        <div>
                          <dt className="flex items-center gap-2 text-xs uppercase text-slate-500">
                            Correct account number
                            {selectedIssueAccountChanged && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">changed</span>}
                          </dt>
                          <dd className="mt-1 text-sm font-medium text-slate-950">{displayValue(selectedIssueProposedAccountNumber)}</dd>
                        </div>
                        {selectedIssue.notes && (
                          <div>
                            <dt className="text-xs uppercase text-slate-500">Student notes</dt>
                            <dd className="mt-1 text-sm text-slate-700">{selectedIssue.notes}</dd>
                          </div>
                        )}
                      </dl>
                    </section>
                  </div>

                  <div className="border-t border-slate-200 px-5 py-5">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ImageIcon className="h-4 w-4" />
                      Proof submitted
                    </div>
                    {selectedIssueProofImages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedIssueProofImages.map((url: string, idx: number) => (
                          <button
                            key={`${url}-${idx}`}
                            type="button"
                            onClick={() => { setLightboxImages(selectedIssueProofImages); setLightboxIndex(idx); setLightboxOpen(true); }}
                            className="group overflow-hidden rounded-md border border-slate-200 bg-white p-1 transition hover:border-active"
                            aria-label={`Open proof ${idx + 1}`}
                          >
                            <img src={url} alt={`proof-${idx}`} className="h-24 w-32 rounded object-cover transition group-hover:opacity-90" />
                          </button>
                        ))}
                      </div>
                    ) : selectedIssue.documentFileName ? (
                      <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                        <FileText className="h-4 w-4" />
                        {selectedIssue.documentFileName}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No proof uploaded.</p>
                    )}
                  </div>
                </article>
              </div>

              <div className="border-t border-slate-200 bg-white px-6 py-4">
                {selectedIssueIsPending ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      disabled={Boolean(reviewingIssue)}
                      onClick={async () => {
                        if (!confirm('Approve this issue and update account records?')) return;
                        setReviewingIssue({ id: selectedIssue._id, action: 'approve' });
                        try {
                          await adminIssueService.approveIssue(selectedIssue._id);
                          toast.success('Issue approved and account updated');
                          const list = await adminIssueService.listIssues({ search: accountSearch || undefined });
                          setIssueList(list || []);
                          setSelectedIssue(null);
                          if (canViewReports) await loadAccountRows();
                        } catch (err: any) {
                          toast.error(getApiErrorMessage(err, 'Failed to approve issue'));
                        } finally {
                          setReviewingIssue(null);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-primary-clr px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectedIssueAction === 'approve' ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {selectedIssueAction === 'approve' ? 'Approving...' : 'Approve correction'}
                    </button>
                    <button
                      disabled={Boolean(reviewingIssue)}
                      onClick={async () => {
                        const reason = prompt('Enter reason for rejection (optional):');
                        setReviewingIssue({ id: selectedIssue._id, action: 'reject' });
                        try {
                          await adminIssueService.rejectIssue(selectedIssue._id, reason || undefined);
                          toast.success('Issue rejected');
                          const list = await adminIssueService.listIssues({ search: accountSearch || undefined });
                          setIssueList(list || []);
                          setSelectedIssue(null);
                        } catch (err: any) {
                          toast.error(getApiErrorMessage(err, 'Failed to reject issue'));
                        } finally {
                          setReviewingIssue(null);
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectedIssueAction === 'reject' ? <Loader className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      {selectedIssueAction === 'reject' ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedIssue(null)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {showEditModal && editingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black opacity-40" onClick={closeEditModal} />
            <div className="relative z-10 w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg">
              <h3 className="text-lg font-semibold">Edit account</h3>
              <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="text-sm text-gray-600">Fullnames</label>
                  <input value={String(editForm.fullnames || '')} onChange={(e) => setEditForm((p) => ({ ...p, fullnames: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input value={String(editForm.contractNumber || '')} onChange={(e) => setEditForm((p) => ({ ...p, contractNumber: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                  <input value={String(editForm.courseOfStudy || '')} onChange={(e) => setEditForm((p) => ({ ...p, courseOfStudy: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input value={String(editForm.bankName || '')} onChange={(e) => setEditForm((p) => ({ ...p, bankName: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                  <input value={String(editForm.accountNumber || '')} onChange={(e) => setEditForm((p) => ({ ...p, accountNumber: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Status</label>
                  <select value={String(editForm.status || 'pending')} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as any }))} className="w-full rounded-md border border-gray-300 px-3 py-2">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                    <option value="erroneous">Erroneous</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeEditModal} className="rounded-md border border-gray-300 px-4 py-2">Cancel</button>
                  <button type="submit" className="rounded-md bg-active px-4 py-2 text-white">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {lightboxOpen && (
          <Lightbox images={lightboxImages} startIndex={lightboxIndex} onClose={() => setLightboxOpen(false)} />
        )}

        {summary && (
          <div className="grid gap-4 md:grid-cols-4">
            <ReportCard label="Total Accounts" value={summary.total} />
            <ReportCard label="Confirmed" value={summary.confirmed} percent={percentages.confirmed} />
            <ReportCard label="Paid" value={summary.paid} percent={percentages.paid} />
            <ReportCard label="Unconfirmed" value={summary.unconfirmed} percent={percentages.unconfirmed} />
          </div>
        )}

        {role === 'Student' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white rounded-lg border border-border p-6 shadow-sm">
              <ShieldCheck className="text-active mb-4" size={32} />
              <h2 className="text-xl font-semibold text-primary-clr mb-2">
                Confirm your NMDS account
              </h2>
              <p className="text-muted-foreground mb-5">
                Submit your contract and banking details for verification against your institution's records.
              </p>
              <Link
                to="/accounts/confirm"
                className="inline-flex items-center justify-center rounded-md bg-active px-4 py-2 font-semibold text-white hover:bg-button"
              >
                Start confirmation
              </Link>
            </div>

            <form
              onSubmit={handleCorrectionSubmit}
              className="bg-white rounded-lg border border-border p-6 shadow-sm space-y-4"
            >
              <Receipt className="text-active mb-2" size={32} />
              <div>
                <h2 className="text-xl font-semibold text-primary-clr mb-2">
                  Submit corrected details
                </h2>
                <p className="text-muted-foreground">
                  Use this when Finance needs your corrected bank details and proof document.
                </p>
              </div>
              <input
                value={correction.correctedBankName}
                onChange={(event) =>
                  setCorrection((prev) => ({ ...prev, correctedBankName: event.target.value }))
                }
                placeholder="Correct bank name"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <input
                value={correction.correctedAccountNumber}
                onChange={(event) =>
                  setCorrection((prev) => ({ ...prev, correctedAccountNumber: event.target.value }))
                }
                placeholder="Correct account number"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(event) =>
                  setCorrection((prev) => ({
                    ...prev,
                    document: event.target.files?.[0] || null,
                  }))
                }
                required
                className="block w-full text-sm"
              />
              <button className="w-full rounded-md bg-button py-2 font-semibold text-white" type="submit">
                Submit correction
              </button>
            </form>
          </div>
        )}

        {role === 'InstitutionAdmin' && (
          <div className="bg-white rounded-lg border border-border p-6 shadow-sm max-w-xl">
            <Upload className="text-active mb-4" size={32} />
            <h2 className="text-xl font-semibold text-primary-clr mb-2">Upload student records</h2>
            <p className="text-muted-foreground mb-5">
              Import students before they register. Required columns: studentId, email, name, surname, studentStatus.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => handleUpload(event, 'students')}
              className="block w-full text-sm"
            />
          </div>
        )}

        {/* Finance upload panels and resolve controls are integrated into the table toolbar below */}

        {activeTab === 'records' && canViewReports && (
          <div className="rounded-lg bg-white shadow overflow-hidden pb-5">
            <div className="px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Account Records</h2>
                  <p className="text-sm text-muted-foreground">
                    View uploaded accounts and track confirmation/payment status.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{accounts.length} loaded</span>
                  <div className="relative">
                    <button onClick={() => setShowExportMenu((s) => !s)} className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold">
                      <Download className="w-4 h-4" /> Export
                    </button>
                    {showExportMenu && (
                      <div className="absolute right-0 mt-2 w-72 rounded-md border bg-white shadow z-20 p-2">
                        <div className="px-3 py-2">
                          <div className="text-sm font-medium text-gray-900 mb-1">Account Records</div>
                          <p className="text-xs text-gray-500 mb-2">Exports respect current filters</p>
                          <div className="flex gap-2">
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const blob = await accountService.exportAccounts({ format: 'csv', search: accountSearch || undefined, status: accountStatus || undefined, batchNumber: accountBatch || undefined, startDate: accountStartDate || undefined, endDate: accountEndDate || undefined, institutionId: selectedInstitutionId || undefined }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `accounts-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export CSV')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">CSV</button>
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const blob = await accountService.exportAccounts({ format: 'xlsx', search: accountSearch || undefined, status: accountStatus || undefined, batchNumber: accountBatch || undefined, startDate: accountStartDate || undefined, endDate: accountEndDate || undefined, institutionId: selectedInstitutionId || undefined }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `accounts-${new Date().toISOString().split('T')[0]}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export XLSX')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">XLSX</button>
                          </div>
                        </div>
                        <div className="border-t my-2" />
                        <div className="p-2">
                          <div className="flex gap-2">
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const data = await accountService.getReports({ institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'json', data, meta: { title: 'All Reports' } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export reports')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">Full JSON</button>
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const data = await accountService.getReports({ institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'csv', data, meta: { title: 'All Reports' } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export CSV')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">Full CSV</button>
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const data = await accountService.getReports({ institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'xlsx', data, meta: { title: 'All Reports' } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export XLSX')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">Full XLSX</button>
                            <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const data = await accountService.getReports({ institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'pdf', data, meta: { title: 'All Reports' }, logoSrc: '/logo-1.png' }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export PDF')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">Full PDF</button>
                          </div>
                        </div>
                        <div className="border-t my-2" />
                        {reports?.catalog?.map((c) => (
                          <div key={(c as any).key} className="px-3 py-2">
                            <div className="text-sm font-medium">{(c as any).title}</div>
                            <div className="mt-1 flex gap-2">
                              <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const r = await accountService.getReport((c as any).key, { institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'json', data: r.report, meta: { title: (c as any).title, reportKey: (c as any).key, scope: r.scope } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export report')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">JSON</button>
                              <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const r = await accountService.getReport((c as any).key, { institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'csv', data: r.report, meta: { title: (c as any).title, reportKey: (c as any).key, scope: r.scope } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export CSV')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">CSV</button>
                              <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const r = await accountService.getReport((c as any).key, { institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'xlsx', data: r.report, meta: { title: (c as any).title, reportKey: (c as any).key, scope: r.scope } }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export XLSX')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">XLSX</button>
                              <button disabled={exporting} onClick={async () => { setShowExportMenu(false); setExporting(true); try { const r = await accountService.getReport((c as any).key, { institutionId: selectedInstitutionId || undefined }); await exportData({ format: 'pdf', data: r.report, meta: { title: (c as any).title, reportKey: (c as any).key, scope: r.scope }, logoSrc: '/logo-1.png' }); } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to export PDF')); } finally { setExporting(false); } }} className="text-xs rounded-md border px-2 py-1">PDF</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <button onClick={() => accountsFileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-sm font-semibold text-white">Import Accounts</button>
                    <input ref={accountsFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleUpload(e, 'accounts')} className="hidden" />
                  </div>
                  <div>
                    <button onClick={() => paidFileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-white border border-gray-300 px-3 py-2 text-sm font-semibold">Import Paid</button>
                    <input ref={paidFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleUpload(e, 'paid')} className="hidden" />
                  </div>
                  {isAppAdmin || role === 'InstitutionAdmin' ? (
                    <div>
                      <button onClick={() => studentsFileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-white border border-gray-300 px-3 py-2 text-sm font-semibold">Import Students</button>
                      <input ref={studentsFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleUpload(e, 'students')} className="hidden" />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="Search by name, contract, bank, course, or account number"
                  className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">Filters:</span>
                </div>
                <select
                  value={accountStatus}
                  onChange={(event) => setAccountStatus(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2"
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="paid">Paid</option>
                  <option value="erroneous">Erroneous</option>
                </select>
                <select
                  value={accountBatch}
                  onChange={(event) => setAccountBatch(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2"
                >
                  <option value="">All batches</option>
                  {availableBatches.map((batch) => (
                    <option key={batch} value={batch}>
                      Batch {batch}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                    <label className="text-xs text-gray-500 lg:mr-2">From</label>
                    <input
                      type="date"
                      value={accountStartDate}
                      onChange={(event) => setAccountStartDate(event.target.value)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                    <label className="text-xs text-gray-500 lg:mr-2">To</label>
                    <input
                      type="date"
                      value={accountEndDate}
                      onChange={(event) => setAccountEndDate(event.target.value)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {(accountStatus || accountBatch || accountStartDate || accountEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountStatus('');
                      setAccountBatch('');
                      setAccountStartDate('');
                      setAccountEndDate('');
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 lg:ml-auto"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {selectedAccountIds.length > 0 && (
              <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{selectedAccountIds.length} selected</span>
                  <button onClick={handleBulkMarkAsPaid} className="inline-flex items-center gap-2 rounded-md bg-active px-3 py-1 text-white text-sm font-semibold">Mark as paid</button>
                  <button onClick={exportSelectedAsJson} className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-semibold">Export JSON</button>
                </div>
                <div>
                  <button onClick={() => { setSelectedAccountIds([]); setIsSelectAll(false); }} className="text-sm text-gray-600">Clear selection</button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <input type="checkbox" checked={isSelectAll} onChange={handleSelectAll} />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contract</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bank Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dates</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {accountsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500">Loading accounts...</td>
                    </tr>
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-500">No accounts found</td>
                    </tr>
                  ) : (
                    accounts.map((account) => (
                      <tr key={account._id}>
                        <td className="px-4 py-4">
                          <input type="checkbox" checked={selectedAccountIds.includes(account._id)} onChange={() => handleSelectAccount(account._id)} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">{account.fullnames}</p>
                          <p className="text-sm text-gray-500">{account.courseOfStudy}</p>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                          {account.contractNumber}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <p className="text-sm text-gray-900">{account.bankName || '-'}</p>
                          <p className="text-sm text-gray-500">{account.accountNumber || '-'}</p>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                            #{account.batchNumber || '-'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(account.status)}
                            {['Finance', 'AppAdmin'].includes(role) ? (
                              <select
                                value={getStatusLabel(account.status)}
                                onChange={(event) =>
                                  handleAccountStatusChange(account, event.target.value as Account['status'])
                                }
                                className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${getStatusColor(account.status)}`}
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="paid">Paid</option>
                                <option value="erroneous">Erroneous</option>
                              </select>
                            ) : (
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(account.status)}`}>
                                {getStatusLabel(account.status)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          <p>Confirmed: {account.confirmationDate ? new Date(account.confirmationDate).toLocaleDateString() : '-'}</p>
                          <p>Paid: {account.paidAt || account.paidDate ? new Date(account.paidAt || account.paidDate || '').toLocaleDateString() : '-'}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button onClick={() => openEditModal(account)} className="rounded-md p-2 hover:bg-gray-100">
                              <Edit className="h-4 w-4 text-gray-700" />
                            </button>
                            <button onClick={() => { const b = new Blob([JSON.stringify(account, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `account_${account.contractNumber || account._id}.json`; document.body.appendChild(a); a.click(); a.remove(); }} className="rounded-md p-2 hover:bg-gray-100">
                              <Download className="h-4 w-4 text-gray-700" />
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
        )}

      </div>
    </div>
  );
};

const ReportCard = ({ label, value, percent }: { label: string; value: number; percent?: number }) => (
  <div className="rounded-lg bg-white p-6 shadow">
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <div className="flex items-baseline justify-between">
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {typeof percent === 'number' && (
        <p className="text-sm text-gray-500">{percent}%</p>
      )}
    </div>
    {typeof percent === 'number' && (
      <div className="mt-3 h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-active" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    )}
  </div>
);

export default AccountsPage;
