const BASE_URL = 'https://api.instantly.ai/api/v2';

export class InstantlyClient {
  constructor(private apiKey: string) {}

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Instantly API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json();
  }

  // Campaigns
  async listCampaigns(limit = 50) {
    return this.request<{ items: Array<{ id: string; name: string; status: number; timestamp_created: string }>; next_starting_after?: string }>(
      'GET', '/campaigns', undefined, { limit: String(limit) }
    );
  }

  // Emails
  async listEmails(params: {
    campaign_id?: string;
    email_type?: string;
    limit?: number;
    starting_after?: string;
  }) {
    const queryParams: Record<string, string> = {};
    if (params.campaign_id) queryParams.campaign_id = params.campaign_id;
    if (params.email_type) queryParams.email_type = params.email_type;
    if (params.limit) queryParams.limit = String(params.limit);
    if (params.starting_after) queryParams.starting_after = params.starting_after;

    return this.request<{ items: Array<Record<string, unknown>>; next_starting_after?: string }>(
      'GET', '/emails', undefined, queryParams
    );
  }

  // Get emails in a thread
  async getThreadEmails(threadId: string) {
    return this.request<{ items: Array<Record<string, unknown>> }>(
      'GET', '/emails', undefined, { thread_id: threadId, limit: '50' }
    );
  }

  // Send reply
  async sendReply(params: {
    eaccount: string;
    reply_to_uuid: string;
    subject: string;
    body: { text?: string; html?: string };
  }) {
    return this.request<{ status: string; id?: string }>(
      'POST', '/emails/reply', {
        eaccount: params.eaccount,
        reply_to_uuid: params.reply_to_uuid,
        subject: params.subject,
        ...params.body,
      }
    );
  }

  // Add lead to campaign
  async addLead(params: {
    campaign_id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
  }) {
    return this.request<Record<string, unknown>>(
      'POST', '/leads', {
        campaign_id: params.campaign_id,
        email: params.email,
        first_name: params.first_name,
        last_name: params.last_name,
        company_name: params.company_name,
      }
    );
  }

  // Accounts
  async listAccounts(limit = 50) {
    return this.request<{ items: Array<{ email: string; status: number }> }>(
      'GET', '/email-accounts', undefined, { limit: String(limit) }
    );
  }
}

export function createClient(): InstantlyClient {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error('INSTANTLY_API_KEY not set');
  return new InstantlyClient(key);
}
