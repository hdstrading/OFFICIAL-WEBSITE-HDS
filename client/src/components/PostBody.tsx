import { ExternalLink } from 'lucide-react';
import type { Post } from '../types';

/**
 * Renders the text of a post.
 *
 * Deliberately plain text split into paragraphs, never HTML. The body is typed
 * into a form in the staff portal, and rendering it as markup would mean a
 * script pasted into that form — by anyone with a website-administrator account,
 * or by anyone who ever borrows one — running on every visitor's browser.
 * Paragraphs and line breaks cover what an announcement or a guide needs.
 */
export function PostBody({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-700">
      {paragraphs.map((block, index) => (
        <p key={index} className="whitespace-pre-line">
          {block}
        </p>
      ))}
    </div>
  );
}

/**
 * Turns a pasted video link into something watchable in place.
 *
 * YouTube and Vimeo are recognised and embedded. Anything else — a Facebook
 * video, a Drive link — becomes a button that opens where it lives, because
 * guessing at an embed URL and getting it wrong shows the visitor a blank box
 * with no way forward.
 */
export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const embed = embedUrl(url);

  if (!embed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-800 transition-colors"
      >
        Watch the video
        <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 aspect-video">
      <iframe
        src={embed}
        title={title}
        className="h-full w-full"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

/** The embeddable form of a video link, or null when we do not recognise it. */
export function embedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const id = parsed.searchParams.get('v');
    if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    // /embed/ID and /shorts/ID both carry the id in the path.
    const fromPath = parsed.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/);
    return fromPath ? `https://www.youtube-nocookie.com/embed/${fromPath[2]}` : null;
  }
  if (host === 'vimeo.com') {
    const id = parsed.pathname.match(/^\/(\d+)/);
    return id ? `https://player.vimeo.com/video/${id[1]}` : null;
  }
  return null;
}

/** A published date in the form a reader expects, not an ISO timestamp. */
export function postDate(post: Post): string {
  const when = new Date(post.createdAt);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
}
