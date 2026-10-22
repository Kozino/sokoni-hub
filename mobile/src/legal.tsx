/**
 * Terms of use, Privacy policy and Marketplace policy, read inside the app. The wording is the website's own text
 * (see legalText.ts); nothing here opens a browser. Sections fold open one at a time so a long policy stays easy to scan.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from './config';
import { tap } from './haptics';
import { Icon, type IconName } from './icons';
import { Panel, Screen, SegTabs, accentAt } from './kit';
import { LEGAL_DOCS, LEGAL_OPERATOR, type LegalBlock, type LegalDoc } from './legalText';
import { useTheme } from './providers';
import { Header, Text } from './ui';
import type { ReactNode } from 'react';

const ICONS: Record<LegalDoc['key'], IconName> = { terms: 'document-text', privacy: 'shield-checkmark', policy: 'ribbon' };
const TAB_LABEL: Record<LegalDoc['key'], string> = { terms: 'Terms', privacy: 'Privacy', policy: 'Policy' };

/** Renders text with **bold** lead-ins. */
function Rich({ text, style, color, bold }: { text: string; style: object; color: string; bold: string }) {
  const parts = text.split('**');
  return (
    <Text style={[style, { color }]}>
      {parts.map((part, i) => (i % 2 ? <Text key={i} style={{ fontWeight: '700', color: bold }}>{part}</Text> : part))}
    </Text>
  );
}

