/**
 * Services — book vetted providers. Hero with search, service-category chips, a featured spotlight
 * (the most popular service, preferring a VIP seller) and the full list. Live data from /listings?kind=service.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ServiceRow, ServiceSpotlight } from '../cards';
import { SORT_LABELS, useActiveCategories, useDebounced, useMarket, usePromoSet, type SortKey } from '../data';
import { plural } from '../format';
import { Icon } from '../icons';
import { AppBar, Panel, PillRow, Screen, SearchBar, SectionHead, SectionLabel, SortPill, Tabs, useColumnWidth } from '../kit';
import { useCity } from '../city';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import { Button, Chip, Divider, EmptyState, Field, Notice, Sheet, Spinner, Text } from '../ui';

const SORTS: { value: SortKey; label: string }[] = (['popular', 'rating', 'newest', 'price_asc', 'price_desc'] as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }));

export function Services({ go, tab, initial }: NavProps & { initial?: Record<string, any> }) {
  const params = initial ?? {};
  const { colors } = useTheme();
  const narrow = useColumnWidth() < 380;
  const { city, setCity, cities } = useCity();
  const categories = useActiveCategories();
  const promo = usePromoSet();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [category, setCategory] = useState<string>(params.category ?? '');
  const [sort, setSort] = useState<SortKey>('popular');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [sheet, setSheet] = useState(false);
  const market = useMarket({ q: search, kind: 'service', category, sort, min, max, city }, 20);

  const serviceCategories = useMemo(() => (categories.data ?? []).filter((c) => c.kind === 'service'), [categories.data]);
  const chips = useMemo(() => [{ key: '', label: 'All Services' }, ...serviceCategories.map((c) => ({ key: c.slug, label: c.name }))], [serviceCategories]);
  const blurb = serviceCategories.slice(0, 3).map((c) => c.name).join(', ');

  // The spotlight is the most-viewed service, preferring a seller with a VIP placement. It is not repeated in the list.
  const spotlight = useMemo(() => {
    if (!market.items.length || sort === 'price_asc' || sort === 'price_desc') return undefined;
    return market.items.find((l) => promo.vip.has(l.vendor_id)) ?? market.items[0];
  }, [market.items, promo.vip, sort]);
  const rest = spotlight && market.items.length > 1 ? market.items.filter((l) => l.id !== spotlight.id) : market.items;
  const filterCount = (min ? 1 : 0) + (max ? 1 : 0);
  const active = serviceCategories.find((c) => c.slug === category);

  const open = (id: string) => go('listing', { id });

  const header = (
    <View>
      <LinearGradient colors={[colors.primary, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={[s.circle, { right: -50, top: -60, width: 190, height: 190, backgroundColor: 'rgba(255,255,255,0.09)' }]} />
        <View style={{ position: 'absolute', right: 14, bottom: 70, opacity: 0.1 }}><Icon name="shield-checkmark" solid={false} size={96} color="#FFFFFF" /></View>
        <View style={s.heroTag}><Icon name="shield-checkmark" solid size={13} color={colors.orange} /><Text style={s.heroTagText}>QATAR COMMUNITY HUB</Text></View>
        <Text style={s.heroTitle}>Book Trusted African Services in Qatar</Text>
        <Text style={s.heroText}>{blurb ? `${blurb} and more, with upfront pricing from verified providers.` : 'Hair, beauty, catering and more, with upfront pricing from verified providers.'}</Text>
        <SearchBar style={{ paddingHorizontal: 0, marginTop: 16 }} value={q} onChangeText={setQ} placeholder={narrow ? 'Search services' : 'Search services or providers'} onFilter={() => setSheet(true)} filterCount={filterCount} />
      </LinearGradient>
      <PillRow style={{ marginTop: 16 }} items={chips} active={category} onSelect={setCategory} />

      {spotlight ? (
        <>
          <SectionLabel dot title="Featured spotlight" action={undefined} />
          <View style={{ paddingHorizontal: 16 }}><ServiceSpotlight listing={spotlight} onPress={() => open(spotlight.id)} onBook={() => open(spotlight.id)} /></View>
        </>
      ) : null}

      <SectionHead
        title={active ? active.name : city ? `Available services in ${city}` : 'Available services'}
        caption={market.loading && !market.items.length ? 'Searching…' : `${plural(market.total, 'service')} from verified providers`}
        right={<SortPill value={sort} options={SORTS} onChange={setSort} />}
        style={{ marginBottom: 14 }}
      />
      {market.error && market.items.length ? <View style={{ paddingHorizontal: 16, marginBottom: 10 }}><Notice type="warning">{market.error}</Notice></View> : null}
    </View>
  );

  const footer = (
    <View>
      {market.loadingMore ? <Spinner label="Loading more…" /> : null}
      <Panel style={{ marginHorizontal: 16, marginTop: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <View style={[s.howIcon, { backgroundColor: colors.primarySoft }]}><Icon name="shield-checkmark" solid={false} size={22} color={colors.primary} /></View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }}>How Sokoni Hub Booking Works</Text>
        </View>
        {[
          ['Choose a service & time', 'Pick a provider and a slot that suits you. The price is shown up front.', colors.primary],
          ['Confirm the details', 'Choose the provider\u2019s location or a home visit. The provider confirms your booking.', colors.brown],
          ['Pay the provider directly', 'Nothing is charged in the app. You pay the provider once the service is done.', colors.primary],
        ].map(([title, text, tone], index) => (
          <View key={title} style={s.step}>
            <View style={[s.stepNo, { backgroundColor: tone }]}><Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '800' }}>{index + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>{title}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: colors.text2, marginTop: 2 }}>{text}</Text>
            </View>
          </View>
        ))}
        <View style={[s.assure, { backgroundColor: colors.surface2 }]}>
          <Icon name="shield-checkmark" size={20} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text }}>Every provider is verified before they can take bookings.</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => go('support')}><Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '800' }}>Learn More</Text></Pressable>
        </View>
      </Panel>
      <View style={{ height: 56 }} />
    </View>
  );

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      {market.loading && !market.items.length && !market.error ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListFooterComponent={<Spinner label="Finding providers…" />} />
      ) : (
        <FlatList
          data={rest} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={header} ListFooterComponent={footer}
          refreshControl={<RefreshControl refreshing={market.refreshing} onRefresh={() => void market.reload(true)} tintColor={colors.primary} />}
          onEndReached={() => void market.loadMore()} onEndReachedThreshold={0.4}
          renderItem={({ item }) => <View style={{ paddingHorizontal: 16 }}><ServiceRow listing={item} onPress={() => open(item.id)} onBook={() => open(item.id)} /></View>}
          ListEmptyComponent={market.error ? (
            <EmptyState icon="cloud-offline-outline" title="Could not load services" text={market.error} action={<Button style={{ marginTop: 8 }} onPress={() => void market.reload()}>Try again</Button>} />
          ) : spotlight ? null : (
            <EmptyState icon="calendar-outline" title="No services found" text={search || category || city ? 'Try another category, city or search.' : 'Providers are getting set up. Please check back soon.'} action={search || category || city ? <Button variant="secondary" style={{ marginTop: 8 }} onPress={() => { setQ(''); setCategory(''); setCity(''); setMin(''); setMax(''); }}>Clear filters</Button> : undefined} />
          )}
        />
      )}
      <Tabs active="services" tab={tab} />

      <Sheet visible={sheet} title="Filter services" onClose={() => setSheet(false)}>
        <Text style={[s.label, { color: colors.text }]}>Price (QAR)</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Minimum" value={min} onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" /></View>
          <View style={{ flex: 1 }}><Field label="Maximum" value={max} onChangeText={(v) => setMax(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="Any" /></View>
        </View>
        {cities.length > 0 ? (
          <>
            <Divider />
            <Text style={[s.label, { color: colors.text }]}>Provider city</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip selected={!city} onPress={() => setCity('')}>All cities</Chip>
              {cities.map((name) => <Chip key={name} selected={city === name} onPress={() => setCity(city === name ? '' : name)}>{name}</Chip>)}
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => { setMin(''); setMax(''); setCity(''); }}>Reset</Button>
          <Button style={{ flex: 1 }} onPress={() => setSheet(false)}>{`Show ${plural(market.total, 'service')}`}</Button>
        </View>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 16, marginTop: 16, borderRadius: 26, padding: 18, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999 },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 12, height: 28, borderRadius: 14 },
  heroTagText: { color: '#D8F3E5', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '800', letterSpacing: -0.7, lineHeight: 33, marginTop: 14 },
  heroText: { color: '#D3EEDF', fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  howIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', gap: 13, marginBottom: 14 },
  stepNo: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  assure: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, marginTop: 4 },
  label: { fontSize: 15.5, fontWeight: '800', marginTop: 8, marginBottom: 10 },
});
