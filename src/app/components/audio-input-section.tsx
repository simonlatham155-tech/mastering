import { Upload, X, Activity, Gauge, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioAnalysisResult } from '../utils/audio-analyzer';

// PerformanceMode removed (2026-02-16) - studio mastering only

interface AudioInputSectionProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  isProcessing: boolean;
  analysisResult?: AudioAnalysisResult | null;
  isAnalyzing?: boolean;
}

export function AudioInputSection({
  selectedFile,
  onFileSelect,
  onClear,
  isProcessing,
  analysisResult,
  isAnalyzing,
}: AudioInputSectionProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
    <div className="flex flex-col gap-6">
      {/* Section Header */}
      <div className="text-[10px] font-mono text-zinc-500 tracking-[0.3em] uppercase">
        Audio Input
      </div>

      {/* Upload Box */}
      <div>
        <div 
          className="border-2 rounded-lg p-4"
          style={{
            borderColor: '#3a3a3a',
            background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
          }}
        >
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-3">
            Upload Audio File
          </div>
          
          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed rounded-lg p-4 mb-3 transition-all hover:border-zinc-600"
            style={{
              borderColor: selectedFile ? '#10b981' : '#3a3a3a',
              background: selectedFile ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.3)',
            }}
          >
            <AnimatePresence mode="wait">
              {!selectedFile ? (
                <motion.div
                  key="upload-prompt"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                      border: '2px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <Upload className="w-5 h-5 text-zinc-500" />
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] font-mono text-zinc-600 mb-2">
                      WAV, MP3, FLAC, or AIFF
                    </div>

                    <label className="inline-block">
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleFileInput}
                        className="hidden"
                        disabled={isProcessing}
                      />
                      <div 
                        className="px-5 py-2 rounded-md font-mono text-xs uppercase tracking-wider cursor-pointer transition-all"
                        style={{
                          background: 'linear-gradient(180deg, #10b981, #059669)',
                          color: '#fff',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                        }}
                      >
                        Browse Files
                      </div>
                    </label>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="file-selected"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-md flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 0 16px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <Upload className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-mono text-zinc-300 mb-0.5">
                        {selectedFile.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={onClear}
                    disabled={isProcessing}
                    className="p-2 rounded-md hover:bg-red-500/20 transition-colors group"
                  >
                    <X className="w-5 h-5 text-zinc-600 group-hover:text-red-400" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Optimal Input Specs */}
          <div 
            className="px-3 py-2 rounded-md"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-0.5">
              Optimal Input
            </div>
            <div className="text-[10px] font-mono text-zinc-500">
              -8dB LUFS • 44.1–192 kHz • import up to 24-bit
            </div>
          </div>
        </div>
      </div>

      {/* Audio Analysis Results */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-2 rounded-lg p-4"
            style={{
              borderColor: '#2a2a2a',
              background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)'
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              <div className="text-xs font-mono text-cyan-300 uppercase tracking-wider">
                Analyzing Audio...
              </div>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-cyan-400"
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 2, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        )}

        {analysisResult && !isAnalyzing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-2 rounded-lg p-6"
            style={{
              borderColor: analysisResult.isHeritage ? '#f59e0b' : '#10b981',
              background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              boxShadow: `
                inset 0 2px 4px rgba(0,0,0,0.6),
                0 0 16px ${analysisResult.isHeritage ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}
              `
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gauge className={`w-4 h-4 ${analysisResult.isHeritage ? 'text-amber-400' : 'text-emerald-400'}`} />
                <div className="text-xs font-mono text-zinc-300 uppercase tracking-wider">
                  Audio Analysis Complete
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Studio Mode Badge (always studio) */}
                <div className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/40">
                  <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider">
                    🎚️ Studio Mode
                  </div>
                </div>
                {analysisResult.isHeritage && (
                  <div className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/40">
                    <div className="text-[9px] font-mono text-amber-400 uppercase tracking-wider">
                      Heritage Content
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Input LUFS */}
              <div className="flex flex-col gap-1">
                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                  Input LUFS
                </div>
                <div className={`text-lg font-mono ${ analysisResult.lufs < -14 ? 'text-cyan-400' : 'text-amber-400'
                }`}>
                  {analysisResult.lufs.toFixed(1)}
                </div>
              </div>

              {/* Dynamic Range */}
              <div className="flex flex-col gap-1">
                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                  Dynamic Range
                </div>
                <div className={`text-lg font-mono ${
                  analysisResult.dynamicRange > 10 ? 'text-emerald-400' : 
                  analysisResult.dynamicRange > 6 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {analysisResult.dynamicRange.toFixed(1)} dB
                </div>
              </div>

              {/* Peak Level */}
              <div className="flex flex-col gap-1">
                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">
                  Peak Level
                </div>
                <div className={`text-lg font-mono ${
                  (analysisResult.digitalPeakDB ?? analysisResult.truePeak) > -0.3 ? 'text-red-400' :
                  (analysisResult.digitalPeakDB ?? analysisResult.truePeak) > -3 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {(analysisResult.digitalPeakDB ?? analysisResult.truePeak).toFixed(1)} dBFS
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div 
              className="px-3 py-2 rounded-md"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
                {analysisResult.isHeritage ? '⚠️ Heritage Content Detected' : '✅ Analysis'}
              </div>
              <div className="text-[10px] font-mono text-zinc-400 leading-relaxed">
                {analysisResult.isHeritage ? (
                  <>Vintage material detected (quiet peaks). Using safe normalization to preserve original dynamics.</>
                ) : (
                  <>Material suitable for modern mastering. Proceed with preview to hear processing.</>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}