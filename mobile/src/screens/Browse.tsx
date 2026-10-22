/**
 * Categories / Market — search, category chips, "shop by category" tiles and a paged grid or list of
 * market items. Search, filters (sort, price, city, type) and paging all run against the live listings API.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { CategoryTile, ProductCard, ProductRow } from '../cards';
import { SORT_LABELS, useActiveCategories, useDebounced, useMarket, type SortKey } from '../data';
import { plural } from '../format';
import { Icon } from '../icons';
import { AppBar, PageTitle, PillRow, Screen, SearchBar, SectionHead, SectionLabel, SortPill, Tabs, TrustBanner, ViewToggle, useGrid } from '../kit';
import { useCity } from '../city';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import { Button, Chip, Divider, EmptyState, Field, Notice, Sheet, Spinner, Text, type TextInput } from '../ui';

const SORTS: { value: SortKey; label: string }[] = (['popular', 'newest', 'price_asc', 'price_desc', 'rating'] as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }));
type Kind = '' | 'product' | 'service';

export function Browse({ go, back, tab, initial }: NavProps & { initial?: Record<string, any> }) {
  const params = initial ?? {};
  const { colors } = useTheme();
  const { city, setCity, cities } = useCity();
  const grid = useGrid(150);
  const categories = useActiveCategories();

  const [q, setQ] = useState<string>(params.q ?? '');
  const search = useDebounced(q.trim());
  // Opened from the tab bar it is the product market; a search from Explore looks everywhere.
  const [kind, setKind] = useState<Kind>(params.kind ?? (params.q ? '' : 'product'));
  const [category, setCategory] = useState<string>(params.category ?? '');
  const [sort, setSort] = useState<SortKey>(params.sort ?? 'popular');
  const [min, setMin] = useState<string>(params.min ?? '');
  const [max, setMax] = useState<string>(params.max ?? '');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sheet, setSheet] = useState(!!params.openFilters);
  const inputRef = useRef<TextInput>(null);

  const market = useMarket({ q: search, kind, category, sort, min, max, city }, 20);

  useEffect(() => {
    if (!params.focus) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [params.focus]);

  const all = categories.data ?? [];
  const shown = useMemo(() => all.filter((c) => (kind ? c.kind === kind : c.kind === 'product')), [all, kind]);
  const chips = useMemo(() => [{ key: '', label: 'All' }, ...shown.map((c) => ({ key: c.slug, label: c.name }))], [shown]);
  const activeCategory = all.find((c) => c.slug === category);
  const filterCount = (sort !== 'popular' ? 1 : 0) + (min ? 1 : 0) + (max ? 1 : 0) + (city ? 1 : 0) + (kind === 'service' ? 1 : 0);
  const anyFilter = !!(search || category || filterCount);
  const listCols = grid.cols >= 3 ? 2 : 1; // list rows sit two across on tablets
  const cols = view === 'grid' ? grid.cols : listCols;
  const listWidth = Math.floor((grid.width - grid.pad * 2 - grid.gap) / 2);

  const chooseKind = (value: Kind) => {
    setKind(value);
    if (category && value && all.find((c) => c.slug === category)?.kind !== value) setCategory('');
  };
  const resetFilters = () => { setSort('popular'); setMin(''); setMax(''); setCity(''); if (kind === 'service') setKind('product'); };
  const clearAll = () => { setQ(''); setCategory(''); resetFilters(); };

  const title = activeCategory?.name ?? (search ? 'Search results' : kind === 'service' ? 'Services' : 'Market Items');
  const caption = market.loading && !market.items.length ? 'Searching…' : `${plural(market.total, 'result')}${search ? ` for “${search}”` : ''}${city ? ` in ${city}` : ''}`;

  const header = (
    <View>
      {params.fromHome ? <PageTitle title={activeCategory?.name ?? (search ? 'Search' : 'Browse the market')} back={back} /> : null}
      <SearchBar style={{ marginTop: 8 }} inputRef={inputRef} value={q} onChangeText={setQ} placeholder="Search products or services" onFilter={() => setSheet(true)} filterCount={filterCount} />
      <PillRow style={{ marginTop: 8 }} items={chips} active={category} onSelect={setCategory} />
      {!category && !search && shown.length ? (
        <>
          <SectionLabel title="Shop by category" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
            {shown.map((c, index) => <CategoryTile key={c.id} index={index} category={c} onPress={() => setCategory(c.slug)} />)}
          </ScrollView>
        </>
      ) : null}
      <SectionHead
        wrap title={title} caption={caption} style={{ marginBottom: 8 }}
        right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><SortPill value={sort} options={SORTS} onChange={setSort} /><ViewToggle mode={view} onChange={setView} /></View>}
      />
      {market.error && market.items.length ? <View style={{ paddingHorizontal: 12, marginBottom: 8 }}><Notice type="warning">{market.error}</Notice></View> : null}
    </View>
  );

  return (
    <Screen wide>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <AppBar go={go} tab={tab} />
        {market.loading && !market.items.length && !market.error ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>{header}<Spinner label="Loading the local market…" /></ScrollView>
        ) : market.error && !market.items.length ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>{header}<EmptyState icon="cloud-offline-outline" title="Could not load listings" text={market.error} action={<Button style={{ marginTop: 8 }} onPress={() => void market.reload()}>Try again</Button>} /></ScrollView>
        ) : (
          <FlatList
            key={`${view}-${cols}`} data={market.items} numColumns={cols} keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }} columnWrapperStyle={cols > 1 ? { gap: grid.gap, paddingHorizontal: grid.pad } : undefined}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListHeaderComponent={header}
            refreshControl={<RefreshControl refreshing={market.refreshing} onRefresh={() => void market.reload(true)} tintColor={colors.primary} />}
            onEndReached={() => void market.loadMore()} onEndReachedThreshold={0.4}
            renderItem={({ item }) => view === 'grid'
              ? <ProductCard listing={item} style={{ width: grid.cardWidth }} onPress={() => go('listing', { id: item.id })} />
              : <View style={cols > 1 ? { width: listWidth } : { paddingHorizontal: 12 }}><ProductRow listing={item} onPress={() => go('listing', { id: item.id })} /></View>}
            ListEmptyComponent={<EmptyState title="No matching listings" icon="search-outline" text={anyFilter ? 'Try a different search or remove some filters.' : 'Nothing is listed yet. Please check back soon.'} action={anyFilter ? <Button style={{ marginTop: 8 }} onPress={clearAll}>Clear search & filters</Button> : undefined} />}
            ListFooterComponent={market.loadingMore ? <Spinner label="Loading more…" /> : market.items.length ? <TrustBanner icon="shield-checkmark" title="Sokoni Quality Guarantee" text="Every seller is verified by Sokoni Hub before they can list products or take bookings." /> : null}
          />
        )}
        <Tabs active="browse" tab={tab} kind={kind} />
      </KeyboardAvoidingView>

      <Sheet visible={sheet} title="Filters" onClose={() => setSheet(false)}>
        <Text style={[sheet_.label, { color: colors.text }]}>Show</Text>
        <View style={sheet_.wrap}>
          <Chip selected={kind === ''} onPress={() => chooseKind('')}>Everything</Chip>
          <Chip selected={kind === 'product'} onPress={() => chooseKind('product')}>Products</Chip>
          <Chip selected={kind === 'service'} onPress={() => chooseKind('service')}>Services</Chip>
        </View>
        <Divider />
        <Text style={[sheet_.label, { color: colors.text }]}>Sort by</Text>
        {SORTS.map(({ value, label }) => (
          <Pressable key={value} onPress={() => setSort(value)} accessibilityRole="radio" accessibilityState={{ checked: sort === value }} style={sheet_.radio}>
            <Icon name={sort === value ? 'radio-button-on' : 'radio-button-off'} size={21} color={sort === value ? colors.primary : colors.muted} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{label}</Text>
          </Pressable>
        ))}
        <Divider />
        <Text style={[sheet_.label, { color: colors.text }]}>Price (QAR)</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Minimum" value={min} onChangeText={(v) => setMin(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" /></View>
          <View style={{ flex: 1 }}><Field label="Maximum" value={max} onChangeText={(v) => setMax(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="Any" /></View>
        </View>
        {cities.length > 0 ? (
          <>
            <Text style={[sheet_.label, { color: colors.text }]}>Seller city</Text>
            <View style={sheet_.wrap}>
              <Chip selected={!city} onPress={() => setCity('')}>All cities</Chip>
              {cities.map((name) => <Chip key={name} selected={city === name} onPress={() => setCity(city === name ? '' : name)}>{name}</Chip>)}
            </View>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={resetFilters}>Reset</Button>
          <Button style={{ flex: 1 }} onPress={() => setSheet(false)}>{`Show ${plural(market.total, 'result')}`}</Button>
        </View>
      </Sheet>
    </Screen>
  );
}

const sheet_ = StyleSheet.create({
  label: { fontSize: 13.5, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
});
