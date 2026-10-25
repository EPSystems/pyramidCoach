import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalSection, LegalShell } from '@/components/app/legal/legal-shell';

export const metadata: Metadata = { title: 'Privacy policy', description: 'What Pyramid Coach stores, why, who processes it and how to delete it.' };

export default function PrivacyPage() {
  return (
    <LegalShell kicker="Legal" title="Privacy policy">
      <p className="text-muted-foreground">
        Pyramid Coach is a training and nutrition coaching app. This policy explains what personal data it stores, why, who helps run it, and the control you
        have over it. It is run by <strong className="text-foreground">the Pyramid Coach operator</strong> (&ldquo;we&rdquo;).
      </p>

      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your email address and a securely hashed password. If you use Continue with Google, Google shares your name, email address
            and profile picture (the <code>openid email profile</code> scopes) and nothing else.
          </li>
          <li>
            <strong>Profile:</strong> display name, sex, birth year, height, bodyweight, optional body-fat percentage, units and timezone.
          </li>
          <li>
            <strong>Training setup:</strong> goal, training experience, available days and session length, equipment, lifestyle, muscles to prioritise,
            exercises you dislike, sports you play (days, intensity, duration) and any custom exercises or sports you add.
          </li>
          <li>
            <strong>Health-related information you choose to enter:</strong> injuries and aches (affected area, severity, status, rehab notes), daily check-ins
            (sleep, energy, stress, soreness, bodyweight, notes) and weekly recovery reviews.
          </li>
          <li>
            <strong>Training and nutrition records:</strong> your generated plan, logged sets (load, reps, effort), sport sessions, calorie and macro targets,
            and the adjustments the app proposes.
          </li>
          <li>
            <strong>Technical data:</strong> sign-up and last-active dates, and the standard request logs (such as IP address and browser type) that our hosting
            providers keep to operate and secure the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>To create and secure your account and sign you in.</li>
          <li>To build, run and adapt your training plan and nutrition targets — the core of the service.</li>
          <li>To send account emails: sign-up confirmation and password reset. We do not send marketing email.</li>
          <li>To keep the service working, prevent abuse and fix problems.</li>
        </ul>
        <p>
          There is no analytics or tracking and no advertising, and your data is not sent to any AI service: your plan is calculated by the app&apos;s own
          rules. We never sell or rent your data.
        </p>
      </LegalSection>

      <LegalSection title="Legal bases">
        <ul>
          <li>
            <strong>Contract:</strong> processing your account, profile, training and nutrition data is necessary to provide the service you sign up for.
          </li>
          <li>
            <strong>Explicit consent:</strong> for health-related information (injuries, soreness, sleep, stress, bodyweight, body fat). Entering it is
            optional, and you can withdraw consent at any time by editing or deleting those entries or your account.
          </li>
          <li>
            <strong>Legitimate interest:</strong> keeping the service secure and reliable, including request logs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who processes it">
        <p>A small number of providers process data on our behalf, only to run the service:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database and authentication. Stores all the data listed above.
          </li>
          <li>
            <strong>Vercel</strong> — hosting. Serves the app and keeps short-lived request logs.
          </li>
          <li>
            <strong>Resend</strong> — transactional email. Receives your email address and the content of account emails.
          </li>
          <li>
            <strong>Google</strong> — optional sign-in. Only involved if you choose Continue with Google.
          </li>
        </ul>
        <p>
          These providers may process data outside your country. Where they do, they rely on recognised safeguards such as the EU Standard Contractual Clauses.
        </p>
      </LegalSection>

      <LegalSection title="Who can see your data">
        <p>
          Each account can read only its own records; the database itself enforces this. The operator can see a list of accounts (email, name, sign-up and
          last-active dates) to administer the service, but not your training or health data.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          We keep your data for as long as you have an account. You can delete it yourself at any time in{' '}
          <strong>Settings → Your data → Delete my account</strong>: this permanently and immediately deletes your account and every record linked to it. The
          operator can also remove an account, with the same effect. Copies in our providers&apos; routine backups expire on their normal cycle.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Depending on where you live (for example under the GDPR), you have the right to:</p>
        <ul>
          <li>
            <strong>Access and export</strong> your data — Settings → Your data → Export everything (JSON), or your logged sets as CSV.
          </li>
          <li>
            <strong>Correct</strong> it — edit your profile, settings and entries in the app.
          </li>
          <li>
            <strong>Delete</strong> it — remove individual entries or your whole account.
          </li>
          <li>
            <strong>Object to or restrict</strong> processing, and <strong>withdraw consent</strong> for health-related information.
          </li>
          <li>
            <strong>Complain</strong> to your local data protection supervisory authority.
          </li>
        </ul>
        <p>
          For anything you cannot do in the app, contact us <ContactLine />.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We use only essential cookies: the authentication session cookies that keep you signed in. Your theme choice (light or dark) is saved in your
          browser&apos;s local storage and never leaves your device. There are no analytics, advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          All traffic is encrypted over HTTPS, passwords are hashed by our authentication provider and never stored in plain text, and database access rules
          restrict every record to its owner. No system is perfectly secure, so please use a strong, unique password.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Pyramid Coach is not intended for anyone under 16, and we do not knowingly collect their data. If you believe a child has created an account, contact
          us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy as the app changes. The date at the top shows the latest version; for significant changes we will let you know in the app.
          See also the <Link href="/terms">Terms of use</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions or requests about your data: contact the Pyramid Coach operator <ContactLine />.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
