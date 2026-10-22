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
import { Avatar, Panel, Pill, Price, RatingChip, Thumb, softShadow, useColumnWidth } from './kit';
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
export function HeartButton({ listing, size = 34 }: { listing: Listing; size?: number }) {
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
    <Pressable accessibilityRole="button" accessibilityLabel={listing.title} onPress={onPress} onLayout={(e) => setRoomy(e.nativeEvent.layout.width >= 200)} style={({ pressed }) => [s.productCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.95 : 1 }, softShadow(colors.shadow), style]}>
      <View style={s.productImage}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon={listing.kind === 'service' ? 'scissors' : 'basket-outline'} iconSize={34} />
        {rating ? <View style={s.topLeft}><RatingChip avg={rating.avg} count={rating.count} /></View> : null}
        <View style={s.topRight}><HeartButton listing={listing} size={32} /></View>
        {tag ? (
          <View style={[s.tag, tag.rose ? { backgroundColor: colors.dangerSoft, borderColor: colors.danger } : { backgroundColor: 'rgba(255,244,232,0.97)', borderColor: colors.orangeLine }]}>
            <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, color: tag.rose ? colors.dangerText : '#9A4A00' }}>{tag.text.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.productBody}>
        <Text numberOfLines={1} style={[s.productTitle, { color: colors.text }]}>{listing.title}</Text>
        <View style={s.vendorRow}>
          <Icon name="storefront" solid={false} size={14} color={colors.orange} />
          <Text numberOfLines={1} style={[s.vendorName, { color: colors.brown }]}>{listing.business_name || 'Verified seller'}</Text>
          {city && roomy ? <Text numberOfLines={1} style={[s.vendorCity, { color: colors.muted }]}>• {city}</Text> : null}
        </View>
        <View style={s.productFoot}>
          <Price value={listing.price} currency={listing.currency} size={20} from={options || listing.price_type === 'from'} />
          <Pressable
            accessibilityRole="button" accessibilityLabel={out ? 'Out of stock' : service ? `Book ${listing.title}` : options ? `Choose a size for ${listing.title}` : `Add ${listing.title} to cart`} disabled={out} hitSlop={6}
            onPress={() => { if (options || service) onPress(); else quickAdd(listing); }}
            style={({ pressed }) => [s.addButton, { backgroundColor: out ? colors.border : colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={service ? 'calendar' : 'add'} solid={false} size={service ? 19 : 21} color={out ? colors.muted : colors.onPrimary} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/* ----------------------------------------------------------------------------- ProductRow */
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
      <View style={[s.serviceImage, { minHeight: 104, width: 96 }]}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon={service ? 'scissors' : 'basket-outline'} iconSize={28} />
        {rating ? <View style={s.bottomLeft}><RatingChip avg={rating.avg} /></View> : null}
      </View>
      <View style={s.serviceBody}>
        <View style={s.vendorRow}>
          <Icon name="storefront" solid={false} size={14} color={colors.orange} />
          <Text numberOfLines={1} style={[s.vendorName, { color: colors.brown }]}>{listing.business_name || 'Verified seller'}</Text>
          {city ? <Text numberOfLines={1} style={[s.vendorCity, { color: colors.muted }]}>• {city}</Text> : null}
        </View>
        <Text numberOfLines={2} style={[s.serviceTitle, { color: colors.text }]}>{listing.title}</Text>
        {out ? <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.dangerText }}>Out of stock</Text> : null}
        <View style={s.serviceFoot}>
          <Price value={listing.price} currency={listing.currency} size={19} from={options || listing.price_type === 'from'} />
          <Pressable accessibilityRole="button" accessibilityLabel={service ? `Book ${listing.title}` : options ? `Choose a size for ${listing.title}` : `Add ${listing.title} to cart`} disabled={out} hitSlop={6} onPress={() => { if (options || service) onPress(); else quickAdd(listing); }} style={({ pressed }) => [s.addButton, { backgroundColor: out ? colors.border : colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Icon name={service ? 'calendar' : 'add'} solid={false} size={service ? 19 : 21} color={out ? colors.muted : colors.onPrimary} />
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
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon="scissors" iconSize={30} />
        {rating ? <View style={s.bottomLeft}><RatingChip avg={rating.avg} /></View> : null}
      </View>
      <View style={s.serviceBody}>
        <View style={s.vendorRow}>
          <Text numberOfLines={1} style={[s.serviceVendor, { color: colors.brown }]}>{listing.business_name || 'Verified provider'}</Text>
          <Icon name="check-badge" size={15} color={colors.success} />
          {vip ? <Pill tone="orange" small icon="diamond">VIP</Pill> : null}
        </View>
        <Text numberOfLines={2} style={[s.serviceTitle, { color: colors.text }]}>{listing.title}</Text>
        {place || duration ? (
          <View style={s.vendorRow}>
            {place ? <><Icon name="location" solid={false} size={14} color={colors.text2} /><Text numberOfLines={1} style={[s.serviceMeta, { color: colors.text2, flexShrink: 1 }]}>{place}</Text></> : null}
            {place && duration ? <Text style={{ color: colors.muted }}>•</Text> : null}
            {duration ? <Text numberOfLines={1} style={[s.serviceMeta, { color: colors.primary, fontWeight: '800' }]}>{duration}</Text> : null}
          </View>
        ) : null}
        <View style={s.serviceFoot}>
          <Price value={listing.price} currency={listing.currency} size={20} from={listing.price_type === 'from'} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Book ${listing.title}`} onPress={() => { tap(); (onBook ?? onPress)(); }} style={({ pressed }) => [s.bookButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}>
            <Text style={[s.bookText, { color: colors.onPrimary }]}>{narrow ? 'Book' : 'Book Now'}</Text>
            <Icon name="arrow-forward" size={15} color={colors.onPrimary} />
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
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon="scissors" iconSize={44} />
        <View style={s.spotPills}>
          {vip ? <Pill tone="orange" icon="diamond" upper small style={s.onPhoto}>VIP seller</Pill> : null}
          {place ? <Pill tone="mint" icon="location" small style={s.onPhoto}>Serves {place}</Pill> : null}
        </View>
        {rating ? <View style={s.spotRating}><RatingChip avg={rating.avg} count={rating.count} /></View> : null}
      </View>
      <View style={s.spotBody}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Text numberOfLines={2} style={[s.spotTitle, { color: colors.text }]}>{listing.title}</Text>
          <HeartRound listing={listing} />
        </View>
        <View style={[s.vendorRow, { marginTop: 4 }]}>
          <Text numberOfLines={1} style={[s.spotVendor, { color: colors.primary }]}>{listing.business_name || 'Verified provider'}</Text>
          {cleanCity(listing.vendor_city) ? <><Icon name="location" solid={false} size={14} color={colors.text2} /><Text numberOfLines={1} style={[s.serviceMeta, { color: colors.text2 }]}>{cleanCity(listing.vendor_city)}</Text></> : null}
        </View>
        <View style={[s.spotInfo, { backgroundColor: colors.surface2 }]}>
          {duration ? <View style={s.infoItem}><Icon name="time" solid={false} size={16} color={colors.text2} /><Text style={[s.infoText, { color: colors.text }]}>{duration}</Text></View> : null}
          <View style={s.infoItem}><Icon name="check-badge" solid={false} size={17} color={colors.orange} /><Text style={[s.infoText, { color: colors.text }]}>Verified provider</Text></View>
        </View>
        <View style={s.spotFoot}>
          <View>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text2 }}>{listing.price_type === 'from' ? 'Starting from' : 'Price'}</Text>
            <Price value={listing.price} currency={listing.currency} size={27} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Book ${listing.title}`} onPress={() => { tap(); onBook(); }} style={({ pressed }) => [s.spotCta, { backgroundColor: colors.orange, opacity: pressed ? 0.9 : 1 }]}>
            <Icon name="calendar" solid={false} size={19} color={colors.onOrange} />
            <Text style={[s.spotCtaText, { color: colors.onOrange }]}>Book Appointment</Text>
          </Pressable>
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
    <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save for later'} hitSlop={6} onPress={() => { tap(); const now = fav.toggle(listing); rememberImages([listing]); toast.show(now ? 'Saved for later' : 'Removed from saved'); }} style={[s.heartRound, { backgroundColor: colors.lav2 }]}>
      <Icon name="heart" solid={saved} size={22} color={saved ? colors.heart : colors.text} />
    </Pressable>
  );
}

/* ---------------------------------------------------------------------------- CategoryTile */
export function CategoryTile({ category, onPress }: { category: Pick<Category, 'name' | 'slug'>; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={category.name} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.catTile, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.92 : 1 }, softShadow(colors.shadow)]}>
      <Image source={categoryImage(category.slug)} contentFit="cover" style={s.catImage} transition={150} />
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
      <View style={[s.sellIcon, { backgroundColor: colors.orange }]}><Icon name="storefront" solid={false} size={26} color={colors.onOrange} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.sellTitle, { color: colors.text }]}>Sell on Sokoni Hub</Text>
        <Text style={[s.sellText, { color: colors.brown }]}>{vendors > 0 ? `Join ${vendors} verified seller${vendors === 1 ? '' : 's'} reaching buyers across Qatar.` : 'Open your store and reach buyers across Qatar.'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Apply to sell on Sokoni Hub" onPress={() => { tap(); void WebBrowser.openBrowserAsync(`${WEB_URL}/sell`).catch(() => {}); }} style={({ pressed }) => [s.sellButton, { backgroundColor: colors.orange, opacity: pressed ? 0.88 : 1 }]}>
        <Text style={{ color: colors.onOrange, fontSize: 14.5, fontWeight: '800' }}>Apply</Text>
      </Pressable>
    </LinearGradient>
  );
}