function Blocks({ blocks }: { blocks: LegalBlock[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      {blocks.map((block, index) => {
        if (block.t === 'h3') return <Text key={index} style={[s.h3, { color: colors.text }]}>{block.text}</Text>;
        if (block.t === 'p') return <Rich key={index} text={block.text} style={s.p} color={colors.text2} bold={colors.text} />;
        return (
          <View key={index} style={{ gap: 6 }}>
            {block.items.map((item, i) => (
              <View key={i} style={s.li}>
                <View style={[s.bullet, { backgroundColor: colors.primary }]} />
                <Text style={[s.p, { flex: 1, color: colors.text2 }]}>{item.b ? <Text style={{ fontWeight: '700', color: colors.text }}>{item.b} </Text> : null}{item.text}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function LegalScreen({ back, go, doc }: { back: () => void; go: (screen: any, params?: any) => void; doc?: string }) {
  const { colors } = useTheme();
  const initial = (LEGAL_DOCS.find((d) => d.key === doc)?.key ?? 'terms') as LegalDoc['key'];
  const [active, setActive] = useState<LegalDoc['key']>(initial);
  const current = LEGAL_DOCS.find((d) => d.key === active) as LegalDoc;
  const [open, setOpen] = useState<Record<string, boolean>>({ [`${initial}-0`]: true });
  const allOpen = current.sections.every((_, i) => open[`${active}-${i}`]);
  const toggle = (i: number) => { tap(); setOpen((old) => ({ ...old, [`${active}-${i}`]: !old[`${active}-${i}`] })); };
  const setAll = (value: boolean) => { tap(); setOpen((old) => ({ ...old, ...Object.fromEntries(current.sections.map((_, i) => [`${active}-${i}`, value])) })); };
  const showOperator = active !== 'policy';

  return (
    <Screen>
      <Header title="Terms & privacy" back={back} />
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <SegTabs items={LEGAL_DOCS.map((d) => ({ key: d.key, label: TAB_LABEL[d.key] }))} active={active} onChange={(key) => setActive(key as LegalDoc['key'])} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32, gap: 8 }}>
        <LinearGradient colors={[colors.heroA, colors.heroB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroCircle} />
          <View style={s.heroIcon}><Icon name={ICONS[active]} solid={false} size={20} color={colors.orange} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>{current.title}</Text>
            <Text style={s.heroText}>{current.subtitle}</Text>
            <View style={s.heroChips}>
              <View style={s.heroChip}><Text style={s.heroChipText}>Version {LEGAL_OPERATOR.version}</Text></View>
              <View style={s.heroChip}><Text style={s.heroChipText}>Effective {LEGAL_OPERATOR.effective}</Text></View>
            </View>
          </View>
        </LinearGradient>

        {showOperator ? (
          <Panel style={{ gap: 8 }}>
            <View style={s.rowHead}>
              <View style={[s.badge, { backgroundColor: colors.skySoft }]}><Icon name="building" solid={false} size={15} color={colors.sky} /></View>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Who operates Sokoni Hub?</Text>
            </View>
            <Text style={[s.p, { color: colors.text2 }]}><Text style={{ fontWeight: '700', color: colors.text }}>{LEGAL_OPERATOR.operatorName}</Text> · Commercial registration {LEGAL_OPERATOR.registration}</Text>
            <Text style={[s.p, { color: colors.text2 }]}>Support hours: {LEGAL_OPERATOR.hours}. Typical response time: {LEGAL_OPERATOR.response}.</Text>
            <View style={s.contactRow}>
              <ContactButton icon="logo-whatsapp" label={LEGAL_OPERATOR.display} bg={colors.primarySoft} fg={colors.primary} onPress={() => void Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)} />
              <ContactButton icon="mail" label={SUPPORT_EMAIL} bg={colors.violetSoft} fg={colors.violet} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
            </View>
          </Panel>
        ) : null}

        <View style={s.toolbar}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text2 }}>{current.sections.length} {current.sections.length === 1 ? 'section' : 'sections'}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setAll(!allOpen)}><Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.primary }}>{allOpen ? 'Collapse all' : 'Expand all'}</Text></Pressable>
        </View>

        {current.sections.map((section, i) => {
          const accent = accentAt(colors, i);
          const m = section.title.match(/^(\d+)\.\s+(.*)$/);
          const number = m ? m[1] : String(i + 1);
          const title = m ? m[2] : section.title;
          const isOpen = !!open[`${active}-${i}`];
          return (
            <Panel key={`${active}-${i}`} accent={accent.fg} style={{ padding: 0 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => toggle(i)} style={s.sectionHead}>
                <View style={[s.badge, { backgroundColor: accent.bg }]}><Text style={{ fontSize: 11.5, fontWeight: '700', color: accent.fg }}>{number}</Text></View>
                <Text style={[s.sectionTitle, { color: colors.text, flex: 1 }]}>{title}</Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
              </Pressable>
              {isOpen ? <View style={s.sectionBody}><Blocks blocks={section.blocks} /></View> : null}
            </Panel>
          );
        })}

        <Panel style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Questions about these documents?</Text>
          <Text style={{ fontSize: 11, lineHeight: 16, color: colors.text2, textAlign: 'center' }}>Our team replies within {LEGAL_OPERATOR.response}. Never share your password, PIN or recovery code in a message.</Text>
          <Pressable accessibilityRole="button" onPress={() => go('support')} style={[s.supportBtn, { backgroundColor: colors.primarySoft }]}><Icon name="help-buoy" solid={false} size={15} color={colors.primary} /><Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Open Help & support</Text></Pressable>
        </Panel>
      </ScrollView>
    </Screen>
  );
}

function ContactButton({ icon, label, bg, fg, onPress }: { icon: IconName; label: string; bg: string; fg: string; onPress: () => void }): ReactNode {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.contact, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}>
      <Icon name={icon} solid={false} size={14} color={fg} />
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: fg, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 16, padding: 12, flexDirection: 'row', gap: 10, overflow: 'hidden' },
  heroCircle: { position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },
  heroText: { color: '#CFEBDC', fontSize: 11, lineHeight: 15, marginTop: 2 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 8, paddingHorizontal: 7, height: 18, justifyContent: 'center' },
  heroChipText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '600' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, borderRadius: 10, paddingHorizontal: 10, flexShrink: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingLeft: 13, paddingRight: 11 },
  sectionBody: { paddingHorizontal: 13, paddingBottom: 12, paddingTop: 0 },
  h3: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  p: { fontSize: 11.5, lineHeight: 18 },
  li: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  supportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 11, paddingHorizontal: 14, marginTop: 4 },
});
