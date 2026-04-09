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
  Camera
} from 'lucide-react';

const REFEX_LOGO = 'https://customer-assets.emergentagent.com/job_kissflow-access-hub/artifacts/7t1td79v_refex-logo.png';

const Layout = ({ children }) => {
  const { user, organization, logout, API, getAuthHeader, refreshUser } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(true);
  const [iamExpanded, setIamExpanded] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);

  const isAdmin = user?.role === 'org_admin' || user?.role === 'admin';

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

  const handleProfilePicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPic(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await axios.post(`${API}/upload/logo`, formData, {
        ...getAuthHeader(),
        headers: { ...getAuthHeader().headers, 'Content-Type': 'multipart/form-data' }
      });
      await axios.put(`${API}/users/me/profile-pic`, 
        { profile_pic: uploadRes.data.logo_url },
        getAuthHeader()
      );
      await refreshUser();
      toast.success('Profile picture updated');
      setProfileOpen(false);
    } catch (err) {
      toast.error('Failed to update profile picture');
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          <img src={REFEX_LOGO} alt="Refex" className="h-8" />
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
          <img src={REFEX_LOGO} alt="Refex" className="h-9" data-testid="sidebar-logo" />
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
          <div className="hidden lg:block mt-3">
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

      {/* Main Content */}
      <main className="lg:ml-[260px] pt-14 lg:pt-0 min-h-screen">
        <div className="p-3 sm:p-8 lg:p-10 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
