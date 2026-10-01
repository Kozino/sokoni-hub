import { Icon, type IconName } from './icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type ImageSourcePropType, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './providers';
import type { ReactNode } from 'react';

export function BrandMark({ small = false }: { small?: boolean }) {
  const { colors } = useTheme();
  return <View style={[styles.brand, small && styles.brandSmall]}><Image source={require('../assets/logo.png')} style={[styles.logo, small && styles.logoSmall]} /><View><Text style={[styles.brandTitle, { color: colors.text }, small && styles.brandTitleSmall]}>Sokoni <Text style={{ color: colors.gold }}>Hub</Text></Text>{!small && <Text style={[styles.tagline, { color: colors.text2 }]}>Local commerce, made simple</Text>}</View></View>;
}

export function Button({ children, onPress, variant = 'primary', disabled, loading, style, icon }: { children: ReactNode; onPress: () => void; variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger'; disabled?: boolean; loading?: boolean; style?: ViewStyle; icon?: IconName }) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary : variant === 'gold' ? colors.gold : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surface : 'transparent';
  const text = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : variant === 'gold' ? '#1C1B17' : colors.primary;
  const borderColor = variant === 'secondary' ? colors.primaryLine : variant === 'ghost' ? 'transparent' : bg;
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [{ backgroundColor: bg, borderColor, opacity: disabled ? .52 : pressed ? .84 : 1 }, styles.button, style]}>{loading ? <ActivityIndicator color={text} /> : <View style={styles.buttonInner}><Text style={[styles.buttonText, { color: text }]}>{children}</Text>{icon ? <Icon name={icon} size={18} color={text} /> : null}</View>}</Pressable>;
}

export function IconButton({ icon, onPress, label, badge }: { icon: IconName; onPress: () => void; label: string; badge?: number }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}><Icon name={icon} size={20} color={colors.text} />{!!badge && <View style={[styles.badge, { backgroundColor: colors.gold }]}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>}</Pressable>;
}

export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={styles.fieldWrap}>{label ? <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text> : null}<TextInput placeholderTextColor={colors.muted} style={[styles.field, { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border }, style]} {...props} />{error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) { const { colors } = useTheme(); return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>; }
export function Divider() { const { colors } = useTheme(); return <View style={[styles.divider, { backgroundColor: colors.border }]} />; }
export function Spinner({ label = 'Loading…' }: { label?: string }) { const { colors } = useTheme(); return <View style={styles.spinner}><ActivityIndicator color={colors.primary} size="large" /><Text style={[styles.spinnerText, { color: colors.text2 }]}>{label}</Text></View>; }

export function EmptyState({ icon = 'basket-outline', title, text, action }: { icon?: IconName; title: string; text: string; action?: ReactNode }) {
  const { colors } = useTheme(); return <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}><Icon name={icon} size={29} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyText, { color: colors.text2 }]}>{text}</Text>{action}</View>;
}

