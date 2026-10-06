import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle, ChevronRight, Clock, Download, ListChecks, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election, Position } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { STATUS_BADGE_CLASSES, STATUS_LABELS, formatDateTime, getStatus } from './electionHelpers';

type ElectionListProps = {
  elections: Election[];
  loading: boolean;
  onCreated: (election: Election) => void;
  onOpen: (electionId: string) => void;
};

const emptyCreateForm = {
  title: '',
  description: '',
  academicYear: '',
  timezone: 'Africa/Gaborone',
};

const ElectionList: React.FC<ElectionListProps> = ({ elections, loading, onCreated, onOpen }) => {
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [isCreating, setIsCreating] = useState(false);
  const [standardPositions, setStandardPositions] = useState<Position[]>([]);
  const [isImportingPositions, setIsImportingPositions] = useState(false);

  useEffect(() => {
    electionService
      .getPositionTemplates()
      .then(setStandardPositions)
      .catch((error: unknown) => toast.error(getApiErrorMessage(error, 'Failed to load standard positions')));
  }, []);

  const handleCreateElection = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreating(true);
    try {
      const election = await electionService.createElection(createForm);
      toast.success('Election created');
      setCreateForm(emptyCreateForm);
      onCreated(election);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create election'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportPositions = async () => {
    setIsImportingPositions(true);
    try {
      const { created, templates } = await electionService.importSrcPositionTemplates();
      setStandardPositions(templates);
      toast.success(
        created > 0
          ? `${created} SRC position(s) imported. They will be added to every new election.`
          : 'All SRC positions are already imported',
      );
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to import SRC positions'));
    } finally {
      setIsImportingPositions(false);
    }
  };

  const openCount = elections.filter((election) => election.status === 'OPEN').length;
  const draftCount = elections.filter((election) => election.status === 'DRAFT').length;

  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard icon={CalendarDays} label="Total Elections" value={elections.length} iconClass="text-purple-600" />
        <StatCard icon={CheckCircle} label="Open" value={openCount} iconClass="text-green-600" />
        <StatCard icon={Clock} label="Drafts" value={draftCount} iconClass="text-yellow-600" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <form className="space-y-4 rounded-lg bg-white p-6 shadow" onSubmit={handleCreateElection}>
          <div className="flex items-center gap-3">
            <Plus className="h-6 w-6 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Create Election</h2>
          </div>
          <input
            value={createForm.title}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Election title"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <textarea
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
            className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              value={createForm.academicYear}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, academicYear: event.target.value }))}
              placeholder="Academic year"
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <input
              value={createForm.timezone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, timezone: event.target.value }))}
              placeholder="Timezone"
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={isCreating}
            className="w-full rounded-md bg-button py-2 font-semibold text-white disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Election'}
          </button>
        </form>

        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <ListChecks className="h-6 w-6 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Standard Positions</h2>
                <p className="text-sm text-gray-500">Added to every new election when it is created.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleImportPositions}
              disabled={isImportingPositions}
              title="Import the standard SRC positions for your institution"
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-button px-3 py-1.5 text-sm font-semibold text-button disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            >
              {isImportingPositions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Import
            </button>
          </div>
          {standardPositions.length === 0 ? (
            <p className="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
              No standard positions yet. Click Import to load the SRC positions; new elections will then start with them.
            </p>
          ) : (
            <ol className="mt-4 grid list-decimal gap-x-6 gap-y-1 pl-5 text-sm text-gray-700 sm:grid-cols-2">
              {standardPositions.map((position) => (
                <li key={position._id || position.title}>{position.title}</li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Elections</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {loading ? (
            <p className="p-6 text-center text-gray-500">Loading...</p>
          ) : elections.length === 0 ? (
            <p className="p-6 text-center text-gray-500">No elections yet. Create one above.</p>
          ) : (
            elections.map((election) => {
              const status = getStatus(election);
              return (
                <button
                  key={election._id}
                  type="button"
                  onClick={() => onOpen(election._id)}
                  className="flex w-full flex-wrap items-center justify-between gap-4 p-6 text-left hover:bg-gray-50"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900">{election.title}</h3>
                    <p className="text-sm text-gray-500">{election.academicYear || election.description || 'No description'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {election.startTime ? `Starts ${formatDateTime(election.startTime)}` : 'Not scheduled'}
                      {election.endTime ? ` • Ends ${formatDateTime(election.endTime)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconClass: string;
}) => (
  <div className="rounded-lg bg-white p-6 shadow">
    <div className="flex items-center">
      <Icon className={`h-8 w-8 ${iconClass}`} />
      <div className="ml-4">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  </div>
);

export default ElectionList;
