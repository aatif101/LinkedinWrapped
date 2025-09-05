# LinkedIn Data Parser Implementation

This implementation provides a complete Web Worker-based parser for LinkedIn export data, fulfilling the requirements for v0.2 of the LinkedIn Wrapped project.

## 🎯 What's Implemented

### Core Parser Worker (`src/workers/parser.worker.ts`)
- **ZIP File Support**: Automatically extracts LinkedIn export ZIP files using JSZip
- **CSV/XLSX Support**: Uses PapaParse and SheetJS for robust file parsing
- **File Type Detection**: Automatically identifies LinkedIn export files by name
- **Data Normalization**: Implements all specified normalization rules
- **Stable ID Generation**: Uses deterministic hashing for consistent IDs
- **Timestamp Parsing**: Handles various LinkedIn timestamp formats
- **Error Handling**: Comprehensive error reporting and warnings

### Supported File Types
✅ **Connections.csv/.xlsx** - Contact information and connection dates  
✅ **messages.csv/.xlsx** - Direct message history and threads  
✅ **Invitations.csv/.xlsx** - Sent and received connection requests  
✅ **Company Follows.csv/.xlsx** - Companies you follow  
✅ **Saved Jobs.csv/.xlsx** - Jobs you've saved  
✅ **Job Applications.csv/.xlsx** - Jobs you've applied to  

### Data Types (`src/types/parser.ts`)
All data structures exactly match the specification:
- `Contact` - Network connections with profile info
- `Message` - Direct messages with thread grouping
- `Invite` - Connection requests with status tracking
- `CompanyFollow` - Company follow activities
- `SavedJob` - Saved and applied job positions

### UI Integration (`src/pages/Wrapped.tsx` + `src/components/FileDropzone.tsx`)
- **Drag & Drop Interface**: Intuitive file upload experience
- **Processing Feedback**: Real-time status updates and progress
- **Data Summary**: Visual display of parsed data counts
- **Error Handling**: User-friendly error messages and warnings
- **Privacy-First**: Clear messaging about local-only processing

## 🧪 Validation & Testing

### Acceptance Tests (`src/utils/parserValidation.ts`)
Validates all specified requirements:

1. ✅ **Timestamp Parsing**: `"2024-01-02 10:00:00 UTC"` → Valid ISO 8601
2. ✅ **Message Direction**: `FROM="You"` → `meOrThem === "me"`
3. ✅ **Thread ID Fallback**: Multiple recipients → Stable hash-based thread ID
4. ✅ **Invite Direction**: `Direction="OUTGOING"` → `direction === "sent"`
5. ✅ **Job Data**: Both Saved Jobs and Job Applications → Unified `SavedJob` format

### Data Normalization Features
- **BOM Removal**: Strips Unicode byte order marks
- **Whitespace Cleanup**: Trims and collapses multiple spaces
- **Header Flexibility**: Case-insensitive header matching
- **Notes Skipping**: Automatically skips LinkedIn's "Notes:" preamble
- **Missing Field Handling**: Graceful handling of empty/missing cells

## 🚀 Usage

### Installation
First install the required dependencies:
```bash
npm install papaparse xlsx jszip @types/papaparse @types/jszip
```

### Basic Usage
1. Navigate to `/wrapped` in the application
2. Drag and drop your LinkedIn export ZIP file (or individual CSV/XLSX files)
3. Files are automatically extracted and processed in a Web Worker
4. View the data summary with counts and any processing warnings
5. Data is stored in memory for future wrapped features

### File Structure
```
src/
├── types/parser.ts              # TypeScript type definitions
├── workers/parser.worker.ts     # Main parser Web Worker
├── utils/
│   ├── dataStore.ts            # In-memory data storage
│   ├── parserWorker.ts         # Worker communication helper
│   └── parserValidation.ts     # Acceptance test validation
├── components/
│   └── FileDropzone.tsx        # File upload UI component
└── pages/
    └── Wrapped.tsx             # Main import page with UI
```

## 🔒 Privacy & Performance

- **Local Processing**: All parsing and ZIP extraction happens in your browser
- **No Network Calls**: Data never leaves your device
- **Web Worker**: Non-blocking UI during large file processing and extraction
- **Memory Efficient**: Streams large files without memory bloat
- **Error Recovery**: Continues processing even if some files fail
- **ZIP Support**: Handles LinkedIn's native ZIP export format automatically

## 📊 Processing Summary

After upload, you'll see:
- **Data Counts**: Number of contacts, messages, invites, etc.
- **Files Processed**: Which LinkedIn export files were recognized
- **Warnings**: Any data quality issues or parsing problems
- **Validation Results**: Confirmation that parsing meets specifications

## 🔧 Technical Implementation

### Hash Function
Uses a simple but deterministic hash for stable IDs:
```typescript
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
```

### Thread ID Fallback Logic
1. Use `CONVERSATION ID` if present
2. Single recipient → `hash(recipientUrl)`
3. Multiple recipients → `hash(sortedUrls.join("|"))`
4. Fallback → `hash(participant + dayBucket)`

### Timestamp Normalization
- Strips literal "UTC" suffix
- Parses common LinkedIn formats
- Converts to ISO 8601 UTC
- Graceful failure with empty string

## 🎯 Key Update: ZIP File Support

**Important**: LinkedIn exports come as ZIP files, not individual CSV/XLSX files. The implementation now handles:

- **Direct ZIP Upload**: Users can drop the entire LinkedIn export ZIP file
- **Automatic Extraction**: JSZip extracts relevant files from the ZIP archive
- **Backward Compatibility**: Still supports individual CSV/XLSX files if already extracted
- **Improved UX**: Clear instructions about uploading the ZIP file directly

### ZIP Processing Flow
1. User uploads LinkedIn export ZIP file
2. Worker extracts CSV/XLSX files from ZIP using JSZip
3. Identifies relevant LinkedIn files by name patterns
4. Processes each extracted file through the existing parser logic
5. Aggregates results into unified data structures

This implementation is ready for integration with the rest of the LinkedIn Wrapped features and provides a solid foundation for v0.3's analytics and visualization features.
