import React, { useState } from 'react';
import * as HoverCard from '@radix-ui/react-hover-card';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { ColumnStatus, SampleKind } from '../../services/timetablingService';
import { SAMPLE_LABELS, useImportColumns, useSampleDownload } from './importSamples';
import { primaryButton } from './shared';

// Shown when the Rooms, Lecturers or Modules tab is hovered: the columns that tab's import reads, in order,
// and a headers-only CSV to start from.

const NOUNS: Record<SampleKind, string> = { rooms: 'room', lecturers: 'lecturer', modules: 'module' };

const STATUS: Record<ColumnStatus, { label: string; className: string }> = {
  required: { label: 'Required', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  requiredForNew: { label: 'Required for new', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  optional: { label: 'Optional', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

const ImportSampleCard: React.FC<{ kind: SampleKind; children: React.ReactElement }> = ({ kind, children }) => {
  const [open, setOpen] = useState(false);
  const { columns, failed, load } = useImportColumns();
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };
  const { downloading, download } = useSampleDownload();
  const list = columns?.[kind];

  return (
    <HoverCard.Root open={open} onOpenChange={changeOpen} openDelay={300} closeDelay={150}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          aria-label={`${SAMPLE_LABELS[kind]} CSV columns`}
          className="z-40 w-[400px] max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl"
        >
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600"><FileSpreadsheet className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{SAMPLE_LABELS[kind]} CSV columns</p>
              <p className="text-xs text-slate-500">Keep these headers, in this order. One row per {NOUNS[kind]}.</p>
            </div>
          </div>

          {list ? (
            <ol className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {list.map((column, index) => (
                <li key={column.label} className="flex gap-3 px-3 py-2">
                  <span className="w-4 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{column.label}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS[column.status].className}`}>{STATUS[column.status].label}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{column.help}</p>
                    <p className="mt-0.5 text-xs text-slate-400">e.g. <span className="font-mono text-slate-600">{column.example}</span></p>
                  </div>
                </li>
              ))}
            </ol>
          ) : failed ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Couldn't load the column guide. The sample below still has every column, in order.</p>
          ) : (
            <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading columns">
              {[0, 1, 2, 3].map((row) => <div key={row} className="h-9 animate-pulse rounded-md bg-slate-100" />)}
            </div>
          )}

          <button type="button" onClick={() => void download(kind)} disabled={downloading !== null} className={`${primaryButton} mt-4 w-full justify-center`}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download sample CSV
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Headers only. Fill it in, then use Import from Excel.</p>
          <HoverCard.Arrow className="fill-white" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
};

export default ImportSampleCard;
