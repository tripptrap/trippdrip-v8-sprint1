'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Tag = {
  id: string;
  name: string;
  color: string;
  count: number;
  created_at?: string;
  updated_at?: string;
};

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

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

  async function createTag() {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadTags();
        setShowCreateModal(false);
        setNewTagName('');
        setNewTagColor('#3b82f6');
      } else {
        alert(data.error || 'Failed to create tag');
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      alert('Failed to create tag');
    }
  }

  async function updateTag() {
    if (!editingTag) return;

    try {
      const response = await fetch('/api/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTag.id,
          name: newTagName.trim(),
          color: newTagColor
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadTags();
        setEditingTag(null);
        setNewTagName('');
        setNewTagColor('#3b82f6');
      } else {
        alert(data.error || 'Failed to update tag');
      }
    } catch (error) {
      console.error('Error updating tag:', error);
      alert('Failed to update tag');
    }
  }

  async function deleteTag(id: string) {
    if (!confirm('Delete this tag? It will not be removed from existing leads.')) return;

    try {
      const response = await fetch(`/api/tags?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.ok) {
        await loadTags();
      } else {
        alert(data.error || 'Failed to delete tag');
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert('Failed to delete tag');
    }
  }

  function openEditModal(tag: Tag) {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setNewTagColor(tag.color);
  }

  function closeModal() {
    setShowCreateModal(false);
    setEditingTag(null);
    setNewTagName('');
    setNewTagColor('#3b82f6');
  }

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalLeads = tags.reduce((sum, tag) => sum + tag.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-[#9fb0c3] mt-1">Organize and filter your leads by tags</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
          >
            Create Tag
          </button>
          <Link
            href="/leads"
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
          >
            Manage Leads
          </Link>
        </div>
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
          <div className="text-sm text-[#9fb0c3] mb-1">Total Tags</div>
          <div className="text-3xl font-bold">{tags.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Total Tagged Leads</div>
          <div className="text-3xl font-bold">{totalLeads.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="text-sm text-[#9fb0c3] mb-1">Average per Tag</div>
          <div className="text-3xl font-bold">
            {tags.length > 0 ? Math.round(totalLeads / tags.length) : 0}
          </div>
        </div>
      </div>

      {/* Tags Grid */}
      <div className="card p-0">
        {loading ? (
          <div className="p-8 text-center text-[#9fb0c3]">Loading tags...</div>
        ) : filteredTags.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-[#9fb0c3] mb-4">
              {searchQuery ? 'No tags found matching your search.' : 'No tags yet.'}
            </div>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-blue-400 hover:underline"
              >
                Create your first tag
              </button>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTags.map((tag) => {
                const percentage = totalLeads > 0 ? (tag.count / totalLeads) * 100 : 0;
                return (
                  <div
                    key={tag.id}
                    className="block p-4 border rounded-lg hover:shadow-md transition-all"
                    style={{ borderLeft: `4px solid ${tag.color}` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <h3 className="font-semibold text-lg">{tag.name}</h3>
                      </div>
                      <span className="text-2xl font-bold" style={{ color: tag.color }}>
                        {tag.count}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${percentage}%`, backgroundColor: tag.color }}
                      />
                    </div>
                    <div className="text-sm text-[#9fb0c3] mb-3">
                      {percentage.toFixed(1)}% of all tagged leads
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(tag)}
                        className="flex-1 text-sm px-3 py-1 bg-blue-900/20 text-blue-400 rounded hover:bg-blue-900/30"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTag(tag.id)}
                        className="flex-1 text-sm px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100"
                      >
                        Delete
                      </button>
                      <Link
                        href={`/leads?tag=${encodeURIComponent(tag.name)}`}
                        className="flex-1 text-sm px-3 py-1 bg-[#0c1420]/30 text-[#9fb0c3] rounded hover:bg-[#0c1420]/50 text-center"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTag) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1722] border border-[#1a2637] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-[#e7eef9]">
              {editingTag ? 'Edit Tag' : 'Create New Tag'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-[#9fb0c3]">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Enter tag name"
                  className="w-full px-3 py-2 bg-[#0c1420] border border-[#223246] rounded-lg text-[#e7eef9] placeholder:text-[#5a6b7f] outline-none focus:border-[#3b82f6]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-[#9fb0c3]">Tag Color</label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-full h-10 rounded-lg border-2 transition-all ${
                        newTagColor === color ? 'border-[#60a5fa] scale-110' : 'border-[#223246]'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer bg-[#0c1420] border border-[#223246]"
                  />
                  <input
                    type="text"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#0c1420] border border-[#223246] rounded-lg font-mono text-sm text-[#e7eef9] placeholder:text-[#5a6b7f] outline-none focus:border-[#3b82f6]"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-[#0c1420] border border-[#223246] rounded-lg">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: newTagColor }}
                />
                <span className="font-medium text-[#e7eef9]">{newTagName || 'Preview'}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-[#0c1420] border border-[#223246] rounded-lg text-[#e7eef9] hover:bg-[#101b2a]"
              >
                Cancel
              </button>
              <button
                onClick={editingTag ? updateTag : createTag}
                disabled={!newTagName.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTag ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-900/20 border-blue-700/50">
        <h3 className="font-semibold mb-2">Working with Tags</h3>
        <ul className="text-sm text-[#9fb0c3] space-y-1">
          <li>• Create custom tags with color coding for easy organization</li>
          <li>• Click any tag to see all leads with that tag</li>
          <li>• Tags help you organize and segment your leads effectively</li>
          <li>• Use tags to target specific groups in your campaigns</li>
          <li>• Multiple tags can be applied to each lead</li>
        </ul>
      </div>
    </div>
  );
}
