import type { Invoice } from '@/store/api';

/**
 * Open one bill in a print window.
 *
 * Everything printed comes from the server's invoice response — the seller's
 * legal name, GSTIN and letterhead included. The browser cannot assemble those:
 * `GET /hospitals/current` is public and deliberately carries no legal
 * identity, so a bill built from it would print without a GSTIN and not be a
 * valid GST invoice.
 */
export function printInvoice(invoice: Invoice): void {
  const money = (n: number) => `₹${n.toFixed(2)}`;
  const esc = (v: string) =>
    (v ?? '').replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
    );

  const { seller } = invoice;
  // The letterhead is the hospital's own artwork and replaces the text header
  // entirely; without one we print the same facts as text so the bill is never
  // anonymous.
  const header = seller.letterheadUrl
    ? `<img class="letterhead" src="${esc(seller.letterheadUrl)}" alt="" />`
    : `<div class="seller">
         <div class="seller-name">${esc(seller.legalName || seller.name)}</div>
         ${seller.address ? `<div>${esc(seller.address)}</div>` : ''}
         ${seller.phone ? `<div>${esc(seller.phone)}</div>` : ''}
       </div>`;

  const gstin = seller.gstin
    ? `<div class="gstin">GSTIN: ${esc(seller.gstin)}</div>`
    : '';

  const lines = invoice.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<title>${esc(invoice.number)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 40px; }
  .letterhead { max-width: 100%; max-height: 140px; object-fit: contain; display: block; margin-bottom: 20px; }
  .seller-name { font-size: 20px; font-weight: 700; }
  .seller { margin-bottom: 20px; line-height: 1.5; color: #475569; }
  .gstin { font-size: 12px; color: #475569; margin-bottom: 20px; }
  .bar { display: flex; justify-content: space-between; align-items: flex-end;
         border-top: 2px solid #0f172a; border-bottom: 1px solid #e2e8f0;
         padding: 12px 0; margin-bottom: 20px; }
  .title { font-size: 16px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .meta { font-size: 12px; color: #64748b; text-align: right; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
       color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 8px 6px; }
  td { padding: 10px 6px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: flex-end; gap: 40px; font-size: 16px;
           font-weight: 700; padding-top: 8px; }
  .foot { margin-top: 36px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print { body { padding: 0; } }
</style></head><body>
  ${header}
  ${gstin}
  <div class="bar">
    <div>
      <div class="title">Invoice</div>
      <div class="meta" style="text-align:left">
        Billed to ${esc(invoice.patientName || 'Patient')}
        ${invoice.patientPhone ? `<br />${esc(invoice.patientPhone)}` : ''}
      </div>
    </div>
    <div class="meta">
      ${esc(invoice.number)}<br />
      ${esc(new Date(invoice.issuedAt).toLocaleString())}<br />
      ${esc(invoice.paymentMethod || '—')} · ${esc(invoice.status)}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="total"><span>Total</span><span>${money(invoice.total)}</span></div>
  <div class="foot">This is a computer-generated invoice.</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
