import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { ICON_SVG, IconName } from './heroicons';
import { C, TONES, Tone } from '../theme';
import { fw } from './type';

/** Heroicon rendered as SVG. Colour is applied by replacing the currentColor placeholder. */
export function Icon({ name, size = 20, color = C.text, solid = false }: { name: IconName; size?: number; color?: string; solid?: boolean }) {
  const entry = ICON_SVG[name];
  const raw = (solid && entry.solid) || entry.outline || '';
  return <SvgXml xml={raw.split('currentColor').join(color)} width={size} height={size} />;
}

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

/** Header band: logo green gradient, a thin orange stripe from the logo, and a title that scales for small phones. */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  return (
    <View style={styles.headerWrap}>
      <StatusBar style="light" />
      <LinearGradient colors={[C.primaryDeep, C.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBand}>
        <View style={styles.deco1} />
        <View style={styles.deco2} />
        <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
              <Text style={[styles.headerTitle, compact && { fontSize: 24 }]} numberOfLines={1}>{title}</Text>
            </View>
            {right}
          </View>
        </SafeAreaView>
      </LinearGradient>
      <View style={styles.stripe} />
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
  const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'S';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
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

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Btn({ label, onPress, variant = 'primary', icon, loading, disabled, compact }: { label: string; onPress: () => void; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; compact?: boolean }) {
  const v = {
    primary: { bg: C.primary, fg: '#FFFFFF', border: C.primary },
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

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardPad: { padding: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 26, borderRadius: 13, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, ...fw('700') },
  chipsWrap: { height: 52, justifyContent: 'center', backgroundColor: C.bg },
  chipsScroll: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, ...fw('600'), color: C.text2 },
  chipTextOn: { color: '#FFFFFF' },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft },
  chipCountOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipCountText: { fontSize: 12, ...fw('700'), color: C.primary },
  chipCountTextOn: { color: '#FFFFFF' },
  headerWrap: { backgroundColor: C.primaryDeep },
  headerBand: { paddingHorizontal: 20, paddingBottom: 18, overflow: 'hidden' },
  stripe: { height: 3, backgroundColor: C.gold },
  deco1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.06)', top: -70, right: -40 },
  deco2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -60, left: -30 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 10, minHeight: 56 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, ...fw('600'), marginBottom: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 28, ...fw('800'), letterSpacing: -0.4 },
  groupLabel: { fontSize: 12, ...fw('700'), color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4 },
  group: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.borderSoft, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: C.borderSoft, marginLeft: 68 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 64, paddingVertical: 10 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, ...fw('600'), color: C.text },
  rowSub: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  avatar: { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', ...fw('800') },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 17, ...fw('700'), color: C.text, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 14, ...fw('500'), lineHeight: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: C.primaryLine, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 84, alignItems: 'center' },
  stepNumber: { fontSize: 18, ...fw('800'), color: C.text },
  stepUnit: { fontSize: 11, color: C.muted, ...fw('600') },
  btn: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnCompact: { minHeight: 44, borderRadius: 12 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 16, ...fw('700') },
});
