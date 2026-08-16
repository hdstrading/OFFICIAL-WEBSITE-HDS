import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Seo } from '../lib/seo';
import { useCompany, usePrimaryHotline } from '../lib/company';
import { Alert, EmptyState, PageHeader, Section, Spinner } from '../components/ui';
import { PostBody } from '../components/PostBody';
import type { Post } from '../types';

/**
 * Every published FAQ on one page.
 *
 * Grouped by the category staff typed on each one, so a long list stays
 * navigable — and left ungrouped if nobody has used categories yet, which is
 * better than a single heading called "Other" above everything.
 */
export default function FaqPage() {
  const company = useCompany();
  const primaryHotline = usePrimaryHotline();

  const [faqs, setFaqs] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .posts('faq')
      .then((data) => setFaqs(data.posts))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const byCategory = new Map<string, Post[]>();
    for (const faq of faqs) {
      const key = faq.category.trim();
      const list = byCategory.get(key) ?? [];
      list.push(faq);
      byCategory.set(key, list);
    }
    return [...byCategory.entries()];
  }, [faqs]);

  /**
   * Google shows these directly in search results, which is most of the point of
   * writing them. Only the questions with answers are included.
   */
  const structuredData = useMemo(() => {
    if (faqs.length === 0) return undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs
        .filter((faq) => faq.body.trim())
        .map((faq) => ({
          '@type': 'Question',
          name: faq.title,
          acceptedAnswer: { '@type': 'Answer', text: faq.body },
        })),
    };
  }, [faqs]);

  return (
    <>
      <Seo
        title="Frequently asked questions"
        description="Answers to the questions we are asked most about deliveries, payment, pool care, bookings and institutional accounts at HDS Trading OPC."
        path="/faq"
        structuredData={structuredData}
      />

      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        description={`If your question is not answered here, call ${primaryHotline} during ${company.hours.label}.`}
      />

      <Section className="py-10 sm:py-14 max-w-3xl">
        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <Spinner label="Loading…" />
        ) : faqs.length === 0 ? (
          <EmptyState
            icon={<HelpCircle className="h-10 w-10" aria-hidden />}
            title="No questions answered here yet"
            description="We are still writing these up. In the meantime our sales desks are happy to answer anything directly."
            action={
              <Link
                to="/contact"
                className="inline-flex rounded-xl bg-cyan-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-800"
              >
                Contact us
              </Link>
            }
          />
        ) : (
          <div className="space-y-10">
            {groups.map(([category, questions]) => (
              <div key={category || 'general'}>
                {category && (
                  <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-700 mb-4">
                    {category}
                  </h2>
                )}
                <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                  {questions.map((faq) => (
                    <details key={faq.id} className="group p-5 open:bg-slate-50/60">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-bold text-slate-900">
                        {faq.title}
                        <span
                          aria-hidden
                          className="mt-0.5 shrink-0 text-xl leading-none text-cyan-700 transition-transform group-open:rotate-45"
                        >
                          +
                        </span>
                      </summary>
                      <div className="mt-3">
                        <PostBody text={faq.body} />
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
