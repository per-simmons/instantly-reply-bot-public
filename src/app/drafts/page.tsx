'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Check, X, RefreshCw, MessageSquare, Send, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Draft {
  id: number;
  email_id: string;
  campaign_id: string | null;
  to_address: string;
  from_address: string;
  subject: string | null;
  body_text: string | null;
  status: string;
  ai_reasoning: string | null;
  ai_classification: string | null;
  scheduled_send_at: string | null;
  created_at: string;
  inbound_body: string | null;
  inbound_from: string | null;
  inbound_subject: string | null;
}

function TimeUntil({ date }: { date: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const target = new Date(date).getTime();
  const diff = Math.max(0, Math.floor((target - now) / 1000));
  const min = Math.floor(diff / 60);
  const sec = diff % 60;
  if (diff <= 0) return <span className="text-xs text-muted-foreground">Sending...</span>;
  return <span className="text-xs text-muted-foreground">{min}:{sec.toString().padStart(2, '0')}</span>;
}

function extractName(email: string): string {
  const local = email.split('@')[0] || email;
  return local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function classificationColor(c: string | null): string {
  switch (c) {
    case 'positive_interest': return 'text-emerald-600';
    case 'soft_positive': return 'text-emerald-500';
    case 'information_request': return 'text-blue-600';
    case 'objection': return 'text-amber-600';
    case 'not_interested': return 'text-red-500';
    case 'bad_timing': return 'text-orange-500';
    case 'wrong_person': return 'text-violet-500';
    case 'out_of_office': return 'text-muted-foreground';
    default: return 'text-muted-foreground';
  }
}

function classificationLabel(c: string | null): string {
  switch (c) {
    case 'positive_interest': return 'Interested';
    case 'soft_positive': return 'Warm';
    case 'information_request': return 'Question';
    case 'objection': return 'Objection';
    case 'not_interested': return 'Not Interested';
    case 'bad_timing': return 'Bad Timing';
    case 'wrong_person': return 'Wrong Person';
    case 'out_of_office': return 'OOO';
    default: return c?.replace(/_/g, ' ') || '';
  }
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editedBodies, setEditedBodies] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const [rejectDraftId, setRejectDraftId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  const selected = drafts.find(d => d.id === selectedId) || null;

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/drafts?status=${filter}`);
      const data = await res.json();
      const items = (data.items || []).filter((d: Draft) => !d.email_id?.startsWith('test_'));
      setDrafts(items);
      if (items.length > 0 && !selectedId) setSelectedId(items[0].id);
    } catch {
      toast.error('Failed to load drafts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrafts(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (draftId: number, action: 'approve' | 'reject') => {
    setActionLoading(prev => ({ ...prev, [draftId]: true }));
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, edited_body: editedBodies[draftId] || undefined }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); }
      else {
        toast.success(action === 'approve' ? 'Reply sent' : 'Draft rejected');
        setDrafts(prev => prev.filter(d => d.id !== draftId));
        setSelectedId(null);
      }
    } catch { toast.error('Action failed'); }
    finally { setActionLoading(prev => ({ ...prev, [draftId]: false })); }
  };

  const handleRegenerate = async (emailId: string, draftId: number) => {
    setActionLoading(prev => ({ ...prev, [draftId]: true }));
    try {
      const res = await fetch('/api/bot/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: emailId }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); }
      else { toast.success('Reply regenerated'); fetchDrafts(); }
    } catch { toast.error('Regeneration failed'); }
    finally { setActionLoading(prev => ({ ...prev, [draftId]: false })); }
  };

  const handleRejectAndLearn = async () => {
    if (!rejectDraftId || !rejectReason.trim()) return;
    setRejectLoading(true);
    try {
      const res = await fetch(`/api/drafts/${rejectDraftId}/reject-and-learn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); }
      else {
        toast.success('Learned and regenerated');
        setRejectDraftId(null); setRejectReason('');
        setSelectedId(null); fetchDrafts();
      }
    } catch { toast.error('Failed'); }
    finally { setRejectLoading(false); }
  };

  const submitFeedback = async () => {
    if (!selected || !feedbackText.trim()) return;
    setFeedbackLoading(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: selected.id, rating: -1,
          comment: feedbackText,
          corrected_body: editedBodies[selected.id] || null,
        }),
      });
      toast.success('Feedback submitted');
      setFeedbackOpen(false); setFeedbackText('');
    } catch { toast.error('Failed'); }
    finally { setFeedbackLoading(false); }
  };

  const filters = ['pending', 'sent', 'rejected', 'all'];

  if (loading) {
    return (
      <div className="flex h-screen -m-6">
        <div className="w-[320px] border-r p-3 space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
        <div className="flex-1 p-8"><Skeleton className="h-48 w-full rounded-lg" /></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen -m-6">
      {/* ──── Left: Message List ──── */}
      <div className="w-[320px] border-r flex flex-col bg-background">
        {/* Filter tabs */}
        <div className="px-3 pt-3 pb-2 border-b">
          <div className="flex gap-0.5">
            {filters.map(f => (
              <button key={f} onClick={() => { setFilter(f); setSelectedId(null); }}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md transition-colors capitalize',
                  filter === f ? 'bg-foreground text-background font-medium' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {drafts.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No drafts found.</p>
          ) : (
            drafts.map(draft => (
              <button key={draft.id} onClick={() => setSelectedId(draft.id)}
                className={cn(
                  'w-full text-left px-3 py-3 rounded-lg transition-all',
                  selectedId === draft.id
                    ? 'bg-muted ring-1 ring-border'
                    : 'hover:bg-muted/50'
                )}
              >
                {/* Row 1: Name + Date */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {draft.ai_classification && (
                      <Zap className={cn('h-3 w-3 shrink-0', classificationColor(draft.ai_classification))} />
                    )}
                    <span className="text-[13px] font-medium truncate">
                      {extractName(draft.inbound_from || draft.to_address)}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDate(draft.created_at)}
                  </span>
                </div>

                {/* Row 2: Subject */}
                <p className="text-xs text-muted-foreground truncate mt-1 pl-[18px]">
                  {draft.inbound_subject || draft.subject}
                </p>

                {/* Row 3: Body preview */}
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5 pl-[18px]">
                  {(draft.inbound_body || '').substring(0, 80)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ──── Right: Conversation ──── */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a conversation</p>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {(selected.inbound_from || selected.to_address).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold">{selected.inbound_from || selected.to_address}</div>
                  {selected.ai_classification && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Zap className={cn('h-3 w-3', classificationColor(selected.ai_classification))} />
                      <span className={cn('text-xs font-medium', classificationColor(selected.ai_classification))}>
                        {classificationLabel(selected.ai_classification)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <Badge variant={selected.status === 'sent' ? 'default' : 'outline'} className="text-xs">
                {selected.status}
              </Badge>
            </div>

            {/* ── Thread ── */}
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
                {/* AI Draft Reply */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Your draft reply</span>
                      {selected.status === 'scheduled' && selected.scheduled_send_at && (
                        <span className="ml-2"><TimeUntil date={selected.scheduled_send_at} /></span>
                      )}
                    </div>
                  </div>
                  {selected.status === 'pending' ? (
                    <Textarea
                      value={editedBodies[selected.id] ?? selected.body_text ?? ''}
                      onChange={e => setEditedBodies(prev => ({ ...prev, [selected.id]: e.target.value }))}
                      rows={5}
                      className="text-sm resize-y"
                    />
                  ) : (
                    <div className="p-4 rounded-lg border text-sm whitespace-pre-wrap leading-relaxed">
                      {selected.body_text}
                    </div>
                  )}
                  {selected.ai_reasoning && (
                    <p className="text-[11px] text-muted-foreground mt-2 italic leading-relaxed">
                      {selected.ai_reasoning}
                    </p>
                  )}
                </div>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-[11px] text-muted-foreground">their message</span>
                  </div>
                </div>

                {/* Inbound Email */}
                {selected.inbound_body && (
                  <div className="rounded-lg border">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <div className="text-xs">
                        <span className="font-medium">{extractName(selected.inbound_from || selected.to_address)}</span>
                        <span className="text-muted-foreground ml-1.5">
                          &lt;{selected.inbound_from || selected.to_address}&gt;
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(selected.created_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                        {' '}at{' '}
                        {new Date(selected.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="px-4 py-4 text-sm whitespace-pre-wrap leading-relaxed">
                      {selected.inbound_body}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Action Bar ── */}
            <div className="px-6 py-3 border-t bg-background">
              {selected.status === 'pending' && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => handleAction(selected.id, 'approve')}
                    disabled={actionLoading[selected.id]}>
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Send Reply
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => handleRegenerate(selected.email_id, selected.id)}
                    disabled={actionLoading[selected.id]}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { setRejectDraftId(selected.id); setRejectReason(''); }}
                    disabled={actionLoading[selected.id]}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Reject
                  </Button>

                  <div className="flex-1" />

                  <Button size="sm" variant="ghost" onClick={() => { setFeedbackOpen(true); setFeedbackText(''); }}
                    className="text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Feedback
                  </Button>
                </div>
              )}
              {selected.status === 'scheduled' && (
                <Button size="sm" variant="outline"
                  onClick={() => handleAction(selected.id, 'reject')}
                  disabled={actionLoading[selected.id]}>
                  <X className="h-3.5 w-3.5 mr-1.5" /> Cancel Send
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ──── Feedback Modal (portaled to body) ──── */}
      {feedbackOpen && selected && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={() => { if (!feedbackLoading) { setFeedbackOpen(false); setFeedbackText(''); } }}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-lg shadow-2xl border"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-1">Give feedback to the agent</h2>
            <p className="text-sm text-muted-foreground mb-4">
              This feedback will be routed to the right memory file. Check the Memory page to review proposed updates.
            </p>
            <Textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
              rows={4} className="text-sm mb-4"
              placeholder="e.g. too formal, don't mention pricing, keep it to 2 sentences, be more direct" autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setFeedbackOpen(false); setFeedbackText(''); }} disabled={feedbackLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitFeedback} disabled={feedbackLoading || !feedbackText.trim()}>
                {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ──── Reject & Learn Modal (portaled to body) ──── */}
      {rejectDraftId !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={() => { if (!rejectLoading) setRejectDraftId(null); }}>
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 w-full max-w-lg shadow-2xl border"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold mb-1">What should the agent fix?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The agent will update its memory and rewrite the reply based on your feedback.
            </p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              rows={4} className="text-sm mb-4"
              placeholder="e.g. too formal, don't mention pricing, keep it to 2 sentences, be more direct" autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setRejectDraftId(null)} disabled={rejectLoading}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRejectAndLearn} disabled={rejectLoading || !rejectReason.trim()}>
                {rejectLoading ? 'Rewriting...' : 'Reject & Rewrite'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
