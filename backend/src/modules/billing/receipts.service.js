/**
 * RANIKUTHI V5 (Node/Supabase) — billing module — receipts.service.js
 * L-08: waterfall — payment first clears fine, then previous unpaid, then current base.
 * L-09/L-32: any amount paid beyond the bill's total becomes Member Credit (liability).
 * L-10: concession_paise > 0 requires committee_advice_note (DB CHECK backs this up too).
 * L-11: receipts are immutable — void + reversal only, never UPDATE on a paid amount.
 */
const supabase = require('../../db');

const { generateReceiptPdf, generateVoidedReceiptPdf } = require('../../services/pdf.service');

function cashAccountForMode(paymentMode) {
  return paymentMode === 'CASH' ? '11000' : '12000'; // Cash vs Bank Accounts
}

async function logReceipt(bill, payment, actorUserId) {
  const { data: seqData, error: seqError } = await supabase.rpc('next_sequence_value', {
    p_key: 'RECEIPT', p_fy: bill.financial_year,
  });
  if (seqError) return { ok: false, status: 500, message: seqError.message };
  const receiptNo = `RC-${bill.financial_year}-${String(seqData).padStart(4, '0')}`;

  const {
    payment_date, payment_mode, paid_amount_paise,
    concession_paise, committee_advice_note,
  } = payment;

  if ((concession_paise || 0) > 0 && !committee_advice_note) {
    return { ok: false, status: 400, message: 'A concession requires a Committee Advice Note (L-10).' };
  }

  // Fetch existing ACTIVE receipts to know what's already been paid toward this bill.
  const { data: existingReceipts, error: existingError } = await supabase
    .from('payment_receipts')
    .select('paid_amount_paise, concession_paise')
    .eq('bill_id', bill.id)
    .eq('receipt_status', 'ACTIVE');
  if (existingError) return { ok: false, status: 500, message: existingError.message };

  const alreadyCredited = (existingReceipts || []).reduce(
    (sum, r) => sum + Number(r.paid_amount_paise) + Number(r.concession_paise || 0), 0
  );
  const stillOwed = Number(bill.total_payable_paise) - alreadyCredited;

  const incomingTotal = Number(paid_amount_paise) + Number(concession_paise || 0);
  // L-08 waterfall: amount applied to THIS bill is capped at what's still owed;
  // anything beyond that is overpayment (L-09), never applied here.
  const appliedToThisBill = Math.min(incomingTotal, Math.max(stillOwed, 0));
  const overpaymentPaise = Math.max(incomingTotal - Math.max(stillOwed, 0), 0);
  const balanceRemainingPaise = Math.max(stillOwed - incomingTotal, 0);

  const { data: receipt, error: insertError } = await supabase
    .from('payment_receipts')
    .insert({
      receipt_no: receiptNo,
      bill_id: bill.id,
      flat_id: bill.flat_id,
      payment_date: payment_date || new Date().toISOString().slice(0, 10),
      payment_mode,
      paid_amount_paise: Number(paid_amount_paise),
      concession_paise: Number(concession_paise || 0),
      committee_advice_note: committee_advice_note || null,
      balance_remaining_paise: balanceRemainingPaise,
      logged_by: actorUserId,
    })
    .select()
    .single();

  if (insertError) return { ok: false, status: 500, message: insertError.message };

  // Update bill's payment_status based on what's now covered.
  const newStatus = balanceRemainingPaise <= 0 ? 'PAID' : (alreadyCredited + incomingTotal > 0 ? 'PARTIAL' : 'UNPAID');
  await supabase.from('maintenance_bills').update({ payment_status: newStatus }).eq('id', bill.id);

  let creditRow = null;
  if (overpaymentPaise > 0) {
    const { data: credit, error: creditError } = await supabase
      .from('member_credits')
      .insert({
        flat_id: bill.flat_id,
        source_receipt_no: receiptNo,
        credit_paise: overpaymentPaise,
        remaining_paise: overpaymentPaise,
        status: 'OPEN',
        created_by: actorUserId,
      })
      .select()
      .single();
    if (creditError) return { ok: false, status: 500, message: creditError.message };
    creditRow = credit;
  }

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, action_type: 'RECEIPT_LOGGED', target_module: 'BILLING',
    target_table: 'payment_receipts', record_key: receipt.id,
  });

    // L-15/L-16: post to pending_transactions, split into legs matching what
  // actually happened — concession (contra-income), cash applied to the
  // bill, and cash that became a member credit are three distinct facts.
  const cashAccount = cashAccountForMode(payment_mode);
  const concessionAmt = Number(concession_paise || 0);
  const cashAppliedToReceivable = Math.max(appliedToThisBill - concessionAmt, 0);

  if (concessionAmt > 0) {
    await supabase.from('pending_transactions').insert({
      source_type: 'RECEIPT_CONCESSION', source_record_id: receipt.id, flat_id: bill.flat_id,
      amount_paise: concessionAmt, actor_user_id: actorUserId,
      payload: { debit_account_code: '40500', credit_account_code: '13000', financial_year: bill.financial_year },
    });
  }
  if (cashAppliedToReceivable > 0) {
    await supabase.from('pending_transactions').insert({
      source_type: 'RECEIPT_CASH_APPLIED', source_record_id: receipt.id, flat_id: bill.flat_id,
      amount_paise: cashAppliedToReceivable, actor_user_id: actorUserId,
      payload: { debit_account_code: cashAccount, credit_account_code: '13000', financial_year: bill.financial_year },
    });
  }
  if (overpaymentPaise > 0) {
    await supabase.from('pending_transactions').insert({
      source_type: 'RECEIPT_OVERPAYMENT_CREDIT', source_record_id: receipt.id, flat_id: bill.flat_id,
      amount_paise: overpaymentPaise, actor_user_id: actorUserId,
      payload: { debit_account_code: cashAccount, credit_account_code: '23100', financial_year: bill.financial_year },
    });
  }

    try {
    const { data: flatRow } = await supabase.from('flats').select('flat_code').eq('id', bill.flat_id).single();
    const { data: currentOcc } = await supabase
      .from('occupancy').select('owner_name').eq('flat_id', bill.flat_id).eq('is_current', true).maybeSingle();
    const { storagePath, dataHash } = await generateReceiptPdf(
      receipt, flatRow ? flatRow.flat_code : bill.flat_id,
      currentOcc ? currentOcc.owner_name : null, bill.bill_no
    );
    await supabase.from('payment_receipts')
      .update({ pdf_drive_url: storagePath, sha256_hash: dataHash })
      .eq('id', receipt.id);
    receipt.pdf_drive_url = storagePath;
    receipt.sha256_hash = dataHash;
  } catch (pdfErr) {
    console.error('PDF generation failed for receipt', receipt.id, pdfErr.message);
  }

  return { ok: true, receipt, billStatus: newStatus, memberCredit: creditRow };
}

