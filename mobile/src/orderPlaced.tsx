/**
 * "Order placed" confirmation. A celebratory but compact page: gradient hero with an animated check and confetti,
 * three colour-coded stat tiles, one card per seller order (code, items, totals, Track / WhatsApp), and a
 * colourful "what happens next" timeline. Everything shown comes from the orders the API just created.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVendorDirectory } from './data';
import { money, plural, whatsappUrl } from './format';
import { tap } from './haptics';
import { Icon, type IconName } from './icons';
import { Avatar, Panel, Screen, StatusPill, accentAt, orderLook } from './kit';
import { useTheme } from './providers';
import type { Order } from './types';
import { Button, Text } from './ui';

type Nav = { go: (screen: any, params?: any) => void; tab: (screen: any, params?: any) => void };

/** Static confetti: [left %, top px, size, colour, shape, rotation]. */
const CONFETTI: [string, number, number, string, 'dot' | 'bar' | 'box', number][] = [
  ['8%', 24, 7, '#FFB36B', 'dot', 0], ['19%', 62, 9, '#FFD166', 'bar', 35], ['30%', 18, 6, '#FFFFFF', 'dot', 0], ['41%', 70, 8, '#B9AFFF', 'box', 20],
  ['58%', 20, 8, '#86CBFF', 'bar', -30], ['69%', 66, 6, '#FF8FA6', 'dot', 0], ['80%', 28, 9, '#FFD166', 'box', 40], ['91%', 74, 7, '#7CE0BB', 'dot', 0],
  ['13%', 118, 6, '#FFFFFF', 'box', 15], ['86%', 124, 8, '#FFB36B', 'bar', 55], ['5%', 160, 7, '#86CBFF', 'dot', 0], ['94%', 164, 6, '#B9AFFF', 'box', -20],
];

