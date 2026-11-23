import React, { useState } from 'react';
import { Edit, Layers, Monitor, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type Room, type RoomInput, type RoomSeriesInput } from '../../services/timetablingService';
import { ROOM_TYPE_OPTIONS } from './moduleForm';
import { cell, dangerIconButton, iconButton, inputClass, labelClass, Modal, primaryButton, secondaryButton, Table } from './shared';
import { useResource } from './useResource';

// The kinds of room the API stores. "Any" is only a module's preference, never a room's type.
const ROOM_TYPES = ROOM_TYPE_OPTIONS.filter(([value]) => value !== 'any');
// The API's default, also used for rooms saved before rooms had a type
const DEFAULT_ROOM_TYPE = '30-seater';
const roomTypeLabel = (value: string | undefined) => ROOM_TYPES.find(([type]) => type === value)?.[1] ?? '30-seater';

const emptyRoom: RoomInput = { code: '', building: '', capacity: 40, isComputerized: false, roomType: DEFAULT_ROOM_TYPE, active: true };
const emptySeries: RoomSeriesInput = { prefix: '', startNumber: '101', count: 10, building: '', capacity: 40, isComputerized: false, roomType: DEFAULT_ROOM_TYPE, active: true };

const seriesPreview = (series: RoomSeriesInput) => {
  if (!/^\d{1,6}$/.test(series.startNumber) || !series.count) return '';
  const code = (offset: number) => `${series.prefix.toUpperCase()}${String(Number(series.startNumber) + offset).padStart(series.startNumber.length, '0')}`;
  return series.count === 1 ? code(0) : `${code(0)} to ${code(series.count - 1)}`;
};

