import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import Button from './ui/button';
import { issueService } from '../services/issueService';
import { accountService } from '../services/accountService';
import apiClient from '../services/authService';

interface IIssue {
  _id?: string;
  contractNumber: string;
  studentId: string;
  bankName: string;
  accountNumber: string;
  proofUrls?: string[];
  notes?: string;
  status?: string;
}

interface Account {
  _id: string;
  fullnames: string;
  contractNumber: string;
  courseOfStudy: string;
  bankName: string;
  accountNumber: string;
  studentId?: string;
  status?: string;
  confirmationDate?: string;
}

export default function StudentIssues() {
  const [issues, setIssues] = useState<IIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState<IIssue | null>(null);
  const [editForm, setEditForm] = useState({
    fullnames: '',
    contractNumber: '',
    courseOfStudy: '',
    bankName: '',
    accountNumber: '',
    studentId: '',
    status: 'pending' as string,
  });
  const [editNotes, setEditNotes] = useState<string>('');
  const [editProofFiles, setEditProofFiles] = useState<FileList | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      setLoading(true);
      const list = await issueService.listIssues();
      setIssues(list || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load issues');
      toast.error(err?.message || 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await accountService.getStudentAccounts();
      setAccounts(data || []);
    } catch (err: any) {
      toast.error(`Failed to fetch accounts: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const openEditModal = (issue: IIssue, account?: Account | undefined) => {
    setEditingIssue(issue);
    // account parameter used to populate the edit form; we don't store it in state
    setEditForm({
      fullnames: account?.fullnames || '',
      contractNumber: issue.contractNumber || '',
      courseOfStudy: account?.courseOfStudy || '',
      bankName: issue.bankName || '',
      accountNumber: issue.accountNumber || '',
      studentId: issue.studentId || '',
      status: account?.status || 'pending',
    });
    setEditNotes(issue.notes || '');
    setEditProofFiles(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIssue) return;

    try {
      const uploadedUrls: string[] = [];
      if (editProofFiles && editProofFiles.length) {
        for (const file of Array.from(editProofFiles)) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            const uploadRes = await apiClient.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            if (uploadRes?.data?.url) uploadedUrls.push(uploadRes.data.url);
          } catch (uErr) {
            console.warn('Upload error:', uErr);
          }
        }
      }

      const payload: any = {
        bankName: editForm.bankName,
        accountNumber: editForm.accountNumber,
        notes: editNotes,
      } as any;
      if (uploadedUrls.length) payload.proofUrls = uploadedUrls;

      await issueService.updateIssue(editingIssue._id || '', payload);
      toast.success('Issue updated successfully');
      setShowEditModal(false);
      setEditingIssue(null);
      // editing account is not stored in state
      await fetchAccounts();
      await fetchIssues();
    } catch (err: any) {
      toast.error(`Failed to update issue: ${err?.message || err}`);
    }
  };

  return (
    <>
      <div className="bg-white pt-2 pb-6 px-6">
        <div className="mb-6">
          <p className="text-gray-600 mt-2">These are issues detected during your bank account confirmation process.</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-4 rounded-lg">
            <p className="font-medium">Error loading issues</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-6 rounded-lg text-center">
            <h3 className="text-lg font-medium mb-1">No issues found</h3>
            <p className="text-sm">Your bank account details are currently in good standing.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => (
              <div key={issue._id || issue.studentId} className="border border-stroke-clr bg-stroke-clr/20 rounded-lg p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-1">Bank Name</p>
                    <p className="text-primary-clr font-medium">{issue.bankName}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <p className="text-sm font-medium text-gray-700 mb-1">Account Number</p>
                    <p className="text-primary-clr font-medium">{issue.accountNumber}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    className="px-4 py-3"
                    onClick={() => {
                      const matchingAccount = accounts.find((acc) => acc.contractNumber === issue.contractNumber);
                      openEditModal(issue as IIssue, matchingAccount);
                    }}
                  >
                    Update Bank Details
                  </Button>
                  <Button variant="outline" className="px-4 py-3">Contact Support</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Account Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Edit Account Record</h3>
              <button onClick={() => { setShowEditModal(false); setEditingIssue(null); setEditProofFiles(null); }} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                  <input type="text" value={editForm.bankName} onChange={(e) => setEditForm((prev) => ({ ...prev, bankName: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input type="text" value={editForm.accountNumber} onChange={(e) => setEditForm((prev) => ({ ...prev, accountNumber: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes (optional)</label>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Upload proof images (optional)</label>
                  <input type="file" multiple accept="image/*" onChange={(e) => setEditProofFiles(e.target.files)} className="w-full" />
                </div>
              </div>

                <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingIssue(null); setEditProofFiles(null); }}>Cancel</Button>
                <Button type="submit">Update Account</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
