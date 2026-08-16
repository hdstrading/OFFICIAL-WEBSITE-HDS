import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Newspaper, PlayCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { Alert, Badge, EmptyState, PageHeader, Section, Spinner } from '../components/ui';
import { postDate } from '../components/PostBody';
import { POST_TYPE_LABELS, type Post, type PostType } from '../types';

/**
 * Announcements, guides and videos, in one place.
 *
 * FAQs are deliberately not here — a question and its answer belong together on
 * one scannable page, which is what /faq is for.
 */

const FILTERS: { key: 'all' | PostType; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'article', label: 'Guides' },
  { key: 'video', label: 'Videos' },
];

const ICONS: Record<string, typeof Megaphone> = {
  announcement: Megaphone,
  article: Newspaper,
  video: PlayCircle,
};

export default function ResourcesPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | PostType>('all');

  useEffect(() => {
    api
      .posts()
      .then((data) => setPosts(data.posts.filter((post) => post.type !== 'faq')))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => (filter === 'all' ? posts : posts.filter((post) => post.type === filter)),
    [posts, filter],
  );

  return (
    <>
      <Seo
        title="News, guides & videos"
        description="Announcements, cleaning and pool-care guides, and how-to videos from HDS Trading OPC — practical reading for the people who keep hotels, resorts, clinics and institutions clean."
        path="/resources"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'News & guides', path: '/resources' },
        ])}
      />

      <PageHeader
        eyebrow="Resources"
        title="News, guides & videos"
        description="Service announcements, practical guides on sanitation and pool care, and short videos from our crews."
      />

      <Section className="py-10 sm:py-14">
        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <Spinner label="Loading…" />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="h-10 w-10" aria-hidden />}
            title="Nothing published yet"
            description="We are preparing our first guides and announcements. Check back soon, or call a branch hotline if you need something now."
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-8">
              {FILTERS.map((option) => {
                const active = filter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    aria-pressed={active}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                      active
                        ? 'border-cyan-700 bg-cyan-700 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-800'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                description="There is nothing published under this heading. Try another one."
              />
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((post) => {
                  const Icon = ICONS[post.type] ?? Newspaper;
                  const date = postDate(post);
                  return (
                    <li key={post.id}>
                      <Link
                        to={`/resources/${post.slug}`}
                        className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-cyan-700" aria-hidden />
                          <Badge tone={post.pinned ? 'amber' : 'cyan'}>
                            {post.pinned ? 'Pinned' : POST_TYPE_LABELS[post.type].singular}
                          </Badge>
                        </div>
                        <h2 className="mt-3 text-base font-bold text-slate-900 group-hover:text-cyan-800">
                          {post.title}
                        </h2>
                        {post.summary && (
                          <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                            {post.summary}
                          </p>
                        )}
                        {date && <p className="mt-4 text-xs text-slate-400">{date}</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Section>
    </>
  );
}
