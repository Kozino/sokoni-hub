/**
 * Offers on screen: the colourful cards (Explore rail, Offers list), and the promo-code card in the Cart.
 *
 * Nothing here knows a single offer. Every title, amount, code, date and hint comes from the server
 * (`GET /offers`, `POST /orders/quote`), so a new campaign needs no app update. The only things that live in
 * the app are the layouts and the colour each accent name maps to.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useOffers } from './data';
import { money, shortDate } from './format';
import { tap } from './haptics';
import { Icon, type IconName } from './icons';
import { Panel, SectionHead, softShadow, useColumnWidth } from './kit';
import { useTheme } from './providers';
import type { CartQuote, Offer, OfferAccent, OfferKind } from './types';
import { Text, TextInput } from './ui';

/** Gradient for each accent name an admin can pick. White text sits on all of them, in light and dark mode. */
export const ACCENT_GRADIENT: Record<OfferAccent, [string, string]> = {
  green: ['#004C2D', '#05663F'],
  orange: ['#A94D00', '#E56A00'],
  violet: ['#3F3496', '#5B4BDB'],
  sky: ['#06568D', '#0B76C2'],
  rose: ['#A31C35', '#D9304F'],
  amber: ['#7F5500', '#B97800'],
};
export const accentSolid = (accent: OfferAccent) => (ACCENT_GRADIENT[accent] ?? ACCENT_GRADIENT.green)[1];
/** The same accents, lightened for text and outlines on a dark surface (the saturated ones are too dim there). */
const ACCENT_LIGHT: Record<OfferAccent, string> = { green: '#65D89C', orange: '#FFA050', violet: '#B9AFFF', sky: '#86CBFF', rose: '#FF8FA6', amber: '#FFD166' };
export const accentInk = (accent: OfferAccent, dark: boolean) => (dark ? ACCENT_LIGHT[accent] ?? ACCENT_LIGHT.green : accentSolid(accent));

const n = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''));
const isDeliveryKind = (kind: OfferKind) => kind === 'free_delivery' || kind === 'delivery_percent_off' || kind === 'delivery_amount_off';

/** "10% OFF", "FREE DELIVERY": the big words on a card. */
export function offerHeadline(o: Pick<Offer, 'kind' | 'value'>): string {
  switch (o.kind) {
    case 'percent_off': return `${n(o.value)}% OFF`;
    case 'amount_off': return `${n(o.value)} QAR OFF`;
    case 'free_delivery': return 'FREE DELIVERY';
    case 'delivery_percent_off': return `${n(o.value)}% OFF DELIVERY`;
    default: return `${n(o.value)} QAR OFF DELIVERY`;
  }
}

/** The small print, as short phrases. */
export function offerTerms(o: Offer): string[] {
  return [
    o.min_subtotal > 0 ? `Min. spend ${n(o.min_subtotal)} QAR` : '',
    o.max_discount ? `Up to ${n(o.max_discount)} QAR` : '',
    o.first_order_only ? 'First order only' : '',
    o.fulfilment === 'delivery' ? 'Delivery orders' : o.fulfilment === 'pickup' ? 'Store collection' : '',
    o.target?.name ? (o.target.type === 'vendor' ? `At ${o.target.name}` : `On ${o.target.name}`) : '',
  ].filter(Boolean);
}

/** "Ends today", "Ends in 3 days", or the date when it is a long way off. */
export function offerEnds(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Ended';
  const hours = ms / 3_600_000;
  if (hours < 24) return 'Ends today';
  const days = Math.ceil(hours / 24);
  if (days === 1) return 'Ends tomorrow';
  return days <= 14 ? `Ends in ${days} days` : `Until ${shortDate(iso)}`;
}

const kindIcon = (kind: OfferKind): IconName => (isDeliveryKind(kind) ? 'car' : kind === 'percent_off' ? 'receipt-percent' : 'ticket');

