import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EnglishScope } from '../i18n';
import { legalConfig as c } from '../legalConfig';
import { analyticsAvailable } from '../lib/analytics';
import './legal.css';

export function HelpPage({ title, subtitle, children, draft = false }: { title: string; subtitle: string; children: ReactNode; draft?: boolean }) {
  return (
    <article className="legal-page" lang="en" dir="ltr">
      <EnglishScope />
      <header className="legal-hero">
        <span className="legal-eyebrow">SOKONI HUB · HELP &amp; TRUST</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      <nav className="legal-nav" aria-label="Help and legal pages">
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/support">Contact &amp; Support</Link>
        <Link to="/faq">FAQ</Link>
        <Link to="/delete-account">Account deletion</Link>
      </nav>
      {draft && c.draft && (
        <aside className="legal-warning" role="note">
          <strong>Draft — not finalised for publication</strong>
          <details><summary>What must be completed before publication?</summary><ul>{c.outstanding.map((x) => <li key={x}>{x}</li>)}</ul></details>
        </aside>
      )}
      <div className="legal-content">{children}</div>
    </article>
  );
}

const Email = () => <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a>;
const WhatsApp = () => <a href={`https://wa.me/${c.supportWhatsApp}`} target="_blank" rel="noopener noreferrer">WhatsApp {c.supportDisplay}</a>;

function Meta() {
  return <p className="muted">Effective {c.effectiveDate} · Version {c.version}</p>;
}

function Operator() {
  return (
    <section>
      <h2>Who operates Sokoni Hub?</h2>
      {c.operatorName ? (
        <dl>
          <dt>Legal operator</dt><dd>{c.operatorName}</dd>
          {c.operatorCR && (<><dt>Commercial registration</dt><dd>{c.operatorCR}</dd></>)}
          {c.operatorAddress && (<><dt>Address</dt><dd>{c.operatorAddress}</dd></>)}
        </dl>
      ) : (
        <p>Sokoni Hub, available at {c.siteUrl.replace('https://', '')}, is being registered as a business in the State of Qatar. The registered legal name, commercial registration number and address of the operator will be published here as soon as registration is complete. Until then, send any question, request or legal notice to <Email /> or <WhatsApp />.</p>
      )}
      <p>Support is available {c.supportHours}, and we aim to respond within {c.responseTime}.</p>
      <Meta />
    </section>
  );
}

