import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  AppWindow,
  Store,
  ShieldCheck,
  KeyRound,
  Smartphone,
  Users,
  UsersRound,
  UserCog,
  ShieldAlert,
  ClipboardList,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Camera,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Download,
  Headphones,
  Cloud
} from 'lucide-react';

const REFEX_LOGO = '/refexone-logo.png';

const Layout = ({ children }) => {
  const { user, organization, logout, API, getAuthHeader, refreshUser } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(true);
  const [iamExpanded, setIamExpanded] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwShow, setPwShow] = useState({ current: false, next: false, confirm: false });
  const [pwSaving, setPwSaving] = useState(false);
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);

  const isAdmin = user?.role === 'org_admin' || user?.role === 'admin' || user?.role === 'super_admin';

  const adminSections = [
    {
      title: 'Overview',
      items: [
        { path: '/', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/launcher', label: 'App Launcher', icon: AppWindow },
        { path: '/catalog', label: 'App Catalog', icon: Store },
      ]
    },
    {
      title: 'Applications',
      expandable: true,
      expanded: appsExpanded,
      toggle: () => setAppsExpanded(!appsExpanded),
      items: [
        { path: '/apps/saml', label: 'SAML Apps', icon: ShieldCheck },
        { path: '/apps/oidc', label: 'OIDC Apps', icon: KeyRound },
        { path: '/apps/mobile', label: 'Mobile Apps', icon: Smartphone },
      ]
    },
    {
      title: 'Identity & Access',
      expandable: true,
      expanded: iamExpanded,
      toggle: () => setIamExpanded(!iamExpanded),
      items: [
        { path: '/users', label: 'Users', icon: Users },
        { path: '/groups', label: 'Groups', icon: UsersRound },
        { path: '/roles', label: 'Roles', icon: UserCog },
        { path: '/policies', label: 'Policies', icon: ShieldAlert },
        { path: '/requests', label: 'Access Requests', icon: ClipboardList },
      ]
    },
    {
      title: 'Compliance',
      items: [
        { path: '/audit', label: 'Audit Logs', icon: ScrollText },
        { path: '/hr-sync', label: 'HR Sync', icon: RefreshCw },
        { path: '/scim', label: 'SCIM Setup', icon: KeyRound },
        { path: '/itsm-setup', label: 'ITSM Setup', icon: Headphones },
        { path: '/settings/azure-ad', label: 'Azure AD Login', icon: Cloud },
        { path: '/settings/app-update', label: 'App Updates', icon: Download },
        { path: '/settings', label: 'Settings', icon: Settings },
      ]
    }
  ];

  const userSections = [
    {
      title: 'Apps',
      items: [
        { path: '/launcher', label: 'My Apps', icon: AppWindow },
        { path: '/catalog', label: 'Request Access', icon: Store },
      ]
    }
  ];

  const navSections = isAdmin ? adminSections : userSections;
  const isActive = (path) => location.pathname === path;

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  /** Resize/compress camera photos so iOS uploads stay under the 5MB API limit. */
  const prepareProfileImage = (file) => new Promise((resolve, reject) => {
    const maxBytes = 5 * 1024 * 1024;
    const name = (file.name || 'profile.jpg').toLowerCase();
    const looksImage = (file.type || '').startsWith('image/')
      || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name)
      || file.type === 'application/octet-stream';
    if (!looksImage) {
      reject(new Error('Please choose an image file'));
      return;
    }
    // HEIC/HEIF: keep original bytes; server accepts by extension. Others: downscale to JPEG.
    if (/heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(name)) {
      if (file.size > maxBytes) {
        reject(new Error('Image must be under 5MB'));
        return;
      }
      resolve(file);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1024;
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = Math.min(maxSide / width, maxSide / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Could not process image'));
            return;
          }
          if (blob.size > maxBytes) {
            reject(new Error('Image must be under 5MB'));
            return;
          }
          resolve(new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: upload original if browser cannot decode (e.g. some HEIC)
      if (file.size > maxBytes) {
        reject(new Error('Image must be under 5MB'));
        return;
      }
      resolve(file);
    };
    img.src = url;
  });

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPic(true);
    try {
      const prepared = await prepareProfileImage(file);
      const formData = new FormData();
      formData.append('file', prepared);
      // Do NOT set Content-Type manually — browser must include multipart boundary.
      const uploadRes = await axios.post(`${API}/upload/logo`, formData, getAuthHeader());
      await axios.put(`${API}/users/me/profile-pic`,
        { profile_pic: uploadRes.data.logo_url },
        getAuthHeader()
      );
      await refreshUser();
      toast.success('Profile picture updated');
      setProfileOpen(false);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update profile picture';
      toast.error(typeof detail === 'string' ? detail : 'Failed to update profile picture');
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      toast.error('Please fill in all fields');
      return;
    }
    if (pwForm.next.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (pwForm.current === pwForm.next) {
      toast.error('New password must be different from current');
      return;
    }
    setPwSaving(true);
    try {
      await axios.post(`${API}/auth/change-password`,
        { current_password: pwForm.current, new_password: pwForm.next },
        getAuthHeader()
      );
      toast.success('Password changed successfully');
      setShowChangePassword(false);
      setPwForm({ current: '', next: '', confirm: '' });
      setPwShow({ current: false, next: false, confirm: false });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 hover:bg-slate-100 rounded-lg"
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <img src={REFEX_LOGO} alt="RefexOne" className="h-9" />
        </div>
        {/* Profile Avatar */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            data-testid="profile-avatar-btn"
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-bold hover:ring-2 hover:ring-emerald-300 transition-all"
          >
            {user?.profile_pic ? (
              <img src={user.profile_pic} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-3 z-[60] animate-fadeIn" data-testid="profile-dropdown">
              <div className="flex items-center gap-3 px-4 pb-3 border-b border-slate-100">
                <div className="relative group">
                  <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-emerald-100 text-emerald-800 font-bold text-sm">
                    {user?.profile_pic ? (
                      <img src={user.profile_pic} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid="change-profile-pic-btn"
                  >
                    <Camera size={14} className="text-white" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  <p className="text-[10px] text-emerald-600 font-medium">{isAdmin ? 'Admin' : 'Member'}</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicUpload}
                className="hidden"
                data-testid="profile-pic-input"
              />
              <button
                onClick={() => { fileInputRef.current?.click(); }}
                disabled={uploadingPic}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                data-testid="upload-profile-pic-btn"
              >
                <Camera size={16} />
                {uploadingPic ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              <button
                onClick={() => { setProfileOpen(false); setShowChangePassword(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                data-testid="open-change-password-btn"
              >
                <Lock size={16} />
                Change Password
              </button>
              <button
                onClick={() => { setProfileOpen(false); logout(); }}
                data-testid="profile-logout-btn"
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-[260px] bg-white border-r border-slate-200 z-50 overflow-y-auto flex flex-col
        transform transition-transform duration-200 lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="hidden lg:flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <img src={REFEX_LOGO} alt="RefexOne" className="h-11" data-testid="sidebar-logo" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="mb-1">
              {section.expandable ? (
                <button
                  onClick={section.toggle}
                  className="w-full flex items-center justify-between px-6 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  {section.title}
                  {section.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <div className="px-6 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  {section.title}
                </div>
              )}

              {(!section.expandable || section.expanded) && section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`nav-${item.path.replace(/\//g, '-').slice(1) || 'dashboard'}`}
                    className={`
                      flex items-center gap-3 mx-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                      ${active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }
                    `}
                  >
                    {active && <div className="absolute left-0 w-[3px] h-5 bg-emerald-600 rounded-r" />}
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User Footer - Desktop only (mobile uses header profile dropdown) */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="relative group">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-emerald-100 text-sm font-semibold text-emerald-800">
                {user?.profile_pic ? (
                  <img src={user.profile_pic} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{user?.name}</div>
              <div className="text-xs text-slate-400">{isAdmin ? 'Admin' : 'Member'}</div>
            </div>
          </div>
          {/* Desktop sign out */}
          <div className="hidden lg:block mt-3 space-y-1">
            <button
              onClick={() => setShowChangePassword(true)}
              data-testid="sidebar-change-password-btn"
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <Lock size={16} />
              Change Password
            </button>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content — extra bottom pad so last tiles clear the phone nav / home bar */}
      <main className="lg:ml-[260px] pt-14 lg:pt-0 min-h-screen">
        <div className="p-3 sm:p-8 lg:p-10 w-full safe-pb">
          {children}
        </div>
      </main>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => !pwSaving && setShowChangePassword(false)}
          data-testid="change-password-modal"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Lock size={18} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-heading font-semibold text-lg text-slate-900">Change Password</h2>
                  <p className="text-xs text-slate-500">Update your account password</p>
                </div>
              </div>
              <button
                onClick={() => !pwSaving && setShowChangePassword(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                data-testid="close-change-password-btn"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {/* Current */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={pwShow.current ? 'text' : 'password'}
                    value={pwForm.current}
                    onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                    placeholder="Enter current password"
                    autoFocus
                    data-testid="current-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, current: !pwShow.current })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    tabIndex={-1}
                  >
                    {pwShow.current ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={pwShow.next ? 'text' : 'password'}
                    value={pwForm.next}
                    onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                    placeholder="At least 8 characters"
                    data-testid="new-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, next: !pwShow.next })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    tabIndex={-1}
                  >
                    {pwShow.next ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.next && pwForm.next.length < 8 && (
                  <p className="text-xs text-amber-600 mt-1">Password must be at least 8 characters</p>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={pwShow.confirm ? 'text' : 'password'}
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    className="w-full h-11 px-3 pr-10 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                    placeholder="Re-type new password"
                    data-testid="confirm-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setPwShow({ ...pwShow, confirm: !pwShow.confirm })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    tabIndex={-1}
                  >
                    {pwShow.confirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePassword(false)}
                  disabled={pwSaving}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50"
                  data-testid="submit-change-password-btn"
                >
                  {pwSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
