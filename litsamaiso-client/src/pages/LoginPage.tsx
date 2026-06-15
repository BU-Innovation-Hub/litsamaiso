import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../utils/apiError";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await login(formData.email, formData.password, formData.rememberMe);
      toast.success("Signed in successfully!");
      navigate("/dashboard");
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Login failed"));
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
              Welcome Back to the Litsamaiso
            </h1>
            <p className="mb-6 text-sm text-gray-500">
              Please fill all fields to gain access to the system.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Username</label>
              <input
                name="email"
                type="text"
                value={formData.email}
                onChange={handleChange}
                placeholder="Your email address or student ID"
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

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="h-4 w-4 cursor-pointer"
              />
              Remember me for 30 days
            </label>

            {isLoading ? (
              <div className="flex w-full items-center justify-center rounded-md bg-button py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              </div>
            ) : (
              <button
                type="submit"
                className="w-full rounded-lg bg-button py-3 font-semibold text-white"
              >
                Sign in
              </button>
            )}
          </form>

          <div className="relative mt-2 text-center text-sm">
            <p className="absolute right-0">
              <Link
                className="font-bold text-primary-clr"
                to="/forgot-password"
              >
                Forgot password?
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center text-sm">
            <p>
              Don't have an account yet?{" "}
              <Link className="font-bold text-primary-clr" to="/register">
                Register here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
