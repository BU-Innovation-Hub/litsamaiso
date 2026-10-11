import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { Hint } from '../components/ui/tooltip';
import {
  ACCENT_SWATCHES,
  CUSTOM_PRESET_ID,
  PRIMARY_SWATCHES,
  THEME_PRESETS,
  mix,
  validateTheme,
  type InstitutionTheme,
  type SurfaceMode,
} from './palette';

interface ThemePickerProps {
  value: InstitutionTheme;
  onChange: (theme: InstitutionTheme) => void;
}

/** 60/30/10 proportion bar for a colour trio. */
const RatioBar: React.FC<{ primary: string; accent: string; surface: SurfaceMode }> = ({ primary, accent, surface }) => (
  <div className="flex h-9 overflow-hidden rounded-lg border border-slate-200">
    <span style={{ flex: 6, background: surface === 'soft' ? mix('#ffffff', primary, 0.045) : '#f8fafc' }} />
    <span style={{ flex: 3, background: primary }} />
    <span style={{ flex: 1, background: accent }} />
  </div>
);

const Swatch: React.FC<{ color: string; selected: boolean; onClick: () => void; label: string }> = ({
  color,
  selected,
  onClick,
  label,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={selected}
    className={cn(
      'relative h-9 w-9 rounded-full border-2 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
      selected ? 'border-slate-900' : 'border-white shadow-[0_0_0_1px_rgb(226,232,240)]',
    )}
    style={{ background: color }}
  >
    {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />}
  </button>
);

export const ThemePicker: React.FC<ThemePickerProps> = ({ value, onChange }) => {
  const isCustom = value.preset === CUSTOM_PRESET_ID;
  const issues = validateTheme(value);

  const update = (patch: Partial<InstitutionTheme>) =>
    onChange({ ...value, ...patch, preset: CUSTOM_PRESET_ID });

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          Curated themes
          <Hint content="The 60-30-10 rule: 60% calm background, 30% your primary colour, 10% accent for the things you should click. It keeps interfaces balanced and readable." />
        </legend>
        <p className="mt-1 text-sm text-slate-500">Each theme is balanced for readability and follows the 60-30-10 rule.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {THEME_PRESETS.map((preset) => {
            const selected = value.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onChange({
                    preset: preset.id,
                    primary: preset.primary,
                    accent: preset.accent,
                    surface: preset.surface,
                    logoUrl: value.logoUrl,
                  })
                }
                aria-pressed={selected}
                className={cn(
                  'rounded-2xl border bg-white p-3 text-left transition hover:border-slate-400',
                  selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200',
                )}
              >
                <RatioBar primary={preset.primary} accent={preset.accent} surface={preset.surface} />
                <span className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{preset.name}</span>
                  {selected && <Check className="h-4 w-4 text-slate-900" />}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{preset.description}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => update({})}
            aria-pressed={isCustom}
            className={cn(
              'flex flex-col justify-between rounded-2xl border border-dashed bg-white p-3 text-left transition hover:border-slate-400',
              isCustom ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-300',
            )}
          >
            <RatioBar primary={value.primary} accent={value.accent} surface={value.surface} />
            <span className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4" /> Custom
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">Mix your own from brand-safe colours.</span>
          </button>
        </div>
      </fieldset>

      {isCustom && (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">
              Primary colour <span className="font-normal text-slate-500">— 30%: sidebar, headings</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {PRIMARY_SWATCHES.map((color) => (
                <Swatch
                  key={color}
                  color={color}
                  label={`Primary ${color}`}
                  selected={value.primary.toLowerCase() === color.toLowerCase()}
                  onClick={() => update({ primary: color })}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">
              Accent colour <span className="font-normal text-slate-500">— 10%: buttons, active items</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {ACCENT_SWATCHES.map((color) => (
                <Swatch
                  key={color}
                  color={color}
                  label={`Accent ${color}`}
                  selected={value.accent.toLowerCase() === color.toLowerCase()}
                  onClick={() => update({ accent: color })}
                />
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">
          Background <span className="font-normal text-slate-500">— 60%: always a calm neutral</span>
        </legend>
        <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-white p-1">
          {(['light', 'soft'] as SurfaceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={value.surface === mode}
              onClick={() => {
                // A curated preset only stays "curated" with its own background.
                const preset = THEME_PRESETS.find((item) => item.id === value.preset);
                onChange({ ...value, surface: mode, preset: preset?.surface === mode ? preset.id : CUSTOM_PRESET_ID });
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                value.surface === mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {mode === 'light' ? 'Light' : 'Soft tint'}
            </button>
          ))}
        </div>
      </fieldset>

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          {issues.map((issue) => (
            <li key={issue.message}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