export function Terms() {
  return (
    <HelpPage title="Terms of Use" subtitle="How Sokoni Hub works, and what buyers and vendors can expect from each other and from us." draft>
      <Operator />

      <section>
        <h2>1. Agreeing to these Terms</h2>
        <p>By visiting Sokoni Hub, creating an account, placing an order, booking a service or listing a product or service, you agree to these Terms, the <Link to="/privacy">Privacy Policy</Link>, the <Link to="/cookies">Cookie Policy</Link> and the <Link to="/policy">marketplace rules</Link>. If you do not agree, please do not use the service.</p>
        <p><strong>Eligibility.</strong> You must be at least 18 years old and legally able to enter into a binding agreement to create an account, order, book or sell. Sokoni Hub is not intended for anyone under 18.</p>
      </section>

      <section>
        <h2>2. Our role as a marketplace</h2>
        <p>Sokoni Hub connects buyers with independent vendors who sell products and offer services, mainly within the African community in Qatar. Unless a listing clearly says otherwise, the vendor — not Sokoni Hub — is the seller or service provider. The vendor is responsible for the listing, the price, the quality and safety of what it supplies, delivery or service performance, and any return, replacement or refund.</p>
        <p>Sokoni Hub provides the tools to list, discover, order, book, review and complain, and we review vendor businesses before they are verified. We are not a party to the sale or service contract between a buyer and a vendor.</p>
        <p>Services are provided in Qatar. Check the vendor’s location, delivery area and availability before you order or book.</p>
      </section>

      <section>
        <h2>3. Accounts and security</h2>
        <p>Give accurate details, keep them up to date, and use only an account you are entitled to use. Keep your password and PIN private; never share them, including with people who say they work for Sokoni Hub — we will never ask for them. Tell us straight away at <Email /> if you think your account has been accessed by someone else. You are responsible for activity under your account until you tell us about a problem.</p>
      </section>

      <section>
        <h2>4. Vendor obligations and verification</h2>
        <ul>
          <li>You must be legally entitled to run the business you advertise and hold every registration, licence and permission it needs in Qatar, including for selling food.</li>
          <li>Listings must be accurate and not misleading: real photos, correct prices and quantities, honest descriptions and clear delivery, cancellation and return conditions.</li>
          <li>Verification asks for a commercial registration (CR) or business-registration licence. Do not upload a personal national ID, passport or driving licence for this purpose.</li>
          <li>A “verified” badge means an administrator reviewed the business information you submitted. It is not a government endorsement, a guarantee of quality or safety, or a promise of future performance. We may remove it if the information proves wrong or you break these Terms.</li>
          <li>Prohibited items, including cosmetics and medicines, may not be listed. Read the <Link to="/policy">marketplace rules</Link>. We may remove listings that are unlawful, misleading, infringing or prohibited.</li>
          <li>Respond to orders, bookings and buyer messages promptly and handle buyer information only to complete the transaction.</li>
        </ul>
      </section>

      <section>
        <h2>5. Keeping transactions on Sokoni Hub</h2>
        <p>Vendors are given a store page, order and booking tools and access to buyers so that transactions happen through Sokoni Hub. You agree that:</p>
        <ul>
          <li>Vendors must not use Sokoni Hub only to find customers and then steer those customers to buy or book outside the platform to avoid fees, verification, reviews or the complaint process.</li>
          <li>Vendors must not publish listings, descriptions, images or messages whose main purpose is to move buyers to another channel, such as sharing personal contact details to take an order elsewhere. Using the order, booking and WhatsApp tools provided by Sokoni Hub for an order or booking made on the platform is allowed.</li>
          <li>Buyers must not ask a vendor to complete an order or booking outside the platform to avoid fees or platform rules.</li>
          <li>Sokoni Hub’s complaint process and listing history apply only to transactions made through the platform. We cannot help with a transaction arranged outside it.</li>
        </ul>
        <p>If we reasonably believe this section is being broken, we may warn you, hide or remove listings, suspend or close an account, and — once fees apply — charge the fees that would have been due. Normal customer follow-up, repeat custom and recommendations from a transaction made on Sokoni Hub are not a breach.</p>
      </section>

      <section>
        <h2>6. Orders, prices, payment and delivery</h2>
        <p>Check the vendor, items, currency, quantity, delivery arrangements and total before you order. Payment is agreed directly between buyer and vendor — for example cash on delivery, bank transfer or WhatsApp coordination, where the vendor offers it. Sokoni Hub does not currently hold, receive or process buyers’ payments, so we cannot refund or release money paid to a vendor.</p>
        <p>Delivery, collection and refunds are arranged and carried out by the vendor, not by Sokoni Hub. Vendors must state any delivery charge, delivery time and refund or return conditions clearly before the order is made. Inspect goods before you pay where possible. Never send card details, passwords or PINs in order notes or messages.</p>
        <p>If Sokoni Hub later offers payments through the platform, these Terms will be updated and you will be told before it applies (see section 15).</p>
      </section>

      <section>
        <h2>7. Service bookings and cancellations</h2>
        <p>A booking request normally needs the vendor’s confirmation; some vendors turn on automatic acceptance. Check the status shown in your booking — a pending request is not a confirmed appointment. Where the vendor offers it, you can choose the vendor’s premises or a home visit.</p>
        <p>Whether you can cancel online depends on the vendor’s notice period and the appointment time shown in the booking. If online cancellation is no longer available, contact the vendor or Support. Cancelling a booking does not itself refund any payment made to the vendor.</p>
      </section>

      <section>
        <h2>8. Complaints, returns and your rights</h2>
        <p>If something goes wrong, contact the vendor first. If you need help, file a report on the <Link to="/support">Support page</Link> or contact us at <Email /> with your order or booking reference. An administrator reviews every report, may ask both sides for information, and can resolve or dismiss the complaint, remove listings and suspend vendors.</p>
        <p>Sokoni Hub handles complaints; we do not guarantee a refund, replacement or delivery, because those are the vendor’s responsibility. Nothing in these Terms removes your mandatory rights under the laws of Qatar, including consumer protection law, or stops you from complaining to a competent authority or going to court.</p>
      </section>

      <section>
        <h2>9. Fees and paid placements</h2>
        <p>Sokoni Hub is currently free to use. We may introduce fees in future, for example an onboarding fee for service providers, charges for promoted placements such as featured or VIP stores, or fees for platform payments. We will describe any fee clearly before you are charged, give at least 30 days’ notice before a new or higher fee applies to existing vendors, and not charge for anything already completed. Paid placements are marked as such and follow the terms shown when you buy them.</p>
      </section>

      <section>
        <h2>10. Acceptable use</h2>
        <p>You must not: break the law; sell prohibited items; commit fraud or misrepresent who you are; harass, threaten or discriminate against others; post fake or paid reviews; copy or scrape the service in bulk; probe, disrupt or bypass security; spread malware; or use another person’s information without permission.</p>
      </section>

      <section>
        <h2>11. Content and intellectual property</h2>
        <p>You keep ownership of the photos, text and other content you upload, and you confirm you have the right to use it. You give Sokoni Hub a non-exclusive licence to host and display it as needed to run the service, including in store pages, search results and link previews. The Sokoni Hub name, logo, software and design belong to us or our licensors and may not be copied without written permission.</p>
      </section>

      <section>
        <h2>12. Suspension and ending your account</h2>
        <p>You can stop using Sokoni Hub at any time and may request <Link to="/delete-account">account deletion</Link>. We may restrict, suspend or close an account or remove content for security reasons, prohibited or unlawful activity or a breach of these Terms. Where reasonable we will tell you why and how to respond; contact <Email /> to question a decision. Closing an account does not cancel orders or bookings already agreed, or remove records we must keep (see the Privacy Policy).</p>
      </section>

      <section>
        <h2>13. Availability, disclaimers and liability</h2>
        <p>We work to keep Sokoni Hub available, but it may be interrupted by maintenance, technical faults or third-party services. Sokoni Hub is provided “as is” to the extent the law allows. We do not guarantee the accuracy of vendor listings, that vendors will perform, or that any transaction will succeed.</p>
        <p>To the extent permitted by Qatari law, Sokoni Hub is not liable for the acts or omissions of vendors or buyers, for losses from transactions made outside the platform, or for indirect or consequential loss. Nothing in these Terms excludes or limits liability that cannot lawfully be excluded, including for fraud or intentional wrongdoing, or any mandatory right you have as a consumer.</p>
      </section>

      <section>
        <h2>14. Privacy, cookies and your data</h2>
        <p>How we collect and use personal data is explained in the <Link to="/privacy">Privacy Policy</Link> and <Link to="/cookies">Cookie Policy</Link>.</p>
      </section>

      <section>
        <h2>15. Changes to these Terms</h2>
        <p>We may update these Terms as the service grows or the law changes. The current version and effective date are always shown on this page. For material changes we will give reasonable notice on the site or by email, and where the law requires your agreement we will ask for it. Continuing to use Sokoni Hub after a change takes effect means you accept it.</p>
      </section>

      <section>
        <h2>16. Governing law and disputes</h2>
        <p>These Terms are governed by the laws of the State of Qatar. We encourage you to contact us first so we can try to resolve any dispute informally. Subject to any mandatory rights you have, the competent courts of Doha, Qatar have jurisdiction over disputes arising from them.</p>
      </section>

      <section>
        <h2>17. Contact</h2>
        <p>Questions about these Terms: <Email /> or <WhatsApp />, {c.supportHours}.</p>
      </section>
    </HelpPage>
  );
}

