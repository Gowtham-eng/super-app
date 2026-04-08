import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  House,
  SquaresFour,
  Storefront,
  ShieldCheck,
  Key,
  Users,
  UsersThree,
  UserCircleGear,
  ShieldWarning,
  ClipboardText,
  Scroll,
  Gear,
  SignOut,
  List,
  X,
  CaretDown,
  CaretRight
} from '@phosphor-icons/react';

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
        { path: '/', label: 'Dashboard', icon: House },
        { path: '/launcher', label: 'App Launcher', icon: SquaresFour },
        { path: '/catalog', label: 'App Catalog', icon: Storefront },
      ]
    },
    {
      title: 'Applications',
      expandable: true,
      expanded: appsExpanded,
      toggle: () => setAppsExpanded(!appsExpanded),
      items: [
        { path: '/apps/saml', label: 'SAML Apps', icon: ShieldCheck },
        { path: '/apps/oidc', label: 'OIDC Apps', icon: Key },
      ]
    },
    {
      title: 'Identity & Access',
      expandable: true,
      expanded: iamExpanded,
      toggle: () => setIamExpanded(!iamExpanded),
      items: [
        { path: '/users', label: 'Users', icon: Users },
        { path: '/groups', label: 'Groups', icon: UsersThree },
        { path: '/roles', label: 'Roles', icon: UserCircleGear },
        { path: '/policies', label: 'Policies', icon: ShieldWarning },
        { path: '/requests', label: 'Access Requests', icon: ClipboardText },
      ]
    },
    {
      title: 'Compliance',
      items: [
        { path: '/audit', label: 'Audit Logs', icon: Scroll },
        { path: '/settings', label: 'Settings', icon: Gear },
      ]
    }
  ];

  const userSections = [
    {
      title: 'Apps',
      items: [
        { path: '/launcher', label: 'My Apps', icon: SquaresFour },
        { path: '/catalog', label: 'Request Access', icon: Storefront },
      ]
    }
  ];

  const navSections = isAdmin ? adminSections : userSections;

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-zinc-200 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-5 h-5" />
          </div>
          <span className="font-heading font-black text-lg">Kissflow IAM</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-zinc-100"
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-zinc-200 z-50 overflow-y-auto
        transform transition-transform duration-200 lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="hidden lg:flex items-center gap-3 px-6 py-5 border-b border-zinc-200">
          <div className="w-10 h-10 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <div className="font-heading font-black text-lg tracking-tight">Kissflow IAM</div>
            <div className="text-xs text-zinc-500 truncate max-w-[140px]">{organization?.name || 'Identity Provider'}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="py-4 lg:py-2">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="mb-2">
              {section.expandable ? (
                <button
                  onClick={section.toggle}
                  className="w-full flex items-center justify-between px-6 py-2 text-xs font-bold uppercase tracking-[0.1em] text-zinc-400 hover:text-zinc-600"
                >
                  {section.title}
                  {section.expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
                </button>
              ) : (
                <div className="px-6 py-2 text-xs font-bold uppercase tracking-[0.1em] text-zinc-400">
                  {section.title}
                </div>
              )}
              
              {(!section.expandable || section.expanded) && section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`nav-${item.path.replace(/\//g, '-').slice(1) || 'dashboard'}`}
                    className={`
                      flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-colors
                      ${isActive(item.path) 
                        ? 'bg-[#0051FF]/5 text-[#0051FF] border-l-2 border-[#0051FF]' 
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 border-l-2 border-transparent'
                      }
                    `}
                  >
                    <Icon size={18} weight={isActive(item.path) ? 'bold' : 'regular'} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-200 p-4 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#0051FF] flex items-center justify-center text-sm font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-900 truncate">{user?.name}</div>
              <div className="text-xs text-zinc-500 truncate">{isAdmin ? 'Admin' : 'User'}</div>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-zinc-600 hover:text-[#FF3333] hover:bg-zinc-50 transition-colors"
          >
            <SignOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen pb-8">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
