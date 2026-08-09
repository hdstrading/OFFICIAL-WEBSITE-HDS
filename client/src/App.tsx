import { lazy, Suspense, useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';
import MessengerWidget from './components/MessengerWidget';
import { CartProvider } from './lib/cart';
import { CatalogProvider, useCatalog } from './lib/catalog';
import { Spinner } from './components/ui';
import { ADMIN_PATH } from './config/admin';

import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ServicesPage from './pages/ServicesPage';
import ServiceDetailPage from './pages/ServiceDetailPage';
import BookPage from './pages/BookPage';
import CheckoutPage from './pages/CheckoutPage';
import QuotePage from './pages/QuotePage';
import OrderStatusPage from './pages/OrderStatusPage';
import BookingStatusPage from './pages/BookingStatusPage';
import QuoteStatusPage from './pages/QuoteStatusPage';
import TrackPage from './pages/TrackPage';
import ReviewsPage from './pages/ReviewsPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * The admin panel is a separate bundle so its code is never downloaded by a
 * normal visitor — the panel does not even exist in the JavaScript a customer
 * receives until they hit the secret path.
 */
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));

/** Restores scroll to the top on navigation, which a SPA does not do by default. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

/** The public site chrome: header, footer, cart and chat widget. */
function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Lets keyboard users jump past the navigation on every page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-cyan-700 focus:text-white focus:font-semibold"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <MessengerWidget />
    </div>
  );
}

/** Provides the cart, which needs the catalog to resolve saved lines to products. */
function WithCart() {
  const { products } = useCatalog();
  return (
    <CartProvider products={products}>
      <Outlet />
    </CartProvider>
  );
}

export default function App() {
  return (
    <CatalogProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<WithCart />}>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/:id" element={<ProductDetailPage />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="services/:id" element={<ServiceDetailPage />} />
            <Route path="book" element={<BookPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="quote" element={<QuotePage />} />
            <Route path="order/:reference" element={<OrderStatusPage />} />
            <Route path="booking/:reference" element={<BookingStatusPage />} />
            <Route path="quote/:reference" element={<QuoteStatusPage />} />
            <Route path="track" element={<TrackPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Unlisted staff route — no link to it anywhere on the site. */}
          <Route
            path={ADMIN_PATH}
            element={
              <Suspense fallback={<Spinner label="Loading staff portal…" />}>
                <AdminPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </CatalogProvider>
  );
}
