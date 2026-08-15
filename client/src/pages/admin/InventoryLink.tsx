import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, RefreshCw, Send } from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { formatDateTime, peso } from '../../lib/format';
import type { Order } from '../../types';
import { Alert, Badge, Button, Spinner } from '../../components/ui';

/**
 * Orders on their way to the inventory system.
 *
 * Only the ones that have not arrived are listed — a queue that has drained
 * shows nothing, which is the state staff want to see at a glance. Anything
 * still here either has not been tried yet or needs a person.
 */
export default function InventoryLink({ onError }: { onError: (err: unknown) => void }) {
  const [configured, setConfigured] = useState(true);
  const [counts, setCounts] = useState({ pending: 0, failed: 0, sent: 0 });
  const [backlog, setBacklog] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .inventoryBacklog()
      .then((data) => {
        setConfigured(data.configured);
        setCounts(data.counts);
        setBacklog(data.orders);
      })
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function testConnection() {
    setBusy('ping');
    setPingResult(null);
    try {
      const result = await adminApi.inventoryPing();
      setPingResult({
        ok: true,
        message: result.warehouse_configured
          ? 'Connected. The inventory system is reachable and has a warehouse configured.'
          : 'Connected, but no warehouse is set up in the inventory system — orders will be rejected until one is.',
      });
    } catch (error) {
      setPingResult({
        ok: false,
        message: error instanceof ApiError ? error.message : 'Could not reach the inventory system.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function sendAll() {
    setBusy('drain');
    try {
      const data = await adminApi.drainInventoryQueue();
      setCounts(data.counts);
      setBacklog(data.orders);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(null);
    }
  }

  async function retryOne(order: Order) {
    setBusy(order.id);
    try {
      await adminApi.retryInventoryPush(order.id);
      load();
    } catch (error) {
      // A failed retry is expected often enough that it belongs on the row
      // rather than as a dashboard-wide error banner.
      setBacklog((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                inventoryError:
                  error instanceof ApiError ? error.message : 'Retry failed.',
                inventoryStatus: 'failed',
              }
            : o,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Checking the inventory link…" />;

  return (
    <div className="space-y-5">
      {!configured && (
        <Alert tone="warning" title="The inventory system link is not configured">
          Orders are being recorded here but not sent to the warehouse. Set{' '}
          <code className="font-mono text-xs">INVENTORY_API_URL</code> and{' '}
          <code className="font-mono text-xs">INVENTORY_API_KEY</code> on the server, then restart.
          Nothing is lost in the meantime — once configured, use “Send all now”.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Waiting to send', counts.pending, 'Will go automatically'],
          ['Needs attention', counts.failed, 'Retry after fixing the cause'],
          ['In the warehouse', counts.sent, 'Became sales orders'],
        ].map(([label, value, note]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p
              className={`mt-1.5 text-2xl font-extrabold ${
                label === 'Needs attention' && (value as number) > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {value as number}
            </p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Connection</h2>
        <p className="mt-1 text-sm text-slate-500">
          Orders are sent once payment is confirmed. Bank deposit and cash on delivery go
          immediately, marked as not yet paid so the warehouse knows not to release them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={testConnection} loading={busy === 'ping'}>
            <PlugZap className="h-4 w-4" aria-hidden />
            Test connection
          </Button>
          <Button onClick={sendAll} loading={busy === 'drain'} disabled={!configured}>
            <Send className="h-4 w-4" aria-hidden />
            Send all now
          </Button>
          <Button variant="ghost" onClick={load}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </Button>
        </div>
        {pingResult && (
          <div className="mt-4">
            <Alert tone={pingResult.ok ? 'success' : 'error'}>{pingResult.message}</Alert>
          </div>
        )}
      </div>

      {backlog.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
          <p className="mt-2 font-bold text-emerald-900">Everything is in the warehouse</p>
          <p className="mt-1 text-sm text-emerald-800">
            Every order that should have been sent has become a sales order.
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-base font-extrabold text-slate-900 mb-3">
            Not yet in the warehouse ({backlog.length})
          </h2>
          <ul className="space-y-3">
            {backlog.map((order) => (
              <li
                key={order.id}
                className={`rounded-2xl border p-5 ${
                  order.inventoryStatus === 'failed'
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-slate-900">{order.reference}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {order.customerName}
                      {order.institutionName && ` · ${order.institutionName}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDateTime(order.createdAt)} · {peso(order.total)}
                    </p>
                    <p className="mt-2 text-xs text-slate-600">
                      {order.items.map((i) => `${i.sku || '(no SKU)'} ×${i.quantity}`).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1.5">
                    <Badge tone={order.inventoryStatus === 'failed' ? 'red' : 'amber'}>
                      {order.inventoryStatus === 'failed' ? 'Needs attention' : 'Waiting to send'}
                    </Badge>
                    <p className="text-[11px] text-slate-500">
                      {order.inventoryAttempts} attempt{order.inventoryAttempts === 1 ? '' : 's'}
                    </p>
                    <Badge tone={order.paymentStatus === 'paid' ? 'emerald' : 'slate'}>
                      {order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </div>
                </div>

                {order.inventoryError && (
                  <p className="mt-3 rounded-xl border border-red-200 bg-white px-3.5 py-2.5 text-xs text-red-800 leading-relaxed">
                    {order.inventoryError}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-slate-200/70">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === order.id}
                    onClick={() => retryOne(order)}
                    disabled={!configured}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Send now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
