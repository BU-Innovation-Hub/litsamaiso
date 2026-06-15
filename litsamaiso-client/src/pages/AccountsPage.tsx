import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, CreditCard, FileUp, Filter, Receipt, Search, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { accountService, type AccountReports } from '../services/accountService';
import { institutionService } from '../services/institutionService';
import { studentService } from '../services/studentService';
import { getApiErrorMessage } from '../utils/apiError';
import { getRoleName } from '../utils/userDisplay';
import type { Account, Institution } from '../types';

const AccountsPage: React.FC = () => {
  const { user } = useAuth();
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
  const [financeStudentId, setFinanceStudentId] = useState('');
  const [correction, setCorrection] = useState({
    correctedBankName: '',
    correctedAccountNumber: '',
    document: null as File | null,
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

  const handleFinanceResolve = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const response = await accountService.financeResolveIssue(financeStudentId);
      toast.success(response.message || 'Issue resolved');
      setFinanceStudentId('');
      if (canViewReports) {
        setReports(await accountService.getReports({
          institutionId: selectedInstitutionId || undefined,
        }));
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to resolve issue'));
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

  const summary = reports?.reports.summary;
  const confirmedNotPaid = reports?.reports.confirmedNotPaid;

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

  return (
    <div className="global-bg min-h-screen pt-32">
      <div className="mx-auto max-w-6xl px-4 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-primary-clr">Accounts</h1>
          <p className="text-muted-foreground">
            Confirm accounts, import records, and resolve payment issues.
          </p>
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

        {summary && (
          <div className="grid gap-4 md:grid-cols-4">
            <ReportCard label="Total Accounts" value={summary.total} />
            <ReportCard label="Confirmed" value={summary.confirmed} />
            <ReportCard label="Paid" value={summary.paid} />
            <ReportCard label="Unconfirmed" value={summary.unconfirmed} />
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

        {role === 'Finance' && (
          <div className="grid gap-4 lg:grid-cols-3">
            <UploadPanel
              title="Upload accounts"
              description="Import the institution account spreadsheet used for student confirmations."
              onChange={(event) => handleUpload(event, 'accounts')}
            />
            <UploadPanel
              title="Upload paid students"
              description="Load students whose payments have been processed."
              onChange={(event) => handleUpload(event, 'paid')}
            />
            <form className="bg-white rounded-lg border border-border p-6 shadow-sm space-y-4" onSubmit={handleFinanceResolve}>
              <CheckCircle className="text-active mb-2" size={32} />
              <div>
                <h2 className="text-xl font-semibold text-primary-clr mb-2">Resolve student issue</h2>
                <p className="text-muted-foreground">
                  Apply the pending correction submitted by a student.
                </p>
              </div>
              <input
                value={financeStudentId}
                onChange={(event) => setFinanceStudentId(event.target.value)}
                placeholder="Student ID"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <button className="w-full rounded-md bg-button py-2 font-semibold text-white" type="submit">
                Resolve issue
              </button>
            </form>
          </div>
        )}

        {canViewReports && (
          <div className="rounded-lg bg-white shadow overflow-hidden">
            <div className="border-b px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Account Records</h2>
                  <p className="text-sm text-muted-foreground">
                    View uploaded accounts and track confirmation/payment status.
                  </p>
                </div>
                <span className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                  {accounts.length} loaded
                </span>
              </div>
            </div>

            <div className="space-y-4 border-b p-6">
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
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={accountStartDate}
                    onChange={(event) => setAccountStartDate(event.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={accountEndDate}
                    onChange={(event) => setAccountEndDate(event.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
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

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contract</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bank Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Batch</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Dates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {accountsLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading accounts...</td>
                    </tr>
                  ) : accounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">No accounts found</td>
                    </tr>
                  ) : (
                    accounts.map((account) => (
                      <tr key={account._id}>
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {confirmedNotPaid && confirmedNotPaid.accounts.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold text-gray-900">Confirmed Not Paid</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Contract</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Bank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Course</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {confirmedNotPaid.accounts.slice(0, 10).map((account) => (
                    <tr key={`${account.contractNumber}-${account.accountNumber}`}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.fullnames}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{account.contractNumber}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{account.bankName}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{account.courseOfStudy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ReportCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-white p-6 shadow">
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
  </div>
);

const UploadPanel = ({
  title,
  description,
  onChange,
}: {
  title: string;
  description: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
  <div className="bg-white rounded-lg border border-border p-6 shadow-sm">
    <FileUp className="text-active mb-4" size={32} />
    <h2 className="text-xl font-semibold text-primary-clr mb-2">{title}</h2>
    <p className="text-muted-foreground mb-5">{description}</p>
    <input
      type="file"
      accept=".xlsx,.xls,.csv"
      onChange={onChange}
      className="block w-full text-sm"
    />
  </div>
);

export default AccountsPage;
