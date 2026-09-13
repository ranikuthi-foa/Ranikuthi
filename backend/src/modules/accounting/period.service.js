/**
 * RANIKUTHI V5 — accounting module — period.service.js
 * L-39: financial year 1 Jul – 30 Jun. A period can only close with a
 * named closer AND a CA sign-off note — the DB's closed_requires_signoff
 * CHECK constraint backs this up if this code is ever bypassed.
 */
const supabase = require('../../db');
const { getTrialBalance } = require('./reports.service');

async function openPeriod(actorUserId, financialYear, startDate, endDate) {
  const { data, error } = await supabase
    .from('financial_periods')
    .insert({ financial_year: financialYear, start_date: startDate, end_date: endDate, status: 'OPEN' })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, period: data };
}

async function closePeriod(actorUserId, actorRole, financialYear, caSignoffNote) {
  if (!caSignoffNote) {
    return { ok: false, status: 400, message: 'A CA sign-off note is required to close a financial period (L-39).' };
  }

  const { data: period, error } = await supabase
    .from('financial_periods').select('*').eq('financial_year', financialYear).single();
  if (error || !period) return { ok: false, status: 404, message: 'Financial period not found. Open it first.' };
  if (period.status === 'CLOSED') return { ok: false, status: 409, message: 'This period is already closed.' };

  // Any PENDING/FAILED pending_transactions for this year blocks close —
  // nothing unposted or broken should be allowed to slip past a year-end lock.
  const { data: unposted } = await supabase
    .from('pending_transactions')
    .select('id, state')
    .in('state', ['PENDING', 'PROCESSING', 'FAILED']);
  const relevantUnposted = (unposted || []); // payload.financial_year isn't indexed/filterable directly here — full check below
  const stuck = relevantUnposted.filter((pt) => true); // conservative: any unposted item at all blocks close
  if (stuck.length > 0) {
    return {
      ok: false, status: 409,
      message: `${stuck.length} transaction(s) are not yet POSTED. Resolve or post them before closing any period.`,
    };
  }

  const tb = await getTrialBalance(financialYear);
  if (!tb.ok) return tb;
  if (!tb.balanced) {
    return { ok: false, status: 409, message: 'Trial balance does not balance for this year — cannot close (L-14/L-39).' };
  }

  const { data: updated, error: updateError } = await supabase
    .from('financial_periods')
    .update({
      status: 'CLOSED',
      closed_by: actorUserId,
      closed_timestamp: new Date().toISOString(),
      ca_signoff_note: caSignoffNote,
    })
    .eq('financial_year', financialYear)
    .select()
    .single();

  if (updateError) return { ok: false, status: 400, message: updateError.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'FINANCIAL_PERIOD_CLOSED', target_module: 'ACCOUNTING',
    target_table: 'financial_periods', record_key: updated.id,
    change_details: { financial_year: financialYear, ca_signoff_note: caSignoffNote },
  });

  return { ok: true, period: updated };
}

module.exports = { openPeriod, closePeriod };