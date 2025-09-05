import type { ParsedPayload } from '../types/parser';
import { runValidationTests } from './parserValidation';

// In-memory data store
let parsedData: ParsedPayload | null = null;

export const dataStore = {
  setParsedData: (data: ParsedPayload) => {
    parsedData = data;
    console.log('Data stored:', {
      contacts: data.contacts.length,
      messages: data.messages.length,
      invites: data.invites.length,
      companyFollows: data.companyFollows.length,
      savedJobs: data.savedJobs.length,
      summary: data.summary
    });
    
    // Run validation tests
    runValidationTests(data);
  },
  
  getParsedData: (): ParsedPayload | null => {
    return parsedData;
  },
  
  clearData: () => {
    parsedData = null;
  },
  
  hasData: (): boolean => {
    return parsedData !== null;
  }
};
