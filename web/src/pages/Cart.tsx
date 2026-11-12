import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { money } from '../lib/format';
import { Empty, QtyInput } from '../components/ui';
import { useT } from '../i18n';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { CartQuote } from '../types';

export default function Cart() {
  const t = useT();
  const { items, byVendor, currency, setQty, remove, clear } = useCart();
  const nav = useNavigate();
  const multi = byVendor.length > 1;

  // Quote each store on its own so a mixed cart never looks like one delivery.
  const [quotes, setQuotes] = useState<Record<string, CartQuote>>({});
  useEffect(() => {
    if (byVendor.length === 0) { setQuotes({}); return; }
    let cancelled = false;
    Promise.all(byVendor.map((g) =>
      api.post<CartQuote>('/orders/quote', {
        items: g.items.map((i) => ({ listing_id: i.listing_id, qty: i.qty, option: i.option || undefined })),
        fulfilment_mode: 'delivery',
      }).then((q) => [g.vendor_id, q] as const).catch(() => [g.vendor_id, null] as const)
    )).then((rows) => {
      if (cancelled) return;
      setQuotes(Object.fromEntries(rows.filter((entry): entry is [string, CartQuote] => entry[1] != null)));
    });
    return () => { cancelled = true; };
  }, [items, byVendor]);

  if (items.length === 0)
    return (
      <div className="container container-narrow">
        <Empty icon="🛒" title={t('cart.empty.title')} text={t('cart.emptyText')} action={<Link to="/browse" className="btn btn-primary">{t('cart.startShopping')}</Link>} />
      </div>
    );

  const checkoutStore = (vendorId: string) => nav(`/checkout?vendor=${encodeURIComponent(vendorId)}`);

  return (
    <div className="container">
      <div className="row-between mb-3">
        <h1 style={{ margin: 0 }}>{t('cart.title')}</h1>
        <button className="btn btn-ghost btn-sm" onClick={clear}>{t('cart.clear')}</button>
      </div>

      {multi && (
        <div className="alert alert-info mb-3">
          {t('cart.multiStore', { count: byVendor.length })}
        </div>
      )}

      <div className="cart-layout">
        <div className="col">
          {byVendor.map((g) => {
            const q = quotes[g.vendor_id];
            const fee = q?.delivery_fee ?? 0;
            const total = q?.total ?? g.subtotal;
            return (
              <div key={g.vendor_id} className="card">
                <div className="card-head">
                  <h4>🏪 {g.vendor_name}</h4>
                  <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{money(g.subtotal, currency)}</span>
                </div>
                <div className="card-body col">
                  {g.items.map((i) => (
                    <div key={`${i.listing_id}::${i.option || ''}`} className="cart-line">
                      {i.image ? <img className="thumb" src={i.image} alt="" /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{i.kind === 'service' ? '💇' : '🛍️'}</div>}
                      <div className="cart-line-info">
                        <Link to={`/listing/${i.listing_id}`} className="cart-line-title">{i.title}</Link>
                        {i.option && (
                          <div style={{ fontSize: '.8rem', color: 'var(--muted)', fontWeight: 600 }}>
                            {t('cart.option', { option: i.option })}
                          </div>
                        )}
                        <div className="cart-line-price">
                          {money(i.price, i.currency)}{i.unit ? ` / ${i.unit}` : ''}
                        </div>
                      </div>
                      <div className="cart-line-controls">
                        <QtyInput value={i.qty} min={1} max={i.max ?? 999} onChange={(n) => setQty(i.listing_id, n, i.option)} />
                        <strong className="cart-line-total">{money(i.price * i.qty, i.currency)}</strong>
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(i.listing_id, i.option)} aria-label={t('cart.removeItem', { title: i.title })}>✕</button>
                      </div>
                    </div>
                  ))}
                  <div className="row-between" style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 8 }}>
                    <span>{t('cart.delivery')}</span>
                    <span>{q ? (fee > 0 ? t('cart.deliveryUpTo', { fee: money(fee, q.currency) }) : t('cart.deliveryFree')) : t('cart.deliveryAgreed')}</span>
                  </div>
                  <div className="row-between" style={{ marginTop: 4 }}>
                    <strong>{t('cart.total')}</strong>
                    <strong style={{ color: 'var(--terra-dark)' }}>{money(total, q?.currency ?? currency)}</strong>
                  </div>
                  <button className="btn btn-primary btn-block mt-2" onClick={() => checkoutStore(g.vendor_id)}>
                    {t('cart.checkoutStore', { store: g.vendor_name })}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card card-pad cart-summary">
          <h3>{t('cart.summary')}</h3>
          <div className="row-between"><span>{t('cart.itemsLabel')}</span><strong>{items.reduce((s, i) => s + i.qty, 0)}</strong></div>
          <div className="row-between"><span>{t('cart.storesLabel')}</span><strong>{byVendor.length}</strong></div>
          <p style={{ fontSize: '.82rem', color: 'var(--muted)', margin: '10px 0 0' }}>
            {multi ? t('cart.multiStoreHint') : t('cart.oneStoreNote')}
          </p>
          {!multi && (
            <button className="btn btn-primary btn-block btn-lg mt-2" onClick={() => checkoutStore(byVendor[0].vendor_id)}>{t('cart.proceed')}</button>
          )}
          <p className="center mt-1" style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
            {t('cart.codNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
