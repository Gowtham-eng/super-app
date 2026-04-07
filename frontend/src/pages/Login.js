import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { ShieldCheck, Eye, EyeSlash } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(email, password, name);
        toast.success('Account created successfully!');
      }
      navigate('/');
    } catch (error) {
      const message = error.response?.data?.detail || 'Authentication failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen blueprint-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fadeIn">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="font-heading font-black text-2xl tracking-tight text-zinc-900">
              Kissflow SSO
            </h1>
            <p className="text-xs text-zinc-500 uppercase tracking-[0.1em]">Identity Provider</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 shadow-lg">
          {/* Tabs */}
          <div className="flex border-b border-zinc-200">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              data-testid="login-tab"
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-[0.1em] transition-colors ${
                isLogin 
                  ? 'text-[#0051FF] border-b-2 border-[#0051FF] bg-zinc-50' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              data-testid="register-tab"
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-[0.1em] transition-colors ${
                !isLogin 
                  ? 'text-[#0051FF] border-b-2 border-[#0051FF] bg-zinc-50' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {!isLogin && (
              <div>
                <Label className="label-uppercase">Full Name</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  required={!isLogin}
                  data-testid="name-input"
                  className="input-brutalist w-full mt-1"
                />
              </div>
            )}

            <div>
              <Label className="label-uppercase">Email Address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                required
                data-testid="email-input"
                className="input-brutalist w-full mt-1"
              />
            </div>

            <div>
              <Label className="label-uppercase">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  data-testid="password-input"
                  className="input-brutalist w-full mt-1 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  data-testid="toggle-password"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              data-testid="submit-button"
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="spinner" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="px-6 pb-6">
            <p className="text-center text-xs text-zinc-500">
              {isLogin 
                ? "Don't have an account? " 
                : "Already have an account? "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-[#0051FF] hover:underline font-semibold"
              >
                {isLogin ? 'Register' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>

        {/* Info */}
        <p className="text-center text-xs text-zinc-400 mt-6">
          Configure SAML & OpenID Connect for Kissflow
        </p>
      </div>
    </div>
  );
};

export default Login;
