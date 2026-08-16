/**
 * Where the staff portal lives.
 *
 * This must match `ADMIN_PATH` in the server environment. It is baked in at
 * build time via Vite's `VITE_ADMIN_PATH`, so changing it means rebuilding the
 * client — which is the point: the path is not discoverable at runtime, and
 * nothing on the public site links to it.
 */
const configured = (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim();

export const ADMIN_PATH = (configured || 'staff-portal-9f3c').replace(/^\/+|\/+$/g, '');

export const ADMIN_URL = `/${ADMIN_PATH}`;
