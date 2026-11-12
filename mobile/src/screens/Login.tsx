import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { ApiError } from '../api';
import { WEB_URL } from '../config';
import { LanguageCard } from '../i18n/LanguageCard';
import { useT } from '../i18n';
import { Icon } from '../icons';
import { useAuth, useTheme } from '../providers';
import { styles, nx } from '../styles';
import { BrandMark, Button, Field, Notice, Text, TextInput } from '../ui';

const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function Login({ go, back, done }: any) {
  const { colors } = useTheme();
  const t = useT();
  const auth = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [phoneMode, setPhoneMode] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      return Alert.alert(t('auth.enterDetails'), t('auth.enterPhoneEmail', { field: phoneMode ? t('auth.phoneNumber') : t('auth.email') }));
    }
    let value = identifier.trim();
    if (phoneMode) {
      let digits = value.replace(/\D/g, '');
      if (digits.startsWith('00')) digits = digits.slice(2);
      if (digits.length === 8) digits = `974${digits}`;
      value = digits;
    }
    setBusy(true);
    try {
      const stage = await auth.login(value, password);
      if (stage.kind === 'pin') go('pin');
      else if (stage.kind === 'setup') go('pinsetup');
      else if (stage.kind === 'mfa') Alert.alert(t('auth.webOnlyTitle'), t('auth.webOnly'));
      else done();
    } catch (e) { Alert.alert(t('auth.signInFailed'), message(e)); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authPage}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.referenceAuthScroll}>
        <View style={styles.referenceTopbar}>
          <Pressable accessibilityRole="button" onPress={back} accessibilityLabel={t('common.back')} style={styles.referenceBack}>
            <Icon name="arrow-back" size={25} color={colors.text} />
          </Pressable>
          <BrandMark small />
          <View style={[styles.currencyBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.currencyBadgeText, { color: colors.text }]}>QATAR{`\n`}(QAR)</Text>
          </View>
        </View>
        <View style={styles.referenceBrandBlock}>
          <View style={[styles.referenceLogoCircle, { backgroundColor: colors.primarySoft }]}>
            <Image contentFit="contain" source={require('../../assets/logo-mark.png')} style={styles.referenceLogo} />
            <View style={[styles.globeDot, { backgroundColor: colors.primary }]}><Icon name="globe-outline" size={15} color="#fff" /></View>
          </View>
          <Text style={[styles.referenceWelcome, { color: colors.text }]}>{t('auth.welcomeBack')}</Text>
          <Text style={[styles.referenceLanguage, { color: colors.primary }]}>{t('auth.community')}</Text>
          <Text style={[styles.referenceIntro, { color: colors.text2 }]}>{t('auth.intro')}</Text>
        </View>
        <View style={[styles.referenceLoginCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LanguageCard />
          <View style={[styles.loginModeToggle, { backgroundColor: colors.surface2 }]}>
            <Pressable onPress={() => setPhoneMode(true)} accessibilityRole="button" accessibilityState={{ selected: phoneMode }} style={[styles.loginMode, { backgroundColor: phoneMode ? colors.primary : 'transparent' }]}>
              <Icon name="call-outline" size={18} color={phoneMode ? '#fff' : colors.text2} />
              <Text style={[styles.loginModeText, { color: phoneMode ? '#fff' : colors.text2 }]}>{t('auth.qatarPhone')}</Text>
            </Pressable>
            <Pressable onPress={() => setPhoneMode(false)} accessibilityRole="button" accessibilityState={{ selected: !phoneMode }} style={[styles.loginMode, { backgroundColor: !phoneMode ? colors.primary : 'transparent' }]}>
              <Icon name="mail-outline" size={18} color={!phoneMode ? '#fff' : colors.text2} />
              <Text style={[styles.loginModeText, { color: !phoneMode ? '#fff' : colors.text2 }]}>{t('auth.emailAddress')}</Text>
            </Pressable>
          </View>
          <View style={styles.fieldHeader}>
            <Text style={[styles.referenceFieldLabel, { color: colors.text }]}>{phoneMode ? t('auth.mobileNumber') : t('auth.emailAddress')}</Text>
            {phoneMode ? <Text style={[styles.networkLabel, { color: colors.text2 }]}>Ooredoo / Vodafone</Text> : null}
          </View>
          {phoneMode ? (
            <View style={[nx.phoneField, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <View style={nx.phonePrefix}><Text style={styles.qatarFlag}>🇶🇦</Text><Text style={[styles.countryCodeText, { color: colors.text }]}>+974</Text></View>
              <View style={[nx.phoneDivider, { backgroundColor: colors.border }]} />
              <TextInput accessibilityLabel={t('auth.mobileNumber')} value={identifier} onChangeText={setIdentifier} keyboardType="phone-pad" autoComplete="username" placeholder="3312 4567" placeholderTextColor={colors.muted} style={[nx.phoneInput, { color: colors.text }]} />
            </View>
          ) : (
            <Field label="" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" autoComplete="username" placeholder="you@example.com" style={styles.referenceField} />
          )}
          <View style={styles.fieldHeader}>
            <Text style={[styles.referenceFieldLabel, { color: colors.text }]}>{t('auth.password')}</Text>
            <Pressable accessibilityRole="button" onPress={() => go('forgot', { purpose: 'password' })}>
              <Text style={[styles.forgot, { color: colors.gold }]}>{t('auth.forgotPassword')}</Text>
            </Pressable>
          </View>
          <Field label="" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder={t('auth.password')} style={styles.referenceField} />
          <Notice><Text>{t('auth.pinNotice')}</Text></Notice>
          <Button loading={busy} onPress={submit} icon="arrow-forward" style={styles.referenceSignIn}>{t('auth.signIn')}</Button>
          <View style={styles.orLine}><View style={[styles.orStroke, { backgroundColor: colors.border }]} /><Text style={[styles.orText, { color: colors.text2 }]}>{t('auth.orSecure')}</Text><View style={[styles.orStroke, { backgroundColor: colors.border }]} /></View>
          <Button variant="secondary" onPress={() => go('browse')} style={styles.guestAccess}>{t('auth.continueGuest')}</Button>
          <Text style={[styles.authSwitch, { color: colors.text2 }]}>{t('auth.newHere')} <Text accessibilityRole="link" onPress={() => go('register')} style={{ color: colors.gold, fontWeight: '800' }}>{t('auth.createAccountLink')}</Text></Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => WebBrowser.openBrowserAsync(WEB_URL)}>
          <Text style={[styles.webPortalLink, { color: colors.text2 }]}>{t('auth.vendorPortal')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
