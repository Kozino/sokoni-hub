import React, { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { C } from '../theme';

/** Qatari numbers are stored as 974XXXXXXXX (same rule as the consumer app). */
export function normalizeQatarPhone(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `974${digits}`;
  return digits;
}

export function Topbar({ onBack }: { onBack?: () => void }) {
  return (
    <View style={s.topbar}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={s.back}>
          <Text style={s.backIcon}>←</Text>
        </Pressable>
      ) : <View style={s.back} />}
      <View style={s.brandSmall}>
        <Image source={require('../../assets/logo.png')} style={s.logoSmall} />
        <Text style={s.brandSmallText}>Sokoni <Text style={{ color: C.gold }}>Vendor</Text></Text>
      </View>
      <View style={s.currency}>
        <Text style={s.currencyText}>QATAR{'\n'}(QAR)</Text>
      </View>
    </View>
  );
}

export function BrandBlock({ title, subtitle, intro }: { title: string; subtitle?: string; intro?: string }) {
  return (
    <View style={s.brandBlock}>
      <View style={s.logoCircle}>
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
      </View>
      <Text style={s.welcome}>{title}</Text>
      {subtitle ? <Text style={s.language}>{subtitle}</Text> : null}
      {intro ? <Text style={s.intro}>{intro}</Text> : null}
    </View>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={s.fieldWrap}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.muted}
        style={[s.field, error ? { borderColor: C.danger, borderWidth: 1 } : null]}
        {...props}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

export function PhoneField({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={s.phoneField}>
      <View style={s.phonePrefix}>
        <Text style={s.flag}>🇶🇦</Text>
        <Text style={s.prefixText}>+974</Text>
      </View>
      <View style={s.phoneDivider} />
      <TextInput
        accessibilityLabel="Mobile number"
        value={value}
        onChangeText={onChangeText}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="3312 4567"
        placeholderTextColor={C.muted}
        style={s.phoneInput}
      />
    </View>
  );
}

export function Button({ children, onPress, variant = 'primary', loading, disabled, style }: {
  children: ReactNode; onPress: () => void; variant?: 'primary' | 'gold' | 'secondary'; loading?: boolean; disabled?: boolean; style?: object;
}) {
  const bg = variant === 'primary' ? C.primary : variant === 'gold' ? C.gold : C.surface;
  const fg = variant === 'primary' ? '#fff' : variant === 'gold' ? '#1C1B17' : C.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? C.primaryLine : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{children}</Text>}
    </Pressable>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <View style={[s.notice, { backgroundColor: tone === 'error' ? C.dangerSoft : C.primarySoft }]}>
      <Text style={[s.noticeText, { color: tone === 'error' ? C.danger : C.primary }]}>{children}</Text>
    </View>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <View style={s.orLine}>
      <View style={s.orStroke} />
      <Text style={s.orText}>{label}</Text>
      <View style={s.orStroke} />
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { minHeight: 63, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomColor: '#EAEAF0', borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: C.surface },
  back: { height: 40, width: 30, justifyContent: 'center', alignItems: 'flex-start' },
  backIcon: { fontSize: 26, color: C.text },
  brandSmall: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoSmall: { width: 26, height: 26, resizeMode: 'contain' },
  brandSmallText: { fontSize: 16, fontWeight: '900', color: C.text },
  currency: { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  currencyText: { fontSize: 10, fontWeight: '900', color: C.text, textAlign: 'center', lineHeight: 12 },

  brandBlock: { alignItems: 'center', paddingTop: 22 },
  logoCircle: { width: 94, height: 94, borderRadius: 47, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 69, height: 69 },
  welcome: { fontSize: 29, fontWeight: '900', letterSpacing: -0.8, marginTop: 19, color: C.text, textAlign: 'center' },
  language: { fontSize: 15, fontWeight: '900', marginTop: 4, color: C.primary, textAlign: 'center' },
  intro: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12, maxWidth: 310, color: C.text2 },

  fieldWrap: { marginBottom: 15 },
  fieldLabel: { fontSize: 12, fontWeight: '900', marginBottom: 7, color: C.text },
  field: { minHeight: 50, borderRadius: 10, backgroundColor: C.field, paddingHorizontal: 14, fontSize: 15, color: C.text },
  error: { color: C.danger, fontSize: 12, marginTop: 4 },

  phoneField: { height: 50, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', marginBottom: 15, overflow: 'hidden' },
  phonePrefix: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { fontSize: 16 },
  prefixText: { fontSize: 15, fontWeight: '800', color: C.text },
  phoneDivider: { width: 1, height: 24, backgroundColor: C.border },
  phoneInput: { flex: 1, height: 50, paddingHorizontal: 12, fontSize: 15, color: C.text },

  button: { minHeight: 55, borderRadius: 25, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  buttonText: { fontSize: 16, fontWeight: '900' },

  notice: { borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },

  orLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  orStroke: { flex: 1, height: 1, backgroundColor: C.border },
  orText: { fontSize: 11, fontWeight: '800', color: C.text2, letterSpacing: 0.5 },
});

export const authStyles = s;
