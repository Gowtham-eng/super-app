import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Storefront, CheckCircle, Clock, Plus, MagnifyingGlass } from '@phosphor-icons/react';

const AppCatalog = () => {
  const { API, getAuthHeader } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const response = await axios.get(`${API}/catalog/apps`, getAuthHeader());
      setApps(response.data);
    } catch (error) {
      toast.error('Failed to load app catalog');
    } finally {
      setLoading(false);
    }
  };

  const requestAccess = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for access');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/access-requests`, {
        app_id: selectedApp.id,
        reason: reason
      }, getAuthHeader());
      toast.success('Access request submitted!');
      setShowRequestModal(false);
      setReason('');
      setSelectedApp(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredApps = apps.filter(app =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#0051FF] flex items-center justify-center">
          <Storefront weight="bold" className="text-white w-6 h-6" />
        </div>
        <div>
          <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">App Catalog</h1>
          <p className="text-zinc-500">Browse and request access to applications</p>
        </div>
      </div>

      {/* Search */}
      <div className="card-brutalist p-4 mb-6">
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search applications..."
            className="input-brutalist w-full pl-10"
          />
        </div>
      </div>

      {/* Apps Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredApps.map((app) => (
          <div key={app.id} className="card-brutalist p-6" data-testid={`catalog-app-${app.id}`}>
            <div className="flex items-start gap-4">
              {app.logo_url ? (
                <img src={app.logo_url} alt={app.name} className="w-12 h-12 object-contain" />
              ) : (
                <div className={`w-12 h-12 flex items-center justify-center text-white font-bold ${
                  app.type === 'saml' ? 'bg-[#0051FF]' : 'bg-[#00CC66]'
                }`}>
                  {app.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate">{app.name}</h3>
                <p className="text-xs text-zinc-500 uppercase">{app.type}</p>
              </div>
            </div>
            
            {app.description && (
              <p className="text-sm text-zinc-600 mt-3 line-clamp-2">{app.description}</p>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between">
              {app.has_access ? (
                <div className="flex items-center gap-2 text-[#00CC66]">
                  <CheckCircle size={18} weight="fill" />
                  <span className="text-sm font-semibold">Access Granted</span>
                </div>
              ) : app.requires_approval ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  <Clock size={18} />
                  <span className="text-sm">Requires Approval</span>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">Open Access</div>
              )}

              {!app.has_access && app.requires_approval && (
                <Button
                  onClick={() => { setSelectedApp(app); setShowRequestModal(true); }}
                  className="btn-primary py-2 px-4 text-sm"
                >
                  <Plus size={16} className="mr-1" /> Request
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Request Access Modal */}
      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Access to {selectedApp?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="label-uppercase">Reason for Access *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why you need access to this application..."
                rows={4}
                className="input-brutalist w-full mt-1"
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowRequestModal(false)} className="btn-secondary flex-1">
                Cancel
              </Button>
              <Button onClick={requestAccess} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppCatalog;
