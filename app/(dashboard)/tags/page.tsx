'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CustomModal from "@/components/CustomModal";
import { GripVertical, Zap, Plus, Pencil, Trash2, Eye, ChevronDown, ChevronUp } from 'lucide-react';

type Tag = {
  id: string;
  name: string;
  color: string;
  position: number;
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

type AutoTaggingRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  action_type: string;
  tag_name: string;
  condition_tags: string[];
  condition_tags_mode: 'any' | 'all' | 'none';
  priority: number;
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

const TRIGGER_TYPES = [
  { value: 'lead_created', label: 'Lead Created', description: 'When a new lead is added' },
  { value: 'message_received', label: 'Message Received', description: 'When a lead sends a message' },
  { value: 'lead_replied', label: 'Lead Replied', description: 'When a lead replies for the first time' },
  { value: 'message_sent', label: 'Message Sent', description: 'When you send a message to a lead' },
  { value: 'appointment_booked', label: 'Appointment Booked', description: 'When an appointment is scheduled' },
  { value: 'no_response', label: 'No Response', description: 'When lead hasn\'t responded in X days' },
  { value: 'keyword_match', label: 'Keyword Match', description: 'When message contains specific keywords' },
];

const ACTION_TYPES = [
  { value: 'add_tag', label: 'Add Tag', description: 'Add a tag to the lead' },
  { value: 'remove_tag', label: 'Remove Tag', description: 'Remove a tag from the lead' },
  { value: 'set_primary_tag', label: 'Set Primary Tag', description: 'Set as the lead\'s primary tag' },
  { value: 'replace_tag', label: 'Replace Tags', description: 'Replace condition tags with this tag' },
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
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TagGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#6366f1');
  const [selectedGroupTags, setSelectedGroupTags] = useState<string[]>([]);

  // Auto-tagging rules state
  const [autoRules, setAutoRules] = useState<AutoTaggingRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTaggingRule | null>(null);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleTrigger, setNewRuleTrigger] = useState('lead_created');
  const [newRuleTriggerConfig, setNewRuleTriggerConfig] = useState<Record<string, any>>({});
  const [newRuleAction, setNewRuleAction] = useState('add_tag');
  const [newRuleTagName, setNewRuleTagName] = useState('');
  const [newRuleConditionTags, setNewRuleConditionTags] = useState<string[]>([]);
  const [newRuleConditionMode, setNewRuleConditionMode] = useState<'any' | 'all' | 'none'>('any');
  const [newRulePriority, setNewRulePriority] = useState(100);
  const [newRuleEnabled, setNewRuleEnabled] = useState(true);

  const [activeTab, setActiveTab] = useState<'tags' | 'groups' | 'rules'>('tags');

  // Drag state for reordering
  const [draggedTag, setDraggedTag] = useState<Tag | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    loadTags();
    loadTagGroups();
    loadAutoRules();
  }, []);

  // Load tags from API
  async function loadTags() {
    setLoading(true);
    try {
      const response = await fetch('/api/tags?sort=position');
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

  // Load tag groups from API (not localStorage anymore)
  async function loadTagGroups() {
    setGroupsLoading(true);
    try {
      const response = await fetch('/api/tag-groups');
      const data = await response.json();
      if (data.ok) {
        setTagGroups(data.items || []);
      }
    } catch (error) {
      console.error('Error loading tag groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  }

  // Load auto-tagging rules
  async function loadAutoRules() {
    setRulesLoading(true);
    try {
      const response = await fetch('/api/auto-tagging-rules');
      const data = await response.json();
      if (data.ok) {
        setAutoRules(data.items || []);
      }
    } catch (error) {
      console.error('Error loading auto-tagging rules:', error);
    } finally {
      setRulesLoading(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG CRUD
  // ═══════════════════════════════════════════════════════════════════════════

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
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG REORDERING (DRAG & DROP)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleDragStart = useCallback((e: React.DragEvent, tag: Tag) => {
    setDraggedTag(tag);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetTag: Tag) => {
    e.preventDefault();
    if (!draggedTag || draggedTag.id === targetTag.id) {
      setDraggedTag(null);
      return;
    }

    // Reorder locally first
    const newTags = [...tags];
    const draggedIndex = newTags.findIndex(t => t.id === draggedTag.id);
    const targetIndex = newTags.findIndex(t => t.id === targetTag.id);

    const [removed] = newTags.splice(draggedIndex, 1);
    newTags.splice(targetIndex, 0, removed);

    // Update positions
    const reorderedTags = newTags.map((t, i) => ({ ...t, position: i + 1 }));
    setTags(reorderedTags);
    setDraggedTag(null);

    // Save to server
    setSavingOrder(true);
    try {
      await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reorderedTags.map(t => t.id) }),
      });
    } catch (error) {
      console.error('Error saving tag order:', error);
      loadTags(); // Reload on error
    } finally {
      setSavingOrder(false);
    }
  }, [draggedTag, tags]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TAG GROUPS CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async function createTagGroup() {
    if (!newGroupName.trim() || selectedGroupTags.length === 0) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Please enter a group name and select at least one tag'
      });
      return;
    }

    try {
      const response = await fetch('/api/tag-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          color: newGroupColor,
          tags: selectedGroupTags,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadTagGroups();
        closeGroupModal();
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: `Tag group "${newGroupName.trim()}" created!`
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create group'
        });
      }
    } catch (error) {
      console.error('Error creating tag group:', error);
    }
  }

  async function updateTagGroup() {
    if (!editingGroup || !newGroupName.trim() || selectedGroupTags.length === 0) return;

    try {
      const response = await fetch('/api/tag-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingGroup.id,
          name: newGroupName.trim(),
          color: newGroupColor,
          tags: selectedGroupTags,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadTagGroups();
        closeGroupModal();
      }
    } catch (error) {
      console.error('Error updating tag group:', error);
    }
  }

  async function deleteTagGroup(id: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Tag Group',
      message: 'Are you sure you want to delete this tag group?',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/tag-groups?id=${id}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (data.ok) {
            await loadTagGroups();
          }
        } catch (error) {
          console.error('Error deleting tag group:', error);
        }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-TAGGING RULES CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  async function createAutoRule() {
    if (!newRuleName.trim() || !newRuleTagName.trim()) {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Please enter a rule name and select a tag'
      });
      return;
    }

    try {
      const response = await fetch('/api/auto-tagging-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRuleName.trim(),
          trigger_type: newRuleTrigger,
          trigger_config: newRuleTriggerConfig,
          action_type: newRuleAction,
          tag_name: newRuleTagName.trim(),
          condition_tags: newRuleConditionTags,
          condition_tags_mode: newRuleConditionMode,
          priority: newRulePriority,
          enabled: newRuleEnabled,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadAutoRules();
        closeRuleModal();
        setModal({
          isOpen: true,
          type: 'success',
          title: 'Success',
          message: `Auto-tagging rule "${newRuleName.trim()}" created!`
        });
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to create rule'
        });
      }
    } catch (error) {
      console.error('Error creating auto-tagging rule:', error);
    }
  }

  async function updateAutoRule() {
    if (!editingRule) return;

    try {
      const response = await fetch('/api/auto-tagging-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRule.id,
          name: newRuleName.trim(),
          trigger_type: newRuleTrigger,
          trigger_config: newRuleTriggerConfig,
          action_type: newRuleAction,
          tag_name: newRuleTagName.trim(),
          condition_tags: newRuleConditionTags,
          condition_tags_mode: newRuleConditionMode,
          priority: newRulePriority,
          enabled: newRuleEnabled,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        await loadAutoRules();
        closeRuleModal();
      }
    } catch (error) {
      console.error('Error updating auto-tagging rule:', error);
    }
  }

  async function deleteAutoRule(id: string) {
    setModal({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Rule',
      message: 'Are you sure you want to delete this auto-tagging rule?',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/auto-tagging-rules?id=${id}`, {
            method: 'DELETE',
          });
          const data = await response.json();
          if (data.ok) {
            await loadAutoRules();
          }
        } catch (error) {
          console.error('Error deleting auto-tagging rule:', error);
        }
      }
    });
  }

  async function toggleRuleEnabled(rule: AutoTaggingRule) {
    try {
      await fetch('/api/auto-tagging-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      await loadAutoRules();
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  }

  function openEditRuleModal(rule: AutoTaggingRule) {
    setEditingRule(rule);
    setNewRuleName(rule.name);
    setNewRuleTrigger(rule.trigger_type);
    setNewRuleTriggerConfig(rule.trigger_config || {});
    setNewRuleAction(rule.action_type);
    setNewRuleTagName(rule.tag_name);
    setNewRuleConditionTags(rule.condition_tags || []);
    setNewRuleConditionMode(rule.condition_tags_mode || 'any');
    setNewRulePriority(rule.priority);
    setNewRuleEnabled(rule.enabled);
    setShowRuleModal(true);
  }

  function closeRuleModal() {
    setShowRuleModal(false);
    setEditingRule(null);
    setNewRuleName('');
    setNewRuleTrigger('lead_created');
    setNewRuleTriggerConfig({});
    setNewRuleAction('add_tag');
    setNewRuleTagName('');
    setNewRuleConditionTags([]);
    setNewRuleConditionMode('any');
    setNewRulePriority(100);
    setNewRuleEnabled(true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

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

  const getTriggerLabel = (type: string) => TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  const getActionLabel = (type: string) => ACTION_TYPES.find(a => a.value === type)?.label || type;

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
          <h1 className="text-2xl font-semibold">Tags & Pipeline</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Organize leads, create groups, and automate tagging</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'tags' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Tag
            </button>
          )}
          {activeTab === 'groups' && (
            <button
              onClick={() => setShowGroupModal(true)}
              className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Group
            </button>
          )}
          {activeTab === 'rules' && (
            <button
              onClick={() => setShowRuleModal(true)}
              className="bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Rule
            </button>
          )}
          <Link
            href="/leads"
            className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Manage Leads
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('tags')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'tags'
              ? 'bg-sky-500 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Pipeline Stages ({tags.length})
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${
            activeTab === 'groups'
              ? 'bg-indigo-500 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          Groups ({tagGroups.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
            activeTab === 'rules'
              ? 'bg-amber-500 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Auto-Tagging ({autoRules.length})
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            activeTab === 'tags' ? "Search pipeline stages..." :
            activeTab === 'groups' ? "Search groups..." :
            "Search rules..."
          }
          className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAGS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tags' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Stages</div>
              <div className="text-3xl font-bold">{tags.length}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Tagged Leads</div>
              <div className="text-3xl font-bold">{totalLeads.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Average per Stage</div>
              <div className="text-3xl font-bold">
                {tags.length > 0 ? Math.round(totalLeads / tags.length) : 0}
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Order</div>
              <div className="text-sm text-slate-500">
                {savingOrder ? 'Saving...' : 'Drag to reorder stages'}
              </div>
            </div>
          </div>

          {/* Tags List (Draggable) */}
          <div className="card p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading stages...</div>
            ) : filteredTags.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-slate-600 dark:text-slate-400 mb-4">
                  {searchQuery ? 'No stages found matching your search.' : 'No pipeline stages yet.'}
                </div>
                {!searchQuery && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="text-sky-600 hover:underline"
                  >
                    Create your first pipeline stage
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredTags.map((tag, index) => {
                  const percentage = totalLeads > 0 ? (tag.count / totalLeads) * 100 : 0;
                  return (
                    <div
                      key={tag.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, tag)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, tag)}
                      className={`flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-move transition-all ${
                        draggedTag?.id === tag.id ? 'opacity-50 bg-slate-100 dark:bg-slate-700' : ''
                      }`}
                    >
                      <GripVertical className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <div className="flex items-center gap-2 flex-shrink-0 w-8">
                        <span className="text-sm text-slate-400 font-mono">{index + 1}</span>
                      </div>
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{tag.name}</span>
                          <span className="text-lg font-bold" style={{ color: tag.color }}>{tag.count}</span>
                          <span className="text-xs text-slate-500">({percentage.toFixed(1)}%)</span>
                        </div>
                        <div className="w-full max-w-xs bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-1">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${percentage}%`, backgroundColor: tag.color }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => openEditModal(tag)}
                          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTag(tag.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/leads?tag=${encodeURIComponent(tag.name)}`}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title="View Leads"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* GROUPS TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'groups' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Groups</div>
              <div className="text-3xl font-bold text-indigo-500">{tagGroups.length}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Tags in Groups</div>
              <div className="text-3xl font-bold text-indigo-500">
                {tagGroups.reduce((sum, g) => sum + g.tags.length, 0)}
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Grouped Leads</div>
              <div className="text-3xl font-bold text-indigo-500">
                {tagGroups.reduce((sum, g) => sum + getGroupLeadCount(g), 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="card p-0">
            {groupsLoading ? (
              <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading groups...</div>
            ) : tagGroups.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-slate-600 dark:text-slate-400 mb-4">No tag groups yet.</div>
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="text-indigo-500 hover:underline"
                >
                  Create your first group
                </button>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tagGroups
                  .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((group) => {
                    const leadCount = getGroupLeadCount(group);
                    return (
                      <div
                        key={group.id}
                        className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:shadow-md transition-all"
                        style={{ borderLeftWidth: '4px', borderLeftColor: group.color }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: group.color }} />
                            <h3 className="font-semibold text-lg">{group.name}</h3>
                          </div>
                          <span className="text-xl font-bold" style={{ color: group.color }}>
                            {leadCount}
                          </span>
                        </div>
                        <div className="mb-3">
                          <div className="text-xs text-slate-500 mb-2">{group.tags.length} tags:</div>
                          <div className="flex flex-wrap gap-1">
                            {group.tags.slice(0, 5).map((tagName) => {
                              const tag = tags.find(t => t.name === tagName);
                              return (
                                <span
                                  key={tagName}
                                  className="px-2 py-0.5 rounded-full text-xs text-white"
                                  style={{ backgroundColor: tag?.color || '#6b7280' }}
                                >
                                  {tagName}
                                </span>
                              );
                            })}
                            {group.tags.length > 5 && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-200 dark:bg-slate-700 text-slate-600">
                                +{group.tags.length - 5}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditGroupModal(group)}
                            className="flex-1 text-sm px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteTagGroup(group.id)}
                            className="flex-1 text-sm px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            Delete
                          </button>
                          <Link
                            href={`/leads?tags=${encodeURIComponent(group.tags.join(','))}`}
                            className="flex-1 text-sm px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-center"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* AUTO-TAGGING RULES TAB */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'rules' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Rules</div>
              <div className="text-3xl font-bold text-amber-500">{autoRules.length}</div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Active Rules</div>
              <div className="text-3xl font-bold text-green-500">
                {autoRules.filter(r => r.enabled).length}
              </div>
            </div>
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Disabled Rules</div>
              <div className="text-3xl font-bold text-slate-400">
                {autoRules.filter(r => !r.enabled).length}
              </div>
            </div>
          </div>

          <div className="card bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 mb-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">Auto-Tagging Rules</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Automatically tag leads based on events like receiving a message, booking an appointment, or matching keywords.
                  Rules are processed in priority order (lower number = higher priority).
                </p>
              </div>
            </div>
          </div>

          <div className="card p-0">
            {rulesLoading ? (
              <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading rules...</div>
            ) : autoRules.length === 0 ? (
              <div className="p-8 text-center">
                <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <div className="text-slate-600 dark:text-slate-400 mb-4">No auto-tagging rules yet.</div>
                <button
                  onClick={() => setShowRuleModal(true)}
                  className="text-amber-500 hover:underline"
                >
                  Create your first rule
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {autoRules
                  .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${!rule.enabled ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleRuleEnabled(rule)}
                            className={`w-10 h-6 rounded-full transition-colors relative ${rule.enabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${rule.enabled ? 'left-5' : 'left-1'}`} />
                          </button>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-slate-100">{rule.name}</h4>
                            <p className="text-sm text-slate-500">
                              <span className="text-sky-600">{getTriggerLabel(rule.trigger_type)}</span>
                              {' → '}
                              <span className="text-amber-600">{getActionLabel(rule.action_type)}</span>
                              {': '}
                              <span className="font-medium">{rule.tag_name}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                            Priority: {rule.priority}
                          </span>
                          <button
                            onClick={() => openEditRuleModal(rule)}
                            className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteAutoRule(rule.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* CREATE/EDIT TAG MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {(showCreateModal || editingTag) && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">
              {editingTag ? 'Edit Pipeline Stage' : 'Create Pipeline Stage'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Stage Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., Contacted, Qualified, Appointment Set"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-sky-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-600 dark:text-slate-400">Color</label>
                <div className="grid grid-cols-5 gap-2 mb-3">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-full h-10 rounded-lg border-2 transition-all ${
                        newTagColor === color ? 'border-sky-500 scale-110' : 'border-transparent'
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
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="w-8 h-8 rounded-full" style={{ backgroundColor: newTagColor }} />
                <span className="font-medium">{newTagName || 'Preview'}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={editingTag ? updateTag : createTag}
                disabled={!newTagName.trim()}
                className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50"
              >
                {editingTag ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* CREATE/EDIT GROUP MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showGroupModal && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-semibold mb-4">
              {editingGroup ? 'Edit Tag Group' : 'Create Tag Group'}
            </h2>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., Hot Prospects, Insurance Leads"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-indigo-500"
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
                        newGroupColor === color ? 'border-white scale-110' : 'border-transparent'
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
                  <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg text-center text-slate-500">
                    No tags available. Create some tags first.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto bg-slate-50 dark:bg-slate-700 rounded-lg p-2 space-y-1">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTagInGroup(tag.name)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition ${
                          selectedGroupTags.includes(tag.name)
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-500'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-600 border border-transparent'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                        <span className="flex-1 text-left">{tag.name}</span>
                        <span className="text-sm text-slate-500">{tag.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={closeGroupModal}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={editingGroup ? updateTagGroup : createTagGroup}
                disabled={!newGroupName.trim() || selectedGroupTags.length === 0}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
              >
                {editingGroup ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* CREATE/EDIT AUTO-TAGGING RULE MODAL */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showRuleModal && (
        <div className="fixed inset-0 md:left-64 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 max-w-lg w-full max-h-[85vh] flex flex-col">
            <h2 className="text-xl font-semibold mb-4">
              {editingRule ? 'Edit Auto-Tagging Rule' : 'Create Auto-Tagging Rule'}
            </h2>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Rule Name</label>
                <input
                  type="text"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="e.g., Tag new leads, Mark replied leads"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ruleEnabled"
                  checked={newRuleEnabled}
                  onChange={(e) => setNewRuleEnabled(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="ruleEnabled" className="text-sm text-slate-600 dark:text-slate-400">
                  Rule is active
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">When this happens...</label>
                <select
                  value={newRuleTrigger}
                  onChange={(e) => setNewRuleTrigger(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  {TRIGGER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {TRIGGER_TYPES.find(t => t.value === newRuleTrigger)?.description}
                </p>
              </div>

              {/* Trigger-specific config */}
              {newRuleTrigger === 'keyword_match' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Keywords (comma-separated)</label>
                  <input
                    type="text"
                    value={newRuleTriggerConfig.keywords?.join(', ') || ''}
                    onChange={(e) => setNewRuleTriggerConfig({
                      ...newRuleTriggerConfig,
                      keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                    })}
                    placeholder="interested, yes, call me"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                  />
                </div>
              )}

              {newRuleTrigger === 'no_response' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Days without response</label>
                  <input
                    type="number"
                    value={newRuleTriggerConfig.days || 3}
                    onChange={(e) => setNewRuleTriggerConfig({ ...newRuleTriggerConfig, days: parseInt(e.target.value) })}
                    min={1}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Then do this...</label>
                <select
                  value={newRuleAction}
                  onChange={(e) => setNewRuleAction(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  {ACTION_TYPES.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {ACTION_TYPES.find(a => a.value === newRuleAction)?.description}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Tag to apply</label>
                <select
                  value={newRuleTagName}
                  onChange={(e) => setNewRuleTagName(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  <option value="">Select a tag...</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.name}>{tag.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">
                  Only if lead has these tags (optional)
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {newRuleConditionTags.map(tagName => (
                    <span
                      key={tagName}
                      className="px-2 py-1 bg-slate-200 dark:bg-slate-600 rounded text-sm flex items-center gap-1"
                    >
                      {tagName}
                      <button
                        onClick={() => setNewRuleConditionTags(prev => prev.filter(t => t !== tagName))}
                        className="text-slate-500 hover:text-red-500"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !newRuleConditionTags.includes(e.target.value)) {
                      setNewRuleConditionTags(prev => [...prev, e.target.value]);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  <option value="">Add condition tag...</option>
                  {tags.filter(t => !newRuleConditionTags.includes(t.name)).map(tag => (
                    <option key={tag.id} value={tag.name}>{tag.name}</option>
                  ))}
                </select>
                {newRuleConditionTags.length > 0 && (
                  <select
                    value={newRuleConditionMode}
                    onChange={(e) => setNewRuleConditionMode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg mt-2"
                  >
                    <option value="any">Lead has ANY of these tags</option>
                    <option value="all">Lead has ALL of these tags</option>
                    <option value="none">Lead has NONE of these tags</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">
                  Priority (lower = runs first)
                </label>
                <input
                  type="number"
                  value={newRulePriority}
                  onChange={(e) => setNewRulePriority(parseInt(e.target.value) || 100)}
                  min={1}
                  max={1000}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={closeRuleModal}
                className="flex-1 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={editingRule ? updateAutoRule : createAutoRule}
                disabled={!newRuleName.trim() || !newRuleTagName.trim()}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {editingRule ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="card bg-blue-50 dark:bg-blue-900/10 border-sky-200 dark:border-sky-800/30">
        <h3 className="font-semibold mb-2">Working with Tags & Pipeline</h3>
        <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
          <li>• <strong>Drag and drop</strong> to reorder your pipeline stages</li>
          <li>• <strong>Tag Groups</strong> bundle related tags for easier filtering</li>
          <li>• <strong>Auto-Tagging Rules</strong> automatically tag leads based on events</li>
          <li>• Multiple tags can be applied to each lead, with one primary tag</li>
          <li>• Pipeline stages are shown on the dashboard overview</li>
        </ul>
      </div>
    </div>
  );
}
