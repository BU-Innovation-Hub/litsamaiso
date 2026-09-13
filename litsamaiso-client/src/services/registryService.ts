import apiClient, { API_BASE_URL } from '../lib/api';

export interface RegistryStudent {
  _id: string;
  studentId: string;
  nationalId?: string;
  email: string;
  name: string;
  surname: string;
  studentStatus: boolean;
  borrowerNumber?: string;
}

export interface RegistryRow {
  rowNumber: number;
  classification: 'matched' | 'possible/review' | 'missing/unmatched' | 'conflict' | 'duplicate';
  reasons?: string[];
  nationalId?: string;
  targetStudentId?: string;
  fullnames?: string;
  borrowerNumber?: string;
  courseOfStudy?: string;
  bankName?: string;
  accountNumber?: string;
  batchNumber?: number;
  graduating?: boolean;
  status?: string;
  resolution?: { action: string; targetStudentId?: string } | null;
  source?: Record<string, unknown>;
  name?: string;
  surname?: string;
  email?: string;
  studentId?: string;
  studentStatus?: boolean;
  outcome?: 'pending' | 'inserted' | 'updated' | 'skipped' | 'error';
  exceptionStatus?: 'open' | 'resolved' | null;
  failure?: { reason: string; error: string; at: string } | null;
}

export interface ExceptionReconciliation {
  reconciled: boolean;
  assigned: boolean;
  alreadyAssigned?: boolean;
  studentId?: string;
  message: string;
}

export interface RegistryExceptionResult extends RegistryRow {
  reconciliation?: ExceptionReconciliation;
}

export interface RegistryImport {
  _id: string;
  kind: 'students' | 'financial';
  filename: string;
  rows: RegistryRow[];
  summary: Record<string, number>;
  status: 'staged' | 'applied';
  createdAt?: string;
}

export interface RegistryException extends RegistryRow {
  importId: string;
  importKind?: 'students' | 'financial';
  filename?: string;
}

export interface RegistryDashboard {
  stats: { totalRegistered: number; assigned: number; missing: number; conflicts: number };
  latestReconciliation?: { importId: string; summary: Record<string, number> } | null;
}

interface RegistryApplyResult {
  applied: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  processed: number;
  total: number;
  status: string;
}

export interface RegistryProgress {
  type?: 'started' | 'progress' | 'completed' | 'error';
  percent: number;
  message: string;
  processed?: number;
  total?: number;
  inserted?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
}

const parseStreamError = (text: string) => {
  try { return JSON.parse(text).message || text; } catch { return text || 'Upload failed'; }
};

const upload = async (path: string, file: File, onProgress?: (progress: RegistryProgress) => void) => {
  const form = new FormData();
  form.append('file', file);
  if (!onProgress) {
    const response = await apiClient.post<{ data: RegistryImport }>(path, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return response.data.data;
  }

  const token = localStorage.getItem('authToken');
  const response = await fetch(`${API_BASE_URL}${path}?stream=1`, {
    method: 'POST',
    headers: { Accept: 'application/x-ndjson', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!response.ok || !response.body) throw new Error(parseStreamError(await response.text()));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: RegistryImport | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RegistryProgress & { result?: RegistryImport };
    if (event.type === 'error') throw new Error(event.message || 'Upload failed');
    if (event.type === 'started' || event.type === 'progress' || event.type === 'completed') onProgress(event);
    if (event.type === 'completed' && event.result) completed = event.result;
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return completed || (() => { throw new Error('Import completed without a result'); })();
};

export const registryService = {
  getDashboard: async () => (await apiClient.get<{ data: RegistryDashboard }>('/registry/dashboard')).data.data,
  listStudents: async (params: { search?: string; status?: string; borrower?: string; page?: number; limit?: number }) => (await apiClient.get<{ data: { items: RegistryStudent[]; pagination: { page: number; limit: number; total: number; pages: number } } }>('/registry/students', { params })).data.data,
  createStudent: async (data: Partial<RegistryStudent>) => (await apiClient.post<{ data: RegistryStudent }>('/registry/students', data)).data.data,
  updateStudent: async (id: string, data: Partial<RegistryStudent>) => (await apiClient.put<{ data: RegistryStudent }>(`/registry/students/${id}`, data)).data.data,
  deleteStudent: async (id: string) => (await apiClient.delete<{ data: { deleted: boolean } }>(`/registry/students/${id}`)).data.data,
  listExceptions: async () => (await apiClient.get<{ data: RegistryException[] }>('/registry/exceptions')).data.data,
  updateException: async (importId: string, rowNumber: number, data: Partial<RegistryRow> & { autoReconcile?: boolean }) => (await apiClient.put<{ data: RegistryExceptionResult }>(`/registry/exceptions/${importId}/${rowNumber}`, data)).data.data,
  reconcileException: async (importId: string, rowNumber: number) => (await apiClient.post<{ data: RegistryExceptionResult }>(`/registry/exceptions/${importId}/${rowNumber}/reconcile`)).data.data,
  deleteException: async (importId: string, rowNumber: number) => (await apiClient.delete<{ data: { deleted: boolean } }>(`/registry/exceptions/${importId}/${rowNumber}`)).data.data,
  searchStudentByNationalId: async (nationalId: string) => (await apiClient.get<{ data: RegistryStudent }>(`/registry/students/search/national-id/${encodeURIComponent(nationalId)}`)).data.data,
  addException: async (importId: string, rowNumber: number, data: Partial<RegistryStudent>) => (await apiClient.post<{ data: RegistryStudent }>(`/registry/exceptions/${importId}/${rowNumber}/add-to-registry`, data)).data.data,
  uploadStudents: (file: File, onProgress?: (progress: RegistryProgress) => void) => upload('/registry/uploads/students', file, onProgress),
  uploadFinancial: (file: File, onProgress?: (progress: RegistryProgress) => void) => upload('/registry/uploads/financial-clearance', file, onProgress),
  applyImport: async (id: string, onProgress?: (progress: RegistryProgress) => void) => {
    if (!onProgress) return (await apiClient.post<{ data: RegistryApplyResult }>(`/registry/imports/${id}/apply`)).data.data;
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/registry/imports/${id}/apply?stream=1`, { method: 'POST', headers: { Accept: 'application/x-ndjson', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok || !response.body) throw new Error(parseStreamError(await response.text()));
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let completed: RegistryApplyResult | null = null;
    const consume = (line: string) => { if (!line.trim()) return; const event = JSON.parse(line) as RegistryProgress & { result?: RegistryApplyResult }; if (event.type === 'error') throw new Error(event.message || 'Apply failed'); if (event.type === 'progress' || event.type === 'completed') onProgress(event); if (event.type === 'completed') completed = event.result || event as unknown as RegistryApplyResult; };
    while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(consume); if (done) break; }
    if (buffer.trim()) consume(buffer);
    return completed || (() => { throw new Error('Apply completed without a result'); })();
  },
};
