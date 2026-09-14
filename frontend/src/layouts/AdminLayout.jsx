import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/admin/members', label: 'Members & Flats' },
  { to: '/admin/bills', label: 'Bills' },
  { to: '/admin/receipts', label: 'Receipts' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, background: 'var(--color-primary)', color: 'white',
        padding: '1.5em 0', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 1.2em 1.5em', borderBottom: '1px solid rgba(255,255,255,0.15)', marginBottom: '1em' }}>
          <h1 style={{ fontSize: 18, color: 'white', margin: 0 }}>Ranikuthi</h1>
          <p style={{ fontSize: 12, opacity: 0.75, margin: '4px 0 0' }}>{user.role_name}</p>
        </div>

        <nav style={{ flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'block',
                padding: '0.65em 1.2em',
                color: 'white',
                textDecoration: 'none',
                fontSize: 14,
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '0 1.2em' }}>
          <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 0.6em' }}>{user.full_name}</p>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.4em 0.9em', borderRadius: 4, fontSize: 13 }}
          >
            Log out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '2em', background: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
