import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import DataTable from '../../components/DataTable';

const STATUS_COLORS = {
  PAID: 'var(--color-success)',
  PARTIAL: 'var(--color-accent)',
  UNPAID: 'var(--color-text-muted)',
  OVERDUE: 'var(--color-danger)',
};

function StatusBadge({ status }) {
  return (
    <span style={{
      color: STATUS_COLORS[status] || 'var(--color-text)',
      fontWeight: 600,
      fontSize: 13,
    }}>
      {status}
    </span>
  );
}

const rupees = (paise) => `Rs. ${(Number(paise) / 100).toFixed(2)}`;

export default function Bills() {
  const [flats, setFlats] = useState([]);
  const [selectedFlatId, setSelectedFlatId] = useState('');
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ bill_month_year: '', financial_year: '2026-27', due_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    apiRequest('/members/flats').then((data) => {
      setFlats(data.flats);
      if (data.flats.length > 0) setSelectedFlatId(data.flats[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  async function loadBills(flatId) {
    if (!flatId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/billing/bills?flat_id=${flatId}`);
      setBills(data.bills);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBills(selectedFlatId); }, [selectedFlatId]);

  async function handleGenerate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/billing/bills/generate', {
        method: 'POST',
        body: { flat_id: selectedFlatId, ...formData },
      });
      setFormData({ bill_month_year: '', financial_year: '2026-27', due_date: '' });
      setShowForm(false);
      await loadBills(selectedFlatId);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const columns = [
    { key: 'bill_no', label: 'Bill No.' },
    { key: 'bill_month_year', label: 'Period' },
    { key: 'due_date', label: 'Due Date' },
    { key: 'base_charge_paise', label: 'Base', numeric: true, render: (r) => rupees(r.base_charge_paise) },
    { key: 'previous_unpaid_paise', label: 'Carried Forward', numeric: true, render: (r) => rupees(r.previous_unpaid_paise) },
    { key: 'late_fine_paise', label: 'Late Fine', numeric: true, render: (r) => rupees(r.late_fine_paise) },
    { key: 'total_payable_paise', label: 'Total', numeric: true, render: (r) => <strong>{rupees(r.total_payable_paise)}</strong> },
    { key: 'payment_status', label: 'Status', render: (r) => <StatusBadge status={r.payment_status} /> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2em' }}>
        <h2 style={{ margin: 0 }}>Bills</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!selectedFlatId}>
          {showForm ? 'Cancel' : '+ Generate Bill'}
        </button>
      </div>

      <div style={{ marginBottom: '1.2em' }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat</label>
        <select
          value={selectedFlatId}
          onChange={(e) => setSelectedFlatId(e.target.value)}
          style={{ padding: '0.5em 0.8em', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 14, width: 240 }}
        >
          {flats.map((f) => (
            <option key={f.id} value={f.id}>{f.flat_code}</option>
          ))}
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleGenerate} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Bill Period (YYYY-MM)</label>
            <input placeholder="2026-10" value={formData.bill_month_year} onChange={(e) => setFormData({ ...formData, bill_month_year: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Financial Year</label>
            <input value={formData.financial_year} onChange={(e) => setFormData({ ...formData, financial_year: e.target.value })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Due Date</label>
            <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Generating…' : 'Generate Bill'}
            </button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={bills} emptyMessage="No bills generated for this flat yet." />}
    </div>
  );
}
