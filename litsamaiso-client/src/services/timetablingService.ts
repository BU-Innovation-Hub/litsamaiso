import apiClient from '../lib/api';

export interface Room {
  _id: string;
  code: string;
  building?: string;
  capacity: number;
  isComputerized: boolean;
  roomType: string;
  active: boolean;
}

export interface Lecturer {
  _id: string;
  name: string;
  email: string;
  staffNumber?: string;
  moduleCount?: number;
}

export interface Term {
  academicYear: string;
  semester: number;
}

export interface CourseModule extends Term {
  _id: string;
  code: string;
  name: string;
  lecturer?: Pick<Lecturer, '_id' | 'name' | 'email'> | null;
  requiresComputers: boolean;
  sessionsPerWeek: number;
  durationHours: number;
  credits: number;
  batches: number;
  preferredRoomType: string;
  specificRequirements: string;
  studentCount: number;
}

export interface ModuleStudent {
  _id: string;
  studentId: string;
  name: string;
  surname: string;
  email: string;
}

export interface TimetableRules {
  days: number;
  dayStartHour: number;
  dayEndHour: number;
  minLecturerGapHours: number;
}

export interface UnplacedSession {
  module: string;
  moduleCode: string;
  session: number;
  batch: number;
  reason: string;
}

export type RunStatus = 'draft' | 'published' | 'archived';

export interface TimetableRun extends Term {
  _id: string;
  status: RunStatus;
  rules: TimetableRules;
  unplaced: UnplacedSession[];
  createdAt: string;
  publishedAt?: string;
}

export interface RunSummary extends Omit<TimetableRun, 'unplaced'> {
  unplacedCount: number;
}

export interface ClassSession {
  _id: string;
  day: number;
  startHour: number;
  endHour: number;
  batch: number;
  module: { _id: string; code: string; name: string; requiresComputers: boolean; studentCount: number } | null;
  lecturer: { _id: string; name: string } | null;
  room: { _id: string; code: string; building?: string; capacity: number; isComputerized: boolean; roomType: string } | null;
}

export interface WaitingSession extends UnplacedSession {
  durationHours: number;
  requiresComputers: boolean;
  studentCount: number;
  lecturerName: string;
}

export interface TimetableDetail {
  run: TimetableRun;
  sessions: ClassSession[];
  unplaced: WaitingSession[];
  rooms: Room[];
  issues: Array<{ sessionId: string; message: string }>;
}

export type RoomInput = Omit<Room, '_id'>;
export type RoomSeriesInput = Omit<RoomInput, 'code'> & { prefix: string; startNumber: string; count: number };
export type LecturerInput = Omit<Lecturer, '_id' | 'moduleCount'>;
export type ModuleInput = Term & Pick<CourseModule, 'code' | 'name' | 'requiresComputers' | 'sessionsPerWeek' | 'durationHours' | 'credits' | 'batches' | 'preferredRoomType' | 'specificRequirements'> & { lecturer: string };
export type Placement = { day: number; startHour: number; roomId: string; session?: number; batch?: number };

const data = <T>(promise: Promise<{ data: { data: T } }>) => promise.then((response) => response.data.data);

export type ImportKind = 'rooms' | 'lecturers' | 'modules' | 'enrolments';
export interface ImportTally { sheet: string; kind: ImportKind; rows: number; added: number; updated: number; unchanged: number; skipped: number }
export interface ImportIssue { sheet: string; row?: number; message: string }
export interface ImportResult {
  applied: boolean;
  term: Term;
  changes: number;
  sheets: ImportTally[];
  issues: ImportIssue[];
  issueCount: number;
  ignoredSheets: string[];
}

export const timetablingService = {
  listRooms: () => data<Room[]>(apiClient.get('/timetabling/rooms')),
  createRoom: (input: RoomInput) => data<Room>(apiClient.post('/timetabling/rooms', input)),
  generateRooms: (input: RoomSeriesInput) => data<{ created: string[]; skipped: string[] }>(apiClient.post('/timetabling/rooms/generate', input)),
  updateRoom: (id: string, input: Partial<RoomInput>) => data<Room>(apiClient.put(`/timetabling/rooms/${id}`, input)),
  deleteRoom: (id: string) => data<{ deleted: boolean }>(apiClient.delete(`/timetabling/rooms/${id}`)),

  listLecturers: () => data<Lecturer[]>(apiClient.get('/timetabling/lecturers')),
  createLecturer: (input: LecturerInput) => data<Lecturer>(apiClient.post('/timetabling/lecturers', input)),
  updateLecturer: (id: string, input: LecturerInput) => data<Lecturer>(apiClient.put(`/timetabling/lecturers/${id}`, input)),
  deleteLecturer: (id: string) => data<{ deleted: boolean }>(apiClient.delete(`/timetabling/lecturers/${id}`)),

  listModules: (term: Term) => data<CourseModule[]>(apiClient.get('/timetabling/modules', { params: term })),
  createModule: (input: ModuleInput) => data<CourseModule>(apiClient.post('/timetabling/modules', input)),
  updateModule: (id: string, input: ModuleInput) => data<CourseModule>(apiClient.put(`/timetabling/modules/${id}`, input)),
  deleteModule: (id: string) => data<{ deleted: boolean }>(apiClient.delete(`/timetabling/modules/${id}`)),
  listModuleStudents: (id: string) => data<ModuleStudent[]>(apiClient.get(`/timetabling/modules/${id}/students`)),
  addModuleStudents: (id: string, studentIds: string) =>
    data<{ added: number; alreadyEnrolled: number; notFound: string[] }>(apiClient.post(`/timetabling/modules/${id}/students`, { studentIds })),
  removeModuleStudent: (id: string, studentId: string) => data<{ removed: boolean }>(apiClient.delete(`/timetabling/modules/${id}/students/${studentId}`)),

  listRuns: (term: Term) => data<RunSummary[]>(apiClient.get('/timetabling/runs', { params: term })),
  generateRun: (term: Term) => data<TimetableDetail>(apiClient.post('/timetabling/runs', term)),
  getRun: (id: string) => data<TimetableDetail>(apiClient.get(`/timetabling/runs/${id}`)),
  publishRun: (id: string) => data<TimetableDetail>(apiClient.post(`/timetabling/runs/${id}/publish`)),
  placeUnplaced: (runId: string, moduleId: string, placement: Placement, session?: number, batch?: number) =>
    data<TimetableDetail>(apiClient.post(`/timetabling/runs/${runId}/sessions`, { moduleId, session, batch, ...placement })),
  moveSession: (id: string, placement: Placement) => data<TimetableDetail>(apiClient.put(`/timetabling/sessions/${id}`, placement)),

  // Without `apply` the file is only checked, and the result says what importing it would change
  importSpreadsheet: (file: File, term: Term, apply: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('academicYear', term.academicYear);
    form.append('semester', String(term.semester));
    form.append('apply', String(apply));
    return data<ImportResult>(apiClient.post('/timetabling/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
  downloadImportTemplate: async () => (await apiClient.get<Blob>('/timetabling/import/template', { responseType: 'blob' })).data,
};
