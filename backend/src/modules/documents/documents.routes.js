const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const supabase = require('../../db');
const { signDownloadToken, verifyDownloadToken } = require('../../services/downloadToken.service');

const TABLES = {
  bill: 'maintenance_bills',
  receipt: 'payment_receipts',
  voucher: 'expenses_vouchers',
};

async function resolveAndAuthorize(req, type, id, wantVoidCopy) {
  const table = TABLES[type];
  if (!table) return { error: { status: 400, message: 'type must be bill, receipt, or voucher.' } };

  const { data: record, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error || !record) return { error: { status: 404, message: 'Document not found.' } };

  if (req.user.role_name === 'RESIDENT' && record.flat_id !== req.user.flat_id) {
    return { error: { status: 403, message: 'You can only download documents for your own flat.' } };
  }

  const pdfPath = wantVoidCopy
    ? record.void_pdf_url
    : (type === 'voucher' ? record.voucher_pdf_url : record.pdf_drive_url);

  if (!pdfPath) return { error: { status: 404, message: 'No PDF has been generated for this record yet.' } };
  return { pdfPath };
}

// Authenticated — mints a short-lived, FIRST-PARTY download token. The
// browser never sees Supabase's domain or storage path at any point.
router.get('/:type/:id/download', requireAuth, async (req, res) => {
  const { error, pdfPath } = await resolveAndAuthorize(req, req.params.type, req.params.id, false);
  if (error) return res.status(error.status).json({ error: error.message });
  res.json({ url: `/documents/file?token=${signDownloadToken(pdfPath)}`, expires_in_seconds: 300 });
});

router.get('/receipt/:id/void-download', requireAuth, async (req, res) => {
  const { error, pdfPath } = await resolveAndAuthorize(req, 'receipt', req.params.id, true);
  if (error) return res.status(error.status).json({ error: error.message });
  res.json({ url: `/documents/file?token=${signDownloadToken(pdfPath)}`, expires_in_seconds: 300 });
});

// Deliberately NOT behind requireAuth — a plain link click can't carry an
// Authorization header. Trust comes entirely from the signed, short-lived
// token minted above, only after the real permission check already passed.
router.get('/file', async (req, res) => {
  const data = verifyDownloadToken(req.query.token);
  if (!data) return res.status(401).json({ error: 'Invalid or expired download link.' });

  const { data: fileBlob, error } = await supabase.storage.from('documents').download(data.storagePath);
  if (error || !fileBlob) return res.status(404).json({ error: 'File not found.' });

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${data.storagePath.split('/').pop()}"`);
  res.send(buffer);
});

module.exports = router;
