import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getApiErrorMessage } from '../utils/apiError';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const role = 'Student';
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    studentId: '',
    borrowerNumber: '',
  });

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

    if (!formData.borrowerNumber.trim()) {
      toast.error("Enter your NMDS borrower's number");
      return;
    }

    if (!/^\d{12}$/.test(formData.borrowerNumber.trim())) {
      toast.error('Borrower number must be exactly 12 digits');
      return;
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
        role,
        studentId: formData.studentId || undefined,
        borrowerNumber: formData.borrowerNumber || undefined,
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
              <label className="text-sm font-medium">Register As</label>
              <input
                type="text"
                value="Student"
                disabled
              />
            </div>

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
              <label className="text-sm font-medium">NMDS Borrower's Number</label>
              <input
                name="borrowerNumber"
                value={formData.borrowerNumber}
                onChange={handleChange}
                placeholder="e.g. 202211001706"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <input
                name="confirmPassword"
                type="password"
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
