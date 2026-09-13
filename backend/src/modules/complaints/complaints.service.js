/**
 * RANIKUTHI V5 — complaints module — complaints.service.js
 * L-04: RESIDENT sees only their own flat's complaints; ADMIN/COMMITTEE see all.
 */
const supabase = require('../../db');

async function raiseComplaint(actorUserId, actorRole, input) {
  const { flat_id, category, title, description, priority, photo_drive_url } = input;
  if (!category || !title) return { ok: false, status: 400, message: 'category and title are required.' };

  const { data, error } = await supabase
    .from('complaints')
    .insert({
      flat_id: flat_id || null,
      raised_by_user_id: actorUserId,
      category, title, description,
      priority: priority || 'NORMAL',
      photo_drive_url: photo_drive_url || null,
      status: 'OPEN',
    })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'COMPLAINT_RAISED', target_module: 'COMPLAINTS',
    target_table: 'complaints', record_key: data.id,
  });

  return { ok: true, complaint: data };
}

async function listComplaints(actorUserId, actorRole, actorFlatId, filters = {}) {
  let query = supabase.from('complaints').select('*').order('raised_timestamp', { ascending: false });
  if (actorRole === 'RESIDENT') {
    if (!actorFlatId) return { ok: true, complaints: [] };
    query = query.eq('flat_id', actorFlatId);
  }
  if (filters.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, complaints: data };
}

async function assignComplaint(actorUserId, actorRole, complaintId, assignedToUserId, adminNotes) {
  const { data, error } = await supabase
    .from('complaints')
    .update({
      assigned_to_user_id: assignedToUserId,
      admin_notes: adminNotes || null,
      status: 'IN_PROGRESS',
      last_updated_timestamp: new Date().toISOString(),
    })
    .eq('id', complaintId)
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'COMPLAINT_ASSIGNED', target_module: 'COMPLAINTS',
    target_table: 'complaints', record_key: complaintId,
  });

  return { ok: true, complaint: data };
}

async function closeComplaint(actorUserId, actorRole, complaintId, closureType, closureRemarks) {
  if (!closureType) return { ok: false, status: 400, message: 'closure_type is required (e.g. RESOLVED, DUPLICATE, NOT_ACTIONABLE).' };

  const { data: existing, error: fetchError } = await supabase
    .from('complaints').select('status').eq('id', complaintId).single();
  if (fetchError || !existing) return { ok: false, status: 404, message: 'Complaint not found.' };
  if (existing.status === 'CLOSED') return { ok: false, status: 409, message: 'This complaint is already closed.' };

  const { data, error } = await supabase
    .from('complaints')
    .update({
      status: 'CLOSED',
      closed_by_user_id: actorUserId,
      closure_type: closureType,
      closure_remarks: closureRemarks || null,
      closed_timestamp: new Date().toISOString(),
      last_updated_timestamp: new Date().toISOString(),
    })
    .eq('id', complaintId)
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'COMPLAINT_CLOSED', target_module: 'COMPLAINTS',
    target_table: 'complaints', record_key: complaintId,
    change_details: { closure_type: closureType },
  });

  return { ok: true, complaint: data };
}

module.exports = { raiseComplaint, listComplaints, assignComplaint, closeComplaint };