"use client";

export default function RefundPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-white/60">Last updated: November 5, 2025</p>
      </div>

      <div className="card space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">No Refunds Policy</h2>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-white font-semibold mb-2">
              All sales are final. HyveWyre™ does not offer refunds for any purchases, subscriptions, or services.
            </p>
          </div>
          <p className="text-white/80">
            By purchasing any subscription plan, point package, or service from HyveWyre™, you acknowledge
            and agree that all payments are non-refundable under any circumstances.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">What This Means</h2>
          <p className="text-white/80 mb-3">
            The following items are NOT eligible for refunds:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4">
            <li>Monthly subscription fees (Basic or Premium plans)</li>
            <li>Point purchases of any amount</li>
            <li>Subscription renewals</li>
            <li>Unused points or subscription time</li>
            <li>Phone number purchases or rental fees</li>
            <li>Messages sent (successful or failed)</li>
            <li>AI feature usage</li>
            <li>Any other services or features</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Cancellation Policy</h2>
          <p className="text-white/80">
            While we do not offer refunds, you may cancel your subscription at any time. Upon cancellation:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 ml-4 mt-3">
            <li>You will retain access to your subscription features until the end of your current billing period</li>
            <li>No further charges will be made after the current period ends</li>
            <li>Your unused point balance will remain available on your account</li>
            <li>You can reactivate your subscription at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Technical Issues</h2>
          <p className="text-white/80">
            If you experience technical issues with our platform, please contact our support team. While
            we cannot offer refunds, we will work diligently to resolve any technical problems and may
            provide service credits at our sole discretion in cases of extended service outages.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Chargebacks</h2>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
            <p className="text-white/80 mb-2">
              <strong>Important:</strong> Initiating a chargeback or payment dispute will result in immediate
              account suspension and termination of service.
            </p>
            <p className="text-white/80">
              By using HyveWyre™, you agree that all charges are legitimate and that you will not dispute
              charges with your payment provider. If you have billing questions or concerns, please contact
              our support team directly.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Disputes and Questions</h2>
          <p className="text-white/80">
            If you have questions about billing or believe you were charged in error, please contact us
            immediately:
          </p>
          <div className="mt-3 p-4 bg-white/5 rounded-lg">
            <p className="text-white/80">Email: billing@hyvewyre.com</p>
            <p className="text-white/80">Support: support@hyvewyre.com</p>
            <p className="text-white/80">Response time: Within 24 hours</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Acknowledgment</h2>
          <p className="text-white/80">
            By using HyveWyre™'s services and making any purchase, you acknowledge that you have read,
            understood, and agree to this No Refunds Policy. This policy is part of our Terms of Service
            and is binding on all users.
          </p>
        </section>
      </div>
    </div>
  );
}
