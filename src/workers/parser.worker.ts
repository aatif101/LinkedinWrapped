import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { ParsedPayload, Contact, Message, Invite, CompanyFollow, SavedJob } from '../types/parser';

// SHA-1 based deterministic hash function
async function stableHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12); // Use first 12 chars for shorter IDs
}

// Normalize text: trim, collapse spaces, remove BOM
function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/^\uFEFF/, '') // Remove BOM
    .trim()
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

// Parse timestamps to ISO 8601 UTC
function parseTimestamp(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    // Strip literal "UTC" if present
    let cleanDate = dateStr.replace(/\s+UTC$/i, '').trim();
    
    // Try to parse the date
    const date = new Date(cleanDate);
    
    if (isNaN(date.getTime())) {
      return '';
    }
    
    return date.toISOString();
  } catch {
    return '';
  }
}

// Get day bucket for threadId fallback
function getDayBucket(ts: string): string {
  if (!ts) return 'unknown';
  try {
    return new Date(ts).toISOString().split('T')[0];
  } catch {
    return 'unknown';
  }
}

// Header alias matching
function findHeaderIndex(headers: string[], aliases: (string | RegExp)[]): number {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    for (const alias of aliases) {
      if (alias instanceof RegExp) {
        if (alias.test(header)) return i;
      } else {
        if (header === alias) return i;
      }
    }
  }
  return -1;
}

// Get value by header aliases
function getValueByAliases(row: any[], headers: string[], aliases: (string | RegExp)[]): string {
  const index = findHeaderIndex(headers, aliases);
  return index >= 0 ? normalizeText(row[index]) : '';
}

// Parse CSV content
function parseCSV(content: string): any[] {
  const result = Papa.parse(content, {
    header: false, // We'll handle headers manually
    skipEmptyLines: false, // We need to see all rows for header detection
    transform: (value) => normalizeText(value)
  });
  
  return result.data as any[];
}

// Parse XLSX content
function parseXLSX(buffer: ArrayBuffer): any[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: ''
  }) as any[][];
  
  return jsonData.map(row => 
    row.map((cell: any) => normalizeText(String(cell || '')))
  );
}

// Extract files from ZIP
async function extractZipFiles(zipFile: File): Promise<{ name: string; content: string | ArrayBuffer }[]> {
  const zip = new JSZip();
  const zipContent = await zipFile.arrayBuffer();
  const zipData = await zip.loadAsync(zipContent);
  
  const extractedFiles: { name: string; content: string | ArrayBuffer }[] = [];
  
  for (const [fileName, fileData] of Object.entries(zipData.files)) {
    if (fileData.dir) continue; // Skip directories
    
    const lowerName = fileName.toLowerCase();
    
    // Check if this is a messages file
    if (lowerName.includes('messages')) {
      // Only process canonical messages.csv file
      const basename = fileName.split('/').pop()?.toLowerCase() || '';
      const isCanonicalMessages = basename === 'messages.csv' || fileName.toLowerCase().endsWith('/messages.csv');
      
      if (!isCanonicalMessages) {
        // Skip auxiliary message files - we'll add warning later in processing
        continue;
      }
    }
    
    // Only extract recognized LinkedIn export files
    const isRelevantFile = [
      'connections', 'messages', 'invitations', 
      'company follows', 'saved jobs', 'job applications'
    ].some(pattern => lowerName.includes(pattern));
    
    if (isRelevantFile) {
      try {
        if (fileName.endsWith('.csv')) {
          const content = await fileData.async('text');
          extractedFiles.push({ name: fileName, content });
        } else if (fileName.endsWith('.xlsx')) {
          const content = await fileData.async('arraybuffer');
          extractedFiles.push({ name: fileName, content });
        }
      } catch (error) {
        console.warn(`Failed to extract ${fileName}:`, error);
      }
    }
  }
  
  return extractedFiles;
}

