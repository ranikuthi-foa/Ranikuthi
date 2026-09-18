import { useState, useEffect } from 'react';
import { apiRequest, absoluteUrl } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';

const rupees = (paise) => `Rs. ${(Number(paise) / 100).toFixed(2)}`;

const STATUS_COLORS = {
  APPROVED: 'var(--color-success)',
  PENDING: 'var(--color-accent)',
  REJECTED: 'var(--color-danger)',
};

export default function Vouchers() {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: '', description: '', base_amount_paise: '', gst_amount_paise: '',
    payment_mode: 'CASH', financial_year: '2026-27',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  async function loadVouchers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest('/billing/vouchers');
      setVouchers(data.vouchers);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadVouchers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiRequest('/billing/vouchers', {
        method: 'POST',
        body: {
          ...formData,
          base_amount_paise: Number(formData.base_amount_paise) || 0,
          gst_amount_paise: Number(formData.gst_amount_paise) || 0,
        },
      });
      setFormData({ category: '', description: '', base_amount_paise: '', gst_amount_paise: '', payment_mode: 'CASH', financial_year: '2026-27' });
      setShowForm(false);
      await loadVouchers();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(voucherId, decision) {
    try {
      await apiRequest(`/billing/vouchers/${voucherId}/approve`, { method: 'POST', body: { decision } });
      await loadVouchers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDownload(voucherId) {
    try {
      const data = await apiRequest(`/documents/voucher/${voucherId}/download`);
      window.open(absoluteUrl(data.url), '_blank');
    } catch (err) {
      alert(err.message);
    }
  }

  const columns = [
    { key: 'voucher_no', label: 'Voucher No.' },
    { key: 'expense_date', label: 'Date' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'total_amount_paise', label: 'Total', numeric: true, render: (r) => <strong>{rupees(r.total_amount_paise)}</strong> },
    { key: 'approval_status', label: 'Status', render: (r) => (
      <span style={{ color: STATUS_COLORS[r.approval_status], fontWeight: 600, fontSize: 13 }}>{r.approval_status}</span>
    ) },
    { key: 'actions', label: 'Actions', render: (r) => {
      const isOwnVoucher = r.maker_user_id === user.id;
      return (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {r.approval_status === 'APPROVED' && (
            <button onClick={() => handleDownload(r.id)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>PDF</button>
          )}
          {r.approval_status === 'PENDING' && (
            isOwnVoucher ? (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Awaiting a different approver</span>
            ) : (
              <>
                <button onClick={() => handleDecision(r.id, 'APPROVED')} style={{ fontSize: 12, padding: '0.3em 0.6em', color: 'var(--color-success)' }}>Approve</button>
                <button onClick={() => handleDecision(r.id, 'REJECTED')} style={{ fontSize: 12, padding: '0.3em 0.6em', color: 'var(--color-danger)' }}>Reject</button>
              </>
            )
          )}
        </div>
      );
    } },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2em' }}>
        <h2 style={{ margin: 0 }}>Expense Vouchers</h2>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New Voucher'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Category</label>
            <input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="Repairs, Utilities, Salaries…" required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Payment Mode</label>
            <select value={formData.payment_mode} onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="UPI">UPI</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Financial Year</label>
            <input value={formData.financial_year} onChange={(e) => setFormData({ ...formData, financial_year: e.target.value })} required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Description (include vendor/payee here for now)</label>
            <input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="e.g. Lift motor repair — Ravi Plumbing Services" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Base Amount (Rs.)</label>
            <input type="number" step="0.01" onChange={(e) => setFormData({ ...formData, base_amount_paise: Math.round(Number(e.target.value) * 100) })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>GST Amount (Rs., optional)</label>
            <input type="number" step="0.01" onChange={(e) => setFormData({ ...formData, gst_amount_paise: Math.round(Number(e.target.value) * 100) })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Submit for Approval'}</button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && <DataTable columns={columns} rows={vouchers} emptyMessage="No vouchers created yet." />}
    </div>
  );
}
