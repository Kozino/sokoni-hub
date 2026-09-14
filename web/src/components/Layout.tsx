import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { useCart } from '../state/CartContext';

export function Header() {
  const { user, vendor, logout } = useAuth();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const close = () => setOpen(false);

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" onClick={close}>
          <img src="/logo.png" alt="Sokoni Hub" />
          <span>Sokoni Hub<small>Sell beyond status</small></span>
        </Link>
        <button className="burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
        <nav className={`nav${open ? ' open' : ''}`}>
          <NavLink to="/browse" onClick={close}>Browse</NavLink>
          <NavLink to="/browse?kind=service" onClick={close}>Services</NavLink>
          <NavLink to="/vendors" onClick={close}>Stores</NavLink>
          <NavLink to="/support" onClick={close}>Support</NavLink>
          <Link to="/cart" className="cart-btn" onClick={close} aria-label="Cart">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {count > 0 && <span className="cart-badge">{count}</span>}
          </Link>
          {!user && (
            <>
              <NavLink to="/login" onClick={close}>Login</NavLink>
              <Link to="/sell" className="btn btn-primary btn-sm" onClick={close}>Start selling</Link>
            </>
          )}
          {user && (
            <>
              {user.role === 'admin' && <NavLink to="/admin" onClick={close}>Admin</NavLink>}
              {user.role === 'vendor' && vendor && <NavLink to="/vendor" onClick={close}>My store</NavLink>}
              {user.role === 'vendor' && !vendor && <NavLink to="/vendor/onboard" onClick={close}>Finish setup</NavLink>}
              {user.role === 'buyer' && <NavLink to="/account" onClick={close}>Account</NavLink>}
              <button className="linkish" onClick={() => { logout(); close(); nav('/'); }}>Logout</button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>Sokoni Hub</h4>
            <p style={{ maxWidth: 320 }}>
              A proper storefront for African food-stuff traders and service providers — so your
              business is searchable, not buried in a 24-hour WhatsApp status.
            </p>
          </div>
          <div>
            <h4>Buy</h4>
            <Link to="/browse?kind=product">Food stuff</Link>
            <Link to="/browse?kind=service">Services</Link>
            <Link to="/vendors">Verified stores</Link>
            <Link to="/track">Track an order</Link>
          </div>
          <div>
            <h4>Sell</h4>
            <Link to="/sell">Become a vendor</Link>
            <Link to="/register?role=vendor">Create account</Link>
            <Link to="/login">Vendor login</Link>
          </div>
          <div>
            <h4>Help</h4>
            <Link to="/support">File a complaint</Link>
            <Link to="/support#track">Track complaint</Link>
            <Link to="/policy">Prohibited items</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Sokoni Hub. All rights reserved.</span>
          <span>Pay on delivery. Checkout on WhatsApp. Every store is checked before it goes live.</span>
        </div>
      </div>
    </footer>
  );
}

export default function Layout() {
  return (
    <div className="app">
      <Header />
      <main className="page"><Outlet /></main>
      <Footer />
    </div>
  );
}

/** Layout without the page padding (for the hero landing page). */
export function BareLayout() {
  return (
    <div className="app">
      <Header />
      <main style={{ flex: 1 }}><Outlet /></main>
      <Footer />
    </div>
  );
}
