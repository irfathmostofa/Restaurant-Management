// Thermal-receipt printing helpers.
//
// Receipts are rendered as self-contained HTML sized for 80mm (default) or
// 58mm thermal printers. Printing happens in a dedicated window that must be
// opened synchronously from the user gesture (to satisfy popup blockers);
// openPrintWindow() should be called inside the click handler, then
// printHtml() fills and prints it once the async work (order/payment) is done.

import { DEFAULT_CURRENCY } from '../context/CurrencyContext'

export const RECEIPT_WIDTHS = {
  58: '58mm',
  80: '80mm'
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// Legacy fixed-symbol formatter (kept for callers that have not migrated yet).
export const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`

// Builds a formatter honouring the configured currency (symbol, position,
// decimal precision, thousand separator).
export const makeMoneyFormatter = (currency = {}) => {
  const c = { ...DEFAULT_CURRENCY, ...currency }
  return (n, opts = {}) => {
    const value = Number(n || 0)
    const fixed = value.toFixed(c.decimal_precision ?? 2)
    const [int, dec] = fixed.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousand_separator || ',')
    const body = dec !== undefined ? `${grouped}.${dec}` : grouped
    const sym = opts.symbol === false ? '' : (c.symbol || '$')
    return c.symbol_position === 'after' ? `${body} ${sym}`.trim() : `${sym}${body}`
  }
}

export const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const shortOrderNo = (id) => (id || '').slice(0, 8).toUpperCase()

// Must be called synchronously inside the click handler.
export function openPrintWindow() {
  return window.open('', '_blank', 'width=420,height=640')
}

// Writes html into the print window and triggers the print dialog.
// Returns true when a print window was available, false otherwise.
export function printHtml(win, html) {
  if (!win || !win.document) return false
  const doc = win.document
  doc.open()
  doc.write(html)
  doc.close()
  win.focus()
  // Give the window a moment to lay out (and load any QR image) first.
  setTimeout(() => { try { win.print() } catch { /* window was closed */ } }, 350)
  return true
}

function receiptStyles(width) {
  const narrow = width === '58'
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 8px 6px;
      width: ${RECEIPT_WIDTHS[width] || RECEIPT_WIDTHS[80]};
      font-family: 'Courier New', Courier, monospace;
      font-size: ${narrow ? '11px' : '12px'};
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .muted { opacity: 0.75; }
    .logo { max-width: 60%; height: auto; margin: 0 auto 4px; display: block; }
    .title { font-size: ${narrow ? '13px' : '15px'}; font-weight: 700; }
    .line { white-space: nowrap; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .items { width: 100%; border-collapse: collapse; }
    .items td { padding: 1px 0; vertical-align: top; }
    .items .name { width: 62%; word-break: break-word; }
    .items .qty { text-align: center; white-space: nowrap; }
    .items .amt { text-align: right; white-space: nowrap; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .thanks { margin-top: 8px; }
    .qr { margin: 6px auto 0; display: block; image-rendering: pixelated; }
    @page { margin: 0; size: auto; }
    @media print { body { padding: 0; } }
  `
}