// Process Connections file with robust header detection
async function processConnections(rawData: any[], warnings: string[], fileName: string): Promise<Contact[]> {
  const contacts: Contact[] = [];
  
  // Find header row by looking for "First Name"
  let headerRowIndex = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (Array.isArray(row)) {
      const hasFirstName = row.some(cell => normalizeText(cell) === 'First Name');
      if (hasFirstName) {
        headerRowIndex = i;
        headers = row.map(cell => normalizeText(cell));
        break;
      }
    }
  }
  
  if (headerRowIndex === -1) {
    warnings.push(`Connections: Could not find header row with "First Name" in ${fileName}`);
    return contacts;
  }
  
  const dataRows = rawData.slice(headerRowIndex + 1).filter(row => 
    Array.isArray(row) && row.some(cell => normalizeText(cell))
  );
  
  // Diagnostics
  warnings.push(`Connections: Detected headers: ${headers.join(' | ')}`);
  warnings.push(`Connections: ${dataRows.length} data rows found in ${fileName}`);
  
  // Header aliases
  const aliases = {
    firstName: ["First Name"],
    lastName: ["Last Name"],
    url: ["URL", "Profile URL"],
    email: ["Email Address", "Email"],
    company: ["Company", "Company Name"],
    position: ["Position", "Title", "Job Title"],
    connected: ["Connected On", "Connected on", "Connected"],
    location: ["Location", "City", "City, State", "City/Region"]
  };
  
  let processedCount = 0;
  for (const row of dataRows) {
    const firstName = getValueByAliases(row, headers, aliases.firstName);
    const lastName = getValueByAliases(row, headers, aliases.lastName);
    const url = getValueByAliases(row, headers, aliases.url);
    const email = getValueByAliases(row, headers, aliases.email);
    const company = getValueByAliases(row, headers, aliases.company);
    const position = getValueByAliases(row, headers, aliases.position);
    const connectedOn = getValueByAliases(row, headers, aliases.connected);
    const location = getValueByAliases(row, headers, aliases.location);
    
    // Don't drop rows with missing fields, just use defaults
    const name = `${firstName} ${lastName}`.trim() || 'Unknown';
    const connectedAt = parseTimestamp(connectedOn);
    
    if (connectedOn && !connectedAt) {
      warnings.push(`Connections: Could not parse date "${connectedOn}"`);
    }
    
    const idSource = url || `${name}|${company}|${connectedAt}`;
    const id = await stableHash(idSource);
    
    contacts.push({
      id,
      name,
      title: position || undefined,
      company: company || undefined,
      location: location || undefined,
      connectedAt,
      url: url || undefined
    });
    
    processedCount++;
  }
  
  warnings.push(`Connections: ${processedCount} contacts processed from ${fileName}`);
  return contacts;
}

// Process Messages file with robust header detection
async function processMessages(rawData: any[], warnings: string[], fileName: string): Promise<Message[]> {
  const messages: Message[] = [];
  
  if (rawData.length < 2) {
    warnings.push(`Messages: Insufficient data in ${fileName}`);
    return messages;
  }
  
  const headers = rawData[0].map((cell: any) => normalizeText(cell));
  const dataRows = rawData.slice(1).filter(row => 
    Array.isArray(row) && row.some(cell => normalizeText(cell))
  );
  
  // Diagnostics
  warnings.push(`Messages: Detected headers: ${headers.join(' | ')}`);
  warnings.push(`Messages: ${dataRows.length} data rows found in ${fileName}`);
  
  // Header aliases (case-insensitive regex)
  const aliases = {
    convoId: [/^CONVERSATION ID$/i],
    from: [/^FROM$/i],
    to: [/^TO$/i],
    fromUrl: [/SENDER PROFILE URL/i],
    toUrls: [/RECIPIENT PROFILE URLS?/i],
    date: [/^DATE$/i, /Sent On/i],
    content: [/^CONTENT$/i, /Message/i]
  };
  
  let processedCount = 0;
  for (const row of dataRows) {
    const conversationId = getValueByAliases(row, headers, aliases.convoId);
    const from = getValueByAliases(row, headers, aliases.from);
    const to = getValueByAliases(row, headers, aliases.to);
    const senderUrl = getValueByAliases(row, headers, aliases.fromUrl);
    const recipientUrls = getValueByAliases(row, headers, aliases.toUrls);
    const date = getValueByAliases(row, headers, aliases.date);
    const content = getValueByAliases(row, headers, aliases.content);
    
    if (!content) {
      continue; // Skip empty messages
    }
    
    const ts = parseTimestamp(date);
    if (date && !ts) {
      warnings.push(`Messages: Could not parse date "${date}"`);
    }
    
    // Determine meOrThem (case-insensitive)
    const meOrThem = from.toLowerCase().includes('you') ? 'me' : 'them';
    
    // Determine threadId
    let threadId: string;
    if (conversationId) {
      threadId = conversationId;
    } else {
      // Fallback logic
      const recipients = recipientUrls.split(',').map(url => normalizeText(url)).filter(Boolean);
      
      if (recipients.length === 1) {
        threadId = await stableHash(recipients[0]);
      } else if (recipients.length > 1) {
        const sortedUrls = recipients.sort().join('|');
        threadId = await stableHash(sortedUrls);
      } else {
        const participant = to || from;
        const dayBucket = getDayBucket(ts);
        threadId = await stableHash(`${participant}|${dayBucket}`);
      }
    }
    
    // Determine otherId
    let otherId = '';
    if (meOrThem === 'them') {
      otherId = senderUrl;
    } else {
      const recipients = recipientUrls.split(',').map(url => normalizeText(url)).filter(Boolean);
      otherId = recipients[0] || '';
    }
    
    const id = await stableHash(`${threadId}|${ts}|${content.substring(0, 40)}`);
    
    messages.push({
      id,
      threadId,
      meOrThem,
      otherId,
      body: content,
      ts
    });
    
    processedCount++;
  }
  
  warnings.push(`Messages: ${processedCount} messages processed from ${fileName}`);
  return messages;
}

