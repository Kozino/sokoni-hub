// PUBLIC information only. Never put keys, passwords or private admin contacts here.
// Operator details stay empty until the company is registered in Qatar; the legal pages
// then show a "registration in progress" notice instead of inventing a name or CR number.
export const legalConfig = {
  // Set to true to show the "draft" warning banner on the legal pages again.
  draft: false,
  version: '2026-10-01',
  effectiveDate: '1 October 2026',
  siteUrl: 'https://sokonihub.qa',

  // Fill these in once the Qatar registration is complete.
  operatorName: '',
  operatorCR: '',
  operatorAddress: '',

  supportEmail: 'support@sokonihub.qa',
  supportWhatsApp: '97466046431',
  supportDisplay: '+974 6604 6431',
  supportHours: '24 hours a day, 7 days a week',
  responseTime: '24 hours',

  // Retention schedule shown in the Privacy Policy. Review with an accountant/lawyer after registration.
  retention: [
    ['Account details (name, phone, email, role)', 'While your account is open. After a reviewed deletion request is completed they are removed from active use (target: within 30 days of the request).'],
    ['Password and PIN hashes, sessions', 'Until the account is closed. Sessions expire or are revoked sooner.'],
    ['Orders, bookings, order notes and reviews', '5 years after the order or booking is completed (commercial and accounting records).'],
    ['Vendor store profile, listings and images', 'While the store is active, and for 12 months after it closes unless a dispute or legal duty requires longer.'],
    ['Vendor verification documents (CR or business licence)', 'While the vendor is active, and for 12 months after verification ends or the store closes.'],
    ['Billing records, statements and payout details supplied by vendors', '5 years after the relevant statement.'],
    ['Complaints and supporting evidence', '3 years after the complaint is closed.'],
    ['Support messages and correspondence', '24 months after the last contact.'],
    ['Deletion-request record (minimal)', '3 years, so we can show that your request was handled.'],
    ['Security, audit and email-delivery logs', '12 months.'],
    ['Analytics data (only if you accept analytics cookies)', '14 months.'],
    ['Provider backups', 'Kept on the provider’s rolling backup cycle; deleted data ages out of backups on that cycle.'],
  ] as [string, string][],

  providers: [
    ['Netlify', 'Delivers the website.'],
    ['Render', 'Runs the application server (API).'],
    ['Supabase', 'Stores uploaded images and private verification documents.'],
    ['Database provider', 'Stores account, listing, order, booking and complaint records.'],
    ['Email delivery provider', 'Sends verification, order, booking and recovery emails.'],
    ['Google Analytics (Google)', 'Measures site usage. Loaded only if you accept analytics cookies.'],
    ['WhatsApp (Meta)', 'Used only when you choose to contact support or a vendor on WhatsApp.'],
  ] as [string, string][],

  // Shown only when `draft` is true.
  outstanding: [
    'Add the registered operator name, Qatar commercial registration number and address once registration is complete.',
    'Confirm the database provider and the regions where data is stored.',
    'Have a Qatar lawyer review the Terms, Privacy Policy and Cookie Policy, and confirm the retention periods.',
  ],
};
