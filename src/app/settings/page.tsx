'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        setSettings(data);
      } catch {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  };

  const testInstantly = async () => {
    setTesting(prev => ({ ...prev, instantly: true }));
    try {
      const res = await fetch('/api/instantly/campaigns');
      const data = await res.json();
      if (data.error) {
        toast.error(`Instantly: ${data.error}`);
      } else {
        toast.success(`Instantly connected — ${(data.items || []).length} campaigns found`);
      }
    } catch {
      toast.error('Instantly connection failed');
    } finally {
      setTesting(prev => ({ ...prev, instantly: false }));
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-6">Settings</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Settings</h1>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">API Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              API keys are stored in your .env.local file. Restart the server after changing them.
            </p>
            <Button size="sm" variant="outline" onClick={testInstantly} disabled={testing.instantly}>
              {testing.instantly ? 'Testing...' : 'Test Instantly Connection'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Bot Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Autonomous Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {settings.mode === 'autonomous'
                    ? 'Replies are scheduled to send automatically after a delay'
                    : 'Replies are queued as drafts for your approval'}
                </p>
              </div>
              <Switch
                checked={settings.mode === 'autonomous'}
                onCheckedChange={checked => saveSetting('mode', checked ? 'autonomous' : 'draft')}
              />
            </div>
            {settings.mode === 'autonomous' && (
              <div className="flex items-center gap-3 pt-2">
                <Label className="text-sm whitespace-nowrap">Send delay (seconds)</Label>
                <Input
                  type="number"
                  value={settings.auto_send_delay_seconds || '300'}
                  onChange={e => saveSetting('auto_send_delay_seconds', e.target.value)}
                  className="w-24"
                  min={0}
                  max={3600}
                />
                <span className="text-xs text-muted-foreground">
                  {Math.floor(parseInt(settings.auto_send_delay_seconds || '300', 10) / 60)} min
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Polling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Interval (seconds)</Label>
              <Input
                type="number"
                value={settings.polling_interval_seconds || '60'}
                onChange={e => saveSetting('polling_interval_seconds', e.target.value)}
                className="w-24"
                min={10}
                max={600}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When active, the bot polls for new replies automatically
                </p>
              </div>
              <Switch
                checked={settings.bot_active === 'true'}
                onCheckedChange={checked => saveSetting('bot_active', String(checked))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