// Process Invitations file with robust header detection
async function processInvitations(rawData: any[], warnings: string[], fileName: string): Promise<Invite[]> {
  const invites: Invite[] = [];
  
  if (rawData.length < 2) {
    warnings.push(`Invitations: Insufficient data in ${fileName}`);
    return invites;
  }
  
  const headers = rawData[0].map((cell: any) => normalizeText(cell));
  const dataRows = rawData.slice(1).filter(row => 
    Array.isArray(row) && row.some(cell => normalizeText(cell))
  );
  
  // Diagnostics
  warnings.push(`Invitations: Detected headers: ${headers.join(' | ')}`);
  warnings.push(`Invitations: ${dataRows.length} data rows found in ${fileName}`);
  
  // Header aliases
  const aliases = {
    from: ["From"],
    to: ["To"],
    sentAt: ["Sent At", "Date", "Sent On"],
    message: ["Message", "Note"],
    direction: ["Direction", "Type"],
    inviterUrl: ["inviterProfileUrl", "Inviter Profile URL"],
    inviteeUrl: ["inviteeProfileUrl", "Invitee Profile URL"]
  };
  
  let processedCount = 0;
  for (const row of dataRows) {
    const from = getValueByAliases(row, headers, aliases.from);
    const to = getValueByAliases(row, headers, aliases.to);
    const sentAt = getValueByAliases(row, headers, aliases.sentAt);
    const message = getValueByAliases(row, headers, aliases.message);
    const direction = getValueByAliases(row, headers, aliases.direction);
    
    if (!from && !to) {
      continue; // Skip rows with no participants
    }
    
    const ts = parseTimestamp(sentAt);
    if (sentAt && !ts) {
      warnings.push(`Invitations: Could not parse date "${sentAt}"`);
    }
    
    // Determine direction
    let inviteDirection: 'sent' | 'received';
    if (direction.toLowerCase().includes('outgoing')) {
      inviteDirection = 'sent';
    } else if (direction.toLowerCase().includes('incoming')) {
      inviteDirection = 'received';
    } else {
      inviteDirection = from.toLowerCase().includes('you') ? 'sent' : 'received';
    }
    
    const counterpartName = inviteDirection === 'sent' ? to : from;
    const id = await stableHash(`${inviteDirection}|${counterpartName}|${ts}`);
    
    invites.push({
      id,
      direction: inviteDirection,
      counterpartName,
      status: 'unknown',
      message: message || undefined,
      ts
    });
    
    processedCount++;
  }
  
  warnings.push(`Invitations: ${processedCount} invitations processed from ${fileName}`);
  return invites;
}

