/**
 * RANIKUTHI V5 (Node/Supabase) — billing module — billing.service.js
 * L-05: rate resolution — flat-specific override > global flat rate > per-sqft.
 * L-06: one bill per flat per period (checked here AND by the DB unique constraint).
 * L-07: penalty modes — FLAT_RATE / PERCENTAGE / PER_DAY.
 * L-13: gap-free bill numbering via the next_sequence_value() DB function.
 * L-30: paise always rounds UP (Math.ceil), never nearest/truncated.
 */
const supabase = require('../../db');

const { generateBillPdf } = require('../../services/pdf.service');

async function getSettings(keys) {
  const { data, error } = await supabase
    .from('global_settings')
    .select('setting_key, setting_value')
    .in('setting_key', keys);
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data) map[row.setting_key] = row.setting_value;
  return map;
}

function resolveBaseCharge(flat, settings) {
  if (flat.rate_mode_override === 'FLAT_SPECIFIC' && flat.rate_value_override_paise != null) {
    return Number(flat.rate_value_override_paise);
  }
  const mode = settings.BILLING_RATE_MODE || 'PER_SQFT';
  if (mode === 'GLOBAL_FLAT') {
    const rate = Number(settings.GLOBAL_FLAT_RATE_PAISE);
    if (!rate) throw new Error('GLOBAL_FLAT_RATE_PAISE is not configured.');
    return Math.ceil(rate);
  }
  const perSqft = Number(settings.PER_SQFT_RATE_PAISE);
  if (!perSqft) throw new Error('PER_SQFT_RATE_PAISE is not configured.');
  if (!flat.area_sqft) throw new Error('This flat has no area_sqft on file — cannot compute a per-sqft rate.');
  return Math.ceil(perSqft * Number(flat.area_sqft));
}

function calculateFine(overdueAmountPaise, daysOverdue, mode, settings) {
  if (overdueAmountPaise <= 0 || daysOverdue <= 0) return 0;
  if (mode === 'FLAT_RATE') return Math.ceil(Number(settings.PENALTY_FLAT_RATE_PAISE || 0));
  if (mode === 'PERCENTAGE') {
    const pct = Number(settings.PENALTY_PERCENTAGE || 0);
    return Math.ceil(overdueAmountPaise * (pct / 100));
  }
  const perDay = Number(settings.PENALTY_PER_DAY_PAISE || 0);
  return Math.ceil(perDay * daysOverdue);
}

