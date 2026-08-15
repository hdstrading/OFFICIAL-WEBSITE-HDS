import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, PackageSearch, PlugZap, RefreshCw, Send } from 'lucide-react';
import { adminApi, ApiError, type CatalogSyncResult } from '../../lib/api';
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
  const [sync, setSync] = useState<CatalogSyncResult | null>(null);

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

  async function runSync(preview: boolean) {
    setBusy(preview ? 'preview' : 'sync');
    setSync(null);
    try {
      const result = preview ? await adminApi.previewCatalogSync() : await adminApi.applyCatalogSync();
      setSync(result);
    } catch (error) {
      onError(error);
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

      {/* Catalog sync */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <PackageSearch className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
          Catalog
        </h2>
        <p className="mt-1 text-sm text-slate-500 leading-relaxed">
          Pulls items ticked <strong>Sales Information</strong> in the inventory system, with their
          prices and stock. Your feature bullets, specifications, photos and product names stay as
          you wrote them — only the commercial fields are refreshed.
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={() => runSync(true)} loading={busy === 'preview'}>
            <Eye className="h-4 w-4" aria-hidden />
            Preview changes
          </Button>
          <Button onClick={() => runSync(false)} loading={busy === 'sync'} disabled={!configured}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Sync now
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Preview first if you are unsure. It works out every change and writes nothing — worth
          doing before the first sync, to check a price against what you expect.
        </p>

        {sync && (
          <div className="mt-4">
            {sync.error ? (
              <Alert tone="error">{sync.error}</Alert>
            ) : (
              <>
                <Alert tone={sync.dryRun ? 'info' : 'success'}>
                  {sync.dryRun ? 'Preview — nothing was saved. ' : 'Catalog updated. '}
                  <strong>{sync.created}</strong> new, <strong>{sync.updated}</strong> updated,{' '}
                  <strong>{sync.relisted}</strong> relisted, <strong>{sync.hidden}</strong> hidden,{' '}
                  {sync.unchanged} unchanged.
                </Alert>

                {sync.changes.length > 0 && (
                  <ul className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                    {sync.changes.map((change) => (
                      <li key={`${change.action}-${change.sku}`} className="flex items-center justify-between gap-3 px-3.5 py-2">
                        <span className="min-w-0">
                          <span className="font-mono text-xs text-slate-500">{change.sku}</span>
                          <span className="ml-2 text-slate-900">{change.name}</span>
                        </span>
                        <span className="shrink-0 flex items-center gap-2 text-xs">
                          {change.priceFrom !== undefined && change.priceTo !== undefined && (
                            <span className="text-slate-600">
                              {peso(change.priceFrom)} → <strong>{peso(change.priceTo)}</strong>
                            </span>
                          )}
                          {change.priceFrom === undefined && change.priceTo !== undefined && (
                            <span className="text-slate-600">{peso(change.priceTo)}</span>
                          )}
                          {change.stockTo !== undefined && change.stockTo !== null && (
                            <span className="text-slate-500">stock {change.stockTo}</span>
                          )}
                          <Badge
                            tone={
                              change.action === 'hide'
                                ? 'red'
                                : change.action === 'create'
                                  ? 'emerald'
                                  : 'cyan'
                            }
                          >
                            {change.action}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {sync.withoutSku.length > 0 && (
                  <div className="mt-3">
                    <Alert tone="warning" title={`${sync.withoutSku.length} product(s) have no SKU`}>
                      These cannot be matched to the inventory system, so they are never synced and
                      an order containing one cannot be sent to the warehouse:{' '}
                      {sync.withoutSku.map((p) => p.name).join(', ')}. Add a SKU under Catalog.
                    </Alert>
                  </div>
                )}
              </>
            )}
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
