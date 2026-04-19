'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Save, Send, Check, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface MemoryFile {
  filename: string;
  content: string;
}

interface MemoryUpdate {
  id: number;
  feedback_source: string;
  feedback_text: string;
  target_file: string;
  original_content: string;
  proposed_content: string;
  reason: string;
  status: string;
  created_at: string;
  applied_at: string | null;
}

const tabLabels: Record<string, string> = {
  'voice-and-tone.md': 'Voice & Tone',
  'company-context.md': 'Company',
  'common-objections.md': 'Objections',
  'dos-and-donts.md': 'Rules',
  'example-replies.md': 'Examples',
};

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Feedback state
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Memory updates state
  const [pendingUpdates, setPendingUpdates] = useState<MemoryUpdate[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<MemoryUpdate[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Record<number, boolean>>({});

  const loadFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      toast.error('Failed to load memory files');
    }
  }, []);

  const loadUpdates = useCallback(async () => {
    try {
      const [pendingRes, recentRes] = await Promise.all([
        fetch('/api/memory/updates?status=pending'),
        fetch('/api/memory/updates?status=approved'),
      ]);
      const pendingData = await pendingRes.json();
      const recentData = await recentRes.json();
      setPendingUpdates(pendingData.items || []);
      setRecentUpdates((recentData.items || []).slice(0, 10));
    } catch {
      // Updates might not be available yet (table not created)
    }
  }, []);

  useEffect(() => {
    async function load() {
      await Promise.all([loadFiles(), loadUpdates()]);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (filename: string) => {
    setSaving(prev => ({ ...prev, [filename]: true }));
    try {
      await fetch('/api/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          content: edited[filename] ?? files.find(f => f.filename === filename)?.content ?? '',
        }),
      });
      toast.success('Saved');
      await loadFiles();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(prev => ({ ...prev, [filename]: false }));
    }
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/memory/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedbackText }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else if (data.proposals?.length === 0) {
        toast.info('No memory updates needed for this feedback.');
      } else {
        toast.success(`${data.proposals.length} update${data.proposals.length > 1 ? 's' : ''} proposed`);
        setFeedbackText('');
        await loadUpdates();
      }
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleUpdateAction = async (updateId: number, action: 'approve' | 'reject') => {
    setActionLoading(prev => ({ ...prev, [updateId]: true }));
    try {
      const res = await fetch(`/api/memory/updates/${updateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(
          action === 'approve'
            ? `Updated ${tabLabels[data.target_file] || data.target_file}`
            : 'Update rejected'
        );
        await Promise.all([loadFiles(), loadUpdates()]);
        // Reset edited state for the affected file so user sees the updated content
        if (action === 'approve' && data.target_file) {
          setEdited(prev => {
            const next = { ...prev };
            delete next[data.target_file];
            return next;
          });
        }
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setActionLoading(prev => ({ ...prev, [updateId]: false }));
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-6">Memory</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Memory</h1>
        <p className="text-sm text-muted-foreground mt-1">
          These files are fed to the AI when generating replies. Give feedback or edit directly.
        </p>
      </div>

      {/* General Feedback Input */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <Input
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="e.g., 'stop using the word audit' or 'we also offer workshops now'"
              className="text-sm"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFeedback(); } }}
              disabled={feedbackLoading}
            />
            <Button
              size="sm"
              onClick={submitFeedback}
              disabled={feedbackLoading || !feedbackText.trim()}
            >
              <Send className="h-3 w-3 mr-1" />
              {feedbackLoading ? 'Analyzing...' : 'Feedback'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Updates */}
      {pendingUpdates.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-medium">Pending Updates ({pendingUpdates.length})</h2>
          {pendingUpdates.map(update => (
            <Card key={update.id}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {tabLabels[update.target_file] || update.target_file}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{update.reason}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleUpdateAction(update.id, 'approve')}
                      disabled={actionLoading[update.id]}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUpdateAction(update.id, 'reject')}
                      disabled={actionLoading[update.id]}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3 px-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Feedback: &ldquo;{update.feedback_text}&rdquo;
                </p>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
                  onClick={() => setExpandedDiffs(prev => ({ ...prev, [update.id]: !prev[update.id] }))}
                >
                  {expandedDiffs[update.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expandedDiffs[update.id] ? 'Hide diff' : 'Show diff'}
                </button>
                {expandedDiffs[update.id] && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Before</p>
                      <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                        {update.original_content}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">After</p>
                      <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto">
                        {update.proposed_content}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          <Separator />
        </div>
      )}

      {/* Recent Updates Changelog */}
      {recentUpdates.length > 0 && (
        <div className="mb-6">
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
            onClick={() => setShowRecent(!showRecent)}
          >
            {showRecent ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Recent updates ({recentUpdates.length})
          </button>
          {showRecent && (
            <div className="space-y-1 mb-4">
              {recentUpdates.map(update => (
                <div key={update.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <Badge variant="outline" className="text-xs shrink-0">
                    {tabLabels[update.target_file] || update.target_file}
                  </Badge>
                  <span className="truncate">{update.reason}</span>
                  <span className="shrink-0">{update.applied_at ? new Date(update.applied_at).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* File Editor Tabs */}
      <Tabs defaultValue={files[0]?.filename}>
        <TabsList>
          {files.map(f => (
            <TabsTrigger key={f.filename} value={f.filename} className="text-xs">
              {tabLabels[f.filename] || f.filename}
            </TabsTrigger>
          ))}
        </TabsList>
        {files.map(f => (
          <TabsContent key={f.filename} value={f.filename} className="mt-4">
            <Textarea
              value={edited[f.filename] ?? f.content}
              onChange={e => setEdited(prev => ({ ...prev, [f.filename]: e.target.value }))}
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={() => save(f.filename)} disabled={saving[f.filename]}>
                <Save className="h-3 w-3 mr-1" />
                {saving[f.filename] ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
