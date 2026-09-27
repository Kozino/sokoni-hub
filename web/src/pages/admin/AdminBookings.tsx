/**
 * Admin oversight of service bookings.
 *
 * Two tabs, answering two different questions:
 *   Bookings — what is actually happening right now
 *   Providers — who is receiving demand and who is ignoring it
 *
 * The second tab is the commercial one. When service vendors start paying a
 * listing fee, "we sent you 47 bookings last month" is the argument, and
 * "you never opened 12 of them" is the reason a vendor gets suspended rather
 * than refunded.
 */

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { money, dateTime, timeAgo, titleCase, num } from '../../lib/format';
import { Alert, Spinner, Empty, Badge, Tabs, Stat } from '../../components/ui';
import { DataTable, type DTColumn } from '../../components/DataTable';

interface Booking {
  id: string; code: string; status: string;
  listing_title: string; business_name: string; vendor_city: string | null;
  contact_name: string; contact_phone: string;
  preferred_at: string | null; scheduled_at: string | null;
  quoted_price: string | null; currency: string;
  first_viewed_at: string | null; created_at: string;
}

interface VendorStat {
  vendor_id: string; business_name: string; city: string | null;
  bookings: string; completed: string; cancelled: string;
  no_shows: string; unseen: string; avg_response_hours: string | null;
}

const TONE: Record<string, 'grey' | 'green' | 'gold' | 'red' | 'blue' | 'terra'> = {
  new: 'gold', contacted: 'blue', confirmed: 'green',
  completed: 'grey', cancelled: 'red', no_show: 'red',
};

export default function AdminBookings() {
  const [tab, setTab] = useState('bookings');
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [stats, setStats] = useState<VendorStat[] | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    api.get<{ bookings: Booking[] }>('/bookings/admin')
      .then((r) => setRows(r.bookings)).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    setStats(null);
    api.get<{ vendors: VendorStat[] }>(`/bookings/admin/stats?days=${days}`)
      .then((r) => setStats(r.vendors)).catch(() => setStats([]));
  }, [days]);

  const bookingCols: DTColumn<Booking>[] = [
    { key: 'code', header: 'Reference', alwaysVisible: true,
      render: (b) => <><div>{b.code}</div><div className="hint">{timeAgo(b.created_at)}</div></>,
      csvValue: (b) => b.code },
    { key: 'listing_title', header: 'Service', render: (b) => b.listing_title },
    { key: 'business_name', header: 'Provider',
      render: (b) => <><div>{b.business_name}</div>{b.vendor_city && <div className="hint">{b.vendor_city}</div>}</>,
      csvValue: (b) => b.business_name },
    { key: 'contact_name', header: 'Customer',
      render: (b) => <><div>{b.contact_name}</div><div className="hint">{b.contact_phone}</div></>,
      csvValue: (b) => `${b.contact_name} ${b.contact_phone}` },
    { key: 'scheduled_at', header: 'When',
      render: (b) => b.scheduled_at ? dateTime(b.scheduled_at)
        : b.preferred_at ? <span className="hint">{dateTime(b.preferred_at)} (requested)</span>
        : <span className="hint">Flexible</span>,
      sortAccessor: (b) => b.scheduled_at || b.preferred_at || '',
      csvValue: (b) => b.scheduled_at || b.preferred_at || '' },
    { key: 'quoted_price', header: 'Advertised', align: 'right',
      render: (b) => b.quoted_price ? money(Number(b.quoted_price), b.currency) : '—',
      sortAccessor: (b) => Number(b.quoted_price ?? 0),
      csvValue: (b) => b.quoted_price ?? '' },
    { key: 'status', header: 'Status',
      render: (b) => <Badge tone={TONE[b.status] || 'grey'}>{titleCase(b.status.replace('_', ' '))}</Badge>,
      csvValue: (b) => b.status },
    { key: 'first_viewed_at', header: 'Seen', defaultHidden: true,
      render: (b) => b.first_viewed_at ? timeAgo(b.first_viewed_at) : <Badge tone="red">Never</Badge>,
      csvValue: (b) => b.first_viewed_at ?? 'never' },
  ];

  const statCols: DTColumn<VendorStat>[] = [
    { key: 'business_name', header: 'Provider', alwaysVisible: true,
      render: (v) => <><div>{v.business_name}</div>{v.city && <div className="hint">{v.city}</div>}</>,
      csvValue: (v) => v.business_name },
    { key: 'bookings', header: 'Bookings sent', align: 'right',
      render: (v) => num(Number(v.bookings)), sortAccessor: (v) => Number(v.bookings) },
    { key: 'completed', header: 'Completed', align: 'right',
      render: (v) => num(Number(v.completed)), sortAccessor: (v) => Number(v.completed) },
    { key: 'cancelled', header: 'Cancelled', align: 'right',
      render: (v) => num(Number(v.cancelled)), sortAccessor: (v) => Number(v.cancelled) },
    { key: 'no_shows', header: 'No shows', align: 'right',
      render: (v) => num(Number(v.no_shows)), sortAccessor: (v) => Number(v.no_shows) },
    { key: 'unseen', header: 'Never opened', align: 'right',
      render: (v) => Number(v.unseen) > 0
        ? <Badge tone="red">{v.unseen}</Badge> : num(0),
      sortAccessor: (v) => Number(v.unseen) },
    { key: 'avg_response_hours', header: 'Avg reply', align: 'right',
      render: (v) => v.avg_response_hours === null ? '—' : `${v.avg_response_hours} h`,
      sortAccessor: (v) => Number(v.avg_response_hours ?? 9999) },
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Service bookings</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Services are booked, not sold. No money passes through the platform on a booking,
        so none of this is commissioned — it is the demand record for service providers.
      </p>

      <Tabs
        tabs={[{ id: 'bookings', label: 'Bookings' }, { id: 'providers', label: 'Providers' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'bookings' && (
        rows === null ? <Spinner /> :
        rows.length === 0 ? <Empty icon="📅" title="No bookings yet" text="Service booking requests will appear here." /> :
        <DataTable rows={rows} columns={bookingCols} rowKey={(b) => b.id} exportFilename="service-bookings" />
      )}

      {tab === 'providers' && (
        <>
          <div className="row wrap mt-2" style={{ gap: 6 }}>
            {[7, 30, 90, 365].map((d) => (
              <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : ''}`} onClick={() => setDays(d)}>
                {d === 365 ? 'Last year' : `Last ${d} days`}
              </button>
            ))}
          </div>

          {stats === null ? <Spinner /> : (
            <>
              <div className="row wrap mt-2" style={{ gap: 12 }}>
                <Stat label="Providers with demand" value={String(stats.length)} />
                <Stat label="Bookings sent"
                  value={num(stats.reduce((a, v) => a + Number(v.bookings), 0))} />
                <Stat label="Never opened"
                  value={num(stats.reduce((a, v) => a + Number(v.unseen), 0))} />
              </div>

              {stats.some((v) => Number(v.unseen) > 0) && (
                <Alert kind="warn">
                  Some providers have never opened bookings sent to them. Those customers
                  were let down by the platform, not just by the vendor.
                </Alert>
              )}

              {stats.length === 0
                ? <Empty icon="📊" title="No bookings in this period" text="Try a longer range." />
                : <DataTable rows={stats} columns={statCols} rowKey={(v) => v.vendor_id} exportFilename="provider-demand" />}
            </>
          )}
        </>
      )}
    </div>
  );
}
