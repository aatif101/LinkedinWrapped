export type Contact = {
  id: string;            // stable hash of url || (name + company + connectedAt)
  name: string;          // "First Last"
  title?: string;        // Position
  company?: string;      // Company
  location?: string;     // from Connections if present
  connectedAt?: string;  // ISO 8601 (UTC) or ""
  url?: string;          // profile URL if present
}

export type Message = {
  id: string;            // stable hash of threadId + ts + content[:40]
  threadId: string;      // CONVERSATION ID if present; else see fallback rules
  meOrThem: 'me' | 'them'; // FROM contains "You" => 'me' else 'them' (case-insensitive)
  otherId?: string;      // first URL from RECIPIENT PROFILE URLS, else SENDER PROFILE URL when them; else ""
  body: string;          // CONTENT
  ts: string;            // ISO 8601 (UTC) or ""
}

export type Invite = {
  id: string;            // stable hash of direction + counterpartName + ts
  direction: 'sent' | 'received';
  counterpartName: string; 
  counterpartTitle?: string;
  counterpartCompany?: string;
  status?: 'accepted' | 'pending' | 'ignored' | 'unknown'; // default 'unknown'
  message?: string;      // Message
  ts: string;            // ISO 8601 (UTC) or ""
}

export type CompanyFollow = {
  id: string;            // stable hash of company + ts
  company: string;
  ts: string;            // ISO 8601 (UTC) or ""
}

export type SavedJob = {
  id: string;            // stable hash of company + title + ts
  company: string;
  title: string;
  ts: string;            // ISO 8601 (UTC) or ""
}

export type ParsedPayload = {
  contacts: Contact[];
  messages: Message[];
  invites: Invite[];
  companyFollows: CompanyFollow[];
  savedJobs: SavedJob[]; // includes Job Applications normalized to this shape
  summary: {
    filesProcessed: string[];        // canonical names like ["Connections","messages",...]
    rows: Record<string, number>;    // counts per file type
    warnings: string[];              // header anomalies, dropped rows, bad dates, etc.
  }
}
