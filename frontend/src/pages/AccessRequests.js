import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { ClipboardText, CheckCircle, XCircle, Clock, MagnifyingGlass } from '@phosphor-icons/react';

const AccessRequests = () => {
  const { API, getAuthHeader } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => { fetchRequests(); }, [filter]);

  const fetchRequests = async () => {
    try {
      const url = filter ? `${API}/access-requests?status=${filter}` : `${API}/access-requests`;
      const response = await axios.get(url, getAuthHeader());
      setRequests(response.data);
    } catch (error) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId, action) => {
    try {
      await axios.put(`${API}/access-requests/${requestId}?action=${action}`, {}, getAuthHeader());
      toast.success(`Request ${action}d`);
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process request');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle size={18} weight="fill" className="text-[#00CC66]" />;
      case 'rejected': return <XCircle size={18} weight="fill" className="text-[#FF3333]" />;
      default: return <Clock size={18} className="text-[#FFB800]" />;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-[#FFB800]/10 text-[#FFB800]',
      approved: 'bg-[#00CC66]/10 text-[#00CC66]',
      rejected: 'bg-[#FF3333]/10 text-[#FF3333]'
    };
    return <span className={`text-xs font-bold uppercase px-2 py-1 ${styles[status]}`}>{status}</span>;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FFB800] flex items-center justify-center">
            <ClipboardText weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-heading font-black text-3xl tracking-tight text-zinc-900">Access Requests</h1>
            <p className="text-zinc-500">{requests.length} requests</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {['pending', 'approved', 'rejected', ''].map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === status ? 'bg-[#0051FF] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card-brutalist p-12 text-center">
          <ClipboardText size={48} className="text-zinc-300 mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">No Requests</h3>
          <p className="text-zinc-500">No {filter || ''} access requests found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div key={req.id} className="card-brutalist p-6" data-testid={`request-${req.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {getStatusIcon(req.status)}
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold">{req.user_name}</h3>
                      {getStatusBadge(req.status)}
                    </div>
                    <p className="text-sm text-zinc-500">{req.user_email}</p>
                    <div className="mt-2">
                      <span className="text-sm">Requesting access to: </span>
                      <span className="font-semibold">{req.app_name}</span>
                      <span className="text-xs text-zinc-500 ml-2">({req.app_type})</span>
                    </div>
                    <p className="text-sm text-zinc-600 mt-2 bg-zinc-50 p-2 border-l-2 border-zinc-200">
                      "{req.reason}"
                    </p>
                  </div>
                </div>

                {req.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button onClick={() => handleAction(req.id, 'approve')} className="bg-[#00CC66] text-white hover:bg-[#00aa55] py-2 px-4">
                      Approve
                    </Button>
                    <Button onClick={() => handleAction(req.id, 'reject')} className="bg-[#FF3333] text-white hover:bg-[#dd2222] py-2 px-4">
                      Reject
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-4 text-xs text-zinc-500">
                <div>Requested: {new Date(req.created_at).toLocaleString()}</div>
                {req.reviewed_at && <div>Reviewed: {new Date(req.reviewed_at).toLocaleString()}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccessRequests;