export function OrderPlaced({ orders, name, phone, go, tab }: { orders: Order[]; name: string; phone: string } & Nav) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const directory = useVendorDirectory();
  const pop = useRef(new Animated.Value(0.2)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pop, pulse]);

  const first = name.trim().split(/\s+/)[0] || 'there';
  const itemCount = orders.reduce((n, o) => n + (o.items ?? []).reduce((m, l) => m + Number(l.qty || 0), 0), 0);
  const currency = orders[0]?.currency || 'QAR';
  const totalSum = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const allPickup = orders.every((o) => o.fulfilment_mode === 'pickup');
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const steps: { icon: IconName; title: string; text: string; accent: number }[] = [
    { icon: 'time', title: 'Seller confirms', text: 'You get an update as soon as the seller accepts your order.', accent: 1 },
    { icon: 'cube', title: 'Seller prepares it', text: 'Your items are packed and made ready.', accent: 2 },
    allPickup
      ? { icon: 'storefront', title: 'Collect from the store', text: 'Show your order code when you arrive.', accent: 3 }
      : { icon: 'car', title: 'On its way to you', text: 'Follow your rider live on the Track screen.', accent: 3 },
    { icon: 'cash', title: 'Pay in cash', text: 'Pay the seller when you receive or collect. Nothing is charged in the app.', accent: 0 },
  ];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <LinearGradient colors={[colors.heroA, colors.heroB, colors.heroC]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 22 }]}>
          {CONFETTI.map(([left, top, size, color, shape, rotate], i) => (
            <View
              key={i} pointerEvents="none"
              style={{ position: 'absolute', left: left as `${number}%`, top, width: shape === 'bar' ? size * 2.2 : size, height: shape === 'bar' ? size * 0.55 : size, borderRadius: shape === 'dot' ? size : shape === 'bar' ? size : 2, backgroundColor: color, opacity: 0.85, transform: [{ rotate: `${rotate}deg` }] }}
            />
          ))}
          <View style={s.badgeWrap}>
            <Animated.View style={[s.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <Animated.View style={[s.badge, { backgroundColor: '#FFFFFF', transform: [{ scale: pop }] }]}>
              <View style={[s.badgeInner, { backgroundColor: colors.primary }]}><Icon name="check" size={26} color="#FFFFFF" /></View>
            </Animated.View>
          </View>
          <Text style={s.heroTitle}>Order placed!</Text>
          <Text style={s.heroText}>Thank you, {first}. {orders.length === 1 ? 'Your order has' : `Your ${orders.length} orders have`} been sent to the seller.</Text>
        </LinearGradient>

        <View style={s.stats}>
          <Stat icon="receipt" accent={0} value={String(orders.length)} label={orders.length === 1 ? 'Order' : 'Orders'} />
          <Stat icon="cube" accent={2} value={String(itemCount || orders.length)} label={itemCount === 1 ? 'Item' : 'Items'} />
          <Stat icon="cash" accent={1} value={money(totalSum, currency)} label="To pay in cash" wide />
        </View>

        {orders.length > 1 ? <Text style={[s.note, { color: colors.text2 }]}>Your cart was split into {plural(orders.length, 'order')}, one per seller.</Text> : null}

        <View style={{ gap: 10, paddingHorizontal: 12, marginTop: 10 }}>
          {orders.map((order, index) => (
            <OrderCard key={order.id} order={order} index={index} phone={phone} logo={directory.byId.get(order.vendor_id)?.logo_url} go={go} />
          ))}
        </View>

        <Panel style={{ marginHorizontal: 12, marginTop: 10 }}>
          <Text style={[s.nextTitle, { color: colors.text }]}>What happens next</Text>
          {steps.map((step, index) => {
            const accent = accentAt(colors, step.accent);
            return (
              <View key={step.title} style={s.step}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[s.stepIcon, { backgroundColor: accent.bg }]}><Icon name={step.icon} solid={false} size={15} color={accent.fg} /></View>
                  {index < steps.length - 1 ? <View style={[s.stepLine, { backgroundColor: colors.border }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: index < steps.length - 1 ? 10 : 0 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{step.title}</Text>
                  <Text style={{ fontSize: 11, lineHeight: 15, color: colors.text2, marginTop: 1 }}>{step.text}</Text>
                </View>
              </View>
            );
          })}
        </Panel>

        <View style={{ gap: 8, paddingHorizontal: 12, marginTop: 14 }}>
          <Button variant="deep" icon="arrow-forward" onPress={() => go('orders')}>View my orders</Button>
          <Button variant="tonal" onPress={() => tab('home')}>Continue shopping</Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ icon, accent, value, label, wide }: { icon: IconName; accent: number; value: string; label: string; wide?: boolean }) {
  const { colors } = useTheme();
  const tone = accentAt(colors, accent);
  return (
    <Panel style={[s.stat, wide && { flexGrow: 1.5 }]}>
      <View style={[s.statIcon, { backgroundColor: tone.bg }]}><Icon name={icon} solid={false} size={15} color={tone.fg} /></View>
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{value}</Text>
        <Text numberOfLines={1} style={{ fontSize: 9.5, fontWeight: '600', color: colors.text2 }}>{label}</Text>
      </View>
    </Panel>
  );
}

function OrderCard({ order, index, phone, logo, go }: { order: Order; index: number; phone: string; logo?: string | null; go: Nav['go'] }) {
  const { colors } = useTheme();
  const accent = accentAt(colors, [0, 2, 1, 3][index % 4]);
  const pickup = order.fulfilment_mode === 'pickup';
  const seller = order.vendor?.business_name || order.business_name || 'Seller';
  const wa = whatsappUrl(order.whatsapp || order.vendor?.whatsapp, `Hi ${seller}, I just placed order #${order.code} on Sokoni Hub.`);
  const look = orderLook(order.status || 'pending', { pickup });
  return (
    <Panel style={{ padding: 0, overflow: 'hidden' }}>
      <View style={[s.strip, { backgroundColor: accent.fg }]} />
      <View style={{ padding: 11, paddingLeft: 15 }}>
        <View style={s.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Avatar name={seller} uri={logo} size={30} square tone="mint" />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1 }}>{seller}</Text>
          </View>
          <StatusPill look={look} small />
        </View>

        <View style={[s.codeBox, { backgroundColor: accent.bg }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, color: accent.fg }}>ORDER CODE</Text>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', letterSpacing: 0.4, color: colors.text, marginTop: 1 }}>{order.code}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Share order code" hitSlop={8} onPress={() => { tap(); void Share.share({ message: `My Sokoni Hub order code is ${order.code}.` }); }} style={[s.share, { backgroundColor: colors.surface }]}>
            <Icon name="share" solid={false} size={15} color={accent.fg} />
          </Pressable>
        </View>

        {(order.items ?? []).map((line, i) => (
          <View key={line.id ?? i} style={s.line}>
            <View style={[s.qty, { backgroundColor: colors.lav2 }]}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.text2 }}>{line.qty}×</Text></View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 11.5, color: colors.text, fontWeight: '500' }}>{line.title}</Text>
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text }}>{money(line.line_total, order.currency)}</Text>
          </View>
        ))}

        <View style={[s.rule, { backgroundColor: colors.border }]} />
        <View style={s.rowBetween}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            <Chip icon={pickup ? 'storefront' : 'car'} text={pickup ? 'Pick up' : 'Delivery'} bg={colors.primarySoft} fg={colors.primary} />
            <Chip icon="cash" text="Cash" bg={colors.orangeSoft} fg={colors.brown} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9.5, fontWeight: '600', color: colors.text2 }}>Total</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{money(order.total, order.currency)}</Text>
          </View>
        </View>

        <View style={s.actions}>
          <Button variant="primary" iconLeft="navigate" style={{ flex: 1, minHeight: 38 }} textStyle={{ fontSize: 12 }} onPress={() => go('track', { code: order.code, phone: order.contact_phone || phone })}>Track order</Button>
          {wa ? <Button variant="mint" iconLeft="logo-whatsapp" style={{ flex: 1, minHeight: 38 }} textStyle={{ fontSize: 12 }} onPress={() => void Linking.openURL(wa)}>WhatsApp</Button> : null}
        </View>
      </View>
    </Panel>
  );
}

function Chip({ icon, text, bg, fg }: { icon: IconName; text: string; bg: string; fg: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Icon name={icon} solid={false} size={12} color={fg} />
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: fg }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingBottom: 52, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  badgeWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 66, height: 66, borderRadius: 33, backgroundColor: '#FFFFFF' },
  badge: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  badgeInner: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', letterSpacing: -0.4, marginTop: 10 },
  heroText: { color: '#D3EEDF', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4, maxWidth: 300 },
  stats: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: -30 },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 8, borderRadius: 14 },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 11, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },
  strip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  share: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  qty: { minWidth: 24, height: 18, borderRadius: 6, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 10, marginBottom: 9 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, borderRadius: 11, paddingHorizontal: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  nextTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  step: { flexDirection: 'row', gap: 10 },
  stepIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 10, marginVertical: 2, borderRadius: 1 },
});
