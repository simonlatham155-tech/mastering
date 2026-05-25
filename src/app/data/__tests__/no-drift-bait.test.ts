import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('No Drift Bait - Enforced Invariants', () => {
  it('audio-processor.ts must not import from genre-presets.ts', () => {
    const processorPath = resolve(__dirname, '../../services/audio-processor.ts');
    const content = readFileSync(processorPath, 'utf-8');

    // Banned imports that enable drift (catches import and import type)
    const importPatterns = [
      /import\s+.*from\s+['"](\.\.\/data\/genre-presets|.*\/genre-presets)['"]/,
      /import\s+type\s+.*from\s+['"](\.\.\/data\/genre-presets|.*\/genre-presets)['"]/,
    ];

    const importViolations = importPatterns.filter(pattern => pattern.test(content));

    // Also check for direct usage of banned symbols
    const bannedSymbols = [
      'GENRE_PRESETS',
      'ENGINE_DEFAULTS',
      'getGenrePreset'
    ];

    const symbolViolations = bannedSymbols.filter(symbol => content.includes(symbol));

    const allViolations = [
      ...importViolations.map(p => p.toString()),
      ...symbolViolations
    ];

    expect(allViolations).toEqual([]);
  });

  it('audio-processor.ts must not contain manual width clamping', () => {
    const processorPath = resolve(__dirname, '../../services/audio-processor.ts');
    const content = readFileSync(processorPath, 'utf-8');

    // Find lines with width-related clamping (not general math utils)
    const lines = content.split('\n');
    const suspiciousLines = lines.filter((line, idx) => {
      // Skip the generic clamp utility function
      if (idx >= 60 && idx <= 62) return false;
      
      // Skip logging lines
      if (line.includes('console.log') || line.includes('clamped=')) return false;
      
      // Look for manual width resolution patterns
      return (
        (line.includes('Math.min') || line.includes('Math.max')) &&
        (line.includes('width') || line.includes('Width'))
      );
    });

    expect(suspiciousLines).toEqual([]);
  });

  it('audio-processor.ts must use plan.genreBehavior.width directly', () => {
    const processorPath = resolve(__dirname, '../../services/audio-processor.ts');
    const content = readFileSync(processorPath, 'utf-8');

    // Must contain the correct width source
    expect(content).toContain('plan.genreBehavior.width');
    
    // Must not contain manual resolution variables
    const bannedPatterns = [
      'ENGINE_DEFAULTS.maxWidth',
      'requestedWidth = ',
      'maxWidth = '
    ];

    const violations = bannedPatterns.filter(pattern => content.includes(pattern));
    expect(violations).toEqual([]);
  });

  it('audio-processor.ts must not branch on exportPresetId for tone', () => {
    const processorPath = resolve(__dirname, '../../services/audio-processor.ts');
    const content = readFileSync(processorPath, 'utf-8');

    // Export preset should only affect delivery targets, not DSP logic
    const lines = content.split('\n');
    const violations = lines.filter(line => 
      line.includes('exportPresetId') && line.includes('===')
    );

    expect(violations).toEqual([]);
  });

  it('audio-processor.ts must call resolveProcessingPlan', () => {
    const processorPath = resolve(__dirname, '../../services/audio-processor.ts');
    const content = readFileSync(processorPath, 'utf-8');

    // Resolver must be used (prevents bypass)
    expect(content).toContain('resolveProcessingPlan');
    
    // Should be called in processAudio or similar entry point
    const hasResolverCall = /resolveProcessingPlan\s*\(/.test(content);
    expect(hasResolverCall).toBe(true);
  });
});