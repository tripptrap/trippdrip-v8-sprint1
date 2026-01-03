"use client";

export default function RefundPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Last updated: November 5, 2025</p>
      </div>

      <div className="card space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-3">No Refunds Policy</h2>
          <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-l-4 border-red-500 rounded-lg p-5 mb-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-red-800 dark:text-red-300 font-semibold text-lg mb-1">
                  All Sales Are Final
                </p>
                <p className="text-red-700 dark:text-red-400">
                  HyveWyre™ does not offer refunds for any purchases, subscriptions, or services.
                </p>
              </div>
            </div>
          </div>
          <p className="text-slate-700 dark:text-slate-300">
            By purchasing any subscription plan, point package, or service from HyveWyre™, you acknowledge
            and agree that all payments are non-refundable under any circumstances.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">What This Means</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-3">
            The following items are NOT eligible for refunds:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4">
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
          <p className="text-slate-700 dark:text-slate-300">
            While we do not offer refunds, you may cancel your subscription at any time. Upon cancellation:
          </p>
          <ul className="list-disc list-inside space-y-2 text-slate-700 dark:text-slate-300 ml-4 mt-3">
            <li>You will retain access to your subscription features until the end of your current billing period</li>
            <li>No further charges will be made after the current period ends</li>
            <li>Your unused point balance will remain available on your account</li>
            <li>You can reactivate your subscription at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Technical Issues</h2>
          <p className="text-slate-700 dark:text-slate-300">
            If you experience technical issues with our platform, please contact our support team. While
            we cannot offer refunds, we will work diligently to resolve any technical problems and may
            provide service credits at our sole discretion in cases of extended service outages.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Chargebacks</h2>
          <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-l-4 border-amber-500 rounded-lg p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-amber-800 dark:text-amber-300 font-semibold mb-2">
                  Important Notice
                </p>
                <p className="text-amber-700 dark:text-amber-400 mb-2">
                  Initiating a chargeback or payment dispute will result in immediate account suspension and termination of service.
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  By using HyveWyre™, you agree that all charges are legitimate and that you will not dispute
                  charges with your payment provider. If you have billing questions or concerns, please contact
                  our support team directly.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Disputes and Questions</h2>
          <p className="text-slate-700 dark:text-slate-300">
            If you have questions about billing or believe you were charged in error, please contact us
            immediately:
          </p>
          <div className="mt-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <p className="text-slate-700 dark:text-slate-300">Email: billing@hyvewyre.com</p>
            <p className="text-slate-700 dark:text-slate-300">Support: support@hyvewyre.com</p>
            <p className="text-slate-700 dark:text-slate-300">Response time: Within 24 hours</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Acknowledgment</h2>
          <p className="text-slate-700 dark:text-slate-300">
            By using HyveWyre™'s services and making any purchase, you acknowledge that you have read,
            understood, and agree to this No Refunds Policy. This policy is part of our Terms of Service
            and is binding on all users.
          </p>
        </section>
      </div>
    </div>
  );
}
