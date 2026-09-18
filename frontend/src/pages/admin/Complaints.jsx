import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';

const STATUS_COLORS = {
  OPEN: 'var(--color-accent)',
  IN_PROGRESS: 'var(--color-primary)',
  CLOSED: 'var(--color-text-muted)',
};

const PRIORITY_COLORS = {
  LOW: 'var(--color-text-muted)',
  NORMAL: 'var(--color-text)',
  HIGH: 'var(--color-accent)',
  URGENT: 'var(--color-danger)',
};

export default function Complaints() {
  const { user } = useAuth();
  const [flats, setFlats] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ flat_id: '', category: '', title: '', description: '', priority: 'NORMAL' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [closingId, setClosingId] = useState(null);
  const [closureType, setClosureType] = useState('RESOLVED');
  const [closureRemarks, setClosureRemarks] = useState('');

  useEffect(() => {
    apiRequest('/members/flats').then((data) => setFlats(data.flats)).catch((err) => setError(err.message));
  }, []);

  async function loadComplaints() {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const data = await apiRequest(`/complaints/complaints${query}`);
      setComplaints(data.complaints);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadComplaints(); }, [statusFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/complaints/complaints', { method: 'POST', body: formData });
      setFormData({ flat_id: '', category: '', title: '', description: '', priority: 'NORMAL' });
      setShowForm(false);
      await loadComplaints();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignToSelf(complaintId) {
    try {
      await apiRequest(`/complaints/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: { assigned_to_user_id: user.id, admin_notes: `Self-assigned by ${user.full_name}` },
      });
      await loadComplaints();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleClose(complaintId) {
    try {
      await apiRequest(`/complaints/complaints/${complaintId}/close`, {
        method: 'POST',
        body: { closure_type: closureType, closure_remarks: closureRemarks },
      });
      setClosingId(null);
      setClosureRemarks('');
      await loadComplaints();
    } catch (err) {
      alert(err.message);
    }
  }

  const flatCodeFor = (flatId) => flats.find((f) => f.id === flatId)?.flat_code || '—';

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'category', label: 'Category' },
    { key: 'flat_id', label: 'Flat', render: (r) => flatCodeFor(r.flat_id) },
    { key: 'priority', label: 'Priority', render: (r) => (
      <span style={{ color: PRIORITY_COLORS[r.priority], fontWeight: 600, fontSize: 13 }}>{r.priority}</span>
    ) },
    { key: 'status', label: 'Status', render: (r) => (
      <span style={{ color: STATUS_COLORS[r.status], fontWeight: 600, fontSize: 13 }}>{r.status.replace('_', ' ')}</span>
    ) },
    { key: 'raised_timestamp', label: 'Raised', render: (r) => new Date(r.raised_timestamp).toLocaleDateString('en-IN') },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {r.status === 'OPEN' && (
          <button onClick={() => handleAssignToSelf(r.id)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>Assign to me</button>
        )}
        {r.status !== 'CLOSED' && closingId !== r.id && (
          <button onClick={() => setClosingId(r.id)} style={{ fontSize: 12, padding: '0.3em 0.6em', color: 'var(--color-danger)' }}>Close</button>
        )}
      </div>
    ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2em' }}>
        <h2 style={{ margin: 0 }}>Complaints</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Raise Complaint'}
        </button>
      </div>

      <div style={{ marginBottom: '1.2em', display: 'flex', gap: 8 }}>
        {['', 'OPEN', 'IN_PROGRESS', 'CLOSED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              fontSize: 13, padding: '0.4em 0.9em', borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: statusFilter === s ? 'var(--color-primary)' : 'var(--color-surface)',
              color: statusFilter === s ? 'white' : 'var(--color-text)',
            }}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat</label>
            <select value={formData.flat_id} onChange={(e) => setFormData({ ...formData, flat_id: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }} required>
              <option value="">Select flat…</option>
              {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_code}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Category</label>
            <input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="Plumbing, Electrical…" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Priority</label>
            <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Title</label>
            <input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Description</label>
            <input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Raise Complaint'}</button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {closingId && (
        <div style={{ background: '#fdf0f0', border: '1px solid var(--color-danger)', padding: '1em', marginBottom: '1.2em' }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Closure Type</label>
          <select value={closureType} onChange={(e) => setClosureType(e.target.value)} style={{ width: 200, padding: '0.5em', border: '1px solid var(--color-border)', borderRadius: 4, marginBottom: 8 }}>
            <option value="RESOLVED">Resolved</option>
            <option value="DUPLICATE">Duplicate</option>
            <option value="NOT_ACTIONABLE">Not Actionable</option>
          </select>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Remarks</label>
          <input value={closureRemarks} onChange={(e) => setClosureRemarks(e.target.value)} style={{ marginBottom: 8 }} />
          <div>
            <button className="btn-primary" onClick={() => handleClose(closingId)} style={{ marginRight: 8 }}>Confirm Close</button>
            <button onClick={() => { setClosingId(null); setClosureRemarks(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={complaints} emptyMessage="No complaints found." />}
    </div>
  );
}
