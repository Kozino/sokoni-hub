import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { captureAttribution } from "../lib/attribution";

// The frontend route is /store/:slug (see App.tsx), which renders StorePage.
// It's a different path from the API's GET /api/vendors/:slug — don't confuse the two.
const storePath = (slug: string) => `/store/${slug}`;

export default function ShortStoreRedirect() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();

  // Idempotent, so safe if React StrictMode renders twice.
  captureAttribution(slug, params.get("ref"));

  return <Navigate to={storePath(slug)} replace />;
}
