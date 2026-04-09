import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  ChevronRight
} from 'lucide-react';

const REFEX_LOGO = 'https://customer-assets.emergentagent.com/job_kissflow-access-hub/artifacts/7t1td79v_refex-logo.png';

const Layout = ({ children }) => {
  const { user, organization, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(true);
  const [iamExpanded, setIamExpanded] = useState(true);

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

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50 px-4 py-3 flex items-center justify-between">
        <img src={REFEX_LOGO} alt="Refex" className="h-8" />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-slate-100 rounded-lg"
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
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

        {/* User Footer */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-semibold text-emerald-800">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{user?.name}</div>
              <div className="text-xs text-slate-400">{isAdmin ? 'Admin' : 'Member'}</div>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
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
