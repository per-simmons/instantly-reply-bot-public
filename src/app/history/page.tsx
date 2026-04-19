'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface SentDraft {
  id: number;
  to_address: string;
  from_address: string;
  subject: string | null;
  body_text: string | null;
  edited_body: string | null;
  sent_at: string | null;
  created_at: string;
  inbound_body: string | null;
  inbound_from: string | null;
  ai_classification: string | null;
  status: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<SentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDraft, setFeedbackDraft] = useState<number | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackCorrected, setFeedbackCorrected] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/drafts?status=sent');
        const data = await res.json();
        setHistory(data.items || []);
      } catch {
        toast.error('Failed to load history');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const submitFeedback = async (draftId: number, rating: number) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          rating,
          comment: feedbackComment || null,
          corrected_body: feedbackCorrected || null,
        }),
      });
      toast.success('Feedback saved — the bot will learn from this');
      setFeedbackDraft(null);
      setFeedbackComment('');
      setFeedbackCorrected('');
    } catch {
      toast.error('Failed to save feedback');
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-6">History</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">History</h1>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sent replies yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map(item => (
            <Card key={item.id}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">{item.inbound_from || item.to_address}</CardTitle>
                    <p className="text-xs text-muted-foreground">{item.subject} &middot; Sent {item.sent_at ? new Date(item.sent_at).toLocaleString() : ''}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {item.ai_classification && (
                      <Badge variant="outline" className="text-xs">
                        {item.ai_classification.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    <Badge variant="default">sent</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3 px-4">
                {item.inbound_body && (
                  <div className="mb-2 p-2 bg-muted rounded text-xs text-muted-foreground">
                    <span className="font-medium">They said:</span> {item.inbound_body.substring(0, 150)}{item.inbound_body.length > 150 ? '...' : ''}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap mb-3">{item.edited_body || item.body_text}</p>

                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => submitFeedback(item.id, 1)}>
                    <ThumbsUp className="h-3 w-3 mr-1" /> Good
                  </Button>
                  <Dialog open={feedbackDraft === item.id} onOpenChange={open => { if (!open) setFeedbackDraft(null); }}>
                    <DialogTrigger
                      render={<Button size="sm" variant="ghost" />}
                      onClick={() => { setFeedbackDraft(item.id); setFeedbackCorrected(item.edited_body || item.body_text || ''); }}
                    >
                      <ThumbsDown className="h-3 w-3 mr-1" /> Needs work
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-sm">Feedback</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground">What should it have said instead?</label>
                          <Textarea
                            value={feedbackCorrected}
                            onChange={e => setFeedbackCorrected(e.target.value)}
                            rows={4}
                            className="mt-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Any notes? (optional)</label>
                          <Textarea
                            value={feedbackComment}
                            onChange={e => setFeedbackComment(e.target.value)}
                            rows={2}
                            className="mt-1 text-sm"
                            placeholder="e.g. too aggressive, don't mention pricing"
                          />
                        </div>
                        <Button size="sm" onClick={() => submitFeedback(item.id, -1)}>
                          Submit Feedback
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
