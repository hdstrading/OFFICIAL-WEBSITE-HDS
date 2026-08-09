/** Shared formatting so prices and dates read the same way everywhere. */

export const peso = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Compact form for cards and badges, where centavos are noise. */
export const pesoShort = (value: number) =>
  `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** "12 Aug" — used in the calendar where the year is already obvious. */
export const formatDayShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Waiting for payment',
  processing: 'Preparing your order',
  ready_for_dispatch: 'Ready for dispatch',
  in_transit: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Credit / debit card',
  gcash: 'GCash',
  maya: 'Maya',
  online_banking: 'Online bank transfer',
  bank_transfer: 'Bank deposit / transfer',
  cod: 'Cash on delivery',
};
