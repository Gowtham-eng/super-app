import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, Search } from 'lucide-react';

const AccessRequests = () => {
  const { API, getAuthHeader, user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const isAdmin = user?.role === 'org_admin';

  useEffect(() => { fetchRequests(); }, [filter]);

  const fetchRequests = async () => {
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const res = await axios.get(`${API}/access-requests${params}`, getAuthHeader());
      setRequests(res.data);
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId, status) => {
    try {
      await axios.put(`${API}/access-requests/${requestId}`, { status }, getAuthHeader());
      toast.success(`Request ${status}`);
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update request');
    }
  };

  const statusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
    };
    const icons = { pending: Clock, approved: CheckCircle, rejected: XCircle };
    const Icon = icons[status] || Clock;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
        <Icon size={12} /> {status}
      </span>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <div className="animate-fadeIn" data-testid="access-requests-page">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-slate-900 mb-1">Access Requests</h1>
        <p className="text-sm text-slate-400">
          {isAdmin ? 'Review and manage application access requests' : 'Track your application access requests'}
        </p>
      </div>

      <div className="flex gap-2 mb-5">
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setLoading(true); }}
            data-testid={`filter-${f}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Search size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No {filter !== 'all' ? filter : ''} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5" data-testid={`request-${req.id}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="font-semibold text-slate-800 text-sm">{req.app_name}</h3>
                    {statusBadge(req.status)}
                  </div>
                  <p className="text-xs text-slate-400">
                    Requested by <span className="font-medium text-slate-600">{req.user_name}</span> ({req.user_email})
                  </p>
                  {req.reason && <p className="text-xs text-slate-400 mt-1">Reason: {req.reason}</p>}
                  <p className="text-xs text-slate-300 mt-1">{new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  {req.reviewed_by_name && (
                    <p className="text-xs text-slate-400 mt-1">
                      {req.status === 'approved' ? 'Approved' : 'Rejected'} by {req.reviewed_by_name}
                    </p>
                  )}
                </div>
                {isAdmin && req.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(req.id, 'approved')}
                      data-testid={`approve-${req.id}`}
                      className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'rejected')}
                      data-testid={`reject-${req.id}`}
                      className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccessRequests;
