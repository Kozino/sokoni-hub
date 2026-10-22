/**
 * Saved Items. Saved listings live on the phone; on opening, they are refreshed against the live catalogue so
 * prices, stock and photos are current, and anything that has been removed is flagged instead of silently lingering.
 */
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, query } from '../api';
import { isOutOfStock, needsOption, useQuickAdd } from '../cards';
import { rememberImages } from '../data';
import { useFavourites } from '../favourites';
import { cleanCity, plural, ratingOf } from '../format';
import { Icon } from '../icons';
import { AppBar, Panel, PageTitle, Pill, PillRow, Price, RatingChip, Screen, SearchBar, SortPill, Tabs, Thumb, softShadow, useGrid, useTabHeight } from '../kit';
import type { NavProps } from '../nav';
import { useCart, useTheme } from '../providers';
import { useToast } from '../toast';
import type { Listing } from '../types';
import { Button, EmptyState, Notice, Text } from '../ui';

type SortKey = 'recent' | 'price_asc' | 'price_desc' | 'name';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently Added' }, { value: 'price_asc', label: 'Price: low to high' }, { value: 'price_desc', label: 'Price: high to low' }, { value: 'name', label: 'Name A–Z' },
];

export function Saved({ go, tab }: NavProps) {
  const { colors } = useTheme();
  const fav = useFavourites();
  const cart = useCart();
  const toast = useToast();
  const quickAdd = useQuickAdd();
  const grid = useGrid(150);
  const tabHeight = useTabHeight();
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Refresh saved snapshots from the public catalogue (read-only; does not count as a listing view).
  const fresh = useQuery({
    queryKey: ['saved-refresh', fav.items.length],
    enabled: fav.items.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const found: Listing[] = [];
      let total = 0;
      for (let page = 0; page < 3; page += 1) {
        const r = await api.get<{ listings: Listing[]; total: number }>(`/listings${query({ limit: 60, offset: page * 60, sort: 'newest' })}`);
        found.push(...r.listings); total = r.total;
        if (found.length >= total || r.listings.length < 60) break;
      }
      return { found, complete: found.length >= total };
    },
  });
  useEffect(() => {
    if (fresh.data) { fav.refresh(fresh.data.found); rememberImages(fresh.data.found); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh.data]);
  const gone = useMemo(() => {
    if (!fresh.data?.complete) return new Set<string>();
    const live = new Set(fresh.data.found.map((l) => l.id));
    return new Set(fav.items.filter((l) => !live.has(l.id)).map((l) => l.id));
  }, [fresh.data, fav.items]);

  const items = fav.items;
  const products = items.filter((l) => l.kind === 'product');
  const services = items.filter((l) => l.kind === 'service');
  const categoryNames = useMemo(() => [...new Set(items.map((l) => l.category_name).filter(Boolean) as string[])], [items]);
  const chips = [
    { key: 'all', label: `All (${items.length})` },
    ...(products.length && services.length ? [{ key: 'product', label: `Products (${products.length})` }, { key: 'service', label: `Services (${services.length})` }] : []),
    ...(categoryNames.length > 1 ? categoryNames.map((name) => ({ key: `cat:${name}`, label: `${name} (${items.filter((l) => l.category_name === name).length})` })) : []),
  ];
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = items.filter((l) => {
      if (filter === 'product' && l.kind !== 'product') return false;
      if (filter === 'service' && l.kind !== 'service') return false;
      if (filter.startsWith('cat:') && l.category_name !== filter.slice(4)) return false;
      return !q || l.title.toLowerCase().includes(q) || (l.business_name || '').toLowerCase().includes(q) || (l.category_name || '').toLowerCase().includes(q);
    });
    if (sort === 'price_asc') return [...list].sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === 'price_desc') return [...list].sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === 'name') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [items, filter, text, sort]);

  const movable = (l: Listing) => l.kind === 'product' && !isOutOfStock(l) && !needsOption(l) && !gone.has(l.id);
  const readyProducts = items.filter(movable);
  const readyServices = services.filter((l) => !gone.has(l.id));
  const allSelected = shown.length > 0 && shown.every((l) => picked.includes(l.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const moveToCart = (list: Listing[]) => {
    const ok = list.filter(movable);
    ok.forEach((l) => quickAddSilently(l));
    fav.remove(ok.map((l) => l.id));
    setPicked((p) => p.filter((id) => !ok.some((l) => l.id === id)));
    const skipped = list.length - ok.length;
    toast.show(ok.length ? `${plural(ok.length, 'item')} moved to your cart${skipped ? ` · ${skipped} need a size or are unavailable` : ''}` : 'Nothing could be moved: open the item to choose a size.', ok.length > 0);
  };
  /** Same as the card "+" button but without one toast per item. */
  const quickAddSilently = (l: Listing) => {
    cart.add({ listing_id: l.id, vendor_id: l.vendor_id, vendor_name: l.business_name || 'Local seller', title: l.title, price: Number(l.price), currency: l.currency, image: l.images?.[0], qty: 1, max: l.quantity ?? undefined, kind: l.kind, unit: l.unit });
  };

  const header = (
    <View>
      <PageTitle
        title="Saved Items" badge={items.length} subtitle={items.length ? 'Kept on this phone for quick access.' : undefined}
        right={items.length ? (
          <Pressable accessibilityRole="button" accessibilityState={{ selected: selecting }} onPress={() => { setSelecting((v) => !v); setPicked([]); }} style={[s.selectBtn, { backgroundColor: selecting ? colors.primary : colors.lav2 }]}>
            <Icon name="clipboard-check" solid={false} size={15} color={selecting ? colors.onPrimary : colors.text} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: selecting ? colors.onPrimary : colors.text }}>{selecting ? 'Done' : 'Select'}</Text>
          </Pressable>
        ) : null}
      />
      {gone.size ? (
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          <Notice type="warning">{plural(gone.size, 'saved item')} {gone.size === 1 ? 'is' : 'are'} no longer available. <Text onPress={() => fav.remove([...gone])} style={{ fontWeight: '700', color: colors.primary }}>Remove {gone.size === 1 ? 'it' : 'them'}</Text></Notice>
        </View>
      ) : null}
      {items.length ? (
        <>
          <SearchBar style={{ marginTop: 8 }} value={text} onChangeText={setText} placeholder="Search your saved items" />
          {chips.length > 1 ? <PillRow style={{ marginTop: 8 }} items={chips} active={filter} onSelect={setFilter} /> : null}
          <View style={[s.toolbar, { backgroundColor: colors.surface2 }]}>
            {selecting ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} onPress={() => setPicked(allSelected ? [] : shown.map((l) => l.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.box, { borderColor: allSelected ? colors.primary : colors.muted, backgroundColor: allSelected ? colors.primary : 'transparent' }]}>{allSelected ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}</View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Select all ({shown.length})</Text>
              </Pressable>
            ) : <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text2 }}>{plural(shown.length, 'item')}{text || filter !== 'all' ? ' found' : ' saved'}</Text>}
            <SortPill value={sort} options={SORTS} onChange={setSort} />
          </View>
        </>
      ) : null}
    </View>
  );

  const footer = items.length && !selecting && (readyProducts.length || readyServices.length) ? (
    <Panel style={s.summary}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={[s.live, { backgroundColor: colors.success }]} /><Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>All in-stock items</Text></View>
        <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.text2, marginTop: 2 }}>{plural(readyProducts.length, 'product')} • {plural(readyServices.length, 'service')} ready</Text>
      </View>
      {readyProducts.length ? <Button variant="deep" iconLeft="bag-handle" style={{ minHeight: 40, paddingHorizontal: 12 }} textStyle={{ fontSize: 12 }} onPress={() => moveToCart(readyProducts)}>Add all to cart</Button> : null}
    </Panel>
  ) : null;

  return (
    <Screen wide>
      <AppBar go={go} tab={tab} />
      <FlatList
        key={`saved-${grid.cols}`} data={shown} numColumns={grid.cols} keyExtractor={(l) => l.id} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: selecting ? tabHeight + 70 : 40 }} columnWrapperStyle={{ gap: grid.gap, paddingHorizontal: grid.pad }} ItemSeparatorComponent={() => <View style={{ height: grid.gap }} />}
        ListHeaderComponent={<>{header}<View style={{ height: 10 }} /></>}
        renderItem={({ item }) => (
          <SavedCard
            listing={item} width={grid.cardWidth} selecting={selecting} picked={picked.includes(item.id)} gone={gone.has(item.id)}
            onOpen={() => (selecting ? toggle(item.id) : go('listing', { id: item.id }))} onPick={() => toggle(item.id)}
            onRemove={() => { fav.remove([item.id]); toast.show('Removed from saved'); }}
            onAction={() => { if (item.kind === 'service' || needsOption(item)) go('listing', { id: item.id }); else { if (quickAdd(item)) fav.remove([item.id]); } }}
          />
        )}
        ListEmptyComponent={items.length ? (
          <EmptyState icon="search-outline" title="Nothing matches" text="Try another search or filter." action={<Button variant="secondary" style={{ marginTop: 8 }} onPress={() => { setText(''); setFilter('all'); }}>Clear filters</Button>} />
        ) : (
          <EmptyState icon="heart-outline" title="Nothing saved yet" text="Tap the heart on any product or service to keep it here for later." action={<Button style={{ marginTop: 8 }} onPress={() => tab('browse')}>Explore the market</Button>} />
        )}
        ListFooterComponent={footer}
      />
      {selecting ? (
        <View style={[s.actionBar, { bottom: tabHeight + 8, backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow, 2)]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, flex: 1 }}>{picked.length ? `${picked.length} selected` : 'Select items'}</Text>
          <Button variant="tonal" iconLeft="trash" disabled={!picked.length} style={s.barBtn} textStyle={{ fontSize: 12 }} onPress={() => { fav.remove(picked); toast.show(`${plural(picked.length, 'item')} removed`); setPicked([]); }}>Remove</Button>
          <Button variant="deep" iconLeft="bag-handle" disabled={!picked.length} style={s.barBtn} textStyle={{ fontSize: 12 }} onPress={() => moveToCart(items.filter((l) => picked.includes(l.id)))}>Move to cart</Button>
        </View>
      ) : null}
      <Tabs active="account" tab={tab} />
    </Screen>
  );
}

