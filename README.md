# Vendor store pin: Mapbox

Affected files (copy over the same paths in your project):

- web/src/components/VendorPinMap.tsx  (Mapbox picker, English MapLibre fallback, Google removed)
- web/package.json                     (adds mapbox-gl ^3)
- web/package-lock.json                (lock for mapbox-gl)
- web/.env.example                     (VITE_MAPBOX_TOKEN replaces the Google key line)

Setup:
1. In Mapbox, create a public token (pk.…) and add your site domain(s) under URL restrictions.
2. Set VITE_MAPBOX_TOKEN in the web host's environment (Netlify, or Render if the web is a Static Site).
3. Redeploy. Vite reads the value at build time, so a redeploy is needed after changing it.

If the token is missing or refused, the vendor map falls back to the English MapLibre map, so vendors can still place the pin.

Then run `npm install` in web/ and `npm run build`.
