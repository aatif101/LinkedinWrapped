import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { ParsedPayload, Contact, Message, Invite, CompanyFollow, SavedJob } from '../types/parser';

// Simple hash function for stable IDs
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
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

// Parse CSV content
function parseCSV(content: string): any[] {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => normalizeText(header),
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
  
  if (jsonData.length < 2) return [];
  
  const headers = jsonData[0].map((h: any) => normalizeText(String(h)));
  const rows = jsonData.slice(1);
  
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = normalizeText(String(row[index] || ''));
    });
    return obj;
  });
}

// Process Connections file
function processConnections(data: any[], warnings: string[]): Contact[] {
  const contacts: Contact[] = [];
  
  // Skip "Notes:" lines at the beginning
  let startIndex = 0;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (row && typeof row === 'object') {
      const firstKey = Object.keys(row)[0];
      if (firstKey && firstKey.toLowerCase().includes('first name')) {
        startIndex = i;
        break;
      }
    }
  }
  
  const validData = data.slice(startIndex);
  
  for (const row of validData) {
    const firstName = normalizeText(row['First Name']);
    const lastName = normalizeText(row['Last Name']);
    const url = normalizeText(row['URL']);
    const company = normalizeText(row['Company']);
    const position = normalizeText(row['Position']);
    const connectedOn = normalizeText(row['Connected On']);
    const location = normalizeText(row['Location']);
    
    if (!firstName && !lastName) {
      warnings.push('Connections: Dropped row with no name');
      continue;
    }
    
    const name = `${firstName} ${lastName}`.trim();
    const connectedAt = parseTimestamp(connectedOn);
    
    if (connectedOn && !connectedAt) {
      warnings.push(`Connections: Could not parse date "${connectedOn}"`);
    }
    
    const idSource = url || `${name}|${company}|${connectedAt}`;
    const id = simpleHash(idSource);
    
    contacts.push({
      id,
      name,
      title: position || undefined,
      company: company || undefined,
      location: location || undefined,
      connectedAt,
      url: url || undefined
    });
  }
  
  return contacts;
}

