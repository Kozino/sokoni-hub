import { Icon } from './icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './ui';
import { api } from './api';
import { cleanCity } from './format';
import { tap } from './haptics';
import { Avatar, softShadow, useColumnWidth } from './kit';
import { useTheme } from './providers';

export interface Promo {
  id: string; vendor_id: string; tier: 'vip' | 'featured';
  business_name: string; slug: string; logo_url: string | null; city: string | null; country: string | null;
  rating_avg: number | string; rating_count: number; listing_count: number;
}
type Promotions = { vip: Promo[]; featured: Promo[] };

/** Paid placement (GET /promotions). Failure is silent: the explore page must never break because of ads. */
export function usePromotions() {
  const [data, setData] = useState<Promotions>({ vip: [], featured: [] });
  const tracked = useRef('');
  const load = useCallback(async () => {
    try {
      const result = await api.get<Promotions>('/promotions');
      const next = { vip: result.vip || [], featured: result.featured || [] };
      setData(next);
      // Impressions are counted once per distinct set shown, as the API documents.
      const ids = [...next.vip, ...next.featured].map((p) => p.id);
      const signature = ids.join(',');
      if (ids.length && signature !== tracked.current) {
        tracked.current = signature;
        void api.post('/promotions/track', { event: 'impression', ids: ids.slice(0, 50) }).catch(() => {});
      }
    } catch { /* keep the previous rails */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { ...data, reload: load };
}

const click = (promo: Promo) => { void api.post('/promotions/track', { event: 'click', ids: [promo.id] }).catch(() => {}); };

const place = (promo: Promo) => cleanCity(promo.city) || 'Qatar';
const ratingLine = (promo: Promo) => (Number(promo.rating_count || 0) > 0 ? { avg: Number(promo.rating_avg || 0), count: Number(promo.rating_count) } : null);

/**
 * Card size for a rail that shows 2 cards fully (3 on tablets) at any screen width, then snaps card by card.
 * With fewer stores than slots (two stores on a tablet) the cards stretch so no slot is left empty.
 */
function useRail(count: number) {
  const width = useColumnWidth();
  const per = width >= 700 ? 3 : 2;
  const slots = Math.max(2, Math.min(per, count));
  const pad = 12;
  const gap = 12; // equal to the side padding, so the next card starts exactly at the screen edge and is never half-visible
  const cardWidth = Math.floor((width - pad * 2 - gap * (slots - 1)) / slots);
  return { cardWidth, snap: cardWidth + gap, pad, gap };
}

function Head({ icon, title }: { icon: 'diamond' | 'ribbon'; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <View style={styles.headTitle}>
        <Icon name={icon} size={14} color={icon === 'diamond' ? colors.orange : colors.primary} />
        <Text style={[styles.eyebrow, { color: colors.text2 }]}>{title.toUpperCase()}</Text>
      </View>
      <Text style={[styles.sponsored, { color: colors.muted }]}>Sponsored</Text>
    </View>
  );
}

/** Paid VIP placement: a deep-green card with the seller's real logo and rating. */
export function VipStores({ stores, onOpen }: { stores: Promo[]; onOpen: (slug: string) => void }) {
  const { colors } = useTheme();
  const rail = useRail(stores.length);
  if (!stores.length) return null;
  return (
    <View>
      <Head icon="diamond" title="VIP stores" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={rail.snap} snapToAlignment="start" decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: rail.pad, gap: rail.gap }}>
        {stores.map((promo) => {
          const rating = ratingLine(promo);
          return (
            <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`VIP store ${promo.business_name}`} onPress={() => { tap(); click(promo); onOpen(promo.slug); }} style={{ width: rail.cardWidth }}>
              <LinearGradient colors={[colors.heroA, colors.heroB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.vipCard, softShadow(colors.shadow, 1)]}>
                <View style={styles.vipTop}>
                  <Avatar name={promo.business_name} uri={promo.logo_url} size={36} square tone="mint" />
                  <View style={[styles.vipBadge, { backgroundColor: colors.orange }]}><Icon name="diamond" size={9} color={colors.onOrange} /><Text style={[styles.vipBadgeText, { color: colors.onOrange }]}>VIP</Text></View>
                </View>
                <Text numberOfLines={1} style={styles.vipName}>{promo.business_name}</Text>
                <View style={styles.row}><Icon name="location" solid={false} size={11} color="#BFE9D2" /><Text numberOfLines={1} style={[styles.vipMeta, { flexShrink: 1 }]}>{place(promo)}</Text></View>
                <View style={styles.vipFoot}>
                  {rating ? <View style={styles.row}><Icon name="star" size={11} color="#FFB36B" /><Text style={styles.vipRating}>{rating.avg.toFixed(1)}</Text><Text style={styles.vipMeta}>({rating.count})</Text></View> : <Text style={styles.vipMeta}>{promo.listing_count} listing{promo.listing_count === 1 ? '' : 's'}</Text>}
                  <View style={styles.visit}><Text style={styles.visitText}>Visit</Text><Icon name="arrow-forward" size={11} color="#004C2D" /></View>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function FeaturedStores({ stores, onOpen }: { stores: Promo[]; onOpen: (slug: string) => void }) {
  const { colors } = useTheme();
  const rail = useRail(stores.length);
  if (!stores.length) return null;
  return (
    <View>
      <Head icon="ribbon" title="Featured stores" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={rail.snap} snapToAlignment="start" decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: rail.pad, gap: rail.gap }}>
        {stores.map((promo) => {
          const rating = ratingLine(promo);
          return (
            <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`Featured store ${promo.business_name}`} onPress={() => { tap(); click(promo); onOpen(promo.slug); }} style={[styles.featCard, { width: rail.cardWidth, backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow, 1)]}>
              <View style={styles.vipTop}>
                <Avatar name={promo.business_name} uri={promo.logo_url} size={32} square tone="mint" />
                <View style={[styles.featTag, { backgroundColor: colors.orangeSoft }]}><Text style={[styles.featTagText, { color: colors.gold }]}>SPONSORED</Text></View>
              </View>
              <Text numberOfLines={1} style={[styles.featName, { color: colors.text }]}>{promo.business_name}</Text>
              <View style={styles.row}><Icon name="location" solid={false} size={11} color={colors.text2} /><Text numberOfLines={1} style={[styles.featMeta, { color: colors.text2 }]}>{place(promo)}</Text></View>
              <View style={styles.row}>
                {rating ? <><Icon name="star" size={11} color={colors.orange} /><Text style={[styles.featMeta, { color: colors.text, fontWeight: '700' }]}>{rating.avg.toFixed(1)}</Text><Text style={[styles.featMeta, { color: colors.muted }]}>({rating.count})</Text><Text style={{ color: colors.muted, fontSize: 10 }}>•</Text></> : null}
                <Text style={[styles.featMeta, { color: colors.text2 }]}>{promo.listing_count} listing{promo.listing_count === 1 ? '' : 's'}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: 16, marginBottom: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: 5 }, eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 }, sponsored: { fontSize: 10.5, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vipCard: { borderRadius: 14, padding: 10, gap: 3 }, vipTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  vipBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, height: 17 }, vipBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  vipName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: -0.2, marginTop: 5 }, vipMeta: { color: '#BFE9D2', fontSize: 10.5, fontWeight: '600' }, vipRating: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  vipFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 9, height: 23 }, visitText: { fontSize: 10.5, fontWeight: '700', color: '#004C2D' },
  featCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 10, gap: 3 },
  featTag: { borderRadius: 6, paddingHorizontal: 5, height: 16, justifyContent: 'center' }, featTagText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.4 },
  featName: { fontSize: 12.5, fontWeight: '700', marginTop: 5, letterSpacing: -0.1 }, featMeta: { fontSize: 10.5, fontWeight: '600' },
});
