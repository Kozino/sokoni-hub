/**
 * My Cart. Items live on the phone; delivery fees, the free-delivery threshold and availability come from the
 * server quote (`POST /orders/quote`) so every figure on this screen is the one checkout will charge.
 */
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCheckoutDraft } from '../checkoutDraft';
import { cartLineKey, useCartQuote, useRememberedImage } from '../data';
import { money, num, plural } from '../format';
import { Icon } from '../icons';
import { AppBar, ModeCard, Panel, Price, QtyStepper, Screen, SectionHead, TAB_LIFT, Thumb, Tabs, softShadow } from '../kit';
import type { NavProps } from '../nav';
import { useCart, useTheme } from '../providers';
import type { CartItem } from '../types';
import { Button, EmptyState, Field, Notice, Sheet, Text } from '../ui';

export function Cart({ go, tab }: NavProps) {
  const { colors } = useTheme();
  const cart = useCart();
  const [draft, setDraft] = useCheckoutDraft();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const mode = draft.mode;

  // Both quotes are fetched so each delivery-mode card shows the real fee for that choice.
  const delivery = useCartQuote(cart.items, 'delivery');
  const pickup = useCartQuote(cart.items, 'pickup');
  const active = mode === 'delivery' ? delivery : pickup;
  const quote = active.quote;

  const sorted = useMemo(() => [...cart.items].sort((a, b) => a.vendor_name.localeCompare(b.vendor_name)), [cart.items]);
  const vendors = new Set(cart.items.map((i) => i.vendor_id)).size;
  const localSubtotal = cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currency = quote?.currency || cart.items[0]?.currency || 'QAR';

  // Free-delivery progress: the delivering seller who is closest to their free-delivery threshold.
  const nudge = useMemo(() => {
    if (mode !== 'delivery' || !quote) return null;
    const gated = quote.vendors.filter((v) => v.mode === 'delivery' && Number(v.free_delivery_over) > 0);
    if (!gated.length) return null;
    const open = gated.filter((v) => v.subtotal < Number(v.free_delivery_over));
    if (!open.length) return { done: true as const, vendor: gated[0].vendor_name, remaining: 0, pct: 100 };
    const next = open.sort((a, b) => (Number(a.free_delivery_over) - a.subtotal) - (Number(b.free_delivery_over) - b.subtotal))[0];
    const goal = Number(next.free_delivery_over);
    return { done: false as const, vendor: next.vendor_name, remaining: goal - next.subtotal, pct: Math.max(4, Math.min(100, Math.round((next.subtotal / goal) * 100))) };
  }, [mode, quote]);

  const pickupOnly = (delivery.quote?.vendors ?? []).filter((v) => v.mode === 'pickup' && !v.offers_delivery);
  const unavailable = (quote?.vendors ?? []).filter((v) => v.unavailable);
  const deliveryFee = delivery.quote?.delivery_fee;

  const clear = () => Alert.alert('Clear your cart?', 'This removes every item from your cart.', [
    { text: 'Keep items', style: 'cancel' },
    { text: 'Clear cart', style: 'destructive', onPress: () => cart.clear() },
  ]);

  if (!cart.items.length) {
    return (
      <Screen>
        <AppBar go={go} tab={tab} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState icon="bag-handle-outline" title="Your cart is empty" text="Add products from local sellers and they will wait for you here. Services are booked directly, not carted." action={<Button style={{ marginTop: 12, minWidth: 220 }} onPress={() => tab('browse')}>Explore the market</Button>} />
        </View>
        <Tabs active="cart" tab={tab} />
      </Screen>
    );
  }

  const total = quote?.total ?? localSubtotal;
  return (
    <Screen>
      <AppBar go={go} tab={tab} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Text style={[s.title, { color: colors.text }]}>My Cart</Text>
            <View style={[s.countPill, { backgroundColor: colors.lav2 }]}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>{plural(cart.count, 'item')}</Text></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Clear cart" hitSlop={8} onPress={clear} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="trash" solid={false} size={17} color={colors.text2} /><Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text2 }}>Clear</Text>
          </Pressable>
        </View>

        {nudge ? (
          <View style={[s.nudge, { backgroundColor: nudge.done ? colors.primarySoft : colors.orangeSoft, borderColor: nudge.done ? colors.primaryLine : colors.orangeLine }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={[s.nudgeIcon, { backgroundColor: nudge.done ? colors.primary : colors.orange }]}><Icon name="car" solid={false} size={18} color="#FFFFFF" /></View>
              <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 16, fontWeight: '600', color: colors.text }}>
                {nudge.done
                  ? <>You unlocked <Text style={{ fontWeight: '700', color: colors.primary }}>FREE delivery</Text> from {nudge.vendor}!</>
                  : <>Add <Text style={{ fontWeight: '700', color: colors.brown }}>{money(nudge.remaining, currency)}</Text> more from {nudge.vendor} for <Text style={{ fontWeight: '700', color: colors.primary }}>FREE delivery</Text></>}
              </Text>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.text2 }}>{nudge.pct}%</Text>
            </View>
            <View style={[s.track, { backgroundColor: colors.surface }]}><View style={[s.fill, { width: `${nudge.pct}%`, backgroundColor: nudge.done ? colors.primary : colors.orange }]} /></View>
          </View>
        ) : null}

        <View style={s.labelRow}>
          <Text style={[s.label, { color: colors.text2 }]}>ITEMS FROM VERIFIED SELLERS</Text>
          {vendors > 1 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="check-badge" size={16} color={colors.success} /><Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>{vendors} sellers</Text></View> : null}
        </View>

        <View style={{ gap: 8, paddingHorizontal: 12 }}>
          {sorted.map((item) => <CartLine key={cartLineKey(item)} item={item} />)}
        </View>

        {unavailable.map((v) => <View key={v.vendor_id} style={{ marginHorizontal: 12, marginTop: 12 }}><Notice type="warning">{v.vendor_name}: {v.unavailable}</Notice></View>)}
        {active.error && !quote ? <View style={{ marginHorizontal: 12, marginTop: 12, gap: 8 }}><Notice type="danger">{active.error}</Notice><Button variant="secondary" onPress={() => { void delivery.reload(); void pickup.reload(); }}>Check again</Button></View> : null}

        <SectionHead title="Delivery Mode" right={<Text style={{ color: colors.brown, fontSize: 10.5, fontWeight: '700' }}>Fees set by each seller</Text>} style={{ marginTop: 16 }} />
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
          <ModeCard selected={mode === 'delivery'} icon="car" title="Delivery" sub="Brought to your door" price={deliveryFee === undefined ? '…' : deliveryFee > 0 ? money(deliveryFee, currency) : 'Free'} onPress={() => setDraft({ mode: 'delivery' })} />
          <ModeCard selected={mode === 'pickup'} icon="storefront" title="Pick up" sub="Collect from the seller" price="Free" onPress={() => setDraft({ mode: 'pickup' })} />
        </View>
        {mode === 'delivery' && pickupOnly.length ? <View style={{ marginHorizontal: 12, marginTop: 12 }}><Notice>{pickupOnly.map((v) => v.vendor_name).join(', ')} {pickupOnly.length === 1 ? 'offers' : 'offer'} pick-up only, so that part of your order will be collected from the store.</Notice></View> : null}

        <Panel style={{ marginHorizontal: 12, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={[s.pinTile, { backgroundColor: colors.violetSoft }]}><Icon name="location" solid={false} size={18} color={colors.violet} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.eyebrow, { color: colors.text2 }]}>{mode === 'delivery' ? 'DELIVERING TO' : 'PICK UP FROM'}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>
                {mode === 'delivery' ? (draft.address ? (draft.city || 'Your address') : 'No address yet') : plural(new Set((pickup.quote?.vendors ?? []).map((v) => v.vendor_id)).size || vendors, 'seller')}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={mode === 'delivery' ? 'Change delivery address' : 'Review pick-up'} onPress={() => go('checkout')} style={[s.changePill, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{mode === 'delivery' && !draft.address ? 'Add' : 'Change'}</Text>
            </Pressable>
          </View>
          <View style={[s.addressBox, { backgroundColor: colors.surface2 }]}>
            <Icon name="building" solid={false} size={17} color={colors.text2} />
            <View style={{ flex: 1, gap: 4 }}>
              {mode === 'delivery' ? (
                <Text style={{ fontSize: 11.5, lineHeight: 16, color: draft.address ? colors.text : colors.text2 }}>{draft.address || 'You will pin your location and enter the address at checkout.'}</Text>
              ) : (pickup.quote?.vendors ?? []).length ? (
                (pickup.quote?.vendors ?? []).map((v) => <Text key={v.vendor_id} style={{ fontSize: 11.5, lineHeight: 16, color: colors.text }}><Text style={{ fontWeight: '700' }}>{v.vendor_name}: </Text>{v.pickup_address || 'address shared by the seller'}</Text>)
              ) : <Text style={{ fontSize: 11.5, color: colors.text2 }}>Pick-up addresses appear here.</Text>}
            </View>
          </View>
          <View style={s.noteRow}>
            <Icon name="document-text" solid={false} size={15} color={colors.text2} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: draft.note ? colors.text : colors.text2, fontWeight: draft.note ? '600' : '500' }}>{draft.note ? `“${draft.note}”` : 'No note for the seller'}</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setNoteText(draft.note); setNoteOpen(true); }}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.brown }}>{draft.note ? 'Edit note' : 'Add note'}</Text></Pressable>
          </View>
        </Panel>

        <Panel style={{ marginHorizontal: 12, marginTop: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={[s.sumIcon, { backgroundColor: colors.skySoft }]}><Icon name="receipt" solid={false} size={16} color={colors.sky} /></View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Order summary</Text>
          </View>
          <SummaryRow label="Subtotal" value={money(quote?.subtotal ?? localSubtotal, currency)} />
          <SummaryRow label={mode === 'delivery' ? 'Delivery fee' : 'Collection'} value={!quote ? '—' : quote.delivery_fee > 0 ? money(quote.delivery_fee, currency) : 'Free'} good={!!quote && quote.delivery_fee === 0} />
          <View style={[s.rule, { backgroundColor: colors.border }]} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Estimated total</Text>
              <Text style={{ fontSize: 10.5, fontWeight: '500', color: colors.text2, marginTop: 2, lineHeight: 14 }}>Pay in cash when you receive or collect. {vendors > 1 ? `Placed as ${vendors} orders, one per seller.` : 'Final prices are confirmed when you order.'}</Text>
            </View>
            <Price value={total} currency={currency} size={24} />
          </View>
          <View style={s.assure}>
            <View style={[s.assureItem, { backgroundColor: colors.primarySoft }]}><Icon name="shield-checkmark" solid={false} size={14} color={colors.primary} /><Text style={[s.assureText, { color: colors.primary }]}>Verified sellers</Text></View>
            <View style={[s.assureItem, { backgroundColor: colors.orangeSoft }]}><Icon name="cash" solid={false} size={14} color={colors.brown} /><Text style={[s.assureText, { color: colors.brown }]}>Pay on delivery</Text></View>
          </View>
        </Panel>
      </ScrollView>

      <View style={[s.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: TAB_LIFT + 8 }, softShadow(colors.shadow)]}>
        <View>
          <Text style={[s.eyebrow, { color: colors.text2 }]}>TOTAL</Text>
          <Price value={total} currency={currency} size={21} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.brown }}>Cash on delivery</Text>
        </View>
        <Button variant="deep" icon="arrow-forward" style={{ flex: 1, minHeight: 44 }} onPress={() => go('checkout')}>Proceed to checkout</Button>
      </View>
      <Tabs active="cart" tab={tab} />

      <Sheet visible={noteOpen} title="Note for the seller" onClose={() => setNoteOpen(false)}>
        <Field label="" value={noteText} onChangeText={setNoteText} multiline maxLength={500} placeholder="e.g. Leave at the door, call when you arrive" style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }} />
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: -6, marginBottom: 14 }}>{noteText.length}/500 · Sent with your order at checkout.</Text>
        <Button onPress={() => { setDraft({ note: noteText.trim() }); setNoteOpen(false); }}>Save note</Button>
        {draft.note ? <Button variant="ghost" style={{ marginTop: 6 }} onPress={() => { setDraft({ note: '' }); setNoteOpen(false); }}>Remove note</Button> : null}
      </Sheet>
    </Screen>
  );
}

