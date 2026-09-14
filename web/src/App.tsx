import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './state/AuthContext';
import { CartProvider } from './state/CartContext';
import { ToastProvider } from './state/ToastContext';
import { ThemeProvider } from './state/ThemeContext';
import Layout, { BareLayout } from './components/Layout';
import { RequireAuth, RequireVendor } from './components/Guards';

import Home from './pages/Home';
import Browse from './pages/Browse';
import ListingDetail from './pages/ListingDetail';
import Vendors from './pages/Vendors';
import StorePage from './pages/StorePage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import { Login, Register } from './pages/Auth';
import { Sell, Policy, Support, TrackOrder, Account, NotFound } from './pages/Static';

import VendorLayout from './pages/vendor/VendorLayout';
import VendorOnboard from './pages/vendor/VendorOnboard';
import VendorOverview from './pages/vendor/VendorOverview';
import VendorListings from './pages/vendor/VendorListings';
import ListingForm from './pages/vendor/ListingForm';
import VendorOrders from './pages/vendor/VendorOrders';
import VendorComplaints from './pages/vendor/VendorComplaints';
import VendorProfile from './pages/vendor/VendorProfile';

import AdminLayout from './pages/admin/AdminLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminVendors from './pages/admin/AdminVendors';
import { AdminListings, AdminComplaints, AdminOrders, AdminUsers, AdminCategories, AdminAudit } from './pages/admin/AdminMisc';

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <ScrollTop />
            <Routes>
              {/* public — hero landing uses a padding-free shell */}
              <Route element={<BareLayout />}>
                <Route path="/" element={<Home />} />
              </Route>

              <Route element={<Layout />}>
                <Route path="/browse" element={<Browse />} />
                <Route path="/listing/:id" element={<ListingDetail />} />
                <Route path="/vendors" element={<Vendors />} />
                <Route path="/store/:slug" element={<StorePage />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/sell" element={<Sell />} />
                <Route path="/policy" element={<Policy />} />
                <Route path="/support" element={<Support />} />
                <Route path="/track" element={<TrackOrder />} />
                <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
                <Route path="/vendor/onboard" element={<RequireAuth><VendorOnboard /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* vendor dashboard */}
              <Route path="/vendor" element={<RequireVendor><VendorLayout /></RequireVendor>}>
                <Route index element={<VendorOverview />} />
                <Route path="listings" element={<VendorListings />} />
                <Route path="listings/new" element={<ListingForm />} />
                <Route path="listings/:id/edit" element={<ListingForm />} />
                <Route path="orders" element={<VendorOrders />} />
                <Route path="complaints" element={<VendorComplaints />} />
                <Route path="profile" element={<VendorProfile />} />
                <Route path="*" element={<Navigate to="/vendor" replace />} />
              </Route>

              {/* admin dashboard */}
              <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminLayout /></RequireAuth>}>
                <Route index element={<AdminOverview />} />
                <Route path="vendors" element={<AdminVendors />} />
                <Route path="listings" element={<AdminListings />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="complaints" element={<AdminComplaints />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
