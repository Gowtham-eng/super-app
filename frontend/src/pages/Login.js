import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import { ShieldCheck, Eye, EyeSlash, Buildings, Plus } from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Login = () => {
  const [mode, setMode] = useState('login'); // login, register, create-org
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: '', domain: '', description: '' });
  
  const { login, register, createOrganization } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get(`${API}/organizations`);
      setOrganizations(response.data);
      if (response.data.length > 0) {
        setSelectedOrg(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        if (!selectedOrg) {
          toast.error('Please select or create an organization');
          setLoading(false);
          return;
        }
        await register(email, password, name, selectedOrg);
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

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    try {
      const newOrg = await createOrganization(orgForm.name, orgForm.domain, orgForm.description);
      setOrganizations([...organizations, newOrg]);
      setSelectedOrg(newOrg.id);
      setShowOrgModal(false);
      setOrgForm({ name: '', domain: '', description: '' });
      toast.success('Organization created!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create organization');
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
              Kissflow IAM
            </h1>
            <p className="text-xs text-zinc-500 uppercase tracking-[0.1em]">Identity & Access Management</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 shadow-lg">
          {/* Tabs */}
          <div className="flex border-b border-zinc-200">
            <button
              type="button"
              onClick={() => setMode('login')}
              data-testid="login-tab"
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-[0.1em] transition-colors ${
                mode === 'login' ? 'text-[#0051FF] border-b-2 border-[#0051FF] bg-zinc-50' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              data-testid="register-tab"
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-[0.1em] transition-colors ${
                mode === 'register' ? 'text-[#0051FF] border-b-2 border-[#0051FF] bg-zinc-50' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {mode === 'register' && (
              <>
                <div>
                  <Label className="label-uppercase">Full Name</Label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    data-testid="name-input"
                    className="input-brutalist w-full mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="label-uppercase">Organization</Label>
                    <button
                      type="button"
                      onClick={() => setShowOrgModal(true)}
                      className="text-xs text-[#0051FF] hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} /> New Org
                    </button>
                  </div>
                  <select
                    value={selectedOrg}
                    onChange={(e) => setSelectedOrg(e.target.value)}
                    required
                    data-testid="org-select"
                    className="input-brutalist w-full py-2"
                  >
                    <option value="">Select organization...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              </>
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
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} data-testid="submit-button" className="btn-primary w-full">
              {loading ? <span className="spinner mr-2" /> : null}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-6">
          Enterprise Identity & Access Management for Kissflow
        </p>
      </div>

      {/* Create Organization Modal */}
      <Dialog open={showOrgModal} onOpenChange={setShowOrgModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Buildings size={20} /> Create Organization
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div>
              <Label className="label-uppercase">Organization Name *</Label>
              <Input
                type="text"
                value={orgForm.name}
                onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                placeholder="Acme Corporation"
                required
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div>
              <Label className="label-uppercase">Domain *</Label>
              <Input
                type="text"
                value={orgForm.domain}
                onChange={(e) => setOrgForm({ ...orgForm, domain: e.target.value })}
                placeholder="acme.com"
                required
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div>
              <Label className="label-uppercase">Description</Label>
              <Input
                type="text"
                value={orgForm.description}
                onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                placeholder="Optional description"
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" onClick={() => setShowOrgModal(false)} className="btn-secondary flex-1">
                Cancel
              </Button>
              <Button type="submit" className="btn-primary flex-1">
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
