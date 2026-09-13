/**
 * RANIKUTHI V5 — accounting module — ledger.service.js
 * L-14: every posting is a balanced debit/credit pair.
 * L-15/L-16: the ONLY thing that turns a pending_transactions row into a
 * real ledger_entries row. journal_id is UNIQUE on ledger_entries, so this
 * is naturally idempotent — running it twice on the same PENDING row is
 * impossible once it's POSTED (there's nothing left to pick up).
 */
const supabase = require('../../db');

async function postPendingTransactions(actorUserId) {
  const { data: pending, error } = await supabase
    .from('pending_transactions')
    .select('*')
    .eq('state', 'PENDING')
    .order('created_timestamp', { ascending: true });

  if (error) return { ok: false, status: 500, message: error.message };

  const results = { posted: 0, failed: 0, errors: [] };

  for (const pt of pending) {
    await supabase.from('pending_transactions').update({ state: 'PROCESSING' }).eq('id', pt.id);

    const { debit_account_code, credit_account_code, financial_year } = pt.payload || {};
    if (!debit_account_code || !credit_account_code || !financial_year) {
      await supabase.from('pending_transactions').update({
        state: 'FAILED', error_message: 'Missing debit/credit account code or financial_year in payload.',
      }).eq('id', pt.id);
      results.failed++;
      results.errors.push({ id: pt.id, error: 'Malformed payload' });
      continue;
    }

    const { error: ledgerError } = await supabase.from('ledger_entries').insert({
      journal_id: pt.id,
      financial_year,
      flat_id: pt.flat_id,
      debit_account_code, credit_account_code,
      amount_paise: pt.amount_paise,
      source_type: pt.source_type,
      source_record_id: pt.source_record_id,
      created_by: actorUserId,
    });

    if (ledgerError) {
      // L-16: defined compensating action for a failed posting — flag it
      // for manual review rather than silently retrying or dropping it.
      await supabase.from('pending_transactions').update({
        state: 'FAILED', error_message: ledgerError.message, compensation_action: 'MANUAL_CA_REVIEW_REQUIRED',
      }).eq('id', pt.id);
      results.failed++;
      results.errors.push({ id: pt.id, error: ledgerError.message });
      continue;
    }

    await supabase.from('pending_transactions').update({
      state: 'POSTED', completed_timestamp: new Date().toISOString(),
    }).eq('id', pt.id);
    results.posted++;
  }

  return { ok: true, ...results };
}

async function getLedgerEntries(filters = {}) {
  let query = supabase.from('ledger_entries').select('*').order('entry_date', { ascending: false });
  if (filters.flat_id) query = query.eq('flat_id', filters.flat_id);
  if (filters.financial_year) query = query.eq('financial_year', filters.financial_year);
  const { data, error } = await query;
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, entries: data };
}

module.exports = { postPendingTransactions, getLedgerEntries };