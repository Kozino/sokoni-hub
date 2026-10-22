import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP, WEB_URL } from '../config';
import { Icon, type IconName } from '../icons';
import { Panel, Screen, accentAt } from '../kit';
import type { NavProps } from '../nav';
import { useTheme } from '../providers';
import { Header, Notice, Text } from '../ui';

/** How the app really behaves, in plain words. Kept next to the code that implements each rule. */
const FAQ: [string, string][] = [
  ['Where is my order?', 'Open Profile → Orders and tap Track Order. You will see the store, your rider and a live map once the order is on its way.'],
  ['How do I pay?', 'Orders are cash on delivery: you pay the seller or rider when you receive or collect your order. Nothing is charged in the app.'],
  ['Can I cancel an order?', 'Yes, until a rider accepts it: open the order and tap Cancel order. After that, please contact the store.'],
  ['Something arrived wrong', 'Open the order and tap Report a problem before the confirmation window closes. Our team reviews every report.'],
  ['How do bookings work?', 'Choose a provider, a date and a time. The provider confirms, and you pay them directly when the service is done.'],
  ['Change or cancel a booking', 'Open Profile → Bookings. Reschedule lets you message the provider, or cancel and book a new time.'],
];

export function Support({ go, back }: NavProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  const open_ = (url: string) => void Linking.openURL(url);
  return (
    <Screen>
      <Header title="Help & support" back={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 32, gap: 8 }}>
        <LinearGradient colors={[colors.heroB, colors.heroA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroCircle} />
          <View style={s.heroIcon}><Icon name="help-buoy" solid={false} size={22} color="#FFFFFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.3 }}>We&apos;re here to help</Text>
            <Text style={{ fontSize: 11, lineHeight: 15, color: '#D3EEDF', marginTop: 2 }}>For an order, booking, account or marketplace issue, contact Sokoni Hub directly.</Text>
          </View>
        </LinearGradient>

        <View style={s.grid}>
          <Contact icon="logo-whatsapp" title="WhatsApp" sub="Message our team" accent={0} onPress={() => open_(`https://wa.me/${SUPPORT_WHATSAPP}`)} />
          <Contact icon="mail" title="Email" sub={SUPPORT_EMAIL} accent={2} onPress={() => open_(`mailto:${SUPPORT_EMAIL}`)} />
          <Contact icon="globe" title="Website" sub="More help and info" accent={3} onPress={() => open_(WEB_URL)} />
          <Contact icon="document-text" title="Terms & privacy" sub="Read them in the app" accent={1} onPress={() => go('legal')} />
        </View>

        <Text style={{ fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, color: colors.text, marginTop: 6 }}>Common questions</Text>
        <Panel style={{ padding: 4 }}>
          {FAQ.map(([q, a], index) => {
            const accent = accentAt(colors, index);
            return (
              <View key={q} style={[index < FAQ.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === index }} onPress={() => setOpen(open === index ? null : index)} style={s.q}>
                  <View style={[s.qNo, { backgroundColor: accent.bg }]}><Text style={{ fontSize: 10.5, fontWeight: '700', color: accent.fg }}>{index + 1}</Text></View>
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.text }}>{q}</Text>
                  <Icon name={open === index ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
                </Pressable>
                {open === index ? <Text style={{ fontSize: 11.5, lineHeight: 17, color: colors.text2, paddingLeft: 42, paddingRight: 10, paddingBottom: 10 }}>{a}</Text> : null}
              </View>
            );
          })}
        </Panel>
        <Notice type="warning">Never share your password, PIN, one-time recovery code or payment details in a message.</Notice>
      </ScrollView>
    </Screen>
  );
}

function Contact({ icon, title, sub, accent, onPress }: { icon: IconName; title: string; sub: string; accent: number; onPress: () => void }) {
  const { colors } = useTheme();
  const tone = accentAt(colors, accent);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [s.tile, { backgroundColor: tone.bg, opacity: pressed ? 0.88 : 1 }]}>
      <View style={[s.tileIcon, { backgroundColor: colors.surface }]}><Icon name={icon} solid={false} size={18} color={tone.fg} /></View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10.5, color: colors.text2, marginTop: 1 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' },
  heroCircle: { position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '47%', flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, padding: 10 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  q: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 9 },
  qNo: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
