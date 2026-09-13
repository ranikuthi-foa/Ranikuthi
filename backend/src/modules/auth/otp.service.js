/**
 * RANIKUTHI V5 — otp.service.js
 * L-36: OTP purposes — FIRST_LOGIN / ADMIN_HARD_RESET / SELF_SERVICE_RESET.
 * Delivery is always EMAIL, matching the otp_log CHECK constraint.
 */
const crypto = require('crypto');
const supabase = require('../../db');
const { sendOtpEmail } = require('../../services/email.service');

const OTP_EXPIRY_MINUTES = 10;

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

async function requestOtp(mobileNumber, purpose, requestedByUserId = null) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email_address')
    .eq('mobile_number', mobileNumber)
    .single();

  if (error || !user) {
    return { ok: false, status: 404, message: 'No user found for that mobile number.' };
  }
  if (!user.email_address) {
    return { ok: false, status: 400, message: 'No email on file for this user — OTP cannot be delivered.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiryTimestamp = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000).toISOString();

  const { data: otpRow, error: insertError } = await supabase
    .from('otp_log')
    .insert({
      user_id: user.id,
      purpose,
      delivery_channel: 'EMAIL',
      otp_hash: otpHash,
      expiry_timestamp: expiryTimestamp,
      status: 'PENDING',
      requested_by: requestedByUserId,
    })
    .select()
    .single();

  if (insertError) {
    return { ok: false, status: 500, message: insertError.message };
  }

  await sendOtpEmail(user.email_address, otp, purpose);

  return { ok: true, otpLogId: otpRow.id, userId: user.id };
}

async function verifyOtp(mobileNumber, otp, purpose) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('mobile_number', mobileNumber)
    .single();

  if (error || !user) return { ok: false, status: 404, message: 'User not found.' };

  const { data: otpRow, error: otpError } = await supabase
    .from('otp_log')
    .select('*')
    .eq('user_id', user.id)
    .eq('purpose', purpose)
    .eq('status', 'PENDING')
    .order('requested_timestamp', { ascending: false })
    .limit(1)
    .single();

  if (otpError || !otpRow) return { ok: false, status: 400, message: 'No pending OTP found. Request a new one.' };

  if (new Date(otpRow.expiry_timestamp) < new Date()) {
    await supabase.from('otp_log').update({ status: 'EXPIRED' }).eq('id', otpRow.id);
    return { ok: false, status: 400, message: 'OTP expired. Request a new one.' };
  }

  if (hashOtp(otp) !== otpRow.otp_hash) {
    return { ok: false, status: 401, message: 'Incorrect OTP.' };
  }

  await supabase
    .from('otp_log')
    .update({ status: 'VERIFIED', verified_timestamp: new Date().toISOString() })
    .eq('id', otpRow.id);

  return { ok: true, otpLogId: otpRow.id, userId: user.id };
}

module.exports = { requestOtp, verifyOtp };