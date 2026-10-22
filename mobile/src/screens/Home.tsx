/**
 * Explore — the landing screen. Search, category chips, "shop by category", sponsored stores, market items,
 * popular services and trust messaging. Every list is live API data; a section with nothing to show is hidden.
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { CategoryTile, ProductCard, ProductRow, SellCard, ServiceRow } from '../cards';
import { useActiveCategories, useMarket, SORT_LABELS, type SortKey } from '../data';
import { AppBar, PillRow, Screen, SearchBar, SectionHead, SectionLabel, SortPill, Tabs, TrustBanner, ViewToggle, useColumnWidth } from '../kit';
import { useCity } from '../city';
import { plural } from '../format';
import type { NavProps } from '../nav';
import { FeaturedStores, usePromotions, VipStores } from '../promotions';
import { useTheme } from '../providers';
import { Button, EmptyState, Notice, Spinner, Text } from '../ui';

export type { Screen } from '../nav';

const SORTS: { value: SortKey; label: string }[] = (['popular', 'newest', 'price_asc', 'price_desc', 'rating'] as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }));

export function Home({ go, tab }: NavProps) {
  const { colors } = useTheme();
  const { city } = useCity();
  const width = useColumnWidth();
  const categories = useActiveCategories();
  const promos = usePromotions();
  const [text, setText] = useState('');
  const [chip, setChip] = useState('');
  const [sort, setSort] = useState<SortKey>('popular');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [refreshing, setRefreshing] = useState(false);

  const market = useMarket({ q: '', kind: 'product', category: chip, sort, min: '', max: '', city }, 8);
  const services = useMarket({ q: '', kind: 'service', category: '', sort: 'popular', min: '', max: '', city }, 3);

  const productCategories = useMemo(() => (categories.data ?? []).filter((c) => c.kind === 'product'), [categories.data]);
  const chips = useMemo(() => [{ key: '', label: 'All' }, ...productCategories.map((c) => ({ key: c.slug, label: c.name }))], [productCategories]);
  const activeCategory = productCategories.find((c) => c.slug === chip);
  const cardWidth = (width - 32 - 12) / 2;

  const search = () => go('browse', { q: text.trim(), fromHome: true });
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([market.reload(true), services.reload(true), promos.reload(), categories.refetch()]);
    setRefreshing(false);
  };

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      <ScrollView
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <SearchBar style={{ marginTop: 16 }} value={text} onChangeText={setText} onSubmit={search} placeholder="Search products or services" onFilter={() => go('browse', { q: text.trim(), fromHome: true, openFilters: true })} />
        <PillRow style={{ marginTop: 14 }} items={chips} active={chip} onSelect={setChip} />

        {productCategories.length ? (
          <>
            <SectionLabel title="Shop by category" action="See All" onAction={() => go('browse', { fromHome: true })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
              {productCategories.map((category) => <CategoryTile key={category.id} category={category} onPress={() => go('browse', { category: category.slug, kind: 'product', fromHome: true })} />)}
            </ScrollView>
          </>
        ) : null}

        <VipStores stores={promos.vip} onOpen={(slug) => go('store', { slug })} />
        <FeaturedStores stores={promos.featured} onOpen={(slug) => go('store', { slug })} />

        <SectionHead
          wrap
          title={activeCategory ? activeCategory.name : 'Market Items'}
          caption={market.loading ? 'Loading…' : `${plural(market.total, 'result')}${city ? ` in ${city}` : ''}`}
          right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><SortPill value={sort} options={SORTS} onChange={setSort} /><ViewToggle mode={view} onChange={setView} /></View>}
        />
        {market.error && !market.items.length ? (
          <View style={{ paddingHorizontal: 16, gap: 10 }}><Notice type="warning">{market.error}</Notice><Button variant="secondary" onPress={() => void market.reload()}>Try again</Button></View>
        ) : market.loading && !market.items.length ? (
          <Spinner label="Loading the local market…" />
        ) : !market.items.length ? (
          <EmptyState icon="basket-outline" title={chip || city ? 'Nothing here yet' : 'No products yet'} text={chip || city ? 'No products match this category right now. Try another category or city.' : 'Sellers are setting up their stalls. Please check back soon.'} action={chip ? <Button variant="secondary" style={{ marginTop: 8 }} onPress={() => setChip('')}>Show all products</Button> : undefined} />
        ) : view === 'grid' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
            {market.items.map((listing) => <ProductCard key={listing.id} listing={listing} style={{ width: cardWidth }} onPress={() => go('listing', { id: listing.id })} />)}
          </View>
        ) : (
          <View style={{ gap: 12, paddingHorizontal: 16 }}>
            {market.items.map((listing) => <ProductRow key={listing.id} listing={listing} onPress={() => go('listing', { id: listing.id })} />)}
          </View>
        )}
        {market.total > market.items.length ? (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Button variant="mint" icon="arrow-forward" onPress={() => go('browse', { category: chip, kind: 'product', sort, fromHome: true })}>{`View all ${market.total} items`}</Button>
          </View>
        ) : null}

        {services.items.length ? (
          <>
            <SectionHead title="Popular services" caption="Book vetted providers with clear prices" right={<Text onPress={() => tab('services')} style={{ color: colors.brown, fontSize: 14, fontWeight: '800' }}>See All →</Text>} />
            <View style={{ gap: 12, paddingHorizontal: 16 }}>
              {services.items.map((listing) => <ServiceRow key={listing.id} listing={listing} onPress={() => go('listing', { id: listing.id })} onBook={() => go('listing', { id: listing.id })} />)}
            </View>
          </>
        ) : null}

        <TrustBanner icon="shield-checkmark" title="Sokoni Quality Guarantee" text="Every seller is verified by Sokoni Hub before they can list products or take bookings." />
        <SellCard />
      </ScrollView>
      <Tabs active="home" tab={tab} />
    </Screen>
  );
}
