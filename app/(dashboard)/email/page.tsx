'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Email = {
  id: string;
  to: string;
  subject: string;
  body: string;
  sent_at: string;
  status: 'sent' | 'failed';
  error?: string;
  lead_id?: number;
};

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  useEffect(() => {
    loadEmails();
  }, []);

  async function loadEmails() {
    setLoading(true);
    try {
      const response = await fetch('/api/emails');
      const data = await response.json();
      if (data.ok) {
        setEmails(data.items || []);
      }
    } catch (error) {
      console.error('Error loading emails:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredEmails = emails.filter(email =>
    email.to.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sentCount = emails.filter(e => e.status === 'sent').length;
  const failedCount = emails.filter(e => e.status === 'failed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email</h1>
          <p className="text-gray-600 mt-1">View sent emails and configure email settings</p>
        </div>
        <Link
          href="/settings?tab=email"
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          Email Settings
        </Link>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by recipient or subject..."
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total Emails</div>
          <div className="text-3xl font-bold">{emails.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Sent Successfully</div>
          <div className="text-3xl font-bold text-green-600">{sentCount}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Failed</div>
          <div className="text-3xl font-bold text-red-600">{failedCount}</div>
        </div>
      </div>

      {/* Emails List */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading emails...</div>
        ) : filteredEmails.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-600 mb-4">
              {searchQuery ? 'No emails found matching your search.' : 'No emails sent yet.'}
            </div>
            {!searchQuery && (
              <div className="text-sm text-gray-500">
                Emails are automatically sent to new leads when you import them.
                <br />
                <Link href="/leads" className="text-blue-600 hover:underline">
                  Import Leads
                </Link>
                {' '}to start sending welcome emails.
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Recipient</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Subject</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Sent At</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredEmails.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {email.status === 'sent' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{email.to}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate">{email.subject}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(email.sent_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedEmail(email)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEmail(null)}
        >
          <div
            className="bg-[#0f1722] border border-[#1a2637] rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#1a2637]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-[#e7eef9]">Email Details</h2>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-[#9fb0c3] hover:text-[#e7eef9] text-2xl"
                >
                  &times;
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedEmail.status === 'sent' ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Sent
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    Failed
                  </span>
                )}
                <span className="text-sm text-[#9fb0c3]">
                  {new Date(selectedEmail.sent_at).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#9fb0c3] mb-1">To</label>
                <div className="text-[#e7eef9]">{selectedEmail.to}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9fb0c3] mb-1">Subject</label>
                <div className="text-[#e7eef9]">{selectedEmail.subject}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9fb0c3] mb-1">Message</label>
                <div className="bg-[#0c1420] border border-[#223246] rounded-lg p-4 whitespace-pre-wrap text-[#e7eef9]">
                  {selectedEmail.body}
                </div>
              </div>

              {selectedEmail.error && (
                <div>
                  <label className="block text-sm font-medium text-red-400 mb-1">Error</label>
                  <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-4 text-red-400">
                    {selectedEmail.error}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => setSelectedEmail(null)}
                className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold mb-2">About Email</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Welcome emails are automatically sent to new leads with email addresses</li>
          <li>• Each email costs 0.5 points from your balance</li>
          <li>• Configure your email provider in <Link href="/settings?tab=email" className="text-blue-600 hover:underline">Settings → Email</Link></li>
          <li>• Supports SMTP (Gmail, Office 365, etc.) and SendGrid</li>
          <li>• Track all sent emails and their delivery status here</li>
        </ul>
      </div>
    </div>
  );
}
