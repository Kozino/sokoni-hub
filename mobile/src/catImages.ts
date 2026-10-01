import type { ImageSourcePropType } from 'react-native';

/** The same category photos the website uses (web/public/img/cat), bundled for the app. */
const IMAGES: Record<string, ImageSourcePropType> = {
  'grains-cereals': require('../assets/cat/grains-cereals.webp'),
  'tubers-flour': require('../assets/cat/tubers-flour.webp'),
  'oils-condiments': require('../assets/cat/oils-condiments.webp'),
  'spices-seasoning': require('../assets/cat/spices-seasoning.webp'),
  'frozen-protein': require('../assets/cat/frozen-protein.webp'),
  'fruits-vegetables': require('../assets/cat/fruits-vegetables.webp'),
  'snacks-drinks': require('../assets/cat/snacks-drinks.webp'),
  'hair-styling': require('../assets/cat/hair-styling.webp'),
  nails: require('../assets/cat/nails.webp'),
  makeup: require('../assets/cat/makeup.webp'),
  photography: require('../assets/cat/photography.webp'),
  'video-editing': require('../assets/cat/video-editing.webp'),
  'graphics-design': require('../assets/cat/graphics-design.webp'),
  tailoring: require('../assets/cat/tailoring.webp'),
  catering: require('../assets/cat/catering.webp'),
  events: require('../assets/cat/events.webp'),
  cleaning: require('../assets/cat/cleaning.webp'),
};
const FALLBACK: ImageSourcePropType = require('../assets/cat/_default.webp');
export const categoryImage = (slug?: string): ImageSourcePropType => (slug && IMAGES[slug]) || FALLBACK;
