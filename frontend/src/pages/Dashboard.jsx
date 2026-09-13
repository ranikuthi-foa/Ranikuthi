import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <div style={{ padding: '2em' }}>
      <h1>Welcome, {user.full_name}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Role: {user.role_name}</p>
      <button className="btn-primary" onClick={logout}>Log out</button>
    </div>
  );
}