const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../auth/auth.middleware');
const { listSettings, updateSetting } = require('./settings.service');

router.get('/', requireAuth, requirePermission('SETTINGS.VIEW'), async (req, res) => {
  const result = await listSettings();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ settings: result.settings });
});

router.patch('/:setting_key', requireAuth, requirePermission('SETTINGS.EDIT'), async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value is required.' });
  const result = await updateSetting(req.user.id, req.user.role_name, req.params.setting_key, value);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ setting: result.setting });
});

module.exports = router;