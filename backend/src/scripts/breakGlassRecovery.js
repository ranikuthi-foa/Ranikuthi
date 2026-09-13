require('dotenv').config();
const supabase = require('../db');
const { hashPassword, generateSalt } = require('../modules/auth/auth.service');

async function run() {
  const mobile = process.argv[2];
  const newPassword = process.argv[3];
  const justification = process.argv.slice(4).join(' ');

  if (!mobile || !newPassword || !justification) {
    console.log('Usage: node src/scripts/breakGlassRecovery.js <admin_mobile_number> <new_password> <justification note...>');
    process.exit(1);
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, role_name')
    .eq('mobile_number', mobile)
    .single();

  if (error || !user) {
    console.error('No user found for that mobile number.');
    process.exit(1);
  }
  if (user.role_name !== 'ADMIN') {
    console.error('Break-glass recovery is for Admin accounts only (L-28).');
    process.exit(1);
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);

  await supabase
    .from('users')
    .update({
      password_hash: hash,
      password_salt: salt,
      account_status: 'ACTIVE',
      failed_login_count: 0,
      locked_until: null,
      force_password_reset: true,
      active_session_token: null,
    })
    .eq('id', user.id);

  await supabase.from('system_audit_trail').insert({
    actor_user_id: null, // no authenticated actor — this ran outside the app entirely
    action_type: 'BREAK_GLASS_RECOVERY',
    target_module: 'AUTH',
    target_table: 'users',
    record_key: user.id,
    justification_note: justification,
  });

  console.log('Break-glass recovery complete for', mobile, '— force_password_reset set TRUE.');
}

run();