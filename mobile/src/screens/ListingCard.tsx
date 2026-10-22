import type { StyleProp, ViewStyle } from 'react-native';
import { ProductCard } from '../cards';
import type { Listing } from '../types';

/**
 * Kept so older call sites keep working: every listing card in the app is now the shared product tile.
 * `compact` is a fixed-width tile for horizontal rails, `fluid` fills half of a two-column grid.
 */
export function ListingCard({ listing, onPress, compact = false, fluid = false }: { listing: Listing; onPress: () => void; compact?: boolean; fluid?: boolean }) {
  const style: StyleProp<ViewStyle> = fluid ? { width: '48.5%' } : compact ? { width: 178 } : undefined;
  return <ProductCard listing={listing} onPress={onPress} style={style} />;
}
