const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../auth/auth.middleware');
const { postPendingTransactions, getLedgerEntries } = require('./ledger.service');
const supabase = require('../../db');
const { getTrialBalance, rebuildMemberBalanceSummary } = require('./reports.service');
const { openPeriod, closePeriod } = require('./period.service');

// Manual trigger for now — a scheduled job comes later once this is proven.
router.post('/ledger/post-pending', requireAuth, requirePermission('ACCOUNTING.LEDGER_POST'), async (req, res) => {
  const result = await postPendingTransactions(req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

router.get('/ledger', requireAuth, requirePermission('ACCOUNTING.LEDGER_VIEW'), async (req, res) => {
  const result = await getLedgerEntries(req.query);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ entries: result.entries });
});

router.get('/trial-balance', requireAuth, requirePermission('ACCOUNTING.TRIAL_BALANCE_VIEW'), async (req, res) => {
  const result = await getTrialBalance(req.query.financial_year);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

router.post('/member-balance/rebuild', requireAuth, requirePermission('ACCOUNTING.MEMBER_BALANCE_REBUILD'), async (req, res) => {
  const result = await rebuildMemberBalanceSummary();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

// Deliberately no permission-matrix gate here — this is data scoping (whose
// balance), not an action permission a role either has or doesn't.
router.get('/member-balance/:flat_id', requireAuth, async (req, res) => {
  if (req.user.role_name === 'RESIDENT' && req.user.flat_id !== req.params.flat_id) {
    return res.status(403).json({ error: 'You can only view your own flat\'s balance.' });
  }
  const { data, error } = await supabase.from('member_balance_summary').select('*').eq('flat_id', req.params.flat_id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ summary: data });
});

router.post('/periods', requireAuth, requirePermission('ACCOUNTING.PERIOD_OPEN'), async (req, res) => {
  const { financial_year, start_date, end_date } = req.body;
  if (!financial_year || !start_date || !end_date) {
    return res.status(400).json({ error: 'financial_year, start_date, and end_date are required.' });
  }
  const result = await openPeriod(req.user.id, financial_year, start_date, end_date);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ period: result.period });
});

router.post('/periods/:financial_year/close', requireAuth, requirePermission('ACCOUNTING.PERIOD_CLOSE'), async (req, res) => {
  const result = await closePeriod(req.user.id, req.user.role_name, req.params.financial_year, req.body.ca_signoff_note);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ period: result.period });
});

module.exports = router;