import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../providers';
import { Text } from '../ui';
import { LOCALES, useI18n, type LocaleCode } from './index';

/** Compact language picker for login, register and profile. Endonyms stay untranslated. */
export function LanguageCard({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const { locale, setLocale, t, meta } = useI18n();
  return (
    <View style={[s.wrap, { backgroundColor: colors.surface2, borderColor: colors.border }, compact && s.compact]}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: colors.primarySoft }]}><Icon name="language" solid={false} size={16} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{t('common.chooseLanguage')}</Text>
          {compact ? null : <Text style={{ fontSize: 10.5, color: colors.text2, marginTop: 1 }}>{t('lang.hint')}</Text>}
        </View>
      </View>
      <View style={s.row}>
        {LOCALES.map((item) => {
          const on = item.code === locale;
          return (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.english}
              onPress={() => setLocale(item.code as LocaleCode)}
              style={[s.pill, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
            >
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: on ? colors.onPrimary : colors.text }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ fontSize: 10.5, color: colors.muted, marginTop: 6 }}>{meta.greeting}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, marginBottom: 12 },
  compact: { padding: 8, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  icon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, height: 30, justifyContent: 'center' },
});
