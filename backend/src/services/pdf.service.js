/**
 * RANIKUTHI V5 — pdf.service.js
 * Shared letterhead builder for bills, receipts, and vouchers.
 * L-12/L-23: SHA-256 is computed over the underlying DATA (never the
 * rendered PDF bytes — that would be circular), then printed in the
 * footer AND stored in the record's sha256_hash column. Recomputing the
 * hash from the same stored fields must always reproduce this value.
 * L-24: pdf_drive_url stores the Supabase Storage PATH, not a signed URL
 * (signed URLs expire; paths don't) — fresh signed URLs are minted on
 * demand via the /documents download route.
 * L-25: a voided receipt's PDF is kept, filename gets _VOID appended —
 * never overwritten or deleted.
 * Fonts are Helvetica/Helvetica-Bold/Helvetica-Oblique only — pdfkit's
 * built-in base-14 fonts are never embedded, which is what keeps these
 * files small (a few KB each, not hundreds).
 */
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const supabase = require('../db');

const CM = 28.3465;
const MM = 2.83465;
const MARGIN = 1 * CM;
const BORDER_WIDTH = 0.25 * MM;
const GREY_BORDER = '#999999'; // 40% grey
const GREY_TEXT = '#333333';   // 80% grey, used instead of pure black

function computeDataHash(fields) {
  // Deterministic, pipe-joined string of the record's own fields —
  // never the PDF bytes. Order matters: it must be reproducible exactly
  // the same way every time this record's hash is recomputed.
  const canonical = fields.join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function drawHeader(doc, societyName, address) {
  const pageWidth = doc.page.width;

  doc.fillColor(GREY_TEXT).font('Helvetica-Bold').fontSize(18)
    .text(societyName, 0, MARGIN, { width: pageWidth, align: 'center' });

  const addressY = MARGIN + 26;
  doc.font('Helvetica').fontSize(14)
    .text(address, 0, addressY, { width: pageWidth, align: 'center' });

  const hrY = addressY + 22;
  doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER)
    .moveTo(MARGIN, hrY).lineTo(pageWidth - MARGIN, hrY).stroke().restore();

  return hrY;
}

function drawHeadFields(doc, startY, fields) {
  const col1X = MARGIN;
  const col2X = doc.page.width / 2 + 8;
  const lineH = 17;
  let y = startY + 20;

  doc.font('Helvetica').fontSize(11).fillColor(GREY_TEXT);
  for (let i = 0; i < fields.length; i += 2) {
    doc.text(`${fields[i][0]}: ${fields[i][1]}`, col1X, y);
    if (fields[i + 1]) {
      doc.text(`${fields[i + 1][0]}: ${fields[i + 1][1]}`, col2X, y);
    }
    y += lineH;
  }
  return y + 8;
}

function drawTable(doc, startY, headers, rows, colWidths) {
  const rowH = 20;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const xStart = MARGIN;
  let y = startY;

  doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER);

  // Header row
  doc.rect(xStart, y, tableW, rowH).stroke();
  let x = xStart;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(GREY_TEXT);
  for (let i = 0; i < headers.length; i++) {
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
    doc.text(headers[i], x + 4, y + 5, { width: colWidths[i] - 8 });
    x += colWidths[i];
  }
  doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
  y += rowH;

  // Data rows — last column is always the amount column, right-aligned
  // by POSITION, never guessed from the text content.
  doc.font('Helvetica').fontSize(11);
  const lastCol = colWidths.length - 1;
  for (const row of rows) {
    doc.rect(xStart, y, tableW, rowH).stroke();
    x = xStart;
    for (let i = 0; i < row.length; i++) {
      doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
      const align = i === lastCol ? 'right' : 'left';
      const pad = i === lastCol ? 8 : 4;
      doc.text(row[i], x + 4, y + 5, { width: colWidths[i] - pad, align });
      x += colWidths[i];
    }
    doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
    y += rowH;
  }
  doc.restore();
  return y + 14;
}

function drawSignature(doc, startY, associationName) {
  const sigX = doc.page.width - MARGIN - 170;
  doc.font('Helvetica').fontSize(11).fillColor(GREY_TEXT);
  doc.text(`For ${associationName}`, sigX, startY);

  const lineY = startY + 45;
  doc.save().lineWidth(BORDER_WIDTH).strokeColor(GREY_BORDER)
    .moveTo(sigX, lineY).lineTo(sigX + 170, lineY).stroke().restore();
  doc.text('Authorised Signatory', sigX, lineY + 6);
}

