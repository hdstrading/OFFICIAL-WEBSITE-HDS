import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DayAvailability } from '../types';

/**
 * Month calendar showing which dates can still be booked.
 *
 * Availability comes from the server, so a date is greyed out because a crew is
 * genuinely committed — not because of a guess made in the browser. Status is
 * conveyed by text and pattern as well as colour, so it does not rely on colour
 * alone.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_STYLES: Record<DayAvailability['status'], string> = {
  open: 'bg-white border-slate-200 text-slate-900 hover:border-cyan-400 hover:bg-cyan-50 cursor-pointer',
  limited: 'bg-amber-50 border-amber-200 text-amber-900 hover:border-amber-400 cursor-pointer',
  full: 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed',
  closed: 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed',
  past: 'bg-transparent border-transparent text-slate-300 cursor-not-allowed',
};

const STATUS_TEXT: Record<DayAvailability['status'], string> = {
  open: 'Open',
  limited: 'Few left',
  full: 'Full',
  closed: 'Closed',
  past: 'Unavailable',
};

interface Props {
  days: DayAvailability[];
  /** First day of the month currently shown, as YYYY-MM-01. */
  month: string;
  onMonthChange: (month: string) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** Blocks paging back past the first bookable month. */
  earliestDate: string;
  latestDate: string;
}

const shiftMonth = (month: string, delta: number) => {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const monthLabel = (month: string) =>
  new Date(`${month}T00:00:00Z`).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function AvailabilityCalendar({
  days,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  earliestDate,
  latestDate,
}: Props) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  /** Leading blanks so the 1st lands under the right weekday column. */
  const grid = useMemo(() => {
    const first = new Date(`${month}T00:00:00Z`);
    const year = first.getUTCFullYear();
    const monthIndex = first.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

    const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  }, [month]);

  const canGoBack = shiftMonth(month, 0) > earliestDate.slice(0, 7) + '-01';
  const canGoForward = shiftMonth(month, 1) <= latestDate;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          disabled={!canGoBack}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <h3 className="text-base font-extrabold text-slate-900" aria-live="polite">
          {monthLabel(month)}
        </h3>

        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          disabled={!canGoForward}
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1.5" aria-hidden>
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-[11px] font-bold text-slate-400 uppercase py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} />;

          const day = byDate.get(date);
          const status = day?.status ?? 'closed';
          const selectable = day?.available ?? false;
          const isSelected = selectedDate === date;
          const dayNumber = Number(date.slice(8, 10));
          const openSlots = day?.slots.filter((s) => s.available).length ?? 0;

          return (
            <button
              key={date}
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onSelectDate(date)}
              title={day?.reason ?? (selectable ? `${openSlots} time slot(s) open` : undefined)}
              aria-label={`${date}, ${STATUS_TEXT[status]}${selectable ? `, ${openSlots} time slots open` : ''}`}
              aria-pressed={isSelected}
              className={`aspect-square rounded-xl border text-sm font-bold flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 ${
                isSelected
                  ? 'bg-cyan-700 border-cyan-700 text-white hover:bg-cyan-800'
                  : STATUS_STYLES[status]
              }`}
            >
              <span>{dayNumber}</span>
              {selectable && !isSelected && (
                <span className="text-[9px] font-semibold leading-none opacity-70">
                  {openSlots} open
                </span>
              )}
              {isSelected && <span className="text-[9px] font-semibold leading-none">Selected</span>}
            </button>
          );
        })}
      </div>

      {/* Legend — status is readable without relying on colour. */}
      <ul className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-slate-300 bg-white" aria-hidden />
          Open
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-amber-300 bg-amber-100" aria-hidden />
          Few slots left
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-slate-300 bg-slate-200" aria-hidden />
          Fully booked or closed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-cyan-700" aria-hidden />
          Your choice
        </li>
      </ul>
    </div>
  );
}
