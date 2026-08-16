/**
 * Where the staff portal lives.
 *
 * This must match `ADMIN_PATH` in the server environment. It is baked in at
 * build time via Vite's `VITE_ADMIN_PATH`, so changing it means rebuilding the
 * client.
 *
 * The path used to be an unguessable string, on the theory that a portal nobody
 * can find is a portal nobody attacks. That is worth very little now and was
 * never the real protection: staff have their own accounts with their own
 * hashed passwords, sign-in attempts are rate limited, and the page is served
 * `noindex` and left out of robots.txt and the sitemap. Set `ADMIN_PATH` to
 * something obscure if you want the extra layer — nothing here depends on the
 * value — but a memorable address that staff can type is worth more than a
 * secret one they write down.
 */
const configured = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim();

export const ADMIN_PATH = (configured || 'adminportal').replace(/^\/+|\/+$/g, '');

export const ADMIN_URL = `/${ADMIN_PATH}`;
