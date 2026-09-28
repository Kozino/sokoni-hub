/**
 * Reviews — used by the product/service detail page and the store page.
 *
 * One component for both targets. A product review and a store review differ
 * only in what they point at; duplicating the summary, the distribution bars,
 * the form, the sort and the moderation states for each would be four copies
 * of the same rules to keep in step.
 *
 * The form is never shown speculatively. `/reviews/eligibility` is asked first,
 * so a buyer is either invited to write one, shown the one they already wrote,
 * or told plainly why they cannot — rather than typing six hundred characters
 * and discovering at submit time that they are not allowed to post it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { Alert, Empty, Field, Modal, Spinner } from './ui';
import { date, timeAgo } from '../lib/format';

interface Review {
  id: string; listing_id: string | null; rating: number;
  title: string | null; comment: string | null;
  helpful_count: number; created_at: string; edited_at: string | null;
  vendor_reply: string | null; vendor_replied_at: string | null;
  verified: boolean; buyer_name: string;
  listing_title: string | null; listing_slug: string | null; listing_kind: string | null;
  voted: boolean; mine: boolean;
}
interface Summary {
  count: number; average: number; verified_count: number;
  distribution: Record<string, number>;
}
interface Eligibility {
  can_review: boolean;
  reason?: 'already_reviewed' | 'own_store' | 'no_purchase';
  basis?: 'order' | 'booking';
  existing?: { id: string; rating: number; title: string | null; comment: string | null; editable: boolean };
}

/** Read-only stars. aria-label carries the value; the glyphs are decorative. */
export function Stars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const full = Math.round(value);
  return (
    <span className={`rv-stars rv-stars-${size}`} role="img" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? 'on' : 'off'} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

/** Keyboard-operable star input — radios, not divs with click handlers. */
function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="rv-input" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={`rv-input-star ${n <= value ? 'on' : ''}`}>
          <input
            type="radio" name="rating" value={n} checked={value === n}
            onChange={() => onChange(n)}
          />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{n} star{n === 1 ? '' : 's'}</span>
        </label>
      ))}
    </div>
  );
}

type Props = (
  | { listingId: string; vendorId?: never }
  | { vendorId: string; listingId?: never }
) & {
  title?: string;
  /**
   * Called with the live review count whenever it changes, so a tab label or
   * badge outside this component does not go stale after someone posts. The
   * page's own listing payload was fetched before the review existed.
   */
  onCount?: (n: number) => void;
  /**
   * Rendered inside the listing page's tab panel. The tab is already the
   * heading, so the internal <h2> is dropped, and the composer is shown inline
   * instead of behind a button and a modal — a buyer who has opened the
   * Reviews tab has already expressed the intent that the button was there to
   * capture.
   */
  embedded?: boolean;
};

