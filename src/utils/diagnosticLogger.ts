import type { ParsedPayload } from '../types/parser';

/**
 * UI hook for logging parser diagnostics
 * Logs summary information to console for debugging and validation
 */
export function logParserDiagnostics(payload: ParsedPayload): void {
  console.log('\n🔍 Parser Diagnostics Report');
  console.log('============================');
  
  // Files processed
  console.log('\n📁 Files Processed:');
  if (payload.summary.filesProcessed.length > 0) {
    payload.summary.filesProcessed.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file}`);
    });
  } else {
    console.log('  No files processed');
  }
  
  // Row counts
  console.log('\n📊 Row Counts:');
  Object.entries(payload.summary.rows).forEach(([fileType, count]) => {
    console.log(`  ${fileType}: ${count} rows`);
  });
  
  // First 10 warnings
  console.log('\n⚠️  Processing Warnings (first 10):');
  if (payload.summary.warnings.length > 0) {
    payload.summary.warnings.slice(0, 10).forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`);
    });
    
    if (payload.summary.warnings.length > 10) {
      console.log(`  ... and ${payload.summary.warnings.length - 10} more warnings`);
    }
  } else {
    console.log('  No warnings');
  }
  
  // Data summary
  console.log('\n📈 Final Data Counts:');
  console.log(`  Contacts: ${payload.contacts.length}`);
  console.log(`  Messages: ${payload.messages.length}`);
  console.log(`  Invitations: ${payload.invites.length}`);
  console.log(`  Company Follows: ${payload.companyFollows.length}`);
  console.log(`  Saved Jobs: ${payload.savedJobs.length}`);
  
  console.log('\n✅ Diagnostics complete\n');
}

