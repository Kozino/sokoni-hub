import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ApiError } from '../api';
import { LanguageCard } from '../i18n/LanguageCard';
import { useT } from '../i18n';
import { canonicalQatarMobile } from '../phoneQa';
import { useAuth, useTheme } from '../providers';
import { styles, nx } from '../styles';
import { Button, Field, Notice, Text, TextInput } from '../ui';
import { AuthScaffold } from './AuthScaffold';

const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function Register({ go, back, done }: any) {
  const { colors } = useTheme();
  const t = useT();
  const auth = useAuth();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', pin: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((old) => ({ ...old, [key]: value }));

  const submit = async () => {
    if (!form.full_name || !form.phone || !form.email || !form.password || !form.pin) return Alert.alert(t('auth.completeForm'), t('auth.everyField'));
    const phone = canonicalQatarMobile(form.phone);
    if (!phone) return Alert.alert(t('auth.phone'), t('auth.phoneInvalid'));
    if (form.password.length < 12) return Alert.alert(t('auth.longerPassword'), t('auth.passwordRule'));
    if (form.pin !== form.confirm) return Alert.alert(t('auth.pinMismatch'), t('auth.pinMismatchBody'));
    setBusy(true);
    try {
      const stage = await auth.register({ ...form, phone });
      if (stage.kind === 'pin') go('pin');
      else if (stage.kind === 'setup') go('pinsetup');
      else if (stage.kind === 'verification_required') {
        Alert.alert(t('auth.checkEmail'), `We've sent a verification link to ${stage.email || 'your email'}. Please click the link to activate your account.`, [{ text: 'OK', onPress: () => go('login') }]);
      } else done();
    } catch (e) { Alert.alert(t('auth.couldNotCreate'), message(e)); }
    finally { setBusy(false); }
  };

  return (
    <AuthScaffold title={t('auth.createTitle')} subtitle={t('auth.createSubtitle')} back={back} top={<LanguageCard />}>
      <Field label={t('auth.fullName')} value={form.full_name} onChangeText={set('full_name')} autoComplete="name" placeholder={t('auth.yourName')} />
      <View style={styles.fieldHeader}>
        <Text style={[styles.referenceFieldLabel, { color: colors.text }]}>{t('auth.mobileNumber')}</Text>
        <Text style={[styles.networkLabel, { color: colors.text2 }]}>Ooredoo / Vodafone</Text>
      </View>
      <View style={[nx.phoneField, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <View style={nx.phonePrefix}><Text style={styles.qatarFlag}>🇶🇦</Text><Text style={[styles.countryCodeText, { color: colors.text }]}>+974</Text></View>
        <View style={[nx.phoneDivider, { backgroundColor: colors.border }]} />
        <TextInput accessibilityLabel={t('auth.mobileNumber')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" placeholder="5512 3456" placeholderTextColor={colors.muted} style={[nx.phoneInput, { color: colors.text }]} />
      </View>
      <Field label={t('auth.emailAddress')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
      <Field label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" placeholder={t('auth.passwordRule')} />
      <Field label={t('auth.choosePin')} value={form.pin} onChangeText={set('pin')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••" />
      <Field label={t('auth.confirmPin')} value={form.confirm} onChangeText={set('confirm')} secureTextEntry keyboardType="number-pad" maxLength={4} placeholder="••••" />
      <Notice>{t('auth.pinPrivate')}</Notice>
      <Button loading={busy} onPress={submit} style={{ marginTop: 8 }}>{t('auth.createSecure')}</Button>
      <Text style={[styles.terms, { color: colors.text2 }]}>{t('auth.agreeTerms')} <Text accessibilityRole="link" onPress={() => go('legal')} style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.termsPrivacy')}</Text>.</Text>
      <Text style={[styles.authSwitch, { color: colors.text2 }]}>{t('auth.already')} <Text accessibilityRole="link" onPress={() => go('login')} style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.signInLink')}</Text></Text>
    </AuthScaffold>
  );
}