export function Header({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) { const { colors } = useTheme(); return <View style={[styles.header, { backgroundColor: colors.bg }]}>{back ? <Pressable onPress={back} accessibilityLabel="Go back" style={styles.back}><Icon name="arrow-back" size={24} color={colors.text} /></Pressable> : <View style={styles.back}/>}<Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{title}</Text><View style={styles.headerRight}>{right}</View></View>; }

export function Chip({ children, selected, onPress, image }: { children: ReactNode; selected?: boolean; onPress?: () => void; image?: ImageSourcePropType }) { const { colors } = useTheme(); return <Pressable disabled={!onPress} onPress={onPress} style={[styles.chip, image ? styles.chipWithImage : null, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}>{image ? <Image source={image} style={styles.chipImage} /> : null}<Text style={[styles.chipText, { color: selected ? '#fff' : colors.text2 }]}>{children}</Text></Pressable>; }

export function Notice({ type = 'info', children }: { type?: 'info' | 'warning' | 'success' | 'danger'; children: ReactNode }) { const { colors } = useTheme(); const values = type === 'warning' ? [colors.warningSoft, colors.warning, 'warning-outline'] : type === 'success' ? [colors.successSoft, colors.success, 'checkmark-circle-outline'] : type === 'danger' ? [colors.dangerSoft, colors.danger, 'alert-circle-outline'] : [colors.primarySoft, colors.primary, 'information-circle-outline']; return <View style={[styles.notice, { backgroundColor: values[0] as string }]}><Icon name={values[2] as IconName} size={19} color={values[1] as string}/><Text style={[styles.noticeText, { color: colors.text }]}>{children}</Text></View>; }

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) { const { colors } = useTheme(); const insets = useSafeAreaInsets(); return <Modal transparent statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" onRequestClose={onClose}><Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={onClose}/><View style={[styles.sheet, { backgroundColor: colors.surface }]}><View style={[styles.sheetHandle, { backgroundColor: colors.border }]} /><View style={styles.sheetTop}><Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text><Pressable onPress={onClose}><Icon name="close" size={24} color={colors.text}/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.sheetContent, { paddingBottom: 28 + insets.bottom }]}>{children}</ScrollView></View></Modal>; }

export type DropdownOption = { value: string; label: string; image?: ImageSourcePropType };
/** A real dropdown: tapping the trigger opens a menu anchored right under it; choosing an option closes it. */
export function Dropdown({ value, options, onChange, renderTrigger, style, menuWidth }: { value: string; options: DropdownOption[]; onChange: (value: string) => void; renderTrigger: (label: string, open: boolean) => ReactNode; style?: ViewStyle; menuWidth?: number }) {
  const { colors } = useTheme(); const ref = useRef<View>(null); const { width: screenW, height: screenH } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const label = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '';
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const width = Math.min(Math.max(menuWidth ?? 0, anchor?.w ?? 0, 200), screenW - 24);
  const left = anchor ? Math.max(12, Math.min(anchor.x, screenW - width - 12)) : 0;
  const top = anchor ? anchor.y + anchor.h + 6 : 0;
  const maxHeight = Math.max(160, Math.min(330, screenH - top - 24));
  return <>
    <Pressable ref={ref} collapsable={false} onPress={open} style={style} accessibilityRole="button" accessibilityLabel={label}>{renderTrigger(label, !!anchor)}</Pressable>
    <Modal transparent statusBarTranslucent visible={!!anchor} animationType="fade" onRequestClose={() => setAnchor(null)}>
      <View style={{ flex: 1 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
        {anchor ? <View style={[styles.dropMenu, { top, left, width, maxHeight, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled">{options.map((option) => {
            const selected = option.value === value;
            return <Pressable key={option.value || '_all'} onPress={() => { onChange(option.value); setAnchor(null); }} style={[styles.dropItem, selected && { backgroundColor: colors.primarySoft }]}>
              {option.image ? <Image source={option.image} style={styles.dropImage} /> : null}
              <Text numberOfLines={1} style={[styles.dropText, { color: selected ? colors.primary : colors.text }]}>{option.label}</Text>
              {selected ? <Icon name="checkmark-circle" size={18} color={colors.primary} /> : null}
            </Pressable>;
          })}</ScrollView>
        </View> : null}
      </View>
    </Modal>
  </>;
}

/** Fixed action bar that always clears the Android gesture/navigation bar and iOS home indicator. */
export function BottomBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme(); const insets = useSafeAreaInsets();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function Money({ value, currency = 'QAR', strong = false }: { value: string | number; currency?: string; strong?: boolean }) { const { colors } = useTheme(); const number = Number(value || 0); return <Text style={[strong ? styles.moneyStrong : styles.money, { color: strong ? colors.primary : colors.text }]}>{currency} {number.toFixed(2)}</Text>; }

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandSmall: { gap: 7 }, logo: { width: 45, height: 45, resizeMode: 'contain' }, logoSmall: { width: 31, height: 31 }, brandTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -.5 }, brandTitleSmall: { fontSize: 17 }, tagline: { fontSize: 11, marginTop: 1 },
  button: { minHeight: 48, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }, buttonText: { fontSize: 15, fontWeight: '800' },
  iconButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, badge: { position: 'absolute', minWidth: 16, height: 16, borderRadius: 8, right: -5, top: -5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, badgeText: { color: '#171C36', fontSize: 9, fontWeight: '800' },
  fieldWrap: { marginBottom: 15 }, fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 7 }, field: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 }, error: { fontSize: 12, marginTop: 5 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15 }, divider: { height: StyleSheet.hairlineWidth, marginVertical: 13 }, spinner: { minHeight: 260, justifyContent: 'center', alignItems: 'center', gap: 12 }, spinnerText: { fontSize: 14 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 56, gap: 9 }, emptyIcon: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }, emptyTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' }, emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 290 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' }, headerRight: { width: 40, alignItems: 'flex-end' },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }, chipWithImage: { paddingLeft: 5 }, chipImage: { width: 22, height: 22, borderRadius: 11 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dropMenu: { position: 'absolute', borderWidth: 1, borderRadius: 14, paddingVertical: 6, elevation: 14, shadowColor: '#0B1F16', shadowOpacity: .18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, dropItem: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, dropText: { flex: 1, fontSize: 14, fontWeight: '700' }, dropImage: { width: 24, height: 24, borderRadius: 12 }, chipText: { fontSize: 12, fontWeight: '700' },
  notice: { borderRadius: 12, padding: 12, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }, noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  modalBackdrop: { flex: 1 }, sheet: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 9 }, sheetHandle: { width: 40, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 8 }, sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 }, sheetTitle: { fontSize: 18, fontWeight: '800' }, sheetContent: { padding: 20, paddingTop: 4, paddingBottom: 38 },
  money: { fontSize: 14, fontWeight: '700' }, moneyStrong: { fontSize: 17, fontWeight: '900' },
});
