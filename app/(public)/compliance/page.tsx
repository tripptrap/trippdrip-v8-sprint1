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
          <p className="text-slate-700 dark:text-slate-300">
            HyveWyre™ is committed to maintaining the highest standards of compliance with U.S. telecommunications
            regulations. We help our customers navigate complex compliance requirements while providing powerful
            marketing tools.
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
            <li><strong>Time Restrictions:</strong> Send messages only between 8 AM - 9 PM recipient's local time</li>
            <li><strong>Record Keeping:</strong> Maintain consent records for at least 4 years</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">CTIA Messaging Principles</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            We adhere to CTIA (Cellular Telecommunications Industry Association) best practices:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Transparent communication about message frequency and costs</li>
            <li>Immediate processing of STOP requests (within 10 business days)</li>
            <li>Support for HELP keyword to provide customer service information</li>
            <li>Age-gating for age-restricted content or services</li>
            <li>No sharing of mobile numbers without explicit consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Do Not Call Registry</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            HyveWyre™ helps you respect the National Do Not Call Registry:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Built-in DNC scrubbing capabilities (coming soon)</li>
            <li>Existing business relationship (EBR) exemptions tracking</li>
            <li>Documented consent overrides DNC restrictions</li>
            <li>Regular DNC list updates and maintenance</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Carrier Guidelines</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            We follow guidelines from major U.S. carriers (AT&T, Verizon, T-Mobile) to ensure deliverability:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li>Proper 10DLC registration for business messaging</li>
            <li>Brand and campaign registration with The Campaign Registry (TCR)</li>
            <li>Spam score monitoring and reputation management</li>
            <li>Message content filtering for prohibited content</li>
            <li>Rate limiting to prevent spam flags</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Data Protection</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            We implement industry-standard data protection measures:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
            <li><strong>Encryption:</strong> TLS 1.3 for data in transit, AES-256 for data at rest</li>
            <li><strong>Access Controls:</strong> Role-based permissions and multi-factor authentication</li>
            <li><strong>Data Minimization:</strong> Collect only necessary information</li>
            <li><strong>Regular Audits:</strong> Third-party security assessments and penetration testing</li>
            <li><strong>Incident Response:</strong> 24/7 monitoring and rapid breach notification</li>
          </ul>
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
            <li><strong>Consent Tracking:</strong> Tag leads with consent status and date</li>
            <li><strong>Auto Opt-Out:</strong> Automatic handling of STOP, UNSUBSCRIBE, CANCEL keywords</li>
            <li><strong>Time Zone Detection:</strong> Respect local time restrictions automatically</li>
            <li><strong>Message Templates:</strong> Pre-approved compliant message templates</li>
            <li><strong>Audit Logs:</strong> Complete message history for regulatory audits</li>
            <li><strong>Compliance Alerts:</strong> Real-time warnings for potential violations</li>
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
            <li>HyveWyre™ Compliance Center: Coming soon in your dashboard</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Compliance Support</h2>
          <p className="text-slate-700 dark:text-slate-300">
            Need help with compliance questions? Our team is here to assist:
          </p>
          <div className="mt-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300">Email: compliance@hyvewyre.com</p>
            <p className="text-slate-700 dark:text-slate-300">Response time: Within 24 hours</p>
          </div>
        </section>
      </div>
    </div>
  );
}
