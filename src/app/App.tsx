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
import { GainReductionMeter, GainReductionMeterCompact } from './components/gain-reduction-meter';
import { TruePeakIndicator } from './components/true-peak-indicator';
import { DamageReportPanel } from './components/damage-report-panel';
import { HQModeToggle } from './components/hq-mode-toggle';
import { InterSamplePeakMeter } from './components/inter-sample-peak-meter';
import { AdvancedCompressorControls, AdvancedCompressorSettings } from './components/advanced-compressor-controls';
import { AudioPlayer } from './components/audio-player';
import { ProfileAdjustmentsPanel, ProfileAdjustments } from './components/profile-adjustments';
import { getGenrePreset } from './data/genre-presets';
import { getExportPreset } from './data/export-presets';
import {
  appliedRecommendationFromAI,
  buildAppProcessingPlan,
  buildAppProcessingSettings,
  type AppProcessingContext,
} from './services/app-processing-context';
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

function buildProcessingContext(
  state: {
    gearProfile: GearProfileId;
    exportPreset: ExportPresetId;
    logicMode: LogicMode;
    circuitDrive: number;
    profileAdjustments: ProfileAdjustments;
  },
  overrides?: Partial<AppProcessingContext>
): AppProcessingContext {
  return {
    gearProfile: overrides?.gearProfile ?? state.gearProfile,
    exportPreset: overrides?.exportPreset ?? state.exportPreset,
    logicMode: overrides?.logicMode ?? state.logicMode,
    circuitDrive: overrides?.circuitDrive ?? state.circuitDrive,
    profileAdjustments: overrides?.profileAdjustments ?? state.profileAdjustments,
  };
}

