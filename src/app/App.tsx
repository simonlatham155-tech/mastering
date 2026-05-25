import { useState, useEffect, useRef } from 'react';
import { CircuitDriveKnob } from './components/circuit-drive-knob';
import { LogicToggle } from './components/logic-toggle';
import { GearSelector, GearProfileId, gearProfiles } from './components/gear-selector';
import { MeterDisplay } from './components/meter-display';
import { GainStageVisualizer } from './components/gain-stage-visualizer';
import { WaveformVisualizer } from './components/waveform-visualizer';
import { SpectralAnalyzer } from './components/spectral-analyzer';
import { LUFSMeter } from './components/lufs-meter';
import { ExportPanel, ExportPresetId } from './components/export-panel';
import { HeritageAlert } from './components/heritage-alert';
import { AudioInputSection } from './components/audio-input-section';
import { LiveModeToggle } from './components/live-mode-toggle';
import { PerformanceClipMeter } from './components/performance-clip-meter';
import { ChunkSelector } from './components/chunk-selector';
import { SignalChainVisualizer } from './components/signal-chain-visualizer';
import { GenreProfileInfo } from './components/genre-profile-info';
import { GainReductionMeter } from './components/gain-reduction-meter';
import { TruePeakIndicator } from './components/true-peak-indicator';
import { DamageReportPanel } from './components/damage-report-panel';
import { HQModeToggle } from './components/hq-mode-toggle';
import { InterSamplePeakMeter } from './components/inter-sample-peak-meter';
import { AdvancedCompressorControls, AdvancedCompressorSettings } from './components/advanced-compressor-controls';
import { AudioPlayer } from './components/audio-player';
import { ProfileAdjustmentsPanel, ProfileAdjustments } from './components/profile-adjustments';
import { resolveProcessingPlan } from './data/preset-resolution';
import { toast, Toaster } from 'sonner';
import { audioProcessor, AudioAnalysis, HeritageProfile } from './services/audio-processor';
import { analyzeAudioFile as analyzeInputAudio, AudioAnalysisResult } from './utils/audio-analyzer';
import { AIMasteringEngine, AIMasteringRecommendation } from './services/ai-mastering-engine';
import { MasteringWorkflow } from './components/mastering-workflow';
import { AIRecommendationPanel } from './components/ai-recommendation-panel';
import { RealtimeAudioPlayer } from './services/realtime-audio-player';
import { PlaybackControls } from './components/playback-controls';
import { motion } from 'motion/react';

type LogicMode = 'brickwall' | 'dynamics';
// PerformanceMode removed (2026-02-16) - studio mastering only

