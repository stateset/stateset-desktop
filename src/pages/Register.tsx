import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore, normalizeSandboxApiKey } from '../stores/auth';
import {
  Bot,
  Mail,
  Lock,
  User,
  Building,
  ArrowRight,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { registerUser, isValidEmail, validatePassword } from '../lib/registration';
import clsx from 'clsx';
import { usePageTitle } from '../hooks/usePageTitle';

export default function Register() {
  usePageTitle('Register');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');

  const { login, setSandboxApiKey, clearSandboxApiKey } = useAuthStore();
  const navigate = useNavigate();

  const passwordValidation = validatePassword(formData.password);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!formData.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    setIsLoading(true);

    try {
      const result = await registerUser({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        company: formData.company.trim() || undefined,
      });

      // Auto-set API key pair
      if (result.credentials) {
        // Set Engine API key via login
        await login(result.credentials.engine_api_key);

        // Set sandbox API key only when a real sandbox key is available
        const sandboxApiKey = normalizeSandboxApiKey(result.credentials.sandbox_api_key);
        if (sandboxApiKey) {
          await setSandboxApiKey(sandboxApiKey);
        } else {
          await clearSandboxApiKey();
        }
      }

      setStep('success');

      // Navigate to dashboard after brief delay
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <div className="h-10 drag-region" />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-600/20 flex items-center justify-center">
              <Check className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to StateSet!</h2>
            <p className="text-gray-400 mb-4">
              Your account has been created and API keys have been configured automatically.
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">Engine API key configured</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">Sandbox API key configured</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">Default brand created</span>
              </div>
            </div>
            <p className="text-gray-500 text-sm mt-4">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Drag region for title bar */}
      <div className="h-10 drag-region" />

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">StateSet</h1>
              <p className="text-gray-500 text-sm">AI Agent Desktop</p>
            </div>
          </div>

          {/* Registration Form */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">Create your account</h2>
            <p className="text-gray-400 text-sm mb-6">
              Get started with AI-powered agents in minutes
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Min. 8 characters"
                    className="w-full pl-10 pr-12 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {/* Password requirements */}
                {formData.password && (
                  <div className="mt-2 space-y-1">
                    {[
                      { check: formData.password.length >= 8, text: 'At least 8 characters' },
                      { check: /[A-Z]/.test(formData.password), text: 'One uppercase letter' },
                      { check: /[a-z]/.test(formData.password), text: 'One lowercase letter' },
                      { check: /[0-9]/.test(formData.password), text: 'One number' },
                    ].map((req, i) => (
                      <div
                        key={i}
                        className={clsx(
                          'flex items-center gap-2 text-xs',
                          req.check ? 'text-green-400' : 'text-gray-500'
                        )}
                      >
                        <Check className={clsx('w-3 h-3', !req.check && 'opacity-30')} />
                        {req.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Company (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company <span className="text-gray-500">(optional)</span>
                </label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    name="company"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="Acme Inc."
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span>{error}</span>
                    {error.includes('not yet available') && (
                      <div className="mt-2">
                        <Link to="/login" className="text-brand-400 hover:text-brand-300 underline">
                          Sign in with API key instead
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-gray-700 disabled:text-gray-400 rounded-lg font-medium transition-colors"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Benefits */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-3">What you'll get:</p>
              <div className="space-y-2">
                {[
                  'Engine API key (auto-configured)',
                  'Sandbox API key for Claude Code pods',
                  'Default brand with MCP integrations',
                ].map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                    <Check className="w-3 h-3 text-brand-400" />
                    {benefit}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sign in link */}
          <p className="text-center text-gray-500 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
