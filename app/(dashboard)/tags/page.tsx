'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomModal from "@/components/CustomModal";

type Tag = {
  id: string;
  name: string;
  color: string;
  count: number;
  created_at?: string;
  updated_at?: string;
};

type TagGroup = {
  id: string;
  name: string;
  tags: string[]; // tag names
  color: string;
  created_at: string;
};

type ModalState = {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#34d399', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#14b8a6', // teal
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
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Tag Groups state
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TagGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#6366f1');
  const [selectedGroupTags, setSelectedGroupTags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'tags' | 'groups'>('tags');

  useEffect(() => {
    loadTags();
    loadTagGroups();
  }, []);

  // Load tag groups from localStorage
  function loadTagGroups() {
    try {
      const stored = localStorage.getItem('tag_groups');
      if (stored) {
        setTagGroups(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading tag groups:', error);
    }
  }

  // Save tag groups to localStorage
  function saveTagGroups(groups: TagGroup[]) {
    try {
      localStorage.setItem('tag_groups', JSON.stringify(groups));
      setTagGroups(groups);
    } catch (error) {
      console.error('Error saving tag groups:', error);
    }
  }

  function createTagGroup() {
    if (!newGroupName.trim() || selectedGroupTags.length === 0) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Please enter a group name and select at least one tag'
      });
      return;
    }

    const newGroup: TagGroup = {
      id: crypto.randomUUID(),
      name: newGroupName.trim(),
      tags: selectedGroupTags,
      color: newGroupColor,
      created_at: new Date().toISOString(),
    };

    saveTagGroups([...tagGroups, newGroup]);
    closeGroupModal();
    setModal({
      isOpen: true,
      type: 'success',
      title: 'Success',
      message: `Tag group "${newGroupName.trim()}" created with ${selectedGroupTags.length} tags!`
    });
  }

  function updateTagGroup() {
    if (!editingGroup || !newGroupName.trim() || selectedGroupTags.length === 0) return;

    const updatedGroups = tagGroups.map(g =>
      g.id === editingGroup.id
        ? { ...g, name: newGroupName.trim(), tags: selectedGroupTags, color: newGroupColor }
        : g
    );
    saveTagGroups(updatedGroups);
    closeGroupModal();
  }

  function deleteTagGroup(id: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Tag Group',
      message: 'Are you sure you want to delete this tag group?',
      onConfirm: () => {
        saveTagGroups(tagGroups.filter(g => g.id !== id));
      }
    });
  }

  function openEditGroupModal(group: TagGroup) {
    setEditingGroup(group);
    setNewGroupName(group.name);
    setNewGroupColor(group.color);
    setSelectedGroupTags([...group.tags]);
    setShowGroupModal(true);
  }

  function closeGroupModal() {
    setShowGroupModal(false);
    setEditingGroup(null);
    setNewGroupName('');
    setNewGroupColor('#6366f1');
    setSelectedGroupTags([]);
  }

  function toggleTagInGroup(tagName: string) {
    setSelectedGroupTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  }

  function getGroupLeadCount(group: TagGroup): number {
    return group.tags.reduce((sum, tagName) => {
      const tag = tags.find(t => t.name === tagName);
      return sum + (tag?.count || 0);
    }, 0);
  }

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
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create tag'
        });
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to create tag'
      });
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
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to update tag'
        });
      }
    } catch (error) {
      console.error('Error updating tag:', error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Failed to update tag'
      });
    }
  }

  async function deleteTag(id: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Tag',
      message: 'Delete this tag? It will not be removed from existing leads.',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/tags?id=${id}`, {
            method: 'DELETE',
          });

          const data = await response.json();
          if (data.ok) {
            await loadTags();
          } else {
            setModal({
              isOpen: true,
              type: 'error',
              title: 'Error',
              message: data.error || 'Failed to delete tag'
            });
          }
        } catch (error) {
          console.error('Error deleting tag:', error);
          setModal({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: 'Failed to delete tag'
          });
        }
      }
    });
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
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        onConfirm={modal.onConfirm}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        confirmText={modal.type === 'confirm' ? 'Confirm' : 'OK'}
        cancelText="Cancel"
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Organize and filter your leads by tags</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'tags' ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600"
            >
              Create Tag
            </button>
          ) : (
            <button
              onClick={() => setShowGroupModal(true)}
              className="bg-indigo-500 text-slate-900 dark:text-slate-100 px-4 py-2 rounded-lg hover:bg-indigo-600"
            >
              Create Group
            </button>
          )}
          <Link
            href="/leads"
            className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600"
          >
            Manage Leads
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-50 dark:bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('tags')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'tags'
              ? 'bg-sky-500 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800'
          }`}
        >
          Tags ({tags.length})
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'groups'
              ? 'bg-indigo-500 text-gray-900'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:bg-slate-800'
          }`}
        >
          Groups ({tagGroups.length})
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={activeTab === 'tags' ? "Search tags..." : "Search groups..."}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {/* Tags Tab Content */}
      {activeTab === 'tags' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Tags</div>
              <div className="text-3xl font-bold">{tags.length}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Tagged Leads</div>
              <div className="text-3xl font-bold">{totalLeads.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Average per Tag</div>
              <div className="text-3xl font-bold">
                {tags.length > 0 ? Math.round(totalLeads / tags.length) : 0}
              </div>
            </div>
          </div>

          {/* Tags Grid */}
          <div className="card p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading tags...</div>
            ) : filteredTags.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-slate-600 dark:text-slate-400 mb-4">
                  {searchQuery ? 'No tags found matching your search.' : 'No tags yet.'}
                </div>
                {!searchQuery && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-sky-600 hover:underline"
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
                        <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                          {percentage.toFixed(1)}% of all tagged leads
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(tag)}
                            className="flex-1 text-sm px-3 py-1 bg-blue-50 text-sky-600 rounded hover:bg-blue-900/30"
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
                            className="flex-1 text-sm px-3 py-1 bg-slate-50 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-50 dark:bg-slate-800/50 text-center"
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
        </>
      )}

      {/* Groups Tab Content */}
      {activeTab === 'groups' && (
        <>
          {/* Groups Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Groups</div>
              <div className="text-3xl font-bold text-indigo-400">{tagGroups.length}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Tags in Groups</div>
              <div className="text-3xl font-bold text-indigo-400">
                {tagGroups.reduce((sum, g) => sum + g.tags.length, 0)}
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Grouped Leads</div>
              <div className="text-3xl font-bold text-indigo-400">
                {tagGroups.reduce((sum, g) => sum + getGroupLeadCount(g), 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Groups Grid */}
          <div className="card p-0">
            {tagGroups.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-slate-600 dark:text-slate-400 mb-4">No tag groups yet.</div>
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="text-indigo-400 hover:underline"
                >
                  Create your first group
                </button>
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tagGroups
                    .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((group) => {
                      const leadCount = getGroupLeadCount(group);
                      return (
                        <div
                          key={group.id}
                          className="block p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-md transition-all bg-slate-50 dark:bg-slate-800"
                          style={{ borderLeft: `4px solid ${group.color}` }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded"
                                style={{ backgroundColor: group.color }}
                              />
                              <h3 className="font-semibold text-lg text-gray-900">{group.name}</h3>
                            </div>
                            <span className="text-xl font-bold" style={{ color: group.color }}>
                              {leadCount}
                            </span>
                          </div>

                          <div className="mb-3">
                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">{group.tags.length} tags in this group:</div>
                            <div className="flex flex-wrap gap-1">
                              {group.tags.slice(0, 5).map((tagName) => {
                                const tag = tags.find(t => t.name === tagName);
                                return (
                                  <span
                                    key={tagName}
                                    className="px-2 py-0.5 rounded-full text-xs text-gray-900"
                                    style={{ backgroundColor: tag?.color || '#6b7280' }}
                                  >
                                    {tagName}
                                  </span>
                                );
                              })}
                              {group.tags.length > 5 && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  +{group.tags.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditGroupModal(group)}
                              className="flex-1 text-sm px-3 py-1 bg-indigo-900/20 text-indigo-400 rounded hover:bg-indigo-900/30"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteTagGroup(group.id)}
                              className="flex-1 text-sm px-3 py-1 bg-red-50 text-red-400 rounded hover:bg-red-900/30"
                            >
                              Delete
                            </button>
                            <Link
                              href={`/leads?tags=${encodeURIComponent(group.tags.join(','))}`}
                              className="flex-1 text-sm px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-center"
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
        </>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingTag) && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              {editingTag ? 'Edit Tag' : 'Create New Tag'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Enter tag name"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 outline-none focus:border-sky-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-600 dark:text-slate-400">Tag Color</label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-full h-10 rounded-lg border-2 transition-all ${
                        newTagColor === color ? 'border-[#60a5fa] scale-110' : 'border-slate-200 dark:border-slate-700'
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
                    className="w-12 h-10 rounded cursor-pointer bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                  <input
                    type="text"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 outline-none focus:border-sky-500"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: newTagColor }}
                />
                <span className="font-medium text-gray-900">{newTagName || 'Preview'}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={editingTag ? updateTag : createTag}
                disabled={!newTagName.trim()}
                className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingTag ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">
              {editingGroup ? 'Edit Tag Group' : 'Create Tag Group'}
            </h2>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., Insurance Leads, Hot Prospects"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:text-slate-400 outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-600 dark:text-slate-400">Group Color</label>
                <div className="grid grid-cols-5 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewGroupColor(color)}
                      className={`w-full h-8 rounded-lg border-2 transition-all ${
                        newGroupColor === color ? 'border-white scale-110' : 'border-slate-200 dark:border-slate-700'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-600 dark:text-slate-400">
                  Select Tags ({selectedGroupTags.length} selected)
                </label>
                {tags.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-center text-slate-600 dark:text-slate-400">
                    No tags available. Create some tags first.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTagInGroup(tag.name)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition ${
                          selectedGroupTags.includes(tag.name)
                            ? 'bg-indigo-900/30 border border-indigo-500'
                            : 'hover:bg-slate-100 dark:bg-slate-800 border border-transparent'
                        }`}
                      >
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 text-left text-gray-900">{tag.name}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">{tag.count} leads</span>
                        {selectedGroupTags.includes(tag.name) && (
                          <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview */}
              {selectedGroupTags.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">Preview:</div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: newGroupColor }}
                    />
                    <span className="font-medium text-gray-900">{newGroupName || 'Group Name'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedGroupTags.map((tagName) => {
                      const tag = tags.find(t => t.name === tagName);
                      return (
                        <span
                          key={tagName}
                          className="px-2 py-0.5 rounded-full text-xs text-gray-900"
                          style={{ backgroundColor: tag?.color || '#6b7280' }}
                        >
                          {tagName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={closeGroupModal}
                className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={editingGroup ? updateTagGroup : createTagGroup}
                disabled={!newGroupName.trim() || selectedGroupTags.length === 0}
                className="flex-1 px-4 py-2 bg-indigo-500 text-slate-900 dark:text-slate-100 rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingGroup ? 'Update Group' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="card bg-blue-50 border-sky-700/50">
        <h3 className="font-semibold mb-2">Working with Tags</h3>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <li>• Create custom tags with color coding for easy organization</li>
          <li>• Click any tag to see all leads with that tag</li>
          <li>• Tags help you organize and segment your leads effectively</li>
          <li>• Use tags to target specific groups in your campaigns</li>
          <li>• Multiple tags can be applied to each lead</li>
          <li>• <strong>Tag Groups</strong> let you bundle related tags together for easier filtering</li>
        </ul>
      </div>
    </div>
  );
}
