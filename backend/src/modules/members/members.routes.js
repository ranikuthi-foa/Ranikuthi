const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../auth/auth.middleware');
const { createFlat, listFlats, getOwnFlat, updateFlat } = require('./members.service');
const {
  setInitialOccupancy, recordOwnershipTransfer, transferOccupancy,
} = require('./occupancy.service');

router.post('/flats', requireAuth, requirePermission('MEMBERS.FLAT_MANAGE'), async (req, res) => {
  const result = await createFlat(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ flat: result.flat });
});

router.get('/flats', requireAuth, requirePermission('MEMBERS.FLAT_VIEW'), async (req, res) => {
  const result = await listFlats();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ flats: result.flats });
});

// Resident-safe: no flatId param taken from the client at all — always the caller's own.
router.get('/flats/me', requireAuth, requirePermission('MEMBERS.FLAT_VIEW_OWN'), async (req, res) => {
  const result = await getOwnFlat(req.user.flat_id);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ flat: result.flat });
});

router.patch('/flats/:id', requireAuth, requirePermission('MEMBERS.FLAT_MANAGE'), async (req, res) => {
  const result = await updateFlat(req.user.id, req.user.role_name, req.params.id, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ flat: result.flat });
});

router.post('/occupancy/initial', requireAuth, requirePermission('MEMBERS.OCCUPANCY_MANAGE'), async (req, res) => {
  const result = await setInitialOccupancy(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ occupancy: result.occupancy });
});

router.post('/ownership-transfer/record', requireAuth, requirePermission('MEMBERS.OWNERSHIP_TRANSFER'), async (req, res) => {
  const result = await recordOwnershipTransfer(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ transfer: result.transfer });
});

router.post('/ownership-transfer/execute', requireAuth, requirePermission('MEMBERS.OWNERSHIP_TRANSFER'), async (req, res) => {
  const { flat_id, new_owner, closed_reason, transfer_log_id } = req.body;
  const result = await transferOccupancy(req.user.id, req.user.role_name, flat_id, new_owner, closed_reason, transfer_log_id);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json(result);
});

module.exports = router;