export function Privacy() {
  return (
    <HelpPage title="Privacy Policy" subtitle="What personal data Sokoni Hub collects, why, who sees it, how long we keep it and the choices you have." draft>
      <Operator />

      <section>
        <h2>1. About this policy</h2>
        <p>This policy applies to {c.siteUrl.replace('https://', '')} and the Sokoni Hub services for buyers, vendors and visitors in Qatar. We handle personal data in line with Qatar’s personal data privacy law (Law No. 13 of 2016) and other applicable Qatari law. In this policy “we” means Sokoni Hub, the operator described above. You must be at least 18 to use Sokoni Hub, and we do not knowingly collect data from anyone under 18; if you think a child has given us data, contact <Email /> and we will delete it.</p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Account details:</strong> name, phone number, email address, role (buyer or vendor), password and PIN (stored only as secure hashes) and account status.</li>
          <li><strong>Vendor business records:</strong> store name, description, city and contact details, images, CR or business-registration documents, verification decisions and, where supplied, bank or payout details.</li>
          <li><strong>Marketplace activity:</strong> listings, orders, bookings, delivery or service address and notes you provide, cancellations, reviews, statements and related records.</li>
          <li><strong>Support and safety:</strong> complaints, messages, deletion requests, and security, rate-limit and audit records.</li>
          <li><strong>Location:</strong> the city you choose, or coordinates if you use a nearby-search feature and allow your browser to share them. Home-service addresses you enter are treated as booking details.</li>
          <li><strong>Technical data:</strong> IP address, browser and device type and access logs created by our hosting providers when you use the site.</li>
          {analyticsAvailable && (<li><strong>Usage data (only with your consent):</strong> pages visited and general device and browser information collected by Google Analytics. We do not use it for advertising.</li>)}
        </ul>
        <p>Vendor verification is for business registration, not personal identification. A CR can still contain a person’s name or contact details, so please do not upload anything else, such as a passport, national ID or driving licence.</p>
      </section>

      <section>
        <h2>3. Why we use your information</h2>
        <ul>
          <li><strong>To provide the service you asked for:</strong> create and secure accounts, show stores and listings, pass orders and bookings to vendors, send confirmations and status updates, and handle complaints and deletion requests.</li>
          <li><strong>To keep the marketplace safe and lawful:</strong> verify vendors, prevent fraud and misuse, enforce our Terms and meet legal, accounting and regulatory duties.</li>
          <li><strong>To improve Sokoni Hub:</strong>{analyticsAvailable ? ' understand how the site is used, if you accept analytics cookies, and fix problems.' : ' monitor reliability and fix problems.'}</li>
          <li><strong>With your consent</strong> where the law requires it, for example for optional analytics cookies or sharing your device location. You can withdraw consent at any time.</li>
        </ul>
        <p>We do not sell your personal data. We do not use it for advertising or for decisions that are made only by automated means.</p>
      </section>

      <section>
        <h2>4. Who we share information with</h2>
        <ul>
          <li><strong>Vendors:</strong> receive the name, contact details, address and order or booking information needed to fulfil your order or appointment.</li>
          <li><strong>Other visitors:</strong> can see public store pages, listings and published reviews.</li>
          <li><strong>Sokoni Hub administrators:</strong> access records for moderation, support, security and administration. Verification documents are kept in private storage and are not public.</li>
          <li><strong>Service providers</strong> who help us run Sokoni Hub, listed below. They may use your data only to provide their service to us.</li>
          <li><strong>Authorities and advisers:</strong> where the law requires it, to protect rights or safety, or to obtain professional advice.</li>
        </ul>
        <table className="legal-table">
          <thead><tr><th>Provider</th><th>What it does</th></tr></thead>
          <tbody>{c.providers.filter(([name]) => analyticsAvailable || !name.startsWith('Google')).map(([name, what]) => <tr key={name}><td>{name}</td><td>{what}</td></tr>)}</tbody>
        </table>
        <p>When you choose to contact a vendor or support on WhatsApp, WhatsApp’s own privacy practices apply to that conversation.</p>
      </section>

      <section>
        <h2>5. Where your data is processed</h2>
        <p>Our providers operate data centres and systems that may be outside Qatar, so your data can be transferred and processed in other countries. We do not claim that all data stays in Qatar. We choose reputable providers, share only what is needed, and rely on contractual and technical protections such as encryption in transit and access controls. Where Qatari law sets conditions for transfers outside Qatar, we apply them.</p>
      </section>

      <section>
        <h2>6. Cookies and similar technologies</h2>
        <p>We use browser storage for sign-in, your cart, language, city and theme choices{analyticsAvailable ? ', and, only with your permission, Google Analytics cookies' : ''}. See the <Link to="/cookies">Cookie Policy</Link> for the full list and how to control them.</p>
      </section>

      <section>
        <h2>7. How long we keep it</h2>
        <table className="legal-table">
          <thead><tr><th>Information</th><th>How long</th></tr></thead>
          <tbody>{c.retention.filter(([name]) => analyticsAvailable || !name.startsWith('Analytics')).map(([what, how]) => <tr key={what}><td>{what}</td><td>{how}</td></tr>)}</tbody>
        </table>
        <p>We keep data for a shorter or longer time if the law requires it, or if it is needed to deal with a dispute, complaint or security investigation. When the period ends we delete the data or remove what identifies you.</p>
        <p><strong>Account deletion.</strong> You can submit a <Link to="/delete-account">deletion request</Link> at any time. An administrator first checks open orders, bookings, complaints and financial matters. When it is completed, your profile details and credentials are removed from active use, sessions are revoked, a store linked to the account is closed and files you uploaded are removed. Records we must keep, such as transactions and dispute evidence, stay for the periods above. Other people’s records, and copies held by vendors or WhatsApp, are not deleted just because your account is closed.</p>
      </section>

      <section>
        <h2>8. Your rights</h2>
        <p>Under Qatari law you can ask us to confirm what personal data we hold about you and give you a copy, correct inaccurate data, delete data we no longer need to keep, stop or restrict certain uses, and withdraw consent you have given. You can also object to processing in the cases the law allows.</p>
        <p>Contact <Email /> or <WhatsApp />. We will acknowledge your request within {c.responseTime} and aim to complete it within 30 days. We may ask for proof that you are the account holder, but never for your password, PIN or one-time codes. If you are not satisfied, you can complain to the competent authority responsible for personal data protection in Qatar.</p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>We use access controls, hashed passwords and PINs, multi-factor authentication for administrators, revocable sessions, encrypted connections and private storage with short-lived access for verification documents. No system is completely secure, so please choose a strong password, keep your PIN private and never share codes. If a breach is likely to harm you, we will tell you and the competent authority as required by law.</p>
      </section>

      <section>
        <h2>10. Changes to this policy</h2>
        <p>When we change how we use personal data we will update this page and the effective date, and tell you about material changes on the site or by email.</p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>Privacy questions and requests: <Email /> or <WhatsApp />, {c.supportHours}.</p>
      </section>
    </HelpPage>
  );
}

