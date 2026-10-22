import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WEB_URL } from './config';
import { Icon, type IconName } from './icons';
import { Panel, Screen } from './kit';
import { useTheme } from './providers';
import { Header, Text } from './ui';

/** Full documents live on the website; the summaries below ship with the app. */
const DOCUMENTS: [IconName, string, string, string][] = [
  ['document-text', 'Terms of use', 'The full customer terms', '/terms'],
  ['shield-checkmark', 'Privacy policy', 'How your data is handled', '/privacy'],
  ['ribbon', 'Customer policy', 'Orders, bookings and refunds', '/policy'],
];

const SECTIONS: { title: string; blocks: ['sub' | 'p', string][] }[] = [
  { title: "1. Sokoni Hub – Vendor Onboarding Terms & Conditions", blocks: [
    ["sub", "1. Nature of the Service"],
    ["p", "Sokoni Hub operates strictly as a digital marketplace intermediary. Sokoni Hub provides an online platform where independent Third-Party Vendors (\"Vendors\") can display goods and Independent Service Providers (\"Providers\") can list specialized consumer services (e.g., hair styling, nail care). Sokoni Hub does not sell physical inventory, perform services, or act as an employer to any listed provider."],
    ["sub", "2. Transactions & Delivery Logistics"],
    ["p", "All commercial transactions are agreed upon and settled strictly between the consumer and the Vendor/Provider. Vendors/Providers are solely responsible for arranging payment terms directly with the customer (e.g., Cash on Delivery, personal payment links). Sokoni Hub does not hold, clear, or process client transactional funds. Vendors are completely responsible for their own product packaging, quality control, and delivery logistics."],
    ["sub", "3. Onboarding Fees & Advertisements"],
    ["p", "Sokoni Hub charges flat onboarding fees and premium visibility/sponsorship advertising placement fees. These fees are paid to Sokoni Hub to maintain platform listing access and are strictly non-refundable once the digital space or advertisement has been published, regardless of the Vendor’s sales volume."],
    ["sub", "4. Prohibited Items & Compliance"],
    ["p", "Vendors must comply with all laws of the State of Qatar. Listing counterfeit goods, unapproved medical cosmetics, or operating without appropriate personal health cards is strictly prohibited. Sokoni Hub reserves the absolute right to terminate any account violating these guidelines without a refund."],
  ] },
  { title: "2. Service Provider Liability Disclaimer (Stylists & Technicians)", blocks: [
    ["sub", "1. No Employer-Employee Relationship"],
    ["p", "Independent beauty, hair, nail, or wellness technicians listed on Sokoni Hub are freelance professionals and independent contractors. They are not employees, agents, or representatives of Sokoni Hub."],
    ["sub", "2. Absolute Assumption of Risk"],
    ["p", "Customers booking services via Sokoni Hub acknowledge that aesthetic treatments, hair styling, chemical applications, and nail tech procedures carry inherent personal risks (including but not limited to skin allergies, burns, or physical infections). The customer assumes all risks associated with scheduling and receiving services from their chosen Provider."],
    ["sub", "3. Limitation of Liability"],
    ["p", "Sokoni Hub explicitly disclaims any and all legal liability, damage claims, expenses, or personal injury lawsuits arising from substandard service quality, errors committed by a listed stylist/technician, late arrivals, cancellations, property damage during home-visit services, or allergic reactions to cosmetic products utilized by the provider."],
    ["sub", "4. Dispute Resolution"],
    ["p", "Any service quality issues, injury complaints, or refund disputes must be addressed directly with the individual Service Provider. Sokoni Hub is under no legal obligation to mediate or settle service-level conflicts."],
  ] },
  { title: "Privacy Policy & Legal Operator", blocks: [
    ["p", "Registration in progress — this will be published once the Qatar company registration is complete."],
  ] },
];

export function LegalScreen({ back, title = 'Terms & privacy' }: { back: () => void; path?: string; title?: string }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <Header title={title} back={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}>
        <Panel style={{ padding: 6 }}>
          {DOCUMENTS.map(([icon, name, sub, path], index) => (
            <Pressable key={path} accessibilityRole="link" accessibilityLabel={name} onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}${path}`).catch(() => {})} style={({ pressed }) => [styles.doc, index < DOCUMENTS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, { opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.docIcon, { backgroundColor: colors.primarySoft }]}><Icon name={icon} solid={false} size={21} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>{name}</Text><Text style={{ fontSize: 13.5, color: colors.text2, marginTop: 2 }}>{sub}</Text></View>
              <Icon name="external" solid={false} size={18} color={colors.muted} />
            </Pressable>
          ))}
        </Panel>
        {SECTIONS.map((section) => (
          <Panel key={section.title} style={{ padding: 18 }}>
            <Text style={[styles.heading, { color: colors.text }]}>{section.title}</Text>
            {section.blocks.map(([kind, text], index) => kind === 'sub'
              ? <Text key={index} style={[styles.subheading, { color: colors.text }]}>{text}</Text>
              : <Text key={index} style={[styles.paragraph, { color: colors.text2 }]}>{text}</Text>)}
          </Panel>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doc: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, paddingHorizontal: 10 },
  docIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginBottom: 6, lineHeight: 24 },
  subheading: { fontSize: 15, fontWeight: '800', marginTop: 14, marginBottom: 5 },
  paragraph: { fontSize: 14, lineHeight: 22 },
});