export default function Reviews(props: Props) {
  const { listingId, vendorId, embedded, onCount } = props as
    { listingId?: string; vendorId?: string; embedded?: boolean; onCount?: (n: number) => void };
  const target = listingId ? `listing_id=${listingId}` : `vendor_id=${vendorId}`;
  const { user } = useAuth();
  const { push } = useToast();

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sort, setSort] = useState<'recent' | 'helpful' | 'high' | 'low'>('recent');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [err, setErr] = useState('');

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const q = `${target}&sort=${sort}${starFilter ? `&rating=${starFilter}` : ''}`;
    return api.get<{ reviews: Review[]; summary: Summary }>(`/reviews?${q}`)
      .then((r) => { setReviews(r.reviews); setSummary(r.summary); onCount?.(r.summary.count); })
      .catch((e) => setErr(e.message));
  }, [target, sort, starFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) { setElig(null); return; }
    api.get<Eligibility>(`/reviews/eligibility?${target}`)
      .then(setElig)
      // Eligibility failing must not break the page; it only hides the form.
      .catch(() => setElig(null));
  }, [user, target]);

  const openForm = () => {
    const ex = elig?.existing;
    setRating(ex?.rating ?? 0);
    setHeading(ex?.title ?? '');
    setBody(ex?.comment ?? '');
    setErr('');
    setOpen(true);
  };

  const submit = async () => {
    if (rating < 1) { setErr('Choose a rating'); return; }
    setBusy(true); setErr('');
    try {
      const ex = elig?.existing;
      if (ex) {
        await api.patch(`/reviews/${ex.id}`, { rating, title: heading || null, comment: body || null });
        push('Review updated', 'success');
      } else {
        await api.post('/reviews', {
          ...(listingId ? { listing_id: listingId } : { vendor_id: vendorId }),
          rating, title: heading || undefined, comment: body || undefined,
        });
        push('Thanks — your review is live', 'success');
        // The inline composer stays mounted, so it has to be cleared by hand;
        // leaving the text sitting there reads as "that did not save".
        setRating(0); setHeading(''); setBody('');
      }
      setOpen(false);
      await load();
      const e = await api.get<Eligibility>(`/reviews/eligibility?${target}`).catch(() => null);
      if (e) setElig(e);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const vote = async (r: Review) => {
    if (!user) { push('Sign in to mark a review helpful', 'info'); return; }
    try {
      const res = await api.post<{ voted: boolean; helpful_count: number }>(`/reviews/${r.id}/helpful`, {});
      setReviews((prev) => (prev ?? []).map((x) =>
        x.id === r.id ? { ...x, voted: res.voted, helpful_count: res.helpful_count } : x));
    } catch (e: any) { push(e.message, 'error'); }
  };

  const remove = async (r: Review) => {
    try {
      await api.del(`/reviews/${r.id}`);
      push('Review removed', 'success');
      await load();
      const e = await api.get<Eligibility>(`/reviews/eligibility?${target}`).catch(() => null);
      setElig(e);
    } catch (e: any) { push(e.message, 'error'); }
  };

  if (!reviews || !summary) return <Spinner />;

  const total = summary.count;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className="rv" id="reviews">
      {!embedded && (
        <div className="row-between mb-3">
          <h2 className="rv-title">{props.title ?? 'Reviews'}</h2>
          {elig?.can_review && (
            <button className="btn btn-primary btn-sm" onClick={openForm}>Write a review</button>
          )}
          {elig?.reason === 'already_reviewed' && elig.existing?.editable && (
            <button className="btn btn-sm" onClick={openForm}>Edit your review</button>
          )}
        </div>
      )}

      {/* Inline composer. Shown wherever the buyer is entitled to write, which
          in the tab means the form is simply there — no button, no modal, no
          second decision between "I want to say something" and saying it. */}
      {embedded && elig?.can_review && (
        <form className="rv-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <strong className="rv-compose-title">Write a review</strong>
          <p className="rv-sub">
            You bought this, so your review will show as a verified purchase.
          </p>
          <div className="rv-compose-row">
            <span className="rv-compose-label">Your rating</span>
            <StarInput value={rating} onChange={setRating} />
          </div>
          <input
            className="input" value={heading} maxLength={120}
            placeholder="Headline (optional) — e.g. Exactly as described"
            onChange={(e) => setHeading(e.target.value)}
          />
          <textarea
            className="input" rows={4} value={body} maxLength={2000}
            placeholder="How was the quality, the packaging, the timing?"
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="rv-compose-foot">
            <span className="rv-sub">{body.length}/2000 · editable for 30 days</span>
            <button className="btn btn-primary" type="submit" disabled={busy || rating < 1}>
              {busy ? 'Posting…' : 'Post review'}
            </button>
          </div>
          {err && <Alert kind="error">{err}</Alert>}
        </form>
      )}

      {embedded && elig?.reason === 'already_reviewed' && (
        <div className="rv-compose rv-compose-done">
          <span>You reviewed this.</span>
          {elig.existing?.editable && (
            <button className="btn btn-sm" onClick={openForm}>Edit your review</button>
          )}
        </div>
      )}

      {err && <Alert kind="error">{err}</Alert>}

      {total === 0 ? (
        <Empty
          icon="⭐"
          title="No reviews yet"
          text={elig?.can_review
            ? (embedded ? 'Be the first — the form is just above.'
                        : 'You have bought from here — be the first to say how it went.')
            : 'Reviews appear once a buyer has completed an order or a booking.'}
          action={elig?.can_review && !embedded
            ? <button className="btn btn-primary" onClick={openForm}>Write the first review</button>
            : undefined}
        />
      ) : (
        <>
          <div className="rv-summary">
            <div className="rv-score">
              <strong>{summary.average.toFixed(1)}</strong>
              <Stars value={summary.average} size="lg" />
              <span className="rv-sub">
                {total} review{total === 1 ? '' : 's'}
                {summary.verified_count > 0 && <> · {summary.verified_count} verified</>}
              </span>
            </div>

            {/* Clicking a bar filters. The counts are the whole target, so the
                bars stay put when a filter is applied. */}
            <div className="rv-bars">
              {[5, 4, 3, 2, 1].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`rv-bar-row ${starFilter === n ? 'active' : ''}`}
                  onClick={() => setStarFilter(starFilter === n ? null : n)}
                  aria-pressed={starFilter === n}
                >
                  <span className="rv-bar-label">{n}★</span>
                  <span className="rv-bar"><span style={{ width: `${pct(summary.distribution[n] ?? 0)}%` }} /></span>
                  <span className="rv-bar-count">{summary.distribution[n] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rv-toolbar">
            {starFilter && (
              <button className="btn btn-ghost btn-sm" onClick={() => setStarFilter(null)}>
                Clear {starFilter}★ filter
              </button>
            )}
            <label className="rv-sort">
              <span>Sort</span>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="recent">Most recent</option>
                <option value="helpful">Most helpful</option>
                <option value="high">Highest rated</option>
                <option value="low">Lowest rated</option>
              </select>
            </label>
          </div>

          {reviews.length === 0 ? (
            <Empty icon="🔍" title={`No ${starFilter}★ reviews`} text="Try a different filter." />
          ) : (
            <ul className="rv-list">
              {reviews.map((r) => (
                <li key={r.id} className="rv-item">
                  <div className="rv-head">
                    <Stars value={r.rating} size="sm" />
                    {r.verified && (
                      <span className="rv-verified" title="This buyer completed an order or booking">
                        ✓ Verified purchase
                      </span>
                    )}
                    <span className="rv-when">{timeAgo(r.created_at)}</span>
                  </div>

                  {r.title && <strong className="rv-item-title">{r.title}</strong>}

                  {/* On a store page, say which item the review is about. */}
                  {!listingId && r.listing_title && (
                    <span className="rv-on">
                      {/* by id, not slug: /listing/:id resolves a UUID. */}
                      on <Link to={`/listing/${r.listing_id}`}>{r.listing_title}</Link>
                    </span>
                  )}

                  {r.comment && <p className="rv-body">{r.comment}</p>}

                  <div className="rv-foot">
                    <span className="rv-author">{r.buyer_name}</span>
                    {r.edited_at && <span className="rv-when">· edited {date(r.edited_at)}</span>}
                    {!r.mine && (
                      <button
                        type="button"
                        className={`rv-helpful ${r.voted ? 'on' : ''}`}
                        onClick={() => vote(r)}
                        aria-pressed={r.voted}
                      >
                        {r.voted ? 'Helpful ✓' : 'Helpful'}
                        {r.helpful_count > 0 && <span> ({r.helpful_count})</span>}
                      </button>
                    )}
                    {r.mine && (
                      <button type="button" className="rv-helpful" onClick={() => remove(r)}>
                        Delete
                      </button>
                    )}
                  </div>

                  {r.vendor_reply && (
                    <div className="rv-reply">
                      <strong>Reply from the store</strong>
                      <p>{r.vendor_reply}</p>
                      {r.vendor_replied_at && <span className="rv-when">{timeAgo(r.vendor_replied_at)}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Why the form is absent, when it is. Silence reads as a broken page. */}
      {user && elig && !elig.can_review && elig.reason === 'no_purchase' && (
        <p className="rv-note">
          Reviews come from buyers who actually bought.{' '}
          {listingId ? 'Once your order is delivered — or your booking completed — you can review this here.'
            : 'Once you have completed an order or a booking with this store, you can review it here.'}
        </p>
      )}
      {!user && total > 0 && (
        <p className="rv-note">
          <Link to="/login">Sign in</Link> to mark reviews helpful, or to review something you have bought.
        </p>
      )}

      <Modal
        open={open}
        title={elig?.existing ? 'Edit your review' : 'Write a review'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : elig?.existing ? 'Save changes' : 'Post review'}
            </button>
          </>
        }
      >
        <Field label="Your rating">
          <StarInput value={rating} onChange={setRating} />
        </Field>
        <Field label="Headline" hint="Optional. A short summary.">
          <input className="input" value={heading} maxLength={120}
            placeholder="e.g. Exactly as described" onChange={(e) => setHeading(e.target.value)} />
        </Field>
        <Field label="Your review" hint="Optional. What was good, what was not.">
          <textarea className="input" rows={5} value={body} maxLength={2000}
            placeholder="How was the quality, the packaging, the timing?"
            onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="rv-note">
          Your name and rating will be shown publicly. You can edit this for 30 days.
        </p>
        {err && <Alert kind="error">{err}</Alert>}
      </Modal>
    </section>
  );
}
