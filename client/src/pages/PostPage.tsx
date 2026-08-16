import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { Alert, Badge, Section, Spinner } from '../components/ui';
import { PostBody, VideoEmbed, postDate } from '../components/PostBody';
import { POST_TYPE_LABELS, type Post } from '../types';

/** One announcement, guide or video, read on its own page. */
export default function PostPage() {
  const { slug = '' } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .post(slug)
      .then((data) => setPost(data.post))
      .catch((err: ApiError) =>
        setError(
          err.status === 404
            ? 'We could not find that page. It may have been taken down.'
            : err.message,
        ),
      )
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Section className="py-20">
        <Spinner label="Loading…" />
      </Section>
    );
  }

  if (error || !post) {
    return (
      <>
        <Seo title="Page not found" description="We could not find that page." noindex />
        <Section className="py-20 max-w-2xl">
          <Alert tone="error">{error ?? 'We could not find that page.'}</Alert>
          <Link
            to="/resources"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to news &amp; guides
          </Link>
        </Section>
      </>
    );
  }

  const date = postDate(post);

  return (
    <>
      <Seo
        title={post.title}
        description={post.summary || post.body.slice(0, 155)}
        path={`/resources/${post.slug}`}
        image={post.image || undefined}
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'News & guides', path: '/resources' },
          { name: post.title, path: `/resources/${post.slug}` },
        ])}
      />

      <Section className="py-10 sm:py-14 max-w-3xl">
        <Link
          to="/resources"
          className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:text-cyan-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          News &amp; guides
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge tone="cyan">{POST_TYPE_LABELS[post.type].singular}</Badge>
          {post.category && <Badge>{post.category}</Badge>}
        </div>

        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          {post.title}
        </h1>

        <p className="mt-3 text-sm text-slate-500">
          {[post.authorName, date].filter(Boolean).join(' · ')}
        </p>

        {post.summary && (
          <p className="mt-6 text-lg leading-relaxed text-slate-700 font-medium">{post.summary}</p>
        )}

        {post.videoUrl && (
          <div className="mt-8">
            <VideoEmbed url={post.videoUrl} title={post.title} />
          </div>
        )}

        {post.image && !post.videoUrl && (
          <img
            src={post.image}
            alt=""
            className="mt-8 w-full rounded-2xl border border-slate-200 object-cover"
            loading="lazy"
          />
        )}

        {post.body && (
          <div className="mt-8">
            <PostBody text={post.body} />
          </div>
        )}
      </Section>
    </>
  );
}
