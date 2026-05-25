import { motion } from 'motion/react';
import { Clock } from 'lucide-react';

interface ChunkSelectorProps {
  totalDuration: number; // Total track duration in seconds
  chunkDuration?: number; // Duration of each chunk (default 30s)
  selectedChunk: number; // Currently selected chunk index
  onChunkSelect: (chunkIndex: number) => void;
  isProcessing?: boolean;
}

export function ChunkSelector({
  totalDuration,
  chunkDuration = 30,
  selectedChunk,
  onChunkSelect,
  isProcessing = false
}: ChunkSelectorProps) {
  // Calculate number of chunks
  const numChunks = Math.ceil(totalDuration / chunkDuration);
  
  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <div className="text-xs font-mono text-zinc-300 uppercase tracking-wider">
            Preview Sections
          </div>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          {numChunks} × {chunkDuration}s chunks
        </div>
      </div>

      {/* Chunk Grid */}
      <div 
        className="grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))'
        }}
      >
        {Array.from({ length: numChunks }, (_, i) => {
          const startTime = i * chunkDuration;
          const endTime = Math.min((i + 1) * chunkDuration, totalDuration);
          const isSelected = i === selectedChunk;
          
          return (
            <motion.button
              key={i}
              onClick={() => onChunkSelect(i)}
              disabled={isProcessing}
              className={`
                relative px-3 py-2 rounded-md font-mono text-xs
                transition-all disabled:opacity-50 disabled:cursor-not-allowed
                ${isSelected 
                  ? 'text-cyan-300 ring-2 ring-cyan-400/50' 
                  : 'text-zinc-400 hover:text-zinc-200'
                }
              `}
              style={{
                background: isSelected 
                  ? 'linear-gradient(180deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.1))'
                  : 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                border: isSelected 
                  ? '1px solid rgba(6, 182, 212, 0.4)'
                  : '1px solid #2a2a2a',
                boxShadow: isSelected
                  ? '0 0 12px rgba(6, 182, 212, 0.3), inset 0 1px 2px rgba(6, 182, 212, 0.2)'
                  : 'inset 0 1px 2px rgba(0,0,0,0.6)'
              }}
              whileHover={!isProcessing ? { scale: 1.02 } : {}}
              whileTap={!isProcessing ? { scale: 0.98 } : {}}
            >
              <div className="flex flex-col items-center gap-1">
                <div className={`text-[10px] ${isSelected ? 'text-cyan-400 font-semibold' : 'text-zinc-500'}`}>
                  #{i + 1}
                </div>
                <div className={`text-[9px] ${isSelected ? 'text-cyan-300' : 'text-zinc-600'}`}>
                  {formatTime(startTime)}
                </div>
              </div>
              
              {/* Active indicator */}
              {isSelected && (
                <motion.div
                  className="absolute inset-0 rounded-md"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.1), transparent)',
                  }}
                  animate={{
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Selected chunk info */}
      <div 
        className="px-3 py-2 rounded-md"
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(6, 182, 212, 0.2)'
        }}
      >
        <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider mb-1">
          Current Section
        </div>
        <div className="text-xs font-mono text-cyan-400">
          {formatTime(selectedChunk * chunkDuration)} → {formatTime(Math.min((selectedChunk + 1) * chunkDuration, totalDuration))}
          <span className="text-zinc-500 ml-2">
            ({Math.min(chunkDuration, totalDuration - selectedChunk * chunkDuration)}s)
          </span>
        </div>
      </div>
    </div>
  );
}
