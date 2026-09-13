/**
 * RANIKUTHI V5 — statement.service.js
 * Flat-level running statement — opening balance, every bill and receipt
 * (maintenance AND misc, per L-19) in chronological order, closing balance.
 * Generated fresh on every request — never stored, never hashed. This is
 * a live snapshot, not a fixed document like a bill/receipt/voucher.
 */
const PDFDocument = require('pdfkit');
const supabase = require('../db');

const CM = 28.3465;
const MARGIN = 1 * CM;
const GREY_BORDER = '#999999';
const GREY_TEXT = '#333333';
const BORDER_WIDTH = 0.25 * 2.83465;

const rupees = (paise) => (Number(paise) / 100).toFixed(2);

async function getLetterheadSettings() {
  const { data } = await supabase
    .from('global_settings').select('setting_key, setting_value')
    .in('setting_key', ['SOCIETY_NAME', 'SOCIETY_ADDRESS']);
  const map = {};
  for (const row of data || []) map[row.setting_key] = row.setting_value;
  return { societyName: map.SOCIETY_NAME || 'SOCIETY NAME NOT CONFIGURED', address: map.SOCIETY_ADDRESS || '' };
}

async function buildFlatStatementLines(flatId, fromDate, toDate) {
  const dateFilter = (query, col) => {
    if (fromDate) query = query.gte(col, fromDate);
    if (toDate) query = query.lte(col, toDate);
    return query;
  };

  let mBillsQ = supabase.from('maintenance_bills').select('*').eq('flat_id', flatId);
  mBillsQ = dateFilter(mBillsQ, 'created_timestamp');
  const { data: mBills } = await mBillsQ;

  let miscBillsQ = supabase.from('misc_bills').select('*').eq('flat_id', flatId);
  miscBillsQ = dateFilter(miscBillsQ, 'created_timestamp');
  const { data: miscBills } = await miscBillsQ;

  let receiptsQ = supabase.from('payment_receipts').select('*').eq('flat_id', flatId);
  receiptsQ = dateFilter(receiptsQ, 'payment_date');
  const { data: receipts } = await receiptsQ;

  let miscReceiptsQ = supabase.from('misc_receipts').select('*').eq('flat_id', flatId);
  miscReceiptsQ = dateFilter(miscReceiptsQ, 'payment_date');
  const { data: miscReceipts } = await miscReceiptsQ;

  const lines = [];

  for (const b of mBills || []) {
    lines.push({
      date: b.created_timestamp, particulars: `Maintenance Bill ${b.bill_no} (${b.bill_month_year})`,
      debit: Number(b.total_payable_paise) - Number(b.previous_unpaid_paise), // avoid double-counting carried-forward amounts already billed earlier
      credit: 0,
    });
  }
  for (const b of miscBills || []) {
    lines.push({
      date: b.created_timestamp, particulars: `${b.category}${b.description ? ' - ' + b.description : ''} (${b.id.slice(0, 8)})`,
      debit: Number(b.amount_paise), credit: 0,
    });
  }
  for (const r of receipts || []) {
    lines.push({
      date: r.payment_date, particulars: `Receipt ${r.receipt_no}${r.receipt_status === 'VOID' ? ' [VOIDED - ' + (r.void_reason || 'no reason given') + ']' : ''}`,
      debit: 0,
      credit: r.receipt_status === 'VOID' ? 0 : Number(r.paid_amount_paise) + Number(r.concession_paise || 0),
      isVoid: r.receipt_status === 'VOID',
    });
  }
  for (const r of miscReceipts || []) {
    lines.push({
      date: r.payment_date, particulars: `Misc Receipt ${r.misc_receipt_no} (${r.category})${r.receipt_status === 'VOID' ? ' [VOIDED]' : ''}`,
      debit: 0, credit: r.receipt_status === 'VOID' ? 0 : Number(r.amount_paise),
      isVoid: r.receipt_status === 'VOID',
    });
  }

  lines.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Opening balance: everything for this flat strictly BEFORE fromDate, if one was given.
  let openingBalance = 0;
  if (fromDate) {
    const { data: priorBills } = await supabase.from('maintenance_bills').select('total_payable_paise, previous_unpaid_paise').eq('flat_id', flatId).lt('created_timestamp', fromDate);
    const { data: priorMisc } = await supabase.from('misc_bills').select('amount_paise').eq('flat_id', flatId).lt('created_timestamp', fromDate);
    const { data: priorReceipts } = await supabase.from('payment_receipts').select('paid_amount_paise, concession_paise').eq('flat_id', flatId).eq('receipt_status', 'ACTIVE').lt('payment_date', fromDate);
    const { data: priorMiscReceipts } = await supabase.from('misc_receipts').select('amount_paise').eq('flat_id', flatId).eq('receipt_status', 'ACTIVE').lt('payment_date', fromDate);

    const priorDebit = (priorBills || []).reduce((s, b) => s + (Number(b.total_payable_paise) - Number(b.previous_unpaid_paise)), 0)
      + (priorMisc || []).reduce((s, b) => s + Number(b.amount_paise), 0);
    const priorCredit = (priorReceipts || []).reduce((s, r) => s + Number(r.paid_amount_paise) + Number(r.concession_paise || 0), 0)
      + (priorMiscReceipts || []).reduce((s, r) => s + Number(r.amount_paise), 0);
    openingBalance = priorDebit - priorCredit;
  }

  let running = openingBalance;
  for (const line of lines) {
    running += line.debit - line.credit;
    line.balance = running;
  }

  return { lines, openingBalance, closingBalance: running };
}

