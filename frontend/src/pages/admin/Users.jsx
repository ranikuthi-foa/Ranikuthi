import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import DataTable from '../../components/DataTable';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [flats, setFlats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', mobile_number: '', email_address: '', role_name: 'RESIDENT', flat_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [lastCreated, setLastCreated] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [editError, setEditError] = useState(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/auth/admin/users');
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    apiRequest('/members/flats').then((d) => setFlats(d.flats)).catch(() => {});
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    setLastCreated(null);
    try {
      const result = await apiRequest('/auth/admin/users', {
        method: 'POST',
        body: { ...formData, flat_id: formData.flat_id || null },
      });
      setLastCreated({ mobile: result.user.mobile_number, tempPassword: result.temp_password });
      setFormData({ full_name: '', mobile_number: '', email_address: '', role_name: 'RESIDENT', flat_id: '' });
      await loadUsers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditData({ role_name: u.role_name, flat_id: u.flat_id || '', account_status: u.account_status });
    setEditError(null);
  }

  async function saveEdit(userId) {
    setEditError(null);
    try {
      await apiRequest(`/auth/admin/users/${userId}`, {
        method: 'PATCH',
        body: { ...editData, flat_id: editData.flat_id || null },
      });
      setEditingId(null);
      await loadUsers();
    } catch (err) {
      setEditError(err.message);
    }
  }

  const flatCodeFor = (flatId) => flats.find((f) => f.id === flatId)?.flat_code || '—';

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'mobile_number', label: 'Mobile' },
    { key: 'role_name', label: 'Role', render: (r) => (
      editingId === r.id ? (
        <select value={editData.role_name} onChange={(e) => setEditData({ ...editData, role_name: e.target.value })} style={{ padding: '0.3em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
          <option value="ADMIN">ADMIN</option>
          <option value="COMMITTEE">COMMITTEE</option>
          <option value="CA">CA</option>
          <option value="RESIDENT">RESIDENT</option>
        </select>
      ) : r.role_name
    ) },
    { key: 'flat_id', label: 'Flat', render: (r) => (
      editingId === r.id ? (
        <select value={editData.flat_id} onChange={(e) => setEditData({ ...editData, flat_id: e.target.value })} style={{ padding: '0.3em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
          <option value="">None</option>
          {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_code}</option>)}
        </select>
      ) : flatCodeFor(r.flat_id)
    ) },
    { key: 'account_status', label: 'Status', render: (r) => (
      editingId === r.id ? (
        <select value={editData.account_status} onChange={(e) => setEditData({ ...editData, account_status: e.target.value })} style={{ padding: '0.3em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="LOCKED">LOCKED</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      ) : (
        <span style={{ color: r.account_status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600, fontSize: 13 }}>
          {r.account_status}
        </span>
      )
    ) },
    { key: 'actions', label: 'Actions', render: (r) => (
      editingId === r.id ? (
        <div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => saveEdit(r.id)} className="btn-primary" style={{ fontSize: 12, padding: '0.3em 0.6em' }}>Save</button>
            <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>Cancel</button>
          </div>
          {editError && <p className="error-text" style={{ marginTop: 4 }}>{editError}</p>}
        </div>
      ) : (
        <button onClick={() => startEdit(r)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>Edit</button>
      )
    ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2em' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {lastCreated && (
        <div style={{ background: '#eef6ee', border: '1px solid var(--color-success)', padding: '1em', marginBottom: '1.2em', fontSize: 14 }}>
          User <strong>{lastCreated.mobile}</strong> created. Temporary password: <strong>{lastCreated.tempPassword}</strong> — share this securely; they'll be forced to change it on first login.
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Full Name</label>
            <input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Mobile Number</label>
            <input value={formData.mobile_number} onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Email (for OTP)</label>
            <input type="email" value={formData.email_address} onChange={(e) => setFormData({ ...formData, email_address: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Role</label>
            <select value={formData.role_name} onChange={(e) => setFormData({ ...formData, role_name: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <option value="RESIDENT">RESIDENT</option>
              <option value="COMMITTEE">COMMITTEE</option>
              <option value="CA">CA</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat (if Resident)</label>
            <select value={formData.flat_id} onChange={(e) => setFormData({ ...formData, flat_id: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <option value="">None</option>
              {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_code}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create User'}</button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={users} emptyMessage="No users found." />}
    </div>
  );
}