function receiptShell(width, inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt</title>
  <style>${receiptStyles(width)}</style>
</head>
<body>${inner}</body>
</html>`
}

/**
 * Kitchen Order Ticket (KOT).
 * Deliberately excludes prices, totals, taxes and payment information.
 */
export function buildKotHtml({
  restaurantName,
  branch,
  orderNo,
  tableNumber,
  waiterName,
  items,
  defaultPrepTime,
  printTime,
  logoUrl,
  width = 80
}) {
  const hasTable = tableNumber != null && tableNumber !== ''
  const inner = `
    <div class="center">
      ${logoUrl ? `<img class="logo" alt="" src="${esc(logoUrl)}" />` : ''}
      <div class="title">${esc(restaurantName)}</div>
      ${branch ? `<div class="muted">${esc(branch.name)}</div>` : ''}
      <div class="sep"></div>
      <div class="row"><span>KOT</span><span>#${esc(orderNo)}</span></div>
      ${hasTable ? `<div class="row"><span>Table</span><span>${esc(tableNumber)}</span></div>` : ''}
      <div class="row"><span>Waiter</span><span>${esc(waiterName)}</span></div>
      <div class="row"><span>Order time</span><span>${fmtDateTime(printTime)}</span></div>
      <div class="row"><span>Est. prep</span><span>${esc(defaultPrepTime)} min</span></div>
      <div class="sep"></div>
    </div>
    <table class="items">
      <tbody>
        ${items.map((it) => `
          <tr>
            <td class="name">${esc(it.name)}</td>
            <td class="qty">x${esc(it.quantity)}</td>
          </tr>
          ${it.notes ? `<tr><td class="muted" colspan="2">  * ${esc(it.notes)}</td></tr>` : ''}
        `).join('')}
      </tbody>
    </table>
    <div class="sep"></div>
    <div class="center muted">Print time: ${fmtDateTime(new Date().toISOString())}</div>
  `
  return receiptShell(width, inner)
}

/**
 * Customer POS invoice (after successful payment).
 * Accepts the configured currency and optional tax components so disabled
 * tax rows are simply hidden and names (VAT / GST / Sales Tax) are honoured.
 */
export function buildInvoiceHtml({
  restaurantName,
  branch,
  invoiceNo,
  orderNo,
  orderTime,
  cashierName,
  tableNumber,
  customerName,
  items,
  subtotal,
  discount,
  vat = 0,
  tax = 0,
  serviceCharge = 0,
  grandTotal,
  vatName = 'VAT',
  taxName = 'Tax',
  serviceChargeName = 'Service Charge',
  paymentMethod,
  paidAmount,
  changeAmount,
  footer,
  qrData,
  logoUrl,
  currency = {},
  width = 80
}) {
  const fmt = makeMoneyFormatter(currency)
  const hasTable = tableNumber != null && tableNumber !== ''
  const hasDiscount = Number(discount) > 0
  const hasVat = Number(vat) > 0
  const hasTax = Number(tax) > 0
  const hasServiceCharge = Number(serviceCharge) > 0
  const hasChange = Number(changeAmount) > 0
  const qr = qrData
    ? `<img class="qr" width="80" height="80" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(String(qrData))}" />`
    : ''

  const inner = `
    <div class="center">
      ${logoUrl ? `<img class="logo" alt="" src="${esc(logoUrl)}" />` : ''}
      <div class="title">${esc(restaurantName)}</div>
      ${branch ? `<div class="muted">${esc(branch.name)}</div>` : ''}
      ${branch?.address ? `<div class="muted">${esc(branch.address)}</div>` : ''}
      ${branch?.contact_info ? `<div class="muted">${esc(branch.contact_info)}</div>` : ''}
      <div class="sep"></div>
      <div class="row"><span>Invoice</span><span>${esc(invoiceNo)}</span></div>
      <div class="row"><span>Order</span><span>#${esc(orderNo)}</span></div>
      <div class="row"><span>Date</span><span>${fmtDateTime(orderTime)}</span></div>
      <div class="row"><span>Cashier</span><span>${esc(cashierName)}</span></div>
      ${hasTable ? `<div class="row"><span>Table</span><span>${esc(tableNumber)}</span></div>` : ''}
      ${customerName ? `<div class="row"><span>Customer</span><span>${esc(customerName)}</span></div>` : ''}
      <div class="sep"></div>
    </div>
    <table class="items">
      <thead><tr><td class="name bold">Item</td><td class="qty bold">Qty</td><td class="amt bold">Total</td></tr></thead>
      <tbody>
        ${items.map((it) => `
          <tr>
            <td class="name">${esc(it.name)}</td>
            <td class="qty">${esc(it.quantity)}</td>
            <td class="amt">${fmt(Number(it.price_at_order) * Number(it.quantity))}</td>
          </tr>
          <tr><td class="muted" colspan="3">    @ ${fmt(it.price_at_order)} ea</td></tr>
        `).join('')}
      </tbody>
    </table>
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${hasDiscount ? `<div class="row"><span>Discount</span><span>-${fmt(discount)}</span></div>` : ''}
    ${hasServiceCharge ? `<div class="row"><span>${esc(serviceChargeName)}</span><span>${fmt(serviceCharge)}</span></div>` : ''}
    ${hasVat ? `<div class="row"><span>${esc(vatName)}</span><span>${fmt(vat)}</span></div>` : ''}
    ${hasTax ? `<div class="row"><span>${esc(taxName)}</span><span>${fmt(tax)}</span></div>` : ''}
    <div class="row bold"><span>Grand Total</span><span>${fmt(grandTotal)}</span></div>
    <div class="row"><span>Paid (${esc(paymentMethod)})</span><span>${fmt(paidAmount)}</span></div>
    ${hasChange ? `<div class="row"><span>Change</span><span>${fmt(changeAmount)}</span></div>` : ''}
    <div class="sep"></div>
    ${qr}
    <div class="center thanks">${esc(footer || 'Thank you for dining with us!')}</div>
  `
  return receiptShell(width, inner)
}
