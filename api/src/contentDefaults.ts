import type { ContentSlug } from './content';

export type DefaultPage = {
  slug: ContentSlug;
  title: string;
  subtitle: string;
  version: string;
  effective: string;
  markdown: string;
};

const VERSION = '2026-10-01';
const EFFECTIVE = '1 October 2026';

export const DEFAULT_PAGES: DefaultPage[] = [
  {
    slug: 'terms',
    title: 'Terms of Use',
    subtitle: 'How the marketplace works, and what buyers and vendors can expect.',
    version: VERSION,
    effective: EFFECTIVE,
    markdown: `## 1. Sokoni Hub – Vendor Onboarding Terms & Conditions

### 1. Nature of the Service
Sokoni Hub operates strictly as a digital marketplace intermediary. Sokoni Hub provides an online platform where independent Third-Party Vendors ("Vendors") can display goods and Independent Service Providers ("Providers") can list specialized consumer services (e.g., hair styling, nail care). Sokoni Hub does not sell physical inventory, perform services, or act as an employer to any listed provider.

### 2. Transactions & Delivery Logistics
All commercial transactions are agreed upon and settled strictly between the consumer and the Vendor/Provider.

- **Payment:** Vendors/Providers are solely responsible for arranging payment terms directly with the customer (e.g., Cash on Delivery, personal payment links). Sokoni Hub does not hold, clear, or process client transactional funds.
- **Fulfillment:** Vendors are completely responsible for their own product packaging, quality control, and delivery logistics.

### 3. Onboarding Fees & Advertisements
Sokoni Hub charges flat onboarding fees and premium visibility/sponsorship advertising placement fees. These fees are paid to Sokoni Hub to maintain platform listing access and are strictly non-refundable once the digital space or advertisement has been published, regardless of the Vendor’s sales volume.

### 4. Prohibited Items & Compliance
Vendors must comply with all laws of the State of Qatar. Listing counterfeit goods, unapproved medical drugs/medicine, or operating without appropriate personal health cards is strictly prohibited. Sokoni Hub reserves the absolute right to terminate any account violating these guidelines without a refund.

## 2. Service Provider Liability Disclaimer (Stylists & Technicians)

### 1. No Employer-Employee Relationship
Independent beauty, hair, nail, or wellness technicians listed on Sokoni Hub are freelance professionals and independent contractors. They are not employees, agents, or representatives of Sokoni Hub.

### 2. Absolute Assumption of Risk
Customers booking services via Sokoni Hub acknowledge that aesthetic treatments, hair styling, chemical applications, and nail tech procedures carry inherent personal risks (including but not limited to skin allergies, burns, or physical infections). The customer assumes all risks associated with scheduling and receiving services from their chosen Provider.

### 3. Limitation of Liability
Sokoni Hub explicitly disclaims any and all legal liability, damage claims, expenses, or personal injury lawsuits arising from:

- Substandard service quality or errors committed by a listed stylist/technician.
- Late arrivals, cancellations, or property damage during home-visit services.
- Allergic reactions or adverse reactions to cosmetic products utilized by the provider.

### 4. Dispute Resolution
Any service quality issues, injury complaints, or refund disputes must be addressed directly with the individual Service Provider. Sokoni Hub is under no legal obligation to mediate or settle service-level conflicts.
`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    subtitle: 'The information used to run your account, store, orders and service bookings.',
    version: VERSION,
    effective: EFFECTIVE,
    markdown: `## 1. Information we handle

- **Accounts:** name, phone number, email address, role, password and PIN hashes, account status and security/session records. Administrator security includes MFA information.
- **Vendor business records:** store name, description, location, contact details, images, CR or business-registration documents, verification decisions, and bank/payout information where supplied.
- **Marketplace activity:** listings, order and booking details, buyer contact information, selected service location, notes, cancellations, reviews, statements and related records.
- **Support and safety:** complaints, messages, deletion requests, review outcomes, security/rate-limit records and audit logs. Operational providers may also process technical connection and access logs.
- **Location:** a city you select, or coordinates requested when you choose a location feature and grant browser permission. These support nearby-store discovery; home-service details you submit are handled as booking information.

Verification is for business registration, not personal identity-document collection. However, a CR can contain an individual’s name or contact details and may still include personal data. Do not upload a passport, national ID, driving licence or unrelated sensitive information for this purpose.

## 2. Why we use it

Information is used to create and protect accounts, review vendor businesses, publish stores and listings, arrange orders and bookings, maintain marketplace and financial records, handle complaints and privacy requests, prevent misuse, and meet applicable legal obligations.

Where consent is required, such as for optional analytics cookies, we ask for it separately and you can withdraw it at any time. We do not treat consent as a blanket basis for every use of your information.

## 3. Who can receive information

Store profiles, listings and published reviews are visible to visitors. Relevant vendors receive the buyer/contact/order/booking information needed to handle their transactions. Authorised administrators can access records for moderation, support, security and business administration. Verification documents are not intended to be public listings; the current upload flow uses restricted private-document access.

Hosting, database, file-storage and other operational providers process information for the service. Information may also be disclosed when legally required or to protect lawful rights. When you pay a vendor directly, the vendor and third-party provider handle information under their own practices; do not send unnecessary sensitive data.

## 4. Service providers and international transfers

We use these providers to run the service:

- **Netlify:** Delivers the website.
- **Render:** Runs the application server (API).
- **Supabase:** Stores uploaded images and private verification documents.
- **Database provider:** Stores account, listing, order, booking and complaint records.
- **Email delivery provider:** Sends verification, order, booking and recovery emails.
- **Google Analytics (Google):** Measures site usage. Loaded only if you accept analytics cookies.
- **WhatsApp (Meta):** Used only when you choose to contact Sokoni Hub support on WhatsApp.

The regions where each provider stores data are still being confirmed, and some processing may take place outside Qatar. We do not represent that all data remains in Qatar.

## 5. Browser storage and location controls

The application uses browser storage for functions including sign-in, cart state, interface preferences and saved location choices. Administrator impersonation uses per-tab session storage. These are not all cookies; local and session storage can also retain information on your device. Logging out or clearing browser storage does not erase server-side records.

You can deny or revoke browser geolocation permission and clear or change saved location through the location controls. Clearing site storage can also sign you out and remove local preferences or cart contents. External services you open, such as WhatsApp, have their own storage practices.

## 6. Retention and account deletion

We keep information for these periods:

- **Account details (name, phone, email, role):** While your account is open. After a reviewed deletion request is completed they are removed from active use (target: within 30 days of the request).
- **Password and PIN hashes, sessions:** Until the account is closed. Sessions expire or are revoked sooner.
- **Orders, bookings, order notes and reviews:** 5 years after the order or booking is completed (commercial and accounting records).
- **Vendor store profile, listings and images:** While the store is active, and for 12 months after it closes unless a dispute or legal duty requires longer.
- **Vendor verification documents (CR or business licence):** While the vendor is active, and for 12 months after verification ends or the store closes.
- **Billing records, statements and payout details supplied by vendors:** 5 years after the relevant statement.
- **Complaints and supporting evidence:** 3 years after the complaint is closed.
- **Support messages and correspondence:** 24 months after the last contact.
- **Deletion-request record (minimal):** 3 years, so we can show that your request was handled.
- **Security, audit and email-delivery logs:** 12 months.
- **Analytics data (only if you accept analytics cookies):** 14 months.
- **Provider backups:** Kept on the provider’s rolling backup cycle; deleted data ages out of backups on that cycle.

You can submit an authenticated account-deletion request. An administrator reviews open orders, bookings, complaints and financial matters first. Completion removes account-profile contact details and credentials from active use, closes the store where applicable, revokes sessions and removes known account-owned uploaded files through the configured storage service.

This is not a blind deletion of every linked database row. Transaction/financial records, dispute evidence, security records and a minimal request/closure record may need to remain, with a stated reason and review date.

## 7. Requests, corrections and concerns

Contact Support, email {{supportEmail}} or WhatsApp {{supportDisplay}} to ask about your information, request access or correction, raise an objection or make an applicable erasure/consent-withdrawal request. We may need proportionate verification of your authority, not your password, PIN, MFA code or an unsolicited identity-document upload. Rights and exceptions depend on applicable law.

If you cannot sign in, use Support rather than creating a request in someone else’s account. You may also raise unresolved concerns with the competent authority under Qatar’s personal-data protection framework.

## 8. Optional analytics and cookies

With your consent, Sokoni Hub may load Google Tag Manager to send limited use measurements from public marketplace pages to Google Analytics. Analytics are not loaded until you choose “Accept analytics”. You can change or withdraw your choice at any time through Cookie settings.

If optional analytics is not enabled, this notice will say so. We do not use this optional measurement for advertising personalisation.

## 9. Security and notice updates

Controls include access restrictions, hashed account credentials, administrator MFA, revocable sessions and short-lived access to private verification files. No system is risk-free.

Do not share credentials in support messages. We will update this notice when material practices change, with an appropriate version/date and notification process.
`,
  },
  {
    slug: 'policy',
    title: 'Marketplace policy',
    subtitle: 'What can be listed, how vendors are verified, and how complaints work.',
    version: VERSION,
    effective: EFFECTIVE,
    markdown: `## Prohibited categories

- **Medicine & drugs:** tablets, capsules, syrups, antibiotics, injections, supplements sold as medicine, and any pharmaceutical product.

These restrictions exist because safe distribution of such products requires regulatory licensing that this platform does not verify. Listings are screened automatically at upload and reviewed manually by admins.

## Vendor verification

Every vendor account is reviewed by an administrator before any listing can be published. We check the business name, city, phone number and an uploaded CR or business-registration licence. Verification can be revoked if a vendor breaks the rules.

## Payments

Sokoni Hub does not currently hold or process funds. Buyers pay **cash on delivery**, or use **bank transfer** directly with the vendor. Always inspect goods before paying.

## Complaints

Any buyer — with or without an account — can file a complaint against a store, a listing or an order. You receive a reference code to track the outcome. Admins can investigate, resolve, dismiss, remove listings and suspend vendors.
`,
  },
  {
    slug: 'faq',
    title: 'Frequently asked questions',
    subtitle: 'Quick answers about buying, selling, verification and account support.',
    version: VERSION,
    effective: EFFECTIVE,
    markdown: `## How do I contact Sokoni Hub?

Use the Support page to submit and track a complaint, email {{supportEmail}}, or WhatsApp {{supportDisplay}}. Never share your password, PIN, MFA code or recovery codes.

## What must a vendor upload for verification?

A clear image of the commercial registration (CR) or business-registration licence. Do not upload a personal national ID, passport or driving licence. The current image uploader accepts supported image files, not PDF documents. Verification is reviewed by administrators.

## What does the verified badge mean?

An administrator has reviewed the submitted business information. The badge is not a government endorsement, a guarantee of every licence required for an activity, or a guarantee of a successful transaction.

## Does Sokoni Hub hold my payment?

The current marketplace does not hold or process buyers’ payment funds. Check the vendor’s available arrangements, such as cash on delivery or bank transfer, before paying.

## Is a service booking confirmed immediately?

Normally the vendor must confirm it. Some vendors enable auto-accept. Check the status shown in your booking rather than assuming a pending request is confirmed. Service appointments are Qatar-only.

## Can I choose home service?

Where the vendor offers it, select home service or the vendor’s premises in the booking flow. Check the service area and supply only the location details needed for the appointment.

## Can I cancel my appointment?

The vendor’s configured cancellation-notice period controls buyer self-service cancellation. Check your booking and contact the vendor or Support if the online cancellation option is unavailable. Cancellation does not itself process a refund.

## How do I report a problem?

Use Support and retain the tracking reference and required lookup details. Include your order or booking reference where available, without unnecessary sensitive information. You can contact the vendor first; statutory complaint and consumer remedies remain available.

## How do I delete my account?

Open Account deletion, sign in, confirm your current password and submit a request. Download the private receipt. An administrator reviews the request and any outstanding obligations. You can withdraw while it is pending, in review or awaiting your action; processing/completed requests cannot be withdrawn online.

## Does deletion remove every record immediately?

No. Reviewed completion removes the active account profile and known uploaded files, and ends access. Historical transactions, justified retained records, backups and third-party copies require separate handling. Your request outcome records retention exceptions and a review date.

## Will I receive email updates?

If you provide a valid email address, Sokoni Hub sends account-verification, booking and order confirmations, relevant status updates, and delivered-order receipts.
`,
  },
];
