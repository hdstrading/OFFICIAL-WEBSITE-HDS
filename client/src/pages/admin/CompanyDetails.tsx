import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Save } from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { Alert, Button, Spinner, TextAreaField, TextField } from '../../components/ui';

/**
 * The company details the public website shows.
 *
 * Every one of these used to require a developer and a deploy to change. They
 * are saved to the database and read by the site on every page load, so a new
 * branch hotline is live the moment this form is saved.
 *
 * Clearing a field puts the original value back rather than leaving a hole in
 * the footer — so the way to remove a line is to replace it, not to empty it.
 */

type Field = {
  key: string;
  label: string;
  hint?: string;
  rows?: number;
  type?: 'text' | 'email' | 'number' | 'url';
};

const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: 'The business',
    blurb: 'Shown in the footer, on the about page and in search results.',
    fields: [
      { key: 'legalName', label: 'Registered name' },
      { key: 'shortName', label: 'Short name', hint: 'Used where the full name would be a mouthful.' },
      { key: 'tagline', label: 'Tagline', hint: 'One line describing what you sell. Appears in the page title.' },
      {
        key: 'description',
        label: 'Description',
        rows: 4,
        hint: 'Two or three sentences. This is what Google shows under your link, so write it for a customer, not for a search engine.',
      },
      { key: 'registration', label: 'Registration' },
    ],
  },
  {
    title: 'Where you are',
    blurb: 'The address on the contact page and in your search listing.',
    fields: [
      { key: 'addressFull', label: 'Full address', hint: 'The whole thing on one line, as customers should read it.' },
      { key: 'addressStreet', label: 'City or town', hint: 'Used by search engines to place you on a map.' },
      { key: 'addressRegion', label: 'Province or region' },
      { key: 'addressCountry', label: 'Country' },
    ],
  },
  {
    title: 'When you are open',
    blurb: 'Shown in the navbar, the footer and beside every contact number.',
    fields: [
      { key: 'hoursLabel', label: 'Opening hours', hint: 'As a customer should read them, e.g. Monday – Saturday, 8:00 AM – 6:00 PM.' },
      {
        key: 'hoursSchema',
        label: 'Opening hours for search engines',
        hint: 'A fixed format Google understands: Mo-Sa 08:00-18:00. Days are Mo Tu We Th Fr Sa Su and times are 24-hour.',
      },
    ],
  },
  {
    title: 'Hotlines',
    blurb: 'One branch per line. The first number on the first line is the one shown when a page can only show one.',
    fields: [
      {
        key: 'hotlines',
        label: 'Branch hotlines',
        rows: 5,
        hint: 'Write each branch as: Taytay: 0917 163 7359, 0967 031 5098 — the branch name, a colon, then the numbers separated by commas.',
      },
      { key: 'emergencyLabel', label: 'Emergency line heading' },
      {
        key: 'emergencyNote',
        label: 'Who the emergency line is for',
        rows: 3,
        hint: 'Be specific, or you will get calls you did not mean to invite.',
      },
      { key: 'emergencyNumbers', label: 'Emergency numbers', rows: 3, hint: 'One number per line.' },
    ],
  },
  {
    title: 'Email and social',
    blurb: 'The desks a customer can write to, and where they can message you.',
    fields: [
      { key: 'emailPrimary', label: 'Main email address', type: 'email' },
      { key: 'emailSales', label: 'Sales desks', rows: 3, hint: 'One address per line.' },
      { key: 'emailCorporate', label: 'Corporate accounts', rows: 3, hint: 'One address per line.' },
      { key: 'socialFacebook', label: 'Facebook page', type: 'url' },
      { key: 'socialMessenger', label: 'Messenger link', type: 'url', hint: 'Usually https://m.me/ followed by your page name.' },
    ],
  },
  {
    title: 'Delivery',
    blurb: 'This one changes what customers are charged, so check it twice.',
    fields: [
      {
        key: 'deliveryFreeThreshold',
        label: 'Free delivery above (₱)',
        type: 'number',
        hint: 'Orders at or above this subtotal ship free on your own fleet. Courier deliveries are always charged.',
      },
      { key: 'deliveryNote', label: 'How you describe it', rows: 2 },
    ],
  },
];

export default function CompanyDetails({ onError }: { onError: (err: unknown) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .companySettings()
      .then((data) => setValues(data.settings))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const result = await adminApi.saveCompanySettings(values);
      setValues(result.settings);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFields(err.fields);
        setError(err.message);
        return;
      }
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading company details…" />;

  return (
    <form onSubmit={submit} noValidate className="space-y-6 max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Company details</h2>
        <p className="mt-1 text-sm text-slate-500">
          What the public website shows. Changes go live as soon as you save — no developer needed.
        </p>
        <a
          href="/contact"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          See the contact page
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">Saved. The website is showing the new details now.</Alert>}

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5">
          <legend className="px-1 text-sm font-extrabold text-slate-900">{group.title}</legend>
          <p className="mb-4 text-sm text-slate-500">{group.blurb}</p>
          <div className="space-y-4">
            {group.fields.map((field) =>
              field.rows ? (
                <TextAreaField
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  rows={field.rows}
                  hint={field.hint}
                  error={fields[field.key]}
                  value={values[field.key] ?? ''}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              ) : (
                <TextField
                  key={field.key}
                  label={field.label}
                  name={field.key}
                  type={field.type ?? 'text'}
                  hint={field.hint}
                  error={fields[field.key]}
                  value={values[field.key] ?? ''}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              ),
            )}
          </div>
        </fieldset>
      ))}

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={saving}>
          <Save className="h-4 w-4" aria-hidden />
          Save company details
        </Button>
      </div>
    </form>
  );
}
