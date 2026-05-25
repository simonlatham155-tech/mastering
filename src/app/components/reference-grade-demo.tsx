import { useState } from 'react';
import { GainReductionMeter } from './gain-reduction-meter';
import { TruePeakIndicator } from './true-peak-indicator';
import { ISPIndicator } from './isp-indicator';
import { EQModeToggle } from './eq-mode-toggle';
import { LUFSTargetSelector } from './lufs-target-selector';
import { LatencyModeToggle } from './latency-mode-toggle';
import { HQModeToggle } from './hq-mode-toggle';
import { InterSamplePeakMeter } from './inter-sample-peak-meter';
import { AliasingVisualizer } from './aliasing-visualizer';
import { ProfessionalLUFSMeter } from './professional-lufs-meter';

/**
 * REFERENCE-GRADE DSP DEMO
 * Showcases all the professional mastering UI components
 */
export function ReferenceGradeDemo() {
  // State
  const [gainReductionDB, setGainReductionDB] = useState(-6.3);
  const [truePeakDBTP, setTruePeakDBTP] = useState(-0.25);
  const [digitalPeakDB, setDigitalPeakDB] = useState(-0.5);
  const [eqMode, setEQMode] = useState<'classic' | 'linear'>('linear');
  const [targetLUFS, setTargetLUFS] = useState(-6);
  const [currentLUFS, setCurrentLUFS] = useState(-10.2);
  const [latencyMode, setLatencyMode] = useState<'zero-latency' | 'mastering'>('mastering');
  const [hqMode, setHQMode] = useState(true);
  const [cpuUsage, setCPUUsage] = useState(18.5);
  
  // LUFS metering state
  const [momentaryLUFS, setMomentaryLUFS] = useState(-12.5);
  const [shortTermLUFS, setShortTermLUFS] = useState(-10.8);
  const [integratedLUFS, setIntegratedLUFS] = useState(-6.2);
  
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2 pb-8 border-b border-zinc-800">
          <h1 className="text-4xl font-mono font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            REFERENCE-GRADE DSP
          </h1>
          <p className="text-sm font-mono text-zinc-500">
            Professional mastering UI components • iZotope Ozone quality
          </p>
        </div>
        
        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-8">
            {/* Gain Reduction Meter */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Gain Reduction Meter
              </h2>
              <GainReductionMeter
                gainReductionDB={gainReductionDB}
                lookaheadMS={5}
                showGhost={true}
              />
              
              {/* Demo controls */}
              <div className="mt-4 p-3 bg-zinc-900 rounded border border-zinc-800">
                <label className="text-[8px] font-mono text-zinc-500 block mb-2">
                  DEMO: Adjust Gain Reduction
                </label>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  step={0.1}
                  value={gainReductionDB}
                  onChange={(e) => setGainReductionDB(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[10px] font-mono text-zinc-600 mt-1 text-center">
                  {gainReductionDB.toFixed(1)} dB
                </div>
              </div>
            </div>
            
            {/* True Peak Indicator */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                True Peak Detection
              </h2>
              <TruePeakIndicator
                truePeakDBTP={truePeakDBTP}
                ceiling={-0.3}
                enabled={true}
              />
              
              {/* Demo controls */}
              <div className="mt-4 p-3 bg-zinc-900 rounded border border-zinc-800">
                <label className="text-[8px] font-mono text-zinc-500 block mb-2">
                  DEMO: Adjust True Peak
                </label>
                <input
                  type="range"
                  min={-3}
                  max={1}
                  step={0.01}
                  value={truePeakDBTP}
                  onChange={(e) => setTruePeakDBTP(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[10px] font-mono text-zinc-600 mt-1 text-center">
                  {truePeakDBTP > 0 ? '+' : ''}{truePeakDBTP.toFixed(2)} dBTP
                </div>
              </div>
            </div>
            
            {/* ISP Indicator */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Inter-Sample Peak Detection
              </h2>
              <ISPIndicator
                truePeakDBTP={truePeakDBTP}
                digitalPeakDB={digitalPeakDB}
                enabled={true}
              />
            </div>
          </div>
          
          {/* Right column */}
          <div className="space-y-8">
            {/* EQ Mode Toggle */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                EQ Algorithm Selection
              </h2>
              <EQModeToggle
                mode={eqMode}
                onModeChange={setEQMode}
              />
            </div>
            
            {/* LUFS Target Selector */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Loudness Targeting
              </h2>
              <LUFSTargetSelector
                targetLUFS={targetLUFS}
                currentLUFS={currentLUFS}
                onTargetChange={setTargetLUFS}
              />
              
              {/* Demo controls */}
              <div className="mt-4 p-3 bg-zinc-900 rounded border border-zinc-800">
                <label className="text-[8px] font-mono text-zinc-500 block mb-2">
                  DEMO: Adjust Current LUFS
                </label>
                <input
                  type="range"
                  min={-20}
                  max={-3}
                  step={0.1}
                  value={currentLUFS}
                  onChange={(e) => setCurrentLUFS(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[10px] font-mono text-zinc-600 mt-1 text-center">
                  Current: {currentLUFS.toFixed(1)} LUFS | Target: {targetLUFS.toFixed(1)} LUFS
                </div>
              </div>
            </div>
            
            {/* Latency Mode Toggle */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Processing Mode
              </h2>
              <LatencyModeToggle
                mode={latencyMode}
                currentLatencyMS={5}
                onModeChange={setLatencyMode}
              />
            </div>
            
            {/* HQ Mode Toggle */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                High Quality Mode
              </h2>
              <HQModeToggle
                enabled={hqMode}
                onToggle={setHQMode}
                cpuUsage={cpuUsage}
              />
            </div>
            
            {/* Inter-Sample Peak Meter */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Inter-Sample Peak Meter
              </h2>
              <InterSamplePeakMeter
                digitalPeakDB={digitalPeakDB}
                truePeakDBTP={truePeakDBTP}
                ispDifference={truePeakDBTP - digitalPeakDB}
                hqMode={hqMode}
              />
            </div>
            
            {/* Aliasing Visualizer */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Aliasing Visualizer
              </h2>
              <AliasingVisualizer
                hqMode={hqMode}
                aliasingLevel={hqMode ? 0 : 45}
              />
            </div>
            
            {/* Professional LUFS Meter */}
            <div>
              <h2 className="text-sm font-mono text-cyan-400 uppercase mb-4">
                Professional LUFS Meter
              </h2>
              <ProfessionalLUFSMeter
                momentaryLUFS={momentaryLUFS}
                shortTermLUFS={shortTermLUFS}
                integratedLUFS={integratedLUFS}
                targetLUFS={targetLUFS}
                genreName={targetLUFS === -14 ? 'Spotify Standard' : targetLUFS === -8 ? 'Club/Festival' : 'Drum & Bass'}
                isProcessing={false}
              />
              
              {/* Demo controls */}
              <div className="mt-4 p-3 bg-zinc-900 rounded border border-zinc-800">
                <label className="text-[8px] font-mono text-zinc-500 block mb-2">
                  DEMO: Adjust Integrated LUFS
                </label>
                <input
                  type="range"
                  min={-20}
                  max={-3}
                  step={0.1}
                  value={integratedLUFS}
                  onChange={(e) => setIntegratedLUFS(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-[10px] font-mono text-zinc-600 mt-1 text-center">
                  Integrated: {integratedLUFS.toFixed(1)} LUFS | Target: {targetLUFS.toFixed(1)} LUFS
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="pt-8 border-t border-zinc-800 text-center space-y-2">
          <div className="text-[10px] font-mono text-zinc-600">
            All components are fully functional with default values • No errors • Production ready
          </div>
          <div className="text-[8px] font-mono text-zinc-700">
            Built with React + TypeScript + Motion + Tailwind CSS
          </div>
        </div>
      </div>
    </div>
  );
}