/**
 * RANIKUTHI V5 — settings module — settings.service.js
 * Every setting carries its own editable_by_role — an edit is only valid
 * if the ACTOR'S role matches that specific row's editable_by_role, not
 * just "is this person an Admin in general."
 */
const supabase = require('../../db');

async function listSettings() {
  const { data, error } = await supabase
    .from('global_settings')
    .select('*')
    .order('setting_key');
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, settings: data };
}

function coerceValue(rawValue, valueType) {
  if (valueType === 'NUMBER') {
    const n = Number(rawValue);
    if (Number.isNaN(n)) return { error: `Value must be a valid number for value_type NUMBER.` };
    return { value: String(n) };
  }
  if (valueType === 'BOOLEAN') {
    if (rawValue !== 'true' && rawValue !== 'false') {
      return { error: `Value must be exactly "true" or "false" for value_type BOOLEAN.` };
    }
    return { value: rawValue };
  }
  if (valueType === 'JSON') {
    try {
      JSON.parse(rawValue);
      return { value: rawValue };
    } catch {
      return { error: `Value must be valid JSON for value_type JSON.` };
    }
  }
  return { value: String(rawValue) }; // STRING — no coercion needed
}

async function updateSetting(actorUserId, actorRole, settingKey, newValue) {
  const { data: existing, error: fetchError } = await supabase
    .from('global_settings').select('*').eq('setting_key', settingKey).single();
  if (fetchError || !existing) return { ok: false, status: 404, message: 'Setting not found.' };

  // The actual per-row gate — not just "is this role Admin," but "is this
  // role the one THIS setting names as its editor."
  if (existing.editable_by_role && existing.editable_by_role !== actorRole) {
    return { ok: false, status: 403, message: `This setting can only be edited by role ${existing.editable_by_role}.` };
  }

  const coerced = coerceValue(newValue, existing.value_type);
  if (coerced.error) return { ok: false, status: 400, message: coerced.error };

  const { data: updated, error } = await supabase
    .from('global_settings')
    .update({
      setting_value: coerced.value,
      updated_timestamp: new Date().toISOString(),
      updated_by: actorUserId,
    })
    .eq('setting_key', settingKey)
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'SETTING_UPDATED', target_module: 'SETTINGS',
    target_table: 'global_settings', record_key: settingKey,
    change_details: { old_value: existing.setting_value, new_value: coerced.value },
  });

  return { ok: true, setting: updated };
}

module.exports = { listSettings, updateSetting };