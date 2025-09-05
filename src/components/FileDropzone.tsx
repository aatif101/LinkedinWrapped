import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Archive } from 'lucide-react';

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing?: boolean;
  error?: string | null;
  success?: boolean;
}

const FileDropzone = ({ onFilesSelected, isProcessing = false, error = null, success = false }: FileDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(files);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const getStatusIcon = () => {
    if (isProcessing) return <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />;
    if (success) return <CheckCircle className="w-8 h-8 text-green-400" />;
    if (error) return <AlertCircle className="w-8 h-8 text-red-400" />;
    return <Upload className="w-8 h-8 text-white/60" />;
  };

  const getStatusText = () => {
    if (isProcessing) return 'Processing your LinkedIn data...';
    if (success) return 'Data processed successfully!';
    if (error) return error;
    if (selectedFiles.length > 0) return `${selectedFiles.length} file(s) selected`;
    return 'Drop your LinkedIn export files here or click to browse';
  };

  const getBorderColor = () => {
    if (error) return 'border-red-400/50';
    if (success) return 'border-green-400/50';
    if (isDragging || isProcessing) return 'border-blue-400/50';
    return 'border-white/20';
  };

  const getBackgroundColor = () => {
    if (error) return 'bg-red-400/5';
    if (success) return 'bg-green-400/5';
    if (isDragging || isProcessing) return 'bg-blue-400/5';
    return 'bg-white/5';
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all ${getBorderColor()} ${getBackgroundColor()}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <input
          type="file"
          multiple
          accept=".zip,.csv,.xlsx"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isProcessing}
        />
        
        <div className="space-y-4">
          {getStatusIcon()}
          
          <div>
            <p className="text-lg font-medium text-white mb-2">
              {getStatusText()}
            </p>
            
            {!isProcessing && !success && !error && (
              <p className="text-sm text-white/60">
                Drop your LinkedIn export ZIP file here, or individual CSV/XLSX files
              </p>
            )}
          </div>
        </div>
      </motion.div>
      
      {selectedFiles.length > 0 && !isProcessing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-2"
        >
          <h4 className="text-white font-medium">Selected Files:</h4>
          {selectedFiles.map((file, index) => {
            const isZip = file.name.toLowerCase().endsWith('.zip');
            const Icon = isZip ? Archive : FileText;
            return (
              <div key={index} className="flex items-center gap-2 text-white/80 text-sm">
                <Icon className="w-4 h-4" />
                <span>{file.name}</span>
                <span className="text-white/50">({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
                {isZip && <span className="text-blue-400 text-xs">ZIP</span>}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
};

export default FileDropzone;
