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
  const { items, byVendor, subtotal, currency, setQty, remove, clear } = useCart();
  const nav = useNavigate();

  // Show the real delivery fee in the cart so the total doesn't jump at checkout.
  const [quote, setQuote] = useState<CartQuote | null>(null);
  useEffect(() => {
    if (items.length === 0) { setQuote(null); return; }
    let cancelled = false;
    api.post<CartQuote>('/orders/quote', {
      items: items.map((i) => ({ listing_id: i.listing_id, qty: i.qty, option: i.option || undefined })),
      fulfilment_mode: 'delivery',
    }).then((q) => { if (!cancelled) setQuote(q); }).catch(() => { if (!cancelled) setQuote(null); });
    return () => { cancelled = true; };
  }, [items]);

  if (items.length === 0)
    return (
      <div className="container container-narrow">
        <Empty icon="🛒" title={t('cart.empty.title')} text={t('cart.emptyText')} action={<Link to="/browse" className="btn btn-primary">{t('cart.startShopping')}</Link>} />
      </div>
    );

  return (
    <div className="container">
      <div className="row-between mb-3">
        <h1 style={{ margin: 0 }}>{t('cart.title')}</h1>
        <button className="btn btn-ghost btn-sm" onClick={clear}>{t('cart.clear')}</button>
      </div>

      <div className="cart-layout">
        <div className="col">
          {byVendor.map((g) => (
            <div key={g.vendor_id} className="card">
              <div className="card-head">
                <h4>🏪 {g.vendor_name}</h4>
                <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{money(g.subtotal, currency)}</span>
              </div>
              <div className="card-body col">
                {g.items.map((i) => (
                  // Same listing in two sizes = two separate lines, so the key
                  // must include the option.
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
              </div>
            </div>
          ))}
          {byVendor.length > 1 && (
            <div className="alert alert-info">
              {t('cart.multiStore', { count: byVendor.length })}
            </div>
          )}
        </div>

        <div className="card card-pad cart-summary">
          <h3>{t('cart.summary')}</h3>
          <div className="row-between"><span>{t('cart.itemsLabel')}</span><strong>{items.reduce((s, i) => s + i.qty, 0)}</strong></div>
          <div className="row-between"><span>{t('cart.subtotal')}</span><strong>{money(subtotal, currency)}</strong></div>
          <div className="row-between" style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            <span>{t('cart.delivery')}</span>
            <span>{quote ? (quote.delivery_fee > 0 ? t('cart.deliveryUpTo', { fee: money(quote.delivery_fee, quote.currency) }) : t('cart.deliveryFree')) : t('cart.deliveryAgreed')}</span>
          </div>
          <hr />
          <div className="row-between" style={{ fontSize: '1.15rem' }}>
            <strong>{t('cart.total')}</strong><strong style={{ color: 'var(--terra-dark)' }}>{money(subtotal, currency)}</strong>
          </div>
          <button className="btn btn-primary btn-block btn-lg mt-2" onClick={() => nav('/checkout')}>{t('cart.proceed')}</button>
          <p className="center mt-1" style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
            {t('cart.codNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