function drawFooter(doc, referenceNo, dataHash) {
  const pageWidth = doc.page.width;
  const footerY = doc.page.height - MARGIN - 24;

  doc.fillColor(GREY_BORDER).font('Helvetica').fontSize(8)
    .text('This is a system-generated document and does not require a physical signature.',
      0, footerY, { width: pageWidth, align: 'center' });

  // L-23: SHA-256 in the footer, 9pt italic.
  doc.font('Helvetica-Oblique').fontSize(9)
    .text(`Document Ref: ${referenceNo}  |  SHA-256: ${dataHash}`,
      0, footerY + 12, { width: pageWidth, align: 'center' });
}

/**
 * Builds a complete letterhead document and returns { buffer, dataHash }.
 * `canonicalFields` is what actually gets hashed — pass the real record's
 * own field values, in a fixed, documented order.
 */
function buildDocument({ societyName, address, headFields, tableHeaders, tableRows, colWidths, signatoryName, referenceNo, canonicalFields }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const dataHash = computeDataHash(canonicalFields);
      resolve({ buffer, dataHash });
    });
    doc.on('error', reject);

    const hrY = drawHeader(doc, societyName, address);
    const afterFields = drawHeadFields(doc, hrY, headFields);
    const afterTable = drawTable(doc, afterFields, tableHeaders, tableRows, colWidths);
    drawSignature(doc, afterTable, signatoryName);
    // Footer needs the hash, but the hash is computed on 'end' above —
    // so we compute it here too, ahead of time, to actually draw it.
    const dataHash = computeDataHash(canonicalFields);
    drawFooter(doc, referenceNo, dataHash);

    doc.end();
  });
}

async function getLetterheadSettings() {
  const { data } = await supabase
    .from('global_settings')
    .select('setting_key, setting_value')
    .in('setting_key', ['SOCIETY_NAME', 'SOCIETY_ADDRESS']);
  const map = {};
  for (const row of data || []) map[row.setting_key] = row.setting_value;
  return {
    societyName: map.SOCIETY_NAME || 'SOCIETY NAME NOT CONFIGURED',
    address: map.SOCIETY_ADDRESS || 'Address not configured',
  };
}

const paise = (p) => (Number(p) / 100).toFixed(2);

async function uploadPdf(storagePath, buffer) {
  const { error } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}

async function getSignedDownloadUrl(storagePath, expiresInSeconds = 300) {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return { ok: false, message: error.message };
  return { ok: true, url: data.signedUrl };
}

// ---- Document-type specific builders ----

async function generateBillPdf(bill, flatCode, memberName, mobile) {
  const { societyName, address } = await getLetterheadSettings();
  const headFields = [
    ['Bill No', bill.bill_no], ['Date', new Date(bill.created_timestamp).toLocaleDateString('en-IN')],
    ['Flat', flatCode], ['Member Name', memberName || 'N/A'],
    ['Mobile No', mobile || 'N/A'], ['Due Date', bill.due_date],
  ];
  const tableHeaders = ['Description', 'Amount (Rs.)'];
  const tableRows = [
    ['Maintenance Charge', paise(bill.base_charge_paise)],
    ['Previous Unpaid Amount', paise(bill.previous_unpaid_paise)],
    ['Late Fine', paise(bill.late_fine_paise)],
    ['Total Payable', paise(bill.total_payable_paise)],
  ];
  const canonicalFields = [
    bill.bill_no, bill.flat_id, bill.bill_month_year, bill.financial_year,
    String(bill.base_charge_paise), String(bill.previous_unpaid_paise),
    String(bill.late_fine_paise), String(bill.total_payable_paise),
    bill.due_date, bill.created_timestamp,
  ];

  const { buffer, dataHash } = await buildDocument({
    societyName, address, headFields, tableHeaders, tableRows,
    colWidths: [340, 180], signatoryName: societyName,
    referenceNo: bill.bill_no, canonicalFields,
  });

  const storagePath = `bills/${bill.bill_no}.pdf`;
  await uploadPdf(storagePath, buffer);
  return { storagePath, dataHash };
}