const RoomFields: React.FC<{ value: Omit<RoomInput, 'code'>; onChange: (value: Omit<RoomInput, 'code'>) => void }> = ({ value, onChange }) => (
  <>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>Building<input value={value.building || ''} onChange={(event) => onChange({ ...value, building: event.target.value })} placeholder="Block A" className={inputClass} /></label>
      <label className={labelClass}>Seats<input type="number" min={1} max={2000} required value={value.capacity} onChange={(event) => onChange({ ...value, capacity: Number(event.target.value) })} className={inputClass} /></label>
    </div>
    <label className={labelClass}>
      Room type
      {/* A computer lab has computers, so choosing it ticks the box below. It can still be unticked. */}
      <select value={value.roomType || DEFAULT_ROOM_TYPE} onChange={(event) => onChange({ ...value, roomType: event.target.value, isComputerized: event.target.value === 'computer lab' || value.isComputerized })} className={inputClass}>
        {ROOM_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={value.isComputerized} onChange={(event) => onChange({ ...value, isComputerized: event.target.checked })} /> Computer lab (has computers)</label>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={value.active} onChange={(event) => onChange({ ...value, active: event.target.checked })} /> In use (new timetables can book it)</label>
  </>
);

const RoomsTab: React.FC = () => {
  const { data: rooms, loading, reload: load } = useResource<Room[]>(timetablingService.listRooms, [], 'Unable to load rooms');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; form: RoomInput } | null>(null);
  const [series, setSeries] = useState<RoomSeriesInput | null>(null);

  const saveRoom = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await timetablingService.updateRoom(editing.id, editing.form);
      else await timetablingService.createRoom(editing.form);
      toast.success(`Room ${editing.form.code.toUpperCase()} saved`);
      setEditing(null);
      load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to save room')); }
    finally { setBusy(false); }
  };

  const createSeries = async () => {
    if (!series) return;
    setBusy(true);
    try {
      const result = await timetablingService.generateRooms(series);
      toast.success(`${result.created.length} room${result.created.length === 1 ? '' : 's'} created${result.skipped.length ? `; ${result.skipped.join(', ')} already existed` : ''}`);
      setSeries(null);
      load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to create rooms')); }
    finally { setBusy(false); }
  };

  const remove = async (room: Room) => {
    if (!window.confirm(`Delete room ${room.code}?`)) return;
    try { await timetablingService.deleteRoom(room._id); toast.success(`Room ${room.code} deleted`); load(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Unable to delete room')); }
  };

  const labs = rooms.filter((room) => room.isComputerized && room.active).length;
  const seats = rooms.filter((room) => room.active).reduce((total, room) => total + room.capacity, 0);

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Rooms</h2>
          <p className="text-sm text-muted-foreground">{rooms.length} rooms, {labs} computer labs, {seats} seats in use.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSeries(emptySeries)} className={primaryButton}><Layers className="h-4 w-4" /> Create rooms in bulk</button>
          <button type="button" onClick={() => setEditing({ form: emptyRoom })} className={secondaryButton}><Plus className="h-4 w-4" /> Add room</button>
        </div>
      </div>
      <div className="mt-5">
        <Table headers={['Room', 'Building', 'Seats', 'Type', 'Status', 'Actions']} empty="No rooms yet. Create them in bulk or add them one at a time." loading={loading} rowCount={rooms.length}>
          {rooms.map((room) => (
            <tr key={room._id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-950">{room.code}</td>
              <td className={cell}>{room.building || '-'}</td>
              <td className={cell}>{room.capacity}</td>
              <td className={cell}>{room.isComputerized ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><Monitor className="h-3.5 w-3.5" /> {roomTypeLabel(room.roomType)}</span> : roomTypeLabel(room.roomType)}</td>
              <td className={cell}><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${room.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{room.active ? 'In use' : 'Not in use'}</span></td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                <button type="button" title="Edit room" aria-label={`Edit room ${room.code}`} onClick={() => setEditing({ id: room._id, form: { code: room.code, building: room.building || '', capacity: room.capacity, isComputerized: room.isComputerized, roomType: room.roomType || DEFAULT_ROOM_TYPE, active: room.active } })} className={`${iconButton} mr-2`}><Edit className="h-4 w-4" /></button>
                <button type="button" title="Delete room" aria-label={`Delete room ${room.code}`} onClick={() => void remove(room)} className={dangerIconButton}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {editing && (
        <Modal title={editing.id ? `Edit room ${editing.form.code}` : 'Add room'} busy={busy} onClose={() => setEditing(null)} onSubmit={saveRoom}>
          <label className={labelClass}>Room code<input required value={editing.form.code} onChange={(event) => setEditing({ ...editing, form: { ...editing.form, code: event.target.value } })} placeholder="A101" className={inputClass} /></label>
          <RoomFields value={editing.form} onChange={(value) => setEditing({ ...editing, form: { ...editing.form, ...value } })} />
        </Modal>
      )}

      {series && (
        <Modal title="Create rooms in bulk" subtitle="Creates a numbered series of rooms. Codes that already exist are skipped." busy={busy} submitLabel={`Create ${series.count || 0} rooms`} onClose={() => setSeries(null)} onSubmit={createSeries}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>Code prefix<input value={series.prefix} onChange={(event) => setSeries({ ...series, prefix: event.target.value })} placeholder="A or LAB-" className={inputClass} /></label>
            <label className={labelClass}>First number<input required pattern="\d{1,6}" title="Digits only, such as 101 or 01" value={series.startNumber} onChange={(event) => setSeries({ ...series, startNumber: event.target.value })} className={inputClass} /></label>
            <label className={labelClass}>How many<input type="number" min={1} max={200} required value={series.count} onChange={(event) => setSeries({ ...series, count: Number(event.target.value) })} className={inputClass} /></label>
          </div>
          {seriesPreview(series) && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Creates <span className="font-semibold text-slate-900">{seriesPreview(series)}</span></p>}
          <RoomFields value={series} onChange={(value) => setSeries({ ...series, ...value })} />
        </Modal>
      )}
    </section>
  );
};

export default RoomsTab;
