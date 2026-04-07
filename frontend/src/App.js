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
import Users from "./pages/Users";
import Groups from "./pages/Groups";
import Roles from "./pages/Roles";
import Policies from "./pages/Policies";
import AccessRequests from "./pages/AccessRequests";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import Layout from "./components/Layout";
import "./App.css";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="spinner" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <Layout>{children}</Layout>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/launcher" element={<ProtectedRoute><AppLauncher /></ProtectedRoute>} />
          <Route path="/catalog" element={<ProtectedRoute><AppCatalog /></ProtectedRoute>} />
          <Route path="/apps/saml" element={<ProtectedRoute><SAMLApps /></ProtectedRoute>} />
          <Route path="/apps/oidc" element={<ProtectedRoute><OIDCApps /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
          <Route path="/roles" element={<ProtectedRoute><Roles /></ProtectedRoute>} />
          <Route path="/policies" element={<ProtectedRoute><Policies /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><AccessRequests /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
