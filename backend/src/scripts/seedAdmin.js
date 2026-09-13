require('dotenv').config();
const supabase = require('../db');
const { hashPassword, generateSalt } = require('../modules/auth/auth.service');

async function seed() {
  const mobile = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || 'Admin User';

  if (!mobile || !password) {
    console.log('Usage: node src/scripts/seedAdmin.js <mobile_number> <password> ["Full Name"]');
    process.exit(1);
  }

  const salt = generateSalt();
  const hash = hashPassword(password, salt);

  const { data, error } = await supabase
    .from('users')
    .insert({
      full_name: fullName,
      mobile_number: mobile,
      role_name: 'ADMIN',
      password_hash: hash,
      password_salt: salt,
      account_status: 'ACTIVE',
    })
    .select();

  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
  console.log('Admin created:', data[0].id, data[0].mobile_number);
}

seed();