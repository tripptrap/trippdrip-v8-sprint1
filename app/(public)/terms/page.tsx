"use client";

export default function TermsOfServicePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-white/60">Last updated: November 5, 2025</p>
      </div>

      <div className="card space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
          <p className="text-white/80">
            By accessing and using HyveWyre™ ("the Service"), you agree to be bound by these Terms of Service
            and all applicable laws and regulations. If you do not agree with any of these terms, you are
            prohibited from using this Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Service Description</h2>
          <p className="text-white/80 mb-3">
            HyveWyre™ provides SMS messaging, campaign management, and lead tracking services. Our platform includes:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Mass texting and personalized messaging</li>
            <li>AI-powered response generation</li>
            <li>Lead management and scoring</li>
            <li>Campaign analytics and reporting</li>
            <li>Conversation tracking and history</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Account Registration</h2>
          <p className="text-white/80 mb-3">To use HyveWyre™, you must:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Be at least 18 years of age</li>
            <li>Provide accurate and complete registration information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
            <li>Accept responsibility for all activities under your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Acceptable Use Policy</h2>
          <p className="text-white/80 mb-3">You agree NOT to use HyveWyre™ to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Send spam, unsolicited messages, or violate TCPA/CAN-SPAM regulations</li>
            <li>Transmit illegal, harmful, or offensive content</li>
            <li>Harass, threaten, or abuse recipients</li>
            <li>Impersonate others or misrepresent your identity</li>
            <li>Collect personal information without consent</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Send messages to numbers on the National Do Not Call Registry without proper consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Compliance Requirements</h2>
          <p className="text-white/80 mb-3">You are responsible for:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Obtaining proper consent before sending messages (TCPA compliance)</li>
            <li>Including opt-out mechanisms in all marketing messages</li>
            <li>Honoring opt-out requests within 10 business days</li>
            <li>Maintaining records of consent for regulatory purposes</li>
            <li>Complying with all applicable telecommunications laws and regulations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Pricing and Payment</h2>
          <p className="text-white/80 mb-3">
            <strong>Subscription Plans:</strong>
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Basic Plan: $30/month (includes 1,000 monthly points)</li>
            <li>Premium Plan: $98.99/month (includes 15,000 monthly points)</li>
            <li>Points never expire and roll over month-to-month</li>
            <li>Additional points can be purchased as needed</li>
          </ul>
          <p className="text-white/80 mt-3">
            Payments are processed securely through Stripe. You authorize us to charge your payment method
            for subscription fees and point purchases. Subscriptions auto-renew unless canceled.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Point System</h2>
          <p className="text-white/80 mb-3">Points are used for:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>SMS messages: 1 point per SMS segment (160 characters)</li>
            <li>AI-generated responses: 2 points per response</li>
            <li>Email messages: 0.5 points per email</li>
            <li>AI chat messages: 1 point per message</li>
            <li>Flow generation: 5 points per flow</li>
          </ul>
          <p className="text-white/80 mt-3">
            Points are non-refundable but never expire. Unused points roll over indefinitely.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Cancellation and Termination</h2>
          <p className="text-white/80 mb-3">
            <strong>Your Rights:</strong> You may cancel your subscription at any time through your account
            settings. Cancellation takes effect at the end of the current billing period. You retain access
            to unused points after cancellation.
          </p>
          <p className="text-white/80 mb-3">
            <strong>Our Rights:</strong> We reserve the right to suspend or terminate accounts that violate
            these Terms, engage in fraudulent activity, or pose a risk to our platform or users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. Service Availability</h2>
          <p className="text-white/80">
            While we strive for 99.9% uptime, we do not guarantee uninterrupted access to the Service.
            We may perform maintenance, updates, or emergency repairs that temporarily affect availability.
            We are not liable for service interruptions beyond our control.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Intellectual Property</h2>
          <p className="text-white/80">
            All content, features, and functionality of HyveWyre™ are owned by us and protected by
            intellectual property laws. You retain ownership of your data and content, granting us
            a license to process it for service delivery.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">11. Limitation of Liability</h2>
          <p className="text-white/80">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLUXENI SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, DATA LOSS,
            OR BUSINESS INTERRUPTION. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID IN THE
            PAST 12 MONTHS.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">12. Indemnification</h2>
          <p className="text-white/80">
            You agree to indemnify and hold harmless HyveWyre™ from any claims, damages, or expenses
            arising from your use of the Service, violation of these Terms, or infringement of third-party
            rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">13. Dispute Resolution</h2>
          <p className="text-white/80">
            Any disputes arising from these Terms shall be resolved through binding arbitration in
            accordance with the rules of the American Arbitration Association. You waive the right
            to participate in class actions.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">14. Changes to Terms</h2>
          <p className="text-white/80">
            We may modify these Terms at any time. Material changes will be communicated via email
            or platform notification. Continued use after changes constitutes acceptance of the
            updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">15. Contact Information</h2>
          <p className="text-white/80">
            For questions about these Terms, contact us at:
          </p>
          <div className="mt-3 p-4 bg-white/5 rounded-lg">
            <p className="text-white/80">Email: legal@hyvewyre.com</p>
            <p className="text-white/80">Address: [Your Company Address]</p>
          </div>
        </section>
      </div>
    </div>
  );
}