// Process Messages file
function processMessages(data: any[], warnings: string[]): Message[] {
  const messages: Message[] = [];
  
  for (const row of data) {
    const conversationId = normalizeText(row['CONVERSATION ID'] || row['conversation id']);
    const from = normalizeText(row['FROM'] || row['from']);
    const senderUrl = normalizeText(row['SENDER PROFILE URL'] || row['sender profile url']);
    const to = normalizeText(row['TO'] || row['to']);
    const recipientUrls = normalizeText(row['RECIPIENT PROFILE URLS'] || row['recipient profile urls']);
    const date = normalizeText(row['DATE'] || row['date']);
    const content = normalizeText(row['CONTENT'] || row['content']);
    
    if (!content) {
      warnings.push('Messages: Dropped row with no content');
      continue;
    }
    
    const ts = parseTimestamp(date);
    if (date && !ts) {
      warnings.push(`Messages: Could not parse date "${date}"`);
    }
    
    // Determine meOrThem
    const meOrThem = from.toLowerCase().includes('you') ? 'me' : 'them';
    
    // Determine threadId
    let threadId: string;
    if (conversationId) {
      threadId = conversationId;
    } else {
      // Fallback logic
      const recipients = recipientUrls.split(',').map(url => normalizeText(url)).filter(Boolean);
      
      if (recipients.length === 1) {
        threadId = simpleHash(recipients[0]);
      } else if (recipients.length > 1) {
        const sortedUrls = recipients.sort().join('|');
        threadId = simpleHash(sortedUrls);
      } else {
        const participant = to || from;
        const dayBucket = getDayBucket(ts);
        threadId = simpleHash(`${participant}|${dayBucket}`);
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
    
    const id = simpleHash(`${threadId}|${ts}|${content.substring(0, 40)}`);
    
    messages.push({
      id,
      threadId,
      meOrThem,
      otherId,
      body: content,
      ts
    });
  }
  
  return messages;
}

// Process Invitations file
function processInvitations(data: any[], warnings: string[]): Invite[] {
  const invites: Invite[] = [];
  
  for (const row of data) {
    const from = normalizeText(row['From']);
    const to = normalizeText(row['To']);
    const sentAt = normalizeText(row['Sent At']);
    const message = normalizeText(row['Message']);
    const direction = normalizeText(row['Direction']);
    
    if (!from && !to) {
      warnings.push('Invitations: Dropped row with no participants');
      continue;
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
    const id = simpleHash(`${inviteDirection}|${counterpartName}|${ts}`);
    
    invites.push({
      id,
      direction: inviteDirection,
      counterpartName,
      status: 'unknown',
      message: message || undefined,
      ts
    });
  }
  
  return invites;
}

// Process Company Follows file
function processCompanyFollows(data: any[], warnings: string[]): CompanyFollow[] {
  const follows: CompanyFollow[] = [];
  
  for (const row of data) {
    const organization = normalizeText(row['Organization']);
    const followedOn = normalizeText(row['Followed On']);
    
    if (!organization) {
      warnings.push('Company Follows: Dropped row with no organization');
      continue;
    }
    
    const ts = parseTimestamp(followedOn);
    if (followedOn && !ts) {
      warnings.push(`Company Follows: Could not parse date "${followedOn}"`);
    }
    
    const id = simpleHash(`${organization}|${ts}`);
    
    follows.push({
      id,
      company: organization,
      ts
    });
  }
  
  return follows;
}

// Process Saved Jobs file
function processSavedJobs(data: any[], warnings: string[], isApplications = false): SavedJob[] {
  const jobs: SavedJob[] = [];
  
  for (const row of data) {
    const company = normalizeText(row['Company']);
    const title = normalizeText(row['Title']);
    
    // Find date field
    let dateValue = '';
    const possibleDateFields = ['Date', 'Application Date', 'Applied Date'];
    for (const field of possibleDateFields) {
      if (row[field]) {
        dateValue = normalizeText(row[field]);
        break;
      }
    }
    
    if (!company || !title) {
      warnings.push(`${isApplications ? 'Job Applications' : 'Saved Jobs'}: Dropped row missing company or title`);
      continue;
    }
    
    const ts = parseTimestamp(dateValue);
    if (dateValue && !ts) {
      warnings.push(`${isApplications ? 'Job Applications' : 'Saved Jobs'}: Could not parse date "${dateValue}"`);
    }
    
    const id = simpleHash(`${company}|${title}|${ts}`);
    
    jobs.push({
      id,
      company,
      title,
      ts
    });
  }
  
  return jobs;
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
  let filesToProcess: { name: string; content: string | ArrayBuffer }[] = [];
  
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const extractedFiles = await extractZipFiles(file);
        filesToProcess.push(...extractedFiles);
        payload.summary.warnings.push(`Extracted ${extractedFiles.length} files from ${file.name}`);
      } catch (error) {
        payload.summary.warnings.push(`Failed to extract ZIP file ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        continue;
      }
    } else {
      // Handle individual files (for backward compatibility)
      const fileName = file.name.toLowerCase();
      const isRelevantFile = [
        'connections', 'messages', 'invitations', 
        'company follows', 'saved jobs', 'job applications'
      ].some(pattern => fileName.includes(pattern));
      
      if (isRelevantFile) {
        try {
          if (fileName.endsWith('.csv')) {
            const content = await file.text();
            filesToProcess.push({ name: file.name, content });
          } else if (fileName.endsWith('.xlsx')) {
            const content = await file.arrayBuffer();
            filesToProcess.push({ name: file.name, content });
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
      
      payload.summary.filesProcessed.push(fileType);
      payload.summary.rows[fileType] = data.length;
      
      // Process data based on file type
      switch (fileType) {
        case 'Connections':
          payload.contacts = processConnections(data, payload.summary.warnings);
          break;
        case 'messages':
          payload.messages = processMessages(data, payload.summary.warnings);
          break;
        case 'Invitations':
          payload.invites = processInvitations(data, payload.summary.warnings);
          break;
        case 'Company Follows':
          payload.companyFollows = processCompanyFollows(data, payload.summary.warnings);
          break;
        case 'Saved Jobs':
          payload.savedJobs.push(...processSavedJobs(data, payload.summary.warnings, false));
          break;
        case 'Job Applications':
          payload.savedJobs.push(...processSavedJobs(data, payload.summary.warnings, true));
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
