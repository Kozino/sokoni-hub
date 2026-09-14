import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { money } from '../lib/format';
import { Empty } from '../components/ui';

export default function Cart() {
  const { items, byVendor, subtotal, currency, setQty, remove, clear } = useCart();
  const nav = useNavigate();

  if (items.length === 0)
    return (
      <div className="container container-narrow">
        <Empty icon="🛒" title="Your cart is empty" text="Browse food stuff and services from verified stores." action={<Link to="/browse" className="btn btn-primary">Start shopping</Link>} />
      </div>
    );

  return (
    <div className="container">
      <div className="row-between mb-3">
        <h1 style={{ margin: 0 }}>Your cart</h1>
        <button className="btn btn-ghost btn-sm" onClick={clear}>Clear cart</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        <div className="col">
          {byVendor.map((g) => (
            <div key={g.vendor_id} className="card">
              <div className="card-head">
                <h4>🏪 {g.vendor_name}</h4>
                <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{money(g.subtotal, currency)}</span>
              </div>
              <div className="card-body col">
                {g.items.map((i) => (
                  <div key={i.listing_id} className="row" style={{ alignItems: 'flex-start' }}>
                    {i.image ? <img className="thumb" src={i.image} alt="" /> : <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{i.kind === 'service' ? '💇' : '🛍️'}</div>}
                    <div className="grow">
                      <Link to={`/listing/${i.listing_id}`} style={{ fontWeight: 700, color: 'var(--ink)' }}>{i.title}</Link>
                      <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                        {money(i.price, i.currency)}{i.unit ? ` / ${i.unit}` : ''}
                      </div>
                    </div>
                    <input type="number" min={1} max={i.max ?? 999} value={i.qty}
                      onChange={(e) => setQty(i.listing_id, Number(e.target.value))} style={{ width: 76 }} />
                    <strong style={{ minWidth: 84, textAlign: 'right' }}>{money(i.price * i.qty, i.currency)}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(i.listing_id)}>✕</button>
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

        <div className="card card-pad" style={{ position: 'sticky', top: 86 }}>
          <h3>Summary</h3>
          <div className="row-between"><span>Items</span><strong>{items.reduce((s, i) => s + i.qty, 0)}</strong></div>
          <div className="row-between"><span>Subtotal</span><strong>{money(subtotal, currency)}</strong></div>
          <div className="row-between" style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            <span>Delivery</span><span>Agreed with vendor</span>
          </div>
          <hr />
          <div className="row-between" style={{ fontSize: '1.15rem' }}>
            <strong>Total</strong><strong style={{ color: 'var(--terra-dark)' }}>{money(subtotal, currency)}</strong>
          </div>
          <button className="btn btn-primary btn-block btn-lg mt-2" onClick={() => nav('/checkout')}>Proceed to checkout</button>
          <p className="center mt-1" style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0 }}>
            Cash on delivery · No account required
          </p>
        </div>
      </div>
    </div>
  );
}
