import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { Seo } from '../../lib/seo';
import { SITE } from '../../config/site';
import { Alert, Button, Spinner, TextField } from '../../components/ui';
import AdminDashboard from './AdminDashboard';

/**
 * The staff portal. Reached only via the secret path — nothing on the public
 * site links here, and the page is marked noindex.
 *
 * Authentication is a server-side session cookie, so signing in gives the
 * browser no credential it can leak: there is no token in localStorage for a
 * script to read.
 */
export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An existing session survives a refresh, so check before showing the form.
  const checkSession = useCallback(async () => {
    try {
      const me = await adminApi.me();
      setSignedInAs(me.email);
    } catch {
      setSignedInAs(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.login(email, password);
      setSignedInAs(result.email);
      setPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await adminApi.logout().catch(() => undefined);
    setSignedInAs(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  if (!signedInAs) {
    return (
      <>
        <Seo title="Staff sign-in" description="Staff access only." noindex />
        <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <span
                aria-hidden
                className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-cyan-700 text-white font-extrabold"
              >
                HDS
              </span>
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">Staff portal</h1>
              <p className="mt-1 text-sm text-slate-500">
                Authorised personnel only. All sign-ins are logged.
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              noValidate
              className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm"
            >
              {error && <Alert tone="error">{error}</Alert>}

              <TextField
                label="Email address"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
              <TextField
                label="Password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />

              <Button type="submit" size="lg" fullWidth loading={submitting}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Sign in
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-400">
              <Link to="/" className="hover:text-cyan-700">
                Return to {SITE.domain}
              </Link>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title="Staff portal" description="Staff access only." noindex />
      <div className="min-h-screen bg-slate-100">
        <header className="bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-600 font-extrabold text-sm shrink-0"
              >
                HDS
              </span>
              <div className="min-w-0">
                <p className="font-extrabold tracking-tight truncate">Staff portal</p>
                <p className="text-[11px] text-slate-400 truncate">{signedInAs}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="hidden sm:block text-sm font-semibold text-slate-300 hover:text-white px-3 py-2"
              >
                View site
              </Link>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <AdminDashboard onSessionExpired={() => setSignedInAs(null)} />
      </div>
    </>
  );
}
