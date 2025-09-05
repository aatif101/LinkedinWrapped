import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import FileDropzone from '../components/FileDropzone'
import { parseFiles } from '../utils/parserWorker'
import { dataStore } from '../utils/dataStore'
import type { ParsedPayload } from '../types/parser'

const Wrapped = () => {
  const navigate = useNavigate()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedPayload | null>(dataStore.getParsedData())

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return

    setIsProcessing(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = await parseFiles(files)
      dataStore.setParsedData(payload)
      setParsedData(payload)
      setSuccess(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process files'
      setError(errorMessage)
      console.error('Parser error:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const clearData = () => {
    dataStore.clearData()
    setParsedData(null)
    setSuccess(false)
    setError(null)
  }

  return (
    <div className="min-h-screen relative overflow-hidden px-4 py-8">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
      
      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center justify-between mb-8"
        >
          <motion.button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </motion.button>
          
          {parsedData && (
            <motion.button
              onClick={clearData}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-400/30 rounded-lg text-red-300 hover:bg-red-500/30 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Clear Data
            </motion.button>
          )}
        </motion.div>

        {!parsedData ? (
          // File upload section
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-center space-y-8"
          >
            <div>
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                Import Your Data
              </h1>
              <p className="text-xl text-white/80 max-w-2xl mx-auto">
                Upload your LinkedIn export files to see your personalized wrapped experience
              </p>
            </div>
            
            <FileDropzone
              onFilesSelected={handleFilesSelected}
              isProcessing={isProcessing}
              error={error}
              success={success}
            />
            
            <div className="text-sm text-white/60 max-w-2xl mx-auto">
              <p className="mb-2">📥 How to get your LinkedIn data:</p>
              <ol className="text-left space-y-1 list-decimal list-inside">
                <li>Go to LinkedIn Settings & Privacy → Data Privacy</li>
                <li>Click "Get a copy of your data"</li>
                <li>Select: Connections, Messages, Invitations, Company follows, Job applications</li>
                <li>Download the ZIP file</li>
                <li>Upload the entire ZIP file here (no need to extract!)</li>
              </ol>
              <p className="mt-3 text-xs text-white/50">
                💡 You can also upload individual CSV/XLSX files if you've already extracted them
              </p>
            </div>
          </motion.div>
        ) : (
          // Data summary section
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                Data Imported!
              </h1>
              <p className="text-xl text-white/80">
                Your LinkedIn data has been processed successfully
              </p>
            </div>
            
            {/* Data summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Connections', count: parsedData.contacts.length },
                { label: 'Messages', count: parsedData.messages.length },
                { label: 'Invitations', count: parsedData.invites.length },
                { label: 'Company Follows', count: parsedData.companyFollows.length },
                { label: 'Saved Jobs', count: parsedData.savedJobs.length },
              ].map(({ label, count }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="bg-white/10 border border-white/20 rounded-lg p-4 text-center"
                >
                  <Database className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{count}</div>
                  <div className="text-sm text-white/60">{label}</div>
                </motion.div>
              ))}
            </div>
            
            {/* Processing summary */}
            {parsedData.summary.warnings.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-4"
              >
                <h3 className="text-yellow-300 font-medium mb-2">Processing Notes:</h3>
                <ul className="text-yellow-200/80 text-sm space-y-1">
                  {parsedData.summary.warnings.slice(0, 5).map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                  {parsedData.summary.warnings.length > 5 && (
                    <li>• ...and {parsedData.summary.warnings.length - 5} more</li>
                  )}
                </ul>
              </motion.div>
            )}
            
            <div className="text-center">
              <p className="text-white/60 text-sm mb-4">
                Your wrapped experience is coming soon! 🚀
              </p>
              <p className="text-white/40 text-xs">
                All data is processed locally in your browser and never sent to any server.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default Wrapped