export default function App() {
  const [circuitDrive, setCircuitDrive] = useState(50);
  const [logicMode, setLogicMode] = useState<LogicMode>('dynamics');
  const [gearProfile, setGearProfile] = useState<GearProfileId>('deephouse');
  const [exportPreset, setExportPreset] = useState<ExportPresetId>('spotify'); // DEFAULT: Spotify Standard (-14 LUFS) - safe for beginners
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHeritageAlert, setShowHeritageAlert] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [meterValues, setMeterValues] = useState({ peak: 0, lra: 0 });
  const [heritageProfile, setHeritageProfile] = useState<HeritageProfile>('none');
  
  // Real-time audio player (processes audio live during playback - NO pre-rendering!)
  const realtimePlayerRef = useRef<RealtimeAudioPlayer | null>(null);
  const [playbackState, setPlaybackState] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [bypassMode, setBypassMode] = useState(false); // A/B comparison: false = processed, true = original
  
  // Audio Input Analysis
  const [inputAnalysis, setInputAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // AI Mastering Recommendation
  const [aiRecommendation, setAIRecommendation] = useState<AIMasteringRecommendation | null>(null);
  const [isApplyingAI, setIsApplyingAI] = useState(false);
  
  // Performance mode removed (2026-02-16) - studio mastering only
  const [zeroLatencyMode, setZeroLatencyMode] = useState(false);
  const [autoMonoBass, setAutoMonoBass] = useState(false);
  const [clipIndicator, setClipIndicator] = useState(false);
  
  // Profile Adjustments
  const [profileAdjustments, setProfileAdjustments] = useState<ProfileAdjustments>({
    lowShelfBoost: 2.5,
    midRangeAdjust: -0.5,
    highShelfBoost: 1.0,
    stereoWidth: 85,
    saturationAmount: 35
  });
  
  // Advanced Compressor Settings (Pro-Grade AudioWorklet)
  const [advancedCompressor, setAdvancedCompressor] = useState<AdvancedCompressorSettings>({
    threshold: -20,
    ratio: 4.0,
    knee: 6.0,
    attack: 5, // ms
    release: 100, // ms
    makeupGain: 0,
    detectionMode: 'rms',
    sidechainHPF: true,
    hpfCutoff: 80
  });
  
  // Reference-Grade DSP State
  const [hqMode, setHQMode] = useState(true);
  const [truePeakDBTP, setTruePeakDBTP] = useState(-1.0);
  const [digitalPeakDB, setDigitalPeakDB] = useState(-1.5);
  const [gainReductionDB, setGainReductionDB] = useState(0);
  const [ispDifference, setISPDifference] = useState(0);
  const [cpuUsage, setCPUUsage] = useState(18.5);
  
  // Gain Reduction Metering (from AudioWorklet)
  const [gainReduction, setGainReduction] = useState(0);
  const [inputLevel, setInputLevel] = useState(-60);
  
  // Chunk-based preview (Beatport-style)
  const [selectedChunk, setSelectedChunk] = useState(0);
  const [chunkDuration] = useState(30); // Fixed 30s chunks
  
  // REMOVED: Draft Mode playback state (2026-02-17) - reverted to AudioPlayer
  
  // Real audio analysis when file is uploaded
  useEffect(() => {
    if (selectedFile) {
      analyzeAudioFile();
    } else {
      setIsProcessing(false);
      setShowHeritageAlert(false);
      setAnalysis(null);
      setProcessedBuffer(null);
      setMeterValues({ peak: 0, lra: 0 });
    }
  }, [selectedFile]);

  // Auto-process when performance mode is selected after analysis
  // REMOVED: Performance Mode is a separate tool, not required for main processing
  
  // Check for heritage alert when switching to brickwall mode
  useEffect(() => {
    if (logicMode === 'brickwall' && analysis && analysis.dynamicRange > 10 && selectedFile) {
      setShowHeritageAlert(true);
    } else {
      setShowHeritageAlert(false);
    }
  }, [logicMode, analysis, selectedFile]);

  // Sync profile adjustments when gear profile changes
  useEffect(() => {
    const profile = gearProfiles.find(p => p.id === gearProfile);
    if (profile) {
      setProfileAdjustments({
        lowShelfBoost: profile.lowShelfBoost,
        midRangeAdjust: profile.midRangeAdjust,
        highShelfBoost: profile.highShelfBoost,
        stereoWidth: profile.stereoWidth,
        saturationAmount: profile.saturationAmount
      });
    }
  }, [gearProfile]);

  // === LIVE PARAMETER UPDATES (PATCH 2026-05-25: Viktor) ===
  // Wire profile adjustment sliders to real-time audio parameter updates.
  // These fire instantly via AudioParam.setTargetAtTime (50ms ramp, no clicks).
  
  // EQ + Stereo Width + Saturation → live updateParameter calls
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player) return;
    
    // EQ: direct dB values
    player.updateParameter('lowShelfGain', profileAdjustments.lowShelfBoost);
    player.updateParameter('midRangeGain', profileAdjustments.midRangeAdjust);
    player.updateParameter('highShelfGain', profileAdjustments.highShelfBoost);
    
    // Stereo Width: 0-100% → 0-1.0
    player.updateParameter('stereoWidth', profileAdjustments.stereoWidth / 100);
    
    // Saturation: drive both transformer and tape proportionally
    // saturationAmount 0-100 → transformer drive 0-1, tape drive 0-0.5
    const satNorm = profileAdjustments.saturationAmount / 100;
    player.updateParameter('transformerDrive', satNorm);
    player.updateParameter('tapeDrive', satNorm * 0.5);
  }, [profileAdjustments]);
  
  // Logic Mode / Genre / Export Preset → full chain rebuild (changes DSP topology)
  // Uses a ref to track previous values so we only rebuild on actual changes,
  // not on initial mount.
  const prevChainSettingsRef = useRef({ logicMode, gearProfile, exportPreset, circuitDrive });
  
  useEffect(() => {
    const prev = prevChainSettingsRef.current;
    const changed = (
      prev.logicMode !== logicMode ||
      prev.gearProfile !== gearProfile ||
      prev.exportPreset !== exportPreset ||
      prev.circuitDrive !== circuitDrive
    );
    prevChainSettingsRef.current = { logicMode, gearProfile, exportPreset, circuitDrive };
    
    if (!changed) return; // Skip initial mount
    
    const player = realtimePlayerRef.current;
    if (!player || !analysis) return;
    
    // Build fresh settings + plan and rebuild the chain
    const rebuildAsync = async () => {
      const { getExportPreset } = await import('./data/export-presets');
      const preset = getExportPreset(exportPreset);
      const { resolveProcessingPlan } = await import('./data/preset-resolution');
      const plan = resolveProcessingPlan({ genreId: gearProfile, exportPresetId: exportPreset });
      
      const settings = {
        circuitDrive,
        logicMode,
        targetLUFS: preset.lufs,
        exportPresetId: exportPreset,
        genreId: gearProfile,
        gearProfile,
        userOverrides: {
          width: profileAdjustments.stereoWidth / 100,
          bassTilt: profileAdjustments.lowShelfBoost,
          mudCut: profileAdjustments.midRangeAdjust,
          airTilt: profileAdjustments.highShelfBoost,
          colorAmount: profileAdjustments.saturationAmount / 100,
        },
      };
      
      player.rebuildChain(settings, plan, bypassMode);
      console.log(`🔄 Chain rebuilt: ${logicMode.toUpperCase()} / ${gearProfile} / ${exportPreset} / drive=${circuitDrive}%`);
      
      // Re-render processed waveform in background for visualization
      (async () => {
        try {
          const waveformBuffer = await audioProcessor.renderExport(settings);
          setProcessedBuffer(waveformBuffer);
          console.log('🎨 Processed waveform updated after settings change');
        } catch (err) {
          console.warn('Waveform re-render failed (non-critical):', err);
        }
      })();
    };
    
    rebuildAsync();
  }, [logicMode, gearProfile, exportPreset, circuitDrive, analysis]);

  const analyzeAudioFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    toast.info('Analyzing audio file...');

    try {
      // Load and analyze
      await audioProcessor.loadAudioFile(selectedFile);
      
      // Store original buffer for playback/visualization
      const original = audioProcessor.getOriginalBuffer();
      setOriginalBuffer(original);
      
      console.log('📊 Original buffer stored:', {
        channels: original?.numberOfChannels,
        duration: original?.duration.toFixed(2),
        sampleRate: original?.sampleRate
      });
      
      const analysisResult = await audioProcessor.analyzeAudio();
      setAnalysis(analysisResult);

      toast.success(`Analysis complete: ${analysisResult.lufs.toFixed(1)} LUFS`);

      // Auto-process in draft mode for instant A/B comparison
      // Pass the buffer directly (state hasn't updated yet!)
      await processAudioFile(analysisResult, original);
    } catch (error) {
      console.error('Audio analysis failed:', error);
      toast.error('Failed to analyze audio file');
      setIsProcessing(false);
    }
    // Note: finally block removed - processAudioFile manages isProcessing state
  };

  const processAudioFile = async (analysisData?: AudioAnalysis, sourceBuffer?: AudioBuffer) => {
    console.log('⚡ Initializing real-time draft player (NO pre-rendering!)');
    
    // Use passed analysis or state analysis
    const currentAnalysis = analysisData || analysis;
    
    if (!selectedFile || !currentAnalysis) {
      console.log('❌ Early return - missing requirements:', { hasFile: !!selectedFile, hasAnalysis: !!currentAnalysis });
      return;
    }

    try {
      // Get target LUFS from selected export preset
      const { getExportPreset } = await import('./data/export-presets');
      const preset = getExportPreset(exportPreset);
      const targetLUFS = preset.lufs;
      
      // Build processing plan
      const { resolveProcessingPlan } = await import('./data/preset-resolution');
      const plan = resolveProcessingPlan({
        genreId: gearProfile,
        exportPresetId: exportPreset,
      });
      
      // Initialize RealtimeAudioPlayer (processes audio live during playback)
      if (!realtimePlayerRef.current) {
        realtimePlayerRef.current = new RealtimeAudioPlayer();
      }
      
      // Load the audio file into the player
      await realtimePlayerRef.current.loadAudio(selectedFile);
      
      console.log('✅ Real-time player ready! Audio will be processed live during playback');
      console.log('   No pre-rendering! Instant start! 🚀');
      
      toast.success('⚡ Draft mode ready - hit play to hear live processing!');
      
      // === BACKGROUND: Render processed waveform for visualization ===
      // This runs async after the player is ready — doesn't block playback.
      // The user can start playing immediately; waveform appears when ready.
      (async () => {
        try {
          console.log('🎨 Generating processed waveform for visualization...');
          const waveformBuffer = await audioProcessor.renderExport({
            circuitDrive,
            logicMode,
            genreId: gearProfile,
            exportPresetId: exportPreset,
            targetLUFS: preset.lufs,
            gearProfile,
            userOverrides: {
              width: profileAdjustments.stereoWidth / 100,
              bassTilt: profileAdjustments.lowShelfBoost,
              mudCut: profileAdjustments.midRangeAdjust,
              airTilt: profileAdjustments.highShelfBoost,
              colorAmount: profileAdjustments.saturationAmount / 100,
            },
          });
          setProcessedBuffer(waveformBuffer);
          console.log('🎨 Processed waveform ready for visualization');
        } catch (err) {
          console.warn('Waveform render failed (non-critical):', err);
        }
      })();
      
      // Set up playback state polling
      const pollInterval = setInterval(() => {
        if (realtimePlayerRef.current) {
          setPlaybackState(realtimePlayerRef.current.getState());
        }
      }, 50); // Poll at 20Hz for smooth UI updates
      
      // Store interval ID for cleanup
      (realtimePlayerRef.current as any).pollInterval = pollInterval;
      
    } catch (error) {
      console.error('❌ Failed to initialize player:', error);
      toast.error('Failed to initialize player');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    
    // Run input analysis
    setIsAnalyzing(true);
    setInputAnalysis(null);
    setAIRecommendation(null);
    
    try {
      const result = await analyzeInputAudio(file);
      setInputAnalysis(result);
      
      // Generate AI recommendation
      const recommendation = AIMasteringEngine.recommend(result);
      setAIRecommendation(recommendation);
      
      toast.success(`Input: ${result.lufs.toFixed(1)} LUFS • DR ${result.dynamicRange.toFixed(1)}dB • Genre: ${result.suggestedGenre}`, {
        duration: 4000
      });
    } catch (error) {
      console.error('Input analysis failed:', error);
      toast.error('Failed to analyze input audio');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyAIRecommendation = async () => {
    if (!aiRecommendation) return;
    
    setIsApplyingAI(true);
    
    try {
      // Apply recommended settings
      setCircuitDrive(aiRecommendation.circuitDrive);
      setLogicMode(aiRecommendation.logicMode);
      setGearProfile(aiRecommendation.gearProfile);
      
      toast.success(`AI settings applied: ${aiRecommendation.circuitDrive}% THD, ${aiRecommendation.logicMode.toUpperCase()} mode, ${aiRecommendation.gearProfile.toUpperCase()} profile`);
      
      // Auto-dismiss the AI panel after applying
      setTimeout(() => {
        setAIRecommendation(null);
      }, 2000);
      
    } catch (error) {
      console.error('Failed to apply AI recommendation:', error);
      toast.error('Failed to apply AI settings');
    } finally {
      setIsApplyingAI(false);
    }
  };

  const handleDismissAIRecommendation = () => {
    setAIRecommendation(null);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setIsProcessing(false);
    setShowHeritageAlert(false);
    setInputAnalysis(null);
    setAIRecommendation(null);
    setAnalysis(null);
    setProcessedBuffer(null);
    setOriginalBuffer(null);
    setMeterValues({ peak: 0, lra: 0 });
  };

  const handleExport = async (presetId: ExportPresetId) => {
    if (!selectedFile || !analysis) {
      toast.error('No audio to export');
      return;
    }

    setIsProcessing(true);
    toast.info(`Rendering ${presetId.toUpperCase()} optimized master...`);

    try {
      // Import export preset to get target LUFS
      const { getExportPreset } = await import('./data/export-presets');
      const preset = getExportPreset(presetId);
      const targetLUFS = preset.lufs;

      // Render at export quality using NEW renderExport() method
      const finalBuffer = await audioProcessor.renderExport({
        circuitDrive,
        logicMode,
        // performanceMode removed - always studio
        genreId: gearProfile, // gearProfile IS the genreId in current UI
        exportPresetId: presetId,
        targetLUFS,
        gearProfile, // Legacy - keep during migration
        userOverrides: {
          width: profileAdjustments.stereoWidth / 100, // Convert 0-100% to 0-1.0
          bassTilt: profileAdjustments.lowShelfBoost,
          mudCut: profileAdjustments.midRangeAdjust,
          airTilt: profileAdjustments.highShelfBoost,
          colorAmount: profileAdjustments.saturationAmount / 100, // Convert 0-100% to 0-1.0
        },
      });

      // Export as WAV
      const blob = await audioProcessor.exportAsWAV(finalBuffer);
      
      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedFile.name.replace(/\.[^/.]+$/, '')}_${presetId}_master.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${presetId.toUpperCase()} master exported (${targetLUFS} LUFS)`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSwitchToDynamics = () => {
    setLogicMode('dynamics');
    setShowHeritageAlert(false);
  };
  
  // Real-time playback handlers
  const handlePlay = async () => {
    if (!realtimePlayerRef.current || !analysis) return;
    
    const { getExportPreset } = await import('./data/export-presets');
    const preset = getExportPreset(exportPreset);
    const targetLUFS = preset.lufs;
    
    const { resolveProcessingPlan } = await import('./data/preset-resolution');
    const plan = resolveProcessingPlan({
      genreId: gearProfile,
      exportPresetId: exportPreset,
    });
    
    const settings = {
      circuitDrive,
      logicMode,
      targetLUFS,
      exportPresetId: exportPreset,
      genreId: gearProfile,
      gearProfile,
      userOverrides: {
        width: profileAdjustments.stereoWidth / 100,
        bassTilt: profileAdjustments.lowShelfBoost,
        mudCut: profileAdjustments.midRangeAdjust,
        airTilt: profileAdjustments.highShelfBoost,
        colorAmount: profileAdjustments.saturationAmount / 100,
      },
    };
    
    realtimePlayerRef.current.play(settings, plan, bypassMode);
  };
  
  const handlePause = () => {
    if (!realtimePlayerRef.current) return;
    realtimePlayerRef.current.pause();
  };
  
  const handleSeek = (timeSeconds: number) => {
    if (!realtimePlayerRef.current) return;
    realtimePlayerRef.current.seek(timeSeconds);
    // If we were playing, resume from new position
    if (playbackState.isPlaying && analysis) {
      handlePlay();
    }
  };
  
  const handleJumpTo = (timeSeconds: number) => {
    handleSeek(timeSeconds);
  };
  
  // A/B comparison toggle
  const handleBypassToggle = async () => {
    const newBypassMode = !bypassMode;
    setBypassMode(newBypassMode);
    
    // Seamlessly switch bypass mode without stopping playback
    if (realtimePlayerRef.current) {
      realtimePlayerRef.current.toggleBypass(newBypassMode);
      toast.info(newBypassMode ? '🎵 Original (Bypass)' : '✨ Processed');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <Toaster position="top-right" />
      
      {/* Professional VST Rack Housing - Brushed Aluminum */}
      <div 
        className="min-h-screen p-8"
        style={{
          background: `
            linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(255,255,255,0.01) 2px,
              rgba(255,255,255,0.01) 4px
            )
          `
        }}
      >
        <div className="max-w-7xl mx-auto">
          {/* Main Content - rack panel */}
          <main className="max-w-7xl mx-auto px-12 py-8">
            {/* Header - VST Professional Typography */}
            <header className="text-left mb-12">
              <div>
                <h1 className="text-2xl mb-2 tracking-tight font-sans uppercase leading-none">
                  <span className="text-cyan-400 font-light">LATHAM</span>
                  <span className="text-white font-bold">AUDIO</span>
                  <span className="text-white text-lg"> AI MASTERING SUITE</span>
                </h1>
                <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  Algorithmic Mastering Chain • Intelligent Signal Processing
                </p>
              </div>
            </header>

            {/* Heritage Alert */}
            <div className="mb-6">
              <HeritageAlert
                show={showHeritageAlert}
                alertType={
                  analysis && analysis.dynamicRange > 13 
                    ? 'brickwall-dr-conflict' 
                    : 'info'
                }
                dynamicRange={analysis?.dynamicRange}
                crestFactor={analysis?.crestFactor}
                onSwitchToDynamics={handleSwitchToDynamics}
                onDismiss={() => setShowHeritageAlert(false)}
              />
            </div>

            {/* Audio Input Section (Upload + Performance Mode) */}
            <div className="mb-6">
              <div 
                className="relative border-2 rounded-lg p-8"
                style={{
                  borderColor: '#2a2a2a',
                  background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                  boxShadow: `
                    inset 0 2px 4px rgba(0,0,0,0.6),
                    inset 0 -1px 2px rgba(255,255,255,0.05),
                    0 8px 16px rgba(0,0,0,0.5)
                  `
                }}
              >
                {/* Rack screws */}
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                    style={{
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-0.5 bg-zinc-900"></div>
                    </div>
                  </div>
                ))}

                <AudioInputSection
                  onFileSelect={handleFileSelect}
                  onClear={handleClearFile}
                  selectedFile={selectedFile}
                  isProcessing={isProcessing}
                  analysisResult={inputAnalysis}
                  isAnalyzing={isAnalyzing}
                />
              </div>
            </div>

            {/* Live Performance Options removed (2026-02-16) - studio mastering only */}

            {/* AI Recommendation Panel */}
            <AIRecommendationPanel
              recommendation={aiRecommendation}
              onApply={handleApplyAIRecommendation}
              onDismiss={handleDismissAIRecommendation}
              isApplying={isApplyingAI}
            />

            {/* Mastering Workflow: INPUT → GEAR → OUTPUT */}
            {inputAnalysis && (
              <div 
                className="relative border-2 rounded-lg p-6 mb-6"
                style={{
                  borderColor: '#2a2a2a',
                  background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                  boxShadow: `
                    inset 0 2px 4px rgba(0,0,0,0.6),
                    inset 0 -1px 2px rgba(255,255,255,0.05),
                    0 8px 16px rgba(0,0,0,0.5)
                  `
                }}
              >
                {/* Rack screws */}
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                    style={{
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-0.5 bg-zinc-900"></div>
                    </div>
                  </div>
                ))}

                <MasteringWorkflow
                  inputAnalysis={inputAnalysis}
                  circuitDrive={circuitDrive}
                  logicMode={logicMode}
                  gearProfile={gearProfile}
                  targetLUFS={aiRecommendation?.targetLUFS || -14}
                />
              </div>
            )}

            {/* Main Control Panel - single rack unit */}
            <div 
              className="relative border-2 rounded-lg p-8 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-4' : 'bottom-4'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              {/* 3-column grid layout - ORIGINAL */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <CircuitDriveKnob value={circuitDrive} onChange={setCircuitDrive} logicMode={logicMode} />
                <LogicToggle mode={logicMode} onChange={setLogicMode} />
                <GearSelector selectedProfile={gearProfile} onChange={setGearProfile} />
              </div>
            </div>

            {/* Meter Display - separate panel */}
            <div 
              className="relative border-2 rounded-lg p-8 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-4' : 'bottom-4'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <MeterDisplay 
                mode={logicMode === 'brickwall' ? 'peak' : 'lra'} 
                isProcessing={isProcessing}
                value={logicMode === 'brickwall' ? meterValues.peak : meterValues.lra}
              />
            </div>

            {/* Reference-Grade DSP Section - NEW! */}
            {selectedFile && (
              <div 
                className="relative border-2 rounded-lg p-6 mb-6"
                style={{
                  borderColor: '#2a2a2a',
                  background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                  boxShadow: `
                    inset 0 2px 4px rgba(0,0,0,0.6),
                    inset 0 -1px 2px rgba(255,255,255,0.05),
                    0 8px 16px rgba(0,0,0,0.5)
                  `
                }}
              >
                {/* Rack screws */}
                {[0, 1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                    style={{
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-0.5 bg-zinc-900"></div>
                    </div>
                  </div>
                ))}

                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    <h2 className="text-xs font-mono text-purple-400 uppercase tracking-wider">
                      Reference-Grade DSP
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* HQ Mode Toggle */}
                    <HQModeToggle
                      enabled={hqMode}
                      onToggle={setHQMode}
                      cpuUsage={cpuUsage}
                    />

                    {/* True Peak Indicator */}
                    <TruePeakIndicator
                      truePeakDBTP={truePeakDBTP}
                      ceiling={-0.3}
                      enabled={hqMode}
                    />

                    {/* Gain Reduction Meter */}
                    <GainReductionMeter
                      gainReductionDB={gainReductionDB}
                      lookaheadMS={5}
                      showGhost={hqMode}
                    />
                  </div>

                  {/* Inter-Sample Peak Meter (full width when ISP detected) */}
                  {hqMode && (
                    <InterSamplePeakMeter
                      digitalPeakDB={digitalPeakDB}
                      truePeakDBTP={truePeakDBTP}
                      ispDifference={ispDifference}
                      hqMode={hqMode}
                    />
                  )}
                  
                  {/* Damage Report Panel - Quality Guardrails (2026-02-16) */}
                  {analysis?.damageReport && (
                    <div className="mt-6">
                      <DamageReportPanel damageReport={analysis.damageReport} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Profile Adjustments Panel - separate rack unit */}
            <div 
              className="relative border-2 rounded-lg p-6 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <ProfileAdjustmentsPanel
                adjustments={profileAdjustments}
                onChange={setProfileAdjustments}
              />
            </div>

            {/* Signal Chain Visualizer - separate rack unit */}
            <div 
              className="relative border-2 rounded-lg p-6 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <SignalChainVisualizer
                isProcessing={isProcessing}
                gearProfile={gearProfile}
              />
            </div>

            {/* Genre Profile Info - separate rack unit */}
            <div 
              className="relative border-2 rounded-lg p-6 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <GenreProfileInfo gearProfile={gearProfile} />
            </div>

            {/* Gain Stage Visualizer - separate rack unit */}
            <div 
              className="relative border-2 rounded-lg p-6 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <GainStageVisualizer 
                isProcessing={isProcessing} 
                circuitDrive={circuitDrive}
                gearProfile={gearProfile}
                hasProcessedAudio={!!selectedFile && !!analysis}
              />
            </div>

            {/* Audio Player with Real-Time Processing */}
            <div 
              className="relative border-2 rounded-lg p-6 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                boxShadow: `
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 2px rgba(255,255,255,0.05),
                  0 8px 16px rgba(0,0,0,0.5)
                `
              }}
            >
              {/* Rack screws */}
              {[0, 1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className={`absolute ${i < 2 ? 'top-3' : 'bottom-3'} ${i % 2 === 0 ? 'left-4' : 'right-4'} w-3 h-3 rounded-full bg-zinc-800 border border-zinc-700`}
                  style={{
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-0.5 bg-zinc-900"></div>
                  </div>
                </div>
              ))}

              <PlaybackControls
                playbackState={playbackState}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                onJumpTo={handleJumpTo}
                bypassMode={bypassMode}
                onBypassToggle={handleBypassToggle}
                originalBuffer={originalBuffer}
                processedBuffer={processedBuffer}
              />
            </div>
            
            {/* Export Panel */}
            <ExportPanel 
              onExport={handleExport} 
              disabled={!selectedFile || !analysis || isProcessing}
              currentTarget={exportPreset ? exportPreset : undefined}
            />
          </main>
        </div>
      </div>
    </div>
  );
}