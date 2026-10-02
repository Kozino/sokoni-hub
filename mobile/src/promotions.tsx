import { Icon } from './icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './ui';
import { api } from './api';
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

function Logo({ promo, size }: { promo: Promo; size: number }) {
  const { colors } = useTheme();
  return <View style={[styles.logo, { width: size, height: size, borderRadius: size * .28, backgroundColor: colors.primarySoft }]}>
    {promo.logo_url ? <Image source={{ uri: promo.logo_url }} style={{ width: '100%', height: '100%' }} /> : <Icon name="storefront" size={size * .48} color={colors.primary} />}
  </View>;
}

const place = (promo: Promo) => [promo.city, promo.country].filter(Boolean).join(', ') || 'Qatar';

export function VipStores({ stores, onOpen }: { stores: Promo[]; onOpen: (slug: string) => void }) {
  const { colors } = useTheme();
  if (!stores.length) return null;
  return <View>
    <View style={styles.head}>
      <View style={styles.headTitle}><Icon name="diamond" size={17} color={colors.gold} /><Text style={[styles.heading, { color: colors.text }]}>VIP stores</Text></View>
      <Text style={[styles.sponsored, { color: colors.muted }]}>Sponsored</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {stores.map((promo) => (
        <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`VIP store ${promo.business_name}`} onPress={() => { click(promo); onOpen(promo.slug); }}>
          <LinearGradient colors={['#1C1B17', '#3A2B10']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vipCard}>
            <View style={styles.vipBadge}><Icon name="diamond" size={10} color="#1C1B17" /><Text style={styles.vipBadgeText}>VIP</Text></View>
            <Logo promo={promo} size={54} />
            <Text numberOfLines={1} style={styles.vipName}>{promo.business_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Icon name="location-outline" size={12} color="#D9F5E5" /><Text numberOfLines={1} style={[styles.vipMeta, { flexShrink: 1 }]}>{place(promo)}</Text></View>
            <View style={styles.vipFoot}>
              <View style={styles.rating}><Icon name="star" size={12} color="#FFC178" /><Text style={styles.vipRating}>{Number(promo.rating_avg || 0).toFixed(1)}</Text><Text style={styles.vipMeta}>({promo.rating_count || 0})</Text></View>
              <View style={styles.visit}><Text style={styles.visitText}>Visit</Text><Icon name="arrow-forward" size={12} color="#1C1B17" /></View>
            </View>
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  </View>;
}

export function FeaturedStores({ stores, onOpen }: { stores: Promo[]; onOpen: (slug: string) => void }) {
  const { colors } = useTheme();
  if (!stores.length) return null;
  return <View>
    <View style={styles.head}>
      <View style={styles.headTitle}><Icon name="ribbon" size={17} color={colors.primary} /><Text style={[styles.heading, { color: colors.text }]}>Featured stores</Text></View>
      <Text style={[styles.sponsored, { color: colors.muted }]}>Sponsored</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {stores.map((promo) => (
        <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`Featured store ${promo.business_name}`} onPress={() => { click(promo); onOpen(promo.slug); }} style={[styles.featCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Logo promo={promo} size={46} />
          <View style={[styles.featTag, { backgroundColor: colors.goldSoft }]}><Text style={[styles.featTagText, { color: colors.gold }]}>SPONSORED</Text></View>
          <Text numberOfLines={1} style={[styles.featName, { color: colors.text }]}>{promo.business_name}</Text>
          <Text numberOfLines={1} style={[styles.featMeta, { color: colors.text2 }]}>{place(promo)}</Text>
          <View style={styles.rating}><Icon name="star" size={11} color={colors.gold} /><Text style={[styles.featMeta, { color: colors.text2, marginTop: 0 }]}>{Number(promo.rating_avg || 0).toFixed(1)} · {promo.listing_count} listings</Text></View>
        </Pressable>
      ))}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  head: { marginTop: 22, marginBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 }, heading: { fontSize: 18, fontWeight: '900', letterSpacing: -.3 }, sponsored: { fontSize: 10, fontWeight: '800', letterSpacing: .3 },
  rail: { gap: 10, paddingHorizontal: 14 }, logo: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  vipCard: { width: 196, borderRadius: 16, padding: 14, gap: 4 }, vipBadge: { position: 'absolute', right: 10, top: 10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFC178', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 }, vipBadgeText: { fontSize: 9, fontWeight: '900', color: '#1C1B17' },
  vipName: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 8 }, vipMeta: { color: 'rgba(255,255,255,.72)', fontSize: 11 }, vipRating: { color: '#fff', fontSize: 12, fontWeight: '800' },
  vipFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, rating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, visit: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFC178', borderRadius: 14, paddingHorizontal: 11, height: 27 }, visitText: { fontSize: 11, fontWeight: '900', color: '#1C1B17' },
  featCard: { width: 158, borderRadius: 14, borderWidth: 1, padding: 12, gap: 3 }, featTag: { position: 'absolute', right: 9, top: 9, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }, featTagText: { fontSize: 7, fontWeight: '900' },
  featName: { fontSize: 13, fontWeight: '900', marginTop: 8 }, featMeta: { fontSize: 11, marginTop: 1 },
});