const storageRows: [string, string, string][] = [
  ['sokoni_token', 'Keeps you signed in on this device.', 'Essential'],
  ['sokoni_cart', 'Remembers the items in your cart.', 'Essential'],
  ['sokoni_checkout_retry', 'Stops a retried checkout from creating a duplicate order.', 'Essential'],
  ['sokoni_admin_token', 'Keeps an administrator signed in (staff only).', 'Essential'],
  ['sokoni_city, sokoni_location', 'Remember the city or location you chose.', 'Functional'],
  ['sokoni_locale', 'Remembers your language choice.', 'Functional'],
  ['sokoni-theme, sokoni-sidebar-collapsed', 'Remember light or dark mode and dashboard layout.', 'Functional'],
  ['sokoni-consent', 'Remembers your cookie choice.', 'Essential'],
];

export function Cookies() {
  return (
    <HelpPage title="Cookie Policy" subtitle="What we store on your device, why, and how you can control it.">
      <section>
        <h2>1. What this covers</h2>
        <p>Cookies are small files saved by your browser. Websites can also use similar browser storage (localStorage and sessionStorage). This policy covers both when you use {c.siteUrl.replace('https://', '')}. It should be read with our <Link to="/privacy">Privacy Policy</Link>.</p>
        <Meta />
      </section>

      <section>
        <h2>2. Essential and functional storage</h2>
        <p>These items make the site work and remember your choices. They do not need consent and are not used for advertising.</p>
        <table className="legal-table">
          <thead><tr><th>Name</th><th>Purpose</th><th>Type</th></tr></thead>
          <tbody>{storageRows.map(([n, p, t]) => <tr key={n}><td><code>{n}</code></td><td>{p}</td><td>{t}</td></tr>)}</tbody>
        </table>
        <p>This storage stays on your device until you clear it or sign out where applicable. Blocking it may stop you from signing in or using your cart.</p>
      </section>

      <section>
        <h2>3. Analytics cookies</h2>
        {analyticsAvailable ? (
          <>
            <p>With your permission we use Google Analytics (a service of Google) to count visits and see which pages are useful, so we can improve Sokoni Hub. It sets these cookies:</p>
            <table className="legal-table">
              <thead><tr><th>Cookie</th><th>Purpose</th><th>Lasts up to</th></tr></thead>
              <tbody>
                <tr><td><code>_ga</code></td><td>Tells one visitor from another.</td><td>2 years</td></tr>
                <tr><td><code>_ga_*</code></td><td>Keeps session state.</td><td>2 years</td></tr>
              </tbody>
            </table>
            <p>Analytics load only after you choose “Accept analytics”. We shorten IP addresses, turn off advertising features and Google signals, keep analytics data for 14 months, and do not measure sign-in, account, vendor or admin pages. Google may process this data outside Qatar.</p>
          </>
        ) : (
          <p>We do not currently use analytics or advertising cookies. If we start, we will ask for your permission first and update this page.</p>
        )}
      </section>

      <section>
        <h2>4. Your choices</h2>
        <ul>
          {analyticsAvailable && (<li>Change your mind at any time with the <strong>Cookie settings</strong> link in the footer. Choosing “Essential only” stops analytics and removes the Google cookies.</li>)}
          <li>Your browser lets you block or delete cookies and site data. Blocking essential storage can stop sign-in and cart from working.</li>
          {analyticsAvailable && (<li>You can also install Google’s <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">browser add-on</a> to opt out of Google Analytics.</li>)}
        </ul>
      </section>

      <section>
        <h2>5. Links to other services</h2>
        <p>When you open WhatsApp or another external service, that service may use its own cookies and storage under its own policy.</p>
      </section>

      <section>
        <h2>6. Changes and contact</h2>
        <p>We will update this page, with a new effective date, if we change how we use cookies. Questions: <Email /> or <WhatsApp />.</p>
      </section>
    </HelpPage>
  );
}

const faqs: [string, ReactNode][] = [
  ['How do I contact Sokoni Hub?', <>Email <Email /> or message us on <WhatsApp />. We are available {c.supportHours} and aim to reply within {c.responseTime}. You can also file a report on the <Link to="/support">Support page</Link>. Never share your password, PIN, MFA code or recovery codes with anyone.</>],
  ['Is Sokoni Hub free?', 'Yes, it is free to use at the moment. If fees are introduced later, such as for service providers or promoted placements, they will be explained clearly and notified in advance. See the Terms.'],
  ['Who can use Sokoni Hub?', 'Anyone aged 18 or over. Services and vendors are in Qatar. You can browse without an account, but you need a buyer account to order, book, review and track.'],
  ['Who delivers my order and who handles refunds?', 'The vendor. Sokoni Hub does not deliver goods or hold payments, so delivery, returns and refunds are agreed with the vendor. If you cannot resolve a problem, file a complaint and an administrator will review it.'],
  ['Does Sokoni Hub hold my payment?', 'No. You pay the vendor directly, for example by cash on delivery, bank transfer or WhatsApp arrangement, whichever the vendor offers. Inspect goods before paying where you can.'],
  ['What does the verified badge mean?', 'An administrator has reviewed the business information the vendor submitted, including a CR or business-registration licence. It is not a government endorsement or a guarantee of quality, licensing for every activity, or a successful transaction.'],
  ['What must a vendor upload for verification?', 'A clear image of the commercial registration (CR) or business-registration licence. Do not upload a personal national ID, passport or driving licence. The uploader accepts image files, not PDFs.'],
  ['Why should orders stay on Sokoni Hub?', 'Orders and bookings made through the platform have a record, a reference code, reviews and access to our complaint process. We cannot help with a deal arranged outside it, and vendors who use Sokoni Hub only to move customers elsewhere may lose their listings or accounts.'],
  ['Is a service booking confirmed immediately?', 'Usually the vendor must confirm it; some vendors turn on automatic acceptance. Check the status in your booking — pending does not mean confirmed.'],
  ['Can I choose a home visit?', 'Where the vendor offers it, pick home service or the vendor’s premises when booking. Give only the location details the appointment needs.'],
  ['Can I cancel an appointment?', 'The vendor’s notice period decides whether you can cancel online. If the option is gone, contact the vendor or Support. Cancelling does not itself refund a payment.'],
  ['How do I report a problem?', <>Contact the vendor first, then use the <Link to="/support">Support page</Link> with your order or booking reference. You receive a reference code to track the outcome. Your rights under Qatari consumer law remain.</>],
  ['How do I delete my account?', <>Go to <Link to="/delete-account">Account deletion</Link>, sign in, confirm your password and submit a request. Save the private receipt. An administrator reviews it and any outstanding matters, and you can withdraw while it is pending or in review.</>],
  ['Does deletion remove everything straight away?', 'No. Your profile and uploaded files are removed from active use, but records we must keep, such as transactions and dispute evidence, stay for the periods in the Privacy Policy. Backups and copies held by vendors or WhatsApp are not deleted immediately.'],
  ['What data do you collect and who sees it?', <>Account, order and booking details. Vendors see what they need to fulfil your order; administrators see records for support and safety. We do not sell your data. Details are in the <Link to="/privacy">Privacy Policy</Link>.</>],
  ['Do you use cookies?', <>We use essential storage for sign-in, cart and preferences{analyticsAvailable ? ', and analytics cookies only if you accept them' : ''}. See the <Link to="/cookies">Cookie Policy</Link>.</>],
  ['Will I receive email updates?', 'If you give a valid email address, we send account verification, order and booking confirmations, status updates and recovery codes. We do not send advertising.'],
];

export function FAQ() {
  return (
    <HelpPage title="Frequently asked questions" subtitle="Quick answers about buying, selling, verification, payments and your account.">
      <div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      <section>
        <h2>Still need help?</h2>
        <p><Link className="btn btn-primary" to="/support">Open Contact &amp; Support</Link></p>
        <p>Or email <Email /> / <WhatsApp /> — {c.supportHours}. Read the <Link to="/terms">Terms</Link>, <Link to="/privacy">Privacy Policy</Link>, <Link to="/cookies">Cookie Policy</Link> and <Link to="/policy">marketplace rules</Link> for more detail.</p>
      </section>
    </HelpPage>
  );
}
