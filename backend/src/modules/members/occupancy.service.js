/**
 * RANIKUTHI V5 (Node/Supabase) — members module — occupancy.service.js
 * L-38: dues cleared/written-off BEFORE transfer; old occupancy closed,
 * never deleted; new occupancy linked to a real transfer_log row.
 */
const supabase = require('../../db');

async function getCurrentOccupancy(flatId) {
  const { data, error } = await supabase
    .from('occupancy')
    .select('*')
    .eq('flat_id', flatId)
    .eq('is_current', true)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, occupancy: data };
}

async function setInitialOccupancy(actorUserId, actorRole, occData) {
  const { flat_id, owner_name, owner_mobile, owner_email, occupancy_status } = occData;

  const existing = await getCurrentOccupancy(flat_id);
  if (existing.ok && existing.occupancy) {
    return { ok: false, status: 409, message: 'This flat already has a current occupant. Use transferOccupancy instead.' };
  }

  const { data, error } = await supabase
    .from('occupancy')
    .insert({
      flat_id, owner_name, owner_mobile, owner_email,
      occupancy_status: occupancy_status || 'OWNER_OCCUPIED',
      is_current: true,
      created_by: actorUserId,
    })
    .select()
    .single();

  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'OCCUPANCY_SET_INITIAL', target_module: 'MEMBERS',
    target_table: 'occupancy', record_key: data.id,
  });

  return { ok: true, occupancy: data };
}

/** Step 1 of L-38: records dues settlement as its own auditable fact BEFORE any occupancy change happens. */
async function recordOwnershipTransfer(actorUserId, actorRole, transferData) {
  const { flat_id, previous_owner_name, new_owner_name, dues_cleared_amount_paise, written_off_amount_paise, write_off_approved_by } = transferData;

  if ((written_off_amount_paise || 0) > 0 && !write_off_approved_by) {
    return { ok: false, status: 400, message: 'A write-off amount requires a named approver (L-38).' };
  }

  const { data, error } = await supabase
    .from('ownership_transfer_log')
    .insert({
      flat_id, previous_owner_name, new_owner_name,
      dues_cleared_amount_paise: dues_cleared_amount_paise || 0,
      written_off_amount_paise: written_off_amount_paise || 0,
      write_off_approved_by: write_off_approved_by || null,
    })
    .select()
    .single();

  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'OWNERSHIP_TRANSFER_RECORDED', target_module: 'MEMBERS',
    target_table: 'ownership_transfer_log', record_key: data.id,
  });

  return { ok: true, transfer: data };
}

/** Step 2 of L-38: the actual occupancy swap. REFUSES without a valid, EXISTING transfer_log row — the whole point of the gate. */
async function transferOccupancy(actorUserId, actorRole, flatId, newOwnerData, closedReason, transferLogId) {
  const { data: transferRow, error: transferError } = await supabase
    .from('ownership_transfer_log')
    .select('*')
    .eq('id', transferLogId)
    .eq('flat_id', flatId)
    .maybeSingle();

  if (transferError || !transferRow) {
    return { ok: false, status: 400, message: 'A valid, existing transfer_log_id for this flat is required (L-38) — dues must be recorded first.' };
  }

  const current = await getCurrentOccupancy(flatId);
  if (!current.ok || !current.occupancy) {
    return { ok: false, status: 404, message: 'No current occupancy found for this flat — use setInitialOccupancy instead.' };
  }

  // Close the old record — never delete (L-38).
  const { error: closeError } = await supabase
    .from('occupancy')
    .update({ is_current: false, effective_to: new Date().toISOString().slice(0, 10), closed_reason: closedReason || 'OWNERSHIP_TRANSFER' })
    .eq('id', current.occupancy.id);
  if (closeError) return { ok: false, status: 500, message: closeError.message };

  // Open the new one.
  const { data: newOcc, error: newOccError } = await supabase
    .from('occupancy')
    .insert({
      flat_id: flatId,
      owner_name: newOwnerData.owner_name,
      owner_mobile: newOwnerData.owner_mobile,
      owner_email: newOwnerData.owner_email,
      occupancy_status: newOwnerData.occupancy_status || 'OWNER_OCCUPIED',
      is_current: true,
      created_by: actorUserId,
    })
    .select()
    .single();
  if (newOccError) return { ok: false, status: 500, message: newOccError.message };

  // Link both occupancy IDs back onto the transfer record — closes the audit loop.
  await supabase
    .from('ownership_transfer_log')
    .update({ linked_occupancy_id_closed: current.occupancy.id, linked_occupancy_id_new: newOcc.id })
    .eq('id', transferLogId);

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'OCCUPANCY_TRANSFERRED', target_module: 'MEMBERS',
    target_table: 'occupancy', record_key: newOcc.id,
    change_details: { closed_occupancy_id: current.occupancy.id, transfer_log_id: transferLogId },
  });

  return { ok: true, closedOccupancyId: current.occupancy.id, newOccupancyId: newOcc.id };
}

module.exports = { getCurrentOccupancy, setInitialOccupancy, recordOwnershipTransfer, transferOccupancy };