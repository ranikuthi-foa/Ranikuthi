const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../auth/auth.middleware');
const { generateMaintenanceBill, getBillsForFlat, getReceiptsForFlat } = require('./billing.service');
const supabase = require('../../db');
const { recordPayment, voidReceipt } = require('./receipts.service');
const { createVoucher, approveVoucher, listVouchers } = require('./vouchers.service');
const { createMiscBill, listMiscBills, recordMiscReceipt, voidMiscReceipt } = require('./misc.service');
const { generateStatementPdf } = require('../../services/statement.service');

router.post('/bills/generate', requireAuth, requirePermission('BILLING.BILL_GENERATE'), async (req, res) => {
  const result = await generateMaintenanceBill(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ bill: result.bill });
});

// RESIDENT can only see their own flat's bills; ADMIN/COMMITTEE can see any flat via ?flat_id=
router.get('/bills', requireAuth, async (req, res) => {
  let flatId = req.query.flat_id;
  if (req.user.role_name === 'RESIDENT') {
    if (!req.user.flat_id) return res.status(403).json({ error: 'No flat linked to this account.' });
    flatId = req.user.flat_id;
  }
  if (!flatId) return res.status(400).json({ error: 'flat_id query parameter is required.' });
  const result = await getBillsForFlat(flatId);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ bills: result.bills });
});

router.post('/receipts', requireAuth, requirePermission('BILLING.RECEIPT_MANAGE'), async (req, res) => {
  const result = await recordPayment(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json(result);
});

router.post('/receipts/:id/void', requireAuth, requirePermission('BILLING.RECEIPT_MANAGE'), async (req, res) => {
  const result = await voidReceipt(req.user.id, req.user.role_name, req.params.id, req.body.void_reason);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

router.get('/receipts', requireAuth, async (req, res) => {
  let flatId = req.query.flat_id;
  if (req.user.role_name === 'RESIDENT') {
    if (!req.user.flat_id) return res.status(403).json({ error: 'No flat linked to this account.' });
    flatId = req.user.flat_id;
  }
  if (!flatId) return res.status(400).json({ error: 'flat_id query parameter is required.' });
  const result = await getReceiptsForFlat(flatId);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ receipts: result.receipts });
});

router.post('/vouchers', requireAuth, requirePermission('BILLING.VOUCHER_CREATE'), async (req, res) => {
  const result = await createVoucher(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ voucher: result.voucher });
});

router.post('/vouchers/:id/approve', requireAuth, requirePermission('BILLING.VOUCHER_APPROVE'), async (req, res) => {
  const result = await approveVoucher(req.user.id, req.user.role_name, req.params.id, req.body.decision);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ voucher: result.voucher });
});

router.get('/vouchers', requireAuth, requirePermission('BILLING.VOUCHER_VIEW'), async (req, res) => {
  const result = await listVouchers(req.query);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ vouchers: result.vouchers });
});

router.post('/misc-bills', requireAuth, requirePermission('BILLING.MISC_BILL_MANAGE'), async (req, res) => {
  const result = await createMiscBill(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ bill: result.bill });
});

router.get('/misc-bills', requireAuth, async (req, res) => {
  const result = await listMiscBills(req.query);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ bills: result.bills });
});

router.post('/misc-receipts', requireAuth, requirePermission('BILLING.MISC_RECEIPT_MANAGE'), async (req, res) => {
  const result = await recordMiscReceipt(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json(result);
});

router.post('/misc-receipts/:id/void', requireAuth, requirePermission('BILLING.MISC_RECEIPT_MANAGE'), async (req, res) => {
  const result = await voidMiscReceipt(req.user.id, req.user.role_name, req.params.id, req.body.void_reason);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

router.get('/flats/:flat_id/statement', requireAuth, async (req, res) => {
  if (req.user.role_name === 'RESIDENT' && req.user.flat_id !== req.params.flat_id) {
    return res.status(403).json({ error: 'You can only view your own flat\'s statement.' });
  }
  if (req.user.role_name !== 'RESIDENT') {
    const { data } = await supabase.from('roles_permission_matrix')
      .select('allowed').eq('role_name', req.user.role_name).eq('permission_key', 'BILLING.STATEMENT_VIEW').maybeSingle();
    if (!data || !data.allowed) return res.status(403).json({ error: 'Not permitted to view statements.' });
  }

  try {
    const buffer = await generateStatementPdf(req.params.flat_id, req.query.from, req.query.to);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="statement_${req.params.flat_id}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
