import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../utils/apiError';
import PasswordInput from '../components/ui/PasswordInput';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const role = 'Student';
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    studentId: '',
  });
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
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

  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      toast.error('Please confirm you have read the financial information consent.');
      return;
    }

    setShowConsentModal(false);

    try {
      await register({
        email: formData.email,
        password: formData.password,
        role,
        studentId: formData.studentId || undefined,
        financialInfoConsent: true,
      });

      toast.success('Account created successfully! Please sign in.');
      navigate('/login');
    } catch (error: unknown) {
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

            {isLoading ? (
              <div className="flex w-full items-center justify-center rounded-md bg-button py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              </div>
            ) : (
              <button
                type="submit"
                className="w-full rounded-lg bg-button py-3 font-semibold text-white"
              >
                Create Account
              </button>
            )}
          </form>

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
                    disabled={isLoading}
                    className="rounded-md bg-button px-4 py-2 font-semibold text-white transition-colors hover:bg-active disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Account...' : 'I Agree & Continue'}
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
