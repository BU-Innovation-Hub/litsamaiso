import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ThemePicker } from '@/theme/ThemePicker';
import { WorkspacePreview } from '@/theme/WorkspacePreview';
import { defaultTheme, validateTheme, type InstitutionTheme } from '@/theme/palette';
import { billingService } from '@/services/billingService';
import { profileService } from '@/services/profileService';
import { authService } from '@/services/authService';
import { getApiErrorMessage } from '@/utils/apiError';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const BrandingSettingsPage = () => {
  const { user, setUser } = useAuth();
  const institution = user?.institution;
  const [theme, setTheme] = useState<InstitutionTheme>(institution?.theme ?? defaultTheme());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const valid = validateTheme(theme).length === 0;

  const handleLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logos must be 2 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await profileService.uploadProfileImage(file);
      setTheme((current) => ({ ...current, logoUrl: url }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Logo upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () =>
    setTheme((current) => {
      const next = { ...current };
      delete next.logoUrl;
      return next;
    });

  const save = async () => {
    if (!user || !institution) return;
    setSaving(true);
    try {
      const updated = await billingService.updateTheme(theme);
      const nextUser = { ...user, institution: { ...institution, ...updated } };
      authService.updateStoredUser(nextUser);
      setUser(nextUser);
      toast.success('Branding updated for everyone in your institution');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save branding'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-clr">Branding</h1>
          <p className="mt-1 text-sm text-slate-500">
            How Litsamaiso looks for everyone at {institution?.name ?? 'your institution'} once they sign in.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !valid}
          className="rounded-lg bg-active-clr px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-5" data-tour="branding-logo">
            <p className="text-sm font-semibold text-slate-900">Logo</p>
            <p className="mt-1 text-sm text-slate-500">Shown in the sidebar. A square PNG or SVG works best.</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img src={theme.logoUrl || '/logo-1.png'} alt="" className="h-10 w-10 object-contain" />
              </span>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload logo'}
              </button>
              {theme.logoUrl && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </div>
          </section>
          <div data-tour="branding-theme">
            <ThemePicker value={theme} onChange={setTheme} />
          </div>
        </div>
        <div className="xl:sticky xl:top-8 xl:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
          <WorkspacePreview theme={theme} institutionName={institution?.name} logoUrl={theme.logoUrl} />
        </div>
      </div>
    </div>
  );
};

export default BrandingSettingsPage;
