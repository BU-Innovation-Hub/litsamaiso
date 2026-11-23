import React, { useCallback, useState } from 'react';
import { Info, Loader2, Monitor, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type ClassSession, type CourseModule, type Lecturer, type ModuleInput, type Term, type TimetableDetail } from '../../services/timetablingService';
import ModuleFields from './ModuleFields';
import { moduleForm } from './moduleForm';
import { DAYS, formatTime } from './schedule';
import { Modal, secondaryButton } from './shared';
import { useResource } from './useResource';

// Editing one class from the timetable: where and when it is (changed with Move), and its module's details.
// The lecturer, hours and so on belong to the module, so a change here applies to every class of it.

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className="mt-0.5 truncate text-sm font-semibold text-slate-900">{children}</dd>
  </div>
);

const ClassEditModal: React.FC<{
  detail: TimetableDetail;
  session: ClassSession;
  term: Term;
  onClose: () => void;
  onMove: (session: ClassSession) => void;
  onSaved: (detail: TimetableDetail) => void;
}> = ({ detail, session, term, onClose, onMove, onSaved }) => {
  const fetchModules = useCallback(() => timetablingService.listModules(term), [term]);
  const { data: modules, loading } = useResource<CourseModule[]>(fetchModules, [], 'Unable to load the module');
  const { data: lecturers } = useResource<Lecturer[]>(timetablingService.listLecturers, [], 'Unable to load lecturers');
  const module = modules.find((item) => item._id === session.module?._id);
  // Only what Registry changed is kept; the rest always shows what is saved
  const [edits, setEdits] = useState<Partial<ModuleInput>>({});
  const [busy, setBusy] = useState(false);

  const form = module ? { ...moduleForm(module), ...edits } : null;
  const set = <K extends keyof ModuleInput>(key: K, value: ModuleInput[K]) => setEdits((current) => ({ ...current, [key]: value }));
  const changed = Boolean(module && form && Object.entries(edits).some(([key, value]) => String(moduleForm(module)[key as keyof ModuleInput]) !== String(value)));
  const affectsNextGeneration = Boolean(module && (['sessionsPerWeek', 'durationHours', 'batches'] as const).some((key) => key in edits && edits[key] !== module[key]));

  const save = async () => {
    if (!module || !form) return;
    if (!changed) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await timetablingService.updateModule(module._id, form);
      // The run is loaded again so a new lecturer's clashes show straight away
      const updated = await timetablingService.getRun(detail.run._id);
      const clashes = updated.issues.length - detail.issues.length;
      if (clashes > 0) toast.warning(`${module.code} saved, but ${clashes} class${clashes === 1 ? ' now clashes' : 'es now clash'}. Move ${clashes === 1 ? 'it' : 'them'} before publishing.`);
      else toast.success(`${module.code} saved${affectsNextGeneration ? '. Generate again to apply the new classes per week, hours or batches.' : ''}`);
      onSaved(updated);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to save the module'));
    } finally {
      setBusy(false);
    }
  };

  const room = session.room;
  return (
    <Modal
      wide
      title={`Edit ${session.module?.code ?? 'class'}`}
      subtitle={session.module?.name}
      busy={busy}
      submitLabel={changed ? 'Save changes' : 'Done'}
      onClose={onClose}
      {...(module ? { onSubmit: save } : {})}
    >
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">This class</h3>
          <button type="button" onClick={() => onMove(session)} className={secondaryButton}><MoveRight className="h-4 w-4" /> Move</button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          <Fact label="Day">{DAYS[session.day]}</Fact>
          <Fact label="Time">{formatTime(session.startHour, session.endHour)}</Fact>
          <Fact label="Room">
            {room ? <>{room.code}{room.isComputerized && <Monitor className="ml-1 inline h-3.5 w-3.5 text-blue-700" aria-label="computer lab" />}</> : 'No room'}
          </Fact>
          <Fact label="Batch">{session.batch > 1 ? `Batch ${session.batch}` : 'Single group'}</Fact>
          <Fact label="Students / seats">{session.module?.studentCount ?? 0} / {room?.capacity ?? 0}</Fact>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Move changes the day, time and room of this class only.</p>
      </section>

      {loading && !module ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading the module...</p>
      ) : !module || !form ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">This module has been deleted, so only the class's day, time and room can be changed.</p>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Changes below apply to every class of {module.code}. A new lecturer is checked for clashes straight away; classes per week, hours and batches apply the next time you generate.</span>
          </p>
          <ModuleFields form={form} lecturers={lecturers} set={set} codeLocked />
        </>
      )}
    </Modal>
  );
};

export default ClassEditModal;
