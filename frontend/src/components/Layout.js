import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  House,
  ShieldCheck,
  Key,
  Users,
  Gear,
  SignOut,
  List,
  X
} from '@phosphor-icons/react';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: House },
    { path: '/saml', label: 'SAML Config', icon: ShieldCheck },
    { path: '/oidc', label: 'OpenID Connect', icon: Key },
    { path: '/users', label: 'Users', icon: Users },
    { path: '/settings', label: 'Settings', icon: Gear },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-zinc-200 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-5 h-5" />
          </div>
          <span className="font-heading font-black text-lg">Kissflow SSO</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:bg-zinc-100"
          data-testid="mobile-menu-toggle"
        >
          {mobileMenuOpen ? <X size={24} /> : <List size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-white border-r border-zinc-200 z-50
        transform transition-transform duration-200
        lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="hidden lg:flex items-center gap-3 px-6 py-6 border-b border-zinc-200">
          <div className="w-10 h-10 bg-[#0051FF] flex items-center justify-center">
            <ShieldCheck weight="bold" className="text-white w-6 h-6" />
          </div>
          <div>
            <div className="font-heading font-black text-lg tracking-tight">Kissflow SSO</div>
            <div className="text-xs text-zinc-500">Identity Provider</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="py-4 lg:py-6">
          <div className="px-4 mb-2">
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-400">Navigation</span>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
                className={`
                  flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors
                  ${isActive(item.path) 
                    ? 'bg-zinc-100 text-[#0051FF] border-l-2 border-[#0051FF]' 
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 border-l-2 border-transparent'
                  }
                `}
              >
                <Icon size={20} weight={isActive(item.path) ? 'bold' : 'regular'} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-zinc-200 flex items-center justify-center text-sm font-bold text-zinc-600">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-900 truncate">{user?.name}</div>
              <div className="text-xs text-zinc-500 truncate">{user?.email}</div>
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
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
