import { Link } from 'react-router-dom';
import { useAnalyticsConsent } from '../analytics';
import { HelpPage } from './Legal';

export default function CookieSettings() {
  const { configured, consent, openSettings } = useAnalyticsConsent();
  const current = consent === 'accepted' ? 'accepted' : consent === 'rejected' ? 'rejected' : 'not yet chosen';

  return (
    <HelpPage title="Cookie settings" subtitle="Choose whether optional analytics may measure use of Sokoni Hub’s public marketplace pages.">
      <section>
        <h2>Essential website storage</h2>
        <p>Sokoni Hub uses essential browser storage for functions such as sign-in, cart contents, language, theme, and location preferences. These features are needed for the service to work and are not controlled by the optional analytics choice below.</p>
      </section>

      {configured ? (
        <>
          <section>
            <h2>Optional analytics</h2>
            <p>If you accept, Sokoni Hub loads its Google Tag Manager container only after your choice. The container is used to send a limited public-page measurement event to the Google Analytics 4 property configured inside it.</p>
            <p>We do not load the container before consent. Sign-in, account, vendor, and administrator routes are excluded from the site’s analytics page-view events.</p>
            <p><strong>Your current choice:</strong> {current}.</p>
            <button type="button" className="btn btn-primary" onClick={openSettings}>Change analytics choice</button>
          </section>
          <section>
            <h2>Withdrawing your choice</h2>
            <p>Select “Reject analytics” in the settings panel. This stops future Sokoni Hub analytics page-view events and clears standard first-party Google Analytics cookies where the browser permits it. It cannot remove information already received by an analytics provider; see Google’s controls and privacy information for that service.</p>
          </section>
        </>
      ) : (
        <section>
          <h2>Optional analytics</h2>
          <p>Sokoni Hub does not currently load optional Google Analytics or Google Tag Manager measurement on this site. If that changes, this page and the Privacy Policy will be updated before analytics is enabled.</p>
        </section>
      )}

      <section>
        <h2>More information</h2>
        <p>Read the <Link to="/privacy">Privacy Policy</Link> for more about account, order, booking, and browser information. You can also contact <Link to="/support">Support</Link> with a privacy concern.</p>
      </section>
    </HelpPage>
  );
}
