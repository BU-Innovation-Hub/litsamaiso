import { defaultFilename } from './utils';

export const exportJson = async ({ data, meta, filename }: { data: unknown; meta?: any; filename?: string }) => {
  const name = filename || defaultFilename(meta?.title || meta?.reportKey || 'report', 'json');
  const blob = new Blob([JSON.stringify({ meta: meta || {}, data }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default exportJson;
