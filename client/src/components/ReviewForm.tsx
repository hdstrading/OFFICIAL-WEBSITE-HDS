import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { Alert, Button, StarPicker, TextAreaField, TextField } from './ui';

/**
 * Feedback form. Submissions are held for moderation, which the form says up
 * front so nobody wonders why their review has not appeared.
 */
export default function ReviewForm({
  subjectType,
  subjectId,
  subjectName,
  onSubmitted,
}: {
  subjectType: 'product' | 'service';
  subjectId: string;
  subjectName: string;
  onSubmitted?: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [authorName, setAuthorName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [role, setRole] = useState('');
  const [comment, setComment] = useState('');
  const [reference, setReference] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    // Checked here as well as on the server so the star picker can show its own
    // message without a round trip.
    if (rating === 0) {
      setFieldErrors({ rating: 'Please choose a rating from 1 to 5 stars.' });
      setSubmitting(false);
      return;
    }

    try {
      const result = await api.submitReview({
        subjectType,
        subjectId,
        authorName,
        institutionName: institutionName || undefined,
        role: role || undefined,
        rating,
        comment,
        reference: reference || undefined,
      });
      setMessage(result.message);
      setRating(0);
      setAuthorName('');
      setInstitutionName('');
      setRole('');
      setComment('');
      setReference('');
      onSubmitted?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (message) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <Alert tone="success" title="Thank you for your feedback">
          {message}
        </Alert>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setMessage(null)}>
          Write another review
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4"
      noValidate
    >
      <div>
        <h3 className="text-base font-extrabold text-slate-900">Rate this {subjectType}</h3>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Tell other facilities managers how {subjectName} worked for your property. We check every
          review before publishing it.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <StarPicker value={rating} onChange={setRating} error={fieldErrors.rating} />

      <TextField
        label="Your name"
        name="authorName"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        error={fieldErrors.authorName}
        required
        autoComplete="name"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Company or property"
          name="institutionName"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          error={fieldErrors.institutionName}
          placeholder="Optional"
          autoComplete="organization"
        />
        <TextField
          label="Your role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          error={fieldErrors.role}
          placeholder="Optional"
        />
      </div>

      <TextAreaField
        label="Your feedback"
        name="comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        error={fieldErrors.comment}
        required
        rows={4}
        placeholder="What worked well? What would you tell another buyer?"
        hint="At least 10 characters."
      />

      <TextField
        label="Order or booking reference"
        name="reference"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        error={fieldErrors.reference}
        placeholder="HDS-ORD-2026-XXXXXX"
        hint="Optional. Adding it marks your review as a verified customer."
      />

      <Button type="submit" loading={submitting} fullWidth>
        Submit feedback
      </Button>
    </form>
  );
}