function drawLetterhead(doc, societyName, address) {
  const pageWidth = doc.page.width;
  doc.fillColor(GREY_TEXT).font('Helvetica-Bold').fontSize(18)
    .text(societyName, 0, MARGIN, { width: pageWidth, align: 'center' });
  doc.font('Helvetica').fontSize(14)
    .text(address, 0, MARGIN + 26, { width: pageWidth, align: 'center' });
  const hrY = MARGIN + 48;
  doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER)
    .moveTo(MARGIN, hrY).lineTo(pageWidth - MARGIN, hrY).stroke().restore();
  return hrY;
}

async function generateStatementPdf(flatId, fromDate, toDate) {
  const { societyName, address } = await getLetterheadSettings();
  const { data: flat } = await supabase.from('flats').select('flat_code').eq('id', flatId).single();
  const { data: occ } = await supabase.from('occupancy').select('owner_name').eq('flat_id', flatId).eq('is_current', true).maybeSingle();
  const { lines, openingBalance, closingBalance } = await buildFlatStatementLines(flatId, fromDate, toDate);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const bottomLimit = doc.page.height - MARGIN - 40;
    const colWidths = [65, 260, 75, 75, 75]; // Date | Particulars | Debit | Credit | Balance

    let hrY = drawLetterhead(doc, societyName, address);
    doc.font('Helvetica').fontSize(11).fillColor(GREY_TEXT)
      .text(`Statement for Flat: ${flat ? flat.flat_code : flatId}`, MARGIN, hrY + 15)
      .text(`Owner: ${occ ? occ.owner_name : 'N/A'}`, MARGIN, hrY + 32)
      .text(`Period: ${fromDate || 'Beginning'} to ${toDate || 'Present'}`, MARGIN, hrY + 49);

    let y = hrY + 75;

    function drawTableHeaderRow(yPos) {
      const headers = ['Date', 'Particulars', 'Debit', 'Credit', 'Balance'];
      const rowH = 20;
      doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER);
      doc.rect(MARGIN, yPos, colWidths.reduce((a, b) => a + b, 0), rowH).stroke();
      let x = MARGIN;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY_TEXT);
      for (let i = 0; i < headers.length; i++) {
        doc.moveTo(x, yPos).lineTo(x, yPos + rowH).stroke();
        doc.text(headers[i], x + 3, yPos + 5, { width: colWidths[i] - 6 });
        x += colWidths[i];
      }
      doc.moveTo(x, yPos).lineTo(x, yPos + rowH).stroke();
      doc.restore();
      return yPos + rowH;
    }

    function drawRow(yPos, cells, isVoid) {
      const rowH = 18;
      doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER);
      doc.rect(MARGIN, yPos, colWidths.reduce((a, b) => a + b, 0), rowH).stroke();
      let x = MARGIN;
      doc.font('Helvetica').fontSize(8.5).fillColor(isVoid ? '#bbbbbb' : GREY_TEXT);
      for (let i = 0; i < cells.length; i++) {
        doc.moveTo(x, yPos).lineTo(x, yPos + rowH).stroke();
        const align = i >= 2 ? 'right' : 'left';
        const pad = i >= 2 ? 6 : 3;
        doc.text(cells[i], x + 3, yPos + 4, { width: colWidths[i] - pad, align });
        x += colWidths[i];
      }
      doc.moveTo(x, yPos).lineTo(x, yPos + rowH).stroke();
      doc.restore();
      return yPos + rowH;
    }

    y = drawTableHeaderRow(y);
    y = drawRow(y, ['', 'Opening Balance', '', '', rupees(openingBalance)], false);

    for (const line of lines) {
      if (y + 18 > bottomLimit) {
        doc.addPage();
        hrY = drawLetterhead(doc, societyName, address);
        y = drawTableHeaderRow(hrY + 15);
      }
      y = drawRow(y, [
        new Date(line.date).toLocaleDateString('en-IN'),
        line.particulars,
        line.debit ? rupees(line.debit) : '',
        line.credit ? rupees(line.credit) : '',
        rupees(line.balance),
      ], line.isVoid);
    }

    if (y + 18 > bottomLimit) {
      doc.addPage();
      hrY = drawLetterhead(doc, societyName, address);
      y = hrY + 15;
    }
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GREY_TEXT)
      .text(`Closing Balance: Rs. ${rupees(closingBalance)}`, MARGIN, y, { width: colWidths.reduce((a, b) => a + b, 0), align: 'right' });

    doc.font('Helvetica').fontSize(8).fillColor(GREY_BORDER)
      .text('This is a system-generated statement reflecting live account data at the time of generation.',
        0, doc.page.height - MARGIN - 15, { width: pageWidth, align: 'center' });

    doc.end();
  });
}

module.exports = { generateStatementPdf };