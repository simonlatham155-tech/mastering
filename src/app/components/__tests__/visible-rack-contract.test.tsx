import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { resolveProcessingPlan } from '../../data/preset-resolution';
import { DEFAULT_RACK_STAGE_OVERRIDES } from '../../services/app-processing-context';
import { AIRecommendationPanel } from '../ai-recommendation-panel';
import { RackStageControls } from '../rack-stage-controls';
import { SignalChainVisualizer } from '../signal-chain-visualizer';

describe('visible mastering rack contract', () => {
  it('presents analysis as an explicit recommendation, not an invisible action', () => {
    const html = renderToStaticMarkup(
      <AIRecommendationPanel
        recommendation={{
          circuitDrive: 42,
          logicMode: 'dynamics',
          gearProfile: 'progressivehouse',
          targetLUFS: -14,
          confidence: 91,
          reasoning: 'Dynamic pre-master with controlled low end.',
        }}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(html).toContain('Pre-master Analysis Recommendation');
    expect(html).toContain('Apply Suggested Rack Settings');
    expect(html).toContain('Dynamic pre-master with controlled low end.');
  });

  it('renders a real switch for every optional DSP stage', () => {
    const plan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
      userOverrides: {
        useMultiband: true,
        useTape: false,
      },
    });
    const html = renderToStaticMarkup(
      <RackStageControls
        plan={plan}
        overrides={{
          ...DEFAULT_RACK_STAGE_OVERRIDES,
          multiband: true,
          tape: false,
        }}
        onChange={vi.fn()}
      />
    );

    for (const label of [
      'Transformer',
      'Tape',
      'Multiband',
      'M/S matrix',
      'Clipper',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/role="switch"/g)).toHaveLength(5);
    expect(html).toContain('Manual override');
  });

  it('shows the limiter backend that actually loaded', () => {
    const plan = resolveProcessingPlan({
      genreId: 'progressivehouse',
      exportPresetId: 'spotify',
      performanceMode: 'studio',
      logicMode: 'dynamics',
    });
    const html = renderToStaticMarkup(
      <SignalChainVisualizer
        isProcessing={false}
        gearProfile="progressivehouse"
        logicMode="dynamics"
        hqMode
        processingPlan={plan}
        limiterBackend="fir"
        limiterLatencyMS={5.1}
      />
    );

    expect(html).toContain('FIR Fallback');
    expect(html).toContain('Stereo-linked 4× FIR true-peak fallback');
    expect(html).toContain('5.1 ms');
  });
});
