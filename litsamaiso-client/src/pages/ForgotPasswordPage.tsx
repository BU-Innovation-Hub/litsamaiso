import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '../services/authService';

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await authService.forgotPassword(email);
      toast.success(resp?.message || 'If an account exists, a reset link was sent');
      navigate('/login');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      toast.error('Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-right">
          <div className="logo mb-5 mt-5 md:mt-0">
            <img src="/logo-1.png" alt="Logo" width={35} height={35} />
            <h3 className="text-2xl font-semibold text-primary-clr">Litsamaiso</h3>
          </div>

          <div className="auth-header">
            <h1 className="text-2xl font-semibold text-primary-clr">Reset your password</h1>
            <p className="mb-6 text-sm text-gray-500">Enter the email address for your account and we'll send a password reset link.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            {loading ? (
              <div className="flex w-full items-center justify-center rounded-md bg-button py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              </div>
            ) : (
              <button type="submit" className="w-full rounded-lg bg-button py-3 font-semibold text-white">Send reset link</button>
            )}
          </form>

          <p className="mt-4 text-center text-sm">
            Remembered your password?{' '}
            <button className="font-bold text-primary-clr" onClick={() => navigate('/login')}>Sign in</button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