// Process Company Follows file with robust header detection
async function processCompanyFollows(rawData: any[], warnings: string[], fileName: string): Promise<CompanyFollow[]> {
  const follows: CompanyFollow[] = [];
  
  if (rawData.length < 2) {
    warnings.push(`Company Follows: Insufficient data in ${fileName}`);
    return follows;
  }
  
  const headers = rawData[0].map((cell: any) => normalizeText(cell));
  const dataRows = rawData.slice(1).filter(row => 
    Array.isArray(row) && row.some(cell => normalizeText(cell))
  );
  
  // Diagnostics
  warnings.push(`Company Follows: Detected headers: ${headers.join(' | ')}`);
  warnings.push(`Company Follows: ${dataRows.length} data rows found in ${fileName}`);
  
  // Header aliases
  const aliases = {
    org: ["Organization", "Company"],
    followed: ["Followed On", "Date"]
  };
  
  let processedCount = 0;
  for (const row of dataRows) {
    const organization = getValueByAliases(row, headers, aliases.org);
    const followedOn = getValueByAliases(row, headers, aliases.followed);
    
    if (!organization) {
      continue; // Skip rows with no organization
    }
    
    const ts = parseTimestamp(followedOn);
    if (followedOn && !ts) {
      warnings.push(`Company Follows: Could not parse date "${followedOn}"`);
    }
    
    const id = await stableHash(`${organization}|${ts}`);
    
    follows.push({
      id,
      company: organization,
      ts
    });
    
    processedCount++;
  }
  
  warnings.push(`Company Follows: ${processedCount} follows processed from ${fileName}`);
  return follows;
}

// Process Saved Jobs file with robust header detection
async function processSavedJobs(rawData: any[], warnings: string[], fileName: string, isApplications = false): Promise<SavedJob[]> {
  const jobs: SavedJob[] = [];
  
  if (rawData.length < 2) {
    warnings.push(`${isApplications ? 'Job Applications' : 'Saved Jobs'}: Insufficient data in ${fileName}`);
    return jobs;
  }
  
  const headers = rawData[0].map((cell: any) => normalizeText(cell));
  const dataRows = rawData.slice(1).filter(row => 
    Array.isArray(row) && row.some(cell => normalizeText(cell))
  );
  
  const fileType = isApplications ? 'Job Applications' : 'Saved Jobs';
  
  // Diagnostics
  warnings.push(`${fileType}: Detected headers: ${headers.join(' | ')}`);
  warnings.push(`${fileType}: ${dataRows.length} data rows found in ${fileName}`);
  
  // Header aliases
  const aliases = {
    title: ["Title", "Job Title"],
    company: ["Company", "Company Name"],
    ts: ["Saved On", "Date", "Applied On", "Application Date", "Created On"]
  };
  
  let processedCount = 0;
  for (const row of dataRows) {
    const title = getValueByAliases(row, headers, aliases.title);
    const company = getValueByAliases(row, headers, aliases.company);
    const dateValue = getValueByAliases(row, headers, aliases.ts);
    
    // Keep rows with title OR company present
    if (!title && !company) {
      continue;
    }
    
    const ts = parseTimestamp(dateValue);
    if (dateValue && !ts) {
      warnings.push(`${fileType}: Could not parse date "${dateValue}"`);
    }
    
    const id = await stableHash(`${company}|${title}|${ts}`);
    
    jobs.push({
      id,
      company: company || 'Unknown',
      title: title || 'Unknown',
      ts
    });
    
    processedCount++;
  }
  
  warnings.push(`${fileType}: ${processedCount} jobs processed from ${fileName}`);
  return jobs;
}

