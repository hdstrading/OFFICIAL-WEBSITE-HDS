import { env } from '../env.js';
import { formatPeso } from './pricing.js';
import type { Booking, Order, QuoteRequest } from '../types.js';

/**
 * HTML emails. Table-based layout with inline styles, because that is what
 * Gmail, Outlook and Apple Mail all render consistently.
 */

const BRAND = '#0e7490';
const INK = '#0f172a';
const MUTED = '#64748b';

/** Escapes anything a customer typed before it goes into an email. */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const shell = (title: string, preheader: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${BRAND};padding:22px 28px;">
            <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;">HDS TRADING OPC</div>
            <div style="font-size:12px;color:#cffafe;margin-top:3px;">Institutional cleaning supplies, equipment &amp; pool care</div>
          </td>
        </tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:${MUTED};line-height:1.7;">
            <div><strong style="color:${INK};">HDS Trading OPC</strong> — ${esc(env.siteUrl.replace(/^https?:\/\//, ''))}</div>
            <div>Taytay, Rizal, Philippines · Mon–Sat, 8:00 AM – 6:00 PM</div>
            <div style="margin-top:6px;">
              <a href="${env.siteUrl}" style="color:${BRAND};text-decoration:none;font-weight:600;">Visit our website</a>
              &nbsp;·&nbsp;
              <a href="mailto:${esc(env.notifyEmail)}" style="color:${BRAND};text-decoration:none;font-weight:600;">${esc(env.notifyEmail)}</a>
            </div>
          </td>
        </tr>
      </table>
      <div style="max-width:640px;margin:14px auto 0;font-size:11px;color:#94a3b8;text-align:center;">
        You received this because you placed a request on ${esc(env.siteUrl.replace(/^https?:\/\//, ''))}.
      </div>
    </td></tr>
  </table>
</body>
</html>`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 6px;font-size:21px;font-weight:800;letter-spacing:-0.3px;color:${INK};">${esc(text)}</h1>`;

const lead = (text: string) =>
  `<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;

const refBadge = (label: string, reference: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    <tr><td style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:10px;padding:14px 16px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#0e7490;font-weight:700;">${esc(label)}</div>
      <div style="font-size:19px;font-weight:800;color:${INK};margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(reference)}</div>
    </td></tr>
  </table>`;

const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
    <tr><td style="background:${BRAND};border-radius:9px;">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(label)}</a>
    </td></tr>
  </table>`;

const detailRows = (rows: [string, string][]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    ${rows
      .map(
        ([label, value], i) => `
      <tr style="background:${i % 2 ? '#ffffff' : '#f8fafc'};">
        <td style="padding:10px 14px;font-size:12px;color:${MUTED};width:38%;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 14px;font-size:13px;color:${INK};font-weight:600;">${esc(value)}</td>
      </tr>`,
      )
      .join('')}
  </table>`;

const itemsTable = (
  items: { name: string; unit: string; quantity: number; unitPrice: number; lineTotal: number }[],
  totals: [string, string, boolean?][],
) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr style="background:#f1f5f9;">
      <th align="left"  style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED};">Item</th>
      <th align="center" style="padding:10px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED};">Qty</th>
      <th align="right" style="padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED};">Amount</th>
    </tr>
    ${items
      .map(
        (item) => `
      <tr style="border-top:1px solid #e2e8f0;">
        <td style="padding:11px 14px;font-size:13px;color:${INK};">
          <div style="font-weight:600;">${esc(item.name)}</div>
          <div style="font-size:11px;color:${MUTED};margin-top:2px;">${esc(item.unit)} · ${formatPeso(item.unitPrice)} each</div>
        </td>
        <td align="center" style="padding:11px 8px;font-size:13px;color:${INK};font-weight:600;">${item.quantity}</td>
        <td align="right" style="padding:11px 14px;font-size:13px;color:${INK};font-weight:700;white-space:nowrap;">${formatPeso(item.lineTotal)}</td>
      </tr>`,
      )
      .join('')}
    ${totals
      .map(
        ([label, value, strong]) => `
      <tr style="border-top:1px solid #e2e8f0;background:${strong ? '#ecfeff' : '#f8fafc'};">
        <td colspan="2" align="right" style="padding:${strong ? '13px' : '9px'} 14px;font-size:${strong ? '14px' : '12px'};color:${strong ? INK : MUTED};font-weight:${strong ? 800 : 600};">${esc(label)}</td>
        <td align="right" style="padding:${strong ? '13px' : '9px'} 14px;font-size:${strong ? '16px' : '13px'};color:${strong ? BRAND : INK};font-weight:${strong ? 800 : 700};white-space:nowrap;">${esc(value)}</td>
      </tr>`,
      )
      .join('')}
  </table>`;

const nextSteps = (title: string, steps: string[]) => `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:0 0 8px;">
    <div style="font-size:13px;font-weight:700;color:${INK};margin-bottom:8px;">${esc(title)}</div>
    <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:#334155;">
      ${steps.map((s) => `<li>${s}</li>`).join('')}
    </ol>
  </div>`;

/* --------------------------------------------------------------------- order */

const PAYMENT_LABELS: Record<string, string> = {
  card: 'Credit or debit card',
  gcash: 'GCash',
  maya: 'Maya',
  online_banking: 'Online bank transfer',
  bank_transfer: 'Manual bank deposit / transfer',
  cod: 'Cash on delivery',
};

export function orderConfirmationEmail(order: Order, audience: 'customer' | 'staff'): string {
  const paid = order.paymentStatus === 'paid';
  const trackUrl = `${env.siteUrl}/order/${order.reference}`;

  const totals: [string, string, boolean?][] = [
    ['Subtotal', formatPeso(order.subtotal)],
    ...(order.discountAmount > 0
      ? ([[`Discount (${order.discountCode ?? ''})`, `– ${formatPeso(order.discountAmount)}`]] as [
          string,
          string,
        ][])
      : []),
    ['VAT (12%)', formatPeso(order.vat)],
    [`Delivery — ${order.delivery.label}`, order.deliveryFee === 0 ? 'Free' : formatPeso(order.deliveryFee)],
    ...(order.processingFee > 0
      ? ([['Payment processing fee', formatPeso(order.processingFee)]] as [string, string][])
      : []),
    ['Total', formatPeso(order.total), true],
  ];

  const details = detailRows([
    ['Payment method', PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod],
    ['Payment status', paid ? 'Paid' : 'Awaiting payment'],
    ['Delivery', `${order.delivery.label} — ${order.delivery.etaLabel}`],
    [
      'Deliver to',
      [order.address.line1, order.address.barangay, order.address.city, order.address.province]
        .filter(Boolean)
        .join(', '),
    ],
    ['Contact', `${order.address.contactName} · ${order.address.phone}`],
    ...(order.notes ? ([['Notes', order.notes]] as [string, string][]) : []),
  ]);

  if (audience === 'staff') {
    return shell(
      `New order ${order.reference}`,
      `${order.customerName} — ${formatPeso(order.total)}`,
      h1('New order received') +
        lead(
          `<strong>${esc(order.customerName)}</strong>${order.institutionName ? ` (${esc(order.institutionName)})` : ''} placed an order. ` +
            `Contact: <a href="mailto:${esc(order.email)}" style="color:${BRAND};">${esc(order.email)}</a> · ${esc(order.phone)}`,
        ) +
        refBadge('Order reference', order.reference) +
        details +
        itemsTable(order.items, totals),
    );
  }

  const steps = paid
    ? [
        'We are picking and packing your order now.',
        `Your order will be dispatched by <strong>${esc(order.delivery.label)}</strong> — ${esc(order.delivery.etaLabel)}.`,
        'We will text you tracking details on the day of delivery.',
      ]
    : order.paymentMethod === 'bank_transfer'
      ? [
          'Transfer the total to any of our accounts — our sales desk will send the details within the hour.',
          'Reply to this email with your proof of payment, quoting your order reference.',
          'We release your order for delivery once payment clears.',
        ]
      : order.paymentMethod === 'cod'
        ? [
            'We are preparing your order for delivery.',
            `Please prepare <strong>${formatPeso(order.total)}</strong> in cash for our rider.`,
            'We will call you before we set out.',
          ]
        : [
            'Complete your payment using the button above.',
            'We start packing as soon as payment is confirmed.',
            'You will get a dispatch notice with tracking details.',
          ];

  return shell(
    `Order ${order.reference} confirmed`,
    `Thank you — your order total is ${formatPeso(order.total)}`,
    h1('Thank you for your order') +
      lead(
        `Hi ${esc(order.customerName)}, we have received your order. Keep the reference below — you can use it to check your order status any time.`,
      ) +
      refBadge('Your order reference', order.reference) +
      (!paid && order.paymentUrl ? button(order.paymentUrl, `Pay ${formatPeso(order.total)} now`) : '') +
      itemsTable(order.items, totals) +
      details +
      nextSteps('What happens next', steps) +
      `<p style="margin:18px 0 0;font-size:13px;color:#334155;">Check your order any time at <a href="${trackUrl}" style="color:${BRAND};font-weight:600;">${esc(trackUrl)}</a></p>`,
  );
}

/* ------------------------------------------------------------------- booking */

export function bookingConfirmationEmail(booking: Booking, audience: 'customer' | 'staff'): string {
  const details = detailRows([
    ['Service', booking.serviceName],
    ['Date', booking.preferredDate],
    ['Time', booking.preferredTimeSlot],
    ['Site', booking.institutionName],
    ['Contact', `${booking.clientName} · ${booking.phone}`],
    ...(booking.areaSize ? ([['Area size', booking.areaSize]] as [string, string][]) : []),
    ...(booking.notes ? ([['Notes', booking.notes]] as [string, string][]) : []),
    ['Estimated cost', formatPeso(booking.estimatedPrice)],
    ...(booking.depositAmount > 0
      ? ([
          ['Down payment to confirm', formatPeso(booking.depositAmount)],
          ['Balance on completion', formatPeso(booking.balanceDue)],
        ] as [string, string][])
      : []),
  ]);

  if (audience === 'staff') {
    return shell(
      `New booking ${booking.reference}`,
      `${booking.institutionName} — ${booking.preferredDate}`,
      h1('New service booking') +
        lead(
          `<strong>${esc(booking.clientName)}</strong> booked <strong>${esc(booking.serviceName)}</strong>. ` +
            `Contact: <a href="mailto:${esc(booking.email)}" style="color:${BRAND};">${esc(booking.email)}</a> · ${esc(booking.phone)}`,
        ) +
        refBadge('Booking reference', booking.reference) +
        details,
    );
  }

  const depositPaid = booking.depositStatus === 'paid';
  const steps = [
    'Our scheduling desk will call you to confirm site access and parking.',
    booking.depositAmount > 0 && !depositPaid
      ? `Pay the <strong>${formatPeso(booking.depositAmount)}</strong> down payment to lock in your slot — the button above takes you straight there.`
      : 'Your slot is reserved for you.',
    'Our crew arrives within your chosen window with all equipment and chemicals.',
    booking.balanceDue > 0
      ? `The remaining <strong>${formatPeso(booking.balanceDue)}</strong> is settled after the visit.`
      : 'We issue your service report and invoice on completion.',
  ];

  return shell(
    `Booking ${booking.reference} confirmed`,
    `${booking.serviceName} on ${booking.preferredDate}`,
    h1('Your booking is reserved') +
      lead(
        `Hi ${esc(booking.clientName)}, we have you down for <strong>${esc(booking.serviceName)}</strong> on <strong>${esc(booking.preferredDate)}</strong>, ${esc(booking.preferredTimeSlot)}.`,
      ) +
      refBadge('Your booking reference', booking.reference) +
      (booking.depositAmount > 0 && !depositPaid && booking.depositUrl
        ? button(booking.depositUrl, `Pay ${formatPeso(booking.depositAmount)} down payment`)
        : '') +
      details +
      nextSteps('What happens next', steps) +
      `<p style="margin:18px 0 0;font-size:13px;color:#334155;">View your booking any time at <a href="${env.siteUrl}/booking/${esc(booking.reference)}" style="color:${BRAND};font-weight:600;">${esc(env.siteUrl)}/booking/${esc(booking.reference)}</a></p>`,
  );
}

/* --------------------------------------------------------------------- quote */

export function quoteConfirmationEmail(quote: QuoteRequest, audience: 'customer' | 'staff'): string {
  const totals: [string, string, boolean?][] = [
    ['Subtotal', formatPeso(quote.subtotal)],
    ...(quote.discountAmount > 0
      ? ([[`Discount (${quote.discountCode ?? ''})`, `– ${formatPeso(quote.discountAmount)}`]] as [
          string,
          string,
        ][])
      : []),
    ['VAT (12%)', formatPeso(quote.vat)],
    ['Indicative total', formatPeso(quote.total), true],
  ];

  const urgencyLabel = {
    routine: 'Routine — within 5 working days',
    urgent: 'Urgent — within 48 hours',
    immediate: 'Immediate — same day',
  }[quote.urgency];

  if (audience === 'staff') {
    return shell(
      `New quotation request ${quote.reference}`,
      `${quote.institutionName} — ${formatPeso(quote.total)}`,
      h1('New quotation request') +
        lead(
          `<strong>${esc(quote.clientName)}</strong> from <strong>${esc(quote.institutionName)}</strong> requested a quote. ` +
            `Contact: <a href="mailto:${esc(quote.email)}" style="color:${BRAND};">${esc(quote.email)}</a> · ${esc(quote.phone)}`,
        ) +
        refBadge('Quotation reference', quote.reference) +
        detailRows([
          ['Urgency', urgencyLabel],
          ['Delivery address', quote.address],
          ...(quote.instructions ? ([['Instructions', quote.instructions]] as [string, string][]) : []),
        ]) +
        itemsTable(quote.items, totals),
    );
  }

  return shell(
    `Quotation ${quote.reference} received`,
    `We are preparing your quote — indicative total ${formatPeso(quote.total)}`,
    h1('We have your quotation request') +
      lead(
        `Hi ${esc(quote.clientName)}, thank you. Our sales desk is preparing your formal quotation for ${esc(quote.institutionName)}. The figures below are indicative at list price — your final quote may include bulk and contract discounts.`,
      ) +
      refBadge('Your quotation reference', quote.reference) +
      itemsTable(quote.items, totals) +
      detailRows([
        ['Urgency', urgencyLabel],
        ['Deliver to', quote.address],
      ]) +
      nextSteps('What happens next', [
        'A sales officer reviews your list and applies any volume pricing you qualify for.',
        'You receive a formal, VAT-registered quotation you can submit for approval.',
        'Approve it and we schedule delivery — or reply to this email with any changes.',
      ]),
  );
}

/* ------------------------------------------------------------------ feedback */

export function reviewReceivedEmail(
  authorName: string,
  subjectName: string,
  rating: number,
  comment: string,
): string {
  return shell(
    'New customer feedback',
    `${rating}-star review for ${subjectName}`,
    h1('New customer feedback') +
      lead(
        `<strong>${esc(authorName)}</strong> left a <strong>${rating}-star</strong> review for <strong>${esc(subjectName)}</strong>. It is held for moderation until you publish it.`,
      ) +
      `<div style="background:#f8fafc;border-left:3px solid ${BRAND};padding:14px 16px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.7;color:#334155;">${esc(comment)}</div>`,
  );
}
