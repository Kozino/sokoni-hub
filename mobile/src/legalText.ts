/**
 * Legal documents shown inside the app (Terms of use, Privacy policy, Marketplace policy).
 *
 * The wording is the website's own text, generated from web/src/pages/Legal.tsx, web/src/pages/Static.tsx (Policy) and
 * web/src/legalConfig.ts (version 2026-10-01). When those pages change, update this file to match so the app and the website
 * never disagree. Inline **double asterisks** mark bold lead-ins.
 */
export type LegalBlock = { t: 'h3'; text: string } | { t: 'p'; text: string } | { t: 'ul'; items: { b?: string; text: string }[] };
export type LegalSection = { title: string; blocks: LegalBlock[] };
export type LegalDoc = { key: 'terms' | 'privacy' | 'policy'; title: string; subtitle: string; sections: LegalSection[] };

export const LEGAL_OPERATOR = {
  "registration": "254111",
  "operatorName": "Sokoni Hub Retail and Business Support Platforms",
  "email": "support@sokonihub.qa",
  "whatsapp": "97466046431",
  "display": "+974 6604 6431",
  "hours": "24 hours a day, 7 days a week",
  "response": "24 hours",
  "version": "2026-10-01",
  "effective": "1 October 2026"
} as const;

export const LEGAL_DOCS: LegalDoc[] = [
  {
    "key": "terms",
    "title": "Terms of use",
    "subtitle": "How the marketplace works, and what buyers and vendors can expect.",
    "sections": [
      {
        "title": "1. Sokoni Hub – Vendor Onboarding Terms & Conditions",
        "blocks": [
          {
            "t": "h3",
            "text": "1. Nature of the Service"
          },
          {
            "t": "p",
            "text": "Sokoni Hub operates strictly as a digital marketplace intermediary. Sokoni Hub provides an online platform where independent Third-Party Vendors (\"Vendors\") can display goods and Independent Service Providers (\"Providers\") can list specialized consumer services (e.g., hair styling, nail care). Sokoni Hub does not sell physical inventory, perform services, or act as an employer to any listed provider."
          },
          {
            "t": "h3",
            "text": "2. Transactions & Delivery Logistics"
          },
          {
            "t": "p",
            "text": "All commercial transactions are agreed upon and settled strictly between the consumer and the Vendor/Provider."
          },
          {
            "t": "ul",
            "items": [
              {
                "b": "Payment:",
                "text": "Vendors/Providers are solely responsible for arranging payment terms directly with the customer (e.g., Cash on Delivery, personal payment links). Sokoni Hub does not hold, clear, or process client transactional funds."
              },
              {
                "b": "Fulfillment:",
                "text": "Vendors are completely responsible for their own product packaging, quality control, and delivery logistics."
              }
            ]
          },
          {
            "t": "h3",
            "text": "3. Onboarding Fees & Advertisements"
          },
          {
            "t": "p",
            "text": "Sokoni Hub charges flat onboarding fees and premium visibility/sponsorship advertising placement fees. These fees are paid to Sokoni Hub to maintain platform listing access and are strictly non-refundable once the digital space or advertisement has been published, regardless of the Vendor’s sales volume."
          },
          {
            "t": "h3",
            "text": "4. Prohibited Items & Compliance"
          },
          {
            "t": "p",
            "text": "Vendors must comply with all laws of the State of Qatar. Listing counterfeit goods, unapproved medical drugs/medicine, or operating without appropriate personal health cards is strictly prohibited. Sokoni Hub reserves the absolute right to terminate any account violating these guidelines without a refund."
          }
        ]
      },
      {
        "title": "2. Service Provider Liability Disclaimer (Stylists & Technicians)",
        "blocks": [
          {
            "t": "h3",
            "text": "1. No Employer-Employee Relationship"
          },
          {
            "t": "p",
            "text": "Independent beauty, hair, nail, or wellness technicians listed on Sokoni Hub are freelance professionals and independent contractors. They are not employees, agents, or representatives of Sokoni Hub."
          },
          {
            "t": "h3",
            "text": "2. Absolute Assumption of Risk"
          },
          {
            "t": "p",
            "text": "Customers booking services via Sokoni Hub acknowledge that aesthetic treatments, hair styling, chemical applications, and nail tech procedures carry inherent personal risks (including but not limited to skin allergies, burns, or physical infections). The customer assumes all risks associated with scheduling and receiving services from their chosen Provider."
          },
          {
            "t": "h3",
            "text": "3. Limitation of Liability"
          },
          {
            "t": "p",
            "text": "Sokoni Hub explicitly disclaims any and all legal liability, damage claims, expenses, or personal injury lawsuits arising from:"
          },
          {
            "t": "ul",
            "items": [
              {
                "text": "Substandard service quality or errors committed by a listed stylist/technician."
              },
              {
                "text": "Late arrivals, cancellations, or property damage during home-visit services."
              },
              {
                "text": "Allergic reactions or adverse reactions to cosmetic products utilized by the provider."
              }
            ]
          },
          {
            "t": "h3",
            "text": "4. Dispute Resolution"
          },
          {
            "t": "p",
            "text": "Any service quality issues, injury complaints, or refund disputes must be addressed directly with the individual Service Provider. Sokoni Hub is under no legal obligation to mediate or settle service-level conflicts."
          }
        ]
      }
    ]
  },
  {
    "key": "privacy",
    "title": "Privacy policy",
    "subtitle": "The information used to run your account, orders and service bookings.",
    "sections": [
      {
        "title": "1. Information we handle",
        "blocks": [
          {
            "t": "ul",
            "items": [
              {
                "b": "Accounts:",
                "text": "name, phone number, email address, role, password and PIN hashes, account status and security/session records. Administrator security includes MFA information."
              },
              {
                "b": "Vendor business records:",
                "text": "store name, description, location, contact details, images, CR or business-registration documents, verification decisions, and bank/payout information where supplied."
              },
              {
                "b": "Marketplace activity:",
                "text": "listings, order and booking details, buyer contact information, selected service location, notes, cancellations, reviews, statements and related records."
              },
              {
                "b": "Support and safety:",
                "text": "complaints, messages, deletion requests, review outcomes, security/rate-limit records and audit logs. Operational providers may also process technical connection and access logs."
              },
              {
                "b": "Location:",
                "text": "a city you select, or coordinates requested when you choose a location feature and grant browser permission. These support nearby-store discovery; home-service details you submit are handled as booking information."
              }
            ]
          },
          {
            "t": "p",
            "text": "Verification is for business registration, not personal identity-document collection. However, a CR can contain an individual’s name or contact details and may still include personal data. Do not upload a passport, national ID, driving licence or unrelated sensitive information for this purpose."
          }
        ]
      },
      {
        "title": "2. Why we use it",
        "blocks": [
          {
            "t": "p",
            "text": "Information is used to create and protect accounts, review vendor businesses, publish stores and listings, arrange orders and bookings, maintain marketplace and financial records, handle complaints and privacy requests, prevent misuse, and meet applicable legal obligations."
          },
          {
            "t": "p",
            "text": "Where consent is required, such as for optional analytics cookies, we ask for it separately and you can withdraw it at any time. We do not treat consent as a blanket basis for every use of your information."
          }
        ]
      },
      {
        "title": "3. Who can receive information",
        "blocks": [
          {
            "t": "p",
            "text": "Store profiles, listings and published reviews are visible to visitors. Relevant vendors receive the buyer/contact/order/booking information needed to handle their transactions. Authorised administrators can access records for moderation, support, security and business administration. Verification documents are not intended to be public listings; the current upload flow uses restricted private-document access."
          },
          {
            "t": "p",
            "text": "Hosting, database, file-storage and other operational providers process information for the service. Information may also be disclosed when legally required or to protect lawful rights. When you pay a vendor directly, the vendor and third-party provider handle information under their own practices; do not send unnecessary sensitive data."
          }
        ]
      },
      {
        "title": "4. Service providers and international transfers",
        "blocks": [
          {
            "t": "p",
            "text": "We use these providers to run the service:"
          },
          {
            "t": "ul",
            "items": [
              {
                "b": "Netlify:",
                "text": "Delivers the website."
              },
              {
                "b": "Render:",
                "text": "Runs the application server (API)."
              },
              {
                "b": "Supabase:",
                "text": "Stores uploaded images and private verification documents."
              },
              {
                "b": "Database provider:",
                "text": "Stores account, listing, order, booking and complaint records."
              },
              {
                "b": "Email delivery provider:",
                "text": "Sends verification, order, booking and recovery emails."
              },
              {
                "b": "Google Analytics (Google):",
                "text": "Measures site usage. Loaded only if you accept analytics cookies."
              },
              {
                "b": "WhatsApp (Meta):",
                "text": "Used only when you choose to contact Sokoni Hub support on WhatsApp."
              }
            ]
          },
          {
            "t": "p",
            "text": "The regions where each provider stores data are still being confirmed, and some processing may take place outside Qatar. We do not represent that all data remains in Qatar."
          }
        ]
      },
      {
        "title": "5. Browser storage and location controls",
        "blocks": [
          {
            "t": "p",
            "text": "The application uses browser storage for functions including sign-in, cart state, interface preferences and saved location choices. Administrator impersonation uses per-tab session storage. These are not all cookies; local and session storage can also retain information on your device. Logging out or clearing browser storage does not erase server-side records."
          },
          {
            "t": "p",
            "text": "You can deny or revoke browser geolocation permission and clear or change saved location through the location controls. Clearing site storage can also sign you out and remove local preferences or cart contents. External services you open, such as WhatsApp, have their own storage practices."
          }
        ]
      },
      {
        "title": "6. Retention and account deletion",
        "blocks": [
          {
            "t": "p",
            "text": "We keep information for these periods:"
          },
          {
            "t": "ul",
            "items": [
              {
                "b": "Account details (name, phone, email, role):",
                "text": "While your account is open. After a reviewed deletion request is completed they are removed from active use (target: within 30 days of the request)."
              },
              {
                "b": "Password and PIN hashes, sessions:",
                "text": "Until the account is closed. Sessions expire or are revoked sooner."
              },
              {
                "b": "Orders, bookings, order notes and reviews:",
                "text": "5 years after the order or booking is completed (commercial and accounting records)."
              },
              {
                "b": "Vendor store profile, listings and images:",
                "text": "While the store is active, and for 12 months after it closes unless a dispute or legal duty requires longer."
              },
              {
                "b": "Vendor verification documents (CR or business licence):",
                "text": "While the vendor is active, and for 12 months after verification ends or the store closes."
              },
              {
                "b": "Billing records, statements and payout details supplied by vendors:",
                "text": "5 years after the relevant statement."
              },
              {
                "b": "Complaints and supporting evidence:",
                "text": "3 years after the complaint is closed."
              },
              {
                "b": "Support messages and correspondence:",
                "text": "24 months after the last contact."
              },
              {
                "b": "Deletion-request record (minimal):",
                "text": "3 years, so we can show that your request was handled."
              },
              {
                "b": "Security, audit and email-delivery logs:",
                "text": "12 months."
              },
              {
                "b": "Analytics data (only if you accept analytics cookies):",
                "text": "14 months."
              },
              {
                "b": "Provider backups:",
                "text": "Kept on the provider’s rolling backup cycle; deleted data ages out of backups on that cycle."
              }
            ]
          },
          {
            "t": "p",
            "text": "You can submit an authenticated account-deletion request. An administrator reviews open orders, bookings, complaints and financial matters first. Completion removes account-profile contact details and credentials from active use, closes the store where applicable, revokes sessions and removes known account-owned uploaded files through the configured storage service."
          },
          {
            "t": "p",
            "text": "This is not a blind deletion of every linked database row. Transaction/financial records, dispute evidence, security records and a minimal request/closure record may need to remain, with a stated reason and review date. Administrators must review historical free-text, guest records, legacy/public file copies and externally held copies separately. Other customers’ records are not deleted just because your account is closed."
          },
          {
            "t": "p",
            "text": "Provider backups, caches and copies independently held by vendors are not automatically erased by the account-closure button. Their treatment and retention must be covered by the approved procedure; the request outcome should explain relevant exceptions. A retention review date is a manual follow-up, not an automatic purge."
          }
        ]
      },
      {
        "title": "7. Requests, corrections and concerns",
        "blocks": [
          {
            "t": "p",
            "text": "Contact Support, email support@sokonihub.qa or WhatsApp +974 6604 6431 to ask about your information, request access or correction, raise an objection or make an applicable erasure/consent-withdrawal request. We may need proportionate verification of your authority, not your password, PIN, MFA code or an unsolicited identity-document upload. Rights and exceptions depend on applicable law."
          },
          {
            "t": "p",
            "text": "If you cannot sign in, use Support rather than creating a request in someone else’s account. Keep your deletion receipt credentials private: they let you see the request outcome after account access ends. You may also raise unresolved concerns with the competent authority under Qatar’s personal-data protection framework."
          }
        ]
      },
      {
        "title": "8. Optional analytics and cookies",
        "blocks": [
          {
            "t": "p",
            "text": "The Sokoni Hub app does not load Google Analytics, Google Tag Manager or any advertising measurement."
          },
          {
            "t": "p",
            "text": "Where the website offers optional analytics, it only runs after you accept it in the website’s Cookie settings. That choice does not apply to the app."
          }
        ]
      },
      {
        "title": "9. Security and notice updates",
        "blocks": [
          {
            "t": "p",
            "text": "Controls include access restrictions, hashed account credentials, administrator MFA, revocable sessions and short-lived access to private verification files. No system is risk-free. Historical public documents require separate cleanup; changing a label does not protect an old public URL."
          },
          {
            "t": "p",
            "text": "Do not share credentials in support messages. We will update this notice when material practices change, with an appropriate version/date and notification process."
          }
        ]
      }
    ]
  },
  {
    "key": "policy",
    "title": "Marketplace policy",
    "subtitle": "Prohibited items, vendor checks, payments and complaints.",
    "sections": [
      {
        "title": "Prohibited categories",
        "blocks": [
          {
            "t": "p",
            "text": "**1. Medicine & drugs** — tablets, capsules, syrups, antibiotics, injections, supplements sold as medicine, and any pharmaceutical product."
          },
          {
            "t": "p",
            "text": "These restrictions exist because safe distribution of such products requires regulatory licensing that this platform does not verify. Listings are screened automatically at upload and reviewed manually by admins."
          }
        ]
      },
      {
        "title": "Vendor verification",
        "blocks": [
          {
            "t": "p",
            "text": "Every vendor account is reviewed by an administrator before any listing can be published. We check the business name, city, phone number and an uploaded CR or business-registration licence. Verification can be revoked if a vendor breaks the rules."
          }
        ]
      },
      {
        "title": "Payments",
        "blocks": [
          {
            "t": "p",
            "text": "Sokoni Hub does not currently hold or process funds. Buyers pay **cash on delivery**, or use **bank transfer** directly with the vendor. Always inspect goods before paying."
          }
        ]
      },
      {
        "title": "Complaints",
        "blocks": [
          {
            "t": "p",
            "text": "Any buyer — with or without an account — can file a complaint against a store, a listing or an order. You receive a reference code to track the outcome. Admins can investigate, resolve, dismiss, remove listings and suspend vendors."
          }
        ]
      }
    ]
  }
];
