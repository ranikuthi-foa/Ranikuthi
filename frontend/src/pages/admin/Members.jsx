import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import DataTable from '../../components/DataTable';

export default function Members() {
  const [flats, setFlats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ flat_code: '', wing: '', flat_no: '', area_sqft: '', floor: '', flat_type: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  async function loadFlats() {
    setLoading(true);
    try {
      const data = await apiRequest('/members/flats');
      setFlats(data.flats);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFlats(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/members/flats', {
        method: 'POST',
        body: { ...formData, area_sqft: formData.area_sqft ? Number(formData.area_sqft) : null },
      });
      setFormData({ flat_code: '', wing: '', flat_no: '', area_sqft: '', floor: '', flat_type: '' });
      setShowForm(false);
      await loadFlats();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    { key: 'flat_code', label: 'Flat' },
    { key: 'wing', label: 'Wing' },
    { key: 'floor', label: 'Floor' },
    { key: 'flat_type', label: 'Type' },
    { key: 'area_sqft', label: 'Area (sqft)', numeric: true },
    { key: 'active_flag', label: 'Status', render: (r) => (r.active_flag ? 'Active' : 'Inactive') },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2em' }}>
        <h2 style={{ margin: 0 }}>Members & Flats</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add Flat'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat Code (e.g. GA-3D)</label>
            <input value={formData.flat_code} onChange={(e) => setFormData({ ...formData, flat_code: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Wing</label>
            <input value={formData.wing} onChange={(e) => setFormData({ ...formData, wing: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat No.</label>
            <input value={formData.flat_no} onChange={(e) => setFormData({ ...formData, flat_no: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Floor</label>
            <input value={formData.floor} onChange={(e) => setFormData({ ...formData, floor: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Type (e.g. 2BHK)</label>
            <input value={formData.flat_type} onChange={(e) => setFormData({ ...formData, flat_type: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Area (sqft)</label>
            <input type="number" value={formData.area_sqft} onChange={(e) => setFormData({ ...formData, area_sqft: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Flat'}
            </button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={flats} emptyMessage="No flats added yet." />}
    </div>
  );
}
