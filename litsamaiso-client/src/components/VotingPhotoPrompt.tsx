import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, ScanFace } from 'lucide-react';
import { cn } from '../lib/utils';

// What the profile page reads from the link: open the photo step, then go back to where they were
export interface PhotoSetupState {
  setupPhoto: true;
  returnTo?: string;
}

const actionClass =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-button px-5 text-sm font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-primary-clr active:scale-[0.99]';

export const TakePhotoLink: React.FC<{ returnTo?: string; className?: string }> = ({ returnTo, className }) => (
  <Link
    to="/profile"
    state={{ setupPhoto: true, returnTo } satisfies PhotoSetupState}
    className={cn(actionClass, className)}
  >
    <Camera className="h-4 w-4" aria-hidden="true" />
    Take my photo
  </Link>
);

// Links to the profile page, or opens the camera directly when it's already there
export const VotingPhotoPrompt: React.FC<{
  returnTo?: string;
  onTakePhoto?: () => void;
  className?: string;
}> = ({ returnTo, onTakePhoto, className }) => (
  <section
    className={cn(
      'animate-rise-in flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50/95 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between',
      className,
    )}
  >
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <ScanFace className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-primary-clr">Add your photo so you can vote</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          Voting checks your face against your profile photo. You only need to do this once.
        </p>
      </div>
    </div>
    {onTakePhoto ? (
      <button type="button" onClick={onTakePhoto} className={actionClass}>
        <Camera className="h-4 w-4" aria-hidden="true" />
        Take my photo
      </button>
    ) : (
      <TakePhotoLink returnTo={returnTo} />
    )}
  </section>
);