function SavedCard({ listing, width, selecting, picked, gone, onOpen, onPick, onRemove, onAction }: { listing: Listing; width: number; selecting: boolean; picked: boolean; gone: boolean; onOpen: () => void; onPick: () => void; onRemove: () => void; onAction: () => void }) {
  const { colors } = useTheme();
  const rating = ratingOf(listing);
  const service = listing.kind === 'service';
  const out = isOutOfStock(listing);
  const options = needsOption(listing);
  const label = gone ? 'Unavailable' : service ? 'Book slot' : out ? 'Out of stock' : options ? 'Choose size' : 'Move to cart';
  const disabled = gone || out;
  return (
    <Panel onPress={onOpen} label={listing.title} style={[{ width, padding: 6 }, picked && { borderColor: colors.primary, borderWidth: 2 }]}>
      <View style={s.image}>
        <Thumb uri={listing.images?.[0]} style={StyleSheet.absoluteFill} icon={service ? 'service-bell' : 'basket-outline'} iconSize={24} />
        {gone ? <View style={s.goneVeil}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>NO LONGER AVAILABLE</Text></View> : null}
        {service ? <View style={s.topLeft}><Pill tone="solidOrange" small upper>Service</Pill></View> : null}
        {selecting ? (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: picked }} onPress={onPick} style={[s.check, { backgroundColor: picked ? colors.primary : 'rgba(255,255,255,0.95)', borderColor: picked ? colors.primary : colors.muted }]}>{picked ? <Icon name="check" size={13} color={colors.onPrimary} /> : null}</Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Remove from saved" hitSlop={6} onPress={onRemove} style={s.heart}><Icon name="heart" solid size={14} color={colors.heart} /></Pressable>
        )}
        {rating && !gone ? <View style={s.bottomLeft}><RatingChip avg={rating.avg} /></View> : null}
      </View>
      <View style={{ paddingHorizontal: 2 }}>
        <Text numberOfLines={1} style={[s.title, { color: colors.text }]}>{listing.title}</Text>
        <Text numberOfLines={1} style={[s.vendor, { color: colors.brown }]}>{listing.business_name || cleanCity(listing.vendor_city) || 'Verified seller'}</Text>
        <View style={{ marginTop: 4, marginBottom: 6 }}>
          <Price value={listing.price} currency={listing.currency} size={18} from={listing.price_type === 'from' || options} color={service && listing.price_type === 'from' ? colors.brown : colors.primary} />
        </View>
        <Button variant={service ? 'gold' : 'primary'} iconLeft={service ? 'calendar' : out || gone ? undefined : 'cart'} disabled={disabled || selecting} style={s.action} textStyle={{ fontSize: 11 }} onPress={onAction}>{label}</Button>
      </View>
    </Panel>
  );
}

const s = StyleSheet.create({
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, borderRadius: 10, paddingHorizontal: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginHorizontal: 12, marginTop: 8, borderRadius: 12, paddingVertical: 5, paddingLeft: 10, paddingRight: 5 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1.3, borderRadius: 10, overflow: 'hidden' },
  topLeft: { position: 'absolute', top: 6, left: 6 },
  bottomLeft: { position: 'absolute', left: 5, bottom: 5 },
  heart: { position: 'absolute', top: 5, right: 5, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  goneVeil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17,24,39,0.62)', alignItems: 'center', justifyContent: 'center', padding: 8 },
  vendor: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  title: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  action: { minHeight: 30, borderRadius: 9, paddingHorizontal: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 12 },
  live: { width: 7, height: 7, borderRadius: 4 },
  actionBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 7, zIndex: 30 },
  barBtn: { minHeight: 34, paddingHorizontal: 10 },
});
