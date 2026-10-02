import { Icon, type IconName } from './icons';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from './api';
import { useAuth, useCart, useTheme } from './providers';
import type { CartQuote, FulfilmentMode, Order, PaymentMethod } from './types';
import { BottomBar, Button, Card, Divider, EmptyState, Field, Header, Money, Notice, Spinner, Text } from './ui';

const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error) ? e.message : 'Something went wrong. Please try again.';
const PAYMENTS: [PaymentMethod, string, string, IconName][] = [
  ['cash_on_delivery', 'Cash on delivery', 'Pay the seller when you receive or collect your order', 'cash-outline'],
  ['whatsapp', 'Confirm on WhatsApp', 'Agree payment with the seller in a WhatsApp chat', 'logo-whatsapp'],
  ['bank_transfer', 'Bank transfer', 'The seller shares their account details after you order', 'business-outline'],
];

type Placed = { orders: Order[] };

export function Checkout({ go, back, tab }: { go: (screen: any, params?: any) => void; back: () => void; tab: (screen: any, params?: any) => void }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const cart = useCart();
  const [mode, setMode] = useState<FulfilmentMode>('delivery');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [touched, setTouched] = useState(false);
  // Idempotency: an identical retry (double-tap, flaky network) reuses its key and can never create
  // two orders; any change to the order body gets a fresh key.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const finished = useRef(false);
  const [form, setForm] = useState({
    contact_name: user?.full_name || '', contact_phone: user?.phone || '',
    delivery_address: '', city: 'Doha', country: 'Qatar', payment_method: 'cash_on_delivery' as PaymentMethod, note: '',
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value }));

  const itemsKey = cart.items.map((item) => `${item.listing_id}:${item.qty}`).join(',');
  const loadQuote = useCallback(async () => {
    setQuoteError('');
    try {
      setQuote(await api.post<CartQuote>('/orders/quote', { items: cart.items.map((item) => ({ listing_id: item.listing_id, qty: item.qty })), fulfilment_mode: mode }));
    } catch (e) { setQuote(null); setQuoteError(errorText(e)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, mode]);

  useEffect(() => {
    if (finished.current) return;                 // the cart is cleared on success; do not navigate away from the confirmation
    if (!cart.items.length) { back(); return; }
    void loadQuote();
  }, [loadQuote, cart.items.length, back]);

  // A store may only offer one mode; the quote tells us what will really happen per vendor.
  const needsAddress = !quote || quote.vendors.some((vendor) => vendor.mode === 'delivery');
  const allPickup = !!quote && quote.vendors.every((vendor) => vendor.mode === 'pickup');

  const errors = {
    contact_name: form.contact_name.trim().length < 2 ? 'Enter your full name' : '',
    contact_phone: form.contact_phone.replace(/\D/g, '').length < 7 ? 'Enter a valid phone number' : '',
    delivery_address: needsAddress && form.delivery_address.trim().length < 5 ? 'Enter your building, street and area' : '',
    city: needsAddress && form.city.trim().length < 2 ? 'Enter your city' : '',
  };
  const valid = !Object.values(errors).some(Boolean);

  const order = async () => {
    if (!user) return go('login');
    setTouched(true);
    if (!valid) return Alert.alert('Complete checkout', 'Please fix the highlighted fields.');
    if (!quote) return Alert.alert('Prices not confirmed', quoteError || 'Wait for the order total to load, then try again.');
    setBusy(true);
    try {
      const body = {
        items: cart.items.map((item) => ({ listing_id: item.listing_id, qty: item.qty })),
        fulfilment_mode: mode,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        // The API always requires an address; collection orders carry a clear placeholder.
        delivery_address: needsAddress ? form.delivery_address.trim() : 'Collection from store',
        city: form.city.trim() || 'Doha',
        country: form.country.trim() || 'Qatar',
        payment_method: form.payment_method,
        note: form.note.trim() || undefined,
      };
      const key = JSON.stringify(body);
      if (!attempt.current || attempt.current.key !== key) attempt.current = { key, id: randomUUID() };
      const result = await api.post<Placed>('/orders/checkout', { request_id: attempt.current.id, ...body });
      finished.current = true;
      cart.clear();
      setPlaced(result);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 400)) void loadQuote();
      Alert.alert('Could not place order', errorText(e));
    } finally { setBusy(false); }
  };

  if (placed) {
    return <View style={styles.page}>
      <Header title="Order placed" />
      <ScrollView contentContainerStyle={styles.doneScroll}>
        <View style={[styles.doneIcon, { backgroundColor: colors.successSoft }]}><Icon name="checkmark-circle" size={46} color={colors.success} /></View>
        <Text style={[styles.doneTitle, { color: colors.text }]}>Thank you, {form.contact_name.split(' ')[0] || 'friend'}!</Text>
        <Text style={[styles.doneCopy, { color: colors.text2 }]}>{placed.orders.length === 1 ? 'Your order has been sent to the seller.' : `Your cart was split into ${placed.orders.length} orders, one per seller.`}</Text>
        {placed.orders.map((item) => <Card key={item.id} style={{ width: '100%', marginTop: 14 }}>
          <View style={styles.between}><Text style={[styles.code, { color: colors.text }]}>{item.code}</Text><Money value={item.total} currency={item.currency} strong /></View>
          <Text style={[styles.meta, { color: colors.text2 }]}>{item.vendor?.business_name || item.business_name} · {item.fulfilment_mode === 'pickup' ? 'Collection' : 'Delivery'}</Text>
          {item.items?.map((line, index) => <Text key={index} numberOfLines={1} style={[styles.line, { color: colors.text2 }]}>• {line.title} × {line.qty}</Text>)}
          <View style={styles.actions}>
            {(item as any).whatsapp_url ? <Button variant="secondary" style={styles.actionButton} onPress={() => void Linking.openURL((item as any).whatsapp_url)}>WhatsApp seller</Button> : null}
            <Button style={styles.actionButton} onPress={() => go('track', { code: item.code, phone: form.contact_phone })}>Track</Button>
          </View>
        </Card>)}
        <View style={{ width: '100%', gap: 10, marginTop: 18 }}>
          <Button onPress={() => go('orders')}>View my orders</Button>
          <Button variant="ghost" onPress={() => tab('home')}>Continue shopping</Button>
        </View>
      </ScrollView>
    </View>;
  }

  const fieldError = (key: keyof typeof errors) => (touched && errors[key]) || undefined;

  return <KeyboardAvoidingView behavior="padding" style={styles.page}>
    <Header title="Checkout" back={back} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      {!user ? <Notice type="warning">Sign in to place your order — your cart is saved on this phone.</Notice> : null}

      <Text style={[styles.heading, { color: colors.text }]}>Your items</Text>
      <Card>
        {cart.items.map((item, index) => <View key={item.listing_id}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.between}>
            <View style={{ flex: 1 }}><Text numberOfLines={2} style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.meta, { color: colors.text2 }]}>{item.vendor_name} · Qty {item.qty}</Text></View>
            <Money value={item.price * item.qty} currency={item.currency} />
          </View>
        </View>)}
      </Card>

      <Text style={[styles.heading, { color: colors.text }]}>How do you want it?</Text>
      <View style={[styles.toggle, { backgroundColor: colors.surface2 }]}>
        {([['delivery', 'Delivery', 'bicycle-outline'], ['pickup', 'Pick up', 'walk-outline']] as const).map(([value, label, icon]) => {
          const active = mode === value;
          return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setMode(value)} style={[styles.toggleOption, { backgroundColor: active ? colors.primary : 'transparent' }]}>
            <Icon name={icon} size={17} color={active ? '#fff' : colors.text2} /><Text style={[styles.toggleText, { color: active ? '#fff' : colors.text2 }]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      {quote?.vendors.map((vendor) => vendor.unavailable ? <View key={vendor.vendor_id} style={{ marginTop: 8 }}><Notice type="warning">{vendor.vendor_name}: {vendor.unavailable}</Notice></View> : null)}
      {quote?.vendors.filter((vendor) => vendor.mode === 'pickup' && vendor.pickup_address).map((vendor) => <View key={`p-${vendor.vendor_id}`} style={{ marginTop: 8 }}><Notice>Collect from {vendor.vendor_name}: {vendor.pickup_address}</Notice></View>)}

      <Text style={[styles.heading, { color: colors.text }]}>Contact</Text>
      <Field label="Full name" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" error={fieldError('contact_name')} />
      <Field label="Phone number" value={form.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" placeholder="+974…" error={fieldError('contact_phone')} />
      {needsAddress ? <>
        <Field label="Delivery address" value={form.delivery_address} onChangeText={set('delivery_address')} multiline placeholder="Building, street, zone" error={fieldError('delivery_address')} style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}><Field label="City" value={form.city} onChangeText={set('city')} error={fieldError('city')} /></View>
          <View style={{ flex: 1 }}><Field label="Country" value={form.country} onChangeText={set('country')} /></View>
        </View>
      </> : null}

      <Text style={[styles.heading, { color: colors.text }]}>Payment</Text>
      {PAYMENTS.map(([value, label, hint, icon]) => {
        const active = form.payment_method === value;
        return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setForm((old) => ({ ...old, payment_method: value }))} style={[styles.payment, { backgroundColor: colors.surface, borderColor: active ? colors.primary : colors.border }]}>
          <View style={[styles.payIcon, { backgroundColor: active ? colors.primarySoft : colors.surface2 }]}><Icon name={icon} size={19} color={active ? colors.primary : colors.text2} /></View>
          <View style={{ flex: 1 }}><Text style={[styles.payTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.payHint, { color: colors.text2 }]}>{hint}</Text></View>
          <Icon name={active ? 'radio-button-on' : 'radio-button-off'} size={21} color={active ? colors.primary : colors.muted} />
        </Pressable>;
      })}
      <Field label="Note for the seller (optional)" value={form.note} onChangeText={set('note')} multiline placeholder="Any helpful instructions" style={{ minHeight: 70, textAlignVertical: 'top', paddingTop: 12 }} />

      <Text style={[styles.heading, { color: colors.text }]}>Summary</Text>
      {quote ? <Card>
        {quote.vendors.map((vendor) => <View key={vendor.vendor_id} style={styles.between}>
          <Text style={[styles.meta, { color: colors.text2, flex: 1 }]}>{vendor.vendor_name}</Text>
          <Money value={vendor.subtotal} currency={vendor.currency} />
        </View>)}
        <Divider />
        <View style={styles.between}><Text style={[styles.meta, { color: colors.text2 }]}>Subtotal</Text><Money value={quote.subtotal} currency={quote.currency} /></View>
        <View style={[styles.between, { marginTop: 6 }]}><Text style={[styles.meta, { color: colors.text2 }]}>{allPickup ? 'Collection' : 'Delivery'}</Text>{quote.delivery_fee > 0 ? <Money value={quote.delivery_fee} currency={quote.currency} /> : <Text style={{ color: colors.success, fontWeight: '800', fontSize: 13 }}>Free</Text>}</View>
        <Divider />
        <View style={styles.between}><Text style={[styles.totalText, { color: colors.text }]}>Total</Text><Money value={quote.total} currency={quote.currency} strong /></View>
      </Card> : quoteError ? <EmptyState icon="alert-circle-outline" title="Cart changed" text={quoteError} action={<View style={{ gap: 8, marginTop: 8 }}><Button onPress={() => void loadQuote()}>Try again</Button><Button variant="secondary" onPress={back}>Review cart</Button></View>} /> : <Spinner label="Confirming current prices…" />}
      <Text style={[styles.fine, { color: colors.muted }]}>Final prices and availability are confirmed securely by the server when you place the order.</Text>
    </ScrollView>

    <BottomBar>
      <View><Text style={[styles.barLabel, { color: colors.text2 }]}>TOTAL</Text>{quote ? <Money value={quote.total} currency={quote.currency} strong /> : <Text style={{ color: colors.muted }}>…</Text>}</View>
      <Button variant="gold" loading={busy} disabled={!quote} onPress={() => void order()} style={styles.cta}>{user ? 'Place order' : 'Sign in to order'}</Button>
    </BottomBar>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, scroll: { padding: 16, paddingBottom: 28 }, heading: { fontSize: 17, fontWeight: '900', marginTop: 22, marginBottom: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, pair: { flexDirection: 'row', gap: 10 },
  itemTitle: { fontSize: 14, fontWeight: '800' }, meta: { fontSize: 12, marginTop: 2 }, line: { fontSize: 12, marginTop: 4 },
  toggle: { height: 50, borderRadius: 12, padding: 4, flexDirection: 'row', gap: 4 }, toggleOption: { flex: 1, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, toggleText: { fontSize: 13, fontWeight: '900' },
  payment: { minHeight: 64, borderRadius: 13, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 9 }, payIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  payTitle: { fontSize: 14, fontWeight: '800' }, payHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  totalText: { fontSize: 15, fontWeight: '900' }, fine: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 }, barLabel: { fontSize: 9, fontWeight: '800', letterSpacing: .4 }, cta: { minWidth: 170, borderRadius: 24 },
  doneScroll: { padding: 20, alignItems: 'center' }, doneIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  doneTitle: { fontSize: 25, fontWeight: '900', marginTop: 16 }, doneCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, maxWidth: 310 }, code: { fontSize: 15, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 13 }, actionButton: { flex: 1, minHeight: 44 },
});
