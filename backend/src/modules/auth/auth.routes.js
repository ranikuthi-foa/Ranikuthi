const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../../db');
const { login, logout, hashPassword, generateSalt, listUsers, createUser, updateUser } = require('./auth.service');
const { requireAuth, requirePermission } = require('./auth.middleware');
const { requestOtp, verifyOtp } = require('./otp.service');

router.post('/login', async (req, res) => {
  const { mobile_number, password } = req.body;
  if (!mobile_number || !password) {
    return res.status(400).json({ error: 'mobile_number and password are required.' });
  }
  const result = await login(mobile_number, password);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.message });
  }
  res.json({ session_token: result.sessionToken, user: result.user });
});

router.post('/logout', requireAuth, async (req, res) => {
  await logout(req.user.id);
  res.json({ status: 'logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/otp/request', async (req, res) => {
  const { mobile_number } = req.body;
  if (!mobile_number) return res.status(400).json({ error: 'mobile_number is required.' });
  const result = await requestOtp(mobile_number, 'SELF_SERVICE_RESET');
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ status: 'OTP sent to registered email.' });
});

router.post('/otp/reset', async (req, res) => {
  const { mobile_number, otp, new_password } = req.body;
  if (!mobile_number || !otp || !new_password) {
    return res.status(400).json({ error: 'mobile_number, otp, and new_password are required.' });
  }
  const verify = await verifyOtp(mobile_number, otp, 'SELF_SERVICE_RESET');
  if (!verify.ok) return res.status(verify.status).json({ error: verify.message });

  const salt = generateSalt();
  const hash = hashPassword(new_password, salt);
  await supabase
    .from('users')
    .update({
      password_hash: hash,
      password_salt: salt,
      force_password_reset: false,
      account_status: 'ACTIVE',
      failed_login_count: 0,
      locked_until: null,
      active_session_token: null,
    })
    .eq('id', verify.userId);

  res.json({ status: 'Password reset. Please log in with your new password.' });
});

router.post('/admin/reset/initiate', requireAuth, requirePermission('AUTH.ADMIN_RESET'), async (req, res) => {
  const { target_mobile_number } = req.body;
  if (!target_mobile_number) return res.status(400).json({ error: 'target_mobile_number is required.' });
  const result = await requestOtp(target_mobile_number, 'ADMIN_HARD_RESET', req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ status: "OTP sent to target user's registered email.", otp_log_id: result.otpLogId });
});

router.post('/admin/reset/confirm', requireAuth, requirePermission('AUTH.ADMIN_RESET'), async (req, res) => {
  const { target_mobile_number, otp, new_password } = req.body;
  if (!target_mobile_number || !otp) {
    return res.status(400).json({ error: 'target_mobile_number and otp are required.' });
  }
  const verify = await verifyOtp(target_mobile_number, otp, 'ADMIN_HARD_RESET');
  if (!verify.ok) return res.status(verify.status).json({ error: verify.message });

  const tempPassword = new_password || crypto.randomBytes(6).toString('hex');
  const salt = generateSalt();
  const hash = hashPassword(tempPassword, salt);

  await supabase
    .from('users')
    .update({
      password_hash: hash,
      password_salt: salt,
      force_password_reset: true,
      account_status: 'ACTIVE',
      failed_login_count: 0,
      locked_until: null,
      active_session_token: null,
    })
    .eq('id', verify.userId);

  await supabase.from('admin_reset_utility').insert({
    actor_user_id: req.user.id,
    actor_role: req.user.role_name,
    target_user_id: verify.userId,
    force_password_reset_set: true,
    otp_reference: verify.otpLogId,
    status: 'COMPLETED',
  });

  await supabase.from('system_audit_trail').insert({
    actor_user_id: req.user.id,
    actor_role: req.user.role_name,
    action_type: 'ADMIN_RESET_PASSWORD',
    target_module: 'AUTH',
    target_table: 'users',
    record_key: verify.userId,
  });

  res.json({
    status: 'Password reset.',
    temp_password: new_password ? undefined : tempPassword,
  });
});

router.get('/admin/users', requireAuth, requirePermission('AUTH.USER_MANAGE'), async (req, res) => {
  const result = await listUsers();
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ users: result.users });
});

router.post('/admin/users', requireAuth, requirePermission('AUTH.USER_MANAGE'), async (req, res) => {
  const result = await createUser(req.user.id, req.user.role_name, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.status(201).json({ user: result.user, temp_password: result.temp_password });
});

router.patch('/admin/users/:id', requireAuth, requirePermission('AUTH.USER_MANAGE'), async (req, res) => {
  const result = await updateUser(req.user.id, req.user.role_name, req.params.id, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.message });
  res.json({ user: result.user });
});

module.exports = router;