/** Seller logo + name line used on small cards. */
export function VendorChip({ name, logo }: { name: string; logo?: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Avatar name={name} uri={logo} size={26} square tone="mint" />
      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '800', color: colors.text, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  productCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  productImage: { width: '100%', aspectRatio: 1 },
  topLeft: { position: 'absolute', top: 10, left: 10 },
  topRight: { position: 'absolute', top: 10, right: 10 },
  bottomLeft: { position: 'absolute', bottom: 8, left: 8 },
  tag: { position: 'absolute', left: 10, bottom: 10, maxWidth: '86%', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, height: 24, justifyContent: 'center' },
  productBody: { padding: 13, gap: 7 },
  productTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  vendorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vendorName: { fontSize: 12.5, fontWeight: '800', flexShrink: 1 },
  vendorCity: { fontSize: 12, fontWeight: '600', flexShrink: 3 },
  productFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  addButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  serviceRow: { flexDirection: 'row', gap: 13, padding: 12 },
  serviceImage: { width: 104, alignSelf: 'stretch', minHeight: 124, borderRadius: 16, overflow: 'hidden' },
  serviceBody: { flex: 1, gap: 5, justifyContent: 'space-between' },
  serviceVendor: { fontSize: 12.5, fontWeight: '800', flexShrink: 1 },
  serviceTitle: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2, lineHeight: 21 },
  serviceMeta: { fontSize: 12.5, fontWeight: '600' },
  serviceFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  bookButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 14 },
  bookText: { fontSize: 13.5, fontWeight: '800' },
  spotlight: { padding: 0, overflow: 'hidden', borderRadius: 24 },
  spotImage: { height: 176, width: '100%' },
  spotPills: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  onPhoto: { height: 28, borderRadius: 14 },
  spotRating: { position: 'absolute', right: 12, bottom: 12 },
  spotBody: { padding: 16, gap: 2 },
  spotTitle: { flex: 1, fontSize: 19.5, fontWeight: '800', letterSpacing: -0.4, lineHeight: 25 },
  spotVendor: { fontSize: 14.5, fontWeight: '800', flexShrink: 1 },
  heartRound: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  spotInfo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoText: { fontSize: 13.5, fontWeight: '700' },
  spotFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  spotCta: { flex: 1, maxWidth: 220, height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginLeft: 12 },
  spotCtaText: { fontSize: 15.5, fontWeight: '800' },
  sellCard: { marginHorizontal: 16, marginTop: 24, borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  sellIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sellTitle: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
  sellText: { fontSize: 13, lineHeight: 18, marginTop: 2, fontWeight: '600' },
  sellButton: { height: 44, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  catTile: { width: 118, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 10 },
  catImage: { width: 80, height: 80, borderRadius: 18 },
  catLabel: { fontSize: 13.5, fontWeight: '800', textAlign: 'center', lineHeight: 17, minHeight: 34 },
});