function syncProfileAdjustmentsForGear(
  gearProfile: GearProfileId,
  circuitDrive?: number
): ProfileAdjustments | null {
  const profile = gearProfiles.find(p => p.id === gearProfile);
  if (!profile) return null;

  return {
    lowShelfBoost: profile.lowShelfBoost,
    midRangeAdjust: profile.midRangeAdjust,
    highShelfBoost: profile.highShelfBoost,
    stereoWidth: profile.stereoWidth,
    saturationAmount: circuitDrive ?? profile.saturationAmount,
  };
}

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
  const [isWaveformRendering, setIsWaveformRendering] = useState(false);
  const [meterValues, setMeterValues] = useState({ peak: 0, lra: 0 });
  const [heritageProfile, setHeritageProfile] = useState<HeritageProfile>('none');
  
  // Auto Input Trim — if the mix peaks above -3dB, attenuate to give the chain headroom.
  // Same as a mastering engineer turning down the input gain on a hot mix.
  const inputTrimDB = (() => {
    if (!analysis) return undefined;
    const peakDB = analysis.peakLevel; // dBFS (negative)
    const TARGET_HEADROOM = -6; // Where we want peaks to sit before processing
    const TRIM_THRESHOLD = -3;  // Only trim if peaks are hotter than this
    if (peakDB > TRIM_THRESHOLD) {
      return TARGET_HEADROOM - peakDB; // Negative value = attenuate
    }
    return undefined; // No trim needed — mix has enough headroom
  })();

  // Real-time audio player (processes audio live during playback - NO pre-rendering!)
  const realtimePlayerRef = useRef<RealtimeAudioPlayer | null>(null);
  const waveformRenderGenRef = useRef(0);
  const [playbackState, setPlaybackState] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [bypassMode, setBypassMode] = useState(false); // A/B comparison: false = processed, true = original
  const [expertMode, setExpertMode] = useState(false);
  
  // Audio Input Analysis
  const [inputAnalysis, setInputAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isReady = !!selectedFile && !!analysis;
  const measuredInputLUFS = analysis?.lufs ?? inputAnalysis?.lufs ?? -16;

  const startWaveformPreviewRender = (settings: ReturnType<typeof buildAppProcessingSettings>) => {
    const generation = ++waveformRenderGenRef.current;
    setIsWaveformRendering(true);

    (async () => {
      try {
        const waveformBuffer = await audioProcessor.renderWaveformPreview(settings, inputTrimDB);
        if (generation !== waveformRenderGenRef.current) return;
        setProcessedBuffer(waveformBuffer);
      } catch (err) {
        if (generation !== waveformRenderGenRef.current) return;
        console.warn('Waveform preview failed (non-critical):', err);
        setProcessedBuffer(null);
      } finally {
        if (generation === waveformRenderGenRef.current) {
          setIsWaveformRendering(false);
        }
      }
    })();
  };
  
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
      setIsWaveformRendering(false);
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

  // Sync HQ mode to limiter meter worklet
  useEffect(() => {
    realtimePlayerRef.current?.setHQMode(hqMode);
  }, [hqMode]);

  // Wire live meter updates from the oversampling limiter worklet tap
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player || !isReady) return;

    player.setMeterCallback((data) => {
      if (Number.isFinite(data.truePeakDBTP)) setTruePeakDBTP(data.truePeakDBTP);
      if (Number.isFinite(data.digitalPeakDB)) setDigitalPeakDB(data.digitalPeakDB);
      if (Number.isFinite(data.gainReductionDB)) setGainReductionDB(data.gainReductionDB);
      if (Number.isFinite(data.ispDifference)) setISPDifference(data.ispDifference);
      setMeterValues(prev => ({
        peak: Math.abs(data.truePeakDBTP),
        lra: prev.lra,
      }));
    });

    return () => player.setMeterCallback(null);
  }, [isReady]);

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
  
  // EQ + Stereo Width → live updateParameter calls (instant, no clicks)
  // All slider values are OFFSETS from genre defaults (slider 0 / 50% = no change)
  //
  // NOTE: Saturation slider does NOT live-update drive AudioParams because
  // transformer/tape drive involves preGain + auto-gain compensation that
  // can't be set via a single AudioParam. Saturation applies on chain rebuild
  // (triggered by the separate useEffect below).
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player) return;
    
    const genre = getGenrePreset(gearProfile);
    if (!genre) return;
    
    // EQ: genre default + slider offset (slider 0 = genre default, +3 = genre + 3dB)
    player.updateParameter('lowShelfGain', genre.biases.bassTilt + profileAdjustments.lowShelfBoost);
    player.updateParameter('midRangeGain', genre.biases.mudCut + profileAdjustments.midRangeAdjust);
    player.updateParameter('highShelfGain', genre.biases.airTilt + profileAdjustments.highShelfBoost);
    
    // Stereo Width: genre default + offset (50% = genre default, 0% = -0.3, 100% = +0.3)
    const widthOffset = (profileAdjustments.stereoWidth - 50) / 100 * 0.6;
    player.updateParameter('stereoWidth', genre.biases.width + widthOffset);
  }, [profileAdjustments.lowShelfBoost, profileAdjustments.midRangeAdjust, 
      profileAdjustments.highShelfBoost, profileAdjustments.stereoWidth, gearProfile]);
  
  // Logic Mode / Genre / Export Preset → full chain rebuild (changes DSP topology)
  // Uses a ref to track previous values so we only rebuild on actual changes,
  // not on initial mount.
  const prevChainSettingsRef = useRef({ logicMode, gearProfile, exportPreset, circuitDrive, saturationAmount: profileAdjustments.saturationAmount });
  
  useEffect(() => {
    const prev = prevChainSettingsRef.current;
    const changed = (
      prev.logicMode !== logicMode ||
      prev.gearProfile !== gearProfile ||
      prev.exportPreset !== exportPreset ||
      prev.circuitDrive !== circuitDrive ||
      prev.saturationAmount !== profileAdjustments.saturationAmount
    );
    prevChainSettingsRef.current = { logicMode, gearProfile, exportPreset, circuitDrive, saturationAmount: profileAdjustments.saturationAmount };
    
    if (!changed) return; // Skip initial mount
    
    const player = realtimePlayerRef.current;
    if (!player || !analysis) return;
    
    // Build fresh settings + plan and rebuild the chain
    const rebuildAsync = async () => {
      const ctx = buildProcessingContext({
        gearProfile,
        exportPreset,
        logicMode,
        circuitDrive,
        profileAdjustments,
      });
      const plan = buildAppProcessingPlan(ctx);
      const settings = buildAppProcessingSettings(ctx);
      
      player.rebuildChain(settings, plan, bypassMode, inputTrimDB, false, measuredInputLUFS);
      console.log(`🔄 Chain rebuilt: ${logicMode.toUpperCase()} / ${gearProfile} / ${exportPreset} / drive=${circuitDrive}%`);
      
      // Re-render processed waveform in background for visualization
      startWaveformPreviewRender(settings);
    };
    
    rebuildAsync();
  }, [logicMode, gearProfile, exportPreset, circuitDrive, analysis]);

  const applyRecommendationToState = (recommendation: AIMasteringRecommendation) => {
    const applied = appliedRecommendationFromAI(recommendation);
    const syncedProfile = syncProfileAdjustmentsForGear(applied.gearProfile, applied.circuitDrive);

    setCircuitDrive(applied.circuitDrive);
    setLogicMode(applied.logicMode);
    setGearProfile(applied.gearProfile);
    setExportPreset(applied.exportPreset);
    if (syncedProfile) {
      setProfileAdjustments(syncedProfile);
    }

    setAIRecommendation(null);
    return { applied, syncedProfile };
  };

  const analyzeAudioFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setIsAnalyzing(true);
    toast.info('Analyzing audio file...');

    try {
      await audioProcessor.loadAudioFile(selectedFile);
      
      const original = audioProcessor.getOriginalBuffer();
      setOriginalBuffer(original);
      
      console.log('📊 Original buffer stored:', {
        channels: original?.numberOfChannels,
        duration: original?.duration.toFixed(2),
        sampleRate: original?.sampleRate
      });

      const inputResult = await analyzeInputAudio(selectedFile);
      setInputAnalysis(inputResult);

      const recommendation = AIMasteringEngine.recommend(inputResult);

      const { applied } = applyRecommendationToState(recommendation);

      toast.success(
        `Auto-configured: ${recommendation.gearProfile} • ${applied.circuitDrive}% warmth • ${inputResult.lufs.toFixed(1)} LUFS in`
      );
      
      const analysisResult = await audioProcessor.analyzeAudio();
      setAnalysis(analysisResult);

      const syncedProfile = syncProfileAdjustmentsForGear(applied.gearProfile, applied.circuitDrive);
      const processingContext = buildProcessingContext(
        {
          gearProfile,
          exportPreset,
          logicMode,
          circuitDrive,
          profileAdjustments,
        },
        {
          gearProfile: applied.gearProfile,
          exportPreset: applied.exportPreset,
          logicMode: applied.logicMode,
          circuitDrive: applied.circuitDrive,
          profileAdjustments: syncedProfile ?? profileAdjustments,
        }
      );

      await processAudioFile(analysisResult, original, processingContext);
    } catch (error) {
      console.error('Audio analysis failed:', error);
      toast.error('Failed to analyze audio file');
      setIsProcessing(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processAudioFile = async (
    analysisData?: AudioAnalysis,
    sourceBuffer?: AudioBuffer,
    processingContext?: AppProcessingContext
  ) => {
    console.log('⚡ Initializing real-time preview player (NO pre-rendering!)');
    
    const currentAnalysis = analysisData || analysis;
    
    if (!selectedFile || !currentAnalysis) {
      console.log('❌ Early return - missing requirements:', { hasFile: !!selectedFile, hasAnalysis: !!currentAnalysis });
      return;
    }

    const ctx = processingContext ?? buildProcessingContext({
      gearProfile,
      exportPreset,
      logicMode,
      circuitDrive,
      profileAdjustments,
    });
    const settings = buildAppProcessingSettings(ctx);

    try {
      if (!realtimePlayerRef.current) {
        realtimePlayerRef.current = new RealtimeAudioPlayer();
      }
      
      await realtimePlayerRef.current.loadAudio(selectedFile);
      
      console.log('✅ Real-time player ready! Audio will be processed live during playback');
      console.log('   No pre-rendering! Instant start! 🚀');
      
      toast.success('⚡ Preview ready — hit play for live mastering');
      
      startWaveformPreviewRender(settings);
      
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
    setInputAnalysis(null);
    setAIRecommendation(null);
  };

  const handleApplyAIRecommendation = async () => {
    if (!aiRecommendation) return;
    
    setIsApplyingAI(true);
    
    try {
      const { applied } = applyRecommendationToState(aiRecommendation);
      toast.success(`Settings applied: ${applied.circuitDrive}% warmth, ${applied.logicMode.toUpperCase()} mode, ${applied.gearProfile} profile`);
    } catch (error) {
      console.error('Failed to apply AI recommendation:', error);
      toast.error('Failed to apply settings');
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
    waveformRenderGenRef.current += 1;
    setProcessedBuffer(null);
    setIsWaveformRendering(false);
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
      const ctx = buildProcessingContext({
        gearProfile,
        exportPreset,
        logicMode,
        circuitDrive,
        profileAdjustments,
      });
      const settings = buildAppProcessingSettings({ ...ctx, exportPreset: presetId });

      const finalBuffer = await audioProcessor.renderExport(settings, inputTrimDB);

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

      const preset = getExportPreset(presetId);
      toast.success(`${presetId.toUpperCase()} master exported (${preset.lufs} LUFS)`);
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
    
    const ctx = buildProcessingContext({
      gearProfile,
      exportPreset,
      logicMode,
      circuitDrive,
      profileAdjustments,
    });
    const plan = buildAppProcessingPlan(ctx);
    const settings = buildAppProcessingSettings(ctx);
    
    await realtimePlayerRef.current.play(settings, plan, bypassMode, inputTrimDB, false, measuredInputLUFS);
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

            {/* Input Trim Indicator */}
            {isReady && inputTrimDB && inputTrimDB < 0 && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">
                <span>🎚️</span>
                <span>Input trimmed by <strong>{Math.abs(inputTrimDB).toFixed(1)}dB</strong> — your mix peaks at {analysis?.peakLevel?.toFixed(1)}dBFS. Headroom applied automatically for clean processing.</span>
              </div>
            )}

            {/* Low Dynamic Range Warning */}
            {isReady && analysis && analysis.dynamicRange < 6 && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                <span>⚠️</span>
                <span>Dynamic range is only <strong>{analysis.dynamicRange.toFixed(1)}dB</strong>. This mix may already be heavily compressed. If you have a limiter on your mix bus, try bypassing it before exporting.</span>
              </div>
            )}

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

            {!isReady && !isAnalyzing && (
              <div className="mb-6 text-center py-8 px-6 rounded-lg border border-zinc-800 bg-zinc-950/50">
                <p className="text-sm text-zinc-400 font-mono">
                  Upload a mix to begin — we&apos;ll detect genre, set warmth &amp; loudness targets, and prepare live preview.
                </p>
              </div>
            )}

            {isReady && (
              <>
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
                  targetLUFS={getExportPreset(exportPreset).lufs}
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

            {/* Live output meters (compact) */}
            <div
              className="relative border-2 rounded-lg px-6 py-4 mb-6"
              style={{
                borderColor: '#2a2a2a',
                background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                  Live Output
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <GainReductionMeterCompact gainReductionDB={gainReductionDB} />
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-zinc-500">TP:</span>
                    <span className={`text-xs font-mono font-bold ${
                      truePeakDBTP > -1 ? 'text-red-400' : truePeakDBTP > -3 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {Number.isFinite(truePeakDBTP) ? truePeakDBTP.toFixed(1) : '—'} dBTP
                    </span>
                  </div>
                  {hqMode && ispDifference > 0.3 && (
                    <span className="text-[9px] font-mono text-purple-400">
                      ISP +{ispDifference.toFixed(1)} dB
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Expert controls toggle */}
            <div className="mb-6 flex justify-center">
              <button
                type="button"
                onClick={() => setExpertMode(prev => !prev)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
              >
                {expertMode ? '▲ Hide expert rack' : '▼ Show expert rack (EQ, chain, meters…)'}
              </button>
            </div>

            {expertMode && (
              <>
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
                      ceiling={getExportPreset(exportPreset).ceiling}
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

            {/* Gain Stage Visualizer - expert only */}
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
              </>
            )}

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
                isWaveformRendering={isWaveformRendering}
              />
            </div>
            
            {/* Export Panel */}
            <ExportPanel 
              onExport={handleExport} 
              disabled={!selectedFile || !analysis || isProcessing}
              currentTarget={getExportPreset(exportPreset).lufs}
            />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}