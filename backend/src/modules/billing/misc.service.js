/**
 * RANIKUTHI V5 — billing module — misc.service.js
 * L-19: puja receipts, donations, and other one-off collections are
 * first-class — their own bill/receipt records and their own ledger
 * legs, never folded into maintenance billing's machinery.
 * Deliberately NO carry-forward and NO L-05 rate resolution here —
 * a misc bill is a stated amount for a stated purpose, not a recurring charge.
 */
const supabase = require('../../db');

async function createMiscBill(actorUserId, actorRole, input) {
  const { flat_id, category, description, amount_paise, due_date } = input;
  if (!category || !amount_paise) {
    return { ok: false, status: 400, message: 'category and amount_paise are required.' };
  }

  const { data: bill, error } = await supabase
    .from('misc_bills')
    .insert({
      flat_id: flat_id || null, category, description,
      amount_paise: Number(amount_paise), due_date: due_date || null,
      payment_status: 'UNPAID', created_by: actorUserId,
    })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'MISC_BILL_CREATED', target_module: 'BILLING',
    target_table: 'misc_bills', record_key: bill.id,
  });

  return { ok: true, bill };
}

async function listMiscBills(filters = {}) {
  let query = supabase.from('misc_bills').select('*').order('created_timestamp', { ascending: false });
  if (filters.flat_id) query = query.eq('flat_id', filters.flat_id);
  if (filters.category) query = query.eq('category', filters.category);
  const { data, error } = await query;
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, bills: data };
}

async function recordMiscReceipt(actorUserId, actorRole, input) {
  const { misc_bill_id, payer_name, flat_id, payment_mode, amount_paise, category } = input;
  if (!payer_name || !payment_mode || !amount_paise || !category) {
    return { ok: false, status: 400, message: 'payer_name, payment_mode, amount_paise, and category are required.' };
  }

  let financialYear = input.financial_year;
  let bill = null;
  if (misc_bill_id) {
    const { data: fetchedBill, error: billError } = await supabase
      .from('misc_bills').select('*').eq('id', misc_bill_id).single();
    if (billError || !fetchedBill) return { ok: false, status: 404, message: 'misc_bill_id not found.' };
    bill = fetchedBill;
    if (bill.payment_status === 'PAID') {
      return { ok: false, status: 409, message: 'This misc bill is already fully paid.' };
    }
  }
  if (!financialYear) {
    return { ok: false, status: 400, message: 'financial_year is required (needed for ledger posting and receipt numbering).' };
  }

  const { data: seqData, error: seqError } = await supabase.rpc('next_sequence_value', {
    p_key: 'MISC_RECEIPT', p_fy: financialYear,
  });
  if (seqError) return { ok: false, status: 500, message: seqError.message };
  const miscReceiptNo = `MR-${financialYear}-${String(seqData).padStart(4, '0')}`;

  const { data: receipt, error } = await supabase
    .from('misc_receipts')
    .insert({
      misc_receipt_no: miscReceiptNo, misc_bill_id: misc_bill_id || null,
      payer_name, flat_id: flat_id || (bill ? bill.flat_id : null),
      payment_mode, amount_paise: Number(amount_paise), category,
      receipt_status: 'ACTIVE', logged_by: actorUserId,
    })
    .select()
    .single();
  if (error) return { ok: false, status: 500, message: error.message };

  if (bill) {
    const { data: existingReceipts } = await supabase
      .from('misc_receipts').select('amount_paise').eq('misc_bill_id', bill.id).eq('receipt_status', 'ACTIVE');
    const totalPaid = (existingReceipts || []).reduce((s, r) => s + Number(r.amount_paise), 0);
    const newStatus = totalPaid >= Number(bill.amount_paise) ? 'PAID' : 'PARTIAL';
    await supabase.from('misc_bills').update({ payment_status: newStatus }).eq('id', bill.id);
  }

  // L-15/L-16: post to pending_transactions — same handoff discipline as maintenance billing.
  const cashAccount = payment_mode === 'CASH' ? '11000' : '12000';
  await supabase.from('pending_transactions').insert({
    source_type: 'MISC_RECEIPT', source_record_id: receipt.id, flat_id: receipt.flat_id,
    amount_paise: Number(amount_paise), actor_user_id: actorUserId,
    payload: { debit_account_code: cashAccount, credit_account_code: '40200', financial_year: financialYear },
  });

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'MISC_RECEIPT_LOGGED', target_module: 'BILLING',
    target_table: 'misc_receipts', record_key: receipt.id,
  });

  return { ok: true, receipt };
}

async function voidMiscReceipt(actorUserId, actorRole, receiptId, voidReason) {
  if (!voidReason) return { ok: false, status: 400, message: 'A void_reason is required.' };

  const { data: receipt, error } = await supabase
    .from('misc_receipts').select('*').eq('id', receiptId).single();
  if (error || !receipt) return { ok: false, status: 404, message: 'Misc receipt not found.' };
  if (receipt.receipt_status === 'VOID') return { ok: false, status: 409, message: 'Already void.' };

  await supabase.from('misc_receipts').update({ receipt_status: 'VOID', void_reason: voidReason }).eq('id', receiptId);

  if (receipt.misc_bill_id) {
    const { data: activeReceipts } = await supabase
      .from('misc_receipts').select('amount_paise').eq('misc_bill_id', receipt.misc_bill_id).eq('receipt_status', 'ACTIVE');
    const { data: bill } = await supabase.from('misc_bills').select('amount_paise').eq('id', receipt.misc_bill_id).single();
    const totalPaid = (activeReceipts || []).reduce((s, r) => s + Number(r.amount_paise), 0);
    const newStatus = totalPaid >= Number(bill.amount_paise) ? 'PAID' : (totalPaid > 0 ? 'PARTIAL' : 'UNPAID');
    await supabase.from('misc_bills').update({ payment_status: newStatus }).eq('id', receipt.misc_bill_id);
  }

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'MISC_RECEIPT_VOIDED', target_module: 'BILLING',
    target_table: 'misc_receipts', record_key: receiptId, change_details: { void_reason: voidReason },
  });

  return { ok: true, status: 'voided' };
}

module.exports = { createMiscBill, listMiscBills, recordMiscReceipt, voidMiscReceipt };