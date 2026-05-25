import { Upload, FileAudio, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onClear: () => void;
  selectedFile: File | null;
  isProcessing: boolean;
}

export function FileUpload({ onFileSelect, onClear, selectedFile, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      onFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-400 tracking-wider">AUDIO INPUT</div>
        {selectedFile && (
          <button
            onClick={onClear}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            disabled={isProcessing}
          >
            Clear
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg transition-all ${
              isDragging
                ? 'border-green-500'
                : 'border-zinc-700'
            }`}
            style={{
              background: isDragging 
                ? 'rgba(34, 197, 94, 0.05)' 
                : 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)'
            }}
          >
            <label className="flex flex-col items-center justify-center gap-3 p-8 cursor-pointer">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileInput}
                className="hidden"
              />

              <div 
                className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-colors`}
                style={{
                  borderColor: isDragging ? '#22c55e' : '#3a3a3a',
                  background: 'radial-gradient(circle at 30% 30%, #1a1a1a, #0a0a0a)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
                }}
              >
                <Upload className={`w-8 h-8 ${isDragging ? 'text-green-400' : 'text-zinc-600'}`} />
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  {isDragging ? 'Drop audio file here' : 'Upload audio file'}
                </div>
                <div className="text-xs text-zinc-600 font-mono">
                  WAV, MP3, FLAC, or AIFF
                </div>
              </div>

              <div 
                className="px-4 py-2 text-xs rounded-md font-mono uppercase tracking-wider border"
                style={{
                  background: 'linear-gradient(180deg, #16a34a, #15803d)',
                  borderColor: '#22c55e',
                  color: 'white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                }}
              >
                Browse Files
              </div>
            </label>
          </motion.div>
        ) : (
          <motion.div
            key="file-info"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="border-2 rounded-lg p-4"
            style={{
              borderColor: '#2a2a2a',
              background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
            }}
          >
            <div className="flex items-start gap-3">
              <div 
                className={`w-12 h-12 rounded-lg flex items-center justify-center border-2`}
                style={{
                  borderColor: isProcessing ? '#22c55e' : '#3a3a3a',
                  background: 'radial-gradient(circle at 30% 30%, #1a1a1a, #0a0a0a)',
                  boxShadow: isProcessing
                    ? '0 0 12px rgba(34, 197, 94, 0.4), inset 0 2px 4px rgba(0,0,0,0.6)'
                    : 'inset 0 2px 4px rgba(0,0,0,0.6)'
                }}
              >
                {isProcessing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <FileAudio className="w-6 h-6 text-green-400" />
                  </motion.div>
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-zinc-300 truncate uppercase tracking-wider">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-zinc-500 mt-1 font-mono">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
                {isProcessing && (
                  <div className="text-xs text-green-400 mt-2 font-mono uppercase tracking-wider">
                    Processing analog chain...
                  </div>
                )}
              </div>

              {!isProcessing && (
                <button
                  onClick={onClear}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Target specifications */}
      {!selectedFile && (
        <div 
          className="border rounded-md px-3 py-2"
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderColor: '#2a2a2a',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)'
          }}
        >
          <div className="text-xs text-zinc-600 uppercase tracking-[0.3em] mb-1 font-mono">
            Optimal Input
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            -8dB LUFS • 44.1-192kHz • 24-bit
          </div>
        </div>
      )}
    </div>
  );
}