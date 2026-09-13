/**
 * RANIKUTHI V5 (Node/Supabase rebuild) — backend/src/db.js
 * Single Supabase client, service_role key. RLS stays off; this backend
 * IS the access-control layer (L-04 enforced here, not in Postgres RLS).
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;