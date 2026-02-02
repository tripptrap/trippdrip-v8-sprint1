"use client";

import { useState, useEffect } from 'react';
import { X, Star, Save, Pencil, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface LeadData {
  id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  state?: string;
  zip_code?: string;
  tags?: string[];
  status?: string;
  converted?: boolean;
  primary_tag?: string;
  notes?: string;
}

interface ContactInfoPanelProps {
  leadId: string;
  initialData?: Partial<LeadData>;
  contactType: 'lead' | 'client';
  onClose: () => void;
  onSaved: () => void;
}

function EditableField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (editing) {
    return (
      <div>
        <label className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</label>
        <div className="flex items-center gap-1 mt-0.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-sky-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onSave(draft); setEditing(false); }
              if (e.key === 'Escape') { setDraft(value); setEditing(false); }
            }}
          />
          <button
            onClick={() => { onSave(draft); setEditing(false); }}
            className="p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setDraft(value); setEditing(false); }}
            className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <label className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-sm text-slate-900 dark:text-slate-100 flex-1 truncate">
          {value || <span className="text-slate-400 italic">Not set</span>}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-opacity"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export default function ContactInfoPanel({
  leadId,
  initialData,
  contactType,
  onClose,
  onSaved,
}: ContactInfoPanelProps) {
  const [lead, setLead] = useState<LeadData>({
    id: leadId,
    ...initialData,
  });
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [notesChanged, setNotesChanged] = useState(false);

  // Fetch full lead data
  useEffect(() => {
    fetch(`/api/leads/${leadId}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.lead) {
          setLead(data.lead);
          setNotes(data.lead.notes || '');
        }
      })
      .catch(() => {});
  }, [leadId]);

  // Fetch available tags
  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        if (data.ok && Array.isArray(data.items)) {
          setAvailableTags(data.items);
        }
      })
      .catch(() => {});
  }, []);

  async function patchLead(updates: Partial<LeadData>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.ok && data.lead) {
        setLead(data.lead);
        setNotes(data.lead.notes || '');
        onSaved();
        return true;
      } else {
        toast.error(data.error || 'Failed to save');
        return false;
      }
    } catch {
      toast.error('Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleFieldSave(field: string, value: string) {
    patchLead({ [field]: value });
  }

  function handleTagToggle(tagName: string) {
    const currentTags = Array.isArray(lead.tags) ? [...lead.tags] : [];
    const exists = currentTags.includes(tagName);
    const updated = exists
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];

    // Optimistic update
    setLead(prev => ({ ...prev, tags: updated }));
    patchLead({ tags: updated });
  }

  function handlePrimaryTag(tagName: string) {
    const newPrimary = lead.primary_tag === tagName ? '' : tagName;
    setLead(prev => ({ ...prev, primary_tag: newPrimary }));
    patchLead({ primary_tag: newPrimary });
  }

  async function handleMarkSold() {
    const success = await patchLead({ status: 'sold', converted: true } as any);
    if (success) {
      toast.success('Marked as sold');
    }
  }

  async function handleRemoveLead() {
    if (!confirm('Are you sure you want to remove this lead? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        toast.success('Lead removed');
        onClose();
        onSaved();
      } else {
        toast.error(data.error || 'Failed to remove');
      }
    } catch {
      toast.error('Failed to remove');
    }
  }

  async function handleSaveNotes() {
    const success = await patchLead({ notes });
    if (success) {
      setNotesChanged(false);
      toast.success('Notes saved');
    }
  }

  const leadTags = Array.isArray(lead.tags) ? lead.tags : [];

  return (
    <div className="border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-80 flex flex-col h-full overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Contact Info
          </h3>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            contactType === 'client'
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
              : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600'
          }`}>
            {contactType === 'client' ? 'Client' : 'Lead'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Contact Fields */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <EditableField
              label="First Name"
              value={lead.first_name || ''}
              onSave={(val) => handleFieldSave('first_name', val)}
            />
            <EditableField
              label="Last Name"
              value={lead.last_name || ''}
              onSave={(val) => handleFieldSave('last_name', val)}
            />
          </div>
          <EditableField
            label="Phone"
            value={lead.phone || ''}
            onSave={(val) => handleFieldSave('phone', val)}
          />
          <EditableField
            label="Email"
            value={lead.email || ''}
            onSave={(val) => handleFieldSave('email', val)}
          />
          <div className="grid grid-cols-2 gap-3">
            <EditableField
              label="State"
              value={lead.state || ''}
              onSave={(val) => handleFieldSave('state', val)}
            />
            <EditableField
              label="Zip Code"
              value={lead.zip_code || ''}
              onSave={(val) => handleFieldSave('zip_code', val)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleMarkSold}
            disabled={saving || lead.status === 'sold'}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              lead.status === 'sold'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 border border-emerald-200 dark:border-emerald-800 cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            {lead.status === 'sold' ? 'Sold' : 'Mark as Sold'}
          </button>
          <button
            onClick={handleRemoveLead}
            disabled={saving}
            className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            Remove
          </button>
        </div>

        {/* Tags */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 block">
            Tags
            {saving && <span className="ml-1 text-sky-500">saving...</span>}
          </label>
          {availableTags.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No tags created yet. Visit Tags page to create some.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map(tag => {
                const selected = leadTags.includes(tag.name);
                const isPrimary = lead.primary_tag === tag.name;
                return (
                  <div key={tag.id} className="flex items-center">
                    <button
                      onClick={() => handleTagToggle(tag.name)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        selected
                          ? 'ring-1 ring-opacity-50'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: selected ? `${tag.color}20` : `${tag.color}10`,
                        color: tag.color,
                        borderColor: selected ? tag.color : 'transparent',
                        boxShadow: selected ? `0 0 0 1px ${tag.color}` : undefined,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                    {selected && (
                      <button
                        onClick={() => handlePrimaryTag(tag.name)}
                        className={`ml-0.5 p-0.5 rounded transition-colors ${
                          isPrimary
                            ? 'text-amber-500'
                            : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                        }`}
                        title={isPrimary ? 'Remove as primary tag' : 'Set as primary tag'}
                      >
                        <Star className={`w-3 h-3 ${isPrimary ? 'fill-amber-500' : ''}`} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesChanged(true); }}
            placeholder="Add notes about this contact..."
            rows={4}
            className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-sky-500 resize-none"
          />
          {notesChanged && (
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="mt-1.5 px-3 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <Save className="w-3 h-3" />
              Save Notes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
