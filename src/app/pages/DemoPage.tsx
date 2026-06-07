/**
 * Public A/B demo — generic black-box vs genre-aware Latham mastering.
 * Route: #/demo
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';
import { ArrowLeft, Sparkles, Zap } from 'lucide-react';
import { AudioInputSection } from '../components/audio-input-section';
import { PlaybackControls } from '../components/playback-controls';
import { CompactLufsMeter } from '../components/compact-lufs-meter';
import { gearProfiles } from '../components/gear-selector';
import type { ProfileAdjustments } from '../components/profile-adjustments';
import { audioProcessor } from '../services/audio-processor';
import { analyzeAudioFile as analyzeInputAudio } from '../utils/audio-analyzer';
import { AIMasteringEngine, type AIMasteringRecommendation } from '../services/ai-mastering-engine';
import {
  RealtimeAudioPlayer,
  type LufsMeterData,
} from '../services/realtime-audio-player';
import {
  buildAIDemoContext,
  buildAppProcessingPlan,
  buildAppProcessingSettings,
  buildGenericDemoContext,
  DEFAULT_PRO_DYNAMICS,
} from '../services/app-processing-context';
import type { ProcessingPlan } from '../data/preset-resolution';
import type { ProcessingSettings } from '../services/audio-processor';
import { getExportPreset } from '../data/export-presets';
import { CreatorAboutStrip } from '../components/creator-about-strip';

type CompareMode = 'generic' | 'latham';

function syncProfileForGear(gearProfile: string): ProfileAdjustments {
  const profile = gearProfiles.find((p) => p.id === gearProfile);
  if (!profile) {
    return { lowShelfBoost: 0, midRangeAdjust: 0, highShelfBoost: 0, stereoWidth: 50 };
  }
  return {
    lowShelfBoost: profile.lowShelfBoost,
    midRangeAdjust: profile.midRangeAdjust,
    highShelfBoost: profile.highShelfBoost,
    stereoWidth: profile.stereoWidth,
  };
}

export default function DemoPage() {
  const playerRef = useRef<RealtimeAudioPlayer | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>('latham');
  const [recommendation, setRecommendation] = useState<AIMasteringRecommendation | null>(null);
  const [inputLufs, setInputLufs] = useState<number | null>(null);
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [playbackState, setPlaybackState] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [outputLufs, setOutputLufs] = useState<LufsMeterData | null>(null);
  const [truePeakDBTP, setTruePeakDBTP] = useState(-1.0);

  const genericBundleRef = useRef<{ settings: ProcessingSettings; plan: ProcessingPlan } | null>(null);
  const lathamBundleRef = useRef<{ settings: ProcessingSettings; plan: ProcessingPlan } | null>(null);
  const aiProfileRef = useRef<ProfileAdjustments>(syncProfileForGear('deephouse'));

  const activeTarget =
    compareMode === 'generic'
      ? getExportPreset('spotify').lufs
      : recommendation
        ? getExportPreset(
            recommendation.targetLUFS <= -12
              ? 'spotify'
              : recommendation.targetLUFS <= -7
                ? 'club'
                : 'extreme'
          ).lufs
        : -14;

  const syncPlaybackState = useCallback(() => {
    if (playerRef.current) {
      setPlaybackState(playerRef.current.getState());
    }
  }, []);

  const getPlaybackTime = useCallback(
    () => playerRef.current?.getState().currentTime ?? 0,
    []
  );

  const getActiveBundle = useCallback(() => {
    return compareMode === 'generic' ? genericBundleRef.current : lathamBundleRef.current;
  }, [compareMode]);

  const wireMeters = useCallback((player: RealtimeAudioPlayer) => {
    player.setMeterCallback((data) => {
      if (Number.isFinite(data.truePeakDBTP)) setTruePeakDBTP(data.truePeakDBTP);
    });
    player.setLufsMeterCallback(setOutputLufs);
  }, []);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setIsReady(false);
    setRecommendation(null);
    setInputLufs(null);
    setOriginalBuffer(null);
    setProcessedBuffer(null);
    setOutputLufs(null);

    setIsAnalyzing(true);
    toast.info('Analyzing your mix…');

    try {
      await audioProcessor.loadAudioFile(file);
      const original = audioProcessor.getOriginalBuffer();
      setOriginalBuffer(original);

      const inputResult = await analyzeInputAudio(file);
      setInputLufs(inputResult.lufs);

      const rec = AIMasteringEngine.recommend(inputResult);
      setRecommendation(rec);
      aiProfileRef.current = syncProfileForGear(rec.gearProfile);

      const genericCtx = buildGenericDemoContext(DEFAULT_PRO_DYNAMICS);
      const lathamCtx = buildAIDemoContext(rec, aiProfileRef.current, DEFAULT_PRO_DYNAMICS);

      genericBundleRef.current = {
        settings: buildAppProcessingSettings(genericCtx),
        plan: buildAppProcessingPlan(genericCtx),
      };
      lathamBundleRef.current = {
        settings: buildAppProcessingSettings(lathamCtx),
        plan: buildAppProcessingPlan(lathamCtx),
      };

      if (!playerRef.current) {
        playerRef.current = new RealtimeAudioPlayer();
      }
      await playerRef.current.loadAudio(file);
      wireMeters(playerRef.current);

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(syncPlaybackState, 50);

      setIsReady(true);
      toast.success(`Detected ${rec.gearProfile} — toggle A/B to compare`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to analyze file');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClear = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    playerRef.current?.stop();
    setSelectedFile(null);
    setIsReady(false);
    setRecommendation(null);
    setOriginalBuffer(null);
    setProcessedBuffer(null);
    setOutputLufs(null);
    setPlaybackState({ isPlaying: false, currentTime: 0, duration: 0 });
  };

  const handlePlay = async () => {
    const player = playerRef.current;
    const bundle = getActiveBundle();
    if (!player || !bundle || !inputLufs) return;

    await player.play(
      bundle.settings,
      bundle.plan,
      false,
      undefined,
      false,
      inputLufs,
      undefined,
      'auto'
    );
    syncPlaybackState();
  };

  const handlePause = () => {
    playerRef.current?.pause();
    syncPlaybackState();
  };

  const handleSeek = (timeSeconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const wasPlaying = playbackState.isPlaying;
    player.seek(timeSeconds);
    syncPlaybackState();
    if (wasPlaying) void handlePlay();
  };

  const switchMode = async (mode: CompareMode) => {
    if (mode === compareMode) return;
    setCompareMode(mode);
    setOutputLufs(null);

    const player = playerRef.current;
    const bundle = mode === 'generic' ? genericBundleRef.current : lathamBundleRef.current;
    if (!player || !bundle) return;

    await player.switchProcessing(bundle.settings, bundle.plan, false, undefined, false, undefined, 'auto');
    syncPlaybackState();
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Toaster position="top-right" />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-3">
          <a
            href="#/"
            className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Full mastering suite
          </a>
          <h1 className="text-2xl font-mono font-bold tracking-tight">
            <span className="text-cyan-400">Black box</span> vs{' '}
            <span className="text-white">genre-aware</span>
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
            Upload a mix. Hear generic one-size-fits-all mastering next to a chain tuned for your
            genre — with verified BS.1770 loudness and true peak on the same meter path as export.
          </p>
          <CreatorAboutStrip variant="compact" />
        </header>

        <AudioInputSection
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          onClear={handleClear}
          isProcessing={isAnalyzing}
          isAnalyzing={isAnalyzing}
        />

        {isReady && recommendation && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void switchMode('generic')}
                className={`rounded-lg border p-4 text-left transition-all ${
                  compareMode === 'generic'
                    ? 'border-zinc-500 bg-zinc-800/80 ring-1 ring-zinc-400/30'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                    Generic black box
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Smile-curve EQ, brickwall limit, mono bass — no genre detection. Like automated
                  online mastering.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void switchMode('latham')}
                className={`rounded-lg border p-4 text-left transition-all ${
                  compareMode === 'latham'
                    ? 'border-cyan-500/50 bg-cyan-950/30 ring-1 ring-cyan-400/30'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-cyan-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                    Latham · {recommendation.gearProfile}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {recommendation.reasoning}
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CompactLufsMeter
                lufs={outputLufs}
                targetLUFS={activeTarget}
                isPlaying={playbackState.isPlaying}
              />
              <div
                className="border rounded-lg p-4"
                style={{
                  background: 'linear-gradient(180deg, #0f0f0f, #0a0a0a)',
                  borderColor: '#2a2a2a',
                }}
              >
                <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-2">
                  True peak (live)
                </div>
                <div
                  className={`text-2xl font-mono font-bold ${
                    playbackState.isPlaying ? 'text-cyan-400' : 'text-zinc-600'
                  }`}
                >
                  {Number.isFinite(truePeakDBTP) ? `${truePeakDBTP.toFixed(1)} dBTP` : '—'}
                </div>
                <div className="text-[9px] font-mono text-zinc-600 mt-1">
                  Input was {inputLufs?.toFixed(1)} LUFS
                </div>
              </div>
            </div>

            <PlaybackControls
              playbackState={playbackState}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onJumpTo={handleSeek}
              originalBuffer={originalBuffer}
              processedBuffer={processedBuffer}
              getPlaybackTime={getPlaybackTime}
            />

            <p className="text-[10px] font-mono text-zinc-600 text-center">
              Switch modes while playing — same playhead, different chain.{' '}
              <a href="#/" className="text-cyan-500/80 hover:text-cyan-400">
                Open full suite for export →
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
