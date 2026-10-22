import React, { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { ArrowLeftIcon } from 'react-native-heroicons/outline';
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
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]} hitSlop={8}>
          <ArrowLeftIcon size={23} color={C.text} />
        </Pressable>
      ) : <View style={s.back} />}
      <View style={s.brandSmall}>
        <Image source={require('../../assets/icon.png')} style={s.logoSmall} />
        <Text style={s.brandSmallText}>Sokoni <Text style={{ color: C.primary }}>Driver</Text></Text>
      </View>
      <View style={s.currency}><Text style={s.currencyText}>QATAR · QAR</Text></View>
    </View>
  );
}

export function BrandBlock({ title, subtitle, intro }: { title: string; subtitle?: string; intro?: string }) {
  return (
    <View style={s.brandBlock}>
      <View style={s.logoCircle}><Image source={require('../../assets/icon.png')} style={s.logo} resizeMode="contain" /></View>
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
      <TextInput placeholderTextColor={C.muted} style={[s.field, error ? { borderColor: C.danger, borderWidth: 1 } : null]} {...props} />
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
  children: ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'gold' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: object;
}) {
  const bg = variant === 'primary' ? C.primary : variant === 'gold' ? C.gold : C.surface2;
  const fg = variant === 'primary' ? '#fff' : variant === 'gold' ? '#201B14' : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: variant === 'primary' && pressed ? C.primaryPressed : bg, opacity: disabled ? 0.5 : pressed ? 0.87 : 1 }, style]}
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
  topbar: { minHeight: 66, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomColor: C.border, borderBottomWidth: 1, backgroundColor: C.surface },
  back: { height: 40, width: 34, justifyContent: 'center', alignItems: 'flex-start' },
  brandSmall: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoSmall: { width: 28, height: 28, borderRadius: 8, resizeMode: 'contain' },
  brandSmallText: { fontSize: 16, fontWeight: '900', color: C.text, letterSpacing: -0.25 },
  currency: { backgroundColor: C.surface2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  currencyText: { fontSize: 8, fontWeight: '900', color: C.text2, letterSpacing: 0.4 },

  brandBlock: { alignItems: 'center', paddingTop: 25, paddingHorizontal: 20 },
  logoCircle: { width: 76, height: 76, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 58, height: 58, borderRadius: 16 },
  welcome: { fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8, marginTop: 18, color: C.text, textAlign: 'center' },
  language: { fontSize: 13, fontWeight: '800', marginTop: 5, color: C.primary, textAlign: 'center' },
  intro: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10, maxWidth: 320, color: C.text2 },

  fieldWrap: { marginBottom: 15 },
  fieldLabel: { fontSize: 11, fontWeight: '900', marginBottom: 7, color: C.text },
  field: { minHeight: 52, borderRadius: 14, backgroundColor: C.field, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 14, color: C.text },
  error: { color: C.danger, fontSize: 11, marginTop: 5 },

  phoneField: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.field, flexDirection: 'row', alignItems: 'center', marginBottom: 15, overflow: 'hidden' },
  phonePrefix: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flag: { fontSize: 16 },
  prefixText: { fontSize: 14, fontWeight: '800', color: C.text },
  phoneDivider: { width: 1, height: 24, backgroundColor: C.border },
  phoneInput: { flex: 1, height: 50, paddingHorizontal: 12, fontSize: 14, color: C.text },

  button: { minHeight: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  buttonText: { fontSize: 14, lineHeight: 19, fontWeight: '900', textAlign: 'center' },

  notice: { borderRadius: 14, padding: 12, marginBottom: 12 },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },

  orLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  orStroke: { flex: 1, height: 1, backgroundColor: C.border },
  orText: { fontSize: 9, fontWeight: '900', color: C.text2, letterSpacing: 0.8 },
});

export const authStyles = s;