/* ------------------------------------------------------------------------------------ rail card */
export function OfferCard({ offer, width, onPress }: { offer: Offer; width: number; onPress: () => void }) {
  const [a, b] = ACCENT_GRADIENT[offer.accent] ?? ACCENT_GRADIENT.green;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${offerHeadline(offer)}. ${offer.title}`} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [{ width, opacity: pressed ? 0.92 : 1 }]}>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, softShadow('#000000', 1)]}>
        <View style={s.circle} />
        <View style={s.cardTop}>
          <View style={s.badge}><Text style={s.badgeText}>{offer.badge || (isDeliveryKind(offer.kind) ? 'DELIVERY' : 'OFFER')}</Text></View>
          <View style={s.iconDot}><Icon name={kindIcon(offer.kind)} solid={false} size={14} color="#FFFFFF" /></View>
        </View>
        <Text numberOfLines={1} style={s.headline}>{offerHeadline(offer)}</Text>
        <Text numberOfLines={2} style={s.cardTitle}>{offer.title}</Text>
        <View style={s.cardFoot}>
          <View style={s.codeChip}><Text numberOfLines={1} style={s.codeText}>{offer.code ?? 'Automatic'}</Text></View>
          <Icon name="chevron-forward" size={14} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/** Explore: "Offers for you". Two full cards across (three on tablets), snapping card by card. Hidden when there are none. */
export function OffersRail({ onSeeAll, onOpen }: { onSeeAll: () => void; onOpen: (offer: Offer) => void }) {
  const { colors } = useTheme();
  const offers = useOffers();
  const width = useColumnWidth();
  const list = offers.data ?? [];
  if (!list.length) return null;
  const pad = 12;
  const gap = 12;
  const per = width >= 700 ? 3 : 2;
  const slots = Math.max(1, Math.min(per, list.length));
  const cardWidth = Math.floor((width - pad * 2 - gap * (slots - 1)) / slots);
  return (
    <View>
      <SectionHead title="Offers for you" caption="Discounts and free delivery from Sokoni Hub" right={<Text onPress={onSeeAll} style={{ color: colors.brown, fontSize: 11.5, fontWeight: '700' }}>See all →</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + gap} snapToAlignment="start" decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: pad, gap }}>
        {list.map((offer) => <OfferCard key={offer.id} offer={offer} width={cardWidth} onPress={() => onOpen(offer)} />)}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------------------------ list row */
export function OfferRow({ offer, onUse }: { offer: Offer; onUse: () => void }) {
  const { colors, theme } = useTheme();
  const solid = accentSolid(offer.accent);
  const ink = accentInk(offer.accent, theme === 'dark');
  const terms = offerTerms(offer);
  return (
    <Panel accent={solid} style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: `${ink}${theme === 'dark' ? '2B' : '1F'}` }]}><Icon name={kindIcon(offer.kind)} solid={false} size={20} color={ink} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={s.rowHead}>
          <Text numberOfLines={2} style={[s.rowTitle, { color: colors.text }]}>{offer.title}</Text>
          {offer.badge ? <View style={[s.rowBadge, { backgroundColor: `${ink}26` }]}><Text style={{ fontSize: 9, fontWeight: '700', color: ink, letterSpacing: 0.4 }}>{offer.badge}</Text></View> : null}
        </View>
        <Text style={[s.rowHeadline, { color: ink }]}>{offerHeadline(offer)}</Text>
        {offer.description ? <Text style={{ fontSize: 11, lineHeight: 15, color: colors.text2 }}>{offer.description}</Text> : null}
        {terms.length ? <Text style={{ fontSize: 10.5, lineHeight: 15, color: colors.muted, fontWeight: '500' }}>{terms.join(' · ')}</Text> : null}
        <View style={s.rowFoot}>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: colors.brown }}>{offerEnds(offer.ends_at)}</Text>
          {offer.code ? <View style={[s.rowCode, { borderColor: ink }]}><Text style={{ fontSize: 10, fontWeight: '700', color: ink, letterSpacing: 0.6 }}>{offer.code}</Text></View> : <Text style={{ fontSize: 10.5, color: colors.muted }}>Applies automatically</Text>}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={offer.code ? `Use code ${offer.code}` : `Shop ${offer.title}`} onPress={() => { tap(); onUse(); }} style={({ pressed }) => [s.rowCta, { backgroundColor: offer.code ? solid : colors.lav2, opacity: pressed ? 0.88 : 1 }]}>
        <Text style={{ fontSize: 11.5, fontWeight: '700', color: offer.code ? '#FFFFFF' : colors.primary }}>{offer.code ? 'Use code' : 'Shop now'}</Text>
      </Pressable>
    </Panel>
  );
}

/* ----------------------------------------------------------------------------- cart promo card */
/**
 * "Have a promo code?" Shows what the server said about the applied code, the automatic offers already in the
 * total, and how close the buyer is to the next one. `quote` is the cart's current server quote.
 */
export function PromoCard({ applied, quote, checking, error, onApply, onRemove, onSeeOffers, hasOffers, skipFreeDeliveryHint = false }: {
  applied: string; quote: CartQuote | null; checking: boolean; error: string;
  onApply: (code: string) => void; onRemove: () => void; onSeeOffers: () => void; hasOffers: boolean;
  /** The cart is already showing a nearer free-delivery bar, so do not show a second, farther one here. */
  skipFreeDeliveryHint?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const currency = quote?.currency || 'QAR';
  const promo = quote?.promo;
  const saving = (quote?.discount ?? 0) + (quote?.delivery_discount ?? 0);
  const autos = (quote?.applied_offers ?? []).filter((o) => !o.code);
  const hints = (quote?.hints ?? []).filter((h) => !(skipFreeDeliveryHint && h.kind === 'free_delivery'));

  return (
    <Panel style={{ marginHorizontal: 12, marginTop: 10, gap: 8 }}>
      <View style={s.promoHead}>
        <View style={[s.promoIcon, { backgroundColor: colors.orangeSoft }]}><Icon name="ticket" solid={false} size={16} color={colors.orange} /></View>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text }}>Promo code</Text>
        {hasOffers ? <Pressable accessibilityRole="button" hitSlop={8} onPress={onSeeOffers}><Text style={{ fontSize: 11, fontWeight: '700', color: colors.brown }}>See offers →</Text></Pressable> : null}
      </View>

      {applied ? (
        promo?.ok ? (
          <View style={[s.applied, { backgroundColor: colors.primarySoft, borderColor: colors.primaryLine }]}>
            <Icon name="checkmark-circle" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{applied} applied</Text>
              <Text numberOfLines={2} style={{ fontSize: 10.5, color: colors.text2 }}>{saving > 0 ? `You save ${money(saving, currency)}` : promo.message}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove code ${applied}`} hitSlop={8} onPress={onRemove}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.dangerText }}>Remove</Text></Pressable>
          </View>
        ) : promo ? (
          <View style={[s.applied, { backgroundColor: colors.warningSoft, borderColor: colors.orangeLine }]}>
            <Icon name="warning" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{applied} can’t be used</Text>
              <Text numberOfLines={3} style={{ fontSize: 10.5, color: colors.text2 }}>{promo.message}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove code ${applied}`} hitSlop={8} onPress={onRemove}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.dangerText }}>Remove</Text></Pressable>
          </View>
        ) : (
          <View style={[s.applied, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Icon name="ticket" solid={false} size={18} color={colors.muted} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.text2 }}>Checking {applied}…</Text>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onRemove}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.dangerText }}>Remove</Text></Pressable>
          </View>
        )
      ) : open ? (
        <View style={{ gap: 6 }}>
          <View style={s.inputRow}>
            <TextInput
              accessibilityLabel="Promo code" value={text} onChangeText={(v) => setText(v.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} autoCapitalize="characters" autoCorrect={false} maxLength={24}
              placeholder="Enter code" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={() => onApply(text)} autoFocus
              style={[s.input, { color: colors.text, backgroundColor: colors.surface2, borderColor: error ? colors.danger : colors.border }]}
            />
            <Pressable accessibilityRole="button" disabled={checking || text.trim().length < 3} onPress={() => onApply(text)} style={({ pressed }) => [s.applyBtn, { backgroundColor: colors.primary, opacity: checking || text.trim().length < 3 ? 0.5 : pressed ? 0.88 : 1 }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onPrimary }}>{checking ? 'Checking…' : 'Apply'}</Text>
            </Pressable>
          </View>
          {error ? <Text style={{ fontSize: 10.5, color: colors.dangerText, fontWeight: '600' }}>{error}</Text> : null}
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[s.addRow, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
          <Text style={{ flex: 1, fontSize: 12, color: colors.text2 }}>Have a promo code?</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Add code</Text>
        </Pressable>
      )}

      {autos.map((o) => (
        <View key={o.offer_id} style={[s.auto, { backgroundColor: colors.primarySoft }]}>
          <Icon name="sparkles" size={13} color={colors.primary} />
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 11, fontWeight: '600', color: colors.text }}>{o.title}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>−{money(o.goods_discount + o.delivery_discount, currency)}</Text>
        </View>
      ))}

      {hints.map((h) => (
        <View key={h.offer_id} style={[s.hint, { backgroundColor: colors.orangeSoft, borderColor: colors.orangeLine }]}>
          <View style={s.hintTop}>
            <Icon name={isDeliveryKind(h.kind) ? 'car' : 'gift'} solid={false} size={14} color={colors.orange} />
            <Text style={{ flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '600', color: colors.text }}>{h.text}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text2 }}>{Math.round(h.progress * 100)}%</Text>
          </View>
          <View style={[s.bar, { backgroundColor: colors.surface }]}><View style={[s.barFill, { width: `${Math.max(4, Math.round(h.progress * 100))}%`, backgroundColor: colors.orange }]} /></View>
        </View>
      ))}
    </Panel>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, padding: 10, overflow: 'hidden', gap: 2, minHeight: 112 },
  circle: { position: 'absolute', right: -22, top: -26, width: 86, height: 86, borderRadius: 43, backgroundColor: 'rgba(255,255,255,0.12)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 7, paddingHorizontal: 6, height: 16, justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '700', letterSpacing: 0.6 },
  iconDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headline: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: -0.3, marginTop: 6 },
  cardTitle: { color: 'rgba(255,255,255,0.92)', fontSize: 10.5, lineHeight: 14, fontWeight: '500' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6, gap: 6 },
  codeChip: { flexShrink: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed', paddingHorizontal: 7, height: 20, justifyContent: 'center' },
  codeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, paddingLeft: 13 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  rowTitle: { flex: 1, fontSize: 12.5, fontWeight: '700', lineHeight: 16 },
  rowBadge: { borderRadius: 7, paddingHorizontal: 6, height: 16, justifyContent: 'center' },
  rowHeadline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  rowCode: { borderRadius: 7, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 6, height: 18, justifyContent: 'center' },
  rowCta: { borderRadius: 10, paddingHorizontal: 10, height: 32, alignItems: 'center', justifyContent: 'center' },

  promoHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, borderWidth: 1, padding: 9 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 11, height: 38 },
  inputRow: { flexDirection: 'row', gap: 6 },
  input: { flex: 1, height: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  applyBtn: { height: 38, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 9, height: 30 },
  hint: { borderRadius: 11, borderWidth: 1, padding: 9, gap: 6 },
  hintTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
});
