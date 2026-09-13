/**
 * RANIKUTHI V5 — complaints module — directory.service.js
 * Service_Directory: read-mostly reference list, Admin-managed.
 * Notices_Circulars: L-40 — default channel is email.
 */
const supabase = require('../../db');
const { sendGenericEmail } = require('../../services/email.service');

async function addServiceProvider(actorUserId, input) {
  const { category, provider_name, contact_number, description } = input;
  if (!category || !provider_name || !contact_number) {
    return { ok: false, status: 400, message: 'category, provider_name, and contact_number are required.' };
  }
  const { data, error } = await supabase
    .from('service_directory')
    .insert({ category, provider_name, contact_number, description, created_by: actorUserId })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, provider: data };
}

async function listServiceProviders() {
  const { data, error } = await supabase
    .from('service_directory').select('*').eq('active_flag', true).order('category');
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, providers: data };
}

// L-40: default channel is email, targeted (specific flats) or global (all users).
async function postNotice(actorUserId, input) {
  const { title, category, target_audience, content_summary, document_drive_url } = input;
  if (!title) return { ok: false, status: 400, message: 'title is required.' };

  const { data: notice, error } = await supabase
    .from('notices_circulars')
    .insert({
      title, category,
      target_audience: target_audience || 'ALL',
      content_summary, document_drive_url,
      posted_by: actorUserId,
    })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  // Best-effort email fan-out — a notice still exists even if email delivery has issues.
  const { data: recipients } = await supabase
    .from('users')
    .select('email_address')
    .not('email_address', 'is', null);

  let emailsSent = 0;
  for (const r of recipients || []) {
    try {
      await sendGenericEmail(r.email_address, `Notice: ${title}`, content_summary || title);
      emailsSent++;
    } catch (e) {
      // Deliberately swallowed per-recipient — one bad address shouldn't block the rest.
    }
  }

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, action_type: 'NOTICE_POSTED', target_module: 'COMPLAINTS',
    target_table: 'notices_circulars', record_key: notice.id, change_details: { emails_sent: emailsSent },
  });

  return { ok: true, notice, emailsSent };
}

async function listNotices() {
  const { data, error } = await supabase
    .from('notices_circulars').select('*').order('date_posted', { ascending: false });
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, notices: data };
}

module.exports = { addServiceProvider, listServiceProviders, postNotice, listNotices };