import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft } from 'lucide-react';
import { getApiErrorCode, getApiErrorMessage } from '../utils/apiError';
import PasswordInput from '../components/ui/PasswordInput';
import TotpEnrollment from '../components/totp/TotpEnrollment';
import { totpService, type TotpEnrollment as Enrollment } from '../services/totpService';

// A setup this close to expiring is replaced rather than reused, so the student has time to type a code
const ENROLLMENT_REUSE_MARGIN_MS = 60 * 1000;

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const role = 'Student';
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    studentId: '',
  });
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  // Students whose institution uses an authenticator app set it up after the details step;
  // it's needed to take their profile photo
  const [step, setStep] = useState<'details' | 'authenticator'>('details');
  const [enrollment, setEnrollment] = useState<(Enrollment & { email: string }) | null>(null);
  const [preparingAuthenticator, setPreparingAuthenticator] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const consentModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showConsentModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConsentModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConsentModal]);

  useEffect(() => {
    if (showConsentModal) {
      consentModalRef.current?.focus();
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showConsentModal]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!formData.studentId.trim()) {
      toast.error('Enter the student ID your institution registered');
      return;
    }

    setConsentChecked(false);
    setShowConsentModal(true);
  };

  // The setup is tied to the email, so it's kept while the student only fixes other details
  const prepareAuthenticator = async (forceNew = false): Promise<boolean> => {
    const email = formData.email.trim().toLowerCase();
    const reusable =
      !forceNew &&
      enrollment?.email === email &&
      Date.parse(enrollment.expiresAt) - Date.now() > ENROLLMENT_REUSE_MARGIN_MS;
    if (reusable) return true;

    setPreparingAuthenticator(true);
    try {
      const next = await totpService.startRegistrationEnrollment(email);
      setEnrollment({ ...next, email });
      return true;
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Your authenticator setup could not be started'));
      return false;
    } finally {
      setPreparingAuthenticator(false);
    }
  };

  const submitRegistration = async (totp?: { totpEnrollmentToken: string; totpCode: string }) => {
    setSubmitting(true);
    try {
      await register({
        email: formData.email,
        password: formData.password,
        role,
        studentId: formData.studentId || undefined,
        financialInfoConsent: true,
        ...totp,
      });
    } finally {
      setSubmitting(false);
    }

    toast.success('Account created successfully! Please sign in.');
    navigate('/login');
  };

  // Only the server knows the student's institution, so it decides whether the authenticator step
  // is needed. It answers TOTP_REQUIRED only after the student's details have passed its checks.
  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      toast.error('Please confirm you have read the financial information consent.');
      return;
    }

    setShowConsentModal(false);
    try {
      await submitRegistration();
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'TOTP_REQUIRED') {
        if (await prepareAuthenticator()) setStep('authenticator');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Registration failed'));
    }
  };

  // The code is sent with the registration, so it's checked while it's still current
  const handleRegister = async (totpCode: string) => {
    if (!enrollment) return;
    try {
      await submitRegistration({ totpEnrollmentToken: enrollment.enrollmentToken, totpCode });
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'TOTP_ENROLLMENT_EXPIRED') {
        toast.warning('That setup expired. Remove the old entry from your app and scan the new QR code.');
        await prepareAuthenticator(true);
        return;
      }
      toast.error(getApiErrorMessage(error, 'Registration failed'));
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-left-content">
            <span className="small-title">Innovation Hub</span>
            <div className="hidden md:block">
              <h2>
                Get
                <br />
                Everything
                <br />
                You Want
              </h2>
              <p>
                You can get everything you want if you work hard,
                <br />
                trust the process, and stick to the plan.
              </p>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="logo mb-5 mt-5 md:mt-0">
            <img src="/logo-1.png" alt="Logo" width={35} height={35} />
            <h3 className="text-2xl font-semibold text-primary-clr">
              Litsamaiso
            </h3>
          </div>

          {step === 'authenticator' ? (
            <>
              <div className="auth-header">
                <h1 className="text-2xl font-semibold text-primary-clr">
                  Set Up Your Authenticator
                </h1>
                <p className="mb-6 text-sm text-gray-500">
                  You'll enter a code from this app whenever you take or change your profile
                  photo. That photo is what your face is checked against when you vote.
                </p>
              </div>

              <TotpEnrollment
                enrollment={enrollment}
                loading={preparingAuthenticator}
                busy={submitting}
                submitLabel="Create Account"
                onConfirm={handleRegister}
                onRegenerate={() => void prepareAuthenticator(true)}
              />

              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={submitting}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-clr disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to your details
              </button>
            </>
          ) : (
            <>
              <div className="auth-header">
                <h1 className="text-2xl font-semibold text-primary-clr">
                  Create an Account
                </h1>
                <p className="mb-6 text-sm text-gray-500">
                  Please complete all fields to gain access to the system.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Your email address"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Student ID Number</label>
                  <input
                    name="studentId"
                    value={formData.studentId}
                    onChange={handleChange}
                    placeholder="e.g. 2230694"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <PasswordInput
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <PasswordInput
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    required
                  />
                </div>

                {preparingAuthenticator || submitting ? (
                  <div className="flex w-full items-center justify-center rounded-md bg-button py-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-button py-3 font-semibold text-white"
                  >
                    Continue
                  </button>
                )}
              </form>
            </>
          )}

          {showConsentModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="financial-consent-title"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setShowConsentModal(false);
                }
              }}
            >
              <div
                ref={consentModalRef}
                tabIndex={-1}
                className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl outline-none"
              >
                <h2
                  id="financial-consent-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Financial Information Consent
                </h2>

                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  <p>By continuing, I confirm that:</p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      The financial information I provide to Litsamaiso is true,
                      complete, and accurate to the best of my knowledge.
                    </li>
                    <li>
                      This information will be used by Litsamaiso in partnership
                      with my Institution to assess and manage my student account.
                    </li>
                    <li>
                      Submitting false or misleading information may delay,
                      restrict, or invalidate my registration.
                    </li>
                  </ul>
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-md border border-gray-300 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(event) => setConsentChecked(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary-clr"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    I have read and agree to provide true and accurate financial
                    information.
                  </span>
                </label>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConsentModal(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConsentSubmit}
                    disabled={preparingAuthenticator}
                    className="rounded-md bg-button px-4 py-2 font-semibold text-white transition-colors hover:bg-active disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {preparingAuthenticator ? 'Preparing...' : 'I Agree & Continue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link className="font-bold text-primary-clr" to="/login">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
