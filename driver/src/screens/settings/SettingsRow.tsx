import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from 'react-native-heroicons/outline';
import { C } from '../../theme';

export function SettingsRow({ icon, title, subtitle, onPress, danger, last, tone = 'green', disabled }: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
  tone?: 'green' | 'blue' | 'purple' | 'gold' | 'teal';
  disabled?: boolean;
}) {
  const palette = danger
    ? { bg: C.dangerSoft }
    : {
        green: { bg: C.primarySoft },
        blue: { bg: C.blueSoft },
        purple: { bg: C.purpleSoft },
        gold: { bg: C.goldSoft },
        teal: { bg: C.tealSoft },
      }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.border, pressed && { backgroundColor: C.surface2 }, disabled && { opacity: 0.55 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.bg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, danger && { color: C.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <ChevronRightIcon size={17} color={danger ? C.danger : C.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  border: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 11, lineHeight: 16, color: C.text2, marginTop: 3 },
});
