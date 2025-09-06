import type { ParsedPayload } from '../types/parser';
import { runValidationTests } from './parserValidation';
import { logParserDiagnostics } from './diagnosticLogger';

// In-memory data store
let parsedData: ParsedPayload | null = null;

export const dataStore = {
  setParsedData: (data: ParsedPayload) => {
    parsedData = data;
    
    // Log comprehensive diagnostics
    logParserDiagnostics(data);
    
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
