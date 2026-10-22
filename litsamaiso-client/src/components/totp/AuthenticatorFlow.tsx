import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import TotpCodeForm from './TotpCodeForm';
import TotpEnrollment from './TotpEnrollment';
import { totpService, type TotpEnrollment as Enrollment } from '../../services/totpService';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';

type AuthenticatorFlowProps = {
  // 'unlock': prove it's the student before the camera opens (setting up the app first if needed).
  // 'move': confirm the current app, then set up a new one, e.g. on a new phone.
  mode: 'unlock' | 'move';
  totpEnabled: boolean;
  onStatusChange: (enabled: boolean) => void;
  // 'unlock' only: the grant that lets one profile photo be saved
  onUnlocked?: (captureGrant: string) => void;
  // 'move' only
  onMoved?: () => void;
};

type Step = 'code' | 'enroll';

const AuthenticatorFlow: React.FC<AuthenticatorFlowProps> = ({
  mode,
  totpEnabled,
  onStatusChange,
  onUnlocked,
  onMoved,
}) => {
  // A first-time setup has nothing to confirm, so the QR code is fetched as soon as this opens.
  // Read once: later status changes are handled by the step handlers.
  const [setupOnOpen] = useState(mode === 'unlock' && !totpEnabled);
  const [step, setStep] = useState<Step>(setupOnOpen ? 'enroll' : 'code');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loadingEnrollment, setLoadingEnrollment] = useState(setupOnOpen);
  const [busy, setBusy] = useState(false);

  const startEnrollment = async (currentCode?: string) => {
    setLoadingEnrollment(true);
    try {
      setEnrollment(await totpService.startProfileEnrollment(currentCode));
      setStep('enroll');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Your authenticator setup could not be started'));
    } finally {
      setLoadingEnrollment(false);
    }
  };

  useEffect(() => {
    if (!setupOnOpen) return undefined;
    let cancelled = false;
    totpService
      .startProfileEnrollment()
      .then((next) => {
        if (!cancelled) setEnrollment(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getApiErrorMessage(error, 'Your authenticator setup could not be started'));
      })
      .finally(() => {
        if (!cancelled) setLoadingEnrollment(false);
      });
    // Closing the dialog before the QR code arrives drops the response
    return () => {
      cancelled = true;
    };
  }, [setupOnOpen]);

  // Codes are checked on the server; the app may have been reset by an admin since the page loaded
  const handleNotEnrolled = async () => {
    onStatusChange(false);
    toast.info('Set up your authenticator app to continue.');
    await startEnrollment();
  };

  const handleCode = async (code: string) => {
    setBusy(true);
    try {
      if (mode === 'unlock') {
        onUnlocked?.(await totpService.unlockPhotoCapture(code));
      } else {
        await startEnrollment(code);
      }
    } catch (error) {
      if (getApiErrorCode(error) === 'TOTP_NOT_ENROLLED') {
        await handleNotEnrolled();
        return;
      }
      toast.error(getApiErrorMessage(error, 'Your code could not be checked'));
    } finally {
      setBusy(false);
    }
  };

  const handleEnrollmentCode = async (code: string) => {
    if (!enrollment) return;
    setBusy(true);
    try {
      const captureGrant = await totpService.enableProfileTotp(enrollment.enrollmentToken, code);
      onStatusChange(true);
      toast.success(mode === 'move' ? 'Your authenticator app was moved' : 'Authenticator app set up');
      if (mode === 'unlock') onUnlocked?.(captureGrant);
      else onMoved?.();
    } catch (error) {
      const errorCode = getApiErrorCode(error);
      if (errorCode === 'TOTP_ENROLLMENT_EXPIRED') {
        toast.warning('That setup expired. Scan the new QR code.');
        await startEnrollment();
        return;
      }
      if (errorCode === 'TOTP_ALREADY_ENROLLED') {
        onStatusChange(true);
        setEnrollment(null);
        setStep('code');
        toast.info('Your authenticator app is already set up. Enter a code from it.');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Your authenticator app could not be set up'));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'enroll') {
    return (
      <TotpEnrollment
        enrollment={enrollment}
        loading={loadingEnrollment}
        busy={busy}
        submitLabel={mode === 'unlock' ? 'Confirm and open camera' : 'Confirm new app'}
        onConfirm={handleEnrollmentCode}
        // Moving needs a fresh code from the old app, so a new QR code restarts from that step
        onRegenerate={mode === 'unlock' ? () => void startEnrollment() : () => setStep('code')}
      />
    );
  }

  return (
    <TotpCodeForm
      onSubmit={handleCode}
      busy={busy || loadingEnrollment}
      submitLabel={mode === 'unlock' ? 'Open camera' : 'Continue'}
      label={mode === 'unlock' ? 'Authenticator code' : 'Code from your current app'}
    />
  );
};

export default AuthenticatorFlow;
