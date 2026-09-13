/**
 * RANIKUTHI V5 (Node/Supabase) — members module — members.service.js
 * L-38 groundwork: flats CRUD. Admin/Committee manage; Residents read own flat only.
 */
const supabase = require('../../db');

async function createFlat(actorUserId, actorRole, flatData) {
  const { flat_code, wing, flat_no, area_sqft, floor, flat_type } = flatData;

  const { data: existing } = await supabase
    .from('flats')
    .select('id')
    .eq('flat_code', flat_code)
    .maybeSingle();

  if (existing) {
    return { ok: false, status: 409, message: `Flat ${flat_code} already exists.` };
  }

  const { data, error } = await supabase
    .from('flats')
    .insert({
      flat_code, wing, flat_no,
      area_sqft: area_sqft || null,
      floor: floor || null,
      flat_type: flat_type || null,
      created_by: actorUserId,
    })
    .select()
    .single();

  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId,
    actor_role: actorRole,
    action_type: 'FLAT_CREATED',
    target_module: 'MEMBERS',
    target_table: 'flats',
    record_key: data.id,
    change_details: { flat_code },
  });

  return { ok: true, flat: data };
}

async function listFlats() {
  const { data, error } = await supabase.from('flats').select('*').order('flat_code');
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, flats: data };
}

/** Resident-safe: only ever returns the caller's OWN flat, ignoring any flat_id argument — same pattern as the Sheets version's viewOwnBalance(). */
async function getOwnFlat(userFlatId) {
  if (!userFlatId) return { ok: false, status: 400, message: 'This account is not linked to a flat.' };

  const { data, error } = await supabase.from('flats').select('*').eq('id', userFlatId).single();
  if (error || !data) return { ok: false, status: 404, message: 'Flat not found.' };
  return { ok: true, flat: data };
}

async function updateFlat(actorUserId, actorRole, flatId, updates) {
  const allowedFields = ['wing', 'flat_no', 'area_sqft', 'floor', 'flat_type', 'rate_mode_override', 'rate_value_override_paise', 'active_flag'];
  const sanitized = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }
  sanitized.updated_timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from('flats')
    .update(sanitized)
    .eq('id', flatId)
    .select()
    .single();

  if (error || !data) return { ok: false, status: 404, message: 'Flat not found or update failed.' };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId,
    actor_role: actorRole,
    action_type: 'FLAT_UPDATED',
    target_module: 'MEMBERS',
    target_table: 'flats',
    record_key: flatId,
    change_details: sanitized,
  });

  return { ok: true, flat: data };
}

module.exports = { createFlat, listFlats, getOwnFlat, updateFlat };