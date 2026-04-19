'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface BotStatus {
  bot_active: boolean;
  mode: string;
  polling_interval: number;
  last_poll: { completed_at: string; emails_found: number; drafts_created: number; error: string | null } | null;
  stats: { pending_drafts: number; total_sent: number; sent_today: number };
}

export default function Dashboard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/status');
      const data = await res.json();
      setStatus(data);
    } catch {
      // silently fail
    }
  }, []);

  const toggleBot = async () => {
    if (!status) return;
    const newState = !status.bot_active;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_active: String(newState) }),
    });
    setStatus(prev => prev ? { ...prev, bot_active: newState } : prev);
  };

  const triggerPoll = async () => {
    setPolling(true);
    try {
      await fetch('/api/bot/poll', { method: 'POST' });
      await fetchStatus();
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // Auto-poll when bot is active
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    if (status?.bot_active) {
      const interval = (status.polling_interval || 60) * 1000;
      pollInterval = setInterval(async () => {
        await fetch('/api/bot/poll', { method: 'POST' }).catch(() => {});
        fetchStatus();
      }, interval);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [status?.bot_active, status?.polling_interval, fetchStatus]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="bot-toggle" className="text-sm">Bot</Label>
            <Switch
              id="bot-toggle"
              checked={status?.bot_active || false}
              onCheckedChange={toggleBot}
            />
            <Badge variant={status?.bot_active ? 'default' : 'secondary'}>
              {status?.bot_active ? 'Running' : 'Paused'}
            </Badge>
          </div>
          <Badge variant="outline">{status?.mode || 'draft'} mode</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{status?.stats.pending_drafts ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{status?.stats.sent_today ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{status?.stats.total_sent ?? '-'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Polling</CardTitle>
            <Button size="sm" variant="outline" onClick={triggerPoll} disabled={polling}>
              {polling ? 'Polling...' : 'Poll Now'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {status?.last_poll ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Last poll: {new Date(status.last_poll.completed_at).toLocaleString()}</p>
              <p>Emails found: {status.last_poll.emails_found} | Drafts created: {status.last_poll.drafts_created}</p>
              {status.last_poll.error && (
                <p className="text-destructive">Error: {status.last_poll.error}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No polls yet. Click &quot;Poll Now&quot; or activate the bot.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
