import type { ModuleInput } from '../../services/timetablingService';

// The choices for a module's room type preference, as the API stores them
export const ROOM_TYPE_OPTIONS: Array<[string, string]> = [
  ['any', 'Any room'],
  ['lecture theatre', 'Lecture theatre'],
  ['30-seater', '30-seater'],
  ['computer lab', 'Computer lab'],
];

// The form for an existing module, filled from what is saved
export const moduleForm = (module: {
  academicYear: string; semester: number; code: string; name: string; lecturer?: { _id: string } | null; requiresComputers: boolean;
  sessionsPerWeek: number; durationHours: number; credits?: number; batches?: number; preferredRoomType?: string; specificRequirements?: string;
}): ModuleInput => ({
  academicYear: module.academicYear,
  semester: module.semester,
  code: module.code,
  name: module.name,
  lecturer: module.lecturer?._id || '',
  requiresComputers: module.requiresComputers,
  sessionsPerWeek: module.sessionsPerWeek,
  durationHours: module.durationHours,
  credits: module.credits ?? 10,
  batches: module.batches ?? 1,
  preferredRoomType: module.preferredRoomType ?? 'any',
  specificRequirements: module.specificRequirements ?? '',
});
