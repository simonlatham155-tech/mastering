import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CircuitDriveKnob } from './components/circuit-drive-knob';
import { LogicToggle } from './components/logic-toggle';
import { GearProfileId, gearProfiles } from './components/gear-selector';
import { ProRackSection } from './components/pro-rack-section';
import { ProOutputMeters } from './components/pro-output-meters';
import { GainStageVisualizer } from './components/gain-stage-visualizer';
import { WaveformVisualizer } from './components/waveform-visualizer';
import { SpectralAnalyzer } from './components/spectral-analyzer';
import { LUFSMeter } from './components/lufs-meter';
import { ExportPanel, ExportPresetId } from './components/export-panel';
import { HeritageAlert } from './components/heritage-alert';
import { AudioInputSection } from './components/audio-input-section';
import { PerformanceClipMeter } from './components/performance-clip-meter';
import { ChunkSelector } from './components/chunk-selector';
import { SignalChainVisualizer } from './components/signal-chain-visualizer';
import { GenreProfileInfo } from './components/genre-profile-info';
import { ProfileAdjustmentsPanel, ProfileAdjustments } from './components/profile-adjustments';
import { ProDynamicsPanel } from './components/pro-dynamics-panel';
import { getExportPreset } from './data/export-presets';
import {
  appliedRecommendationFromAI,
  applyProfileAdjustmentsToPlayer,
  applyProDynamicsToPlayer,
  buildAppProcessingPlan,
  buildAppProcessingSettings,
  DEFAULT_PRO_DYNAMICS,
  DEFAULT_TONAL_MATCH_STRENGTH,
  buildProDynamicsForGear,
  NEUTRAL_PROFILE_ADJUSTMENTS,
  resolveEffectiveInputTrimDB,
  resolveLimiterCeilingOverride,
  type AppProcessingContext,
  type ProDynamicsSettings,
} from './services/app-processing-context';
import { toast, Toaster } from 'sonner';
import { audioProcessor, AudioAnalysis, HeritageProfile } from './services/audio-processor';
import { buildInputAnalysisFromProcessor, AudioAnalysisResult } from './utils/audio-analyzer';
import { AIMasteringEngine, AIMasteringRecommendation } from './services/ai-mastering-engine';
import { MixSetupPanel, type MixSetupSummary } from './components/mix-setup-panel';
import { RealtimeAudioPlayer, type LufsMeterData } from './services/realtime-audio-player';
import { buildExportQualityReport } from './utils/measure-buffer-loudness';
import { preloadLufsMeterWorkletScript } from './services/lufs-meter-worklet';
import { preloadFaustLimiterFactory, faustVendorModuleUrl } from './services/faust-limiter';
import {
  computeAutoInputTrimDB,
  masterExportFilename,
  runMasterExport,
} from './services/master-export-pipeline';
import {
  batchResultsToZip,
  runBatchAlbumExport,
} from './services/batch-export';
import { batchZipFilename } from './utils/master-export-utils';
import { renderWaveformPreviewWithAutoStaging } from './services/waveform-preview-staging';
import {
  formatWaveformPreviewDuration,
  resolveWaveformPreviewSeconds,
} from './utils/waveform-preview-duration';
import { computeBypassGainMatchDB } from './utils/gain-match';
import { computeStagingTrimStep } from './utils/auto-staging';
import { PlaybackControls } from './components/playback-controls';
import { ReferenceMatchPanel } from './components/reference-match-panel';
import { ActiveSettingsStrip } from './components/active-settings-strip';
import { ReferenceMatchingController } from './services/reference-matching-controller';
import type { SpectralProfile } from './services/spectral-analyzer';
import { getReferenceCurveForGear } from './utils/gear-reference-map';
import {
  matchingAutoGainToOutputTrimDelta,
  matchingGainsToProfileAdjustments,
} from './utils/matching-gains-to-eq';
import { BatchExportPanel } from './components/batch-export-panel';
import { ProductNav } from './components/product-nav';
import { CreatorAboutStrip } from './components/creator-about-strip';
import {
  getSharedAudioContext,
  yieldToMain,
  withTimeout,
} from './services/shared-audio-context';
import { deliverBlobToUser, tryAutoDownloadBlob } from './utils/blob-download';
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
    proDynamics: ProDynamicsSettings;
  },
  overrides?: Partial<AppProcessingContext>
): AppProcessingContext {
  return {
    gearProfile: overrides?.gearProfile ?? state.gearProfile,
    exportPreset: overrides?.exportPreset ?? state.exportPreset,
    logicMode: overrides?.logicMode ?? state.logicMode,
    circuitDrive: overrides?.circuitDrive ?? state.circuitDrive,
    profileAdjustments: overrides?.profileAdjustments ?? state.profileAdjustments,
    proDynamics: overrides?.proDynamics ?? state.proDynamics,
  };
}

function syncProfileAdjustmentsForGear(
  _gearProfile: GearProfileId
): ProfileAdjustments {
  // Sliders are offsets from genre defaults — reset tweaks when gear changes.
  return { ...NEUTRAL_PROFILE_ADJUSTMENTS };
}

