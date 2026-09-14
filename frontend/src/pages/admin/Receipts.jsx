import { useState, useEffect } from 'react';
import { apiRequest } from '../../api/client';
import DataTable from '../../components/DataTable';

const rupees = (paise) => `Rs. ${(Number(paise) / 100).toFixed(2)}`;

export default function Receipts() {
  const [flats, setFlats] = useState([]);
  const [selectedFlatId, setSelectedFlatId] = useState('');
  const [bills, setBills] = useState([]);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ payment_mode: 'CASH', paid_amount_paise: '', concession_paise: '', committee_advice_note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    apiRequest('/members/flats').then((data) => {
      setFlats(data.flats);
      if (data.flats.length > 0) setSelectedFlatId(data.flats[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedFlatId) return;
    apiRequest(`/billing/bills?flat_id=${selectedFlatId}`).then((data) => {
      setBills(data.bills);
      setSelectedBillId(data.bills[0]?.id || '');
    }).catch((err) => setError(err.message));
  }, [selectedFlatId]);

  async function loadReceipts(flatId) {
    if (!flatId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/billing/receipts?flat_id=${flatId}`);
      setReceipts(data.receipts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReceipts(selectedFlatId); }, [selectedFlatId]);

  async function handlePay(e) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const body = {
        bill_id: selectedBillId,
        payment_mode: formData.payment_mode,
        paid_amount_paise: Number(formData.paid_amount_paise) || 0,
      };
      if (formData.concession_paise) {
        body.concession_paise = Number(formData.concession_paise);
        body.committee_advice_note = formData.committee_advice_note || undefined;
      }
      await apiRequest('/billing/receipts', { method: 'POST', body });
      setFormData({ payment_mode: 'CASH', paid_amount_paise: '', concession_paise: '', committee_advice_note: '' });
      setShowForm(false);
      const billsData = await apiRequest(`/billing/bills?flat_id=${selectedFlatId}`);
      setBills(billsData.bills);
      await loadReceipts(selectedFlatId);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoid(receiptId) {
    if (!voidReason) return;
    try {
      await apiRequest(`/billing/receipts/${receiptId}/void`, { method: 'POST', body: { void_reason: voidReason } });
      setVoidingId(null);
      setVoidReason('');
      await loadReceipts(selectedFlatId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDownload(receiptId, isVoidCopy) {
    try {
      const path = isVoidCopy ? `/documents/receipt/${receiptId}/void-download` : `/documents/receipt/${receiptId}/download`;
      const data = await apiRequest(path);
      window.open(data.url, '_blank');
    } catch (err) {
      alert(err.message);
    }
  }

  const selectedBill = bills.find((b) => b.id === selectedBillId);

  const columns = [
    { key: 'receipt_no', label: 'Receipt No.' },
    { key: 'payment_date', label: 'Date' },
    { key: 'payment_mode', label: 'Mode' },
    { key: 'paid_amount_paise', label: 'Paid', numeric: true, render: (r) => rupees(r.paid_amount_paise) },
    { key: 'concession_paise', label: 'Concession', numeric: true, render: (r) => rupees(r.concession_paise) },
    { key: 'receipt_status', label: 'Status', render: (r) => (
      <span style={{ color: r.receipt_status === 'VOID' ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600, fontSize: 13 }}>
        {r.receipt_status}
      </span>
    ) },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => handleDownload(r.id, false)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>PDF</button>
        {r.receipt_status === 'VOID' && (
          <button onClick={() => handleDownload(r.id, true)} style={{ fontSize: 12, padding: '0.3em 0.6em' }}>Void PDF</button>
        )}
        {r.receipt_status !== 'VOID' && voidingId !== r.id && (
          <button onClick={() => setVoidingId(r.id)} style={{ fontSize: 12, padding: '0.3em 0.6em', color: 'var(--color-danger)' }}>Void</button>
        )}
      </div>
    ) },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Receipts</h2>

      <div style={{ display: 'flex', gap: '1.5em', marginBottom: '1.2em' }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Flat</label>
          <select value={selectedFlatId} onChange={(e) => setSelectedFlatId(e.target.value)} style={{ padding: '0.5em 0.8em', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 14, width: 200 }}>
            {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_code}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Bill</label>
          <select value={selectedBillId} onChange={(e) => setSelectedBillId(e.target.value)} style={{ padding: '0.5em 0.8em', borderRadius: 4, border: '1px solid var(--color-border)', fontSize: 14, width: 280 }}>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>{b.bill_no} — {b.payment_status} — {rupees(b.total_payable_paise)}</option>
            ))}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)} disabled={!selectedBillId || selectedBill?.payment_status === 'PAID'}>
            {showForm ? 'Cancel' : '+ Log Payment'}
          </button>
        </div>
      </div>

      {selectedBill?.payment_status === 'PAID' && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>This bill is already fully paid.</p>
      )}

      {showForm && (
        <form onSubmit={handlePay} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '1.5em', marginBottom: '1.5em', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1em' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Payment Mode</label>
            <select value={formData.payment_mode} onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })} style={{ width: '100%', padding: '0.6em 0.8em', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Amount Paid (Rs.)</label>
            <input type="number" step="0.01" value={formData.paid_amount_paise} onChange={(e) => setFormData({ ...formData, paid_amount_paise: Math.round(Number(e.target.value) * 100) })} required />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Concession (Rs., optional)</label>
            <input type="number" step="0.01" onChange={(e) => setFormData({ ...formData, concession_paise: Math.round(Number(e.target.value) * 100) })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4, color: 'var(--color-text-muted)' }}>Committee Advice Note (required if concession given)</label>
            <input value={formData.committee_advice_note} onChange={(e) => setFormData({ ...formData, committee_advice_note: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Log Payment'}</button>
            {formError && <p className="error-text">{formError}</p>}
          </div>
        </form>
      )}

      {voidingId && (
        <div style={{ background: '#fdf0f0', border: '1px solid var(--color-danger)', padding: '1em', marginBottom: '1.2em' }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Void Reason (required)</label>
          <input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} style={{ marginBottom: 8 }} />
          <button className="btn-primary" onClick={() => handleVoid(voidingId)} style={{ background: 'var(--color-danger)', marginRight: 8 }}>Confirm Void</button>
          <button onClick={() => { setVoidingId(null); setVoidReason(''); }}>Cancel</button>
        </div>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      <DataTable columns={columns} rows={receipts} emptyMessage="No receipts logged for this flat yet." />
    </div>
  );
}
