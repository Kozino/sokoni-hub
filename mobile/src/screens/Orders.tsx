/**
 * My Orders. The list comes from `GET /orders/mine`; each card is enriched on demand with the order's items,
 * seller logo and WhatsApp (`GET /orders/track`), so nothing on a card is invented. Past orders can be re-ordered.
 */
import { useMemo, useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { api } from '../api';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, isActiveOrder, rememberImages, useMyOrders, useOrderDetail, useRememberedImage, useVendorDirectory } from '../data';
import { dayTime, money, placedLabel, plural, relativeDay, time12, whatsappUrl } from '../format';
import { Icon, type IconName } from '../icons';
import { AppBar, Avatar, Panel, PageTitle, PillRow, Price, RoundButton, Screen, Skeleton, Tabs, Thumb, TrustBanner, orderLook, StatusPill, toneColors, useColumnWidth } from '../kit';
import type { NavProps } from '../nav';
import { useAuth, useCart, useTheme } from '../providers';
import { shareReceiptPdf } from '../receiptShare';
import { useToast } from '../toast';
import type { Listing, Order } from '../types';
import { Button, EmptyState, Field, Sheet, Spinner, Text } from '../ui';
import { GuestGate } from './GuestGate';

type Filter = 'all' | 'active' | 'delivered' | 'cancelled';

export function Orders({ go, back, tab }: NavProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const orders = useMyOrders();
  const [filter, setFilter] = useState<Filter>('all');
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState('');
  const [detail, setDetail] = useState<Order | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const cart = useCart();
  const toast = useToast();

  const all = useMemo(() => orders.data ?? [], [orders.data]);
  const counts = useMemo(() => ({
    all: all.length,
    active: all.filter((o) => isActiveOrder(o.status)).length,
    delivered: all.filter((o) => o.status === 'delivered').length,
    cancelled: all.filter((o) => o.status === 'cancelled').length,
  }), [all]);
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    return all.filter((o) => {
      if (filter === 'active' && !isActiveOrder(o.status)) return false;
      if (filter === 'delivered' && o.status !== 'delivered') return false;
      if (filter === 'cancelled' && o.status !== 'cancelled') return false;
      return !q || o.code.toLowerCase().includes(q) || (o.business_name || '').toLowerCase().includes(q);
    });
  }, [all, filter, text]);

  if (!user) return <GuestGate heading="My orders" title="Sign in to see your orders" text="Your order history and delivery status are kept safely in your buyer account." go={go} back={back} />;

  /** Put a past order's items back in the cart, using today's prices and stock (each listing is re-read from the API). */
  const reorder = async (order: Order) => {
    setReordering(order.id);
    try {
      const tracked = await api.get<{ order: Order }>(`/orders/track?code=${encodeURIComponent(order.code)}&phone=${encodeURIComponent(order.contact_phone)}`);
      const skipped: string[] = [];
      let added = 0;
      for (const line of tracked.order.items ?? []) {
        if (!line.listing_id) { skipped.push(line.title); continue; }
        try {
          const { listing } = await api.get<{ listing: Listing }>(`/listings/${line.listing_id}`);
          const out = listing.quantity !== null && listing.quantity !== undefined && listing.quantity <= 0;
          const option = listing.options?.find((o) => line.title.endsWith(`(${o.name})`));
          if (listing.status !== 'active' || listing.kind !== 'product' || out || (listing.options?.length && !option)) { skipped.push(line.title); continue; }
          const stock = listing.quantity ?? undefined;
          cart.add({
            listing_id: listing.id, vendor_id: listing.vendor_id, vendor_name: listing.business_name || order.business_name || 'Seller', title: listing.title,
            price: Number(option?.price || listing.price), currency: listing.currency, image: listing.images?.[0], qty: Math.min(Number(line.qty) || 1, stock ?? (Number(line.qty) || 1)),
            max: stock, kind: listing.kind, option: option?.name, unit: listing.unit,
          });
          rememberImages([listing]);
          added += 1;
        } catch { skipped.push(line.title); }
      }
      if (!added) { Alert.alert('Nothing to reorder', skipped.length ? `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} no longer available.` : 'These items are no longer available.'); return; }
      toast.show(`${plural(added, 'item')} added to your cart`, true);
      if (skipped.length) Alert.alert('Some items were skipped', `${skipped.join(', ')} ${skipped.length === 1 ? 'is' : 'are'} no longer available.`);
      tab('cart');
    } catch (e) { Alert.alert('Could not reorder', errorMessage(e)); }
    finally { setReordering(null); }
  };

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: `All Orders (${counts.all})` },
    { key: 'active', label: `Active (${counts.active})` },
    { key: 'delivered', label: `Delivered (${counts.delivered})` },
    ...(counts.cancelled ? [{ key: 'cancelled' as Filter, label: `Cancelled (${counts.cancelled})` }] : []),
  ];

  const header = (
    <View>
      <PageTitle title="My Orders" back={back} subtitle={`${plural(counts.all, 'order')} in total`} right={<RoundButton icon="search" label="Search orders" onPress={() => { setSearching((v) => !v); if (searching) setText(''); }} />} />
      {searching ? <View style={{ paddingHorizontal: 12, marginTop: 9 }}><Field label="" value={text} onChangeText={setText} placeholder="Search by order code or seller" autoFocus style={{ marginBottom: -8 }} /></View> : null}
      <PillRow style={{ marginTop: 12, marginBottom: 12 }} items={chips.map((c) => ({ key: c.key, label: c.label }))} active={filter} onSelect={(k) => setFilter(k as Filter)} />
    </View>
  );

  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      {orders.isLoading ? (
        <FlatList data={[]} renderItem={null} ListHeaderComponent={header} ListFooterComponent={<Spinner label="Loading your orders…" />} />
      ) : (
        <FlatList
          data={shown} keyExtractor={(o) => o.id} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 44 }} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 12 }}>
              <OrderCard order={item} reordering={reordering === item.id} onDetails={() => setDetail(item)} onTrack={() => go('track', { code: item.code, phone: item.contact_phone })} onReorder={() => void reorder(item)} onReview={(listingId) => go('listing', { id: listingId, writeReview: true })} />
            </View>
          )}
          ListEmptyComponent={orders.error ? (
            <EmptyState icon="cloud-offline-outline" title="Could not load your orders" text={errorMessage(orders.error)} action={<Button style={{ marginTop: 8 }} onPress={() => void orders.refetch()}>Try again</Button>} />
          ) : all.length ? (
            <EmptyState icon="search-outline" title="No matching orders" text="Try another filter or search." action={<Button variant="secondary" style={{ marginTop: 8 }} onPress={() => { setFilter('all'); setText(''); }}>Show all orders</Button>} />
          ) : (
            <EmptyState icon="bag-handle-outline" title="No orders yet" text="When you buy from a local seller, you can follow every step of your order here." action={<Button style={{ marginTop: 8 }} onPress={() => tab('browse')}>Start shopping</Button>} />
          )}
          ListFooterComponent={all.length ? (
            <View>
              <TrustBanner icon="shield-checkmark" title="Order with confidence" text="Pay in cash on delivery. If something is not right, report it from the order page before the confirmation window closes." />
              <View style={{ alignItems: 'center', marginTop: 11 }}><Button variant="ghost" onPress={() => go('track')}>Track an order with a code</Button></View>
            </View>
          ) : null}
        />
      )}
      <Tabs active="none" tab={tab} />
      <OrderSheet order={detail} onClose={() => setDetail(null)} onTrack={(o) => { setDetail(null); go('track', { code: o.code, phone: o.contact_phone }); }} />
    </Screen>
  );
}

