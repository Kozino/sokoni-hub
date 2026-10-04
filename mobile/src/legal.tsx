import { ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from './providers';
import { Header } from './ui';
import { Text } from './ui';

export function LegalScreen({ back, title = 'Terms & privacy' }: { back: () => void; path?: string; title?: string }) {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={title} back={back} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={[styles.heading, { color: colors.text }]}>1. Sokoni Hub – Vendor Onboarding Terms & Conditions</Text>
        
        <Text style={[styles.subheading, { color: colors.text }]}>1. Nature of the Service</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Sokoni Hub operates strictly as a digital marketplace intermediary. Sokoni Hub provides an online platform where independent Third-Party Vendors ("Vendors") can display goods and Independent Service Providers ("Providers") can list specialized consumer services (e.g., hair styling, nail care). Sokoni Hub does not sell physical inventory, perform services, or act as an employer to any listed provider.</Text>
        
        <Text style={[styles.subheading, { color: colors.text }]}>2. Transactions & Delivery Logistics</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>All commercial transactions are agreed upon and settled strictly between the consumer and the Vendor/Provider. Vendors/Providers are solely responsible for arranging payment terms directly with the customer (e.g., Cash on Delivery, personal payment links). Sokoni Hub does not hold, clear, or process client transactional funds. Vendors are completely responsible for their own product packaging, quality control, and delivery logistics.</Text>

        <Text style={[styles.subheading, { color: colors.text }]}>3. Onboarding Fees & Advertisements</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Sokoni Hub charges flat onboarding fees and premium visibility/sponsorship advertising placement fees. These fees are paid to Sokoni Hub to maintain platform listing access and are strictly non-refundable once the digital space or advertisement has been published, regardless of the Vendor’s sales volume.</Text>

        <Text style={[styles.subheading, { color: colors.text }]}>4. Prohibited Items & Compliance</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Vendors must comply with all laws of the State of Qatar. Listing counterfeit goods, unapproved medical cosmetics, or operating without appropriate personal health cards is strictly prohibited. Sokoni Hub reserves the absolute right to terminate any account violating these guidelines without a refund.</Text>
        
        <View style={{ height: 24 }} />

        <Text style={[styles.heading, { color: colors.text }]}>2. Service Provider Liability Disclaimer (Stylists & Technicians)</Text>
        
        <Text style={[styles.subheading, { color: colors.text }]}>1. No Employer-Employee Relationship</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Independent beauty, hair, nail, or wellness technicians listed on Sokoni Hub are freelance professionals and independent contractors. They are not employees, agents, or representatives of Sokoni Hub.</Text>
        
        <Text style={[styles.subheading, { color: colors.text }]}>2. Absolute Assumption of Risk</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Customers booking services via Sokoni Hub acknowledge that aesthetic treatments, hair styling, chemical applications, and nail tech procedures carry inherent personal risks (including but not limited to skin allergies, burns, or physical infections). The customer assumes all risks associated with scheduling and receiving services from their chosen Provider.</Text>

        <Text style={[styles.subheading, { color: colors.text }]}>3. Limitation of Liability</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Sokoni Hub explicitly disclaims any and all legal liability, damage claims, expenses, or personal injury lawsuits arising from substandard service quality, errors committed by a listed stylist/technician, late arrivals, cancellations, property damage during home-visit services, or allergic reactions to cosmetic products utilized by the provider.</Text>

        <Text style={[styles.subheading, { color: colors.text }]}>4. Dispute Resolution</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Any service quality issues, injury complaints, or refund disputes must be addressed directly with the individual Service Provider. Sokoni Hub is under no legal obligation to mediate or settle service-level conflicts.</Text>
      
        <View style={{ height: 24 }} />

        <Text style={[styles.heading, { color: colors.text }]}>Privacy Policy & Legal Operator</Text>
        <Text style={[styles.paragraph, { color: colors.text2 }]}>Registration in progress — this will be published once the Qatar company registration is complete.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  subheading: { fontSize: 15, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  paragraph: { fontSize: 14, lineHeight: 22 },
});
