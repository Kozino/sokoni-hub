import { Icon } from './icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './ui';
import { api } from './api';
import { cleanCity } from './format';
import { tap } from './haptics';
import { Avatar, softShadow } from './kit';
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

function Head({ icon, title }: { icon: 'diamond' | 'ribbon'; title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.head}>
      <View style={styles.headTitle}>
        <Icon name={icon} size={16} color={icon === 'diamond' ? colors.orange : colors.primary} />
        <Text style={[styles.eyebrow, { color: colors.text2 }]}>{title.toUpperCase()}</Text>
      </View>
      <Text style={[styles.sponsored, { color: colors.muted }]}>Sponsored</Text>
    </View>
  );
}

/** Paid VIP placement: a deep-green card with the seller's real logo and rating. */
export function VipStores({ stores, onOpen }: { stores: Promo[]; onOpen: (slug: string) => void }) {
  const { colors } = useTheme();
  if (!stores.length) return null;
  return (
    <View>
      <Head icon="diamond" title="VIP stores" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {stores.map((promo) => {
          const rating = ratingLine(promo);
          return (
            <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`VIP store ${promo.business_name}`} onPress={() => { tap(); click(promo); onOpen(promo.slug); }}>
              <LinearGradient colors={[colors.deep, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.vipCard, softShadow(colors.shadow, 2)]}>
                <View style={styles.vipTop}>
                  <Avatar name={promo.business_name} uri={promo.logo_url} size={56} square tone="mint" />
                  <View style={[styles.vipBadge, { backgroundColor: colors.orange }]}><Icon name="diamond" size={11} color={colors.onOrange} /><Text style={[styles.vipBadgeText, { color: colors.onOrange }]}>VIP</Text></View>
                </View>
                <Text numberOfLines={1} style={styles.vipName}>{promo.business_name}</Text>
                <View style={styles.row}><Icon name="location" solid={false} size={13} color="#BFE9D2" /><Text numberOfLines={1} style={[styles.vipMeta, { flexShrink: 1 }]}>{place(promo)}</Text></View>
                <View style={styles.vipFoot}>
                  {rating ? <View style={styles.row}><Icon name="star" size={13} color="#FFB36B" /><Text style={styles.vipRating}>{rating.avg.toFixed(1)}</Text><Text style={styles.vipMeta}>({rating.count})</Text></View> : <Text style={styles.vipMeta}>{promo.listing_count} listing{promo.listing_count === 1 ? '' : 's'}</Text>}
                  <View style={styles.visit}><Text style={styles.visitText}>Visit</Text><Icon name="arrow-forward" size={13} color="#004C2D" /></View>
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
  if (!stores.length) return null;
  return (
    <View>
      <Head icon="ribbon" title="Featured stores" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {stores.map((promo) => {
          const rating = ratingLine(promo);
          return (
            <Pressable key={promo.id} accessibilityRole="button" accessibilityLabel={`Featured store ${promo.business_name}`} onPress={() => { tap(); click(promo); onOpen(promo.slug); }} style={[styles.featCard, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow)]}>
              <View style={styles.vipTop}>
                <Avatar name={promo.business_name} uri={promo.logo_url} size={48} square tone="mint" />
                <View style={[styles.featTag, { backgroundColor: colors.orangeSoft }]}><Text style={[styles.featTagText, { color: colors.gold }]}>SPONSORED</Text></View>
              </View>
              <Text numberOfLines={1} style={[styles.featName, { color: colors.text }]}>{promo.business_name}</Text>
              <View style={styles.row}><Icon name="location" solid={false} size={13} color={colors.text2} /><Text numberOfLines={1} style={[styles.featMeta, { color: colors.text2 }]}>{place(promo)}</Text></View>
              <View style={styles.row}>
                {rating ? <><Icon name="star" size={13} color={colors.orange} /><Text style={[styles.featMeta, { color: colors.text, fontWeight: '800' }]}>{rating.avg.toFixed(1)}</Text><Text style={[styles.featMeta, { color: colors.muted }]}>({rating.count})</Text><Text style={{ color: colors.muted }}>·</Text></> : null}
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
  head: { marginTop: 26, marginBottom: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1 }, sponsored: { fontSize: 12, fontWeight: '700' },
  rail: { gap: 12, paddingHorizontal: 16, paddingBottom: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vipCard: { width: 208, borderRadius: 24, padding: 15, gap: 5 }, vipTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  vipBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 11, paddingHorizontal: 9, height: 24 }, vipBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  vipName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginTop: 9 }, vipMeta: { color: '#BFE9D2', fontSize: 12.5, fontWeight: '600' }, vipRating: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  vipFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 15, paddingHorizontal: 13, height: 30 }, visitText: { fontSize: 13, fontWeight: '800', color: '#004C2D' },
  featCard: { width: 178, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 5 },
  featTag: { borderRadius: 8, paddingHorizontal: 7, height: 20, justifyContent: 'center' }, featTagText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  featName: { fontSize: 15, fontWeight: '800', marginTop: 8, letterSpacing: -0.2 }, featMeta: { fontSize: 12.5, fontWeight: '600' },
});
