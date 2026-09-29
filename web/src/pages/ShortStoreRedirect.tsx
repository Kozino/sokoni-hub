import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { captureAttribution } from "../lib/attribution";

// The public API is GET /api/vendors/:slug, so this assumes the frontend
// route is /vendors/:slug. Confirm against your router and adjust if not.
const storePath = (slug: string) => `/vendors/${slug}`;

export default function ShortStoreRedirect() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();

  // Idempotent, so safe if React StrictMode renders twice.
  captureAttribution(slug, params.get("ref"));

  return <Navigate to={storePath(slug)} replace />;
}
