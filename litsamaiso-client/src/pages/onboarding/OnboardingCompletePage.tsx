import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/authService';
import { onboardingService, onboardingStorage } from '@/services/onboardingService';

type Phase = 'working' | 'ready' | 'failed' | 'claimed' | 'missing' | 'timeout';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 30;

const checklist = ['Payment confirmed', 'Creating your workspace', 'Setting up your admin account', 'Applying your theme'];

const OnboardingCompletePage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [session] = useState(() => ({ sessionId: params.get('session_id'), stored: onboardingStorage.get() }));
  const [phase, setPhase] = useState<Phase>(session.sessionId && session.stored ? 'working' : 'missing');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const { sessionId, stored } = session;
    if (!sessionId || !stored) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async (attempt: number) => {
      if (cancelled) return;
      try {
        const result = await onboardingService.complete(stored, sessionId);
        if (cancelled) return;

        if (result.status === 'ready') {
          const adopted = authService.adoptSession({ message: 'Welcome', token: result.token, user: result.user });
          onboardingStorage.clear();
          setProgress(checklist.length);
          setPhase('ready');
          timer = window.setTimeout(() => {
            setUser(adopted.user);
            navigate('/dashboard?welcome=1', { replace: true });
          }, 1400);
          return;
        }
        if (result.status === 'failed' || result.status === 'claimed') {
          onboardingStorage.clear();
          setMessage(result.message);
          setPhase(result.status);
          return;
        }
      } catch {
        // Transient errors are retried until the attempt budget runs out.
      }

      if (attempt >= MAX_ATTEMPTS) {
        setPhase('timeout');
        return;
      }
      setProgress((value) => Math.min(value + 1, checklist.length - 1));
      timer = window.setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS);
    };

    void poll(1);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [navigate, session, setUser]);

  const working = phase === 'working' || phase === 'ready';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-12 text-white">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center"
      >
        <div
          className={cn(
            'mx-auto flex h-20 w-20 items-center justify-center rounded-full',
            phase === 'ready' ? 'bg-emerald-500' : working ? 'bg-white/10' : 'bg-amber-500/20',
          )}
        >
          {phase === 'ready' ? (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              <Check className="h-10 w-10" />
            </motion.span>
          ) : working ? (
            <Loader2 className="h-9 w-9 animate-spin text-white/80" />
          ) : (
            <AlertCircle className="h-9 w-9 text-amber-300" />
          )}
        </div>

        {working && (
          <>
            <h1 className="mt-8 text-3xl font-semibold tracking-tight">
              {phase === 'ready' ? 'You’re all set' : 'Setting up your workspace'}
            </h1>
            <p className="mt-3 text-white/60">
              {phase === 'ready' ? 'Taking you to your dashboard…' : 'This usually takes a few seconds. Please keep this tab open.'}
            </p>
            <ul className="mx-auto mt-10 max-w-xs space-y-3 text-left">
              {checklist.map((item, index) => {
                const done = index < progress || phase === 'ready';
                return (
                  <li key={item} className={cn('flex items-center gap-3 text-sm transition', done ? 'text-white' : 'text-white/40')}>
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border',
                        done ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-white/20',
                      )}
                    >
                      {done && <Check className="h-3 w-3" />}
                    </span>
                    {item}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {!working && (
          <>
            <h1 className="mt-8 text-2xl font-semibold tracking-tight">
              {phase === 'claimed' ? 'Your workspace is ready' : 'Payment received'}
            </h1>
            <p className="mt-3 leading-7 text-white/70">
              {phase === 'missing' &&
                'We couldn’t find your onboarding session in this browser tab. If you completed payment, your workspace is being set up — sign in with your admin email in a minute, or contact support.'}
              {phase === 'timeout' &&
                'Setup is taking longer than expected. Your payment is safe. Try signing in with your admin email in a few minutes, or contact support if it still doesn’t work.'}
              {(phase === 'failed' || phase === 'claimed') && message}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/login" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white/90">
                Sign in
              </Link>
              <a
                href="mailto:support@litsamaiso.com?subject=Onboarding%20help"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Contact support
              </a>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default OnboardingCompletePage;
