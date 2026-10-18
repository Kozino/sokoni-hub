import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from 'react-native-heroicons/outline';
import { C } from '../../theme';

export function SettingsRow({ icon, title, subtitle, onPress, danger, last }: {
  icon: ReactNode; title: string; subtitle?: string; onPress: () => void; danger?: boolean; last?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.border, pressed && { backgroundColor: C.surface2 }]}>
      <View style={[styles.iconWrap, { backgroundColor: danger ? C.dangerSoft : C.primarySoft }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, danger && { color: C.danger }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {!danger ? <ChevronRightIcon size={18} color={C.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  border: { borderBottomWidth: 1, borderBottomColor: C.border },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 13, color: C.text2, marginTop: 2 },
});
