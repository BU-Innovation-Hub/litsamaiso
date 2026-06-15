import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '../services/authService';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      // If no token/email in query, redirect to forgot page
      navigate('/forgot-password');
    }
  }, [token, email, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const resp = await authService.resetPassword(email, token, password);
      toast.success(resp?.message || 'Password updated successfully');
      navigate('/login');
    } catch (err: unknown) {
      toast.error('Failed to reset password');
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
            <h1 className="text-2xl font-semibold text-primary-clr">Choose a new password</h1>
            <p className="mb-6 text-sm text-gray-500">Enter your new password below to update your account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">New password</label>
              <input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter new password" required />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm password</label>
              <input name="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" required />
            </div>

            {loading ? (
              <div className="flex w-full items-center justify-center rounded-md bg-button py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              </div>
            ) : (
              <button type="submit" className="w-full rounded-lg bg-button py-3 font-semibold text-white">Update password</button>
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

export default ResetPasswordPage;