export default function App() {
  useEffect(() => {
    preloadLufsMeterWorkletScript();
    const vendorUrl = faustVendorModuleUrl();
    if (!document.querySelector(`link[rel="modulepreload"][href="${vendorUrl}"]`)) {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = vendorUrl;
      document.head.appendChild(link);
    }
    void preloadFaustLimiterFactory().catch((err) => {
      console.warn('[Faust] Preload failed (FIR fallback will be used):', err);
    });
  }, []);

  const [circuitDrive, setCircuitDrive] = useState(50);
  const [recommendedCircuitDrive, setRecommendedCircuitDrive] = useState<number | null>(null);
  const [logicMode, setLogicMode] = useState<LogicMode>('dynamics');
  const [gearProfile, setGearProfile] = useState<GearProfileId>('deephouse');
  const [exportPreset, setExportPreset] = useState<ExportPresetId>('spotify'); // DEFAULT: Spotify Standard (-14 LUFS) - safe for beginners
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showHeritageAlert, setShowHeritageAlert] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [isWaveformRendering, setIsWaveformRendering] = useState(false);
  const [meterValues, setMeterValues] = useState({ peak: 0, lra: 0 });
  const [heritageProfile, setHeritageProfile] = useState<HeritageProfile>('none');
  
  // Auto Input Trim — if the mix peaks above -3dB, attenuate to give the chain headroom.
  const autoInputTrimDB = analysis
    ? computeAutoInputTrimDB(analysis.peakLevel)
    : undefined;

  // Real-time audio player (processes audio live during playback - NO pre-rendering!)
  const realtimePlayerRef = useRef<RealtimeAudioPlayer | null>(null);
  const uploadGenRef = useRef(0);
  const waveformRenderGenRef = useRef(0);
  const waveformSkipTrimRerenderRef = useRef(false);
  const skipChainPreviewOnceRef = useRef(false);
  const waveformPreviewScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRebuildGenRef = useRef(0);
  const chainRebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waveformDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackState, setPlaybackState] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [bypassMode, setBypassMode] = useState(false); // A/B comparison: false = processed, true = original
  const [expertMode, setExpertMode] = useState(false);
  /** Ozone-style level-matched A/B — boosts bypass to processed loudness (export unchanged). */
  const [gainMatchEnabled, setGainMatchEnabled] = useState(false);
  const [bypassGainMatchDB, setBypassGainMatchDB] = useState(0);
  /** HQ: export-quality chain (Faust ceiling, 4× saturation OS) for live + waveform. */
  const [hqMode, setHQMode] = useState(true);

  const [spectralProfile, setSpectralProfile] = useState<SpectralProfile | null>(null);
  const [matchStrength, setMatchStrength] = useState(DEFAULT_TONAL_MATCH_STRENGTH);
  const [isSpectralAnalyzing, setIsSpectralAnalyzing] = useState(false);
  const referenceMatchControllerRef = useRef<ReferenceMatchingController | null>(null);
  const referenceMatchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Audio Input Analysis
  const [inputAnalysis, setInputAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isReady = !!selectedFile && !!analysis;
  const measuredInputLUFS = analysis?.lufs ?? inputAnalysis?.lufs ?? -16;

  const [profileAdjustments, setProfileAdjustments] = useState<ProfileAdjustments>(
    NEUTRAL_PROFILE_ADJUSTMENTS
  );

  const [proDynamics, setProDynamics] = useState<ProDynamicsSettings>(DEFAULT_PRO_DYNAMICS);
  const [outputLufs, setOutputLufs] = useState<LufsMeterData | null>(null);
  const [lastExportReport, setLastExportReport] = useState<ReturnType<typeof buildExportQualityReport> | null>(null);
  const [lastExportStaging, setLastExportStaging] = useState<{ iterations: number; outputTrimDB: number } | null>(null);
  const [pendingDownload, setPendingDownload] = useState<{
    blob: Blob;
    filename: string;
    label: string;
  } | null>(null);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  /** Bumps when realtime player is created so meter callbacks attach after upload. */
  const [playerEpoch, setPlayerEpoch] = useState(0);
  const [batchExportProgress, setBatchExportProgress] = useState<{
    index: number;
    total: number;
    name: string;
  } | null>(null);
  const liveStageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveInputTrimDB = resolveEffectiveInputTrimDB(proDynamics, autoInputTrimDB);
  const limiterCeilingOverride = resolveLimiterCeilingOverride(proDynamics);

  const wireRealtimePlayerMeters = useCallback((player: RealtimeAudioPlayer) => {
    player.setMeterCallback((data) => {
      if (Number.isFinite(data.truePeakDBTP)) setTruePeakDBTP(data.truePeakDBTP);
      if (Number.isFinite(data.digitalPeakDB)) setDigitalPeakDB(data.digitalPeakDB);
      if (Number.isFinite(data.gainReductionDB)) setGainReductionDB(data.gainReductionDB);
      if (Number.isFinite(data.ispDifference)) setISPDifference(data.ispDifference);
      setMeterValues((prev) => ({
        peak: Math.abs(data.truePeakDBTP),
        lra: prev.lra,
      }));
    });

    player.setSSLMeterCallback((data) => {
      if (Number.isFinite(data.gainReductionDB)) setGainReduction(data.gainReductionDB);
      if (Number.isFinite(data.inputLevelDB)) setInputLevel(data.inputLevelDB);
    });

    player.setLufsMeterCallback((data) => {
      setOutputLufs(data);
    });
  }, []);

  const registerPendingDownload = useCallback((blob: Blob, filename: string, label: string) => {
    tryAutoDownloadBlob(blob, filename);
    setPendingDownload({ blob, filename, label });
  }, []);

  const saveFileToastAction = useCallback(
    (blob: Blob, filename: string) => ({
      label: 'Save file',
      onClick: () => {
        void deliverBlobToUser(blob, filename, {
          mimeType: blob.type || 'application/octet-stream',
        });
      },
    }),
    []
  );

  const startWaveformPreviewRender = useCallback(
    (
      settings: ReturnType<typeof buildAppProcessingSettings>,
      options?: { exportQuality?: boolean }
    ) => {
    const generation = ++waveformRenderGenRef.current;
    setIsWaveformRendering(true);
    const exportQuality = options?.exportQuality ?? false;

    const preset = getExportPreset(exportPreset);
    const ceilingDBTP = limiterCeilingOverride ?? preset.ceiling;
    const trackDuration =
      originalBuffer?.duration ?? audioProcessor.getOriginalBuffer()?.duration ?? 0;
    const previewSeconds = resolveWaveformPreviewSeconds(trackDuration);
    const previewLabel = formatWaveformPreviewDuration(previewSeconds);

    (async () => {
      try {
        const previewResult = await renderWaveformPreviewWithAutoStaging(
          settings,
          effectiveInputTrimDB,
          {
            limiterCeilingOverride,
            sslGlue: proDynamics.sslGlue,
            initialOutputTrimDB: proDynamics.outputTrimDB,
            targetLUFS: preset.lufs,
            ceilingDBTP,
            // Default waveform matches live listen (current trim, no staging loop).
            // HQ / export-quality button runs full auto-staging like delivery export.
            autoStage: exportQuality && proDynamics.autoStageOnExport,
            quality: exportQuality ? 'export' : 'preview',
            preserveMultiband: true,
            maxSeconds: previewSeconds,
          }
        );
        if (generation !== waveformRenderGenRef.current) return;
        setProcessedBuffer(previewResult.buffer);

        const original = originalBuffer ?? audioProcessor.getOriginalBuffer();
        if (original) {
          setBypassGainMatchDB(
            computeBypassGainMatchDB(original, previewResult.buffer)
          );
        }

        // Input headroom trim lowers level pre-chain; sync compensating output trim to live + UI.
        if (previewResult.staged && proDynamics.autoStageOnExport) {
          waveformSkipTrimRerenderRef.current = true;
          setProDynamics((prev) => ({
            ...prev,
            outputTrimDB: previewResult.outputTrimDB,
          }));
          realtimePlayerRef.current?.updateParameter(
            'outputTrim',
            previewResult.outputTrimDB
          );
        }

        if (exportQuality) {
          toast.success(
            `HQ waveform preview ready (export quality, first ${previewLabel})`
          );
        }
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
  },
  [
    exportPreset,
    limiterCeilingOverride,
    effectiveInputTrimDB,
    proDynamics.sslGlue,
    proDynamics.outputTrimDB,
    proDynamics.autoStageOnExport,
    originalBuffer,
  ]);

  /** Coalesce rapid preview requests (upload + tonal match + chain rebuild) into one render. */
  const scheduleWaveformPreviewRender = useCallback(
    (
      settings: ReturnType<typeof buildAppProcessingSettings>,
      options?: { exportQuality?: boolean; immediate?: boolean }
    ) => {
      if (waveformPreviewScheduleRef.current) {
        clearTimeout(waveformPreviewScheduleRef.current);
        waveformPreviewScheduleRef.current = null;
      }

      if (options?.immediate) {
        startWaveformPreviewRender(settings, options);
        return;
      }

      waveformPreviewScheduleRef.current = setTimeout(() => {
        waveformPreviewScheduleRef.current = null;
        startWaveformPreviewRender(settings, options);
      }, 750);
    },
    [startWaveformPreviewRender]
  );

  const syncPlaybackGainOptions = useCallback(() => {
    const player = realtimePlayerRef.current;
    if (!player) return;
    player.setPlaybackGainOptions(
      proDynamics.outputTrimDB,
      gainMatchEnabled ? bypassGainMatchDB : null
    );
  }, [proDynamics.outputTrimDB, gainMatchEnabled, bypassGainMatchDB]);

  const referenceCurve = useMemo(
    () => (isReady ? getReferenceCurveForGear(gearProfile) : null),
    [isReady, gearProfile]
  );

  const previewMatchingGains = useMemo(() => {
    if (!spectralProfile || !referenceCurve) return null;
    if (!referenceMatchControllerRef.current) {
      referenceMatchControllerRef.current = new ReferenceMatchingController(
        getSharedAudioContext()
      );
    }
    return referenceMatchControllerRef.current.calculateMatchingGains(
      spectralProfile,
      referenceCurve,
      matchStrength / 100
    );
  }, [spectralProfile, referenceCurve, matchStrength]);

  const analyzeSpectralProfile = useCallback(async (buffer: AudioBuffer | null) => {
    if (!buffer) {
      setSpectralProfile(null);
      return;
    }
    setIsSpectralAnalyzing(true);
    try {
      if (!referenceMatchControllerRef.current) {
        referenceMatchControllerRef.current = new ReferenceMatchingController(
          getSharedAudioContext()
        );
      }
      const profile = await referenceMatchControllerRef.current.analyzeTrack(buffer);
      setSpectralProfile(profile);
    } catch (err) {
      console.warn('Spectral profile analysis failed:', err);
      setSpectralProfile(null);
    } finally {
      setIsSpectralAnalyzing(false);
    }
  }, []);

  const applyReferenceMatchFromGains = useCallback(
    (matchingGains: NonNullable<typeof previewMatchingGains>, strength: number) => {
      if (strength <= 0) {
        setProfileAdjustments({ ...NEUTRAL_PROFILE_ADJUSTMENTS });
        const player = realtimePlayerRef.current;
        if (player) {
          applyProfileAdjustmentsToPlayer(player, gearProfile, NEUTRAL_PROFILE_ADJUSTMENTS);
        }
        return;
      }

      if (
        !matchingGains.bands.every(Number.isFinite) ||
        !Number.isFinite(matchingGains.autoGain)
      ) {
        console.warn('Skipping tonal match — non-finite matching gains');
        return;
      }

      const nextProfile = matchingGainsToProfileAdjustments(
        matchingGains,
        NEUTRAL_PROFILE_ADJUSTMENTS
      );
      setProfileAdjustments(nextProfile);

      const trimDelta = matchingAutoGainToOutputTrimDelta(matchingGains.autoGain);
      if (Math.abs(trimDelta) >= 0.05) {
        setProDynamics((prev) => {
          const nextTrim = Math.max(-6, Math.min(6, prev.outputTrimDB + trimDelta));
          realtimePlayerRef.current?.updateParameter('outputTrim', nextTrim);
          return { ...prev, outputTrimDB: nextTrim };
        });
      }

      const player = realtimePlayerRef.current;
      if (player) {
        applyProfileAdjustmentsToPlayer(player, gearProfile, nextProfile);
      }
    },
    [gearProfile]
  );

  const handleApplyReferenceMatch = useCallback(
    (strength: number) => {
      if (!previewMatchingGains) return;
      applyReferenceMatchFromGains(previewMatchingGains, strength);
    },
    [previewMatchingGains, applyReferenceMatchFromGains]
  );

  // Pro stack: tonal match applied by default when spectral analysis completes; slider adjusts live.
  useEffect(() => {
    if (!previewMatchingGains) return;

    if (referenceMatchDebounceRef.current) {
      clearTimeout(referenceMatchDebounceRef.current);
    }

    referenceMatchDebounceRef.current = setTimeout(() => {
      handleApplyReferenceMatch(matchStrength);
    }, matchStrength === 0 ? 0 : 300);

    return () => {
      if (referenceMatchDebounceRef.current) {
        clearTimeout(referenceMatchDebounceRef.current);
      }
    };
  }, [previewMatchingGains, matchStrength, handleApplyReferenceMatch]);
  
  // Mix analysis summary (shown in unified setup panel after upload)
  const [mixSetup, setMixSetup] = useState<MixSetupSummary | null>(null);
  
  // Reference-Grade DSP State
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
      setRecommendedCircuitDrive(null);
      setMeterValues({ peak: 0, lra: 0 });
    }
  }, [selectedFile]);

  // Reference tonal balance — run after core analysis so it never blocks upload.
  useEffect(() => {
    if (!originalBuffer || !analysis) return;
    void analyzeSpectralProfile(originalBuffer);
  }, [originalBuffer, analysis, analyzeSpectralProfile]);

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

  // Sync HQ mode to limiter meter worklet (live chain rebuild on toggle below).
  useEffect(() => {
    realtimePlayerRef.current?.setHQMode(hqMode);
  }, [hqMode]);

  // Wire live meters — must run after realtime player exists (post-upload).
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player || !isReady) return;

    wireRealtimePlayerMeters(player);

    return () => {
      player.setMeterCallback(null);
      player.setSSLMeterCallback(null);
      player.setLufsMeterCallback(null);
    };
  }, [isReady, playerEpoch, wireRealtimePlayerMeters]);

  // Reset user EQ/width offsets when gear profile changes (genre defaults + pro stack re-applied).
  const skipInitialGearResetRef = useRef(true);
  useEffect(() => {
    if (skipInitialGearResetRef.current) {
      skipInitialGearResetRef.current = false;
      return;
    }
    if (!analysis) return;

    setProfileAdjustments({ ...NEUTRAL_PROFILE_ADJUSTMENTS });
    setMatchStrength(DEFAULT_TONAL_MATCH_STRENGTH);
    setProDynamics(buildProDynamicsForGear(gearProfile, exportPreset, autoInputTrimDB));
  }, [gearProfile]);

  const prevExportPresetRef = useRef(exportPreset);
  useEffect(() => {
    if (prevExportPresetRef.current === exportPreset) return;
    prevExportPresetRef.current = exportPreset;
    if (!analysis) return;

    setProDynamics((prev) => {
      const next = buildProDynamicsForGear(gearProfile, exportPreset, autoInputTrimDB);
      return {
        ...next,
        outputTrimDB: prev.outputTrimDB,
        inputTrimDB: prev.inputTrimDB,
      };
    });
  }, [exportPreset, gearProfile, autoInputTrimDB, analysis]);

  // === LIVE PARAMETER UPDATES (PATCH 2026-05-25: Viktor) ===
  // Wire profile adjustment sliders to real-time audio parameter updates.
  // These fire instantly via AudioParam.setTargetAtTime (50ms ramp, no clicks).
  
  // EQ + Stereo Width → live updateParameter calls (instant, no clicks)
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player) return;

    applyProfileAdjustmentsToPlayer(player, gearProfile, profileAdjustments);
  }, [
    profileAdjustments.lowShelfBoost,
    profileAdjustments.midRangeAdjust,
    profileAdjustments.highShelfBoost,
    profileAdjustments.stereoWidth,
    gearProfile,
  ]);

  // Pro dynamics — live trim + SSL glue (no chain rebuild)
  useEffect(() => {
    const player = realtimePlayerRef.current;
    if (!player) return;

    applyProDynamicsToPlayer(player, proDynamics, autoInputTrimDB);
  }, [
    proDynamics.inputTrimDB,
    proDynamics.outputTrimDB,
    proDynamics.sslGlue,
    autoInputTrimDB,
  ]);

  // Live auto-staging — nudge output trim toward target during playback
  useEffect(() => {
    if (liveStageTimerRef.current) {
      clearTimeout(liveStageTimerRef.current);
      liveStageTimerRef.current = null;
    }

    if (!proDynamics.autoStageLive || !playbackState.isPlaying || !outputLufs) {
      return;
    }

    const integrated = outputLufs.integrated;
    if (!Number.isFinite(integrated) || integrated === -Infinity) {
      return;
    }

    liveStageTimerRef.current = setTimeout(() => {
      const target = getExportPreset(exportPreset).lufs;
      const ceiling =
        proDynamics.limiterCeilingDBTP ?? getExportPreset(exportPreset).ceiling;
      const peakDB = Number.isFinite(truePeakDBTP) ? truePeakDBTP : -12;

      const nextTrim = computeStagingTrimStep({
        integratedLUFS: integrated,
        targetLUFS: target,
        currentOutputTrimDB: proDynamics.outputTrimDB,
        peakDB,
        ceilingDBTP: ceiling,
      });

      if (nextTrim != null && Math.abs(nextTrim - proDynamics.outputTrimDB) >= 0.05) {
        setProDynamics((prev) => ({ ...prev, outputTrimDB: nextTrim }));
      }
    }, 2500);

    return () => {
      if (liveStageTimerRef.current) {
        clearTimeout(liveStageTimerRef.current);
        liveStageTimerRef.current = null;
      }
    };
  }, [
    outputLufs?.integrated,
    playbackState.isPlaying,
    proDynamics.autoStageLive,
    proDynamics.outputTrimDB,
    exportPreset,
    proDynamics.limiterCeilingDBTP,
    truePeakDBTP,
  ]);
  
  // Logic Mode / Genre / Export Preset → full chain rebuild (changes DSP topology)
  // Uses a ref to track previous values so we only rebuild on actual changes,
  // not on initial mount.
  const prevChainSettingsRef = useRef({
    logicMode,
    gearProfile,
    exportPreset,
    circuitDrive,
    hqMode,
    limiterCeilingDBTP: proDynamics.limiterCeilingDBTP,
    forceMonoBass: proDynamics.forceMonoBass,
    monoBassHz: proDynamics.monoBassHz,
    sslGlue: proDynamics.sslGlue,
  });
  
  useEffect(() => {
    const prev = prevChainSettingsRef.current;
    const changed = (
      prev.logicMode !== logicMode ||
      prev.gearProfile !== gearProfile ||
      prev.exportPreset !== exportPreset ||
      prev.circuitDrive !== circuitDrive ||
      prev.hqMode !== hqMode ||
      prev.limiterCeilingDBTP !== proDynamics.limiterCeilingDBTP ||
      prev.forceMonoBass !== proDynamics.forceMonoBass ||
      prev.monoBassHz !== proDynamics.monoBassHz ||
      prev.sslGlue !== proDynamics.sslGlue
    );
    prevChainSettingsRef.current = {
      logicMode,
      gearProfile,
      exportPreset,
      circuitDrive,
      hqMode,
      limiterCeilingDBTP: proDynamics.limiterCeilingDBTP,
      forceMonoBass: proDynamics.forceMonoBass,
      monoBassHz: proDynamics.monoBassHz,
      sslGlue: proDynamics.sslGlue,
    };
    
    if (!changed) return;

    const player = realtimePlayerRef.current;
    if (!player || !analysis) return;

    // Cancel any in-flight HQ waveform — preset/gear changes use fast preview quality.
    waveformRenderGenRef.current += 1;
    setIsWaveformRendering(false);

    if (chainRebuildTimerRef.current) {
      clearTimeout(chainRebuildTimerRef.current);
    }

    chainRebuildTimerRef.current = setTimeout(() => {
      chainRebuildTimerRef.current = null;
      const gen = ++chainRebuildGenRef.current;

      void (async () => {
        const ctx = buildProcessingContext({
          gearProfile,
          exportPreset,
          logicMode,
          circuitDrive,
          profileAdjustments,
          proDynamics,
        });
        const plan = buildAppProcessingPlan(ctx);
        const settings = buildAppProcessingSettings(ctx);

        if (gen !== chainRebuildGenRef.current) return;

        await player.rebuildChain(
          settings,
          plan,
          bypassMode,
          effectiveInputTrimDB,
          false,
          measuredInputLUFS,
          limiterCeilingOverride,
          proDynamics.sslGlue
        );

        if (gen !== chainRebuildGenRef.current) return;

        applyProfileAdjustmentsToPlayer(player, gearProfile, profileAdjustments);
        applyProDynamicsToPlayer(player, proDynamics, autoInputTrimDB);
        console.log(
          `🔄 Chain rebuilt: ${logicMode.toUpperCase()} / ${gearProfile} / ${exportPreset} / drive=${circuitDrive}%`
        );

        if (skipChainPreviewOnceRef.current) {
          skipChainPreviewOnceRef.current = false;
        } else {
          scheduleWaveformPreviewRender(settings);
        }
      })();
    }, 350);

    return () => {
      if (chainRebuildTimerRef.current) {
        clearTimeout(chainRebuildTimerRef.current);
        chainRebuildTimerRef.current = null;
      }
    };
  }, [
    logicMode,
    gearProfile,
    exportPreset,
    circuitDrive,
    hqMode,
    proDynamics.limiterCeilingDBTP,
    proDynamics.forceMonoBass,
    proDynamics.monoBassHz,
    proDynamics.sslGlue,
    analysis,
  ]);

  // Re-render waveform when EQ / trim sliders move (live audio updates instantly; viz needs a pass).
  useEffect(() => {
    if (!analysis || !realtimePlayerRef.current) return;

    if (waveformSkipTrimRerenderRef.current) {
      waveformSkipTrimRerenderRef.current = false;
      return;
    }

    if (waveformDebounceRef.current) {
      clearTimeout(waveformDebounceRef.current);
    }

    waveformDebounceRef.current = setTimeout(() => {
      const ctx = buildProcessingContext({
        gearProfile,
        exportPreset,
        logicMode,
        circuitDrive,
        profileAdjustments,
        proDynamics,
      });
      scheduleWaveformPreviewRender(buildAppProcessingSettings(ctx));
    }, 400);

    return () => {
      if (waveformDebounceRef.current) {
        clearTimeout(waveformDebounceRef.current);
      }
    };
  }, [
    analysis,
    gearProfile,
    exportPreset,
    logicMode,
    circuitDrive,
    matchStrength,
    profileAdjustments.lowShelfBoost,
    profileAdjustments.midRangeAdjust,
    profileAdjustments.highShelfBoost,
    profileAdjustments.stereoWidth,
    effectiveInputTrimDB,
    proDynamics.outputTrimDB,
    proDynamics.inputTrimDB,
    proDynamics.autoStageOnExport,
    proDynamics.sslGlue,
    proDynamics.limiterCeilingDBTP,
  ]);

  const applyRecommendationToState = (recommendation: AIMasteringRecommendation) => {
    const applied = appliedRecommendationFromAI(recommendation);
    const syncedProfile = syncProfileAdjustmentsForGear(applied.gearProfile);

    setCircuitDrive(applied.circuitDrive);
    setRecommendedCircuitDrive(applied.circuitDrive);
    setLogicMode(applied.logicMode);
    setGearProfile(applied.gearProfile);
    setExportPreset(applied.exportPreset);
    if (syncedProfile) {
      setProfileAdjustments(syncedProfile);
    }

    return { applied, syncedProfile };
  };

  const analyzeAudioFile = async () => {
    if (!selectedFile) return;

    const uploadGen = uploadGenRef.current;
    setIsProcessing(true);
    setIsAnalyzing(true);

    const staleUpload = () => {
      if (uploadGen !== uploadGenRef.current) {
        setIsProcessing(false);
        return true;
      }
      return false;
    };

    const largeFile = selectedFile.size > 15 * 1024 * 1024;
    toast.info(
      largeFile
        ? 'Decoding large file — UI may pause briefly…'
        : 'Decoding audio file...'
    );

    try {
      await yieldToMain();

      await withTimeout(
        audioProcessor.loadAudioFile(selectedFile),
        120_000,
        'Audio decode'
      );

      if (staleUpload()) return;

      const original = audioProcessor.getOriginalBuffer();
      if (!original) {
        throw new Error('Failed to decode audio file');
      }
      setOriginalBuffer(original);

      toast.info('Analyzing audio file...');

      console.log('📊 Original buffer stored:', {
        channels: original.numberOfChannels,
        duration: original.duration.toFixed(2),
        sampleRate: original.sampleRate,
      });

      const analysisResult = await audioProcessor.analyzeAudio();
      if (staleUpload()) return;

      const inputResult = buildInputAnalysisFromProcessor(original, analysisResult);

      setInputAnalysis(inputResult);
      setAnalysis(analysisResult);
      setIsAnalyzing(false);

      void audioProcessor.refineAnalysisLoudnessBS1770().then((refined) => {
        if (!refined || uploadGen !== uploadGenRef.current) return;
        setAnalysis(refined);
        setInputAnalysis(buildInputAnalysisFromProcessor(original, refined));
        setMixSetup((prev) =>
          prev ? { ...prev, inputLufs: refined.lufs } : prev
        );
      });

      const recommendation = AIMasteringEngine.recommend(inputResult);

      setMixSetup({
        reasoning: recommendation.reasoning,
        confidence: recommendation.confidence,
        inputLufs: inputResult.lufs,
        suggestedGenre: inputResult.suggestedGenre,
      });

      const { applied } = applyRecommendationToState(recommendation);

      const inputTrim = computeAutoInputTrimDB(analysisResult.peakLevel);
      const proDefaults = buildProDynamicsForGear(
        applied.gearProfile,
        applied.exportPreset,
        inputTrim
      );
      setProDynamics(proDefaults);
      setMatchStrength(DEFAULT_TONAL_MATCH_STRENGTH);

      toast.success(
        `Mix configured: ${recommendation.gearProfile} • ${applied.circuitDrive}% warmth • ${inputResult.lufs.toFixed(1)} LUFS in`
      );

      const syncedProfile = syncProfileAdjustmentsForGear(applied.gearProfile);
      const processingContext = buildProcessingContext(
        {
          gearProfile,
          exportPreset,
          logicMode,
          circuitDrive,
          profileAdjustments,
          proDynamics,
        },
        {
          gearProfile: applied.gearProfile,
          exportPreset: applied.exportPreset,
          logicMode: applied.logicMode,
          circuitDrive: applied.circuitDrive,
          profileAdjustments: syncedProfile ?? profileAdjustments,
          proDynamics: proDefaults,
        }
      );

      if (staleUpload()) return;

      await processAudioFile(analysisResult, original, processingContext);
    } catch (error) {
      if (staleUpload()) return;
      console.error('Audio analysis failed:', error);
      const message =
        error instanceof Error && error.message.includes('timed out')
          ? 'Upload timed out — try a shorter clip or smaller file'
          : 'Failed to analyze audio file';
      toast.error(message);
      setIsProcessing(false);
    } finally {
      if (uploadGen === uploadGenRef.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const processAudioFile = async (
    analysisData?: AudioAnalysis,
    sourceBuffer?: AudioBuffer,
    processingContext?: AppProcessingContext
  ) => {
    console.log('⚡ Initializing real-time preview player (NO pre-rendering!)');

    const currentAnalysis = analysisData || analysis;
    const buffer = sourceBuffer ?? originalBuffer ?? audioProcessor.getOriginalBuffer();

    if (!selectedFile || !currentAnalysis || !buffer) {
      console.log('❌ Early return - missing requirements:', {
        hasFile: !!selectedFile,
        hasAnalysis: !!currentAnalysis,
        hasBuffer: !!buffer,
      });
      return;
    }

    const ctx = processingContext ?? buildProcessingContext({
      gearProfile,
      exportPreset,
      logicMode,
      circuitDrive,
      profileAdjustments,
      proDynamics,
    });
    const settings = buildAppProcessingSettings(ctx);

    try {
      if (!realtimePlayerRef.current) {
        realtimePlayerRef.current = new RealtimeAudioPlayer();
      }

      realtimePlayerRef.current.setHQMode(hqMode);
      wireRealtimePlayerMeters(realtimePlayerRef.current);
      setPlayerEpoch((epoch) => epoch + 1);

      realtimePlayerRef.current.loadBuffer(buffer);
      
      console.log('✅ Real-time player ready! Audio will be processed live during playback');
      console.log('   No pre-rendering! Instant start! 🚀');
      
      toast.success('⚡ Preview ready — hit play for live mastering');

      skipChainPreviewOnceRef.current = true;
      scheduleWaveformPreviewRender(settings);
      
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
    uploadGenRef.current += 1;
    setSelectedFile(file);
    setInputAnalysis(null);
    setMixSetup(null);
  };

  const handleClearFile = () => {
    uploadGenRef.current += 1;
    setSelectedFile(null);
    setIsProcessing(false);
    setIsExporting(false);
    setPendingDownload(null);
    setPlayerEpoch(0);
    setShowHeritageAlert(false);
    setInputAnalysis(null);
    setMixSetup(null);
    setAnalysis(null);
    waveformRenderGenRef.current += 1;
    setProcessedBuffer(null);
    setIsWaveformRendering(false);
    setOriginalBuffer(null);
    setSpectralProfile(null);
    setMatchStrength(DEFAULT_TONAL_MATCH_STRENGTH);
    setProDynamics(DEFAULT_PRO_DYNAMICS);
    setMeterValues({ peak: 0, lra: 0 });
  };

  const handleExport = async (presetId: ExportPresetId) => {
    if (!selectedFile || !analysis) {
      toast.error('No audio to export');
      return;
    }

    setIsExporting(true);

    try {
      const ctx = buildProcessingContext({
        gearProfile,
        exportPreset,
        logicMode,
        circuitDrive,
        profileAdjustments,
        proDynamics,
      });
      const settings = buildAppProcessingSettings({ ...ctx, exportPreset: presetId });
      const preset = getExportPreset(presetId);

      toast.info(
        proDynamics.autoStageOnExport
          ? `Rendering ${presetId.toUpperCase()} with auto-staging...`
          : `Rendering ${presetId.toUpperCase()} optimized master...`
      );

      const exportResult = await runMasterExport({
        settings,
        exportPresetId: presetId,
        proDynamics,
        autoInputTrimDB,
      });

      const report = exportResult.report;
      setLastExportReport(report);
      setLastExportStaging({
        iterations: exportResult.iterations,
        outputTrimDB: exportResult.outputTrimDB,
      });

      if (exportResult.staged) {
        setProDynamics((prev) => ({
          ...prev,
          outputTrimDB: exportResult.outputTrimDB,
        }));
      }

      const filename = masterExportFilename(selectedFile.name, presetId);
      registerPendingDownload(exportResult.wavBlob, filename, `${presetId.toUpperCase()} master`);

      const stageNote = exportResult.staged
        ? ` · auto-staged ${exportResult.outputTrimDB >= 0 ? '+' : ''}${exportResult.outputTrimDB.toFixed(1)} dB (${exportResult.iterations} pass${exportResult.iterations > 1 ? 'es' : ''})`
        : '';

      const lufsStr =
        report.integratedLUFS !== -Infinity
          ? `${report.integratedLUFS.toFixed(1)} LUFS integrated`
          : 'LUFS measure pending';

      const saveHint = ' If download did not start, click Save file.';
      const saveAction = saveFileToastAction(exportResult.wavBlob, filename);

      if (report.onTarget && report.peakOk) {
        toast.success(
          `${presetId.toUpperCase()} master exported — ${lufsStr}, true peak ${report.truePeakDBTP.toFixed(1)} dBTP (on target)${stageNote}.${saveHint}`,
          { action: saveAction, duration: 20000 }
        );
      } else if (!report.peakOk) {
        toast.warning(
          `${presetId.toUpperCase()} exported — ${lufsStr}. True peak ${report.truePeakDBTP.toFixed(1)} dBTP exceeds ceiling ${preset.ceiling} dBTP.${stageNote}${saveHint}`,
          { action: saveAction, duration: 20000 }
        );
      } else {
        toast.success(
          `${presetId.toUpperCase()} exported — ${lufsStr} (target ${preset.lufs}, Δ ${report.lufsDelta >= 0 ? '+' : ''}${report.lufsDelta.toFixed(1)} LU)${stageNote}.${saveHint}`,
          { action: saveAction, duration: 20000 }
        );
      }
    } catch (error) {
      console.error('Export failed:', error);
      const detail =
        error instanceof Error && error.message ? `: ${error.message}` : '';
      toast.error(`Failed to export audio${detail}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBatchExport = async (files: File[]) => {
    if (files.length === 0) return;

    const ctx = buildProcessingContext({
      gearProfile,
      exportPreset,
      logicMode,
      circuitDrive,
      profileAdjustments,
      proDynamics,
    });

    const restoreFile = selectedFile;
    setIsBatchExporting(true);
    setBatchExportProgress({ index: 0, total: files.length, name: files[0].name });

    toast.info(
      `Album export: ${files.length} track${files.length > 1 ? 's' : ''} · ${exportPreset.toUpperCase()} · full pipeline`
    );

    try {
      const summary = await runBatchAlbumExport(
        files,
        exportPreset,
        ctx,
        (p) =>
          setBatchExportProgress({
            index: p.index,
            total: p.total,
            name: p.currentName,
          })
      );

      const ok = summary.rows.filter((r) => r.ok);
      const failed = summary.rows.filter((r) => !r.ok);

      if (ok.length === 0) {
        toast.error('Batch export failed — no tracks rendered');
        return;
      }

      const zipBlob = await batchResultsToZip(summary.rows, batchZipFilename(exportPreset));
      const zipName = batchZipFilename(exportPreset);
      registerPendingDownload(zipBlob, zipName, 'Album ZIP');

      if (failed.length > 0) {
        toast.warning(
          `ZIP ready: ${ok.length}/${files.length} tracks · ${failed.length} failed (see manifest.json in ZIP). If download did not start, click Save file.`,
          { action: saveFileToastAction(zipBlob, zipName), duration: 20000 }
        );
      } else {
        toast.success(
          `Album ZIP exported — ${ok.length} track${ok.length > 1 ? 's' : ''} at ${getExportPreset(exportPreset).lufs} LUFS target. If download did not start, click Save file.`,
          { action: saveFileToastAction(zipBlob, zipName), duration: 20000 }
        );
      }
    } catch (error) {
      console.error('Batch export failed:', error);
      toast.error('Album batch export failed');
    } finally {
      setBatchExportProgress(null);
      setIsBatchExporting(false);

      if (restoreFile) {
        try {
          await audioProcessor.loadAudioFile(restoreFile);
          const refreshed = await audioProcessor.analyzeAudio();
          setAnalysis(refreshed);
          setOriginalBuffer(audioProcessor.getOriginalBuffer());
          void analyzeSpectralProfile(audioProcessor.getOriginalBuffer());
        } catch (err) {
          console.warn('Could not restore session after batch export:', err);
        }
      }
    }
  };

  const handleSwitchToDynamics = () => {
    setLogicMode('dynamics');
    setShowHeritageAlert(false);
  };
  
  // Real-time playback handlers
  const syncPlaybackState = useCallback(() => {
    if (realtimePlayerRef.current) {
      setPlaybackState(realtimePlayerRef.current.getState());
    }
  }, []);

  const getPlaybackTime = useCallback(
    () => realtimePlayerRef.current?.getState().currentTime ?? 0,
    []
  );

  const handlePlay = async () => {
    if (!realtimePlayerRef.current || !analysis) return;

    try {
      syncPlaybackGainOptions();

      const ctx = buildProcessingContext({
        gearProfile,
        exportPreset,
        logicMode,
        circuitDrive,
        profileAdjustments,
        proDynamics,
      });
      const plan = buildAppProcessingPlan(ctx);
      const settings = buildAppProcessingSettings(ctx);

      await realtimePlayerRef.current.play(
        settings,
        plan,
        bypassMode,
        effectiveInputTrimDB,
        false,
        measuredInputLUFS,
        limiterCeilingOverride,
        proDynamics.sslGlue
      );
      applyProfileAdjustmentsToPlayer(realtimePlayerRef.current, gearProfile, profileAdjustments);
      applyProDynamicsToPlayer(realtimePlayerRef.current, proDynamics, autoInputTrimDB);
      syncPlaybackState();
    } catch (error) {
      console.error('Playback failed:', error);
      toast.error('Preview playback failed — try clicking play again');
    }
  };
  
  const handlePause = () => {
    if (!realtimePlayerRef.current) return;
    realtimePlayerRef.current.pause();
    syncPlaybackState();
  };
  
  const handleSeek = (timeSeconds: number) => {
    if (!realtimePlayerRef.current) return;
    const wasPlaying = playbackState.isPlaying;
    realtimePlayerRef.current.seek(timeSeconds);
    syncPlaybackState();
    if (wasPlaying && analysis) {
      void handlePlay();
    }
  };
  
  const handleJumpTo = (timeSeconds: number) => {
    handleSeek(timeSeconds);
  };
  
  // A/B comparison toggle
  const handleBypassToggle = async () => {
    const newBypassMode = !bypassMode;
    setBypassMode(newBypassMode);

    syncPlaybackGainOptions();
    
    // Seamlessly switch bypass mode without stopping playback
    if (realtimePlayerRef.current) {
      await realtimePlayerRef.current.toggleBypass(newBypassMode);
      toast.info(
        newBypassMode
          ? gainMatchEnabled
            ? `🎵 Original (gain-matched +${bypassGainMatchDB.toFixed(1)} dB)`
            : '🎵 Original (unity)'
          : '✨ Processed (delivery level)'
      );
    }
  };

  const handleHqWaveformPreview = () => {
    if (!analysis) return;
    const ctx = buildProcessingContext({
      gearProfile,
      exportPreset,
      logicMode,
      circuitDrive,
      profileAdjustments,
      proDynamics,
    });
    toast.info(`Rendering HQ waveform preview (export quality, first ${formatWaveformPreviewDuration(
      resolveWaveformPreviewSeconds(
        originalBuffer?.duration ?? audioProcessor.getOriginalBuffer()?.duration ?? 0
      )
    )})…`);
    scheduleWaveformPreviewRender(buildAppProcessingSettings(ctx), {
      exportQuality: true,
      immediate: true,
    });
  };

  // Rebuild bypass path when Gain Match toggles during playback
  useEffect(() => {
    syncPlaybackGainOptions();
    if (!playbackState.isPlaying || !realtimePlayerRef.current) return;
    void realtimePlayerRef.current.toggleBypass(bypassMode);
  }, [gainMatchEnabled]);

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <Toaster position="top-right" />
      
      {/* Professional VST Rack Housing - Brushed Aluminum */}
      <div 
        className="min-h-screen p-4 md:p-6"
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
          <main className="max-w-7xl mx-auto px-4 md:px-8 py-6">
            {/* Header - VST Professional Typography */}
            <header className="text-left mb-8">
              <div>
                <h1 className="text-2xl mb-2 tracking-tight font-sans uppercase leading-none">
                  <span className="text-cyan-400 font-light">LATHAM</span>
                  <span className="text-white font-bold">AUDIO</span>
                  <span className="text-white text-lg"> MASTERING SUITE</span>
                </h1>
                <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider leading-relaxed">
                  Latham Audio · Plugins and other apps in development
                  {' · '}
                  <a
                    href="#/demo"
                    className="text-cyan-500/70 hover:text-cyan-400 normal-case tracking-normal"
                  >
                    Black box vs genre-aware demo →
                  </a>
                  <br />
                  <span className="normal-case tracking-normal text-zinc-400">
                    Built on three decades of recording, mixing and mastering best practices.
                  </span>
                </p>
              </div>
            </header>

            <ProductNav />

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
            {isReady && effectiveInputTrimDB != null && effectiveInputTrimDB < 0 && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">
                <span>🎚️</span>
                <span>Input trimmed by <strong>{Math.abs(effectiveInputTrimDB).toFixed(1)}dB</strong>
                  {proDynamics.inputTrimDB == null && autoInputTrimDB != null && ' (auto)'}
                  {' '}— mix peaks at {analysis?.peakLevel?.toFixed(1)}dBFS.</span>
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
                <p className="text-sm text-zinc-400 font-mono leading-relaxed max-w-2xl mx-auto">
                  Upload your mix and define your objective. We&apos;ll analyze the recording, recommend a
                  mastering strategy, and apply only the processing required to reach release standard.
                </p>
              </div>
            )}

            {isReady && (
              <>
            <MixSetupPanel
              summary={mixSetup}
              gearProfile={gearProfile}
              exportPreset={exportPreset}
              onGearChange={setGearProfile}
              onExportPresetChange={setExportPreset}
              isUpdatingPreview={isWaveformRendering}
            />

            <ActiveSettingsStrip
              gearProfile={gearProfile}
              exportPreset={exportPreset}
              circuitDrive={circuitDrive}
              logicMode={logicMode}
              tonalMatchStrength={matchStrength}
              proDynamics={proDynamics}
              hqMode={hqMode}
              hasInputTrim={effectiveInputTrimDB != null && effectiveInputTrimDB < 0}
              inputTrimDB={effectiveInputTrimDB}
            />

            {/* Playback — primary beginner action (listen before tweaking) */}
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

              <PlaybackControls
                playbackState={playbackState}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
                onJumpTo={handleJumpTo}
                bypassMode={bypassMode}
                onBypassToggle={handleBypassToggle}
                gainMatchEnabled={gainMatchEnabled}
                onGainMatchToggle={() => setGainMatchEnabled((v) => !v)}
                bypassGainMatchDB={bypassGainMatchDB}
                onHqWaveformPreview={expertMode ? handleHqWaveformPreview : undefined}
                originalBuffer={originalBuffer}
                processedBuffer={processedBuffer}
                isWaveformRendering={isWaveformRendering}
                showGainTrace={!bypassMode}
                gainReductionDB={gainReductionDB}
                outputTrimDB={proDynamics.outputTrimDB}
                getPlaybackTime={getPlaybackTime}
              />
            </div>

            {/* Core controls — warmth + dynamics mode */}
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

              {/* Core controls — warmth + dynamics mode */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-3xl mx-auto">
                <CircuitDriveKnob
                  value={circuitDrive}
                  onChange={setCircuitDrive}
                  logicMode={logicMode}
                  recommendedValue={recommendedCircuitDrive}
                  onResetRecommended={
                    recommendedCircuitDrive != null
                      ? () => setCircuitDrive(recommendedCircuitDrive)
                      : undefined
                  }
                />
                <LogicToggle mode={logicMode} onChange={setLogicMode} />
              </div>
            </div>

            {lastExportReport && lastExportReport.integratedLUFS !== -Infinity && (
              <div
                className={`mb-4 px-4 py-3 rounded-lg border text-sm font-mono ${
                  lastExportReport.onTarget && lastExportReport.peakOk
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                Last export:{' '}
                <strong>{lastExportReport.integratedLUFS.toFixed(1)} LUFS</strong> integrated
                {' '}(target {lastExportReport.targetLUFS},{' '}
                {lastExportReport.lufsDelta >= 0 ? '+' : ''}
                {lastExportReport.lufsDelta.toFixed(1)} LU)
                {' · '}
                true peak {lastExportReport.truePeakDBTP.toFixed(1)} dBTP
                {lastExportReport.ispDifference > 0.2 && (
                  <span className="text-purple-400">
                    {' '}(ISP +{lastExportReport.ispDifference.toFixed(1)} dB)
                  </span>
                )}
                {lastExportStaging?.iterations != null && lastExportStaging.iterations > 1 && (
                  <>
                    {' · '}
                    staged to {lastExportStaging.outputTrimDB >= 0 ? '+' : ''}
                    {lastExportStaging.outputTrimDB.toFixed(1)} dB
                  </>
                )}
                {lastExportReport.onTarget && lastExportReport.peakOk
                  ? ' — passes quality gate'
                  : ' — review levels before delivery'}
              </div>
            )}

            {pendingDownload && (
              <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-[10px] font-mono text-emerald-200">
                  <div>{pendingDownload.label} ready</div>
                  <div className="text-zinc-500 mt-0.5 truncate">{pendingDownload.filename}</div>
                  <div className="text-zinc-600 mt-1">
                    If your browser blocked the download, click Save file.
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void deliverBlobToUser(
                        pendingDownload.blob,
                        pendingDownload.filename,
                        { mimeType: pendingDownload.blob.type || 'application/octet-stream' }
                      )
                    }
                    className="px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  >
                    Save file
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDownload(null)}
                    className="px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider border border-zinc-600 text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {!expertMode && (
              <div
                className="relative border-2 rounded-lg p-6 mb-6"
                style={{
                  borderColor: '#2a2a2a',
                  background: 'linear-gradient(180deg, #1a1a1a, #0f0f0f)',
                }}
              >
                <div className="text-xs font-mono text-zinc-500 tracking-[0.3em] uppercase mb-2">
                  Export
                </div>
                <p className="text-[10px] font-mono text-zinc-600 mb-4 max-w-xl">
                  Uses your delivery target from Mix Setup ({getExportPreset(exportPreset).name},{' '}
                  {getExportPreset(exportPreset).lufs} LUFS). Listen first, then download.
                </p>
                <button
                  type="button"
                  onClick={() => handleExport(exportPreset)}
                  disabled={!selectedFile || !analysis || isExporting || isBatchExporting}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg font-mono text-sm uppercase tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(180deg, #10b981, #059669)',
                    color: '#fff',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  Download mastered WAV
                </button>
              </div>
            )}

            {/* Expert controls toggle */}
            <div className="mb-6 flex justify-center">
              <button
                type="button"
                onClick={() => setExpertMode(prev => !prev)}
                className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
              >
                {expertMode ? '▲ Hide pro controls' : '▼ Pro controls: meters, tonal match, album export, EQ…'}
              </button>
            </div>

            {expertMode && (
              <>
            <ProRackSection
              title="Output meters"
              subtitle="Live loudness, peaks, and limiter gain reduction — play to measure."
            >
              <ProOutputMeters
                hqMode={hqMode}
                onHqToggle={setHQMode}
                cpuUsage={cpuUsage}
                truePeakDBTP={truePeakDBTP}
                digitalPeakDB={digitalPeakDB}
                limiterGainReductionDB={gainReductionDB}
                sslGainReductionDB={gainReduction}
                ispDifference={ispDifference}
                ceilingDBTP={getExportPreset(exportPreset).ceiling}
                lufs={outputLufs}
                targetLUFS={getExportPreset(exportPreset).lufs}
                isPlaying={playbackState.isPlaying}
                logicMode={logicMode}
                isProcessing={isProcessing}
                meterValue={logicMode === 'brickwall' ? meterValues.peak : meterValues.lra}
                damageReport={analysis?.damageReport}
              />
            </ProRackSection>

            <ProRackSection
              title="Tonal shaping"
              subtitle="Match strength adjusts profile EQ live — manual EQ sliders below edit the same bands."
            >
              <ReferenceMatchPanel
                userProfile={spectralProfile}
                referenceCurve={referenceCurve}
                matchingGains={previewMatchingGains}
                matchStrength={matchStrength}
                defaultStrength={DEFAULT_TONAL_MATCH_STRENGTH}
                onMatchStrengthChange={setMatchStrength}
                onResetToDefault={() => setMatchStrength(DEFAULT_TONAL_MATCH_STRENGTH)}
                isAnalyzing={isSpectralAnalyzing}
                gearLabel={gearProfiles.find((p) => p.id === gearProfile)?.name}
              />
              <ProfileAdjustmentsPanel
                adjustments={profileAdjustments}
                onChange={setProfileAdjustments}
                gearProfile={gearProfile}
              />
            </ProRackSection>

            <ProRackSection
              title="Level & dynamics"
              subtitle="Staging, bus glue, and ceiling — independent of Mix Setup delivery target until you override."
            >
              <ProDynamicsPanel
                settings={proDynamics}
                onChange={setProDynamics}
                gearProfile={gearProfile}
                autoInputTrimDB={autoInputTrimDB}
                presetCeilingDBTP={getExportPreset(exportPreset).ceiling}
              />
            </ProRackSection>

            <ProRackSection
              title="Chain reference"
              subtitle="Signal path and genre characteristics for the active gear profile."
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SignalChainVisualizer
                  isProcessing={isProcessing}
                  gearProfile={gearProfile}
                />
                <GenreProfileInfo gearProfile={gearProfile} />
              </div>
              <GainStageVisualizer
                isProcessing={isProcessing}
                circuitDrive={circuitDrive}
                gearProfile={gearProfile}
                hasProcessedAudio={!!selectedFile && !!analysis}
              />
            </ProRackSection>

            <ProRackSection
              title="Export"
              subtitle="Single tracks or album batch — each preset renders independently."
            >
              <ExportPanel
                onExport={handleExport}
                disabled={!selectedFile || !analysis || isExporting || isBatchExporting}
                currentTarget={getExportPreset(exportPreset).lufs}
                selectedPreset={exportPreset}
              />
              <BatchExportPanel
                disabled={isExporting || isBatchExporting}
                isExporting={isBatchExporting}
                progress={batchExportProgress}
                selectedPreset={exportPreset}
                onBatchExport={handleBatchExport}
              />
            </ProRackSection>
              </>
            )}
              </>
            )}

            <CreatorAboutStrip variant="compact" />
          </main>
        </div>
      </div>
    </div>
  );
}