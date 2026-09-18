/**
 * RANIKUTHI V5 (Node/Supabase) — billing module — vouchers.service.js
 * L-31: maker != checker, enforced here AND by the DB's maker_checker_distinct
 * CHECK constraint (defense in depth — API check gives a clean error message,
 * DB check is the backstop if this code path is ever bypassed).
 */
const supabase = require('../../db');
const { generateVoucherPdf } = require('../../services/pdf.service');

function expenseAccountForCategory(category) {
  const map = { Repairs: '50100', Utilities: '50200', Salaries: '50300', Depreciation: '50400' };
  return map[category] || '50900'; // Other/General Expense — default bucket
}

async function createVoucher(actorUserId, actorRole, input) {
  const {
    expense_date, category, vendor_id, base_amount_paise,
    gst_amount_paise, payment_mode, description, financial_year,
  } = input;

  if (!category || !base_amount_paise || !payment_mode || !financial_year) {
    return { ok: false, status: 400, message: 'category, base_amount_paise, payment_mode, and financial_year are required.' };
  }

  const totalAmountPaise = Number(base_amount_paise) + Number(gst_amount_paise || 0);

  const { data: seqData, error: seqError } = await supabase.rpc('next_sequence_value', {
    p_key: 'VOUCHER', p_fy: financial_year,
  });
  if (seqError) return { ok: false, status: 500, message: seqError.message };
  const voucherNo = `EV-${financial_year}-${String(seqData).padStart(4, '0')}`;

  const { data: voucher, error } = await supabase
    .from('expenses_vouchers')
    .insert({
      voucher_no: voucherNo,
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      category, vendor_id: vendor_id || null,
      base_amount_paise: Number(base_amount_paise),
      gst_amount_paise: Number(gst_amount_paise || 0),
      total_amount_paise: totalAmountPaise,
      payment_mode, description,
      maker_user_id: actorUserId,
      approval_status: 'PENDING',
    })
    .select()
    .single();

  if (error) return { ok: false, status: 500, message: error.message };

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, action_type: 'VOUCHER_CREATED', target_module: 'BILLING',
    target_table: 'expenses_vouchers', record_key: voucher.id,
  });

  return { ok: true, voucher };
}

async function approveVoucher(actorUserId, actorRole, voucherId, decision) {
  const { data: voucher, error } = await supabase
    .from('expenses_vouchers').select('*').eq('id', voucherId).single();
  if (error || !voucher) return { ok: false, status: 404, message: 'Voucher not found.' };

  if (voucher.approval_status !== 'PENDING') {
    return { ok: false, status: 409, message: `This voucher is already ${voucher.approval_status}.` };
  }

  // L-31: API-level check for a clean error message before ever hitting the DB.
  if (voucher.maker_user_id === actorUserId) {
    return { ok: false, status: 403, message: 'Maker and checker must be different people (L-31) — you created this voucher.' };
  }

  const newStatus = decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';

  const { data: updated, error: updateError } = await supabase
    .from('expenses_vouchers')
    .update({ checker_user_id: actorUserId, approval_status: newStatus })
    .eq('id', voucherId)
    .select()
    .single();

  if (updateError) {
    // If this ever fires, it's the DB's maker_checker_distinct constraint catching
    // something the API check above should have already caught — defense in depth working as intended.
    return { ok: false, status: 400, message: updateError.message };
  }

  await supabase.from('system_audit_trail').insert({
    actor_user_id: actorUserId, action_type: `VOUCHER_${newStatus}`, target_module: 'BILLING',
    target_table: 'expenses_vouchers', record_key: voucherId,
  });

    if (newStatus === 'APPROVED') {
    await supabase.from('pending_transactions').insert({
      source_type: 'EXPENSE_VOUCHER_APPROVED', source_record_id: voucherId,
      amount_paise: voucher.total_amount_paise, actor_user_id: actorUserId,
      payload: {
        debit_account_code: expenseAccountForCategory(voucher.category),
        credit_account_code: voucher.payment_mode === 'CASH' ? '11000' : '12000',
        financial_year: voucher.voucher_no.split('-')[1] + '-' + voucher.voucher_no.split('-')[2],
      },
    });
  }

    if (newStatus === 'APPROVED') {
    try {
      let vendorName = null;
      if (updated.vendor_id) {
        const { data: vendor } = await supabase.from('vendor_master').select('vendor_name').eq('id', updated.vendor_id).single();
        vendorName = vendor ? vendor.vendor_name : null;
      }
      const { data: makerUser } = await supabase.from('users').select('full_name').eq('id', updated.maker_user_id).single();
      const { data: checkerUser } = await supabase.from('users').select('full_name').eq('id', updated.checker_user_id).single();

      const { storagePath, dataHash } = await generateVoucherPdf(
        updated, vendorName, makerUser ? makerUser.full_name : null, checkerUser ? checkerUser.full_name : null
      );
      await supabase.from('expenses_vouchers')
        .update({ voucher_pdf_url: storagePath, sha256_hash: dataHash })
        .eq('id', voucherId);
      updated.voucher_pdf_url = storagePath;
      updated.sha256_hash = dataHash;
    } catch (pdfErr) {
      console.error('PDF generation failed for voucher', voucherId, pdfErr.message);
    }
  }

  return { ok: true, voucher: updated };
}

async function listVouchers(filters = {}) {
  let query = supabase.from('expenses_vouchers').select('*').order('created_timestamp', { ascending: false });
  if (filters.approval_status) query = query.eq('approval_status', filters.approval_status);
  const { data, error } = await query;
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, vouchers: data };
}

module.exports = { createVoucher, approveVoucher, listVouchers };
