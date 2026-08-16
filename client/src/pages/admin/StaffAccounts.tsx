import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus, Trash2, X } from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { ROLE_LABELS, type AdminRole, type StaffUser } from '../../types';
import { Alert, Badge, Button, SelectField, Spinner, TextField } from '../../components/ui';

/**
 * Who works here, and what each of them may touch.
 *
 * Super admin only — this is the one screen that can hand somebody else the
 * keys, so it is also the one screen where a mistake is expensive. The server
 * refuses to let the last super admin demote, deactivate or delete themselves;
 * this shows why rather than only reporting that it failed.
 */
export default function StaffAccounts({ onError }: { onError: (err: unknown) => void }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .users()
      .then((data) => setUsers(data.users))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  /**
   * The last-super-admin guards come back as a 409 with a sentence explaining
   * what would have broken. Show that sentence — it is more useful than
   * "something went wrong", and it is the only warning anybody gets.
   */
  async function guarded(action: () => Promise<unknown>, success: string) {
    setRefusal(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRefusal(err.message);
        return;
      }
      onError(err);
    }
  }

  const changeRole = (user: StaffUser, role: AdminRole) =>
    guarded(
      () => adminApi.updateUser(user.id, { email: user.email, name: user.name, role }),
      `${user.name} is now a ${ROLE_LABELS[role].name.toLowerCase()}.`,
    );

  const setActive = (user: StaffUser, active: boolean) =>
    guarded(
      () => adminApi.updateUser(user.id, { email: user.email, name: user.name, role: user.role, active }),
      active ? `${user.name} can sign in again.` : `${user.name} can no longer sign in.`,
    );

  function remove(user: StaffUser) {
    if (
      !confirm(
        `Delete the account for ${user.name}? They will lose access immediately. ` +
          'Switching the account off instead keeps the record of who did what.',
      )
    )
      return;
    void guarded(() => adminApi.deleteUser(user.id), `${user.name}'s account was deleted.`);
  }

  if (loading) return <Spinner label="Loading staff accounts…" />;

  return (
    <div className="space-y-5">
      {notice && <Alert tone="success">{notice}</Alert>}
      {refusal && <Alert tone="warning">{refusal}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Staff accounts</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Everyone signs in with their own email address and password.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add somebody
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {users.map((user) => (
            <li key={user.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 flex items-center gap-2">
                    {user.name}
                    {!user.active && <Badge tone="red">Switched off</Badge>}
                  </p>
                  <p className="text-sm text-slate-500 break-all">{user.email}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {user.lastLoginAt
                      ? `Last signed in ${formatDateTime(user.lastLoginAt)}`
                      : 'Has not signed in yet'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SelectField
                    label="Access"
                    hideLabel
                    value={user.role}
                    onChange={(e) => void changeRole(user, e.target.value as AdminRole)}
                  >
                    {(Object.keys(ROLE_LABELS) as AdminRole[]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role].name}
                      </option>
                    ))}
                  </SelectField>
                  <Button variant="secondary" size="sm" onClick={() => setResetting(user)}>
                    <KeyRound className="h-4 w-4" aria-hidden />
                    Set password
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void setActive(user, !user.active)}>
                    {user.active ? 'Switch off' : 'Switch on'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(user)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Delete {user.name}</span>
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{ROLE_LABELS[user.role].scope}</p>
            </li>
          ))}
        </ul>
      </div>

      {adding && (
        <NewStaffForm
          onClose={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice(`${name} can now sign in.`);
            load();
          }}
          onError={onError}
        />
      )}

      {resetting && (
        <PasswordForm
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null);
            setNotice('Password changed. Tell them in person, not by email.');
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ new staff */

function NewStaffForm({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
  onError: (err: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('inventory_manager');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await adminApi.createUser({ name, email, role, password });
      onCreated(name);
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
    <Modal title="Add a staff account" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <TextField
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fields.name}
          required
          autoFocus
        />
        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fields.email}
          hint="This is what they sign in with."
          required
        />
        <SelectField
          label="What may they access?"
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
          hint={ROLE_LABELS[role].scope}
        >
          {(Object.keys(ROLE_LABELS) as AdminRole[]).map((key) => (
            <option key={key} value={key}>
              {ROLE_LABELS[key].name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="First password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
          hint="At least 12 characters. A short phrase is easier to remember and harder to guess. Give it to them in person, not over chat."
          autoComplete="new-password"
          required
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------- set password */

function PasswordForm({
  user,
  onClose,
  onDone,
  onError,
}: {
  user: StaffUser;
  onClose: () => void;
  onDone: () => void;
  onError: (err: unknown) => void;
}) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFieldError(undefined);
    try {
      await adminApi.setUserPassword(user.id, password);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setFieldError(err.fields.password ?? err.message);
        return;
      }
      onError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Set a new password for ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
          hint="At least 12 characters. They can change it themselves once they are in."
          autoComplete="new-password"
          required
          autoFocus
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Set password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------- modal */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