/* ------------------------------------------------------------------------------ order card */
function OrderCard({ order, reordering, onDetails, onTrack, onReorder, onReview }: { order: Order; reordering: boolean; onDetails: () => void; onTrack: () => void; onReorder: () => void; onReview: (listingId: string) => void }) {
  const { colors } = useTheme();
  const info = useOrderDetail(order);
  const directory = useVendorDirectory();
  const vendor = directory.byId.get(order.vendor_id);
  const items = info.data?.items ?? [];
  const count = items.reduce((n, i) => n + Number(i.qty || 0), 0);
  const pickup = order.fulfilment_mode === 'pickup';
  const status = order.status;
  const active = isActiveOrder(status);
  const look = orderLook(status, { pickup, disputed: !!order.disputed_at });
  const delivered = status === 'delivered';
  const awaiting = status === 'delivered_pending_verification' && !order.disputed_at;
  const first = items[0];
  const reviewable = items.find((i) => i.listing_id)?.listing_id;
  const when = delivered && order.delivered_at ? `${pickup ? 'Collected' : 'Delivered'} ${relativeDay(order.delivered_at)} · ${time12(order.delivered_at)}` : placedLabel(order.created_at);
  const live = ['dispatched_to_driver', 'driver_arrived', 'out_for_delivery'].includes(status);
  // Phones narrower than ~380 dp: drop button icons and the pill icon so the order code and the actions are never cut off.
  const narrow = useColumnWidth() < 380;
  const btn = narrow ? s.smallBtnNarrow : s.smallBtn;
  const icon = (name: IconName) => (narrow ? undefined : name);

  return (
    <Panel accent={toneColors(colors, look.tone).fg} style={{ padding: 12, paddingLeft: 15 }}>
      <View style={s.cardTop}>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: live ? 182 : 168 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text numberOfLines={1} style={[s.code, { color: colors.text }]}>#{order.code}</Text>
            {live ? <View style={[s.liveDot, { backgroundColor: colors.primary }]} /> : null}
          </View>
          <Text style={[s.when, { color: colors.text2 }]}>{when}</Text>
        </View>
        <StatusPill look={look} compact={narrow} />
      </View>

      <View style={[s.box, { backgroundColor: colors.surface2 }]}>
        <View style={s.boxHead}>
          {delivered ? <Icon name="location" solid={false} size={18} color={colors.primary} /> : <Avatar name={order.business_name} uri={vendor?.logo_url} size={36} square tone="mint" />}
          <Text numberOfLines={1} style={[s.vendor, { color: colors.text }]}>{delivered ? (pickup ? `Collected from ${order.business_name || 'the store'}` : `Delivered to ${order.city || 'your address'}`) : order.business_name || 'Seller'}</Text>
          <Text style={[s.count, { color: colors.text2 }]}>{info.isLoading ? '' : count ? plural(count, 'item') : ''}</Text>
        </View>
        {info.isLoading ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 9 }}><Skeleton width={62} height={62} radius={12} /><View style={{ flex: 1, gap: 8, justifyContent: 'center' }}><Skeleton height={14} /><Skeleton width="60%" height={12} /></View></View>
        ) : first ? (
          <View style={s.boxItems}>
            <View style={{ flexDirection: 'row', gap: 8 }}>{items.slice(0, 3).map((line) => <ItemThumb key={line.id ?? line.title} listingId={line.listing_id} />)}</View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={[s.itemTitle, { color: colors.text }]}>{first.title}</Text>
              <Text numberOfLines={1} style={[s.itemSub, { color: colors.text2 }]}>{pickup ? 'Pick up from the store' : 'Home delivery'}{items.length > 1 ? ` · +${items.length - 1} more` : ''}</Text>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: colors.text2, marginTop: 8 }}>{pickup ? 'Pick up from the store' : 'Home delivery'}</Text>
        )}
      </View>

      <View style={s.cardFoot}>
        <View>
          <Text style={[s.totalLabel, { color: colors.text2 }]}>Order Total</Text>
          <Price value={order.total} currency={order.currency} size={24} color={colors.text} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          {delivered ? (
            <>
              {reviewable ? <Button variant="tonal" iconLeft={icon('star')} style={btn} textStyle={s.smallText} onPress={() => onReview(reviewable)}>Review</Button> : <Button variant="tonal" style={btn} textStyle={s.smallText} onPress={onDetails}>Details</Button>}
              <Button variant="mint" iconLeft={icon('refresh')} loading={reordering} style={btn} textStyle={s.smallText} onPress={onReorder}>Reorder</Button>
            </>
          ) : status === 'cancelled' ? (
            <>
              <Button variant="tonal" style={btn} textStyle={s.smallText} onPress={onDetails}>Details</Button>
              <Button variant="mint" iconLeft={icon('refresh')} loading={reordering} style={btn} textStyle={s.smallText} onPress={onReorder}>Reorder</Button>
            </>
          ) : (
            <>
              <Button variant="tonal" style={btn} textStyle={s.smallText} onPress={onDetails}>Details</Button>
              <Button variant="deep" iconLeft={icon(awaiting ? 'checkmark-circle' : 'navigate')} style={[btn, { flex: 1 }]} textStyle={s.smallText} onPress={onTrack}>{awaiting ? (narrow ? 'Confirm' : 'Confirm receipt') : active ? 'Track Order' : 'View'}</Button>
            </>
          )}
        </View>
      </View>
    </Panel>
  );
}