function CartLine({ item }: { item: CartItem }) {
  const { colors } = useTheme();
  const cart = useCart();
  const remembered = useRememberedImage(item.listing_id);
  const photo = item.image || remembered;
  const tag = item.option || (item.unit ? `per ${item.unit}` : '');
  return (
    <Panel style={{ flexDirection: 'row', gap: 10, padding: 8 }}>
      <View style={s.lineImage}>
        <Thumb uri={photo} style={StyleSheet.absoluteFill} icon="basket-outline" iconSize={24} />
        {tag ? <View style={s.lineTag}><Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>{tag}</Text></View> : null}
      </View>
      <View style={{ flex: 1, justifyContent: 'space-between', gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.vendor, { color: colors.brown }]}>{item.vendor_name.toUpperCase()}</Text>
            <Text numberOfLines={2} style={[s.lineTitle, { color: colors.text }]}>{item.title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`} hitSlop={10} onPress={() => cart.remove(item.listing_id, item.option)} style={[s.trash, { backgroundColor: colors.roseSoft }]}><Icon name="trash" solid={false} size={15} color={colors.rose} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <View>
            <Price value={item.price * item.qty} currency={item.currency} size={18} />
            {item.qty > 1 ? <Text style={{ fontSize: 10, fontWeight: '600', color: colors.text2 }}>({num(item.price)} ea)</Text> : null}
          </View>
          <QtyStepper qty={item.qty} max={item.max} label={item.title} onMinus={() => cart.setQty(item.listing_id, item.qty - 1, item.option)} onPlus={() => cart.setQty(item.listing_id, item.qty + 1, item.option)} />
        </View>
      </View>
    </Panel>
  );
}

function SummaryRow({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: colors.text2, fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '700', color: good ? colors.primary : colors.text }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4 },
  countPill: { borderRadius: 9, paddingHorizontal: 8, height: 20, alignItems: 'center', justifyContent: 'center' },
  nudge: { marginHorizontal: 12, marginTop: 10, borderRadius: 14, borderWidth: 1, padding: 10 },
  nudgeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, marginTop: 9, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, marginTop: 14, marginBottom: 8 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  eyebrow: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.9 },
  lineImage: { width: 72, height: 78, borderRadius: 11, overflow: 'hidden' },
  lineTag: { position: 'absolute', left: 4, bottom: 4, maxWidth: 64, backgroundColor: 'rgba(17,24,39,0.78)', borderRadius: 6, paddingHorizontal: 6, height: 16, justifyContent: 'center' },
  vendor: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.8 },
  lineTitle: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1, lineHeight: 16, marginTop: 1 },
  trash: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pinTile: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sumIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  changePill: { height: 28, borderRadius: 14, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  addressBox: { flexDirection: 'row', gap: 9, borderRadius: 11, padding: 10, marginTop: 9 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2, marginBottom: 10 },
  assure: { flexDirection: 'row', gap: 8, marginTop: 10 },
  assureItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, height: 30 },
  assureText: { fontSize: 10.5, fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
});
