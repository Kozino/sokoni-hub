/**
 * Listing cards in the Sokoni Hub 2 style: product tile (market grid), service row, service spotlight
 * and category tile. Every field is read from the API listing; missing fields simply hide their row.
 */
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WEB_URL } from './config';
import { rememberImages, usePromoSet, useStats } from './data';
import { cleanCity, durationLabel, ratingOf } from './format';
import { useFavourites } from './favourites';
import { success, tap } from './haptics';
import { Icon } from './icons';
import { Avatar, Panel, Pill, Price, RatingChip, Thumb, accentAt, softShadow, useColumnWidth } from './kit';
import { categoryImage } from './catImages';
import { useCart, useTheme } from './providers';
import { useToast } from './toast';
import type { Category, Listing } from './types';
import { Text } from './ui';
import { Image } from 'expo-image';

/* ------------------------------------------------------------------------------ helpers */
export const isOutOfStock = (l: Pick<Listing, 'kind' | 'quantity'>) => l.kind === 'product' && l.quantity !== null && l.quantity !== undefined && l.quantity <= 0;
export const needsOption = (l: Pick<Listing, 'options'>) => (l.options?.length ?? 0) > 0;

/** Adds one unit of a product to the cart. Products with sizes must be opened first (the API needs the chosen option). */
export function useQuickAdd() {
  const { add } = useCart();
  const toast = useToast();
  return useCallback((listing: Listing) => {
    if (listing.kind === 'service') return false; // services are booked, not carted
    if (isOutOfStock(listing)) { toast.show('This item is out of stock'); return false; }
    add({
      listing_id: listing.id, vendor_id: listing.vendor_id, vendor_name: listing.business_name || 'Local seller', title: listing.title,
      price: Number(listing.price), currency: listing.currency, image: listing.images?.[0], qty: 1, max: listing.quantity ?? undefined, kind: listing.kind, unit: listing.unit,
    });
    rememberImages([listing]);
    success();
    toast.show('Added to cart', true);
    return true;
  }, [add, toast]);
}

/** Round white heart on top of a photo. */
export function HeartButton({ listing, size = 28 }: { listing: Listing; size?: number }) {
  const { colors } = useTheme();
  const fav = useFavourites();
  const toast = useToast();
  const saved = fav.has(listing.id);
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save for later'} hitSlop={6}
      onPress={() => { tap(); const now = fav.toggle(listing); rememberImages([listing]); toast.show(now ? 'Saved for later' : 'Removed from saved'); }}
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }, softShadow('#000000')]}
    >
      <Icon name="heart" solid={saved} size={Math.round(size * 0.52)} color={saved ? colors.heart : '#1F2937'} />
    </Pressable>
  );
}

const placeOf = (l: Listing) => cleanCity(l.service_area) || cleanCity(l.vendor_city);

