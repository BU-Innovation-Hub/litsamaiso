import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, Loader2, Monitor, MoveRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type ClassSession, type RunStatus, type RunSummary, type Term, type TimetableDetail, type WaitingSession } from '../../services/timetablingService';
import { DAYS, formatHour, formatTime } from './schedule';
import { cell, inputClass, labelClass, Modal, primaryButton, secondaryButton, Table } from './shared';
import { useResource } from './useResource';

type View = 'list' | 'room' | 'lecturer' | 'module';
type Target = { kind: 'move'; session: ClassSession } | { kind: 'place'; waiting: WaitingSession };

const STATUS_BADGE: Record<RunStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-600',
};
const STATUS_LABEL: Record<RunStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' };

const runLabel = (run: RunSummary) => `${STATUS_LABEL[run.status]} · generated ${new Date(run.createdAt).toLocaleString()}`;

const PlacementModal: React.FC<{ detail: TimetableDetail; target: Target; onClose: () => void; onSaved: (detail: TimetableDetail) => void }> = ({ detail, target, onClose, onSaved }) => {
  const { rules } = detail.run;
  const info = target.kind === 'move'
    ? { code: target.session.module?.code || 'Class', hours: target.session.endHour - target.session.startHour, computers: Boolean(target.session.module?.requiresComputers), students: target.session.module?.studentCount ?? 0 }
    : { code: target.waiting.moduleCode, hours: target.waiting.durationHours, computers: target.waiting.requiresComputers, students: target.waiting.studentCount };
  const rooms = detail.rooms.filter((room) => room.active && room.capacity >= info.students && (!info.computers || room.isComputerized));
  const starts = Array.from({ length: rules.dayEndHour - info.hours - rules.dayStartHour + 1 }, (_, index) => rules.dayStartHour + index);

  const [day, setDay] = useState(target.kind === 'move' ? target.session.day : 0);
  const [startHour, setStartHour] = useState(target.kind === 'move' ? target.session.startHour : rules.dayStartHour);
  const [roomId, setRoomId] = useState(target.kind === 'move' ? target.session.room?._id || rooms[0]?._id || '' : rooms[0]?._id || '');
  const [busy, setBusy] = useState(false);
  const [clash, setClash] = useState('');

  const save = async () => {
    setBusy(true);
    setClash('');
    try {
      const placement = { day, startHour, roomId };
      const updated = target.kind === 'move'
        ? await timetablingService.moveSession(target.session._id, placement)
        : await timetablingService.placeUnplaced(detail.run._id, target.waiting.module, placement, target.waiting.session, target.waiting.batch);
      toast.success(`${info.code} ${target.kind === 'move' ? 'moved' : 'placed'}`);
      onSaved(updated);
    } catch (error) {
      setClash(getApiErrorMessage(error, 'That time does not work'));
    } finally { setBusy(false); }
  };

  return (
    <Modal
      title={target.kind === 'move' ? `Move ${info.code}` : `Place ${info.code}`}
      subtitle={`${info.hours}-hour class · ${info.students} students${info.computers ? ' · needs a computer lab' : ''}`}
      busy={busy}
      submitLabel={target.kind === 'move' ? 'Move class' : 'Place class'}
      onClose={onClose}
      onSubmit={save}
    >
      {target.kind === 'place' && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{target.waiting.reason}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>Day
          <select value={day} onChange={(event) => setDay(Number(event.target.value))} className={inputClass}>
            {DAYS.slice(0, rules.days).map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
        </label>
        <label className={labelClass}>Time
          <select value={startHour} onChange={(event) => setStartHour(Number(event.target.value))} className={inputClass}>
            {starts.map((hour) => <option key={hour} value={hour}>{formatTime(hour, hour + info.hours)}</option>)}
          </select>
        </label>
        <label className={labelClass}>Room
          <select required value={roomId} onChange={(event) => setRoomId(event.target.value)} className={inputClass}>
            {rooms.length === 0 && <option value="">No suitable room</option>}
            {rooms.map((room) => <option key={room._id} value={room._id}>{room.code} · {room.capacity} seats{room.isComputerized ? ' · lab' : ''}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">The same rules as the generator apply: no room or student clashes, and a {rules.minLecturerGapHours}-hour break between a lecturer's classes on the same day.</p>
      {clash && <p className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{clash}</p>}
    </Modal>
  );
};

const SessionCard: React.FC<{ session: ClassSession; view: View; flagged: boolean; editable: boolean; onMove: () => void }> = ({ session, view, flagged, editable, onMove }) => (
  <button
    type="button"
    disabled={!editable}
    onClick={onMove}
    title={editable ? 'Move this class' : undefined}
    className={`block h-full w-full rounded-md border px-2 py-1.5 text-left text-xs ${flagged ? 'border-rose-300 bg-rose-50' : 'border-blue-200 bg-blue-50'} ${editable ? 'hover:border-blue-400' : 'cursor-default'}`}
  >
    <span className="flex items-center gap-1 font-semibold text-slate-900">{session.module?.code || 'Deleted module'}{session.batch > 1 && <span className="rounded bg-amber-100 px-1 text-xs text-amber-800">B{session.batch}</span>}{session.module?.requiresComputers && <Monitor className="h-3 w-3 text-blue-700" />}</span>
    <span className="block text-slate-600">{formatTime(session.startHour, session.endHour)}</span>
    {view !== 'room' && <span className="block text-slate-600">{session.room?.code}</span>}
    {view !== 'lecturer' && <span className="block truncate text-slate-500">{session.lecturer?.name}</span>}
  </button>
);

const WeekGrid: React.FC<{ detail: TimetableDetail; sessions: ClassSession[]; view: View; flagged: Set<string>; editable: boolean; onMove: (session: ClassSession) => void }> = ({ detail, sessions, view, flagged, editable, onMove }) => {
  const { rules } = detail.run;
  const hours = Array.from({ length: rules.dayEndHour - rules.dayStartHour }, (_, index) => rules.dayStartHour + index);
  // Overlapping classes share one cell, so the grid holds together even if a change made
  // after generating put two classes on top of each other
  const blocks = DAYS.slice(0, rules.days).map((_, day) => {
    const result: Array<{ start: number; end: number; sessions: ClassSession[] }> = [];
    for (const session of sessions.filter((item) => item.day === day).sort((a, b) => a.startHour - b.startHour)) {
      const last = result[result.length - 1];
      if (last && session.startHour < last.end) { last.sessions.push(session); last.end = Math.max(last.end, session.endHour); }
      else result.push({ start: session.startHour, end: session.endHour, sessions: [session] });
    }
    return result;
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full table-fixed border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-16 px-2 py-2 text-left text-xs font-semibold uppercase text-slate-500">Time</th>
            {DAYS.slice(0, rules.days).map((name) => <th key={name} className="min-w-[120px] px-2 py-2 text-left text-xs font-semibold uppercase text-slate-500">{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour} className="h-12 border-t border-slate-100">
              <td className="px-2 align-top text-xs text-slate-500">{formatHour(hour)}</td>
              {blocks.map((dayBlocks, day) => {
                const block = dayBlocks.find((item) => item.start === hour);
                if (block) {
                  return (
                    <td key={day} rowSpan={block.end - block.start} className="p-1 align-top">
                      <div className="flex h-full flex-col gap-1">{block.sessions.map((session) => <SessionCard key={session._id} session={session} view={view} flagged={flagged.has(session._id)} editable={editable} onMove={() => onMove(session)} />)}</div>
                    </td>
                  );
                }
                if (dayBlocks.some((item) => item.start < hour && hour < item.end)) return null;
                return <td key={day} className="p-1" />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TimetableTab: React.FC<{ term: Term }> = ({ term }) => {
  const fetchRuns = useCallback(() => timetablingService.listRuns(term), [term]);
  const { data: runs, loading: loadingRuns, reload: reloadRuns } = useResource<RunSummary[]>(fetchRuns, [], 'Unable to load timetables');
  const [chosenRunId, setChosenRunId] = useState('');
  const [loaded, setLoaded] = useState<TimetableDetail | null>(null);
  const [failedRunId, setFailedRunId] = useState('');
  const [working, setWorking] = useState<'generate' | 'publish' | null>(null);
  const [view, setView] = useState<View>('list');
  const [focus, setFocus] = useState('');
  const [target, setTarget] = useState<Target | null>(null);

  // The timetable on screen: the one Registry picked (or just generated), else the
  // semester's draft, else its published one
  const inTerm = loaded?.run.academicYear === term.academicYear && loaded?.run.semester === term.semester;
  const runId = chosenRunId && loaded?.run._id === chosenRunId && inTerm
    ? chosenRunId
    : loadingRuns
      ? ''
      : chosenRunId && runs.some((run) => run._id === chosenRunId)
        ? chosenRunId
        : runs.find((run) => run.status === 'draft')?._id || runs.find((run) => run.status === 'published')?._id || runs[0]?._id || '';
  const detail = loaded && loaded.run._id === runId ? loaded : null;
  const loading = loadingRuns || (Boolean(runId) && !detail && failedRunId !== runId);

  useEffect(() => {
    if (!runId || loaded?.run._id === runId || failedRunId === runId) return;
    let cancelled = false;
    timetablingService.getRun(runId)
      .then((result) => { if (!cancelled) setLoaded(result); })
      .catch((error) => {
        if (cancelled) return;
        setFailedRunId(runId);
        toast.error(getApiErrorMessage(error, 'Unable to load timetable'));
      });
    return () => { cancelled = true; };
  }, [runId, loaded?.run._id, failedRunId]);

  const show = (result: TimetableDetail) => { setLoaded(result); setChosenRunId(result.run._id); };

  const generate = async () => {
    const hasPublished = runs.some((run) => run.status === 'published');
    if (runs.some((run) => run.status === 'draft') && !window.confirm('Generating again replaces the current draft, including any classes you moved by hand. Continue?')) return;
    setWorking('generate');
    try {
      const result = await timetablingService.generateRun(term);
      show(result);
      reloadRuns();
      const waiting = result.unplaced.length;
      if (waiting) toast.warning(`${result.sessions.length} classes placed; ${waiting} could not be placed. See "Waiting to be placed".`);
      else toast.success(`All ${result.sessions.length} classes placed${hasPublished ? '. The published timetable stays in place until you publish this draft.' : ''}`);
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to generate the timetable')); }
    finally { setWorking(null); }
  };

  const publish = async () => {
    if (!detail) return;
    const waiting = detail.unplaced.length;
    if (!window.confirm(waiting ? `${waiting} class${waiting === 1 ? ' is' : 'es are'} still waiting to be placed. Publish anyway?` : 'Publish this timetable? It replaces the currently published one.')) return;
    setWorking('publish');
    try {
      const result = await timetablingService.publishRun(detail.run._id);
      show(result);
      reloadRuns();
      toast.success('Timetable published');
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to publish the timetable')); }
    finally { setWorking(null); }
  };

  const saved = (updated: TimetableDetail) => { show(updated); setTarget(null); };

  const focusOptions = useMemo(() => {
    if (!detail) return [];
    const seen = new Map<string, string>();
    for (const session of detail.sessions) {
      const entry = view === 'room' ? session.room && [session.room._id, session.room.code] : view === 'lecturer' ? session.lecturer && [session.lecturer._id, session.lecturer.name] : view === 'module' ? session.module && [session.module._id, `${session.module.code} · ${session.module.name}`] : null;
      if (entry) seen.set(entry[0], entry[1]);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [detail, view]);

  // Falls back to the first room, lecturer or module when the pick isn't on this timetable
  const activeFocus = focusOptions.some(([id]) => id === focus) ? focus : focusOptions[0]?.[0] || '';

  const visible = useMemo(() => {
    if (!detail) return [];
    if (view === 'list') return detail.sessions;
    return detail.sessions.filter((session) => (view === 'room' ? session.room?._id : view === 'lecturer' ? session.lecturer?._id : session.module?._id) === activeFocus);
  }, [detail, activeFocus, view]);

  const flagged = useMemo(() => new Set(detail?.issues.map((issue) => issue.sessionId)), [detail]);
  const editable = Boolean(detail && detail.run.status !== 'archived');
  const sessionById = useMemo(() => new Map(detail?.sessions.map((session) => [session._id, session])), [detail]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-5 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Timetable for {term.academicYear} semester {term.semester}</h2>
            <p className="text-sm text-muted-foreground">Monday to Saturday, 07:00–19:00. Rooms and modules never clash, and lecturers get a 2-hour break between classes on the same day.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(working)} onClick={() => void generate()} className={primaryButton}>{working === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate timetable</button>
            {detail?.run.status === 'draft' && <button type="button" disabled={Boolean(working) || detail.issues.length > 0} title={detail.issues.length ? 'Fix the clashes first' : undefined} onClick={() => void publish()} className={secondaryButton}>{working === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Publish</button>}
          </div>
        </div>

        {runs.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select value={runId} onChange={(event) => setChosenRunId(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {runs.map((run) => <option key={run._id} value={run._id}>{runLabel(run)}</option>)}
            </select>
            {detail && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[detail.run.status]}`}>{STATUS_LABEL[detail.run.status]}</span>}
            {detail && <span className="text-sm text-slate-600">{detail.sessions.length} classes placed · {detail.unplaced.length} waiting · {detail.issues.length} clashes</span>}
          </div>
        )}
        {!loading && runs.length === 0 && <p className="mt-4 rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">No timetable yet. Add rooms, lecturers and modules, then generate one.</p>}
      </section>

      {detail && detail.issues.length > 0 && (
        <section className="rounded-lg border border-rose-200 bg-white p-5 shadow">
          <h3 className="flex items-center gap-2 font-semibold text-rose-800"><AlertTriangle className="h-4 w-4" /> Clashes from changes made after generating</h3>
          <p className="text-sm text-slate-600">Move these classes or generate again. A timetable with clashes can't be published.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {detail.issues.map((issue) => {
              const session = sessionById.get(issue.sessionId);
              return (
                <li key={issue.sessionId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span><span className="font-semibold text-slate-900">{session?.module?.code}</span> {session && <span className="text-slate-500">{DAYS[session.day]} {formatTime(session.startHour, session.endHour)}</span>} <span className="block text-rose-700">{issue.message}</span></span>
                  {session && editable && <button type="button" onClick={() => setTarget({ kind: 'move', session })} className={secondaryButton}><MoveRight className="h-4 w-4" /> Move</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {detail && detail.unplaced.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-white p-5 shadow">
          <h3 className="flex items-center gap-2 font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" /> Waiting to be placed</h3>
          <p className="text-sm text-slate-600">No time or room satisfied every rule for these classes. Add rooms or adjust the module, then generate again, or place one by hand.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {detail.unplaced.map((waiting) => (
              <li key={`${waiting.module}-${waiting.session}-${waiting.batch}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span><span className="font-semibold text-slate-900">{waiting.moduleCode}</span> <span className="text-slate-500">session {waiting.session}{waiting.batch > 1 ? `, batch ${waiting.batch}` : ''} · {waiting.lecturerName}</span><span className="block text-amber-800">{waiting.reason}</span></span>
                {editable && <button type="button" onClick={() => setTarget({ kind: 'place', waiting })} className={secondaryButton}><MoveRight className="h-4 w-4" /> Place</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail && (
        <section className="rounded-lg bg-white p-5 shadow">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-300 p-0.5">
              {(['list', 'room', 'lecturer', 'module'] as View[]).map((option) => (
                <button key={option} type="button" onClick={() => setView(option)} className={`rounded px-3 py-1.5 text-sm font-medium ${view === option ? 'bg-button text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {{ list: 'All classes', room: 'By room', lecturer: 'By lecturer', module: 'By module' }[option]}
                </button>
              ))}
            </div>
            {view !== 'list' && (
              <select value={activeFocus} onChange={(event) => setFocus(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {focusOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            )}
          </div>
          <div className="mt-4">
            {view === 'list' ? (
              <Table headers={['Day', 'Time', 'Module', 'Lecturer', 'Room', 'Students', '']} empty="No classes placed." rowCount={visible.length} loading={loading}>
                {visible.map((session) => (
                  <tr key={session._id} className={flagged.has(session._id) ? 'bg-rose-50' : 'hover:bg-slate-50'}>
                    <td className={cell}>{DAYS[session.day]}</td>
                    <td className={cell}>{formatTime(session.startHour, session.endHour)}</td>
                    <td className="px-4 py-3 text-sm"><span className="font-semibold text-slate-950">{session.module?.code || 'Deleted module'}</span><span className="block text-slate-500">{session.module?.name}</span></td>
                    <td className={cell}>{session.lecturer?.name || '-'}</td>
                    <td className={cell}>{session.room?.code || '-'}{session.room?.isComputerized && <Monitor className="ml-1 inline h-3.5 w-3.5 text-blue-700" />}</td>
                    <td className={cell}>{session.module?.studentCount ?? 0} / {session.room?.capacity ?? 0}</td>
                    <td className="px-4 py-3 text-right">{editable && <button type="button" onClick={() => setTarget({ kind: 'move', session })} className={secondaryButton}><MoveRight className="h-4 w-4" /> Move</button>}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <WeekGrid detail={detail} sessions={visible} view={view} flagged={flagged} editable={editable} onMove={(session) => setTarget({ kind: 'move', session })} />
            )}
          </div>
        </section>
      )}

      {detail && target && <PlacementModal detail={detail} target={target} onClose={() => setTarget(null)} onSaved={saved} />}
    </div>
  );
};

export default TimetableTab;
