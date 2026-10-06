import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election, ScheduleReadiness } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import ConfirmDialog from './ConfirmDialog';
import {
  formatDateTime,
  fromDateTimeLocalValue,
  getStatus,
  isEditable,
  toDateTimeLocalValue,
} from './electionHelpers';

type ScheduleTabProps = {
  election: Election;
  onChanged: () => Promise<void>;
};

const readinessWarnings = (readiness: ScheduleReadiness) => {
  const warnings: string[] = [];
  if (readiness.positionCount < readiness.standardPositionCount) {
    warnings.push(
      `The election has ${readiness.positionCount} position(s); the standard SRC list has ${readiness.standardPositionCount}.`,
    );
  }
  if (readiness.positionsWithoutCandidates.length > 0) {
    warnings.push(
      `These positions have no approved candidates and will not appear on the ballot: ${readiness.positionsWithoutCandidates.join(', ')}.`,
    );
  }
  return warnings;
};

const ScheduleTab: React.FC<ScheduleTabProps> = ({ election, onChanged }) => {
  const status = getStatus(election);
  const [form, setForm] = useState({
    startTime: toDateTimeLocalValue(election.startTime),
    endTime: toDateTimeLocalValue(election.endTime),
    timezone: election.timezone || 'Africa/Gaborone',
  });
  const [extendTo, setExtendTo] = useState(toDateTimeLocalValue(election.endTime));
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const schedule = async () => {
    setBusy(true);
    try {
      await electionService.scheduleElection(election._id, {
        startTime: fromDateTimeLocalValue(form.startTime),
        endTime: fromDateTimeLocalValue(form.endTime),
        timezone: form.timezone,
      });
      toast.success('Election scheduled. Students can now see it.');
      setWarnings(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to schedule election'));
    } finally {
      setBusy(false);
    }
  };

  // Check readiness first: block on missing essentials, warn on gaps SAAD may accept
  const handleSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const readiness = await electionService.getScheduleReadiness(election._id);
      if (readiness.blockers.length > 0) {
        setBlockers(readiness.blockers);
        return;
      }
      const found = readinessWarnings(readiness);
      if (found.length > 0) {
        setWarnings(found);
        return;
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to check election readiness'));
      return;
    } finally {
      setBusy(false);
    }
    await schedule();
  };

  const handleCloseNow = async () => {
    setBusy(true);
    try {
      await electionService.closeElection(election._id);
      toast.success('Voting closed. Counting has started.');
      setConfirmClose(false);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to close election'));
    } finally {
      setBusy(false);
    }
  };

  const handleExtend = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await electionService.extendElection(election._id, fromDateTimeLocalValue(extendTo));
      toast.success('Voting extended');
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to extend election'));
    } finally {
      setBusy(false);
    }
  };

  const windowSummary = (
    <dl className="grid gap-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-gray-500">Voting opens</dt>
        <dd className="font-semibold text-gray-900">{formatDateTime(election.startTime) || 'Not set'}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Voting closes</dt>
        <dd className="font-semibold text-gray-900">{formatDateTime(election.endTime) || 'Not set'}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Timezone</dt>
        <dd className="font-semibold text-gray-900">{election.timezone || 'UTC'}</dd>
      </div>
    </dl>
  );

  return (
    <div className="space-y-6">
      {isEditable(election) && (
        <form className="space-y-4 rounded-lg bg-white p-6 shadow" onSubmit={handleSchedule}>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {status === 'SCHEDULED' ? 'Reschedule Election' : 'Schedule Election'}
            </h2>
            <p className="text-sm text-gray-500">
              Scheduling makes the election visible to students. Voting opens and closes automatically at these times.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Voting opens</span>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Voting closes</span>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Timezone</span>
              <input
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-button px-6 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === 'SCHEDULED' ? 'Save schedule' : 'Schedule election'}
          </button>
        </form>
      )}

      {status === 'OPEN' && (
        <div className="space-y-6 rounded-lg bg-white p-6 shadow">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Voting is open</h2>
            <p className="text-sm text-gray-500">Positions and candidates are locked while voting is open.</p>
          </div>
          {windowSummary}
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleExtend}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Extend voting until</span>
              <input
                type="datetime-local"
                value={extendTo}
                onChange={(event) => setExtendTo(event.target.value)}
                required
                className="rounded-md border border-gray-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-button px-4 py-2 font-semibold text-button disabled:opacity-60"
            >
              Extend
            </button>
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              disabled={busy}
              className="ml-auto rounded-md bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Close voting now
            </button>
          </form>
        </div>
      )}

      {!isEditable(election) && status !== 'OPEN' && (
        <div className="space-y-4 rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Voting window</h2>
          {windowSummary}
          <p className="text-sm text-gray-500">Voting has ended. See the Results tab.</p>
        </div>
      )}

      {blockers && (
        <ConfirmDialog title="Election is not ready" confirmLabel="OK" onCancel={() => setBlockers(null)}>
          <ul className="list-disc space-y-1 pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
          <p>Fix these on the Positions and Candidates tabs, then schedule again.</p>
        </ConfirmDialog>
      )}

      {warnings && (
        <ConfirmDialog
          title="Schedule with these gaps?"
          confirmLabel="Schedule anyway"
          cancelLabel="Go back and fix"
          busy={busy}
          onConfirm={schedule}
          onCancel={() => setWarnings(null)}
        >
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}

      {confirmClose && (
        <ConfirmDialog
          title="Close voting now?"
          confirmLabel="Close voting"
          tone="danger"
          busy={busy}
          onConfirm={handleCloseNow}
          onCancel={() => setConfirmClose(false)}
        >
          <p>Students will no longer be able to vote and counting will start immediately. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default ScheduleTab;
