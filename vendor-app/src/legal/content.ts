/**
 * Public legal text and support details for the vendor app.
 * Copied from the website (web/src/legalConfig.ts and web/src/pages/Legal.tsx).
 * Update both places when the published terms change.
 */

export const OPERATOR = {
  name: 'Sokoni Hub Retail and Business Support Platforms',
  cr: '254111',
  address: 'Doha, Qatar',
  version: '2026-10-01',
  effectiveDate: '1 October 2026',
};

export const CONTACT = {
  email: 'support@sokonihub.qa',
  /** WhatsApp in wa.me format: country code and number, no + or spaces. */
  whatsapp: '97466046431',
  /** Phone number to call, in tel: format. */
  phone: '+97466046431',
  phoneDisplay: '+974 6604 6431',
  hours: '24 hours a day, 7 days a week',
  responseTime: '24 hours',
};

export type LegalBlock = { h?: string; p?: string; ul?: string[] };
export type LegalSection = { title: string; blocks: LegalBlock[] };
export type LegalDocument = { key: 'terms' | 'privacy'; title: string; subtitle: string; sections: LegalSection[] };

const RETENTION: string[] = [
  'Account details (name, phone, email, role): While your account is open. After a reviewed deletion request is completed they are removed from active use (target: within 30 days of the request).',
  'Password and PIN hashes, sessions: Until the account is closed. Sessions expire or are revoked sooner.',
  'Orders, bookings, order notes and reviews: 5 years after the order or booking is completed (commercial and accounting records).',
  'Vendor store profile, listings and images: While the store is active, and for 12 months after it closes unless a dispute or legal duty requires longer.',
  'Vendor verification documents (CR or business licence): While the vendor is active, and for 12 months after verification ends or the store closes.',
  'Billing records, statements and payout details supplied by vendors: 5 years after the relevant statement.',
  'Complaints and supporting evidence: 3 years after the complaint is closed.',
  'Support messages and correspondence: 24 months after the last contact.',
  'Deletion-request record (minimal): 3 years, so we can show that your request was handled.',
  'Security, audit and email-delivery logs: 12 months.',
  'Provider backups: Kept on the provider’s rolling backup cycle; deleted data ages out of backups on that cycle.',
];

const PROVIDERS: string[] = [
  'Netlify: Delivers the website.',
  'Render: Runs the application server (API).',
  'Supabase: Stores uploaded images and private verification documents.',
  'Database provider: Stores account, listing, order, booking and complaint records.',
  'Email delivery provider: Sends verification, order, booking and recovery emails.',
  'WhatsApp (Meta): Used only when you choose to contact Sokoni Hub support on WhatsApp.',
];

