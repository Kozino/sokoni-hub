import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArrowLeftIcon } from 'react-native-heroicons/outline';
import { C } from '../theme';

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={s.backBtn} hitSlop={10}>
          <ArrowLeftIcon size={22} color={C.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'green' }: { label: string; tone?: 'green' | 'gold' | 'red' | 'grey' }) {
  const palette = {
    green: { bg: C.primarySoft, fg: C.primary },
    gold: { bg: C.goldSoft, fg: '#B45309' },
    red: { bg: C.dangerSoft, fg: C.danger },
    grey: { bg: C.surface2, fg: C.text2 },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: palette.bg }]}>
      <Text style={[s.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, tone = 'primary', loading, disabled, icon, style }: {
  title: string; onPress: () => void; tone?: 'primary' | 'gold' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: ViewStyle;
}) {
  const bg = { primary: C.primary, gold: C.gold, secondary: C.surface, danger: C.dangerSoft }[tone];
  const fg = { primary: '#fff', gold: '#1C1B17', secondary: C.primary, danger: C.danger }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: tone === 'secondary' ? C.primaryLine : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
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
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
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

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <View style={[s.notice, { backgroundColor: tone === 'error' ? C.dangerSoft : C.primarySoft }]}>
      <Text style={[s.noticeText, { color: tone === 'error' ? C.danger : C.primary }]}>{children}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.text2, marginTop: 2 },
  card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  button: { minHeight: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '800' },
  statValue: { fontSize: 18, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: C.text2, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  notice: { borderRadius: 14, padding: 12 },
  noticeText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },
});
