const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const { getSignedDownloadUrl } = require('../../services/pdf.service');
const supabase = require('../../db');

const TABLES = {
  bill: 'maintenance_bills',
  receipt: 'payment_receipts',
  voucher: 'expenses_vouchers',
};

router.get('/:type/:id/download', requireAuth, async (req, res) => {
  const table = TABLES[req.params.type];
  if (!table) return res.status(400).json({ error: 'type must be bill, receipt, or voucher.' });

  const { data: record, error } = await supabase.from(table).select('*').eq('id', req.params.id).single();
  if (error || !record) return res.status(404).json({ error: 'Document not found.' });

  if (req.user.role_name === 'RESIDENT' && record.flat_id !== req.user.flat_id) {
    return res.status(403).json({ error: 'You can only download documents for your own flat.' });
  }
  const pdfPath = req.params.type === 'voucher' ? record.voucher_pdf_url : record.pdf_drive_url;
  if (!pdfPath) return res.status(404).json({ error: 'No PDF has been generated for this record yet.' });

  const result = await getSignedDownloadUrl(pdfPath);
  if (!result.ok) return res.status(500).json({ error: result.message });
  res.json({ url: result.url, expires_in_seconds: 300 });
});

router.get('/receipt/:id/void-download', requireAuth, async (req, res) => {
  const { data: record, error } = await supabase.from('payment_receipts').select('*').eq('id', req.params.id).single();
  if (error || !record) return res.status(404).json({ error: 'Receipt not found.' });

  if (req.user.role_name === 'RESIDENT' && record.flat_id !== req.user.flat_id) {
    return res.status(403).json({ error: 'You can only download documents for your own flat.' });
  }
  if (!record.void_pdf_url) return res.status(404).json({ error: 'This receipt has no void record, or was never voided.' });

  const result = await getSignedDownloadUrl(record.void_pdf_url);
  if (!result.ok) return res.status(500).json({ error: result.message });
  res.json({ url: result.url, expires_in_seconds: 300 });
});

module.exports = router;