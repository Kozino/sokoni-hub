import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useCheckoutDraft } from './checkoutDraft';
import { cartLineKey, errorMessage, quoteItems, useCartQuote, useRememberedImage } from './data';
import { DeliveryPin, type DeliveryPinValue } from './DeliveryPin';
import { money, plural } from './format';
import { Icon } from './icons';
import { ModeCard, Panel, Price, Screen, Thumb } from './kit';
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
  if (placed) {
    return (
      <Screen>
        <Header title="Order placed" />
        <ScrollView contentContainerStyle={s.doneScroll}>
          <View style={[s.doneIcon, { backgroundColor: colors.primarySoft }]}><Icon name="checkmark-circle" size={52} color={colors.primary} /></View>
          <Text style={[s.doneTitle, { color: colors.text }]}>Thank you, {form.contact_name.split(' ')[0] || 'friend'}!</Text>
          <Text style={[s.doneCopy, { color: colors.text2 }]}>{placed.orders.length === 1 ? 'Your order has been sent to the seller. You will pay in cash on delivery.' : `Your cart was split into ${placed.orders.length} orders, one per seller. You will pay each in cash.`}</Text>
          {placed.orders.map((item) => (
            <Panel key={item.id} style={{ width: '100%', marginTop: 14 }}>
              <View style={s.between}><Text style={[s.code, { color: colors.text }]}>#{item.code}</Text><Price value={item.total} currency={item.currency} size={21} /></View>
              <Text style={[s.meta, { color: colors.text2 }]}>{item.vendor?.business_name || item.business_name} · {item.fulfilment_mode === 'pickup' ? 'Pick up' : 'Delivery'}</Text>
              {item.items?.map((line, index) => <Text key={index} numberOfLines={1} style={[s.line, { color: colors.text2 }]}>• {line.title} × {line.qty}</Text>)}
              <Button style={{ marginTop: 14 }} onPress={() => go('track', { code: item.code, phone: form.contact_phone })}>Track this order</Button>
            </Panel>
          ))}
          <View style={{ width: '100%', gap: 10, marginTop: 18 }}>
            <Button variant="tonal" onPress={() => go('orders')}>View my orders</Button>
            <Button variant="ghost" onPress={() => tab('home')}>Continue shopping</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const fieldError = (key: keyof typeof errors) => (touched && errors[key]) || undefined;
  const vendors = new Set(cart.items.map((i) => i.vendor_id)).size;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Header title="Checkout" back={back} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          {!user ? <Notice type="warning">Sign in to place your order — your cart is saved on this phone.</Notice> : null}
          {banner ? <View style={{ gap: 8, marginBottom: 8 }}><Notice type="danger">{banner}</Notice><Button variant="secondary" onPress={() => void order()} loading={busy}>Try again</Button></View> : null}

          <Text style={[s.heading, { color: colors.text }]}>Your items</Text>
          <Panel style={{ padding: 6 }}>
            {cart.items.map((item, index) => <Line key={cartLineKey(item)} item={item} divider={index > 0} />)}
          </Panel>

          <Text style={[s.heading, { color: colors.text }]}>How do you want it?</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <ModeCard selected={mode === 'delivery'} icon="car" title="Delivery" sub="Brought to your door" price={quote && mode === 'delivery' ? (quote.delivery_fee > 0 ? money(quote.delivery_fee, quote.currency) : 'Free') : '—'} onPress={() => setDraft({ mode: 'delivery' })} />
            <ModeCard selected={mode === 'pickup'} icon="storefront" title="Pick up" sub="Collect from the seller" price="Free" onPress={() => setDraft({ mode: 'pickup' })} />
          </View>
          {quote?.vendors.map((vendor) => vendor.unavailable ? <View key={vendor.vendor_id} style={{ marginTop: 8 }}><Notice type="warning">{vendor.vendor_name}: {vendor.unavailable}</Notice></View> : null)}
          {quote?.vendors.filter((vendor) => vendor.mode === 'pickup' && vendor.pickup_address).map((vendor) => <View key={`p-${vendor.vendor_id}`} style={{ marginTop: 8 }}><Notice>Collect from {vendor.vendor_name}: {vendor.pickup_address}</Notice></View>)}

          <Text style={[s.heading, { color: colors.text }]}>Contact</Text>
          <Field label="Full name" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" error={fieldError('contact_name')} />
          <Field label="Phone number" value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+974…" error={fieldError('contact_phone')} />

          {needsAddress ? <>
            <Text style={[s.heading, { color: colors.text }]}>Delivery location</Text>
            {reusedPin.current && pin ? <View style={{ marginBottom: 6 }}><Notice>Using your last delivery location. Move the pin if you are somewhere else today.</Notice></View> : null}
            <DeliveryPin
              value={pin}
              error={fieldError('delivery_pin')}
              onConfirm={(confirmed, suggestion) => {
                setPin(confirmed);
                // Fill the address from the map only if the customer has not typed one yet.
                if (suggestion) setForm((old) => (old.delivery_address.trim() ? old : { ...old, delivery_address: suggestion }));
              }}
            />
            <View style={{ height: 14 }} />
            <Field label="Delivery address" value={form.delivery_address} onChangeText={set('delivery_address')} multiline placeholder="Building, street, zone" error={fieldError('delivery_address')} style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }} />
            <View style={s.pair}>
              <View style={{ flex: 1 }}><Field label="City" value={form.city} onChangeText={set('city')} error={fieldError('city')} /></View>
              <View style={{ flex: 1 }}><Field label="Country" value={form.country} onChangeText={set('country')} /></View>
            </View>
          </> : null}

          <Text style={[s.heading, { color: colors.text }]}>Payment</Text>
          <Panel style={[s.payment, { borderColor: colors.primary, borderWidth: 1.5 }]}>
            <View style={[s.payIcon, { backgroundColor: colors.primarySoft }]}><Icon name="cash" solid={false} size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[s.payTitle, { color: colors.text }]}>Cash on delivery</Text><Text style={[s.payHint, { color: colors.text2 }]}>Pay the seller when you receive or collect your order. Nothing is charged in the app.</Text></View>
            <Icon name="radio-button-on" size={23} color={colors.primary} />
          </Panel>
          <View style={{ height: 14 }} />
          <Field label="Note for the seller (optional)" value={form.note} onChangeText={set('note')} multiline maxLength={500} placeholder="Any helpful instructions" style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }} />

          <Text style={[s.heading, { color: colors.text }]}>Summary</Text>
          {quote ? <Panel>
            {quote.vendors.map((vendor) => <View key={vendor.vendor_id} style={[s.between, { marginBottom: 8 }]}>
              <Text numberOfLines={1} style={[s.meta, { color: colors.text2, flex: 1, marginTop: 0, fontSize: 14 }]}>{vendor.vendor_name}</Text>
              <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.text }}>{money(vendor.subtotal, vendor.currency)}</Text>
            </View>)}
            <View style={[s.rule, { backgroundColor: colors.border }]} />
            <View style={[s.between, { marginTop: 4 }]}><Text style={[s.sumLabel, { color: colors.text2 }]}>Subtotal</Text><Text style={[s.sumValue, { color: colors.text }]}>{money(quote.subtotal, quote.currency)}</Text></View>
            <View style={[s.between, { marginTop: 10 }]}><Text style={[s.sumLabel, { color: colors.text2 }]}>{allPickup ? 'Collection' : 'Delivery'}</Text>{quote.delivery_fee > 0 ? <Text style={[s.sumValue, { color: colors.text }]}>{money(quote.delivery_fee, quote.currency)}</Text> : <Text style={{ color: colors.success, fontWeight: '800', fontSize: 15 }}>Free</Text>}</View>
            <View style={[s.rule, { backgroundColor: colors.border, marginTop: 14 }]} />
            <View style={[s.between, { marginTop: 4 }]}><Text style={[s.totalText, { color: colors.text }]}>Total</Text><Price value={quote.total} currency={quote.currency} size={26} /></View>
            {vendors > 1 ? <Text style={{ fontSize: 12.5, color: colors.text2, marginTop: 10, lineHeight: 17 }}>Placed as {plural(vendors, 'order')}, one per seller.</Text> : null}
          </Panel> : quoteError ? <EmptyState icon="alert-circle-outline" title="Cart changed" text={quoteError} action={<View style={{ gap: 8, marginTop: 8 }}><Button onPress={() => void loadQuote()}>Try again</Button><Button variant="secondary" onPress={back}>Review cart</Button></View>} /> : <Spinner label="Confirming current prices…" />}
          <Text style={[s.fine, { color: colors.muted }]}>Final prices and availability are confirmed securely by the server when you place the order.</Text>
        </ScrollView>

        <BottomBar>
          <View><Text style={[s.barLabel, { color: colors.text2 }]}>TOTAL</Text>{quote ? <Price value={quote.total} currency={quote.currency} size={24} /> : <Text style={{ color: colors.muted }}>…</Text>}</View>
          <Button variant="deep" loading={busy} disabled={!quote} onPress={() => void order()} style={s.cta}>{user ? 'Place order' : 'Sign in to order'}</Button>
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Line({ item, divider }: { item: CartItem; divider: boolean }) {
  const { colors } = useTheme();
  const remembered = useRememberedImage(item.listing_id);
  return (
    <View style={[s.itemRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Thumb uri={item.image || remembered} style={s.itemThumb} iconSize={20} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={[s.itemTitle, { color: colors.text }]}>{item.title}{item.option ? ` · ${item.option}` : ''}</Text>
        <Text numberOfLines={1} style={[s.meta, { color: colors.text2 }]}>{item.vendor_name} · Qty {item.qty}</Text>
      </View>
      <Text style={{ fontSize: 14.5, fontWeight: '800', color: colors.text }}>{money(item.price * item.qty, item.currency)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 28 },
  heading: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 24, marginBottom: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  pair: { flexDirection: 'row', gap: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  itemThumb: { width: 50, height: 50, borderRadius: 13 },
  itemTitle: { fontSize: 14.5, fontWeight: '800' },
  meta: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
  line: { fontSize: 12.5, marginTop: 5 },
  payment: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 15.5, fontWeight: '800' },
  payHint: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  rule: { height: StyleSheet.hairlineWidth },
  sumLabel: { fontSize: 15, fontWeight: '500' },
  sumValue: { fontSize: 15, fontWeight: '800' },
  totalText: { fontSize: 18, fontWeight: '800' },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  barLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  cta: { flex: 1, minHeight: 54 },
  doneScroll: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  doneIcon: { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  doneTitle: { fontSize: 27, fontWeight: '800', marginTop: 18, letterSpacing: -0.5 },
  doneCopy: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 330 },
  code: { fontSize: 17, fontWeight: '800' },
});
