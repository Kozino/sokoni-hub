import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { ArrowLeftIcon, MapPinIcon, UserIcon } from 'react-native-heroicons/outline';
import { C, cardShadow } from '../theme';

export function DriverTopbar({ online, name }: { online?: boolean; name?: string }) {
  const status = online == null ? 'Driver' : online ? 'Online' : 'Offline';
  return (
    <View style={s.topbar}>
      <View style={[s.onlinePill, online === false && s.offlinePill]}>
        <View style={[s.onlineDot, online === false && s.offlineDot]} />
        <Text style={[s.onlineText, online === false && s.offlineText]}>{status}</Text>
      </View>
      <View style={s.topbarCenter}>
        <Text style={s.topbarTitle} numberOfLines={1}>Sokoni Driver</Text>
        <View style={s.topbarLocation}>
          <MapPinIcon size={11} color={C.gold} />
          <Text style={s.topbarLocationText}>Qatar · QAR</Text>
        </View>
      </View>
      <View style={s.topAvatar} accessibilityLabel={name ? `${name}, driver profile` : 'Driver profile'}>
        {name ? <Text style={s.topAvatarText}>{name.trim().charAt(0).toUpperCase()}</Text> : <UserIcon size={19} color="#fff" />}
      </View>
    </View>
  );
}

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={({ pressed }) => [s.backBtn, pressed && s.pressed]} hitSlop={10}>
          <ArrowLeftIcon size={23} color={C.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.headerSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function PageHeading({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={s.heading}>
      {eyebrow ? (
        <View style={s.headingEyebrowRow}>
          <Text style={s.headingEyebrow}>{eyebrow}</Text>
          {right}
        </View>
      ) : null}
      <View style={s.headingRow}>
        <Text style={s.headingTitle}>{title}</Text>
        {!eyebrow ? right : null}
      </View>
      {subtitle ? <Text style={s.headingSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'green', icon }: { label: string; tone?: 'green' | 'gold' | 'red' | 'grey'; icon?: ReactNode }) {
  const palette = {
    green: { bg: C.primarySoft, fg: C.primary },
    gold: { bg: C.goldSoft, fg: '#B85E00' },
    red: { bg: C.dangerSoft, fg: C.danger },
    grey: { bg: C.surface2, fg: C.text2 },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: palette.bg }]}>
      {icon}
      <Text style={[s.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, tone = 'primary', loading, disabled, icon, style }: {
  title: string;
  onPress: () => void;
  tone?: 'primary' | 'gold' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.primary, gold: C.gold, secondary: C.surface2, danger: C.dangerSoft }[tone];
  const fg = { primary: '#fff', gold: '#201B14', secondary: C.text, danger: C.danger }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: pressed && tone === 'primary' ? C.primaryPressed : bg, opacity: disabled ? 0.48 : pressed ? 0.88 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.buttonInner}>
          {icon}
          <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>{icon}</View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'warning' }) {
  const palette = tone === 'error'
    ? { bg: C.dangerSoft, fg: C.danger }
    : tone === 'warning'
      ? { bg: C.goldSoft, fg: '#995000' }
      : { bg: C.primarySoft, fg: C.primary };
  return (
    <View style={[s.notice, { backgroundColor: palette.bg }]}>
      <Text style={[s.noticeText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

export function SectionTitle({ children, meta }: { children: string; meta?: string }) {
  return (
    <View style={s.sectionRow}>
      <View style={s.sectionName}>
        <View style={s.sectionDot} />
        <Text style={s.sectionTitle}>{children}</Text>
      </View>
      {meta ? <Text style={s.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.65 },
  topbar: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, minWidth: 82 },
  offlinePill: { backgroundColor: C.surface2 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  offlineDot: { backgroundColor: C.muted },
  onlineText: { color: C.primary, fontSize: 13, fontWeight: '800' },
  offlineText: { color: C.text2 },
  topbarCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { fontSize: 13, fontWeight: '900', color: C.text },
  topbarLocation: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  topbarLocationText: { fontSize: 10, fontWeight: '700', color: C.text2 },
  topAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  topAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: C.text, letterSpacing: -0.35 },
  headerSubtitle: { fontSize: 12, color: C.text2, marginTop: 2 },

  heading: { marginBottom: 18 },
  headingEyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 },
  headingEyebrow: { color: C.gold, fontSize: 10, lineHeight: 15, letterSpacing: 1.2, fontWeight: '900' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingTitle: { flexShrink: 1, fontSize: 28, lineHeight: 34, fontWeight: '900', color: C.text, letterSpacing: -0.9 },
  headingSubtitle: { fontSize: 13, lineHeight: 19, color: C.text2, marginTop: 3 },

  card: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 16, ...cardShadow },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },

  button: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 14, fontWeight: '900', textAlign: 'center', flexShrink: 1 },

  statValue: { fontSize: 17, fontWeight: '900', color: '#fff', marginTop: 4 },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.72)', fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: C.text, textAlign: 'center' },
  emptyText: { fontSize: 13, color: C.text2, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  notice: { borderRadius: 15, padding: 13 },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, marginBottom: 10 },
  sectionName: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  sectionTitle: { flexShrink: 1, fontSize: 13, fontWeight: '900', color: C.text, textTransform: 'uppercase', letterSpacing: 0.45 },
  sectionMeta: { fontSize: 11, fontWeight: '700', color: C.text2 },
});