async function generateMaintenanceBill(actorUserId, actorRole, input) {
  const { flat_id, bill_month_year, financial_year, due_date } = input;
  if (!flat_id || !bill_month_year || !financial_year || !due_date) {
    return { ok: false, status: 400, message: 'flat_id, bill_month_year, financial_year, and due_date are required.' };
  }

  const { data: existingBill } = await supabase
    .from('maintenance_bills')
    .select('id')
    .eq('flat_id', flat_id)
    .eq('bill_month_year', bill_month_year)
    .maybeSingle();
  if (existingBill) {
    return { ok: false, status: 409, message: `A bill for this flat and period (${bill_month_year}) already exists (L-06).` };
  }

  const { data: flat, error: flatError } = await supabase.from('flats').select('*').eq('id', flat_id).single();
  if (flatError || !flat) return { ok: false, status: 404, message: 'Flat not found.' };

  const settings = await getSettings([
    'BILLING_RATE_MODE', 'PER_SQFT_RATE_PAISE', 'GLOBAL_FLAT_RATE_PAISE',
    'PENALTY_MODE', 'PENALTY_FLAT_RATE_PAISE', 'PENALTY_PERCENTAGE', 'PENALTY_PER_DAY_PAISE',
  ]);

  let baseChargePaise;
  try {
    baseChargePaise = resolveBaseCharge(flat, settings);
  } catch (e) {
    return { ok: false, status: 400, message: e.message };
  }

  const { data: priorBills, error: priorError } = await supabase
    .from('maintenance_bills')
    .select('id, total_payable_paise, due_date, payment_status')
    .eq('flat_id', flat_id)
    .neq('payment_status', 'PAID');
  if (priorError) return { ok: false, status: 500, message: priorError.message };

  let previousUnpaidPaise = 0;
  let lateFinePaise = 0;
  const today = new Date();

  for (const bill of priorBills || []) {
    const { data: receipts } = await supabase
      .from('payment_receipts')
      .select('paid_amount_paise')
      .eq('bill_id', bill.id)
      .eq('receipt_status', 'ACTIVE');
    const paidSoFar = (receipts || []).reduce((sum, r) => sum + Number(r.paid_amount_paise) + Number(r.concession_paise || 0), 0);
    const outstanding = Number(bill.total_payable_paise) - paidSoFar;
    if (outstanding <= 0) continue;
    previousUnpaidPaise += outstanding;

    const dueDateObj = new Date(bill.due_date);
    if (today > dueDateObj) {
      const daysOverdue = Math.floor((today - dueDateObj) / (1000 * 60 * 60 * 24));
      lateFinePaise += calculateFine(outstanding, daysOverdue, settings.PENALTY_MODE || 'PER_DAY', settings);
    }
  }

  const totalPayablePaise = baseChargePaise + previousUnpaidPaise + lateFinePaise;

  const { data: seqData, error: seqError } = await supabase.rpc('next_sequence_value', {
    p_key: 'BILL', p_fy: financial_year,
  });
  if (seqError) return { ok: false, status: 500, message: seqError.message };
  const billNo = `MB-${financial_year}-${String(seqData).padStart(4, '0')}`;

  const { data: newBill, error: insertError } = await supabase
    .from('maintenance_bills')
    .insert({
      bill_no: billNo, flat_id, bill_month_year, financial_year,
      base_charge_paise: baseChargePaise,
      previous_unpaid_paise: previousUnpaidPaise,
      late_fine_paise: lateFinePaise,
      total_payable_paise: totalPayablePaise,
      due_date, payment_status: 'UNPAID', created_by: actorUserId,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return { ok: false, status: 409, message: 'A bill for this flat and period already exists (L-06).' };
    }
    return { ok: false, status: 500, message: insertError.message };
  }

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, actor_role: actorRole,
    action_type: 'MAINTENANCE_BILL_GENERATED', target_module: 'BILLING',
    target_table: 'maintenance_bills', record_key: newBill.id,
  });

    // L-15/L-16: hand off to accounting via pending_transactions — billing never
  // writes ledger_entries directly. Split into separate legs since each
  // ledger_entries row is exactly one debit/credit pair (L-14).
  if (baseChargePaise > 0) {
    await supabase.from('pending_transactions').insert({
      source_type: 'BILL_BASE_CHARGE', source_record_id: newBill.id, flat_id,
      amount_paise: baseChargePaise, actor_user_id: actorUserId,
      payload: { debit_account_code: '13000', credit_account_code: '40100', financial_year },
    });
  }
  if (lateFinePaise > 0) {
    await supabase.from('pending_transactions').insert({
      source_type: 'BILL_LATE_FINE', source_record_id: newBill.id, flat_id,
      amount_paise: lateFinePaise, actor_user_id: actorUserId,
      payload: { debit_account_code: '13000', credit_account_code: '40300', financial_year },
    });
  }

    try {
    const { data: currentOcc } = await supabase
      .from('occupancy').select('owner_name, owner_mobile').eq('flat_id', flat_id).eq('is_current', true).maybeSingle();
    const { data: flatRow } = await supabase.from('flats').select('flat_code').eq('id', flat_id).single();
    const { storagePath, dataHash } = await generateBillPdf(
      newBill, flatRow ? flatRow.flat_code : flat_id,
      currentOcc ? currentOcc.owner_name : null, currentOcc ? currentOcc.owner_mobile : null
    );
    await supabase.from('maintenance_bills')
      .update({ pdf_drive_url: storagePath, sha256_hash: dataHash })
      .eq('id', newBill.id);
    newBill.pdf_drive_url = storagePath;
    newBill.sha256_hash = dataHash;
  } catch (pdfErr) {
    // Deliberately non-fatal — the bill itself is already valid without its PDF.
    console.error('PDF generation failed for bill', newBill.id, pdfErr.message);
  }

  return { ok: true, bill: newBill };
}

async function getBillsForFlat(flatId) {
  const { data, error } = await supabase
    .from('maintenance_bills')
    .select('*')
    .eq('flat_id', flatId)
    .order('bill_month_year', { ascending: false });
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, bills: data };
}

module.exports = { generateMaintenanceBill, getBillsForFlat, resolveBaseCharge, calculateFine };