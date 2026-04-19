'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Campaign {
  id: string;
  name: string;
  status: number;
  timestamp_created: string;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [monitored, setMonitored] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [campaignsRes, settingsRes] = await Promise.all([
          fetch('/api/instantly/campaigns'),
          fetch('/api/settings'),
        ]);
        const campaignsData = await campaignsRes.json();
        const settingsData = await settingsRes.json();

        if (campaignsData.error) {
          setError(campaignsData.error);
        } else {
          setCampaigns(campaignsData.items || []);
        }

        const m = settingsData.monitored_campaigns;
        setMonitored(m ? JSON.parse(m) : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggleCampaign = async (campaignId: string) => {
    const next = monitored.includes(campaignId)
      ? monitored.filter(id => id !== campaignId)
      : [...monitored, campaignId];

    setMonitored(next);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitored_campaigns: JSON.stringify(next) }),
    });
  };

  const statusLabel = (s: number) => {
    if (s === 1) return 'Active';
    if (s === 0) return 'Draft';
    if (s === 2) return 'Paused';
    if (s === 3) return 'Completed';
    return 'Unknown';
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold mb-6">Campaigns</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Campaigns</h1>

      {error && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">Check your Instantly API key in Settings.</p>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No campaigns found.</p>
      )}

      <div className="space-y-2">
        {campaigns.map(campaign => (
          <Card key={campaign.id}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={monitored.includes(campaign.id)}
                    onCheckedChange={() => toggleCampaign(campaign.id)}
                  />
                  <div>
                    <CardTitle className="text-sm font-medium">{campaign.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(campaign.timestamp_created).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={campaign.status === 1 ? 'default' : 'secondary'}>
                    {statusLabel(campaign.status)}
                  </Badge>
                  {monitored.includes(campaign.id) && (
                    <Badge variant="outline">Monitoring</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
