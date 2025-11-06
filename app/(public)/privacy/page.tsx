"use client";

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-white/60">Last updated: November 5, 2025</p>
      </div>

      <div className="card space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
          <p className="text-white/80 mb-3">
            HyveWyre™ collects and processes the following types of information:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li><strong>Account Information:</strong> Name, email address, phone number, and payment information</li>
            <li><strong>Lead Data:</strong> Contact information, conversation history, tags, and dispositions</li>
            <li><strong>Usage Data:</strong> Campaign performance, message analytics, and feature usage</li>
            <li><strong>Technical Data:</strong> IP address, browser type, device information, and cookies</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
          <p className="text-white/80 mb-3">We use your information to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Provide and maintain our SMS messaging and campaign management services</li>
            <li>Process payments and manage your subscription</li>
            <li>Send transactional emails and service notifications</li>
            <li>Improve our platform and develop new features</li>
            <li>Ensure compliance with telecommunications regulations</li>
            <li>Prevent fraud and ensure platform security</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Data Sharing and Disclosure</h2>
          <p className="text-white/80 mb-3">
            We do not sell your personal information. We may share your data with:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li><strong>Service Providers:</strong> Twilio (SMS delivery), Stripe (payments), OpenAI (AI features)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our legal rights</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Data Security</h2>
          <p className="text-white/80">
            We implement industry-standard security measures to protect your data, including encryption
            in transit and at rest, secure authentication, and regular security audits. However, no method
            of transmission over the internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
          <p className="text-white/80">
            We retain your personal data for as long as your account is active or as needed to provide
            services. Lead data and message history are retained until you delete them or close your account.
            We may retain certain information for legal compliance purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Your Rights</h2>
          <p className="text-white/80 mb-3">You have the right to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Access your personal data</li>
            <li>Correct inaccurate or incomplete data</li>
            <li>Request deletion of your data</li>
            <li>Export your data in a portable format</li>
            <li>Opt-out of marketing communications</li>
            <li>Object to processing of your data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Cookies and Tracking</h2>
          <p className="text-white/80">
            We use essential cookies for authentication and platform functionality. We do not use third-party
            advertising or tracking cookies. You can control cookie preferences through your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
          <p className="text-white/80">
            HyveWyre™ is not intended for users under 18 years of age. We do not knowingly collect personal
            information from children. If you believe we have collected information from a child, please
            contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. International Data Transfers</h2>
          <p className="text-white/80">
            Your data may be transferred to and processed in countries other than your country of residence.
            We ensure appropriate safeguards are in place to protect your data in accordance with applicable
            data protection laws.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Changes to This Policy</h2>
          <p className="text-white/80">
            We may update this Privacy Policy from time to time. We will notify you of significant changes
            via email or through the platform. Your continued use of HyveWyre™ after changes constitutes
            acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">11. Contact Us</h2>
          <p className="text-white/80">
            If you have questions about this Privacy Policy or wish to exercise your rights, contact us at:
          </p>
          <div className="mt-3 p-4 bg-white/5 rounded-lg">
            <p className="text-white/80">Email: privacy@hyvewyre.com</p>
            <p className="text-white/80">Address: [Your Company Address]</p>
          </div>
        </section>
      </div>
    </div>
  );
}