/* ---------------------------------------------------------------------------- ProductCard */
/** Dense market tile. Products show a small cart button; services show a calendar button. Every field comes from the API listing. */
export function ProductCard({ listing, onPress, style }: { listing: Listing; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const quickAdd = useQuickAdd();
  const rating = ratingOf(listing);
  const out = isOutOfStock(listing);
  const low = !out && listing.kind === 'product' && listing.quantity !== null && listing.quantity !== undefined && listing.quantity <= 5;
  const options = needsOption(listing);
  const service = listing.kind === 'service';
  const city = cleanCity(listing.vendor_city);
  // In narrow tiles (rails, small phones) the seller name matters more than the city, so the city only shows when it fits.
  const [roomy, setRoomy] = useState(true);
  const tag = out ? { text: 'Out of stock', rose: true } : low ? { text: `Only ${listing.quantity} left`, rose: false } : listing.category_name ? { text: listing.category_name, rose: false } : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={listing.title} onPress={onPress} onLayout={(e) => setRoomy(e.nativeEvent.layout.width >= 172)} style={({ pressed }) => [s.productCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.95 : 1 }, softShadow(colors.shadow, 1), style]}>
      <View style={s.productImage}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon={service ? 'service-bell' : 'basket-outline'} iconSize={26} />
        {rating ? <View style={s.topLeft}><RatingChip avg={rating.avg} count={rating.count} /></View> : null}
        <View style={s.topRight}><HeartButton listing={listing} size={26} /></View>
        {tag ? (
          <View style={[s.tag, tag.rose ? { backgroundColor: colors.dangerSoft, borderColor: colors.danger } : { backgroundColor: 'rgba(255,244,232,0.97)', borderColor: colors.orangeLine }]}>
            <Text numberOfLines={1} style={{ fontSize: 8.5, fontWeight: '700', letterSpacing: 0.3, color: tag.rose ? colors.dangerText : '#9A4A00' }}>{tag.text.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.productBody}>
        <Text numberOfLines={1} style={[s.productTitle, { color: colors.text }]}>{listing.title}</Text>
        <View style={s.vendorRow}>
          <Icon name="storefront" solid={false} size={11} color={colors.orange} />
          <Text numberOfLines={1} style={[s.vendorName, { color: colors.brown }]}>{listing.business_name || 'Verified seller'}</Text>
          {city && roomy ? <Text numberOfLines={1} style={[s.vendorCity, { color: colors.muted }]}>• {city}</Text> : null}
        </View>
        <View style={s.productFoot}>
          <Price value={listing.price} currency={listing.currency} size={18} from={options || listing.price_type === 'from'} />
          <Pressable
            accessibilityRole="button" accessibilityLabel={out ? 'Out of stock' : service ? `Book ${listing.title}` : options ? `Choose a size for ${listing.title}` : `Add ${listing.title} to cart`} disabled={out} hitSlop={6}
            onPress={() => { if (options || service) onPress(); else quickAdd(listing); }}
            style={({ pressed }) => [s.addButton, { backgroundColor: out ? colors.border : service ? colors.orange : colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={service ? 'calendar' : 'cart'} solid={false} size={17} color={out ? colors.muted : service ? colors.onOrange : colors.onPrimary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** Compact list-view version of the product tile. */
export function ProductRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const { colors } = useTheme();
  const quickAdd = useQuickAdd();
  const rating = ratingOf(listing);
  const out = isOutOfStock(listing);
  const options = needsOption(listing);
  const service = listing.kind === 'service';
  const city = cleanCity(listing.vendor_city);
  return (
    <Panel onPress={onPress} label={listing.title} style={s.serviceRow}>
      <View style={[s.serviceImage, { minHeight: 84, width: 80 }]}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon={service ? 'service-bell' : 'basket-outline'} iconSize={24} />
        {rating ? <View style={s.bottomLeft}><RatingChip avg={rating.avg} /></View> : null}
      </View>
      <View style={s.serviceBody}>
        <View style={s.vendorRow}>
          <Icon name="storefront" solid={false} size={11} color={colors.orange} />
          <Text numberOfLines={1} style={[s.vendorName, { color: colors.brown }]}>{listing.business_name || 'Verified seller'}</Text>
          {city ? <Text numberOfLines={1} style={[s.vendorCity, { color: colors.muted }]}>• {city}</Text> : null}
        </View>
        <Text numberOfLines={2} style={[s.serviceTitle, { color: colors.text }]}>{listing.title}</Text>
        {out ? <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.dangerText }}>Out of stock</Text> : null}
        <View style={s.serviceFoot}>
          <Price value={listing.price} currency={listing.currency} size={18} from={options || listing.price_type === 'from'} />
          <Pressable accessibilityRole="button" accessibilityLabel={service ? `Book ${listing.title}` : options ? `Choose a size for ${listing.title}` : `Add ${listing.title} to cart`} disabled={out} hitSlop={6} onPress={() => { if (options || service) onPress(); else quickAdd(listing); }} style={({ pressed }) => [s.addButton, { backgroundColor: out ? colors.border : service ? colors.orange : colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Icon name={service ? 'calendar' : 'cart'} solid={false} size={17} color={out ? colors.muted : service ? colors.onOrange : colors.onPrimary} />
          </Pressable>
        </View>
      </View>
    </Panel>
  );
}

/* ----------------------------------------------------------------------------- ServiceRow */
export function ServiceRow({ listing, onPress, onBook }: { listing: Listing; onPress: () => void; onBook?: () => void }) {
  const { colors } = useTheme();
  const promo = usePromoSet();
  const rating = ratingOf(listing);
  const place = placeOf(listing);
  const duration = durationLabel(listing.duration_mins);
  const vip = promo.vip.has(listing.vendor_id);
  const narrow = useColumnWidth() < 380;
  return (
    <Panel onPress={onPress} label={listing.title} style={s.serviceRow}>
      <View style={s.serviceImage}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon="service-bell" iconSize={26} />
        {rating ? <View style={s.bottomLeft}><RatingChip avg={rating.avg} /></View> : null}
      </View>
      <View style={s.serviceBody}>
        <View style={s.vendorRow}>
          <Text numberOfLines={1} style={[s.serviceVendor, { color: colors.brown }]}>{listing.business_name || 'Verified provider'}</Text>
          <Icon name="check-badge" size={12} color={colors.success} />
          {vip ? <Pill tone="orange" small icon="diamond">VIP</Pill> : null}
        </View>
        <Text numberOfLines={2} style={[s.serviceTitle, { color: colors.text }]}>{listing.title}</Text>
        {place || duration ? (
          <View style={s.vendorRow}>
            {place ? <><Icon name="location" solid={false} size={11} color={colors.text2} /><Text numberOfLines={1} style={[s.serviceMeta, { color: colors.text2, flexShrink: 1 }]}>{place}</Text></> : null}
            {place && duration ? <Text style={{ color: colors.muted, fontSize: 10 }}>•</Text> : null}
            {duration ? <Text numberOfLines={1} style={[s.serviceMeta, { color: colors.primary, fontWeight: '700' }]}>{duration}</Text> : null}
          </View>
        ) : null}
        <View style={s.serviceFoot}>
          <Price value={listing.price} currency={listing.currency} size={18} from={listing.price_type === 'from'} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Book ${listing.title}`} onPress={() => { tap(); (onBook ?? onPress)(); }} style={({ pressed }) => [s.bookButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}>
            <Text style={[s.bookText, { color: colors.onPrimary }]}>{narrow ? 'Book' : 'Book now'}</Text>
            <Icon name="arrow-forward" size={12} color={colors.onPrimary} />
          </Pressable>
        </View>
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------------ ServiceSpotlight */
export function ServiceSpotlight({ listing, onPress, onBook }: { listing: Listing; onPress: () => void; onBook: () => void }) {
  const { colors } = useTheme();
  const promo = usePromoSet();
  const rating = ratingOf(listing);
  const place = placeOf(listing);
  const duration = durationLabel(listing.duration_mins);
  const vip = promo.vip.has(listing.vendor_id);
  return (
    <Panel onPress={onPress} label={listing.title} style={s.spotlight}>
      <View style={s.spotImage}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon="service-bell" iconSize={34} />
        <View style={s.spotPills}>
          {vip ? <Pill tone="orange" icon="diamond" upper small style={s.onPhoto}>VIP seller</Pill> : null}
          {place ? <Pill tone="mint" icon="location" small style={s.onPhoto}>Serves {place}</Pill> : null}
        </View>
        {rating ? <View style={s.spotRating}><RatingChip avg={rating.avg} count={rating.count} /></View> : null}
      </View>
      <View style={s.spotBody}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.spotTitle, { color: colors.text }]}>{listing.title}</Text>
            <View style={[s.vendorRow, { marginTop: 2 }]}>
              <Text numberOfLines={1} style={[s.spotVendor, { color: colors.primary }]}>{listing.business_name || 'Verified provider'}</Text>
              {cleanCity(listing.vendor_city) ? <><Icon name="location" solid={false} size={11} color={colors.text2} /><Text numberOfLines={1} style={[s.serviceMeta, { color: colors.text2 }]}>{cleanCity(listing.vendor_city)}</Text></> : null}
            </View>
          </View>
          <HeartRound listing={listing} />
        </View>
        <View style={s.spotFoot}>
          <View>
            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.text2 }}>{listing.price_type === 'from' ? 'Starting from' : 'Price'}</Text>
            <Price value={listing.price} currency={listing.currency} size={22} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {duration ? <Pill tone="lav" small icon="time">{duration}</Pill> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Book ${listing.title}`} onPress={() => { tap(); onBook(); }} style={({ pressed }) => [s.spotCta, { backgroundColor: colors.orange, opacity: pressed ? 0.9 : 1 }]}>
              <Icon name="calendar" solid={false} size={15} color={colors.onOrange} />
              <Text style={[s.spotCtaText, { color: colors.onOrange }]}>Book</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Panel>
  );
}

function HeartRound({ listing }: { listing: Listing }) {
  const { colors } = useTheme();
  const fav = useFavourites();
  const toast = useToast();
  const saved = fav.has(listing.id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save for later'} hitSlop={6} onPress={() => { tap(); const now = fav.toggle(listing); rememberImages([listing]); toast.show(now ? 'Saved for later' : 'Removed from saved'); }} style={[s.heartRound, { backgroundColor: saved ? colors.roseSoft : colors.lav2 }]}>
      <Icon name="heart" solid={saved} size={17} color={saved ? colors.heart : colors.text} />
    </Pressable>
  );
}

/* ---------------------------------------------------------------------------- CategoryTile */
/** Small round category icon with a coloured ring and a two-line label. Meant for a horizontally scrolling row. */
export function CategoryTile({ category, onPress, index = 0 }: { category: Pick<Category, 'name' | 'slug'>; onPress: () => void; index?: number }) {
  const { colors } = useTheme();
  const accent = accentAt(colors, index);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={category.name} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.catTile, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[s.catRing, { backgroundColor: accent.bg, borderColor: accent.fg }]}>
        <Image source={categoryImage(category.slug)} contentFit="cover" style={s.catImage} transition={150} />
      </View>
      <Text numberOfLines={2} style={[s.catLabel, { color: colors.text }]}>{category.name}</Text>
    </Pressable>
  );
}

/** "Sell on Sokoni Hub" call to action. The seller count comes from the live platform stats. */
export function SellCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const stats = useStats();
  const vendors = stats.data?.vendors ?? 0;
  return (
    <LinearGradient colors={[colors.orangeSoft, colors.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.sellCard, { borderColor: colors.orangeLine }, style]}>
      <View style={[s.sellIcon, { backgroundColor: colors.orange }]}><Icon name="storefront" solid={false} size={20} color={colors.onOrange} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.sellTitle, { color: colors.text }]}>Sell on Sokoni Hub</Text>
        <Text style={[s.sellText, { color: colors.brown }]}>{vendors > 0 ? `Join ${vendors} verified seller${vendors === 1 ? '' : 's'} reaching buyers across Qatar.` : 'Open your store and reach buyers across Qatar.'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Apply to sell on Sokoni Hub" onPress={() => { tap(); void WebBrowser.openBrowserAsync(`${WEB_URL}/sell`).catch(() => {}); }} style={({ pressed }) => [s.sellButton, { backgroundColor: colors.orange, opacity: pressed ? 0.88 : 1 }]}>
        <Text style={{ color: colors.onOrange, fontSize: 12, fontWeight: '700' }}>Apply</Text>
      </Pressable>
    </LinearGradient>
  );
}

/** Seller logo + name line used on small cards. */
export function VendorChip({ name, logo }: { name: string; logo?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Avatar name={name} uri={logo} size={22} square tone="mint" />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  productCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  productImage: { width: '100%', aspectRatio: 1.3 },
  topLeft: { position: 'absolute', top: 6, left: 6 },
  topRight: { position: 'absolute', top: 6, right: 6 },
  bottomLeft: { position: 'absolute', bottom: 5, left: 5 },
  tag: { position: 'absolute', left: 6, bottom: 6, maxWidth: '86%', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, height: 17, justifyContent: 'center' },
  productBody: { paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8, gap: 3 },
  productTitle: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vendorName: { fontSize: 10.5, fontWeight: '600', flexShrink: 1 },
  vendorCity: { fontSize: 10, fontWeight: '500', flexShrink: 3 },
  productFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  addButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', gap: 10, padding: 8 },
  serviceImage: { width: 84, alignSelf: 'stretch', minHeight: 92, borderRadius: 11, overflow: 'hidden' },
  serviceBody: { flex: 1, gap: 3, justifyContent: 'space-between' },
  serviceVendor: { fontSize: 10.5, fontWeight: '700', flexShrink: 1 },
  serviceTitle: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, lineHeight: 17 },
  serviceMeta: { fontSize: 10.5, fontWeight: '500' },
  serviceFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  bookButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, borderRadius: 9, paddingHorizontal: 11 },
  bookText: { fontSize: 11.5, fontWeight: '700' },
  spotlight: { padding: 0, overflow: 'hidden', borderRadius: 16 },
  spotImage: { height: 118, width: '100%' },
  spotPills: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  onPhoto: { height: 19, borderRadius: 10 },
  spotRating: { position: 'absolute', right: 8, bottom: 8 },
  spotBody: { padding: 10, gap: 8 },
  spotTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  spotVendor: { fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  heartRound: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  spotFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  spotCta: { minWidth: 92, height: 36, borderRadius: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  spotCtaText: { fontSize: 12.5, fontWeight: '700' },
  sellCard: { marginHorizontal: 12, marginTop: 16, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sellIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sellTitle: { fontSize: 13, fontWeight: '700' },
  sellText: { fontSize: 11, lineHeight: 15, marginTop: 1, fontWeight: '500' },
  sellButton: { height: 32, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  catTile: { width: 68, alignItems: 'center', gap: 5 },
  catRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, padding: 2, alignItems: 'center', justifyContent: 'center' },
  catImage: { width: 47, height: 47, borderRadius: 24 },
  catLabel: { fontSize: 10.5, fontWeight: '600', textAlign: 'center', lineHeight: 13, minHeight: 26 },
});
