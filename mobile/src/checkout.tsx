import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useCheckoutDraft } from './checkoutDraft';
import { cartLineKey, errorMessage, quoteItems, useCartQuote, useRememberedImage } from './data';
import { DeliveryPin, type DeliveryPinValue } from './DeliveryPin';
import { money, plural } from './format';
import { Icon, type IconName } from './icons';
import { ModeCard, Panel, Price, Screen, Thumb, accentAt } from './kit';
import { OrderPlaced } from './orderPlaced';
import { useAuth, useCart, useTheme } from './providers';
import { ApiError, api } from './api';
import type { CartItem, Order, PaymentMethod } from './types';
import { BottomBar, Button, EmptyState, Field, Header, Notice, Spinner, Text } from './ui';

type Placed = { orders: Order[] };
type Nav = { go: (screen: any, params?: any) => void; back: () => void; tab: (screen: any, params?: any) => void };

export function Checkout({ go, back, tab }: Nav) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const cart = useCart();
  const [draft, setDraft] = useCheckoutDraft();
  const mode = draft.mode;
  const { quote, error: quoteError, reload: loadQuote } = useCartQuote(cart.items, mode);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [touched, setTouched] = useState(false);
  // Errors show inline with a Retry button instead of a blocking popup.
  const [banner, setBanner] = useState('');
  // Customer-confirmed delivery point. Required whenever any seller delivers. Pre-filled from the last order.
  const [pin, setPin] = useState<DeliveryPinValue | null>(draft.lat !== null && draft.lng !== null ? { latitude: draft.lat, longitude: draft.lng } : null);
  const reusedPin = useRef(pin !== null);
  // Idempotency: an identical retry (double-tap, flaky network) reuses its key and can never create
  // two orders; any change to the order body gets a fresh key.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const finished = useRef(false);
  const [form, setForm] = useState({
    contact_name: user?.full_name || '', contact_phone: user?.phone || '',
    delivery_address: draft.address, city: draft.city || 'Doha', country: draft.country || 'Qatar', payment_method: 'cash_on_delivery' as PaymentMethod, note: draft.note,
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value }));

  // Remember what the buyer typed so the Cart and the next checkout can show it.
  useEffect(() => {
    if (finished.current) return undefined;
    const t = setTimeout(() => setDraft({ address: form.delivery_address, city: form.city, country: form.country, note: form.note, lat: pin?.latitude ?? null, lng: pin?.longitude ?? null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.delivery_address, form.city, form.country, form.note, pin]);

  useEffect(() => {
    if (finished.current) return; // the cart is cleared on success; do not navigate away from the confirmation
    if (!cart.items.length) back();
  }, [cart.items.length, back]);

  // A store may only offer one mode; the quote tells us what will really happen per seller.
  const needsAddress = !quote || quote.vendors.some((vendor) => vendor.mode === 'delivery');
  const allPickup = !!quote && quote.vendors.every((vendor) => vendor.mode === 'pickup');

  const errors = {
    contact_name: form.contact_name.trim().length < 2 ? 'Enter your full name' : '',
    contact_phone: form.contact_phone.replace(/\D/g, '').length < 7 ? 'Enter a valid phone number' : '',
    delivery_address: needsAddress && form.delivery_address.trim().length < 5 ? 'Enter your building, street and area' : '',
    city: needsAddress && form.city.trim().length < 2 ? 'Enter your city' : '',
    delivery_pin: needsAddress && !pin ? 'Confirm your delivery location on the map' : '',
  };
  const valid = !Object.values(errors).some(Boolean);

  const order = async () => {
    if (!user) return go('login');
    setTouched(true);
    setBanner('');
    if (!valid) return setBanner('Please fix the highlighted fields.');
    if (!quote) return setBanner(quoteError || 'Wait for the order total to load, then try again.');
    setBusy(true);
    try {
      const body = {
        // `option` must travel with the item: the API rejects a listing that has sizes unless one is chosen.
        items: quoteItems(cart.items),
        fulfilment_mode: mode,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        // The API always requires an address; collection orders carry a clear placeholder.
        delivery_address: needsAddress ? form.delivery_address.trim() : 'Collection from store',
        city: form.city.trim() || 'Doha',
        country: form.country.trim() || 'Qatar',
        payment_method: form.payment_method,
        note: form.note.trim() || undefined,
        // The pin is sent only when an address is needed; collection orders have no delivery point.
        ...(needsAddress && pin ? { delivery_lat: pin.latitude, delivery_lng: pin.longitude } : {}),
      };
      const key = JSON.stringify(body);
      if (!attempt.current || attempt.current.key !== key) attempt.current = { key, id: randomUUID() };
      const result = await api.post<Placed>('/orders/checkout', { request_id: attempt.current.id, ...body });
      finished.current = true;
      setDraft({ note: '', address: needsAddress ? form.delivery_address.trim() : draft.address, city: form.city.trim() || draft.city, lat: pin?.latitude ?? draft.lat, lng: pin?.longitude ?? draft.lng });
      cart.clear();
      setPlaced(result);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 400)) void loadQuote();
      setBanner(errorMessage(e));
    } finally { setBusy(false); }
  };

  /* ------------------------------------------------------------------------- confirmation */
  if (placed) return <OrderPlaced orders={placed.orders} name={form.contact_name} phone={form.contact_phone} go={go} tab={tab} />;

  const fieldError = (key: keyof typeof errors) => (touched && errors[key]) || undefined;
  const vendors = new Set(cart.items.map((i) => i.vendor_id)).size;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Header title="Checkout" back={back} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {!user ? <View style={{ marginBottom: 8 }}><Notice type="warning">Sign in to place your order — your cart is saved on this phone.</Notice></View> : null}
          {banner ? <View style={{ gap: 8, marginBottom: 8 }}><Notice type="danger">{banner}</Notice><Button variant="secondary" onPress={() => void order()} loading={busy}>Try again</Button></View> : null}

          <Section icon="bag-handle" accent={0} title="Your items" right={plural(cart.count, 'item')} flush>
            {cart.items.map((item, index) => <Line key={cartLineKey(item)} item={item} divider={index > 0} />)}
          </Section>

          <Text style={[s.heading, { color: colors.text }]}>How do you want it?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ModeCard selected={mode === 'delivery'} icon="car" title="Delivery" sub="Brought to your door" price={quote && mode === 'delivery' ? (quote.delivery_fee > 0 ? money(quote.delivery_fee, quote.currency) : 'Free') : '—'} onPress={() => setDraft({ mode: 'delivery' })} />
            <ModeCard selected={mode === 'pickup'} icon="storefront" title="Pick up" sub="Collect from the seller" price="Free" onPress={() => setDraft({ mode: 'pickup' })} />
          </View>
          {quote?.vendors.map((vendor) => vendor.unavailable ? <View key={vendor.vendor_id} style={{ marginTop: 8 }}><Notice type="warning">{vendor.vendor_name}: {vendor.unavailable}</Notice></View> : null)}
          {quote?.vendors.filter((vendor) => vendor.mode === 'pickup' && vendor.pickup_address).map((vendor) => <View key={`p-${vendor.vendor_id}`} style={{ marginTop: 8 }}><Notice>Collect from {vendor.vendor_name}: {vendor.pickup_address}</Notice></View>)}

          <Section icon="person" accent={2} title="Contact">
            <Field label="Full name" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" error={fieldError('contact_name')} />
            <Field label="Phone number" value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+974…" error={fieldError('contact_phone')} />
          </Section>

          {needsAddress ? (
            <Section icon="location" accent={4} title="Delivery location">
              {reusedPin.current && pin ? <View style={{ marginBottom: 8 }}><Notice>Using your last delivery location. Move the pin if you are somewhere else today.</Notice></View> : null}
              <DeliveryPin
                value={pin}
                error={fieldError('delivery_pin')}
                onConfirm={(confirmed, suggestion) => {
                  setPin(confirmed);
                  // Fill the address from the map only if the customer has not typed one yet.
                  if (suggestion) setForm((old) => (old.delivery_address.trim() ? old : { ...old, delivery_address: suggestion }));
                }}
              />
              <View style={{ height: 10 }} />
              <Field label="Delivery address" value={form.delivery_address} onChangeText={set('delivery_address')} multiline placeholder="Building, street, zone" error={fieldError('delivery_address')} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }} />
              <View style={s.pair}>
                <View style={{ flex: 1 }}><Field label="City" value={form.city} onChangeText={set('city')} error={fieldError('city')} /></View>
                <View style={{ flex: 1 }}><Field label="Country" value={form.country} onChangeText={set('country')} /></View>
              </View>
            </Section>
          ) : null}

          <Section icon="cash" accent={1} title="Payment">
            <View style={[s.payment, { borderColor: colors.orange, backgroundColor: colors.orangeSoft }]}>
              <View style={[s.payIcon, { backgroundColor: colors.orange }]}><Icon name="cash" solid={false} size={18} color="#FFFFFF" /></View>
              <View style={{ flex: 1 }}><Text style={[s.payTitle, { color: colors.text }]}>Cash on delivery</Text><Text style={[s.payHint, { color: colors.text2 }]}>Pay the seller when you receive or collect your order. Nothing is charged in the app.</Text></View>
              <Icon name="radio-button-on" size={20} color={colors.orange} />
            </View>
            <View style={{ height: 10 }} />
            <Field label="Note for the seller (optional)" value={form.note} onChangeText={set('note')} multiline maxLength={500} placeholder="Any helpful instructions" style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }} />
          </Section>

          <Section icon="receipt" accent={3} title="Summary">
            {quote ? <>
              {quote.vendors.map((vendor) => <View key={vendor.vendor_id} style={[s.between, { marginBottom: 6 }]}>
                <Text numberOfLines={1} style={[s.meta, { color: colors.text2, flex: 1, marginTop: 0 }]}>{vendor.vendor_name}</Text>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text }}>{money(vendor.subtotal, vendor.currency)}</Text>
              </View>)}
              <View style={[s.rule, { backgroundColor: colors.border }]} />
              <View style={[s.between, { marginTop: 6 }]}><Text style={[s.sumLabel, { color: colors.text2 }]}>Subtotal</Text><Text style={[s.sumValue, { color: colors.text }]}>{money(quote.subtotal, quote.currency)}</Text></View>
              <View style={[s.between, { marginTop: 6 }]}><Text style={[s.sumLabel, { color: colors.text2 }]}>{allPickup ? 'Collection' : 'Delivery'}</Text>{quote.delivery_fee > 0 ? <Text style={[s.sumValue, { color: colors.text }]}>{money(quote.delivery_fee, quote.currency)}</Text> : <Text style={{ color: colors.success, fontWeight: '700', fontSize: 12 }}>Free</Text>}</View>
              <View style={[s.totalBox, { backgroundColor: colors.primarySoft }]}>
                <Text style={[s.totalText, { color: colors.text }]}>Total</Text>
                <Price value={quote.total} currency={quote.currency} size={22} />
              </View>
              {vendors > 1 ? <Text style={{ fontSize: 10.5, color: colors.text2, marginTop: 8, lineHeight: 15 }}>Placed as {plural(vendors, 'order')}, one per seller.</Text> : null}
            </> : quoteError ? <EmptyState icon="alert-circle-outline" title="Cart changed" text={quoteError} action={<View style={{ gap: 8, marginTop: 8 }}><Button onPress={() => void loadQuote()}>Try again</Button><Button variant="secondary" onPress={back}>Review cart</Button></View>} /> : <Spinner label="Confirming current prices…" />}
          </Section>
          <Text style={[s.fine, { color: colors.muted }]}>Final prices and availability are confirmed securely by the server when you place the order.</Text>
        </ScrollView>

        <BottomBar>
          <View><Text style={[s.barLabel, { color: colors.text2 }]}>TOTAL</Text>{quote ? <Price value={quote.total} currency={quote.currency} size={21} /> : <Text style={{ color: colors.muted }}>…</Text>}</View>
          <Button variant="deep" loading={busy} disabled={!quote} onPress={() => void order()} style={s.cta}>{user ? 'Place order' : 'Sign in to order'}</Button>
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** A white card with a colour-coded icon and title. `flush` removes the inner padding (for lists). */
function Section({ icon, accent, title, right, flush, children }: { icon: IconName; accent: number; title: string; right?: string; flush?: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  const tone = accentAt(colors, accent);
  return (
    <Panel style={[s.section, flush && { padding: 0 }]}>
      <View style={[s.secHead, flush && { padding: 12, paddingBottom: 6 }]}>
        <View style={[s.secIcon, { backgroundColor: tone.bg }]}><Icon name={icon} solid={false} size={16} color={tone.fg} /></View>
        <Text style={[s.secTitle, { color: colors.text }]}>{title}</Text>
        {right ? <View style={[s.secBadge, { backgroundColor: tone.bg }]}><Text style={{ fontSize: 10, fontWeight: '700', color: tone.fg }}>{right}</Text></View> : null}
      </View>
      {children}
    </Panel>
  );
}

function Line({ item, divider }: { item: CartItem; divider: boolean }) {
  const { colors } = useTheme();
  const remembered = useRememberedImage(item.listing_id);
  return (
    <View style={[s.itemRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Thumb uri={item.image || remembered} style={s.itemThumb} iconSize={18} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={[s.itemTitle, { color: colors.text }]}>{item.title}{item.option ? ` · ${item.option}` : ''}</Text>
        <Text numberOfLines={1} style={[s.meta, { color: colors.text2 }]}>{item.vendor_name} · Qty {item.qty}</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{money(item.price * item.qty, item.currency)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 12, paddingBottom: 20 },
  heading: { fontSize: 13, fontWeight: '700', letterSpacing: -0.2, marginTop: 14, marginBottom: 8 },
  section: { marginTop: 10, padding: 12 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  secIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  secTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  secBadge: { height: 19, borderRadius: 9, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8 },
  itemThumb: { width: 38, height: 38, borderRadius: 10 },
  itemTitle: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 10.5, marginTop: 1, fontWeight: '500' },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 12, borderWidth: 1 },
  payIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 12.5, fontWeight: '700' },
  payHint: { fontSize: 10.5, marginTop: 1, lineHeight: 14 },
  rule: { height: StyleSheet.hairlineWidth },
  sumLabel: { fontSize: 12, fontWeight: '500' },
  sumValue: { fontSize: 12, fontWeight: '700' },
  totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  totalText: { fontSize: 13, fontWeight: '700' },
  fine: { fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 12 },
  barLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.9 },
  cta: { flex: 1, minHeight: 44 },
});
