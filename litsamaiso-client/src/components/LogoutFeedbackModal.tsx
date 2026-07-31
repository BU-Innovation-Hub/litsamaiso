import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import Button from './ui/button';

type LogoutFeedbackModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  closeLabel?: string;
};

export const LogoutFeedbackModal: React.FC<LogoutFeedbackModalProps> = ({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  title = 'Rate Litsamaiso',
  description = 'Help us improve your experience. Your rating is required, while the comment is optional.',
  submitLabel = 'Submit feedback & logout',
  closeLabel = 'Skip',
}) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submitDisabled = useMemo(() => rating < 1 || isSubmitting, [isSubmitting, rating]);

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    setRating(0);
    setComment('');
    onClose();
  };

  const handleSubmit = async () => {
    await onSubmit(rating, comment);
    setRating(0);
    setComment('');
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary-clr/80">
              One-time feedback
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close feedback modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">How would you rate Litsamaiso?</label>
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                const filled = rating >= value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="rounded-full p-1 text-amber-400 transition hover:scale-105"
                    aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                  >
                    <Star className={`h-8 w-8 ${filled ? 'fill-current' : 'fill-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="logout-feedback-comment" className="mb-2 block text-sm font-semibold text-slate-700">
              Describe your experience (optional)
            </label>
            <textarea
              id="logout-feedback-comment"
              rows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Tell us what worked well, what needs improvement, or anything you would like to share..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary-clr focus:ring-2 focus:ring-primary-clr/20"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" type="button" onClick={handleClose} disabled={isSubmitting}>
            {closeLabel}
          </Button>
          <Button type="button" onClick={handleSubmit} className="bg-primary-clr hover:bg-black" disabled={submitDisabled}>
            {isSubmitting ? 'Submitting...' : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
