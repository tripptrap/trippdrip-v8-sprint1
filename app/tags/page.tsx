'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Tag = {
  tag: string;
  count: number;
};

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  async function loadTags() {
    setLoading(true);
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.ok) {
        setTags(data.items || []);
      }
    } catch (error) {
      console.error('Error loading tags:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredTags = tags.filter(tag =>
    tag.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLeads = tags.reduce((sum, tag) => sum + tag.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-gray-600 mt-1">Organize and filter your leads by tags</p>
        </div>
        <Link
          href="/leads"
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          Manage Leads
        </Link>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tags..."
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total Tags</div>
          <div className="text-3xl font-bold">{tags.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Total Tagged Leads</div>
          <div className="text-3xl font-bold">{totalLeads.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 mb-1">Average per Tag</div>
          <div className="text-3xl font-bold">
            {tags.length > 0 ? Math.round(totalLeads / tags.length) : 0}
          </div>
        </div>
      </div>

      {/* Tags Grid */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading tags...</div>
        ) : filteredTags.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-600 mb-4">
              {searchQuery ? 'No tags found matching your search.' : 'No tags yet.'}
            </div>
            {!searchQuery && (
              <div className="text-sm text-gray-500">
                Tags are created automatically when you import leads or run campaigns.
                <br />
                <Link href="/leads" className="text-blue-600 hover:underline">
                  Go to Leads
                </Link>
                {' '}to start tagging.
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTags.map((tag) => {
                const percentage = totalLeads > 0 ? (tag.count / totalLeads) * 100 : 0;
                return (
                  <Link
                    key={tag.tag}
                    href={`/leads?tag=${encodeURIComponent(tag.tag)}`}
                    className="block p-4 border rounded-lg hover:border-blue-500 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-lg">{tag.tag}</h3>
                      <span className="text-2xl font-bold text-blue-600">{tag.count}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-600">
                      {percentage.toFixed(1)}% of all tagged leads
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tag Cloud (Visual Representation) */}
      {filteredTags.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Tag Cloud</h2>
          <div className="flex flex-wrap gap-2">
            {filteredTags.map((tag) => {
              const size = Math.min(2, Math.max(0.875, (tag.count / totalLeads) * 10));
              return (
                <Link
                  key={tag.tag}
                  href={`/leads?tag=${encodeURIComponent(tag.tag)}`}
                  className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
                  style={{ fontSize: `${size}rem` }}
                >
                  {tag.tag} ({tag.count})
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-50 border-blue-200">
        <h3 className="font-semibold mb-2">Working with Tags</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• Tags help you organize and segment your leads</li>
          <li>• Click any tag to see all leads with that tag</li>
          <li>• Add tags when <Link href="/leads" className="text-blue-600 hover:underline">importing leads</Link> or running campaigns</li>
          <li>• Use tags to target specific groups in your campaigns</li>
          <li>• Multiple tags can be applied to each lead</li>
        </ul>
      </div>
    </div>
  );
}
