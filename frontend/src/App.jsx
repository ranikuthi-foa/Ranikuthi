import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import AdminLayout from './layouts/AdminLayout';
import Members from './pages/admin/Members';
import Bills from './pages/admin/Bills';
import Receipts from './pages/admin/Receipts';
import Settings from './pages/admin/Settings';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: '2em' }}>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role_name)) {
    return <p style={{ padding: '2em' }}>You don't have access to this section.</p>;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'COMMITTEE']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="members" replace />} />
            <Route path="members" element={<Members />} />
            <Route path="bills" element={<Bills />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
