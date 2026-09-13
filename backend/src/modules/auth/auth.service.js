/**
 * RANIKUTHI V5 — auth module — auth.service.js
 * L-01: mobile-only login. L-02: 5 fails -> 15 min lock. L-03: 30 min
 * inactivity / 12 hr absolute session timeout, new login kills old token.
 */
const crypto = require('crypto');
const supabase = require('../../db');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const INACTIVITY_TIMEOUT_MINUTES = 30;
const ABSOLUTE_TIMEOUT_HOURS = 12;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function logAudit(actorUserId, actionType, details) {
  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId,
    action_type: actionType,
    target_module: 'AUTH',
    target_table: 'users',
    record_key: actorUserId,
    change_details: details || null,
  });
}

async function login(mobileNumber, password) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('mobile_number', mobileNumber)
    .single();

  // L-01: don't reveal whether the mobile number exists at all
  if (error || !user) {
    return { ok: false, status: 401, message: 'Invalid mobile number or password.' };
  }

  // L-02: lockout is self-clearing once locked_until has passed
  const now = new Date();
  if (user.account_status === 'LOCKED' && user.locked_until) {
    if (new Date(user.locked_until) > now) {
      return { ok: false, status: 423, message: 'Account locked. Try again later.' };
    }
    // lock window expired — self-clear before proceeding
    await supabase
      .from('users')
      .update({ account_status: 'ACTIVE', failed_login_count: 0, locked_until: null })
      .eq('id', user.id);
    user.account_status = 'ACTIVE';
    user.failed_login_count = 0;
  }

  if (user.account_status === 'DISABLED') {
    return { ok: false, status: 403, message: 'Account disabled. Contact an Admin.' };
  }

  const computedHash = hashPassword(password, user.password_salt);
  const validPassword = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(user.password_hash, 'hex')
  );

  if (!validPassword) {
    const failedCount = user.failed_login_count + 1;
    const update = { failed_login_count: failedCount };
    if (failedCount >= LOCKOUT_THRESHOLD) {
      update.account_status = 'LOCKED';
      update.locked_until = new Date(now.getTime() + LOCKOUT_MINUTES * 60000).toISOString();
    }
    await supabase.from('users').update(update).eq('id', user.id);
    await logAudit(user.id, failedCount >= LOCKOUT_THRESHOLD ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILURE');
    if (failedCount >= LOCKOUT_THRESHOLD) {
      return { ok: false, status: 423, message: `Account locked for ${LOCKOUT_MINUTES} minutes after too many failed attempts.` };
    }
    return { ok: false, status: 401, message: 'Invalid mobile number or password.' };
  }

  // L-03: a new login invalidates any prior session token for this user
  const sessionToken = generateSessionToken();
  await supabase
    .from('users')
    .update({
      failed_login_count: 0,
      active_session_token: sessionToken,
      session_issued_at: now.toISOString(),
      last_activity_timestamp: now.toISOString(),
      last_login_timestamp: now.toISOString(),
    })
    .eq('id', user.id);

  await logAudit(user.id, 'LOGIN_SUCCESS');

  return {
    ok: true,
    sessionToken,
    user: {
      id: user.id,
      full_name: user.full_name,
      role_name: user.role_name,
      flat_id: user.flat_id,
      force_password_reset: user.force_password_reset,
    },
  };
}

async function verifySessionToken(token) {
  if (!token) return null;

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('active_session_token', token)
    .single();

  if (error || !user) return null;

  const now = new Date();
  const issuedAt = new Date(user.session_issued_at);
  const lastActivity = new Date(user.last_activity_timestamp);

  const hoursSinceIssued = (now - issuedAt) / (1000 * 60 * 60);
  const minutesSinceActivity = (now - lastActivity) / (1000 * 60);

  if (hoursSinceIssued > ABSOLUTE_TIMEOUT_HOURS || minutesSinceActivity > INACTIVITY_TIMEOUT_MINUTES) {
    // L-03: expired session — clear it so it can't be reused
    await supabase
      .from('users')
      .update({ active_session_token: null, session_issued_at: null })
      .eq('id', user.id);
    return null;
  }

  // sliding inactivity window: touch last_activity_timestamp
  await supabase
    .from('users')
    .update({ last_activity_timestamp: now.toISOString() })
    .eq('id', user.id);

  return {
    id: user.id,
    full_name: user.full_name,
    role_name: user.role_name,
    flat_id: user.flat_id,
    force_password_reset: user.force_password_reset,
  };
}

async function logout(userId) {
  await supabase
    .from('users')
    .update({ active_session_token: null, session_issued_at: null })
    .eq('id', userId);
  await logAudit(userId, 'LOGOUT');
}

module.exports = { login, verifySessionToken, logout, hashPassword, generateSalt };