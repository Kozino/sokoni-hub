import React, { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { ICON_SVG, IconName } from './heroicons';
import { C, TONES, Tone } from '../theme';
import { fw } from './type';
import { initialsOf } from '../format';
import { useVendor } from '../providers/VendorContext';

/** Heroicon rendered as SVG. Colour is applied by replacing the currentColor placeholder. */
export function Icon({ name, size = 20, color = C.text, solid = false }: { name: IconName; size?: number; color?: string; solid?: boolean }) {
  const entry = ICON_SVG[name];
  const raw = (solid && entry.solid) || entry.outline || '';
  return <SvgXml xml={raw.split('currentColor').join(color)} width={size} height={size} />;
}

/** White rounded card with a soft border and a very light shadow. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
}

export function Pill({ label, tone = 'slate', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]} accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={13} color={t.fg} solid /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Filter chips. The wrapper has a fixed height and the scroller does not grow, so chips keep their size. */
export function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={styles.chipsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
        {items.map((i) => {
          const on = i.key === value;
          return (
            <Pressable
              key={i.key || 'all'}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={i.count ? `${i.label}, ${i.count}` : i.label}
              onPress={() => onChange(i.key)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{i.label}</Text>
              {i.count ? (
                <View style={[styles.chipCount, on && styles.chipCountOn]}>
                  <Text style={[styles.chipCountText, on && styles.chipCountTextOn]}>{i.count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Segmented control for two or three sibling views on one screen. */
export function Segmented<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {items.map((i) => {
        const on = i.key === value;
        return (
          <Pressable key={i.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(i.key)} style={[styles.segItem, on && styles.segItemOn]}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * App bar plus page title. The bar shows the logo, the business name and city, a bell that jumps to
 * whatever is waiting, and the avatar, which opens Account. The page title shows the screen name and summary.
 * Business data comes from /vendors/me through VendorContext.
 */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { vendor, attention, go } = useVendor();
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const name = vendor?.business_name || 'Your store';
  const waiting = attention.orders + attention.bookings;
  return (
    <View style={styles.headerWrap}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.appBar}>
        <LinearGradient pointerEvents="none" colors={['#00402F', '#00735C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.appRow}>
          <View style={styles.logoTile}>
            <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>
          <View style={styles.appTextCol}>
            <Text style={[styles.appName, narrow && { fontSize: 14 }]} numberOfLines={2}>{name}</Text>
            <Text style={styles.appSub} numberOfLines={1}>{vendor?.city ? `${vendor.city}, Qatar` : 'Sokoni Hub vendor'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={waiting ? `${waiting} waiting. Open orders` : 'Notifications. Open orders'}
            onPress={() => go(attention.orders ? 'orders' : 'bookings')}
            style={styles.bellBtn}
            hitSlop={8}
          >
            <Icon name="bell" size={20} color="#FFFFFF" />
            {waiting > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open account" onPress={() => go('account')} style={styles.avatarBtn} hitSlop={6}>
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {/* On narrow screens the right-hand action gets its own row under the title, so long titles keep their full width. */}
      <View style={styles.pageTitleRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.pageTitle, narrow && { fontSize: 24, lineHeight: 30 }]}>{title}</Text>
          {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
        </View>
        {!narrow ? right : null}
      </View>
      {narrow && right ? <View style={styles.pageActionRow}>{right}</View> : null}
    </View>
  );
}

/**
 * Row of stat tiles. Three across on phones 360dp and wider; two per row on narrower screens
 * so labels and figures are not cut off. Tiles wrap onto a new line rather than shrinking.
 */
/** One non-wrapping row of equal tiles. Wrapping rows could report too little height and let tiles run under the chips. */
export function StatRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.statRow, style]}>
      {items.map((child, idx) => (
        <View key={idx} style={styles.statCell}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Small stat tile: label, big figure, and a short line underneath. */
export function StatTile({ label, value, sub, tone = 'brand', icon }: { label: string; value: string; sub?: string; tone?: Tone; icon?: IconName }) {
  const t = TONES[tone];
  return (
    <View style={[styles.stat, { backgroundColor: t.bg, borderColor: 'transparent' }]} accessibilityLabel={`${label} ${value}${sub ? `, ${sub}` : ''}`}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
            <Icon name={icon} size={15} color={t.fg} />
          </View>
        ) : null}
      </View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={[styles.statSub, { color: t.fg }]}>{sub}</Text> : null}
    </View>
  );
}

/** A grouped list inside a card, with hairline dividers between rows. */
export function Group({ children, label }: { children: ReactNode; label?: string }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={styles.groupLabel}>{label}</Text> : null}
      <View style={styles.group}>
        {items.map((child, idx) => (
          <View key={idx}>
            {child}
            {idx < items.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function Row({
  icon,
  tone = 'brand',
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const t = TONES[tone];
  const body = (
    <View style={styles.row}>
      <View style={[styles.iconTile, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={20} color={t.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: C.dangerFg }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={C.muted} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
      {body}
    </Pressable>
  );
}

export function Avatar({ text, size = 56 }: { text: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarBig, { fontSize: size * 0.36 }]}>{initialsOf(text)}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={C.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Banner({ tone = 'info', icon, children }: { tone?: 'info' | 'error' | 'success'; icon?: IconName; children: ReactNode }) {
  const map = {
    info: { bg: C.primarySoft, fg: C.primary, ic: 'information-circle' as IconName },
    error: { bg: C.dangerSoft, fg: C.dangerFg, ic: 'exclamation-triangle' as IconName },
    success: { bg: '#D1FAE5', fg: '#065F46', ic: 'check-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]} accessibilityRole="alert">
      <Icon name={icon ?? map.ic} size={18} color={map.fg} solid />
      <Text style={[styles.bannerText, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, unit, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit: string; label: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <View style={styles.stepper} accessibilityLabel={label}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(clamp(value - step))} style={[styles.stepBtn, value <= min && { opacity: 0.4 }]}>
        <Icon name="minus" size={18} color={C.primary} />
      </Pressable>
      <View style={styles.stepValue}>
        <Text style={styles.stepNumber}>{value}</Text>
        <Text style={styles.stepUnit}>{unit}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(clamp(value + step))} style={[styles.stepBtn, value >= max && { opacity: 0.4 }]}>
        <Icon name="plus" size={18} color={C.primary} />
      </Pressable>
    </View>
  );
}

type BtnVariant = 'primary' | 'gold' | 'secondary' | 'danger' | 'ghost';
export function Btn({ label, onPress, variant = 'primary', icon, loading, disabled, compact }: { label: string; onPress: () => void; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; compact?: boolean }) {
  const v = {
    primary: { bg: C.primary, fg: '#FFFFFF', border: C.primary },
    gold: { bg: C.gold, fg: '#FFFFFF', border: C.gold },
    secondary: { bg: C.surface, fg: C.primary, border: C.primaryLine },
    danger: { bg: C.dangerSoft, fg: C.dangerFg, border: C.dangerSoft },
    ghost: { bg: 'transparent', fg: C.primary, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Icon name={icon} size={18} color={v.fg} /> : null}
          <Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Compact sub-page bar with a back button. Used by the Account sub-pages. */
export function SubBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.subBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.subBack} hitSlop={8}>
        <Icon name="chevron-left" size={18} color={C.text} />
      </Pressable>
      <Text style={styles.subTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  subBack: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  subTitle: { flex: 1, fontSize: 15, ...fw('800'), color: C.text },
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, shadowColor: '#0F3B2E', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  cardPad: { padding: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 26, borderRadius: 10, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, ...fw('700') },
  chipsWrap: { height: 44, flexShrink: 0, justifyContent: 'center', backgroundColor: C.bg },
  chipsScroll: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  chip: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.primaryDeep, borderColor: C.primaryDeep },
  chipText: { fontSize: 12, ...fw('700'), color: C.text2 },
  chipTextOn: { color: '#FFFFFF' },
  chipCount: { minWidth: 22, height: 20, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldSoft },
  chipCountOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontSize: 11, ...fw('800'), color: C.goldText },
  chipCountTextOn: { color: '#FFFFFF' },
  segmented: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 13, padding: 3, gap: 3 },
  segItem: { flex: 1, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: C.surface, shadowColor: '#0F3B2E', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segText: { fontSize: 12, ...fw('700'), color: C.muted },
  segTextOn: { color: C.primaryDeep },
  headerWrap: { backgroundColor: C.bg, flexShrink: 0 },
  appBar: { backgroundColor: '#005A48', overflow: 'hidden' },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 56 },
  logoTile: { width: 37, height: 37, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: 30, height: 30 },
  appTextCol: { flex: 1, minWidth: 0 },
  appName: { fontSize: 14, ...fw('800'), color: '#FFFFFF' },
  appSub: { fontSize: 11, color: '#CDEEE3', ...fw('600'), marginTop: 2 },
  bellBtn: { width: 34, height: 34, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 6, backgroundColor: C.gold, borderWidth: 1.5, borderColor: '#005A48' },
  avatarBtn: { width: 34, height: 34, borderRadius: 16, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 11, ...fw('800') },
  pageTitleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 9 },
  pageActionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 9 },
  pageTitle: { fontSize: 25, ...fw('800'), color: C.text, letterSpacing: -0.6 },
  pageSub: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 20 },
  stat: { flex: 1, minWidth: 0, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 9, gap: 3, minHeight: 88 },
  statRow: { flexDirection: 'row', alignItems: 'stretch', flexShrink: 0, gap: 6, paddingHorizontal: 12, paddingTop: 2 },
  statCell: { flex: 1, flexBasis: 0, minWidth: 0, flexShrink: 0 },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3 },
  statLabel: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 16, ...fw('700'), color: C.muted },
  statIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 19, ...fw('800'), color: C.text, letterSpacing: -0.4, marginTop: 3 },
  statSub: { fontSize: 10, ...fw('700') },
  groupLabel: { fontSize: 11, ...fw('800'), color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 3 },
  group: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: C.borderSoft, marginLeft: 51 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, minHeight: 56, paddingVertical: 8 },
  iconTile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, ...fw('700'), color: C.text },
  rowSub: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 18 },
  avatar: { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarBig: { color: '#FFFFFF', ...fw('800') },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 51, height: 51, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 15, ...fw('700'), color: C.text, textAlign: 'center' },
  emptyBody: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 20 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 9, borderRadius: 11 },
  bannerText: { flex: 1, fontSize: 12, ...fw('600'), lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.primaryLine, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 71, alignItems: 'center' },
  stepNumber: { fontSize: 16, ...fw('800'), color: C.text },
  stepUnit: { fontSize: 10, color: C.muted, ...fw('600') },
  btn: { minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnCompact: { minHeight: 39, borderRadius: 11 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnText: { fontSize: 14, ...fw('700') },
});
