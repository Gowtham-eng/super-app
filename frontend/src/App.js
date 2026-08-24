import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AppLauncher from "./pages/AppLauncher";
import AppCatalog from "./pages/AppCatalog";
import SAMLApps from "./pages/SAMLApps";
import OIDCApps from "./pages/OIDCApps";
import MobileApps from "./pages/MobileApps";
import Users from "./pages/Users";
import Groups from "./pages/Groups";
import Roles from "./pages/Roles";
import Policies from "./pages/Policies";
import AccessRequests from "./pages/AccessRequests";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import HRSync from "./pages/HRSync";
import SCIMSetup from "./pages/SCIMSetup";
import ITSMSetup from "./pages/ITSMSetup";
import AzureADSetup from "./pages/AzureADSetup";
import CreateITRequest from "./pages/CreateITRequest";
import ITSMDashboard from "./pages/ITSMDashboard";
import Layout from "./components/Layout";
import "./App.css";

const ProtectedRoute = ({ children }) => {
  const { user, token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  // Keep session when token exists but /auth/me briefly failed (Feast/QR back).
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }
  if (!user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  return <Layout>{children}</Layout>;
};

const AdminRoute = ({ children }) => {
  const { user, token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }
  if (!user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  const isAdmin = user.role === 'org_admin' || user.role === 'admin';
  if (!isAdmin) {
    return <Navigate to="/launcher" replace />;
  }
  
  return <Layout>{children}</Layout>;
};

const DefaultRedirect = () => {
  const { user, token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  if (!user && !token) return <Navigate to="/login" replace />;
  if (!user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  const isAdmin = user.role === 'org_admin' || user.role === 'admin';
  return isAdmin
    ? <Layout><Dashboard /></Layout>
    : <Navigate to="/launcher" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<DefaultRedirect />} />
          {/* User-accessible routes */}
          <Route path="/launcher" element={<ProtectedRoute><AppLauncher /></ProtectedRoute>} />
          <Route path="/catalog" element={<ProtectedRoute><AppCatalog /></ProtectedRoute>} />
          <Route path="/itsm" element={<ProtectedRoute><ITSMDashboard /></ProtectedRoute>} />
          <Route path="/itsm/new" element={<ProtectedRoute><CreateITRequest /></ProtectedRoute>} />
          {/* Admin-only routes */}
          <Route path="/apps/saml" element={<AdminRoute><SAMLApps /></AdminRoute>} />
          <Route path="/apps/oidc" element={<AdminRoute><OIDCApps /></AdminRoute>} />
          <Route path="/apps/mobile" element={<AdminRoute><MobileApps /></AdminRoute>} />
          <Route path="/settings/app-update" element={<AdminRoute><MobileApps /></AdminRoute>} />
          <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="/groups" element={<AdminRoute><Groups /></AdminRoute>} />
          <Route path="/roles" element={<AdminRoute><Roles /></AdminRoute>} />
          <Route path="/policies" element={<AdminRoute><Policies /></AdminRoute>} />
          <Route path="/requests" element={<AdminRoute><AccessRequests /></AdminRoute>} />
          <Route path="/audit" element={<AdminRoute><AuditLogs /></AdminRoute>} />
          <Route path="/hr-sync" element={<AdminRoute><HRSync /></AdminRoute>} />
          <Route path="/scim" element={<AdminRoute><SCIMSetup /></AdminRoute>} />
          <Route path="/itsm-setup" element={<AdminRoute><ITSMSetup /></AdminRoute>} />
          <Route path="/settings/azure-ad" element={<AdminRoute><AzureADSetup /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
          <Route path="/access-requests" element={<ProtectedRoute><AccessRequests /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
