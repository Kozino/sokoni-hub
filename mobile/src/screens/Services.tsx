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
import { AppBar, Panel, PillRow, Screen, SearchBar, SectionHead, SectionLabel, SortPill, Tabs, accentAt, useColumnWidth, useGrid } from '../kit';
import { useCity } from '../city';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import { Button, Chip, Divider, EmptyState, Field, Notice, Sheet, Spinner, Text } from '../ui';

const SORTS: { value: SortKey; label: string }[] = (['popular', 'rating', 'newest', 'price_asc', 'price_desc'] as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }));

export function Services({ go, tab, initial }: NavProps & { initial?: Record<string, any> }) {
  const params = initial ?? {};
  const { colors } = useTheme();
  const narrow = useColumnWidth() < 380;
  const grid = useGrid(300, 12, 8); // service rows: one across on phones, two on tablets
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
      <LinearGradient colors={[colors.heroB, colors.heroA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={[s.circle, { right: -26, top: -34, width: 100, height: 100, backgroundColor: 'rgba(255,255,255,0.09)' }]} />
        <View style={s.heroIcon}><Icon name="service-bell" solid={false} size={19} color={colors.orange} /></View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={s.heroTitle}>Book Trusted African Services in Qatar</Text>
          <Text numberOfLines={1} style={s.heroText}>{blurb ? `${blurb} · upfront pricing` : 'Verified providers · upfront pricing'}</Text>
        </View>
      </LinearGradient>
      <SearchBar style={{ marginTop: 8 }} value={q} onChangeText={setQ} placeholder={narrow ? 'Search services' : 'Search services or providers'} onFilter={() => setSheet(true)} filterCount={filterCount} />
      <PillRow style={{ marginTop: 8 }} items={chips} active={category} onSelect={setCategory} />

      {spotlight ? (
        <>
          <SectionLabel dot title="Featured spotlight" action={undefined} />
          <View style={{ paddingHorizontal: 12 }}><ServiceSpotlight listing={spotlight} onPress={() => open(spotlight.id)} onBook={() => open(spotlight.id)} /></View>
        </>
      ) : null}

      <SectionHead
        title={active ? active.name : city ? `Available services in ${city}` : 'Available services'}
        caption={market.loading && !market.items.length ? 'Searching…' : `${plural(market.total, 'service')} from verified providers`}
        right={<SortPill value={sort} options={SORTS} onChange={setSort} />}
        style={{ marginBottom: 8 }}
      />
      {market.error && market.items.length ? <View style={{ paddingHorizontal: 12, marginBottom: 8 }}><Notice type="warning">{market.error}</Notice></View> : null}
    </View>
  );

  const footer = (
    <View>
      {market.loadingMore ? <Spinner label="Loading more…" /> : null}
      <Panel style={{ marginHorizontal: 12, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <View style={[s.howIcon, { backgroundColor: colors.primarySoft }]}><Icon name="shield-checkmark" solid={false} size={18} color={colors.primary} /></View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, flex: 1 }}>How Sokoni Hub booking works</Text>
        </View>
        {[
          ['Choose a service & time', 'Pick a provider and a slot that suits you. The price is shown up front.'],
          ['Confirm the details', 'Choose the provider\u2019s location or a home visit. The provider confirms your booking.'],
          ['Pay the provider directly', 'Nothing is charged in the app. You pay the provider once the service is done.'],
        ].map(([title, text], index) => {
          const accent = accentAt(colors, [0, 1, 2][index]);
          return (
            <View key={title} style={s.step}>
              <View style={[s.stepNo, { backgroundColor: accent.bg }]}><Text style={{ color: accent.fg, fontSize: 10.5, fontWeight: '700' }}>{index + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{title}</Text>
                <Text style={{ fontSize: 11, lineHeight: 15, color: colors.text2, marginTop: 1 }}>{text}</Text>
              </View>
            </View>
          );
        })}
        <View style={[s.assure, { backgroundColor: colors.primarySoft }]}>
          <Icon name="shield-checkmark" size={16} color={colors.primary} />
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: colors.text }}>Every provider is verified before they can take bookings.</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => go('support')}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Learn more</Text></Pressable>
        </View>
      </Panel>
      <View style={{ height: 40 }} />
    </View>
  );

  return (
    <Screen wide>
      <AppBar go={go} tab={tab} />
      {market.loading && !market.items.length && !market.error ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListFooterComponent={<Spinner label="Finding providers…" />} />
      ) : (
        <FlatList
          key={grid.cols >= 3 ? 'two' : 'one'} numColumns={grid.cols >= 3 ? 2 : 1} columnWrapperStyle={grid.cols >= 3 ? { gap: 8, paddingHorizontal: 12 } : undefined}
          data={rest} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={header} ListFooterComponent={footer}
          refreshControl={<RefreshControl refreshing={market.refreshing} onRefresh={() => void market.reload(true)} tintColor={colors.primary} />}
          onEndReached={() => void market.loadMore()} onEndReachedThreshold={0.4}
          renderItem={({ item }) => <View style={grid.cols >= 3 ? { flex: 1 } : { paddingHorizontal: 12 }}><ServiceRow listing={item} onPress={() => open(item.id)} onBook={() => open(item.id)} /></View>}
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
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => { setMin(''); setMax(''); setCity(''); }}>Reset</Button>
          <Button style={{ flex: 1 }} onPress={() => setSheet(false)}>{`Show ${plural(market.total, 'service')}`}</Button>
        </View>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 12, marginTop: 8, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 10, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 9 },
  circle: { position: 'absolute', borderRadius: 999 },
  heroIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700', letterSpacing: -0.2 },
  heroText: { color: '#CFEBDC', fontSize: 10.5, fontWeight: '500', marginTop: 1 },
  howIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', gap: 9, marginBottom: 9 },
  stepNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  assure: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, padding: 9, marginTop: 2 },
  label: { fontSize: 12.5, fontWeight: '700', marginTop: 8, marginBottom: 8 },
});