// Main worker message handler
self.addEventListener('message', async (event) => {
  const files: File[] = event.data;
  
  const payload: ParsedPayload = {
    contacts: [],
    messages: [],
    invites: [],
    companyFollows: [],
    savedJobs: [],
    summary: {
      filesProcessed: [],
      rows: {},
      warnings: []
    }
  };
  
  // Extract files from ZIP or process individual files
  let filesToProcess: { name: string; content: string | ArrayBuffer; originalName: string }[] = [];
  
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const extractedFiles = await extractZipFiles(file);
        for (const extracted of extractedFiles) {
          filesToProcess.push({ 
            name: extracted.name, 
            content: extracted.content,
            originalName: file.name
          });
        }
        payload.summary.warnings.push(`Extracted ${extractedFiles.length} files from ${file.name}`);
      } catch (error) {
        payload.summary.warnings.push(`Failed to extract ZIP file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
    } else {
      // Handle individual files (for backward compatibility)
      const fileName = file.name.toLowerCase();
      
      // Check for auxiliary message files first
      if (fileName.includes('messages')) {
        const basename = file.name.split('/').pop() || '';
        const isCanonicalMessages = basename.toLowerCase() === 'messages.csv' || fileName.endsWith('/messages.csv');
        
        if (!isCanonicalMessages) {
          // This is an auxiliary message file - add warning and skip
          payload.summary.warnings.push(`Ignoring auxiliary messages file ${basename}`);
          continue;
        }
      }
      
      const isRelevantFile = [
        'connections', 'messages', 'invitations', 
        'company follows', 'saved jobs', 'job applications'
      ].some(pattern => fileName.includes(pattern));
      
      if (isRelevantFile) {
        try {
          if (fileName.endsWith('.csv')) {
            const content = await file.text();
            filesToProcess.push({ name: file.name, content, originalName: file.name });
          } else if (fileName.endsWith('.xlsx')) {
            const content = await file.arrayBuffer();
            filesToProcess.push({ name: file.name, content, originalName: file.name });
          }
        } catch (error) {
          payload.summary.warnings.push(`Failed to read file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        payload.summary.warnings.push(`Unrecognized file: ${file.name}`);
      }
    }
  }
  
  // Process all extracted/individual files
  for (const fileData of filesToProcess) {
    const fileName = fileData.name.toLowerCase();
    let fileType = '';
    
    // Check for auxiliary message files first
    if (fileName.includes('messages')) {
      const basename = fileData.name.split('/').pop() || '';
      const isCanonicalMessages = basename.toLowerCase() === 'messages.csv' || fileName.endsWith('/messages.csv');
      
      if (!isCanonicalMessages) {
        // This is an auxiliary message file - add warning and skip
        payload.summary.warnings.push(`Ignoring auxiliary messages file ${basename}`);
        continue;
      }
    }
    
    // Determine file type based on name
    if (fileName.includes('connections')) {
      fileType = 'Connections';
    } else if (fileName.includes('messages')) {
      fileType = 'messages';
    } else if (fileName.includes('invitations')) {
      fileType = 'Invitations';
    } else if (fileName.includes('company follows')) {
      fileType = 'Company Follows';
    } else if (fileName.includes('saved jobs')) {
      fileType = 'Saved Jobs';
    } else if (fileName.includes('job applications')) {
      fileType = 'Job Applications';
    } else {
      payload.summary.warnings.push(`Unrecognized file: ${fileData.name}`);
      continue;
    }
    
    try {
      let data: any[] = [];
      
      if (fileName.endsWith('.csv')) {
        data = parseCSV(fileData.content as string);
      } else if (fileName.endsWith('.xlsx')) {
        data = parseXLSX(fileData.content as ArrayBuffer);
      } else {
        payload.summary.warnings.push(`Unsupported file format: ${fileData.name}`);
        continue;
      }
      
      payload.summary.filesProcessed.push(`${fileType} (${fileData.originalName})`);
      payload.summary.rows[fileType] = data.length;
      
      // Process data based on file type
      switch (fileType) {
        case 'Connections':
          payload.contacts = await processConnections(data, payload.summary.warnings, fileData.name);
          break;
        case 'messages':
          payload.messages = await processMessages(data, payload.summary.warnings, fileData.name);
          break;
        case 'Invitations':
          payload.invites = await processInvitations(data, payload.summary.warnings, fileData.name);
          break;
        case 'Company Follows':
          payload.companyFollows = await processCompanyFollows(data, payload.summary.warnings, fileData.name);
          break;
        case 'Saved Jobs':
          payload.savedJobs.push(...await processSavedJobs(data, payload.summary.warnings, fileData.name, false));
          break;
        case 'Job Applications':
          payload.savedJobs.push(...await processSavedJobs(data, payload.summary.warnings, fileData.name, true));
          break;
      }
      
    } catch (error) {
      payload.summary.warnings.push(`Error processing ${fileData.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Post the final payload
  self.postMessage(payload);
});

export {};