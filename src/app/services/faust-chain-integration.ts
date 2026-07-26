/**
 * FAUST CHAIN INTEGRATION
 * 
 * Drop-in replacements for the WebAudio DynamicsCompressor and WaveShaper
 * nodes currently used in mastering-chain-builder.ts.
 * 
 * HOW TO INTEGRATE:
 * 
 * 1. In mastering-chain-builder.ts, import FaustWasmManager:
 *    import { faustWasmManager, FaustNode } from './faust-wasm-manager';
 * 
 * 2. In your init function, initialize the manager:
 *    await faustWasmManager.initialize(audioContext);
 * 
 * 3. Replace the SSL compressor stage:
 *    // OLD: const compressor = context.createDynamicsCompressor();
 *    // NEW:
 *    const compressor = await faustWasmManager.createNode('pro-compressor');
 *    compressor.setParams({
 *      'Threshold': genreProfile.sslCompThreshold,     // e.g. -20
 *      'Ratio': genreProfile.sslCompRatio,              // e.g. 4
 *      'Attack': genreProfile.sslCompAttackMs,          // e.g. 5 (ms)
 *      'Release': genreProfile.sslCompReleaseMs,        // e.g. 100 (ms)
 *      'Knee': 6,                                       // soft knee (dB)
 *      'MakeupGain': genreProfile.sslCompMakeup || 0,
 *      'Enable': 1,                                     // sidechain HPF on
 *      'Cutoff': 80,                                    // 80 Hz HPF
 *      'LookAhead': 5,                                  // 5ms look-ahead
 *    });
 * 
 * 4. Replace the limiter stage:
 *    // OLD: const limiter = context.createDynamicsCompressor(); + WaveShapers
 *    // NEW:
 *    const limiter = await faustWasmManager.createNode('limiter');
 *    limiter.setParams({
 *      'threshold': genreProfile.limiterThreshold,      // e.g. -6
 *      'ceiling': genreProfile.limiterCeiling,           // e.g. -1
 *      'attack': genreProfile.limiterAttack || 0.005,    // seconds
 *      'hold': 0.05,                                     // hold time
 *      'release': genreProfile.limiterRelease || 0.1,    // seconds
 *      'mix': 1.0,                                       // fully wet
 *    });
 * 
 * 5. Connect the Faust nodes into the chain:
 *    previousNode.connect(compressor.getNode());
 *    compressor.connect(limiter.getNode());
 *    limiter.connect(audioContext.destination);
 * 
 * 6. Wire up metering:
 *    compressor.onMeters((data) => {
 *      // data looks like: { '/Latham Audio Pro Compressor/Meters/GainReduction': -3.5 }
 *      updateCompressorMeter(data);
 *    });
 * 
 * PARAMETER MAPPING (Genre Profile → Faust):
 * ============================================
 * 
 * SSL COMPRESSOR (pro-compressor):
 *   genreProfile.sslCompThreshold   → 'Threshold' (dB, -60 to 0)
 *   genreProfile.sslCompRatio       → 'Ratio' (1 to 20)
 *   genreProfile.sslCompAttack      → 'Attack' (ms, 0.1 to 100)  
 *   genreProfile.sslCompRelease     → 'Release' (ms, 10 to 1000)
 *   genreProfile.sslCompMakeup      → 'MakeupGain' (dB, 0 to 24)
 *   genreProfile.sslCompKnee        → 'Knee' (dB, 0 to 12)
 * 
 * LIMITER (limiter):
 *   genreProfile.limiterThreshold   → 'threshold' (dB, -20 to 0)
 *   genreProfile.limiterCeiling     → 'ceiling' (dB, -10 to 0)
 *   genreProfile.limiterAttack      → 'attack' (seconds, 0.0001 to 0.05)
 *   genreProfile.limiterRelease     → 'release' (seconds, 0.01 to 1.0)
 * 
 * REFERENCE MATCHING EQ (reference-matching-eq):
 *   Band gains → 'Band1_Sub' through 'Band10_Top' (dB, -12 to +12)
 *   matchStrength → 'Strength' (%, 0 to 100)
 */

import { faustWasmManager, FaustNode, FaustMeterData } from './faust-wasm-manager';

export interface FaustMasteringChain {
  compressor: FaustNode;
  limiter: FaustNode;
  eq: FaustNode | null;
  
  /** Connect the chain: source → compressor → limiter → destination */
  connect(source: AudioNode, destination: AudioNode): void;
  
  /** Update all parameters from a genre profile */
  applyGenreProfile(profile: Record<string, number>): void;
  
  /** Cleanup */
  destroy(): void;
}

/**
 * Create a complete Faust-powered mastering chain.
 * Call this once during initialization, then reuse for all genre presets.
 */
export async function createFaustMasteringChain(
  audioContext: AudioContext,
  options?: { includeEQ?: boolean }
): Promise<FaustMasteringChain> {
  // Initialize the WASM manager
  await faustWasmManager.initialize(audioContext);
  
  // Create nodes in parallel
  const nodePromises: Promise<FaustNode>[] = [
    faustWasmManager.createNode('pro-compressor'),
    faustWasmManager.createNode('limiter'),
  ];
  
  if (options?.includeEQ) {
    nodePromises.push(faustWasmManager.createNode('reference-matching-eq'));
  }
  
  const nodes = await Promise.all(nodePromises);
  const compressor = nodes[0];
  const limiter = nodes[1];
  const eq = nodes[2] || null;
  
  return {
    compressor,
    limiter,
    eq,
    
    connect(source: AudioNode, destination: AudioNode) {
      if (eq) {
        source.connect(eq.getNode());
        eq.connect(compressor.getNode());
      } else {
        source.connect(compressor.getNode());
      }
      compressor.connect(limiter.getNode());
      limiter.connect(destination);
    },
    
    applyGenreProfile(profile: Record<string, number>) {
      // Map genre profile keys to Faust parameter names
      const compParams: Record<string, number> = {};
      const limParams: Record<string, number> = {};
      
      // Compressor params
      if (profile.sslCompThreshold !== undefined) compParams['Threshold'] = profile.sslCompThreshold;
      if (profile.sslCompRatio !== undefined) compParams['Ratio'] = profile.sslCompRatio;
      if (profile.sslCompAttack !== undefined) compParams['Attack'] = profile.sslCompAttack;
      if (profile.sslCompRelease !== undefined) compParams['Release'] = profile.sslCompRelease;
      if (profile.sslCompMakeup !== undefined) compParams['MakeupGain'] = profile.sslCompMakeup;
      if (profile.sslCompKnee !== undefined) compParams['Knee'] = profile.sslCompKnee;
      
      // Limiter params
      if (profile.limiterThreshold !== undefined) limParams['threshold'] = profile.limiterThreshold;
      if (profile.limiterCeiling !== undefined) limParams['ceiling'] = profile.limiterCeiling;
      if (profile.limiterAttack !== undefined) limParams['attack'] = profile.limiterAttack;
      if (profile.limiterRelease !== undefined) limParams['release'] = profile.limiterRelease;
      if (profile.limiterMix !== undefined) limParams['mix'] = profile.limiterMix;
      
      compressor.setParams(compParams);
      limiter.setParams(limParams);
    },
    
    destroy() {
      compressor.destroy();
      limiter.destroy();
      eq?.destroy();
    },
  };
}
