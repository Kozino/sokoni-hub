import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { money } from '../lib/format';
import { Empty, QtyInput } from '../components/ui';
import { useT } from '../i18n';

export default function Cart() {
  const t = useT();
  const { items, byVendor, subtotal, currency, setQty, remove, clear } = useCart();
  const nav = useNavigate();

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
                  <div key={i.listing_id} className="cart-line">
                    {i.image ? <img className="thumb" src={i.image} alt="" /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{i.kind === 'service' ? '💇' : '🛍️'}</div>}
                    <div className="cart-line-info">
                      <Link to={`/listing/${i.listing_id}`} className="cart-line-title">{i.title}</Link>
                      <div className="cart-line-price">
                        {money(i.price, i.currency)}{i.unit ? ` / ${i.unit}` : ''}
                      </div>
                    </div>
                    <div className="cart-line-controls">
                      <QtyInput value={i.qty} min={1} max={i.max ?? 999} onChange={(n) => setQty(i.listing_id, n)} />
                      <strong className="cart-line-total">{money(i.price * i.qty, i.currency)}</strong>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(i.listing_id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {byVendor.length > 1 && (
            <div className="alert alert-info">
              Your cart has items from {byVendor.length} stores — we'll create a separate order for each
              so every vendor gets their own delivery instruction.
            </div>
          )}
        </div>

        <div className="card card-pad cart-summary">
          <h3>{t('cart.summary')}</h3>
          <div className="row-between"><span>{t('cart.itemsLabel')}</span><strong>{items.reduce((s, i) => s + i.qty, 0)}</strong></div>
          <div className="row-between"><span>{t('cart.subtotal')}</span><strong>{money(subtotal, currency)}</strong></div>
          <div className="row-between" style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            <span>{t('cart.delivery')}</span><span>{t('cart.deliveryAgreed')}</span>
          </div>
          <hr />
          <div className="row-between" style={{ fontSize: '1.15rem' }}>
            <strong>{t('cart.total')}</strong><strong style={{ color: 'var(--terra-dark)' }}>{money(subtotal, currency)}</strong>
          </div>
          <button className="btn btn-primary btn-block btn-lg mt-2" onClick={() => nav('/checkout')}>{t('cart.proceed')}</button>
          <p className="center mt-1" style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
            Cash on delivery · No account required
          </p>
        </div>
      </div>
    </div>
  );
}
