"use client";

export default function CompliancePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Compliance Practices</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Ensuring regulatory compliance for SMS marketing</p>
      </div>

      <div className="card space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            HyveWyre™ builds compliance controls into the platform rather than leaving them to the sender.
            This page describes what the platform actually enforces today, and what remains the
            responsibility of the business using it.
          </p>
          <p className="text-slate-700 dark:text-slate-300">
            Where a control is not implemented, it is not listed here. Nothing on this page is a
            certification, and none of it is legal advice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">TCPA Compliance</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            The Telephone Consumer Protection Act (TCPA) regulates telemarketing calls and text messages.
            HyveWyre™ helps you stay compliant through:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li><strong>Prior Express Written Consent:</strong> Obtain explicit written consent before sending
            marketing messages</li>
            <li><strong>Clear Opt-In Language:</strong> Use clear, conspicuous consent language that discloses
            the nature of messages</li>
            <li><strong>Opt-Out Mechanisms:</strong> Include "Reply STOP to unsubscribe" in all marketing messages</li>
            <li><strong>Time Restrictions:</strong> The platform blocks sending outside the permitted
            window, calculated in the <em>recipient&apos;s</em> local time rather than the sender&apos;s.
            The default window is 8:00 AM – 8:00 PM, an hour tighter than the TCPA limit, and is
            configurable per account. Where a recipient&apos;s state spans multiple time zones, a
            message is held if it is quiet hours in <em>any</em> of them</li>
            <li><strong>Record Keeping:</strong> HyveWyre records how and when consent was established
            for each contact, and retains that record for the life of the account. Deciding how long
            your own records must be kept, and preserving them if you leave, is your responsibility</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">CTIA Messaging Principles</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            We adhere to CTIA (Cellular Telecommunications Industry Association) best practices:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Transparent communication about message frequency and costs</li>
            <li>Immediate processing of STOP requests — applied on receipt, permanently, before any queued message can be delivered</li>
            <li>Support for HELP keyword to provide customer service information</li>
            <li>No age-restricted content — HyveWyre is not used for age-gated programs</li>
            <li>No sharing of mobile numbers without explicit consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Do-Not-Contact Suppression</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            HyveWyre maintains its own suppression list, which is separate from the National Do Not
            Call Registry and is enforced by the platform on every message:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Anyone who replies STOP — or any of a broad set of equivalent phrases — is suppressed
            immediately and permanently</li>
            <li>The list is checked before every outbound message, on every sending path, and the
            check fails closed: if it cannot be read, the message is not sent</li>
            <li>Suppression cannot be removed, overridden or worked around by a business using the
            platform. Only the recipient can reverse it, by replying START</li>
            <li>HyveWyre does not scrub against the National Do Not Call Registry. Checking that
            registry, and relying on any exemption to it, remains the responsibility of the business
            sending the messages</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Carrier Guidelines</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            We follow guidelines from major U.S. carriers (AT&T, Verizon, T-Mobile) to ensure deliverability:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Brand and campaign registration with The Campaign Registry (TCR) is <strong>required
            before an account can obtain a number</strong> — every number-acquisition path is gated on
            it, because an unregistered number cannot legitimately carry business traffic</li>
            <li>Every outbound message is scored for spam characteristics before it is sent, and the
            score is shown to the sender in the composer</li>
            <li>Per-number volume limits, with a daily ceiling and shorter-interval caps, so a single
            number cannot be driven into a pattern carriers filter on</li>
            <li>Numbers with a poor opt-out or delivery record are automatically throttled, and can be
            rested from sending entirely</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Data Protection</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            What is actually in place today:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li><strong>Encryption in transit:</strong> TLS 1.3, enforced by our hosting provider
            (Vercel) on every connection</li>
            <li><strong>Encryption at rest:</strong> AES-256, provided by our database platform
            (Supabase, on AWS). Sensitive stored credentials are separately encrypted by HyveWyre
            before they reach the database</li>
            <li><strong>Tenant isolation:</strong> Every table carries row-level security tied to the
            account that owns the row, so one customer&apos;s data is not reachable from another
            customer&apos;s session</li>
            <li><strong>Data minimization:</strong> We collect only what the product needs to operate</li>
            <li><strong>Incident response:</strong> Automated alerting on failures and abuse signals,
            and breach notification as required by law</li>
          </ul>
          <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="text-slate-700 dark:text-slate-300 font-semibold mb-2">
              What we do not yet have
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-2">
              We would rather say this plainly than imply otherwise:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 ml-2">
              <li>No multi-factor authentication. Sign-in is email and password today; MFA is planned</li>
              <li>No role-based access or team accounts — an account is a single owner</li>
              <li>No third-party penetration test or security audit has been performed</li>
              <li>No 24/7 staffed monitoring, and no SOC 2, ISO 27001 or HIPAA certification</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">User Responsibilities</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            As a HyveWyre™ user, you are responsible for:
          </p>
          <div className="bg-emerald-400/10 border border-emerald-400/30 rounded-lg p-4 space-y-2">
            <p className="text-slate-700 dark:text-slate-300">✓ Obtaining proper consent before messaging contacts</p>
            <p className="text-slate-700 dark:text-slate-300">✓ Maintaining accurate consent records</p>
            <p className="text-slate-700 dark:text-slate-300">✓ Honoring opt-out requests immediately</p>
            <p className="text-slate-700 dark:text-slate-300">✓ Ensuring message content complies with regulations</p>
            <p className="text-slate-700 dark:text-slate-300">✓ Monitoring your campaigns for compliance issues</p>
            <p className="text-slate-700 dark:text-slate-300">✓ Staying informed about regulation changes</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Compliance Tools</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            HyveWyre™ provides built-in compliance features:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li><strong>Consent Tracking:</strong> Every contact records how consent was established
            — opt-in form, agent attestation, or an inbound message from the contact — and when.
            A contact with no consent record is marked as such rather than assumed to be consenting</li>
            <li><strong>Auto Opt-Out:</strong> STOP, UNSUBSCRIBE, CANCEL and a broad set of equivalent
            phrases are handled automatically, without the sender needing to act</li>
            <li><strong>HELP Handling:</strong> HELP and INFO always receive a reply identifying the
            sender, as carriers require</li>
            <li><strong>Time Zone Detection:</strong> The recipient&apos;s local time is derived from
            their location and applied to the sending window automatically</li>
            <li><strong>Opt-Out Footer:</strong> Bulk and scheduled sends automatically append opt-out
            instructions to the first message to a new contact. On individual sends the sender is
            responsible for including them</li>
            <li><strong>Message Templates:</strong> Starting templates written to follow the rules on
            this page. They are a starting point, not a legal review — you remain responsible for
            what you send</li>
            <li><strong>Audit Logs:</strong> Complete message and consent history, exportable</li>
            <li><strong>Spam Scoring:</strong> Messages are scored before sending and the score is
            shown in the composer, so problems are visible before a message goes out</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Prohibited Content</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            The following content types are strictly prohibited:
          </p>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-2">
            <p className="text-slate-700 dark:text-slate-300">✗ Illegal products or services</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Adult content or sexual services</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Gambling or online betting</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Cannabis or controlled substances</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Firearms or weapons</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Hate speech or harassment</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Phishing or fraudulent schemes</p>
            <p className="text-slate-700 dark:text-slate-300">✗ Debt consolidation or payday loans</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Enforcement and Violations</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            Violations of compliance policies may result in:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Warning notifications and compliance guidance</li>
            <li>Temporary account suspension</li>
            <li>Permanent account termination for severe violations</li>
            <li>Reporting to relevant authorities if required by law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Best Practices Checklist</h2>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 space-y-2">
            <p className="text-slate-700 dark:text-slate-300 font-semibold mb-2">Before sending messages:</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Verify you have documented consent from recipients</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Include clear opt-out instructions in your message</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Check that message timing complies with TCPA hours</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Review content for prohibited material</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Test messages for proper formatting and delivery</p>
            <p className="text-slate-700 dark:text-slate-300">☑ Monitor responses and handle opt-outs promptly</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Resources and Training</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            Stay informed about compliance through:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>FCC TCPA guidelines: <a href="https://www.fcc.gov/TCPA" className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">fcc.gov/TCPA</a></li>
            <li>CTIA Messaging Principles: <a href="https://www.ctia.org" className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">ctia.org</a></li>
            <li>National Do Not Call Registry: <a href="https://www.donotcall.gov" className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">donotcall.gov</a></li>
            <li>The Campaign Registry (10DLC): <a href="https://www.campaignregistry.com" className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">campaignregistry.com</a></li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Compliance Support</h2>
          <p className="text-slate-700 dark:text-slate-300">
            Need help with compliance questions? Our team is here to assist:
          </p>
          <div className="mt-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300">Email: compliance@hyvewyre.com</p>
            <p className="text-slate-700 dark:text-slate-300 mt-1 text-sm text-slate-500 dark:text-slate-400">
              We aim to respond within one business day. Opt-out requests do not depend on us
              replying — replying STOP takes effect immediately and automatically.
            </p>
          </div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Last reviewed against the running platform: 3 August 2026.
          </p>
        </section>
      </div>
    </div>
  );
}
