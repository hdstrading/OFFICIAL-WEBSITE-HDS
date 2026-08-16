import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { POST_TYPE_LABELS, type Post, type PostType } from '../../types';
import {
  Alert,
  Badge,
  Button,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
} from '../../components/ui';

/**
 * Announcements, guides, videos and FAQs.
 *
 * One editor for all four because they differ only in how the website presents
 * them — a new kind of post is a new option in the dropdown, not a new screen to
 * learn.
 *
 * Nothing here is published by saving it. A post goes live when its "Published"
 * box is ticked, so a half-written announcement can be saved and finished
 * tomorrow without a customer ever seeing it.
 */

const TYPES = Object.keys(POST_TYPE_LABELS) as PostType[];

const emptyPost = (type: PostType) => ({
  type,
  slug: '',
  title: '',
  summary: '',
  body: '',
  videoUrl: '',
  image: '',
  category: '',
  authorName: '',
  published: false,
  pinned: false,
  sortOrder: 0,
});

type Draft = ReturnType<typeof emptyPost>;

export default function ContentEditor({ onError }: { onError: (err: unknown) => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | PostType>('all');
  const [editing, setEditing] = useState<Post | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .posts()
      .then((data) => setPosts(data.posts))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function remove(post: Post) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await adminApi.deletePost(post.id);
      load();
    } catch (err) {
      onError(err);
    }
  }

  /** The quickest possible way to take something down without deleting it. */
  async function togglePublished(post: Post) {
    try {
      await adminApi.updatePost(post.id, { ...post, published: !post.published });
      load();
    } catch (err) {
      onError(err);
    }
  }

  if (loading) return <Spinner label="Loading content…" />;

  const visible = filter === 'all' ? posts : posts.filter((post) => post.type === filter);

  if (editing) {
    return (
      <PostForm
        initial={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
        onError={onError}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Content</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Announcements, guides and videos appear under News &amp; guides. FAQs appear on the
            questions page.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          Write something
        </Button>
      </div>

      <div className="inline-flex flex-wrap gap-1.5">
        {(['all', ...TYPES] as ('all' | PostType)[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === key
                ? 'bg-cyan-700 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {key === 'all' ? 'Everything' : POST_TYPE_LABELS[key].plural}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Nothing here yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Write an announcement about holiday delivery, or answer the question customers ask most.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {visible.map((post) => (
            <li key={post.id} className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={post.published ? 'emerald' : 'amber'}>
                    {post.published ? 'Published' : 'Draft'}
                  </Badge>
                  <Badge>{POST_TYPE_LABELS[post.type].singular}</Badge>
                  {post.pinned && (
                    <Badge tone="indigo">
                      <Pin className="h-3 w-3" aria-hidden />
                      Pinned
                    </Badge>
                  )}
                </div>
                <p className="mt-2 font-bold text-slate-900">{post.title}</p>
                {post.summary && (
                  <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{post.summary}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  {[post.authorName, formatDate(post.createdAt)].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {post.published && post.type !== 'faq' && (
                  <a href={`/resources/${post.slug}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      View
                    </Button>
                  </a>
                )}
                <Button variant="secondary" size="sm" onClick={() => void togglePublished(post)}>
                  {post.published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditing(post)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove(post)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Delete {post.title}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- form */

function PostForm({
  initial,
  onCancel,
  onSaved,
  onError,
}: {
  initial: Post | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    initial
      ? {
          type: initial.type,
          slug: initial.slug,
          title: initial.title,
          summary: initial.summary,
          body: initial.body,
          videoUrl: initial.videoUrl,
          image: initial.image,
          category: initial.category,
          authorName: initial.authorName,
          published: initial.published,
          pinned: initial.pinned,
          sortOrder: initial.sortOrder,
        }
      : emptyPost('announcement'),
  );
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const isFaq = draft.type === 'faq';
  const isVideo = draft.type === 'video';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      if (initial) await adminApi.updatePost(initial.id, draft);
      else await adminApi.createPost(draft);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
        setFields(err.fields);
        setError(err.message);
        return;
      }
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-extrabold text-slate-900">
          {initial ? 'Edit post' : 'Write something new'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" aria-hidden />
          <span className="sr-only">Cancel</span>
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <SelectField
          label="What kind of post is this?"
          value={draft.type}
          onChange={(e) => set('type', e.target.value as PostType)}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {POST_TYPE_LABELS[type].singular}
            </option>
          ))}
        </SelectField>

        <TextField
          label={isFaq ? 'The question' : 'Title'}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          error={fields.title}
          hint={isFaq ? 'Word it the way a customer would ask it.' : undefined}
          required
          autoFocus
        />

        {!isFaq && (
          <TextAreaField
            label="Summary"
            rows={2}
            value={draft.summary}
            onChange={(e) => set('summary', e.target.value)}
            error={fields.summary}
            hint="One or two sentences. Shown in the listing and under your link in search results."
          />
        )}

        {isVideo && (
          <TextField
            label="Video link"
            type="url"
            value={draft.videoUrl}
            onChange={(e) => set('videoUrl', e.target.value)}
            error={fields.videoUrl}
            hint="Paste the YouTube or Vimeo link. Anything else becomes a button that opens the video where it lives."
            required
          />
        )}

        <TextAreaField
          label={isFaq ? 'The answer' : isVideo ? 'What the video covers' : 'The post'}
          rows={12}
          value={draft.body}
          onChange={(e) => set('body', e.target.value)}
          error={fields.body}
          hint="Plain writing. Leave a blank line between paragraphs. Formatting marks are shown as typed, so there is no need for them."
        />

        <TextField
          label="Category"
          value={draft.category}
          onChange={(e) => set('category', e.target.value)}
          hint={
            isFaq
              ? 'Groups questions on the page — Deliveries, Payment, Pool care. Leave blank for one list.'
              : 'Optional label shown on the post.'
          }
        />

        {!isVideo && (
          <TextField
            label="Image link"
            type="url"
            value={draft.image}
            onChange={(e) => set('image', e.target.value)}
            error={fields.image}
            hint="Optional. A web address of a picture to show at the top."
          />
        )}

        <TextField
          label="Written by"
          value={draft.authorName}
          onChange={(e) => set('authorName', e.target.value)}
          hint="Leave blank to use your own name."
        />

        <TextField
          label="Web address"
          value={draft.slug}
          onChange={(e) => set('slug', e.target.value)}
          error={fields.slug}
          hint="Leave blank and one is made from the title. Changing it on a post people have already shared breaks their links."
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={draft.published}
            onChange={(e) => set('published', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
          />
          <span>
            <span className="font-semibold text-slate-800">Published</span>
            <span className="block text-xs text-slate-500">
              Until this is ticked, only staff can see it.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => set('pinned', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
          />
          <span>
            <span className="font-semibold text-slate-800">Pin to the top</span>
            <span className="block text-xs text-slate-500">
              For something time-critical, like a holiday delivery notice.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {initial ? 'Save changes' : 'Create post'}
        </Button>
      </div>
    </form>
  );
}