async function recordPayment(actorUserId, actorRole, input) {
  const { bill_id } = input;
  if (!bill_id) return { ok: false, status: 400, message: 'bill_id is required.' };

  const { data: bill, error: billError } = await supabase
    .from('maintenance_bills').select('*').eq('id', bill_id).single();
  if (billError || !bill) return { ok: false, status: 404, message: 'Bill not found.' };
  if (bill.payment_status === 'PAID') {
    return { ok: false, status: 409, message: 'This bill is already fully paid.' };
  }

  return logReceipt(bill, input, actorUserId);
}

// L-11: never edit a receipt. Void it, then (optionally) log a fresh corrected one.
async function voidReceipt(actorUserId, actorRole, receiptId, voidReason) {
  if (!voidReason) return { ok: false, status: 400, message: 'A void_reason is required.' };

  const { data: receipt, error } = await supabase
    .from('payment_receipts').select('*').eq('id', receiptId).single();
  if (error || !receipt) return { ok: false, status: 404, message: 'Receipt not found.' };
  if (receipt.receipt_status === 'VOID') {
    return { ok: false, status: 409, message: 'This receipt is already void.' };
  }

  await supabase
    .from('payment_receipts')
    .update({ receipt_status: 'VOID', void_reason: voidReason })
    .eq('id', receiptId);

  // Recompute the bill's status from scratch now that this receipt no longer counts.
  const { data: bill } = await supabase.from('maintenance_bills').select('*').eq('id', receipt.bill_id).single();
  const { data: activeReceipts } = await supabase
    .from('payment_receipts')
    .select('paid_amount_paise, concession_paise')
    .eq('bill_id', receipt.bill_id)
    .eq('receipt_status', 'ACTIVE');
  const totalCredited = (activeReceipts || []).reduce(
    (sum, r) => sum + Number(r.paid_amount_paise) + Number(r.concession_paise || 0), 0
  );
  const newStatus = totalCredited >= Number(bill.total_payable_paise)
    ? 'PAID' : (totalCredited > 0 ? 'PARTIAL' : 'UNPAID');
  await supabase.from('maintenance_bills').update({ payment_status: newStatus }).eq('id', bill.id);

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, action_type: 'RECEIPT_VOIDED', target_module: 'BILLING',
    target_table: 'payment_receipts', record_key: receiptId, change_details: { void_reason: voidReason },
  });

    try {
    const { data: flatRow } = await supabase.from('flats').select('flat_code').eq('id', bill.flat_id).single();
    const { data: currentOcc } = await supabase
      .from('occupancy').select('owner_name').eq('flat_id', bill.flat_id).eq('is_current', true).maybeSingle();
    const { storagePath, dataHash } = await generateVoidedReceiptPdf(
      receipt, flatRow ? flatRow.flat_code : bill.flat_id,
      currentOcc ? currentOcc.owner_name : null, bill.bill_no, voidReason
    );
    // L-25: a NEW object with _VOID appended — the original receipt PDF/hash
    // are left completely untouched (L-11 immutability), this is a separate record.
    await supabase.from('payment_receipts')
      .update({ void_pdf_url: storagePath })
      .eq('id', receiptId);
  } catch (pdfErr) {
    console.error('Void PDF generation failed for receipt', receiptId, pdfErr.message);
  }

  return { ok: true, status: 'voided', newBillStatus: newStatus };
}

module.exports = { recordPayment, voidReceipt };