export const TERMS: LegalDocument = {
  key: 'terms',
  title: 'Terms of Use',
  subtitle: 'How the marketplace works, and what buyers and vendors can expect.',
  sections: [
    {
      title: '1. Sokoni Hub – Vendor Onboarding Terms & Conditions',
      blocks: [
        { h: '1. Nature of the Service', p: 'Sokoni Hub operates strictly as a digital marketplace intermediary. Sokoni Hub provides an online platform where independent Third-Party Vendors ("Vendors") can display goods and Independent Service Providers ("Providers") can list specialized consumer services (e.g., hair styling, nail care). Sokoni Hub does not sell physical inventory, perform services, or act as an employer to any listed provider.' },
        {
          h: '2. Transactions & Delivery Logistics',
          p: 'All commercial transactions are agreed upon and settled strictly between the consumer and the Vendor/Provider.',
          ul: [
            'Payment: Vendors/Providers are solely responsible for arranging payment terms directly with the customer (e.g., Cash on Delivery, personal payment links). Sokoni Hub does not hold, clear, or process client transactional funds.',
            'Fulfillment: Vendors are completely responsible for their own product packaging, quality control, and delivery logistics.',
          ],
        },
        { h: '3. Onboarding Fees & Advertisements', p: 'Sokoni Hub charges flat onboarding fees and premium visibility/sponsorship advertising placement fees. These fees are paid to Sokoni Hub to maintain platform listing access and are strictly non-refundable once the digital space or advertisement has been published, regardless of the Vendor’s sales volume.' },
        { h: '4. Prohibited Items & Compliance', p: 'Vendors must comply with all laws of the State of Qatar. Listing counterfeit goods, unapproved medical drugs/medicine, or operating without appropriate personal health cards is strictly prohibited. Sokoni Hub reserves the absolute right to terminate any account violating these guidelines without a refund.' },
      ],
    },
    {
      title: '2. Service Provider Liability Disclaimer (Stylists & Technicians)',
      blocks: [
        { h: '1. No Employer-Employee Relationship', p: 'Independent beauty, hair, nail, or wellness technicians listed on Sokoni Hub are freelance professionals and independent contractors. They are not employees, agents, or representatives of Sokoni Hub.' },
        { h: '2. Absolute Assumption of Risk', p: 'Customers booking services via Sokoni Hub acknowledge that aesthetic treatments, hair styling, chemical applications, and nail tech procedures carry inherent personal risks (including but not limited to skin allergies, burns, or physical infections). The customer assumes all risks associated with scheduling and receiving services from their chosen Provider.' },
        {
          h: '3. Limitation of Liability',
          p: 'Sokoni Hub explicitly disclaims any and all legal liability, damage claims, expenses, or personal injury lawsuits arising from:',
          ul: [
            'Substandard service quality or errors committed by a listed stylist/technician.',
            'Late arrivals, cancellations, or property damage during home-visit services.',
            'Allergic reactions or adverse reactions to cosmetic products utilized by the provider.',
          ],
        },
        { h: '4. Dispute Resolution', p: 'Any service quality issues, injury complaints, or refund disputes must be addressed directly with the individual Service Provider. Sokoni Hub is under no legal obligation to mediate or settle service-level conflicts.' },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  key: 'privacy',
  title: 'Privacy Policy',
  subtitle: 'The information used to run your account, store, orders and service bookings.',
  sections: [
    {
      title: '1. Information we handle',
      blocks: [
        {
          ul: [
            'Accounts: name, phone number, email address, role, password and PIN hashes, account status and security/session records. Administrator security includes MFA information.',
            'Vendor business records: store name, description, location, contact details, images, CR or business-registration documents, verification decisions, and bank/payout information where supplied.',
            'Marketplace activity: listings, order and booking details, buyer contact information, selected service location, notes, cancellations, reviews, statements and related records.',
            'Support and safety: complaints, messages, deletion requests, review outcomes, security/rate-limit records and audit logs. Operational providers may also process technical connection and access logs.',
            'Location: a city you select, or coordinates requested when you choose a location feature and grant permission. These support nearby-store discovery; home-service details you submit are handled as booking information.',
          ],
        },
        { p: 'Verification is for business registration, not personal identity-document collection. However, a CR can contain an individual’s name or contact details and may still include personal data. Do not upload a passport, national ID, driving licence or unrelated sensitive information for this purpose.' },
      ],
    },
    {
      title: '2. Why we use it',
      blocks: [
        { p: 'Information is used to create and protect accounts, review vendor businesses, publish stores and listings, arrange orders and bookings, maintain marketplace and financial records, handle complaints and privacy requests, prevent misuse, and meet applicable legal obligations.' },
        { p: 'Where consent is required, such as for optional analytics, we ask for it separately and you can withdraw it at any time. We do not treat consent as a blanket basis for every use of your information.' },
      ],
    },
    {
      title: '3. Who can receive information',
      blocks: [
        { p: 'Store profiles, listings and published reviews are visible to visitors. Relevant vendors receive the buyer/contact/order/booking information needed to handle their transactions. Authorised administrators can access records for moderation, support, security and business administration. Verification documents are not intended to be public listings; the current upload flow uses restricted private-document access.' },
        { p: 'Hosting, database, file-storage and other operational providers process information for the service. Information may also be disclosed when legally required or to protect lawful rights. When you pay a vendor directly, the vendor and third-party provider handle information under their own practices; do not send unnecessary sensitive data.' },
      ],
    },
    {
      title: '4. Service providers and international transfers',
      blocks: [
        { p: 'We use these providers to run the service:', ul: PROVIDERS },
        { p: 'The regions where each provider stores data are still being confirmed, and some processing may take place outside Qatar. We do not represent that all data remains in Qatar.' },
      ],
    },
    {
      title: '5. Retention and account deletion',
      blocks: [
        { p: 'We keep information for these periods:', ul: RETENTION },
        { p: 'You can submit an account-deletion request on the Sokoni Hub website while signed in. An administrator reviews open orders, bookings, complaints and financial matters first. Completion removes account-profile contact details and credentials from active use, closes the store where applicable, revokes sessions and removes known account-owned uploaded files through the configured storage service.' },
        { p: 'This is not a blind deletion of every linked database row. Transaction/financial records, dispute evidence, security records and a minimal request/closure record may need to remain, with a stated reason and review date. Other customers’ records are not deleted just because your account is closed.' },
        { p: 'Provider backups, caches and copies independently held by vendors are not automatically erased by the account-closure button. Their treatment and retention must be covered by the approved procedure; the request outcome should explain relevant exceptions. A retention review date is a manual follow-up, not an automatic purge.' },
      ],
    },
    {
      title: '6. Requests, corrections and concerns',
      blocks: [
        { p: `Contact Support in this app (Help & support), email ${CONTACT.email} or WhatsApp ${CONTACT.phoneDisplay} to ask about your information, request access or correction, raise an objection or make an applicable erasure or consent-withdrawal request. We may need proportionate verification of your authority, not your password, PIN, MFA code or an unsolicited identity-document upload. Rights and exceptions depend on applicable law.` },
        { p: 'If you cannot sign in, use Support rather than creating a request in someone else’s account. Keep your deletion receipt credentials private: they let you see the request outcome after account access ends. You may also raise unresolved concerns with the competent authority under Qatar’s personal-data protection framework.' },
      ],
    },
    {
      title: '7. Security and notice updates',
      blocks: [
        { p: 'Controls include access restrictions, hashed account credentials, administrator MFA, revocable sessions and short-lived access to private verification files. No system is risk-free.' },
        { p: 'Do not share credentials in support messages. We will update this notice when material practices change, with an appropriate version/date and notification process.' },
      ],
    },
  ],
};
