import { BadgeCheck, MessageSquare } from 'lucide-react';
import type { Review } from '../types';
import { formatDate } from '../lib/format';
import { EmptyState, StarRating } from './ui';

export default function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="No reviews yet"
        description="Be the first to share how this worked for your property. Reviews help other facilities managers decide."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                {review.authorName}
                {review.verified && (
                  // Verified means the reviewer gave us an order or booking
                  // reference that matched a real record.
                  <span
                    title="Verified customer — matched to a real order or booking"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"
                  >
                    <BadgeCheck className="h-4 w-4" aria-hidden />
                    Verified customer
                  </span>
                )}
              </p>
              {(review.role || review.institutionName) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {[review.role, review.institutionName].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <StarRating value={review.rating} count={1} showCount={false} />
              <p className="mt-1 text-[11px] text-slate-400">{formatDate(review.createdAt)}</p>
            </div>
          </div>

          <p className="mt-3.5 text-sm text-slate-700 leading-relaxed">{review.comment}</p>

          <p className="mt-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            On {review.subjectName}
          </p>
        </li>
      ))}
    </ul>
  );
}
