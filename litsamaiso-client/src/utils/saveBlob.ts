// Saves a downloaded file under the given name
export const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download after click() returns, so the URL is released a moment later
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
