// Instantly API types
export interface Campaign {
  id: string;
  name: string;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface InstantlyEmail {
  id: string;
  thread_id: string;
  campaign_id: string;
  from_address_email: string;
  to_address_email: string;
  subject: string;
  body: {
    text: string;
    html: string;
  };
  timestamp_created: string;
  is_unread: boolean;
  email_type: string;
  eaccount: string;
  lead_email?: string;
}

export interface InstantlyAccount {
  email: string;
  first_name?: string;
  last_name?: string;
  status: number;
}

// Database types
export interface DBEmail {
  id: string;
  thread_id: string | null;
  campaign_id: string | null;
  from_address: string;
  to_address: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  lead_email: string | null;
  eaccount: string | null;
  timestamp_email: string;
  processed: number; // 0=new, 1=generating, 2=drafted, 3=sent, -1=skipped
  created_at: string;
}

export interface DBDraft {
  id: number;
  email_id: string;
  thread_id: string | null;
  campaign_id: string | null;
  to_address: string;
  from_address: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'scheduled';
  edited_body: string | null;
  ai_reasoning: string | null;
  ai_classification: string | null;
  created_at: string;
  scheduled_send_at: string | null;
  sent_at: string | null;
  instantly_reply_id: string | null;
  // joined fields
  inbound_body?: string | null;
  inbound_from?: string | null;
  inbound_subject?: string | null;
}

export interface DBFeedback {
  id: number;
  draft_id: number;
  rating: number; // 1=good, -1=bad
  comment: string | null;
  original_body: string | null;
  corrected_body: string | null;
  processed: number;
  created_at: string;
}

export interface DBSetting {
  key: string;
  value: string;
}

export interface PollResult {
  emails_found: number;
  drafts_created: number;
  auto_sent: number;
  errors: string[];
}

export interface DBMemoryUpdate {
  id: number;
  feedback_source: 'draft_feedback' | 'manual';
  feedback_text: string;
  draft_id: number | null;
  target_file: string;
  original_content: string;
  proposed_content: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  applied_at: string | null;
}

export interface AppSettings {
  mode: 'autonomous' | 'draft';
  polling_interval_seconds: number;
  monitored_campaigns: string[];
  bot_active: boolean;
}
