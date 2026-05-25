import { ArrowRight, FileAudio, Settings, Download } from 'lucide-react';
import { AudioAnalysisResult } from '../utils/audio-analyzer';
import { GearProfileId, gearProfiles } from './gear-selector';

type LogicMode = 'brickwall' | 'dynamics';

interface MasteringWorkflowProps {
  // A) INPUT
  inputAnalysis: AudioAnalysisResult | null;
  
  // B) GEAR PROFILE ADJUSTMENT
  circuitDrive: number;
  logicMode: LogicMode;
  gearProfile: GearProfileId;
  
  // C) OUTPUT (predicted)
  targetLUFS: number;
  outputPrediction?: {
    estimatedLUFS: number;
    estimatedDR: number;
    estimatedPeak: number;
  };
}

export function MasteringWorkflow({
  inputAnalysis,
  circuitDrive,
  logicMode,
  gearProfile,
  targetLUFS,
  outputPrediction
}: MasteringWorkflowProps) {
  // Get profile data
  const profileData = gearProfiles.find(p => p.id === gearProfile);
  
  // Calculate predicted output if not provided
  const predictedOutput = outputPrediction || (inputAnalysis ? {
    estimatedLUFS: targetLUFS,
    estimatedDR: logicMode === 'brickwall' 
      ? Math.max(4, inputAnalysis.dynamicRange - 4)
      : Math.max(6, inputAnalysis.dynamicRange - 2),
    estimatedPeak: -0.1
  } : null);

  const gainChange = inputAnalysis && predictedOutput 
    ? predictedOutput.estimatedLUFS - inputAnalysis.lufs 
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-7 gap-4 items-center">
      {/* A) INPUT STAGE */}
      <div className="lg:col-span-2">
        <div 
          className="border rounded-lg p-4 h-full"
          style={{
            background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
            borderColor: '#2a2a2a',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <FileAudio className="w-4 h-4 text-blue-400" />
            <div className="text-sm font-mono text-zinc-500 uppercase tracking-wider">
              A) Original Input
            </div>
          </div>

          {inputAnalysis ? (
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">LUFS</span>
                <span className="text-sm font-mono text-blue-400">{inputAnalysis.lufs.toFixed(1)} dB</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">Dynamic Range</span>
                <span className="text-sm font-mono text-cyan-400">{inputAnalysis.dynamicRange.toFixed(1)} dB</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">True Peak</span>
                <span className="text-sm font-mono text-purple-400">{inputAnalysis.truePeak.toFixed(2)} dBTP</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">Genre</span>
                <span className="text-xs font-mono text-amber-400 uppercase">{inputAnalysis.suggestedGenre}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-700 text-xs font-mono">
              No audio loaded
            </div>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="hidden lg:flex justify-center">
        <ArrowRight className="w-5 h-5 text-zinc-600" />
      </div>

      {/* B) GEAR PROFILE ADJUSTMENT */}
      <div className="lg:col-span-2">
        <div 
          className="border-2 rounded-lg p-4 h-full"
          style={{
            background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
            borderColor: '#f59e0b',
            boxShadow: `
              inset 0 2px 4px rgba(0,0,0,0.5),
              0 0 16px rgba(245, 158, 11, 0.2)
            `
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-amber-400" />
            <div className="text-sm font-mono text-zinc-500 uppercase tracking-wider">
              B) Gear Processing
            </div>
          </div>

          <div className="space-y-2">
            {/* Four-Phase Gain Structure */}
            <div className="mb-3 p-2 rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <div className="text-xs font-mono text-zinc-600 uppercase mb-1">4-Phase Analog Chain</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500">Foundation</span>
                  <span className="text-emerald-400">+2dB</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500">Harmonics</span>
                  <span className="text-orange-400">+3dB ({circuitDrive}% THD)</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500">Glue</span>
                  <span className="text-cyan-400">+3dB</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-500">Finish</span>
                  <span className="text-purple-400">{logicMode === 'brickwall' ? 'Limiting' : 'Dynamics'}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono text-zinc-600 uppercase">Profile</span>
              <span className="text-xs font-mono text-amber-400 uppercase">{profileData ? profileData.name : 'Unknown'}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono text-zinc-600 uppercase">Logic Mode</span>
              <span className="text-sm font-mono text-cyan-400 capitalize">{logicMode}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono text-zinc-600 uppercase">Total Gain</span>
              <span className={`text-sm font-mono ${gainChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {gainChange >= 0 ? '+' : ''}{gainChange.toFixed(1)} dB
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="hidden lg:flex justify-center">
        <ArrowRight className="w-5 h-5 text-zinc-600" />
      </div>

      {/* C) FINAL OUTPUT */}
      <div className="lg:col-span-2">
        <div 
          className="border rounded-lg p-4 h-full"
          style={{
            background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
            borderColor: '#10b981',
            boxShadow: `
              inset 0 2px 4px rgba(0,0,0,0.5),
              0 0 12px rgba(16, 185, 129, 0.15)
            `
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Download className="w-4 h-4 text-emerald-400" />
            <div className="text-sm font-mono text-zinc-500 uppercase tracking-wider">
              C) Mastered Output
            </div>
          </div>

          {predictedOutput ? (
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">Target LUFS</span>
                <span className="text-sm font-mono text-emerald-400">{predictedOutput.estimatedLUFS.toFixed(1)} dB</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">Est. DR</span>
                <span className="text-sm font-mono text-cyan-400">{predictedOutput.estimatedDR.toFixed(1)} dB</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-mono text-zinc-600 uppercase">True Peak</span>
                <span className="text-sm font-mono text-purple-400">{predictedOutput.estimatedPeak.toFixed(2)} dBTP</span>
              </div>
              
              {/* Quality indicator */}
              <div className="mt-3 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-600 uppercase">Quality</span>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => {
                      const isActive = predictedOutput.estimatedDR > 6 && i < (predictedOutput.estimatedDR > 10 ? 5 : 3);
                      return (
                        <div
                          key={i}
                          className="w-1.5 h-3 rounded-sm"
                          style={{
                            background: isActive 
                              ? 'linear-gradient(180deg, #10b981, #059669)'
                              : 'rgba(39, 39, 42, 1)'
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-700 text-xs font-mono">
              Processing pending
            </div>
          )}
        </div>
      </div>
    </div>
  );
}