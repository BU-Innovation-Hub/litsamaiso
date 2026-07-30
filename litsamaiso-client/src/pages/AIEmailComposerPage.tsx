import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  Loader,
  Mail,
  RefreshCcw,
  Send,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { userService } from '../services/userService';
import {
  aiEmailComposerService,
  type EmailComposerJob,
  type FinancialStatus,
} from '../services/aiEmailComposerService';
import type { Role } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

const financialStatuses: Array<{ value: FinancialStatus; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'paid', label: 'Paid' },
];

const normalizeRoleName = (roleName: string) => {
  const normalized = roleName.trim().toLowerCase();
  if (normalized === 'student' || normalized === 'students') return 'Student';
  if (normalized === 'appadmin' || normalized === 'appadmins') return 'AppAdmin';
  if (normalized === 'institutionadmin') return 'InstitutionAdmin';
  if (normalized === 'finance') return 'Finance';
  if (normalized === 'saad') return 'SAAD';
  return roleName;
};

const getDisplayRoleLabel = (roleName: string) => {
  const normalized = normalizeRoleName(roleName);
  if (normalized === 'Student') return 'Students';
  if (normalized === 'AppAdmin') return 'AppAdmins';
  return normalized;
};

const isStudentRole = (roleName: string) =>
  normalizeRoleName(roleName).toLowerCase() === 'student';

const StepBadge = ({ number }: { number: number }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-active-clr text-sm font-bold text-white">
    {number}
  </span>
);

const StatusIcon = ({ status }: { status: EmailComposerJob['status'] }) => {
  if (status === 'completed') {
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  }
  if (status === 'failed') {
    return <XCircle className="h-5 w-5 text-red-600" />;
  }
  return <Loader className="h-5 w-5 animate-spin text-active-clr" />;
};

const AIEmailComposerPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState('Student');
  const [financialStatus, setFinancialStatus] = useState<FinancialStatus>('pending');
  const [batchNumber, setBatchNumber] = useState('');
  const [recipientCount, setRecipientCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('Professional and encouraging');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [job, setJob] = useState<EmailComposerJob | null>(null);

  const selection = useMemo(() => {
    const parsedBatch = Number(batchNumber);
    return {
      role: selectedRole,
      ...(isStudentRole(selectedRole) ? { financialStatus } : {}),
      ...(isStudentRole(selectedRole) && Number.isInteger(parsedBatch) && parsedBatch > 0
        ? { batchNumber: parsedBatch }
        : {}),
    };
  }, [batchNumber, financialStatus, selectedRole]);

  const loadRecipientCount = useCallback(async () => {
    setCountLoading(true);
    try {
      setRecipientCount(await aiEmailComposerService.countRecipients(selection));
    } catch (error: unknown) {
      setRecipientCount(0);
      toast.error(getApiErrorMessage(error, 'Failed to count recipients'));
    } finally {
      setCountLoading(false);
    }
  }, [selection]);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const loadedRoles = await userService.getRoles();
        setRoles(loadedRoles);
        const studentRole = loadedRoles.find((role) => isStudentRole(role.name));
        if (studentRole) {
          setSelectedRole(normalizeRoleName(studentRole.name));
        }
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to load roles'));
      }
    };

    void loadRoles();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRecipientCount();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadRecipientCount]);

  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;

    const interval = window.setInterval(async () => {
      try {
        const updatedJob = await aiEmailComposerService.getJob(job.id);
        setJob(updatedJob);
        if (updatedJob.status === 'completed') {
          toast.success('Email dispatch completed');
        }
        if (updatedJob.status === 'failed') {
          toast.error(updatedJob.lastError || 'Email dispatch failed');
        }
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to refresh email job'));
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [job]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !tone.trim()) {
      toast.error('Prompt and desired tone are required');
      return;
    }

    setGenerating(true);
    try {
      const draft = await aiEmailComposerService.generateEmail({
        prompt,
        tone,
      });
      setSubject(draft.subject);
      setBody(draft.body);
      toast.success('Email draft generated');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to generate email'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    if (recipientCount <= 0) {
      toast.error('No matching recipients found');
      return;
    }

    setSending(true);
    try {
      const freshCount = await aiEmailComposerService.countRecipients(selection);
      setRecipientCount(freshCount);
      if (freshCount <= 0) {
        toast.error('No matching recipients found');
        return;
      }

      const response = await aiEmailComposerService.sendEmail({
        recipients: selection,
        subject,
        body,
      });
      setJob(response.job);
      toast.success(response.message || 'Email send job accepted');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to send email'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Email Composer</h1>
            <p className="mt-1 text-sm text-gray-600">
              Compose branded administrative emails with Gemini and send them through Litsamaiso.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <Users className="h-5 w-5 text-active-clr" />
            <span className="text-sm font-semibold text-slate-700">
              {countLoading ? 'Counting recipients...' : `${recipientCount} recipients will receive this email.`}
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            <section className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-center gap-3">
                <StepBadge number={1} />
                <h2 className="text-lg font-semibold text-gray-900">Recipients</h2>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Recipient role
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(event) => {
                      setSelectedRole(normalizeRoleName(event.target.value));
                      setJob(null);
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Student">Students</option>
                    {roles
                      .filter((role) => !isStudentRole(role.name))
                      .map((role) => {
                        const normalized = normalizeRoleName(role.name);
                        return (
                          <option key={role._id} value={normalized}>
                            {getDisplayRoleLabel(normalized)}
                          </option>
                        );
                      })}
                  </select>
                </div>

                {isStudentRole(selectedRole) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Financial clearance status
                      </label>
                      <select
                        value={financialStatus}
                        onChange={(event) => {
                          setFinancialStatus(event.target.value as FinancialStatus);
                          setJob(null);
                        }}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {financialStatuses.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Batch
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={batchNumber}
                        onChange={(event) => {
                          setBatchNumber(event.target.value);
                          setJob(null);
                        }}
                        placeholder="All batches"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <div className="flex items-center gap-3">
                <StepBadge number={2} />
                <h2 className="text-lg font-semibold text-gray-900">Prompt</h2>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Prompt
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={6}
                    placeholder="Inform students that Batch 2 reimbursements have been processed."
                    className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Desired tone
                  </label>
                  <input
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    placeholder="Professional and encouraging"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary-clr px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-active disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {generating ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate Email
                </button>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-lg bg-white p-6 shadow">
              <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <StepBadge number={3} />
                  <h2 className="text-lg font-semibold text-gray-900">Draft</h2>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim() || !tone.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Regenerate
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Generated subject"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Body
                  </label>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={16}
                    placeholder="Generated email body"
                    className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 leading-7 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-white p-6 shadow">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 text-active-clr" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Send Email</h2>
                    <p className="text-sm text-gray-600">
                      {countLoading ? 'Refreshing recipient count...' : `${recipientCount} matching recipients`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !subject.trim() || !body.trim() || recipientCount <= 0}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-active-clr px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-clr disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sending ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Email
                </button>
              </div>

              {job && (
                <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={job.status} />
                    <div>
                      <p className="text-sm font-semibold capitalize text-gray-900">
                        {job.status}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total {job.totalRecipients} - Sent {job.successfulSends} - Failed {job.failedSends}
                      </p>
                    </div>
                  </div>
                  {job.lastError && (
                    <p className="mt-3 text-sm text-red-700">{job.lastError}</p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEmailComposerPage;
