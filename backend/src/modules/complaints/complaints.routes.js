const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../auth/auth.middleware');
const { raiseComplaint, listComplaints, assignComplaint, closeComplaint } = require('./complaints.service');
const { addServiceProvider, listServiceProviders, postNotice, listNotices } = require('./directory.service');

router.post('/complaints', requireAuth, async (req, res) => {
  const body = { ...req.body };
  if (req.user.role_name === 'RESIDENT') body.flat_id = req.user.flat_id; // Residents can only raise for their own flat
  const result = await raiseComplaint(req.user.id, req.user.role_name, body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ complaint: result.complaint });
});

router.get('/complaints', requireAuth, async (req, res) => {
  const result = await listComplaints(req.user.id, req.user.role_name, req.user.flat_id, req.query);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ complaints: result.complaints });
});

router.post('/complaints/:id/assign', requireAuth, requirePermission('COMPLAINTS.ASSIGN'), async (req, res) => {
  const { assigned_to_user_id, admin_notes } = req.body;
  const result = await assignComplaint(req.user.id, req.user.role_name, req.params.id, assigned_to_user_id, admin_notes);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ complaint: result.complaint });
});

router.post('/complaints/:id/close', requireAuth, requirePermission('COMPLAINTS.CLOSE'), async (req, res) => {
  const { closure_type, closure_remarks } = req.body;
  const result = await closeComplaint(req.user.id, req.user.role_name, req.params.id, closure_type, closure_remarks);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ complaint: result.complaint });
});

router.post('/service-directory', requireAuth, requirePermission('COMPLAINTS.SERVICE_DIRECTORY_MANAGE'), async (req, res) => {
  const result = await addServiceProvider(req.user.id, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ provider: result.provider });
});

router.get('/service-directory', requireAuth, async (req, res) => {
  const result = await listServiceProviders();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ providers: result.providers });
});

router.post('/notices', requireAuth, requirePermission('COMPLAINTS.NOTICE_POST'), async (req, res) => {
  const result = await postNotice(req.user.id, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ notice: result.notice, emailsSent: result.emailsSent });
});

router.get('/notices', requireAuth, async (req, res) => {
  const result = await listNotices();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ notices: result.notices });
});

module.exports = router;