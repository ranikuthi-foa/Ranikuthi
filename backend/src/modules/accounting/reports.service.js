/**
 * RANIKUTHI V5 — accounting module — reports.service.js
 * Trial balance: every account's net position, and proof the whole
 * book balances (total debits == total credits) — not just per-batch,
 * across the ENTIRE ledger.
 * L-17: member_balance_summary is a rebuildable read-model, always
 * derived fresh from ledger_entries — never hand-edited.
 */
const supabase = require('../../db');

async function getTrialBalance(financialYear) {
  let query = supabase.from('ledger_entries').select('debit_account_code, credit_account_code, amount_paise');
  if (financialYear) query = query.eq('financial_year', financialYear);
  const { data: entries, error } = await query;
  if (error) return { ok: false, status: 500, message: error.message };

  const { data: accounts, error: acctError } = await supabase
    .from('chart_of_accounts')
    .select('account_code, account_name, account_class, normal_balance')
    .order('account_code');
  if (acctError) return { ok: false, status: 500, message: acctError.message };

  const balances = {};
  for (const acc of accounts) {
    balances[acc.account_code] = {
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_class: acc.account_class,
      normal_balance: acc.normal_balance,
      total_debits_paise: 0,
      total_credits_paise: 0,
    };
  }

  for (const entry of entries) {
    if (balances[entry.debit_account_code]) {
      balances[entry.debit_account_code].total_debits_paise += Number(entry.amount_paise);
    }
    if (balances[entry.credit_account_code]) {
      balances[entry.credit_account_code].total_credits_paise += Number(entry.amount_paise);
    }
  }

  let grandTotalDebits = 0;
  let grandTotalCredits = 0;
  const rows = Object.values(balances)
    .map((b) => {
      grandTotalDebits += b.total_debits_paise;
      grandTotalCredits += b.total_credits_paise;
      const netPaise = b.normal_balance === 'DEBIT'
        ? b.total_debits_paise - b.total_credits_paise
        : b.total_credits_paise - b.total_debits_paise;
      return { ...b, net_balance_paise: netPaise };
    })
    .filter((b) => b.total_debits_paise !== 0 || b.total_credits_paise !== 0);

  return {
    ok: true,
    financial_year: financialYear || 'ALL',
    accounts: rows,
    grand_total_debits_paise: grandTotalDebits,
    grand_total_credits_paise: grandTotalCredits,
    balanced: grandTotalDebits === grandTotalCredits, // L-14's promise, proven at the whole-book level
  };
}

// L-17: rebuild the read-model from scratch — never trust its own prior state.
async function rebuildMemberBalanceSummary() {
  const { data: flats, error: flatsError } = await supabase.from('flats').select('id');
  if (flatsError) return { ok: false, status: 500, message: flatsError.message };

  let rebuilt = 0;
  const mismatches = [];

  for (const flat of flats) {
    const { data: bills } = await supabase
      .from('maintenance_bills').select('total_payable_paise').eq('flat_id', flat.id);
    const { data: receipts } = await supabase
      .from('payment_receipts').select('paid_amount_paise, concession_paise, payment_date')
      .eq('flat_id', flat.id).eq('receipt_status', 'ACTIVE');
    const { data: credits } = await supabase
      .from('member_credits').select('remaining_paise').eq('flat_id', flat.id).eq('status', 'OPEN');

    const totalBilled = (bills || []).reduce((s, b) => s + Number(b.total_payable_paise), 0);
    const totalPaid = (receipts || []).reduce((s, r) => s + Number(r.paid_amount_paise) + Number(r.concession_paise || 0), 0);
    const creditBalance = (credits || []).reduce((s, c) => s + Number(c.remaining_paise), 0);
    const outstanding = Math.max(totalBilled - totalPaid, 0);
    const lastPaymentDate = (receipts || []).length
      ? receipts.reduce((latest, r) => (r.payment_date > latest ? r.payment_date : latest), receipts[0].payment_date)
      : null;

    // L-17, done properly this time: compare against the ACTUAL ledger
    // balance on 13000 (Maintenance Receivable) for this flat — not
    // against other billing-table numbers, which can never disagree
    // with each other since they're the same source.
    const { data: ledgerRows } = await supabase
      .from('ledger_entries')
      .select('debit_account_code, credit_account_code, amount_paise')
      .eq('flat_id', flat.id)
      .or('debit_account_code.eq.13000,credit_account_code.eq.13000');

    let ledgerReceivable = 0;
    for (const row of ledgerRows || []) {
      if (row.debit_account_code === '13000') ledgerReceivable += Number(row.amount_paise);
      if (row.credit_account_code === '13000') ledgerReceivable -= Number(row.amount_paise);
    }

    if (ledgerReceivable !== outstanding) {
      mismatches.push({
        flat_id: flat.id,
        billing_computed_outstanding_paise: outstanding,
        ledger_receivable_paise: ledgerReceivable,
        difference_paise: outstanding - ledgerReceivable,
      });
    }

    await supabase.from('member_balance_summary').upsert({
      flat_id: flat.id,
      total_billed_paise: totalBilled,
      total_paid_paise: totalPaid,
      outstanding_paise: outstanding,
      credit_balance_paise: creditBalance,
      last_payment_date: lastPaymentDate,
      last_reconciled_timestamp: new Date().toISOString(),
    });
    rebuilt++;
  }

  return { ok: true, rebuilt, mismatches };
}

module.exports = { getTrialBalance, rebuildMemberBalanceSummary };