import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { toast } from 'sonner';
import { Compass, Palette, Users, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import { tourService } from '../services/tourService';
import { getInstitutionName, getRoleName } from '../utils/userDisplay';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import type { User } from '../types';
import { TourContext } from './tourContext';
import { getTourForRole, TOUR_VERSION, type TourChapter } from './tourSteps';

const ELEMENT_WAIT_MS = 5000;

const isVisible = (element: Element) => element.getClientRects().length > 0;

/** First visible match (e.g. the desktop sidebar is hidden on phones). */
const findVisible = (selector: string) => Array.from(document.querySelectorAll(selector)).find(isVisible);

/** Pages load data asynchronously, so give anchors a moment to appear. */
const waitForElement = (selector: string | undefined) =>
  new Promise<void>((resolve) => {
    if (!selector) return resolve();
    const started = Date.now();
    const check = () => {
      if (findVisible(selector) || Date.now() - started > ELEMENT_WAIT_MS) resolve();
      else window.setTimeout(check, 100);
    };
    check();
  });

const shouldOfferTour = (user: User | null) => {
  const tour = user?.tour;
  if (!tour) return true;
  if ((tour.version ?? 0) < TOUR_VERSION) return true;
  return !tour.completedAt && !tour.dismissedAt;
};

const highlights = [
  { icon: Users, text: 'Invite your Finance, Registry and SAAD teams' },
  { icon: Wallet, text: 'Import students and track account confirmations' },
  { icon: Palette, text: 'Brand your workspace and manage billing' },
];

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const chapters = useMemo(() => getTourForRole(getRoleName(user)), [user]);
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => Boolean(chapters) && location.pathname === '/dashboard' && shouldOfferTour(user),
  );
  const justOnboarded = searchParams.get('welcome') === '1';

  const driverRef = useRef<Driver | null>(null);
  // Chapters hand off to each other through this ref (the callback is recursive).
  const runChapterRef = useRef<(tour: TourChapter[], index: number, startAt?: 'first' | 'last') => Promise<void>>(
    async () => undefined,
  );
  const userRef = useRef(user);
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    userRef.current = user;
    pathRef.current = location.pathname;
  });

  const record = useCallback(
    (action: 'completed' | 'dismissed') => {
      const current = userRef.current;
      if (!current) return;
      const stamp = new Date().toISOString();
      const next: User = {
        ...current,
        tour: {
          ...current.tour,
          ...(action === 'completed' ? { completedAt: stamp } : { dismissedAt: stamp }),
          version: TOUR_VERSION,
        },
      };
      authService.updateStoredUser(next);
      setUser(next);
      tourService.update(action, TOUR_VERSION).catch(() => undefined);
    },
    [setUser],
  );

  const finish = useCallback(
    (action: 'completed' | 'dismissed') => {
      driverRef.current?.destroy();
      driverRef.current = null;
      record(action);
      if (action === 'completed') {
        toast.success('Tour complete! Replay it any time from “Take the tour” in the sidebar.');
      }
    },
    [record],
  );

  const runChapter = useCallback(
    async (tour: TourChapter[], chapterIndex: number, startAt: 'first' | 'last' = 'first') => {
      const chapter = tour[chapterIndex];
      if (!chapter) return;
      driverRef.current?.destroy();

      if (pathRef.current !== chapter.route) navigate(chapter.route);
      await waitForElement(chapter.steps.find((step) => step.element)?.element);

      const total = tour.reduce((sum, item) => sum + item.steps.length, 0);
      const offset = tour.slice(0, chapterIndex).reduce((sum, item) => sum + item.steps.length, 0);
      const isFinalChapter = chapterIndex === tour.length - 1;

      const steps: DriveStep[] = chapter.steps.map((step, index) => {
        const element = step.element ? findVisible(step.element) : undefined;
        const globalIndex = offset + index;
        return {
          ...(element ? { element } : {}),
          popover: {
            title: step.title,
            description: step.description,
            side: step.side,
            align: 'start',
            progressText: `${globalIndex + 1} of ${total}`,
            showButtons: globalIndex === 0 ? ['next', 'close'] : ['next', 'previous', 'close'],
            nextBtnText: isFinalChapter && index === chapter.steps.length - 1 ? 'Finish' : 'Next',
          },
        };
      });

      const instance = driver({
        steps,
        showProgress: true,
        allowClose: true,
        overlayColor: 'rgb(2, 6, 24)',
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: 'litsamaiso-tour',
        prevBtnText: 'Back',
        onNextClick: (_element, _step, { driver: active }) => {
          if (!active.isLastStep()) return active.moveNext();
          if (isFinalChapter) return finish('completed');
          void runChapterRef.current(tour, chapterIndex + 1);
        },
        onPrevClick: (_element, _step, { driver: active }) => {
          if (active.getActiveIndex() === 0 && chapterIndex > 0) {
            void runChapterRef.current(tour, chapterIndex - 1, 'last');
            return;
          }
          active.movePrevious();
        },
        // Close button, Escape or overlay click.
        onDestroyStarted: () => finish('dismissed'),
      });
      driverRef.current = instance;
      instance.drive(startAt === 'last' ? steps.length - 1 : 0);
    },
    [finish, navigate],
  );

  useEffect(() => {
    runChapterRef.current = runChapter;
  }, [runChapter]);

  const start = useCallback(() => {
    if (!chapters) return;
    setWelcomeOpen(false);
    void runChapter(chapters, 0);
  }, [chapters, runChapter]);

  const skip = () => {
    setWelcomeOpen(false);
    record('dismissed');
    toast('No problem — start the tour any time from “Take the tour” in the sidebar.');
  };

  useEffect(() => () => driverRef.current?.destroy(), []);

  const value = useMemo(() => ({ available: Boolean(chapters), start }), [chapters, start]);
  const institutionName = getInstitutionName(user);

  return (
    <TourContext.Provider value={value}>
      {children}
      <Dialog open={welcomeOpen} onOpenChange={(open) => !open && skip()}>
        <DialogContent className="max-w-md p-0" hideClose>
          <div className="rounded-t-2xl bg-primary-clr px-6 pb-6 pt-8 text-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Compass className="h-6 w-6" />
            </span>
            <DialogTitle className="mt-5 text-2xl font-bold text-white">
              {justOnboarded ? `Welcome aboard${institutionName ? `, ${institutionName}` : ''}!` : 'Take a quick tour?'}
            </DialogTitle>
            <DialogDescription className="mt-2 text-white/75">
              {justOnboarded
                ? 'Your workspace is live and you’re its Institution Admin. Here’s a two-minute tour of the essentials.'
                : 'A two-minute walkthrough of the essentials for Institution Admins.'}
            </DialogDescription>
          </div>
          <div className="p-6">
            <ul className="space-y-3">
              {highlights.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-primary-clr">
                    <Icon className="h-4 w-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={skip}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={start}
                className="rounded-lg bg-active-clr px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Take the tour
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">You can replay it any time from the sidebar.</p>
          </div>
        </DialogContent>
      </Dialog>
    </TourContext.Provider>
  );
};
