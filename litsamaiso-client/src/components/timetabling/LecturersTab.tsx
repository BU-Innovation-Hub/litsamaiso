import React, { useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type Lecturer, type LecturerInput } from '../../services/timetablingService';
import { cell, dangerIconButton, iconButton, inputClass, labelClass, Modal, secondaryButton, Table } from './shared';
import { useResource } from './useResource';

const emptyLecturer: LecturerInput = { name: '', email: '', staffNumber: '' };

const LecturersTab: React.FC = () => {
  const { data: lecturers, loading, reload: load } = useResource<Lecturer[]>(timetablingService.listLecturers, [], 'Unable to load lecturers');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; form: LecturerInput } | null>(null);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await timetablingService.updateLecturer(editing.id, editing.form);
      else await timetablingService.createLecturer(editing.form);
      toast.success(`${editing.form.name} saved`);
      setEditing(null);
      load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to save lecturer')); }
    finally { setBusy(false); }
  };

  const remove = async (lecturer: Lecturer) => {
    if (!window.confirm(`Delete ${lecturer.name}?`)) return;
    try { await timetablingService.deleteLecturer(lecturer._id); toast.success(`${lecturer.name} deleted`); load(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Unable to delete lecturer')); }
  };

  const set = (key: keyof LecturerInput, value: string) => editing && setEditing({ ...editing, form: { ...editing.form, [key]: value } });

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Lecturers</h2>
          <p className="text-sm text-muted-foreground">Each module has one lecturer, and its students belong to that lecturer.</p>
        </div>
        <button type="button" onClick={() => setEditing({ form: emptyLecturer })} className={secondaryButton}><Plus className="h-4 w-4" /> Add lecturer</button>
      </div>
      <div className="mt-5">
        <Table headers={['Name', 'Email', 'Staff number', 'Modules', 'Actions']} empty="No lecturers yet." loading={loading} rowCount={lecturers.length}>
          {lecturers.map((lecturer) => (
            <tr key={lecturer._id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-950">{lecturer.name}</td>
              <td className={cell}>{lecturer.email}</td>
              <td className={cell}>{lecturer.staffNumber || '-'}</td>
              <td className={cell}>{lecturer.moduleCount ?? 0}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                <button type="button" title="Edit lecturer" aria-label={`Edit ${lecturer.name}`} onClick={() => setEditing({ id: lecturer._id, form: { name: lecturer.name, email: lecturer.email, staffNumber: lecturer.staffNumber || '' } })} className={`${iconButton} mr-2`}><Edit className="h-4 w-4" /></button>
                <button type="button" title="Delete lecturer" aria-label={`Delete ${lecturer.name}`} onClick={() => void remove(lecturer)} className={dangerIconButton}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.form.name}` : 'Add lecturer'} busy={busy} onClose={() => setEditing(null)} onSubmit={save}>
          <label className={labelClass}>Full name<input required value={editing.form.name} onChange={(event) => set('name', event.target.value)} className={inputClass} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Email<input type="email" required value={editing.form.email} onChange={(event) => set('email', event.target.value)} className={inputClass} /></label>
            <label className={labelClass}>Staff number<input value={editing.form.staffNumber || ''} onChange={(event) => set('staffNumber', event.target.value)} className={inputClass} /></label>
          </div>
        </Modal>
      )}
    </section>
  );
};

export default LecturersTab;