async function generateReceiptPdf(receipt, flatCode, payerName, billNo) {
  const { societyName, address } = await getLetterheadSettings();
  const headFields = [
    ['Receipt No', receipt.receipt_no], ['Date', new Date(receipt.payment_date).toLocaleDateString('en-IN')],
    ['Flat', flatCode || 'N/A'], ['Received From', payerName || 'N/A'],
    ['Against Bill', billNo || 'N/A'], ['Payment Mode', receipt.payment_mode],
  ];
  const tableHeaders = ['Description', 'Amount (Rs.)'];
  const tableRows = [
    ['Amount Paid', paise(receipt.paid_amount_paise)],
    ['Concession', paise(receipt.concession_paise)],
    ['Balance Remaining', paise(receipt.balance_remaining_paise)],
  ];
  const canonicalFields = [
    receipt.receipt_no, receipt.bill_id || '', receipt.flat_id || '',
    receipt.payment_date, receipt.payment_mode,
    String(receipt.paid_amount_paise), String(receipt.concession_paise),
    String(receipt.balance_remaining_paise), receipt.created_timestamp,
  ];

  const { buffer, dataHash } = await buildDocument({
    societyName, address, headFields, tableHeaders, tableRows,
    colWidths: [340, 180], signatoryName: societyName,
    referenceNo: receipt.receipt_no, canonicalFields,
  });

  const storagePath = `receipts/${receipt.receipt_no}.pdf`;
  await uploadPdf(storagePath, buffer);
  return { storagePath, dataHash };
}

// L-25: void filename convention — a SEPARATE object with _VOID appended,
// the original is left untouched (immutability, L-11).
async function generateVoidedReceiptPdf(receipt, flatCode, payerName, billNo, voidReason) {
  const { societyName, address } = await getLetterheadSettings();
  const headFields = [
    ['Receipt No', `${receipt.receipt_no} (VOID)`], ['Date', new Date(receipt.payment_date).toLocaleDateString('en-IN')],
    ['Flat', flatCode || 'N/A'], ['Received From', payerName || 'N/A'],
    ['Against Bill', billNo || 'N/A'], ['Void Reason', voidReason],
  ];
  const tableHeaders = ['Description', 'Amount (Rs.)'];
  const tableRows = [
    ['Amount Paid (VOIDED)', paise(receipt.paid_amount_paise)],
    ['Concession (VOIDED)', paise(receipt.concession_paise)],
  ];
  const canonicalFields = [
    receipt.receipt_no, 'VOID', voidReason, receipt.payment_date,
    String(receipt.paid_amount_paise), String(receipt.concession_paise),
  ];

  const { buffer, dataHash } = await buildDocument({
    societyName, address, headFields, tableHeaders, tableRows,
    colWidths: [340, 180], signatoryName: societyName,
    referenceNo: `${receipt.receipt_no} VOID`, canonicalFields,
  });

  const storagePath = `receipts/${receipt.receipt_no}_VOID.pdf`;
  await uploadPdf(storagePath, buffer);
  return { storagePath, dataHash };
}

async function generateVoucherPdf(voucher, vendorName, makerName, checkerName) {
  const { societyName, address } = await getLetterheadSettings();
  const headFields = [
    ['Voucher No', voucher.voucher_no], ['Date', new Date(voucher.expense_date).toLocaleDateString('en-IN')],
    ['Category', voucher.category], ['Vendor', vendorName || 'N/A'],
    ['Maker', makerName || 'N/A'], ['Checker', checkerName || 'N/A'],
  ];
  const tableHeaders = ['Description', 'Amount (Rs.)'];
  const tableRows = [
    ['Base Amount', paise(voucher.base_amount_paise)],
    ['GST Amount', paise(voucher.gst_amount_paise)],
    ['Total Amount', paise(voucher.total_amount_paise)],
  ];
  const canonicalFields = [
    voucher.voucher_no, voucher.category, String(voucher.base_amount_paise),
    String(voucher.gst_amount_paise), String(voucher.total_amount_paise),
    voucher.maker_user_id, voucher.checker_user_id || '', voucher.approval_status,
    voucher.created_timestamp,
  ];

  const { buffer, dataHash } = await buildDocument({
    societyName, address, headFields, tableHeaders, tableRows,
    colWidths: [340, 180], signatoryName: societyName,
    referenceNo: voucher.voucher_no, canonicalFields,
  });

  const storagePath = `vouchers/${voucher.voucher_no}.pdf`;
  await uploadPdf(storagePath, buffer);
  return { storagePath, dataHash };
}

module.exports = {
  generateBillPdf, generateReceiptPdf, generateVoidedReceiptPdf, generateVoucherPdf,
  getSignedDownloadUrl,
};