function ItemThumb({ listingId }: { listingId?: string | null }) {
  const uri = useRememberedImage(listingId);
  return <Thumb uri={uri} style={s.thumb} icon="basket-outline" iconSize={20} />;
}

/* ------------------------------------------------------------------------------- details */
function OrderSheet({ order, onClose, onTrack }: { order: Order | null; onClose: () => void; onTrack: (o: Order) => void }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const info = useOrderDetail(order, !!order);
  const full = info.data ?? order;
  const [sharing, setSharing] = useState(false);
  if (!order || !full) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const pickup = full.fulfilment_mode === 'pickup';
  const look = orderLook(full.status, { pickup, disputed: !!full.disputed_at });
  const paid = full.payment_status === 'paid';
  const wa = whatsappUrl(info.data?.whatsapp, `Hi, I'm asking about my Sokoni Hub order #${full.code}.`);
  /** Builds a PDF receipt with every order detail and opens the share sheet. */
  const share = async () => {
    setSharing(true);
    try {
      await shareReceiptPdf({
        order: full, items: info.data?.items ?? [], sellerName: full.business_name || 'Seller', sellerPhone: info.data?.whatsapp ?? full.whatsapp,
        buyerName: full.contact_name, buyerPhone: full.contact_phone,
      });
    } catch (e) { Alert.alert('Could not create the receipt', errorMessage(e)); }
    finally { setSharing(false); }
  };
  return (
    <Sheet visible title={`Order #${full.code}`} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 11 }}>
        <Text style={{ fontSize: 12, color: colors.text2, fontWeight: '600', flex: 1 }}>{dayTime(full.created_at)} · {full.business_name}</Text>
        <StatusPill look={look} />
      </View>
      {info.isLoading ? <Spinner label="Loading items…" /> : (
        <View style={[s.sheetBox, { backgroundColor: colors.surface2 }]}>
          {(info.data?.items ?? []).map((line) => (
            <View key={line.id ?? line.title} style={s.sheetLine}>
              <ItemThumb listingId={line.listing_id} />
              <View style={{ flex: 1 }}><Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{line.title}</Text><Text style={{ fontSize: 11.5, color: colors.text2, fontWeight: '600' }}>{line.qty} × {money(line.unit_price ?? 0, full.currency)}{line.unit ? ` / ${line.unit}` : ''}</Text></View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{money(line.line_total, full.currency)}</Text>
            </View>
          ))}
          {!(info.data?.items ?? []).length ? <Text style={{ fontSize: 12, color: colors.text2 }}>Item details are not available right now.</Text> : null}
        </View>
      )}
      <View style={{ marginTop: 11, gap: 9 }}>
        <Row label="Subtotal" value={money(full.subtotal, full.currency)} />
        <Row label={pickup ? 'Collection' : 'Delivery'} value={Number(full.delivery_fee) > 0 ? money(full.delivery_fee, full.currency) : 'Free'} />
        <Row label="Total" value={money(full.total, full.currency)} bold />
        <Row label="Payment" value={`Cash on delivery · ${paid ? 'Paid' : full.status === 'cancelled' ? 'Not charged' : pickup ? 'Pay at the store' : 'Pay the rider'}`} />
        <Row label={pickup ? 'Pick up' : 'Deliver to'} value={pickup ? 'Collect from the store' : [full.delivery_address, full.city].filter(Boolean).join(', ')} />
        {full.note ? <Row label="Your note" value={`“${full.note}”`} /> : null}
        {full.receipt_number ? <Row label="Receipt no." value={full.receipt_number} /> : null}
      </View>
      <View style={{ gap: 8, marginTop: 16 }}>
        {isActiveOrder(full.status) || full.status === 'delivered_pending_verification' ? <Button variant="deep" iconLeft="navigate" onPress={() => onTrack(full)}>Track this order</Button> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {wa ? <Button variant="mint" iconLeft="logo-whatsapp" style={{ flex: 1 }} onPress={() => void Linking.openURL(wa)}>Contact seller</Button> : null}
          <Button variant="tonal" iconLeft="document-check" loading={sharing} style={{ flex: 1 }} onPress={() => void share()}>Share receipt</Button>
        </View>
        <Button variant="ghost" onPress={() => { void queryClient.invalidateQueries({ queryKey: ['order-detail', full.code] }); onClose(); }}>Close</Button>
      </View>
    </Sheet>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 11 }}>
      <Text style={{ fontSize: 12.5, color: colors.text2, fontWeight: '500' }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontSize: bold ? 14.5 : 12, color: colors.text, fontWeight: bold ? '700' : '600' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cardTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: 8, rowGap: 8 },
  code: { fontSize: 16.5, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  when: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  box: { borderRadius: 16, padding: 11, marginTop: 11 },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vendor: { flex: 1, fontSize: 13, fontWeight: '700' },
  count: { fontSize: 11.5, fontWeight: '600' },
  boxItems: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 },
  thumb: { width: 48, height: 48, borderRadius: 13 },
  itemTitle: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  itemSub: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, marginTop: 12 },
  totalLabel: { fontSize: 11.5, fontWeight: '600' },
  smallBtn: { minHeight: 40, paddingHorizontal: 12, borderRadius: 13 },
  smallBtnNarrow: { minHeight: 39, paddingHorizontal: 9, borderRadius: 12 },
  smallText: { fontSize: 12.5 },
  sheetBox: { borderRadius: 14, padding: 9, gap: 9 },
  sheetLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
});
