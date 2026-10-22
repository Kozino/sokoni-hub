/**
 * Store page. Seller identity, rating, delivery and pick-up terms, WhatsApp contact, their products and
 * services, and buyer reviews, all from `GET /vendors/:slug`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { api } from '../api';
import { ProductCard, ServiceRow } from '../cards';
import { WEB_URL } from '../config';
import { errorMessage, rememberImages, usePromoSet } from '../data';
import { cleanCity, money, plural, shortDate, whatsappUrl } from '../format';
import { Icon, type IconName } from '../icons';
import { Avatar, Panel, Pill, Screen, SegTabs, SectionHead, Skeleton, softShadow, useColumnWidth } from '../kit';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import type { Listing, Review, Vendor } from '../types';
import { Button, EmptyState, Header, Text } from '../ui';

type StoreData = { vendor: Vendor; listings: Listing[]; reviews?: (Review & { listing_title?: string })[] };

export function StoreDetail({ slug, go, back }: NavProps & { slug?: string }) {
  const { colors } = useTheme();
  const promo = usePromoSet();
  const width = useColumnWidth();
  const [tabKey, setTabKey] = useState<'product' | 'service'>('product');
  const store = useQuery({
    queryKey: ['store', slug], enabled: !!slug, staleTime: 60_000,
    queryFn: async () => { const data = await api.get<StoreData>(`/vendors/${encodeURIComponent(String(slug))}`); rememberImages(data.listings); return data; },
  });
  const vendor = store.data?.vendor;
  const listings = useMemo(() => store.data?.listings ?? [], [store.data]);
  const products = listings.filter((l) => l.kind === 'product');
  const services = listings.filter((l) => l.kind === 'service');
  const active = tabKey === 'product' && !products.length && services.length ? 'service' : tabKey === 'service' && !services.length ? 'product' : tabKey;
  const cardWidth = (width - 32 - 12) / 2;

  if (store.error && !vendor) {
    return <Screen><Header title="Store" back={back} /><EmptyState icon="cloud-offline-outline" title="Store unavailable" text={errorMessage(store.error)} action={<Button style={{ marginTop: 8 }} onPress={() => void store.refetch()}>Try again</Button>} /></Screen>;
  }
  if (!vendor) {
    return <Screen><Header title="Store" back={back} /><View style={{ padding: 12, gap: 11 }}><Skeleton height={140} radius={26} /><Skeleton height={28} width="60%" /><Skeleton height={60} radius={18} /></View></Screen>;
  }

  const rating = Number(vendor.rating_count || 0) > 0 ? { avg: Number(vendor.rating_avg || 0), count: Number(vendor.rating_count) } : null;
  const vip = promo.vip.has(vendor.id);
  const chat = whatsappUrl(vendor.whatsapp, `Hi ${vendor.business_name}, I found your store on Sokoni Hub.`);
  const city = [cleanCity(vendor.city), vendor.country].filter(Boolean).join(', ');
  const terms: { icon: IconName; title: string; sub: string }[] = [];
  if (vendor.offers_delivery !== false) {
    const fee = Number(vendor.delivery_fee || 0);
    const free = Number(vendor.free_delivery_over || 0);
    terms.push({ icon: 'car', title: 'Delivery', sub: `${fee > 0 ? `${money(fee)} per order` : 'No delivery fee'}${free > 0 ? ` · free over ${money(free)}` : ''}` });
  }
  if (vendor.offers_pickup) terms.push({ icon: 'storefront', title: 'Pick up', sub: vendor.pickup_address || 'Collect from the seller' });
  const reviews = store.data?.reviews ?? [];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }} refreshControl={<RefreshControl refreshing={store.isRefetching} onRefresh={() => void store.refetch()} tintColor={colors.primary} />}>
        <LinearGradient colors={[colors.heroB, colors.heroA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cover}>
          <View style={[s.circle, { right: -40, top: -50, width: 180, height: 180, backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          <View style={[s.circle, { left: -30, bottom: -60, width: 150, height: 150, backgroundColor: 'rgba(255,255,255,0.06)' }]} />
          <View style={s.coverBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={s.round}><Icon name="arrow-back" size={21} color="#111827" /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Share store" onPress={() => void Share.share({ message: `${vendor.business_name} on Sokoni Hub — ${WEB_URL}/store/${vendor.slug}` }).catch(() => {})} style={s.round}><Icon name="share" solid={false} size={20} color="#111827" /></Pressable>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 12 }}>
          <View style={[s.logoWrap, { backgroundColor: colors.surface, borderColor: colors.bg }, softShadow(colors.shadow, 2)]}>
            <Avatar name={vendor.business_name} uri={vendor.logo_url} size={80} square tone="mint" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.7, color: colors.text, flexShrink: 1 }}>{vendor.business_name}</Text>
            <Icon name="check-badge" size={22} color={colors.success} />
            {vip ? <Pill tone="orange" icon="diamond" small>VIP</Pill> : null}
          </View>
          <View style={s.metaRow}>
            {rating ? <View style={s.meta}><Icon name="star" size={15} color={colors.orange} /><Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{rating.avg.toFixed(1)}</Text><Text style={{ fontSize: 12.5, color: colors.text2, fontWeight: '600' }}>({plural(rating.count, 'review')})</Text></View> : <Pill tone="mint" small>New seller</Pill>}
            {city ? <View style={s.meta}><Icon name="location" solid={false} size={15} color={colors.text2} /><Text style={{ fontSize: 12.5, color: colors.text2, fontWeight: '600' }}>{city}</Text></View> : null}
            <View style={s.meta}><Icon name="cube" solid={false} size={15} color={colors.text2} /><Text style={{ fontSize: 12.5, color: colors.text2, fontWeight: '600' }}>{plural(listings.length, 'listing')}</Text></View>
          </View>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.text2, marginTop: 9 }}>{vendor.description || 'A verified local Sokoni Hub seller.'}</Text>

          {chat ? <Button variant="mint" iconLeft="logo-whatsapp" style={{ marginTop: 12 }} onPress={() => void Linking.openURL(chat)}>Chat on WhatsApp</Button> : null}

          {terms.length ? (
            <Panel style={{ marginTop: 12, gap: 11 }}>
              {terms.map((t) => (
                <View key={t.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.termIcon, { backgroundColor: colors.primarySoft }]}><Icon name={t.icon} solid={false} size={21} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }}>{t.title}</Text><Text style={{ fontSize: 12, color: colors.text2, fontWeight: '500', marginTop: 1, lineHeight: 17 }}>{t.sub}</Text></View>
                </View>
              ))}
              {vendor.delivery_notes ? <Text style={{ fontSize: 11.5, color: colors.text2, lineHeight: 17 }}>{vendor.delivery_notes}</Text> : null}
            </Panel>
          ) : null}
        </View>

        {products.length && services.length ? (
          <View style={{ paddingHorizontal: 12, marginTop: 19 }}><SegTabs active={active} onChange={(k) => setTabKey(k as 'product' | 'service')} items={[{ key: 'product', label: 'Products', count: products.length }, { key: 'service', label: 'Services', count: services.length }]} /></View>
        ) : <SectionHead title={services.length && !products.length ? 'Services' : 'Products'} />}

        <View style={{ marginTop: 12 }}>
          {!listings.length ? <EmptyState icon="basket-outline" title="Nothing listed yet" text="This seller has not added anything to their store yet." />
            : active === 'product' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingHorizontal: 12 }}>{products.map((l) => <ProductCard key={l.id} listing={l} style={{ width: cardWidth }} onPress={() => go('listing', { id: l.id })} />)}</View>
            ) : (
              <View style={{ gap: 9, paddingHorizontal: 12 }}>{services.map((l) => <ServiceRow key={l.id} listing={{ ...l, business_name: l.business_name || vendor.business_name }} onPress={() => go('listing', { id: l.id })} />)}</View>
            )}
        </View>

        {reviews.length ? (
          <>
            <SectionHead title="What buyers say" caption={rating ? `${rating.avg.toFixed(1)} average from ${plural(rating.count, 'review')}` : undefined} />
            <View style={{ gap: 9, paddingHorizontal: 12 }}>
              {reviews.slice(0, 4).map((r) => (
                <Panel key={r.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={15} color={n <= r.rating ? colors.orange : colors.border} />)}</View>
                    <Text style={{ fontSize: 11.5, color: colors.muted, fontWeight: '600' }}>{shortDate(r.created_at)}</Text>
                  </View>
                  {r.title ? <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }}>{r.title}</Text> : null}
                  {r.comment ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.text2 }}>{r.comment}</Text> : null}
                  <Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600' }}>{r.buyer_name || 'Sokoni Hub buyer'}{r.verified ? ' · Verified purchase' : ''}</Text>
                </Panel>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  cover: { height: 118, overflow: 'hidden', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  circle: { position: 'absolute', borderRadius: 999 },
  coverBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 11, paddingTop: 11 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 75, height: 75, borderRadius: 22, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginTop: -46 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 11, marginTop: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  termIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
