/**
 * Sokoni Hub design kit — the shared building blocks of the redesigned consumer app:
 * header, search, pills, status pills, rating chip, price, quantity stepper and banners.
 * Screens compose these; nothing in here knows about a specific screen.
 */
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCity } from './city';
import { isActiveOrder, isUpcomingBooking, useMyBookings, useMyOrders } from './data';
import { num } from './format';
import { tap } from './haptics';
import { Icon, type IconName } from './icons';
import type { Go, TabTo } from './nav';
import { useAuth, useCart, useTheme, type Colors } from './providers';
import { Chip, Dropdown, Text, TextInput } from './ui';

/** Soft card shadow used across the app. */
export const softShadow = (color: string, level: 1 | 2 = 1): ViewStyle => ({
  shadowColor: color, shadowOpacity: level === 1 ? 0.07 : 0.12, shadowRadius: level === 1 ? 14 : 22, shadowOffset: { width: 0, height: level === 1 ? 4 : 10 }, elevation: level === 1 ? 2 : 5,
});

/* ---------------------------------------------------------------------------------- Thumb */
/** Photo with a tinted icon placeholder, so a missing or slow image never leaves a hole. */
export function Thumb({ uri, style, icon = 'basket-outline', iconSize = 26, fit = 'cover' }: { uri?: string | null; style?: StyleProp<ViewStyle>; icon?: IconName; iconSize?: number; fit?: 'cover' | 'contain' }) {
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setLoaded(false); setFailed(false); }, [uri]);
  return (
    <View style={[{ backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {!loaded || failed || !uri ? <Icon name={icon} size={iconSize} color={colors.primary} /> : null}
      {uri && !failed ? <ExpoImage source={{ uri }} contentFit={fit} transition={160} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** Circle / rounded-square avatar: the seller's logo or the person's initials. */
export function Avatar({ name, uri, size = 40, square = false, tone = 'deep' }: { name?: string | null; uri?: string | null; size?: number; square?: boolean; tone?: 'deep' | 'mint' | 'lav' | 'orange' }) {
  const { colors } = useTheme();
  const bg = tone === 'deep' ? colors.deep : tone === 'mint' ? colors.primarySoft : tone === 'orange' ? colors.orangeSoft : colors.lav2;
  const fg = tone === 'deep' ? colors.onDeep : tone === 'orange' ? colors.gold : colors.primary;
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '';
  const radius = square ? Math.round(size * 0.3) : size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <ExpoImage source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : letters ? <Text style={{ color: fg, fontSize: Math.round(size * 0.38), fontWeight: '800' }}>{letters}</Text> : <Icon name="person" size={Math.round(size * 0.5)} color={fg} />}
    </View>
  );
}

/* --------------------------------------------------------------------------------- AppBar */
/** The header on every main screen: brand, city picker, notifications, cart and profile. */
export function AppBar({ go, tab }: { go: Go; tab: TabTo }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { count } = useCart();
  const { city, setCity, cities } = useCity();
  const orders = useMyOrders();
  const bookings = useMyBookings();
  const attention = !!user && ((orders.data ?? []).some((o) => isActiveOrder(o.status)) || (bookings.data ?? []).some(isUpcomingBooking));
  const options = [{ value: '', label: 'All of Qatar' }, ...cities.map((c) => ({ value: c, label: c }))];
  return (
    <View style={[kit.appBar, { backgroundColor: colors.surface, borderBottomColor: colors.border, shadowColor: colors.shadow }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Sokoni Hub home" onPress={() => tab('home')} style={[kit.logoTile, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}>
        <Image source={require('../assets/logo-mark.png')} style={kit.logoImage} />
      </Pressable>
      <View style={kit.brandCol}>
        <Pressable accessibilityRole="button" onPress={() => tab('home')} hitSlop={4}>
          <Text style={[kit.brand, { color: colors.text }]}>Sokoni <Text style={{ color: colors.orange }}>Hub</Text></Text>
        </Pressable>
        <Dropdown value={city} options={options} onChange={setCity} menuWidth={220} style={kit.cityTrigger} renderTrigger={() => (
          <View style={kit.cityRow}>
            <Icon name="location" size={13} color={colors.orange} />
            <Text numberOfLines={1} style={[kit.cityText, { color: colors.text2 }]}>{city ? `${city}, Qatar` : 'All of Qatar'}</Text>
            <Icon name="chevron-down" size={12} color={colors.muted} />
          </View>
        )} />
      </View>
      <View style={kit.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={attention ? 'Notifications, new activity' : 'Notifications'} hitSlop={6} onPress={() => { tap(); go('notifications'); }} style={kit.action}>
          <Icon name="notifications" solid={false} size={24} color={colors.text} />
          {attention ? <View style={[kit.dot, { backgroundColor: colors.orange, borderColor: colors.surface }]} /> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={count ? `Cart, ${count} items` : 'Cart'} hitSlop={6} onPress={() => { tap(); tab('cart'); }} style={kit.action}>
          <Icon name="bag-handle" solid={false} size={24} color={colors.text} />
          {count > 0 ? <View style={[kit.countBadge, { backgroundColor: colors.orange, borderColor: colors.surface }]}><Text style={[kit.countText, { color: colors.onOrange }]}>{count > 9 ? '9+' : count}</Text></View> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={user ? 'Profile' : 'Sign in'} hitSlop={6} onPress={() => { tap(); if (user) tab('account'); else go('login'); }}>
          <Avatar name={user?.full_name} size={40} />
        </Pressable>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------------------------- Tabs */
const BAR_H = 64;
const LIFT = 24;
const FAB = 58;
type TabKey = 'home' | 'browse' | 'services' | 'cart' | 'account';

/**
 * Bottom navigation. The Services button is raised and orange. It is a direct child of the (taller,
 * touch-transparent) container so the part that rises above the bar stays tappable on Android too.
 */
export function Tabs({ active, tab, kind }: { active: string; tab: TabTo; kind?: string }) {
  const { colors } = useTheme();
  const { count } = useCart();
  const insets = useSafeInsetBottom();
  const current: TabKey | null = active === 'browse' ? (kind === 'service' ? 'services' : 'browse') : (['home', 'services', 'cart', 'account'] as string[]).includes(active) ? (active as TabKey) : null;
  const items: { key: TabKey; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Explore', icon: 'compass' },
    { key: 'browse', label: 'Categories', icon: 'grid' },
    { key: 'services', label: 'Services', icon: 'scissors' },
    { key: 'cart', label: 'Cart', icon: 'bag-handle' },
    { key: 'account', label: 'Profile', icon: 'person' },
  ];
  const press = (key: TabKey) => { tap(); tab(key); };
  return (
    <View pointerEvents="box-none" style={{ marginTop: -LIFT, height: BAR_H + LIFT + insets, zIndex: 20 }}>
      <View style={[kit.tabBar, { height: BAR_H + insets, paddingBottom: insets, backgroundColor: colors.tab, borderTopColor: colors.border, shadowColor: colors.shadow }]}>
        {items.map((item) => {
          const selected = current === item.key;
          if (item.key === 'services') {
            return (
              <Pressable key={item.key} accessibilityRole="button" accessibilityLabel="Services" accessibilityState={{ selected }} onPress={() => press('services')} style={kit.tabItem}>
                <View style={{ height: 26 }} />
                <Text style={[kit.tabLabel, { color: colors.brown, fontWeight: '800', marginTop: 6 }]}>Services</Text>
              </Pressable>
            );
          }
          const color = selected ? colors.primary : colors.muted;
          return (
            <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => press(item.key)} style={kit.tabItem}>
              <View>
                <Icon name={item.icon} solid={selected} size={24} color={color} />
                {item.key === 'cart' && count > 0 ? <View style={[kit.tabBadge, { backgroundColor: colors.orange, borderColor: colors.tab }]}><Text style={[kit.countText, { color: colors.onOrange }]}>{count > 9 ? '9+' : count}</Text></View> : null}
              </View>
              <Text style={[kit.tabLabel, { color: selected ? colors.text : colors.muted, fontWeight: selected ? '800' : '600' }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View pointerEvents="box-none" style={kit.fabWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel="Services" onPress={() => press('services')} style={({ pressed }) => [kit.fab, { backgroundColor: colors.orange, borderColor: colors.tab, shadowColor: colors.orange, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
          <Icon name="scissors" solid={false} size={27} color={colors.onOrange} />
        </Pressable>
      </View>
    </View>
  );
}
function useSafeInsetBottom() { return Math.max(useSafeAreaInsets().bottom, 6); }
/** Height the toast must clear: tab bar + home indicator + a little air. */
export const TAB_CLEARANCE = BAR_H + 22;

/* --------------------------------------------------------------------------- page titles */
/** Left-aligned page title with optional back arrow, subtitle and a trailing action. */
export function PageTitle({ title, subtitle, back, right, badge }: { title: string; subtitle?: string; back?: () => void; right?: ReactNode; badge?: string | number }) {
  const { colors } = useTheme();
  return (
    <View style={kit.pageTitle}>
      {back ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={back} style={kit.pageBack}><Icon name="arrow-back" size={24} color={colors.text} /></Pressable> : null}
      <View style={{ flex: 1 }}>
        <View style={kit.pageTitleRow}>
          <Text style={[kit.pageTitleText, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          {badge !== undefined ? <View style={[kit.titleBadge, { backgroundColor: colors.primarySoft }]}><Text style={[kit.titleBadgeText, { color: colors.primary }]}>{badge}</Text></View> : null}
        </View>
        {subtitle ? <Text style={[kit.pageSubtitle, { color: colors.text2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Round white icon button used in page headers (search, help, calendar...). */
export function RoundButton({ icon, onPress, label, tone = 'white', size = 44 }: { icon: IconName; onPress: () => void; label: string; tone?: 'white' | 'lav'; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'white' ? colors.surface : colors.lav2, borderWidth: tone === 'white' ? StyleSheet.hairlineWidth : 0, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }, tone === 'white' ? softShadow(colors.shadow) : null]}>
      <Icon name={icon} size={Math.round(size * 0.45)} solid={false} color={colors.text} />
    </Pressable>
  );
}

/** Centered sub-header: round back button, small eyebrow, title and a trailing round action. */
export function SubBar({ title, eyebrow, back, right }: { title: string; eyebrow?: string; back: () => void; right?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={kit.subBar}>
      <RoundButton icon="arrow-back" label="Go back" onPress={back} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        {eyebrow ? <Text style={[kit.eyebrowBrown, { color: colors.brown }]}>{eyebrow}</Text> : null}
        <Text numberOfLines={1} style={[kit.subBarTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

/* ----------------------------------------------------------------------------- search */
export function SearchBar({ value, onChangeText, onSubmit, placeholder, onFilter, filterCount = 0, inputRef, onFocus, style }: {
  value: string; onChangeText: (text: string) => void; onSubmit?: () => void; placeholder: string; onFilter?: () => void; filterCount?: number;
  inputRef?: Ref<TextInput>; onFocus?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[kit.searchRow, style]}>
      <View style={[kit.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow)]}>
        <Icon name="search" solid={false} size={21} color={colors.text2} />
        <TextInput ref={inputRef} accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} onFocus={onFocus} placeholder={placeholder} placeholderTextColor={colors.muted} returnKeyType="search" autoCorrect={false} onSubmitEditing={onSubmit} style={[kit.searchInput, { color: colors.text }]} />
        {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText('')}><Icon name="close-circle" size={20} color={colors.muted} /></Pressable> : null}
      </View>
      {onFilter ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Filters and sorting" onPress={() => { tap(); onFilter(); }} style={[kit.filterButton, { backgroundColor: colors.lav2 }]}>
          <Icon name="tune" solid={false} size={23} color={colors.text} />
          {filterCount > 0 ? <View style={[kit.filterBadge, { backgroundColor: colors.orange, borderColor: colors.lav2 }]}><Text style={[kit.countText, { color: colors.onOrange }]}>{filterCount}</Text></View> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------------------ chips */
export type PillItem = { key: string; label: string; icon?: IconName };
/** Horizontally scrolling filter chips ("All", "Foodstuffs", ...). */
export function PillRow({ items, active, onSelect, style }: { items: PillItem[]; active: string; onSelect: (key: string) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={[{ flexGrow: 0 }, style]} contentContainerStyle={kit.pillRow}>
      {items.map((item) => <Chip key={item.key} selected={active === item.key} onPress={() => onSelect(item.key)}>{item.label}</Chip>)}
    </ScrollView>
  );
}

/** Segmented control on a lilac track: "Upcoming 1 | Completed 3 | Cancelled 0". */
export function SegTabs({ items, active, onChange }: { items: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[kit.seg, { backgroundColor: colors.lav2 }]}>
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { tap(); onChange(item.key); }} style={[kit.segItem, on && [{ backgroundColor: colors.surface }, softShadow(colors.shadow)]]}>
            <Text numberOfLines={1} style={[kit.segText, { color: on ? colors.primary : colors.text2 }]}>{item.label}</Text>
            {item.count !== undefined ? <View style={[kit.segCount, { backgroundColor: on ? colors.primarySoft : colors.border }]}><Text style={[kit.segCountText, { color: on ? colors.primary : colors.text2 }]}>{item.count}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------------------- pills */
export type Tone = 'mint' | 'orange' | 'solidOrange' | 'lav' | 'rose' | 'amber' | 'deep' | 'white' | 'ghost';
export const toneColors = (c: Colors, tone: Tone) => ({
  mint: { bg: c.primarySoft, fg: c.primary },
  orange: { bg: c.orangeSoft, fg: c.gold },
  solidOrange: { bg: c.orange, fg: c.onOrange },
  lav: { bg: c.lav2, fg: c.text2 },
  rose: { bg: c.dangerSoft, fg: c.dangerText },
  amber: { bg: c.warningSoft, fg: c.warning },
  deep: { bg: c.deep, fg: c.onDeep },
  white: { bg: c.surface, fg: c.text },
  ghost: { bg: 'transparent', fg: c.text2 },
}[tone]);

/** Small rounded tag: "VIP", "Home visit", "3.5 hrs"... */
export function Pill({ tone = 'mint', icon, children, upper = false, small = false, style }: { tone?: Tone; icon?: IconName; children: ReactNode; upper?: boolean; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { bg, fg } = toneColors(colors, tone);
  return (
    <View style={[kit.pill, small && kit.pillSmall, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} solid={false} size={small ? 11 : 14} color={fg} /> : null}
      <Text numberOfLines={1} style={{ color: fg, fontSize: small ? 10 : 12.5, fontWeight: '800', letterSpacing: upper ? 0.5 : 0 }}>{upper && typeof children === 'string' ? children.toUpperCase() : children}</Text>
    </View>
  );
}

type StatusLook = { tone: Tone; icon: IconName; label: string };
/** One place that turns an order / booking status into a label, colour and icon. */
export function orderLook(status: string, opts: { pickup?: boolean; disputed?: boolean } = {}): StatusLook {
  switch (status) {
    case 'pending': return { tone: 'amber', icon: 'time', label: 'Awaiting seller' };
    case 'confirmed':
    case 'dispatched': return { tone: 'orange', icon: 'cube', label: opts.pickup ? 'Preparing for pickup' : 'Seller preparing' };
    case 'dispatched_to_driver': return { tone: 'mint', icon: 'car', label: 'Rider assigned' };
    case 'driver_arrived': return { tone: 'mint', icon: 'car', label: 'Rider at the store' };
    case 'out_for_delivery': return { tone: 'mint', icon: 'car', label: 'On the way' };
    case 'delivered_pending_verification': return opts.disputed ? { tone: 'rose', icon: 'flag', label: 'Problem reported' } : { tone: 'amber', icon: 'checkmark-circle', label: 'Please confirm' };
    case 'delivered': return { tone: 'mint', icon: 'checkmark-circle', label: opts.pickup ? 'Collected' : 'Delivered' };
    case 'cancelled': return { tone: 'rose', icon: 'close-circle', label: 'Cancelled' };
    default: return { tone: 'lav', icon: 'time', label: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) };
  }
}
export function bookingLook(status: string): StatusLook {
  switch (status) {
    case 'new': return { tone: 'amber', icon: 'time', label: 'Awaiting provider' };
    case 'contacted': return { tone: 'lav', icon: 'chat', label: 'Provider replied' };
    case 'confirmed': return { tone: 'mint', icon: 'checkmark-circle', label: 'Confirmed by provider' };
    case 'completed': return { tone: 'mint', icon: 'checkmark-circle', label: 'Completed' };
    case 'cancelled': return { tone: 'rose', icon: 'close-circle', label: 'Cancelled' };
    case 'no_show': return { tone: 'rose', icon: 'ban', label: 'No-show' };
    default: return { tone: 'lav', icon: 'time', label: status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) };
  }
}
export function StatusPill({ look, small, compact }: { look: StatusLook; small?: boolean; compact?: boolean }) {
  return <Pill tone={look.tone} icon={compact ? undefined : look.icon} small={small}>{look.label}</Pill>;
}

/** White "★ 4.9 (42)" chip that sits on top of a photo. */
export function RatingChip({ avg, count, flat = false }: { avg: number; count?: number; flat?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[kit.rating, { backgroundColor: flat ? colors.surface2 : 'rgba(255,255,255,0.96)' }]}>
      <Icon name="star" solid size={13} color={colors.orange} />
      <Text style={[kit.ratingAvg, { color: '#111827' }]}>{avg.toFixed(1)}</Text>
      {count !== undefined ? <Text style={[kit.ratingCount, { color: '#5B6674' }]}>({count})</Text> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------------- price */
/** "From 220 QAR": bold number, small currency. */
export function Price({ value, currency = 'QAR', size = 22, from = false, color, suffix }: { value: number | string; currency?: string; size?: number; from?: boolean; color?: string; suffix?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  return (
    <Text style={{ color: c }}>
      {from ? <Text style={{ fontSize: Math.max(11, Math.round(size * 0.55)), fontWeight: '600', color: colors.text2 }}>From </Text> : null}
      <Text style={{ fontSize: size, fontWeight: '800', color: c }}>{num(value)}</Text>
      <Text style={{ fontSize: Math.max(10, Math.round(size * 0.5)), fontWeight: '700', color: c }}> {currency}</Text>
      {suffix ? <Text style={{ fontSize: Math.max(10, Math.round(size * 0.5)), fontWeight: '600', color: colors.text2 }}> {suffix}</Text> : null}
    </Text>
  );
}

/** − 1 + control from the cart. */
export function QtyStepper({ qty, onMinus, onPlus, max, label }: { qty: number; onMinus: () => void; onPlus: () => void; max?: number; label: string }) {
  const { colors } = useTheme();
  const atMax = max !== undefined && qty >= max;
  const btn = (disabled: boolean) => [kit.stepBtn, { backgroundColor: colors.surface, opacity: disabled ? 0.45 : 1 }, softShadow(colors.shadow)];
  return (
    <View style={[kit.stepper, { backgroundColor: colors.lav2 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity of ${label}`} hitSlop={6} disabled={qty <= 1} onPress={() => { tap(); onMinus(); }} style={btn(qty <= 1)}><Icon name="remove" size={16} color={colors.text} /></Pressable>
      <Text style={[kit.stepQty, { color: colors.text }]}>{qty}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity of ${label}`} hitSlop={6} disabled={atMax} onPress={() => { tap(); onPlus(); }} style={btn(atMax)}><Icon name="add" size={16} color={colors.text} /></Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------- sort and view toggle */
/** "Sort: Popular ⌄" dropdown pill. */
export function SortPill<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const { colors } = useTheme();
  return (
    <Dropdown value={value} options={options} onChange={(v) => onChange(v as T)} menuWidth={220} renderTrigger={(label) => (
      <View style={[kit.sortPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View>
          <Text style={[kit.sortCaption, { color: colors.text2 }]}>Sort:</Text>
          <Text numberOfLines={1} style={[kit.sortValue, { color: colors.text }]}>{label}</Text>
        </View>
        <Icon name="chevron-down" size={15} color={colors.text} />
      </View>
    )} />
  );
}

/** Grid / list switch. */
export function ViewToggle({ mode, onChange }: { mode: 'grid' | 'list'; onChange: (mode: 'grid' | 'list') => void }) {
  const { colors } = useTheme();
  return (
    <View style={[kit.viewToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {(['grid', 'list'] as const).map((m) => (
        <Pressable key={m} accessibilityRole="button" accessibilityLabel={m === 'grid' ? 'Grid view' : 'List view'} accessibilityState={{ selected: mode === m }} onPress={() => { tap(); onChange(m); }} style={[kit.viewBtn, mode === m && { backgroundColor: colors.primarySoft }]}>
          <Icon name={m === 'grid' ? 'grid' : 'list'} solid={false} size={19} color={mode === m ? colors.primary : colors.text2} />
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------------- section headers */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const { colors } = useTheme();
  return <Text style={[kit.eyebrow, { color: color ?? colors.text2 }]}>{typeof children === 'string' ? children.toUpperCase() : children}</Text>;
}

/** Uppercase label with an optional "See All →" link. */
export function SectionLabel({ title, action, onAction, dot = false }: { title: string; action?: string; onAction?: () => void; dot?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={kit.sectionLabel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
        {dot ? <View style={[kit.labelDot, { backgroundColor: colors.orange }]} /> : null}
        <Text numberOfLines={1} style={[kit.eyebrow, { color: dot ? colors.brown : colors.text2 }]}>{title.toUpperCase()}</Text>
      </View>
      {action ? <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={[kit.seeAll, { color: colors.brown }]}>{action}</Text><Icon name="arrow-forward" size={14} color={colors.brown} /></Pressable> : null}
    </View>
  );
}

/** Bold section heading with optional caption underneath and a trailing control. */
export function SectionHead({ title, caption, right, style, wrap = false }: { title: string; caption?: string; right?: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  const { colors } = useTheme();
  // `wrap`: when the title and the controls do not fit on one line (small phones), the controls drop to their own right-aligned line.
  return (
    <View style={[kit.sectionHead, wrap && { flexWrap: 'wrap', rowGap: 10 }, style]}>
      <View style={wrap ? { flexGrow: 1, flexShrink: 1 } : { flex: 1 }}>
        <Text style={[kit.sectionTitle, { color: colors.text }]}>{title}</Text>
        {caption ? <Text style={[kit.sectionCaption, { color: colors.text2 }]}>{caption}</Text> : null}
      </View>
      {right ? (wrap ? <View style={{ marginLeft: 'auto' }}>{right}</View> : right) : null}
    </View>
  );
}

/** Pale-green reassurance card ("Sokoni Quality Guarantee"). */
export function TrustBanner({ icon = 'shield-checkmark', title, text, tone = 'mint' }: { icon?: IconName; title: string; text: string; tone?: 'mint' | 'lav' | 'orange' }) {
  const { colors } = useTheme();
  const bg = tone === 'mint' ? colors.primarySoft : tone === 'lav' ? colors.surface2 : colors.orangeSoft;
  return (
    <View style={[kit.banner, { backgroundColor: bg }]}>
      <View style={[kit.bannerIcon, { backgroundColor: tone === 'orange' ? colors.orange : colors.primary }]}><Icon name={icon} solid={false} size={24} color={tone === 'orange' ? colors.onOrange : '#FFFFFF'} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[kit.bannerTitle, { color: tone === 'orange' ? colors.brown : colors.primary }]}>{title}</Text>
        <Text style={[kit.bannerText, { color: colors.text }]}>{text}</Text>
      </View>
    </View>
  );
}

/** Icon in a soft square plus a bold line and a quiet line, as in the booking details block. */
export function InfoLine({ icon, title, sub, tint }: { icon: IconName; title: string; sub?: string; tint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={kit.infoLine}>
      <View style={[kit.infoIcon, { backgroundColor: colors.surface }]}><Icon name={icon} solid={false} size={21} color={tint ?? colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[kit.infoTitle, { color: colors.text }]}>{title}</Text>
        {sub ? <Text style={[kit.infoSub, { color: colors.text2 }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** Delivery / Pick-up choice card used by the cart and checkout. */
export function ModeCard({ selected, icon, title, sub, price, onPress }: { selected: boolean; icon: 'car' | 'storefront'; title: string; sub: string; price: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={`${title}, ${sub}, ${price}`} onPress={onPress} style={[kit.mode, selected ? [{ backgroundColor: colors.surface, borderColor: colors.primary }, softShadow(colors.shadow)] : { backgroundColor: colors.surface2, borderColor: 'transparent' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Icon name={icon} solid={false} size={24} color={selected ? colors.primary : colors.text2} />
        {selected ? <View style={[kit.check, { backgroundColor: colors.primary }]}><Icon name="check" size={13} color={colors.onPrimary} /></View> : <View style={[kit.radioDot, { borderColor: colors.border }]} />}
      </View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 12 }}>{title}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text2, marginTop: 2 }}>{sub}</Text>
      <Text style={{ fontSize: 15.5, fontWeight: '800', color: price === 'Free' ? colors.primary : colors.brown, marginTop: 10 }}>{price}</Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------------------- loading */
/** Pulsing placeholder block while data loads. */
export function Skeleton({ width = '100%', height = 16, radius = 10, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.lav2, opacity: pulse }, style]} />;
}

/** The standard white card shell. */
export function Panel({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const { colors } = useTheme();
  const base = [kit.panel, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow(colors.shadow), style];
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.94 : 1 }]}>{children}</Pressable>;
  return <View style={base}>{children}</View>;
}

/** Widest the app column grows. Tablets and the web preview get a centred phone-width column. */
export const COLUMN_MAX = 640;
export function useColumnWidth() { return Math.min(useWindowDimensions().width, COLUMN_MAX); }

/** Shared page frame: lilac background, header on top, scroll body, tab bar underneath. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[{ flex: 1, width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' }, style]}>{children}</View>
    </View>
  );
}

const kit = StyleSheet.create({
  appBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3, zIndex: 5 },
  logoTile: { width: 44, height: 44, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 34, height: 34, resizeMode: 'contain' },
  brandCol: { flex: 1, minWidth: 0 },
  brand: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, lineHeight: 24 },
  cityTrigger: { alignSelf: 'flex-start' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1 },
  cityText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  action: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 5, right: 3, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  countBadge: { position: 'absolute', top: 1, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 8 },
  tabLabel: { fontSize: 11.5, lineHeight: 14 },
  tabBadge: { position: 'absolute', top: -5, right: -9, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  fabWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  fab: { width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 4, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 16 },
  pageTitle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pageBack: { width: 32, height: 40, justifyContent: 'center' },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageTitleText: { fontSize: 29, fontWeight: '800', letterSpacing: -0.6, flexShrink: 1 },
  pageSubtitle: { fontSize: 14.5, lineHeight: 21, marginTop: 4 },
  titleBadge: { borderRadius: 10, paddingHorizontal: 9, height: 22, alignItems: 'center', justifyContent: 'center' },
  titleBadgeText: { fontSize: 12, fontWeight: '800' },
  subBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  subBarTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  eyebrowBrown: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchBox: { flex: 1, height: 54, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchInput: { flex: 1, fontSize: 15, height: 52, paddingVertical: 0 },
  filterButton: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pillRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 2 },
  seg: { flexDirection: 'row', borderRadius: 24, padding: 5, gap: 2 },
  segItem: { flex: 1, height: 46, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3 },
  segText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  segCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  segCountText: { fontSize: 11.5, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, height: 32, borderRadius: 16 },
  pillSmall: { height: 22, borderRadius: 11, paddingHorizontal: 8, gap: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, height: 28, borderRadius: 14 },
  ratingAvg: { fontSize: 13, fontWeight: '800' },
  ratingCount: { fontSize: 12.5, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 4, gap: 6 },
  stepBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepQty: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  sortPill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13 },
  sortCaption: { fontSize: 10.5, fontWeight: '600', lineHeight: 12 },
  sortValue: { fontSize: 13.5, fontWeight: '800', lineHeight: 17, maxWidth: 108 },
  viewToggle: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, gap: 2 },
  viewBtn: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 24, marginBottom: 12 },
  labelDot: { width: 8, height: 8, borderRadius: 4 },
  seeAll: { fontSize: 14, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionCaption: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  banner: { marginHorizontal: 16, marginTop: 24, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bannerIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  bannerText: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  infoIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 15.5, fontWeight: '800' },
  infoSub: { fontSize: 13.5, lineHeight: 19, marginTop: 1, fontWeight: '600' },
  panel: { borderRadius: 22, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  mode: { flex: 1, borderRadius: 22, borderWidth: 1.5, padding: 16 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
});
