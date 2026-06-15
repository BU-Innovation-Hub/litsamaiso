import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle, Clock, Download, Edit, Loader2, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../services/electionService';
import type { Candidate, Election, Position, ResultSnapshot } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

const toDateTimeLocalValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
};

const getPositionId = (position: Position) => position._id || '';
const getPositionTitle = (position: Position) => position.title || position.name || 'Position';
const getCandidateId = (candidate: Candidate) => candidate._id || '';
const getCandidateName = (candidate: Candidate) => candidate.fullName || candidate.name || 'Candidate';
const makeFileSafeName = (value: string) => value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

const sanitizePdfText = (value: string) => (
  value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
);

const pdfColor = (hex: string) => {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
};

const truncatePdfText = (value: string, maxLength: number) => (
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
);

const createStyledResultsPdfBlob = (params: {
  election: Election;
  snapshot: ResultSnapshot;
  positions: Array<Position & { candidates?: Candidate[] }>;
}) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const cardWidth = pageWidth - margin * 2;
  const pageCommands: string[][] = [[]];
  let currentPage = pageCommands[0];
  let cursorY = margin;

  const addCommand = (command: string) => currentPage.push(command);
  const setPage = () => {
    currentPage = [];
    pageCommands.push(currentPage);
    cursorY = margin;
  };
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke?: string,
  ) => {
    const pdfY = pageHeight - y - height;
    addCommand(`q ${pdfColor(fill)} rg ${x} ${pdfY} ${width} ${height} re f Q`);
    if (stroke) {
      addCommand(`q ${pdfColor(stroke)} RG ${x} ${pdfY} ${width} ${height} re S Q`);
    }
  };
  const text = (
    value: string,
    x: number,
    y: number,
    options?: { size?: number; bold?: boolean; color?: string },
  ) => {
    const size = options?.size || 10;
    const font = options?.bold ? 'F2' : 'F1';
    addCommand(`BT /${font} ${size} Tf ${pdfColor(options?.color || '#111827')} rg ${x} ${pageHeight - y} Td (${sanitizePdfText(value)}) Tj ET`);
  };

  text('Election Results', margin, cursorY, { size: 24, bold: true, color: '#020618' });
  cursorY += 24;
  text(params.election.title, margin, cursorY, { size: 14, color: '#5b6478' });
  cursorY += 18;
  text(`Counted ${new Date(params.snapshot.generatedAt).toLocaleString()}`, margin, cursorY, {
    size: 10,
    color: '#919dc2',
  });
  cursorY += 32;

  params.snapshot.positions.forEach((positionResult) => {
    const position = params.positions.find(
      (item) => getPositionId(item) === String(positionResult.positionId),
    );
    const rankings = positionResult.rankings;
    const winnerId = positionResult.winnerId ? String(positionResult.winnerId) : '';
    const cardHeight = 72 + Math.max(rankings.length, 1) * 30;

    if (cursorY + cardHeight > pageHeight - margin) {
      setPage();
    }

    const cardX = margin;
    const cardY = cursorY;
    rect(cardX, cardY, cardWidth, cardHeight, '#ffffff', '#dfe3ea');
    text(position ? getPositionTitle(position) : 'Position', cardX + 16, cardY + 28, {
      size: 14,
      bold: true,
      color: '#020618',
    });
    if (winnerId) {
      rect(cardX + cardWidth - 76, cardY + 14, 52, 20, '#d7fbe5');
      text('Winner', cardX + cardWidth - 64, cardY + 28, { size: 9, bold: true, color: '#008236' });
    }

    const tableX = cardX + 16;
    const tableY = cardY + 48;
    const tableWidth = cardWidth - 32;
    rect(tableX, tableY, tableWidth, 28, '#f8fafc');
    text('Rank', tableX + 10, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Candidate', tableX + 92, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Votes', tableX + 348, tableY + 18, { size: 10, bold: true, color: '#364153' });
    text('Percentage', tableX + 430, tableY + 18, { size: 10, bold: true, color: '#364153' });

    if (rankings.length === 0) {
      rect(tableX, tableY + 28, tableWidth, 30, '#ffffff');
      text('No votes recorded for this position.', tableX + 10, tableY + 48, {
        size: 10,
        color: '#6b7280',
      });
    } else {
      rankings.forEach((ranking, index) => {
        const rowY = tableY + 28 + index * 30;
        const isWinner = winnerId === String(ranking.candidateId);
        const candidate = position?.candidates?.find(
          (item) => getCandidateId(item) === String(ranking.candidateId),
        );
        const candidateName = truncatePdfText(candidate ? getCandidateName(candidate) : 'Candidate', 34);

        rect(tableX, rowY, tableWidth, 30, isWinner ? '#ecfdf3' : '#ffffff');
        text(String(ranking.rank), tableX + 10, rowY + 20, { size: 11, color: '#0f172b' });
        text(candidateName, tableX + 92, rowY + 20, { size: 11, color: '#0f172b' });
        if (isWinner) {
          text('Winner', tableX + 250, rowY + 20, { size: 9, bold: true, color: '#008236' });
        }
        text(String(ranking.votes), tableX + 348, rowY + 20, { size: 11, color: '#0f172b' });
        text(`${ranking.percentage}%`, tableX + 430, rowY + 20, { size: 11, color: '#0f172b' });
      });
    }

    cursorY += cardHeight + 16;
  });

  text('Litsamaiso Election Management System', margin, pageHeight - 24, {
    size: 9,
    color: '#6b7280',
  });

  const fontRegularObjectId = 3 + pageCommands.length * 2;
  const fontBoldObjectId = fontRegularObjectId + 1;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageCommands.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageCommands.length} >>`,
  ];

  pageCommands.forEach((commands, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = commands.join('\n');

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

const ElectionsManagementPage: React.FC = () => {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingCandidate, setIsAddingCandidate] = useState(false);
  const [isUpdatingElection, setIsUpdatingElection] = useState(false);
  const [isUpdatingCandidate, setIsUpdatingCandidate] = useState(false);
  const candidateImageInputRef = useRef<HTMLInputElement | null>(null);
  const editCandidateImageInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [positions, setPositions] = useState<Array<Position & { candidates?: Candidate[] }>>([]);
  const [editingElection, setEditingElection] = useState<Election | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [resultsElection, setResultsElection] = useState<Election | null>(null);
  const [resultsSnapshot, setResultsSnapshot] = useState<ResultSnapshot | null>(null);
  const [resultsPositions, setResultsPositions] = useState<Array<Position & { candidates?: Candidate[] }>>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    academicYear: '',
    timezone: 'Africa/Gaborone',
  });
  const [scheduleForm, setScheduleForm] = useState({
    startTime: '',
    endTime: '',
    timezone: 'Africa/Gaborone',
  });
  const [positionForm, setPositionForm] = useState({
    title: '',
    description: '',
    maxVotesAllowed: 1,
    displayOrder: 1,
  });
  const [candidateForm, setCandidateForm] = useState({
    fullName: '',
    party: '',
    manifesto: '',
    studentId: '',
    image: null as File | null,
  });
  const [editElectionForm, setEditElectionForm] = useState({
    title: '',
    description: '',
    academicYear: '',
    startTime: '',
    endTime: '',
    timezone: 'Africa/Gaborone',
  });
  const [editCandidateForm, setEditCandidateForm] = useState({
    fullName: '',
    party: '',
    manifesto: '',
    studentId: '',
    image: null as File | null,
  });

  const loadElections = async () => {
    setLoading(true);
    try {
      const data = await electionService.getElections();
      setElections(data);
      setSelectedElectionId((current) => current || data[0]?._id || '');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load elections'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadElections();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const loadPositions = async (electionId: string) => {
    if (!electionId) {
      setPositions([]);
      setSelectedPositionId('');
      return;
    }

    try {
      const positionData = await electionService.getPositions(electionId);
      const withCandidates = await Promise.all(
        positionData.map(async (position) => ({
          ...position,
          candidates: position._id ? await electionService.getCandidates(position._id) : [],
        })),
      );
      setPositions(withCandidates);
      setSelectedPositionId((current) => current || withCandidates[0]?._id || '');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load positions'));
      setPositions([]);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPositions(selectedElectionId);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [selectedElectionId]);

  const handleCreateElection = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreating(true);
    try {
      await electionService.createElection(createForm);
      toast.success('Election created');
      setCreateForm({
        title: '',
        description: '',
        academicYear: '',
        timezone: 'Africa/Gaborone',
      });
      await loadElections();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create election'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedElectionId) {
      toast.error('Select an election first');
      return;
    }

    try {
      await electionService.scheduleElection(selectedElectionId, scheduleForm);
      toast.success('Election scheduled');
      await loadElections();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to schedule election'));
    }
  };

  const handleCreatePosition = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedElectionId) {
      toast.error('Select an election first');
      return;
    }

    try {
      await electionService.addPosition(selectedElectionId, positionForm);
      toast.success('Position created');
      setPositionForm({
        title: '',
        description: '',
        maxVotesAllowed: 1,
        displayOrder: positions.length + 2,
      });
      await loadPositions(selectedElectionId);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create position'));
    }
  };

  const handleCreateCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedElectionId || !selectedPositionId) {
      toast.error('Select an election and position first');
      return;
    }

    const formData = new FormData();
    formData.append('fullName', candidateForm.fullName);
    if (candidateForm.party) formData.append('party', candidateForm.party);
    if (candidateForm.manifesto) formData.append('manifesto', candidateForm.manifesto);
    if (candidateForm.studentId) formData.append('studentId', candidateForm.studentId);
    if (candidateForm.image) formData.append('image', candidateForm.image);

    setIsAddingCandidate(true);
    try {
      await electionService.addCandidate(selectedElectionId, selectedPositionId, formData);
      toast.success('Candidate created');
      setCandidateForm({
        fullName: '',
        party: '',
        manifesto: '',
        studentId: '',
        image: null,
      });
      if (candidateImageInputRef.current) {
        candidateImageInputRef.current.value = '';
      }
      await loadPositions(selectedElectionId);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create candidate'));
    } finally {
      setIsAddingCandidate(false);
    }
  };

  const openEditElection = (election: Election) => {
    setEditingElection(election);
    setEditElectionForm({
      title: election.title || '',
      description: election.description || '',
      academicYear: election.academicYear || '',
      startTime: toDateTimeLocalValue(election.startTime),
      endTime: toDateTimeLocalValue(election.endTime),
      timezone: election.timezone || 'Africa/Gaborone',
    });
  };

  const handleUpdateElection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingElection) return;

    setIsUpdatingElection(true);
    try {
      await electionService.updateElection(editingElection._id, editElectionForm);
      toast.success('Election updated');
      setEditingElection(null);
      await loadElections();
      if (selectedElectionId === editingElection._id) {
        await loadPositions(editingElection._id);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update election'));
    } finally {
      setIsUpdatingElection(false);
    }
  };

  const openEditCandidate = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setEditCandidateForm({
      fullName: candidate.fullName || candidate.name || '',
      party: candidate.party || '',
      manifesto: candidate.manifesto || candidate.description || '',
      studentId: candidate.studentId || '',
      image: null,
    });
    if (editCandidateImageInputRef.current) {
      editCandidateImageInputRef.current.value = '';
    }
  };

  const handleUpdateCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCandidate?._id) return;

    const formData = new FormData();
    formData.append('fullName', editCandidateForm.fullName);
    if (editCandidateForm.party) formData.append('party', editCandidateForm.party);
    if (editCandidateForm.manifesto) formData.append('manifesto', editCandidateForm.manifesto);
    if (editCandidateForm.studentId) formData.append('studentId', editCandidateForm.studentId);
    if (editCandidateForm.image) formData.append('image', editCandidateForm.image);

    setIsUpdatingCandidate(true);
    try {
      await electionService.updateCandidate(editingCandidate._id, formData);
      toast.success('Candidate updated');
      setEditingCandidate(null);
      if (selectedElectionId) {
        await loadPositions(selectedElectionId);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update candidate'));
    } finally {
      setIsUpdatingCandidate(false);
    }
  };

  const handleViewResults = async (election: Election) => {
    setResultsElection(election);
    setResultsSnapshot(null);
    setResultsPositions([]);
    setIsLoadingResults(true);

    try {
      const positionData = await electionService.getPositions(election._id);
      const withCandidates = await Promise.all(
        positionData.map(async (position) => ({
          ...position,
          candidates: position._id ? await electionService.getCandidates(position._id) : [],
        })),
      );
      setResultsPositions(withCandidates);

      try {
        setResultsSnapshot(await electionService.getResults(election._id));
      } catch {
        const snapshot = await electionService.recomputeResults(election._id);
        setResultsSnapshot(snapshot);
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load results'));
      setResultsElection(null);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleExportResultsPdf = () => {
    if (!resultsElection || !resultsSnapshot) {
      toast.error('Load results before exporting');
      return;
    }

    const reportTitle = `${resultsElection.title} Results`;
    const blob = createStyledResultsPdfBlob({
      election: resultsElection,
      snapshot: resultsSnapshot,
      positions: resultsPositions,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${makeFileSafeName(reportTitle) || 'election-results'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCandidateAction = async (
    action: 'approve' | 'disqualify',
    candidateId: string,
  ) => {
    try {
      if (action === 'approve') {
        await electionService.approveCandidate(candidateId);
        toast.success('Candidate approved');
      } else {
        await electionService.disqualifyCandidate(candidateId);
        toast.success('Candidate disqualified');
      }
      if (selectedElectionId) await loadPositions(selectedElectionId);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Candidate action failed'));
    }
  };

  const handleAction = async (
    action: 'publish' | 'archive' | 'publish-results',
    electionId: string
  ) => {
    try {
      if (action === 'publish') {
        await electionService.publishElection(electionId, {});
        toast.success('Election published');
      } else if (action === 'archive') {
        await electionService.archiveElection(electionId);
        toast.success('Election archived');
      } else {
        await electionService.publishResults(electionId);
        toast.success('Results published');
      }
      await loadElections();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Action failed'));
    }
  };

  const openCount = elections.filter((election) => election.status === 'OPEN').length;
  const draftCount = elections.filter((election) => election.status === 'DRAFT').length;

  return (
    <div className="min-h-screen bg-gray-50 pt-24 mt-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Elections Management</h1>
            <p className="text-gray-600">Create, schedule, and monitor institution elections.</p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard icon={CalendarDays} label="Total Elections" value={elections.length} iconClass="text-purple-600" />
          <StatCard icon={CheckCircle} label="Open" value={openCount} iconClass="text-green-600" />
          <StatCard icon={Clock} label="Drafts" value={draftCount} iconClass="text-yellow-600" />
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <form className="rounded-lg bg-white p-6 shadow space-y-4" onSubmit={handleCreateElection}>
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

          <form className="rounded-lg bg-white p-6 shadow space-y-4" onSubmit={handleSchedule}>
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-yellow-600" />
              <h2 className="text-lg font-semibold text-gray-900">Schedule Election</h2>
            </div>
            <select
              value={selectedElectionId}
              onChange={(event) => setSelectedElectionId(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select election</option>
              {elections.map((election) => (
                <option key={election._id} value={election._id}>
                  {election.title}
                </option>
              ))}
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-gray-700">Start date and time</span>
                <input
                  type="datetime-local"
                  value={scheduleForm.startTime}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, startTime: event.target.value }))}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <span className="block text-xs text-gray-500">This is when voting opens.</span>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-gray-700">End date and time</span>
                <input
                  type="datetime-local"
                  value={scheduleForm.endTime}
                  onChange={(event) => setScheduleForm((prev) => ({ ...prev, endTime: event.target.value }))}
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <span className="block text-xs text-gray-500">This is when voting closes.</span>
              </label>
            </div>
            <input
              value={scheduleForm.timezone}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, timezone: event.target.value }))}
              placeholder="Timezone"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <button type="submit" className="w-full rounded-md bg-button py-2 font-semibold text-white">
              Schedule Election
            </button>
          </form>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <form className="rounded-lg bg-white p-6 shadow space-y-4" onSubmit={handleCreatePosition}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add Position</h2>
              <p className="text-sm text-gray-500">Positions are the offices students vote for.</p>
            </div>
            <select
              value={selectedElectionId}
              onChange={(event) => setSelectedElectionId(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select election</option>
              {elections.map((election) => (
                <option key={election._id} value={election._id}>{election.title}</option>
              ))}
            </select>
            <input
              value={positionForm.title}
              onChange={(event) => setPositionForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Position title"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <textarea
              value={positionForm.description}
              onChange={(event) => setPositionForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Description"
              className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-gray-700">Votes allowed</span>
                <input
                  type="number"
                  min={1}
                  value={positionForm.maxVotesAllowed}
                  onChange={(event) => setPositionForm((prev) => ({ ...prev, maxVotesAllowed: Number(event.target.value) }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <span className="block text-xs text-gray-500">How many candidates a student can choose for this position.</span>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-gray-700">Display order</span>
                <input
                  type="number"
                  min={1}
                  value={positionForm.displayOrder}
                  onChange={(event) => setPositionForm((prev) => ({ ...prev, displayOrder: Number(event.target.value) }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <span className="block text-xs text-gray-500">Where this position appears in the voting list.</span>
              </label>
            </div>
            <button type="submit" className="w-full rounded-md bg-button py-2 font-semibold text-white">
              Add Position
            </button>
          </form>

          <form className="rounded-lg bg-white p-6 shadow space-y-4" onSubmit={handleCreateCandidate}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
              <p className="text-sm text-gray-500">Candidates can be approved after creation.</p>
            </div>
            <select
              value={selectedPositionId}
              onChange={(event) => setSelectedPositionId(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select position</option>
              {positions.map((position) => (
                <option key={position._id} value={position._id}>
                  {position.title || position.name}
                </option>
              ))}
            </select>
            <input
              value={candidateForm.fullName}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Full name"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={candidateForm.party}
                onChange={(event) => setCandidateForm((prev) => ({ ...prev, party: event.target.value }))}
                placeholder="Party"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
              <input
                value={candidateForm.studentId}
                onChange={(event) => setCandidateForm((prev) => ({ ...prev, studentId: event.target.value }))}
                placeholder="Student ID"
                className="w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
            <textarea
              value={candidateForm.manifesto}
              onChange={(event) => setCandidateForm((prev) => ({ ...prev, manifesto: event.target.value }))}
              placeholder="Manifesto"
              className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <label className="block rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-5 text-center transition hover:border-indigo-500 hover:bg-indigo-100">
              <input
                ref={candidateImageInputRef}
                type="file"
                accept="image/*"
                onClick={(event) => {
                  event.currentTarget.value = '';
                }}
                onChange={(event) => setCandidateForm((prev) => ({ ...prev, image: event.target.files?.[0] || null }))}
                className="sr-only"
              />
              <Upload className="mx-auto mb-2 h-8 w-8 text-indigo-600" />
              <span className="block text-sm font-semibold text-gray-900">Upload candidate photo</span>
              <span className="mt-1 block text-xs text-gray-600">
                Add the candidate image that will be shown on the ballot.
              </span>
              {candidateForm.image && (
                <span className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                  Selected: {candidateForm.image.name}
                </span>
              )}
            </label>
            <button
              type="submit"
              disabled={isAddingCandidate}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-button py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAddingCandidate && <Loader2 className="h-5 w-5 animate-spin" />}
              {isAddingCandidate ? 'Adding candidate...' : 'Add Candidate'}
            </button>
          </form>
        </div>

        {positions.length > 0 && (
          <div className="mb-8 rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Positions & Candidates</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {positions.map((position) => (
                <div key={position._id || position.title} className="p-6">
                  <h3 className="font-semibold text-gray-900">{position.title || position.name}</h3>
                  {position.description && <p className="text-sm text-gray-500">{position.description}</p>}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(position.candidates || []).length === 0 ? (
                      <p className="text-sm text-gray-500">No candidates yet.</p>
                    ) : (
                      (position.candidates || []).map((candidate) => (
                        <div key={candidate._id || candidate.fullName} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{candidate.fullName || candidate.name}</p>
                              <p className="text-sm text-gray-500">{candidate.party || candidate.manifesto || 'Independent'}</p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              candidate.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {candidate.approved ? 'Approved' : 'Pending'}
                            </span>
                          </div>
                          {candidate._id && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openEditCandidate(candidate)}
                                className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                              >
                                <Edit size={14} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCandidateAction('approve', candidate._id as string)}
                                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCandidateAction('disqualify', candidate._id as string)}
                                className="rounded-md border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                              >
                                Disqualify
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Election Records</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {loading ? (
              <p className="p-6 text-center text-gray-500">Loading...</p>
            ) : elections.length === 0 ? (
              <p className="p-6 text-center text-gray-500">No elections found</p>
            ) : (
              elections.map((election) => (
                <div key={election._id} className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div>
                    <h3 className="font-semibold text-gray-900">{election.title}</h3>
                    <p className="text-sm text-gray-500">{election.description || election.academicYear || 'No description'}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {election.startTime ? `Starts ${new Date(election.startTime).toLocaleString()}` : 'Not scheduled'}
                      {election.endTime ? ` • Ends ${new Date(election.endTime).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                      {election.status || 'DRAFT'}
                    </span>
                    {(election.status || 'DRAFT') !== 'ARCHIVED' && (
                      <button
                        onClick={() => openEditElection(election)}
                        className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-sm font-medium hover:bg-gray-50"
                        type="button"
                      >
                        <Edit size={14} />
                        Edit
                      </button>
                    )}
                    {['DRAFT', 'SCHEDULED'].includes(election.status || 'DRAFT') && (
                      <button
                        onClick={() => handleAction('publish', election._id)}
                        className="rounded-md border px-3 py-1 text-sm font-medium hover:bg-gray-50"
                        type="button"
                      >
                        Publish
                      </button>
                    )}
                    {['CLOSED', 'COUNTING'].includes(election.status || 'DRAFT') && (
                      <button
                        onClick={() => handleAction('publish-results', election._id)}
                        className="rounded-md border px-3 py-1 text-sm font-medium hover:bg-gray-50"
                        type="button"
                      >
                        Publish Results
                      </button>
                    )}
                    {['CLOSED', 'COUNTING', 'RESULTS_PUBLISHED', 'ARCHIVED'].includes(election.status || 'DRAFT') && (
                      <button
                        onClick={() => handleViewResults(election)}
                        className="rounded-md border px-3 py-1 text-sm font-medium hover:bg-gray-50"
                        type="button"
                      >
                        View Results
                      </button>
                    )}
                    {['CLOSED', 'RESULTS_PUBLISHED'].includes(election.status || 'DRAFT') && (
                      <button
                        onClick={() => handleAction('archive', election._id)}
                        className="rounded-md border px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                        type="button"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {resultsElection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Election Results</h2>
                  <p className="text-sm text-gray-500">{resultsElection.title}</p>
                  {resultsSnapshot?.generatedAt && (
                    <p className="mt-1 text-xs text-gray-400">
                      Counted {new Date(resultsSnapshot.generatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExportResultsPdf}
                    disabled={isLoadingResults || !resultsSnapshot}
                    className="inline-flex items-center gap-2 rounded-md bg-button px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    Export PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResultsElection(null);
                      setResultsSnapshot(null);
                      setResultsPositions([]);
                    }}
                    className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              {isLoadingResults ? (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading results...
                </div>
              ) : !resultsSnapshot ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">No results are available yet.</p>
              ) : (
                <div className="space-y-4">
                  {resultsSnapshot.positions.length === 0 ? (
                    <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">No position results found.</p>
                  ) : (
                    resultsSnapshot.positions.map((positionResult) => {
                      const position = resultsPositions.find(
                        (item) => getPositionId(item) === String(positionResult.positionId),
                      );
                      const winnerId = positionResult.winnerId ? String(positionResult.winnerId) : '';

                      return (
                        <div key={String(positionResult.positionId)} className="rounded-lg border border-gray-200 p-4">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-gray-900">
                              {position ? getPositionTitle(position) : 'Position'}
                            </h3>
                            {winnerId && (
                              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                                Winner
                              </span>
                            )}
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Rank</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Candidate</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Votes</th>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Percentage</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {positionResult.rankings.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                                      No votes recorded for this position.
                                    </td>
                                  </tr>
                                ) : (
                                  positionResult.rankings.map((ranking) => {
                                    const candidate = position?.candidates?.find(
                                      (item) => getCandidateId(item) === String(ranking.candidateId),
                                    );
                                    const isWinner = winnerId === String(ranking.candidateId);

                                    return (
                                      <tr key={String(ranking.candidateId)} className={isWinner ? 'bg-green-50' : undefined}>
                                        <td className="px-3 py-2 font-medium text-gray-700">{ranking.rank}</td>
                                        <td className="px-3 py-2 text-gray-900">
                                          {candidate ? getCandidateName(candidate) : 'Candidate'}
                                          {isWinner && <span className="ml-2 text-xs font-semibold text-green-700">Winner</span>}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700">{ranking.votes}</td>
                                        <td className="px-3 py-2 text-gray-700">{ranking.percentage}%</td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {editingElection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <form
              onSubmit={handleUpdateElection}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            >
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-gray-900">Edit Election</h2>
                <p className="text-sm text-gray-500">
                  Update the election details or extend the end time. If the time window is active, the election will reopen.
                </p>
              </div>
              <div className="space-y-4">
                <input
                  value={editElectionForm.title}
                  onChange={(event) => setEditElectionForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Election title"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <textarea
                  value={editElectionForm.description}
                  onChange={(event) => setEditElectionForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Description"
                  className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    value={editElectionForm.academicYear}
                    onChange={(event) => setEditElectionForm((prev) => ({ ...prev, academicYear: event.target.value }))}
                    placeholder="Academic year"
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                  <input
                    value={editElectionForm.timezone}
                    onChange={(event) => setEditElectionForm((prev) => ({ ...prev, timezone: event.target.value }))}
                    placeholder="Timezone"
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-gray-700">Start date and time</span>
                    <input
                      type="datetime-local"
                      value={editElectionForm.startTime}
                      onChange={(event) => setEditElectionForm((prev) => ({ ...prev, startTime: event.target.value }))}
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-gray-700">End date and time</span>
                    <input
                      type="datetime-local"
                      value={editElectionForm.endTime}
                      onChange={(event) => setEditElectionForm((prev) => ({ ...prev, endTime: event.target.value }))}
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingElection(null)}
                  className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingElection}
                  className="inline-flex items-center gap-2 rounded-md bg-button px-4 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {isUpdatingElection && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isUpdatingElection ? 'Saving...' : 'Save election'}
                </button>
              </div>
            </form>
          </div>
        )}

        {editingCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <form
              onSubmit={handleUpdateCandidate}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            >
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-gray-900">Edit Candidate</h2>
                <p className="text-sm text-gray-500">Update the candidate details shown on the ballot.</p>
              </div>
              <div className="space-y-4">
                <input
                  value={editCandidateForm.fullName}
                  onChange={(event) => setEditCandidateForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  placeholder="Full name"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    value={editCandidateForm.party}
                    onChange={(event) => setEditCandidateForm((prev) => ({ ...prev, party: event.target.value }))}
                    placeholder="Party"
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                  <input
                    value={editCandidateForm.studentId}
                    onChange={(event) => setEditCandidateForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    placeholder="Student ID"
                    className="w-full rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>
                <textarea
                  value={editCandidateForm.manifesto}
                  onChange={(event) => setEditCandidateForm((prev) => ({ ...prev, manifesto: event.target.value }))}
                  placeholder="Manifesto"
                  className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2"
                />
                <label className="block rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-5 text-center transition hover:border-indigo-500 hover:bg-indigo-100">
                  <input
                    ref={editCandidateImageInputRef}
                    type="file"
                    accept="image/*"
                    onClick={(event) => {
                      event.currentTarget.value = '';
                    }}
                    onChange={(event) => setEditCandidateForm((prev) => ({ ...prev, image: event.target.files?.[0] || null }))}
                    className="sr-only"
                  />
                  <Upload className="mx-auto mb-2 h-8 w-8 text-indigo-600" />
                  <span className="block text-sm font-semibold text-gray-900">Upload replacement candidate photo</span>
                  <span className="mt-1 block text-xs text-gray-600">Leave empty to keep the current photo.</span>
                  {editCandidateForm.image && (
                    <span className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                      Selected: {editCandidateForm.image.name}
                    </span>
                  )}
                </label>
              </div>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingCandidate}
                  className="inline-flex items-center gap-2 rounded-md bg-button px-4 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {isUpdatingCandidate && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isUpdatingCandidate ? 'Saving...' : 'Save candidate'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
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

export default ElectionsManagementPage;
