import { env } from '../env.js';
import { blockedDates, bookings } from '../db.js';
import type { DayAvailability, TimeSlotAvailability } from '../types.js';

/**
 * Which dates and time slots a customer can actually book.
 *
 * A slot is open while fewer crews are committed than `BOOKING_SLOT_CAPACITY`.
 * The calendar shows this up front so nobody picks a date only to be told later
 * that we are full — and the same check runs again at submit time, because a
 * calendar the customer loaded ten minutes ago may already be out of date.
 */

export const TIME_SLOTS = [
  '08:00 AM – 10:00 AM',
  '10:00 AM – 12:00 NN',
  '01:00 PM – 03:00 PM',
  '03:00 PM – 05:00 PM',
] as const;

/** Sunday. We dispatch Monday to Saturday. */
const CLOSED_WEEKDAY = 0;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Earliest bookable date, honouring the required lead time. */
export const earliestBookableDate = () => addDays(todayISO(), env.booking.leadTimeDays);

/** Latest bookable date. */
export const latestBookableDate = () => addDays(todayISO(), env.booking.horizonDays);

export interface SlotCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Authoritative check used when a booking is submitted. The calendar is a
 * convenience; this is what actually prevents a double booking.
 */
export function checkSlotBookable(date: string, slot: string): SlotCheck {
  if (!(TIME_SLOTS as readonly string[]).includes(slot)) {
    return { ok: false, reason: 'Please choose one of the available time slots.' };
  }
  if (date < earliestBookableDate()) {
    return {
      ok: false,
      reason:
        env.booking.leadTimeDays > 0
          ? `We need at least ${env.booking.leadTimeDays} day(s) notice. Please choose a later date, or call our hotline for urgent visits.`
          : 'Please choose today or a later date.',
    };
  }
  if (date > latestBookableDate()) {
    return {
      ok: false,
      reason: `Bookings open ${env.booking.horizonDays} days ahead. Please choose an earlier date.`,
    };
  }
  if (weekdayOf(date) === CLOSED_WEEKDAY) {
    return { ok: false, reason: 'We are closed on Sundays. Please choose Monday to Saturday.' };
  }
  const blocked = blockedDates.isBlocked(date);
  if (blocked) return { ok: false, reason: blocked };

  const taken = bookings.slotCount(date, slot);
  if (taken >= env.booking.slotCapacity) {
    return { ok: false, reason: 'That time slot has just been taken. Please choose another.' };
  }
  return { ok: true };
}

/**
 * A month (or any range) of availability in one pass, so the calendar can
 * render without a request per day.
 */
export function availabilityBetween(fromDate: string, toDate: string): DayAvailability[] {
  const load = new Map<string, number>();
  for (const row of bookings.slotLoad(fromDate, toDate)) {
    load.set(`${row.date}|${row.slot}`, row.taken);
  }
  const blocked = blockedDates.between(fromDate, toDate);

  const earliest = earliestBookableDate();
  const latest = latestBookableDate();
  const capacity = env.booking.slotCapacity;

  const days: DayAvailability[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const slots: TimeSlotAvailability[] = TIME_SLOTS.map((slot) => {
      const booked = load.get(`${date}|${slot}`) ?? 0;
      return { slot, booked, capacity, available: booked < capacity };
    });

    let status: DayAvailability['status'];
    let reason: string | undefined;

    if (date < earliest) {
      status = 'past';
      reason =
        date < todayISO()
          ? 'This date has passed.'
          : 'We need advance notice for this date — please call our hotline.';
    } else if (date > latest) {
      status = 'closed';
      reason = 'Not open for booking yet.';
    } else if (weekdayOf(date) === CLOSED_WEEKDAY) {
      status = 'closed';
      reason = 'Closed on Sundays.';
    } else if (blocked.has(date)) {
      status = 'closed';
      reason = blocked.get(date);
    } else {
      const open = slots.filter((s) => s.available).length;
      if (open === 0) {
        status = 'full';
        reason = 'Fully booked.';
      } else if (open <= 1) {
        status = 'limited';
      } else {
        status = 'open';
      }
    }

    const bookable = status === 'open' || status === 'limited';
    days.push({
      date,
      available: bookable,
      status,
      reason,
      // Only offer individual slots on days that can actually be booked.
      slots: bookable ? slots : slots.map((s) => ({ ...s, available: false })),
    });
  }

  return days;
}
