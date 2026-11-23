import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { ClassSession, TimetableDetail } from '../services/timetablingService';
import { DAYS, formatHour } from '../components/timetabling/schedule';

// A published class timetable as a printable PDF or an Excel workbook, built from the timetable already on
// screen. Loaded only when someone exports, so jsPDF and SheetJS stay out of the main bundle.

export type TimetableExportContext = { institutionName: string };

export type TimetableRow = {
  day: string;
  dayIndex: number;
  start: string;
  end: string;
  moduleCode: string;
  moduleName: string;
  batch: number;
  lecturer: string;
  room: string;
  building: string;
  students: number;
  seats: number;
};

const compareSessions = (a: ClassSession, b: ClassSession) =>
  a.day - b.day || a.startHour - b.startHour || (a.room?.code ?? '').localeCompare(b.room?.code ?? '') || (a.module?.code ?? '').localeCompare(b.module?.code ?? '');

// Every class, in the order a reader looks for it: by day, then time, then room
export const timetableRows = (detail: TimetableDetail): TimetableRow[] =>
  [...detail.sessions].sort(compareSessions).map((session) => ({
    day: DAYS[session.day] ?? `Day ${session.day + 1}`,
    dayIndex: session.day,
    start: formatHour(session.startHour),
    end: formatHour(session.endHour),
    moduleCode: session.module?.code ?? 'Deleted module',
    moduleName: session.module?.name ?? '',
    batch: session.batch ?? 1,
    lecturer: session.lecturer?.name ?? '',
    room: session.room?.code ?? '',
    building: session.room?.building ?? '',
    students: session.module?.studentCount ?? 0,
    seats: session.room?.capacity ?? 0,
  }));

// Excel sheet names: at most 31 characters, none of : \ / ? * [ ], not blank, and unique in the workbook
export const sheetName = (wanted: string, used: Set<string>) => {
  const base = wanted.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Sheet';
  let name = base;
  for (let copy = 2; used.has(name.toLowerCase()); copy += 1) {
    const suffix = ` (${copy})`;
    name = `${base.slice(0, 31 - suffix.length).trim()}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
};

export const exportFilename = (detail: TimetableDetail, extension: 'pdf' | 'xlsx') =>
  `timetable-${detail.run.academicYear.replace('/', '-')}-s${detail.run.semester}.${extension}`;

const termLabel = (detail: TimetableDetail) => `${detail.run.academicYear} · Semester ${detail.run.semester}`;
const publishedLabel = (detail: TimetableDetail) => {
  const when = detail.run.publishedAt ?? detail.run.createdAt;
  return `${detail.run.status === 'published' ? 'Published' : 'Generated'} ${new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
};
const moduleLabel = (row: TimetableRow) => `${row.moduleCode}${row.batch > 1 ? ` (batch ${row.batch})` : ''}`;

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export const timetablePdf = (detail: TimetableDetail, context: TimetableExportContext): Blob => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 40;
  const rows = timetableRows(detail);

  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(context.institutionName || 'Class timetable', margin, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Class timetable · ${termLabel(detail)}`, margin, 56);
    doc.text(publishedLabel(detail), width - margin, 56, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 66, width - margin, 66);
  };

  const columns = ['Time', 'Module', 'Module name', 'Lecturer', 'Room', 'Students / seats'];
  let startY = 82;
  if (!rows.length) {
    header();
    doc.setFontSize(11);
    doc.text('No classes are timetabled.', margin, startY + 10);
  }
  for (let day = 0; day < DAYS.length; day += 1) {
    const ofDay = rows.filter((row) => row.dayIndex === day);
    if (!ofDay.length) continue;
    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin, top: 82, bottom: 48 },
      head: [
        [{ content: DAYS[day]!, colSpan: columns.length, styles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 11, fontStyle: 'bold' } }],
        columns,
      ],
      body: ofDay.map((row) => [`${row.start}–${row.end}`, moduleLabel(row), row.moduleName, row.lecturer, row.building ? `${row.room} · ${row.building}` : row.room, `${row.students} / ${row.seats}`]),
      styles: { fontSize: 9, cellPadding: 5, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 96, fontStyle: 'bold' }, 4: { cellWidth: 120 }, 5: { cellWidth: 84, halign: 'right' } },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      didDrawPage: header,
    });
    startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 18;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${rows.length} classes · Litsamaiso`, margin, height - 24);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 24, { align: 'right' });
  }
  return doc.output('blob');
};

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const HEADERS = ['Day', 'Start', 'End', 'Module code', 'Module name', 'Batch', 'Lecturer', 'Room', 'Building', 'Students', 'Seats'];
const WIDTHS = [12, 8, 8, 13, 34, 7, 24, 10, 16, 10, 8];

const sheetOf = (rows: TimetableRow[]) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ...rows.map((row) => [row.day, row.start, row.end, row.moduleCode, row.moduleName, row.batch, row.lecturer, row.room, row.building, row.students, row.seats]),
  ]);
  sheet['!cols'] = WIDTHS.map((wch) => ({ wch }));
  if (rows.length) sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: HEADERS.length - 1 } }) };
  return sheet;
};

// "All classes", then one sheet per room and one per lecturer
export const timetableWorkbook = (detail: TimetableDetail, context: TimetableExportContext): Blob => {
  const rows = timetableRows(detail);
  const book = XLSX.utils.book_new();
  book.Props = { Title: `Class timetable ${termLabel(detail)}`, Company: context.institutionName || undefined };
  const used = new Set<string>();
  XLSX.utils.book_append_sheet(book, sheetOf(rows), sheetName('All classes', used));

  const groups = (key: (row: TimetableRow) => string, prefix: string) => {
    const names = [...new Set(rows.map(key).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    for (const name of names) XLSX.utils.book_append_sheet(book, sheetOf(rows.filter((row) => key(row) === name)), sheetName(`${prefix}${name}`, used));
  };
  groups((row) => row.room, 'Room ');
  groups((row) => row.lecturer, '');

  const data = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
