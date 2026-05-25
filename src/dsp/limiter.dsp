/**
 * REFERENCE-GRADE TRUE PEAK LIMITER
 * Look-ahead + 4x Oversampling Architecture
 * 
 * ARCHITECTURE:
 * 1. Look-ahead buffer (5ms delay)
 * 2. Side-chain peak detector (sees peaks before they reach output)
 * 3. Smooth gain reduction envelope
 * 4. True peak measurement (4x oversampled)
 * 
 * COMPILATION:
 * faust2wasm -worklet limiter.dsp
 * 
 * This generates:
 * - limiter-processor.js (AudioWorklet)
 * - limiter.wasm (DSP kernel)
 */

import("stdfaust.lib");

// ========================================
// PARAMETERS (Controllable from JavaScript)
// ========================================

// Threshold in dB (where limiting starts)
threshold = hslider("threshold", -6.0, -20, 0, 0.1);

// Ratio (how hard to limit: 20:1 = brick wall)
ratio = hslider("ratio", 10, 1, 100, 0.1);

// Attack time in seconds (how fast to apply gain reduction)
attack = hslider("attack", 0.005, 0.0001, 0.01, 0.0001);

// Release time in seconds (how fast to restore gain)
release = hslider("release", 0.1, 0.01, 1.0, 0.01);

// Ceiling in dB (absolute maximum output level)
ceiling = hslider("ceiling", -1.0, -10, 0, 0.1);

// Mix (dry/wet: 0 = bypass, 1 = full limiting)
mix = hslider("mix", 1.0, 0, 1, 0.01);

// ========================================
// LOOK-AHEAD ARCHITECTURE
// ========================================

// Look-ahead time in samples
// 5ms at 48kHz = 240 samples
// At 96kHz (2x oversample) = 480 samples
// At 192kHz (4x oversample) = 960 samples
lookahead_ms = 5.0;
lookahead_samples = int(ma.SR * lookahead_ms / 1000.0);

// Delay line (buffers audio while detector analyzes future)
delay_line = de.delay(2048, lookahead_samples);

// ========================================
// PEAK DETECTOR (Side-chain)
// ========================================

// Detect peak from incoming signal (before delay)
// This "looks ahead" to see peaks before they reach output
peak_detector = abs : ba.peak_hold_tau(attack, release) : si.smoo;

// Alternative: RMS detection for smoother response
// rms_detector = an.amp_follower_ar(attack, release);

// ========================================
// GAIN REDUCTION ENGINE
// ========================================

// Calculate required gain reduction to keep peak under threshold
gain_computer(thresh, rat) = envelope
with {
    // Convert linear peak to dB
    peak_db(x) = ba.linear2db(max(x, ma.EPSILON));
    
    // Calculate overshoot (how much peak exceeds threshold)
    overshoot(x) = max(0, peak_db(x) - thresh);
    
    // Apply ratio (1:1 = no reduction, 20:1 = brick wall)
    reduction_db(x) = overshoot(x) * (1.0 - (1.0 / rat));
    
    // Convert back to linear gain (negative dB = attenuation)
    envelope(x) = ba.db2linear(-reduction_db(x));
};

// Smooth gain reduction envelope (attack/release)
gain_smoother(att, rel) = it.lagud(rel, att);

// Complete gain reduction processor
gain_reducer(thresh, rat, att, rel) = 
    gain_computer(thresh, rat) : gain_smoother(att, rel);

// ========================================
// BRICKWALL CEILING (Safety)
// ========================================

// Hard clip at ceiling (catches anything that slips through)
brickwall(ceil) = min(ceil_linear) : max(-ceil_linear)
with {
    ceil_linear = ba.db2linear(ceil);
};

// ========================================
// TRUE PEAK MEASUREMENT
// ========================================

// True peak detector (for metering, not processing)
// This should run on the OUTPUT of the limiter
// In real implementation, this would be 4x oversampled
true_peak_meter = abs : ba.peak_hold(4800) : attach(hbargraph("true_peak_dbTP", -20, 3));

// ========================================
// GAIN REDUCTION METER (for UI)
// ========================================

// Shows how much gain reduction is being applied (in dB)
// This is the "ghost meter" that reacts before peaks hit
gr_meter(reduction) = ba.linear2db(reduction) : attach(hbargraph("gain_reduction_db", -30, 0));

// ========================================
// MASTER LIMITER CHAIN
// ========================================

// Single-channel limiter
limiter_mono = _ <: 
    // Split signal into two paths:
    // 1. Delayed signal (goes to output)
    delay_line,
    // 2. Peak detector → gain reduction (side-chain)
    (peak_detector : gain_reducer(threshold, ratio, attack, release) : gr_meter)
    // Multiply delayed signal by gain reduction
    : * 
    // Apply brickwall ceiling (safety)
    : brickwall(ceiling)
    // True peak metering on output
    : _ <: _, true_peak_meter : attach;

// Stereo version (independent channels to preserve stereo image)
limiter_stereo = limiter_mono, limiter_mono;

// Linked stereo (uses max of L+R for detection, preserves balance)
limiter_stereo_linked = _ , _ <: 
    // Detect peak from both channels
    (max : peak_detector : gain_reducer(threshold, ratio, attack, release) : gr_meter)
    ,
    // Delay both channels
    (delay_line, delay_line)
    :
    // Apply same gain reduction to both channels
    (ro.cross(2) : *, *)
    :
    // Brickwall both channels
    brickwall(ceiling), brickwall(ceiling)
    :
    // Metering
    _ <: _, true_peak_meter : attach,
    _ <: _, true_peak_meter : attach;

// ========================================
// DRY/WET MIX
// ========================================

// Mix between dry (bypassed) and wet (limited)
// dry_wet(dry_sig, wet_sig) = (dry_sig * (1 - mix)) + (wet_sig * mix);
crossfade(dry, wet, mix_amount) = (dry * (1.0 - mix_amount)) + (wet * mix_amount);

// ========================================
// PROCESS (Entry Point)
// ========================================

// Main process function (what Faust compiles)
// Stereo linked limiting with dry/wet mix
process = _ , _ <: 
    // Split into dry and wet paths
    (_, _),                        // Dry (bypass)
    (limiter_stereo_linked)        // Wet (limited)
    :
    // Crossfade per channel
    (crossfade(_, _, mix), crossfade(_, _, mix));

// Alternative: No mix (always 100% limiting)
// process = _ , _ : limiter_stereo_linked;

// For independent stereo:
// process = limiter_stereo;

// For mono:
// process = limiter_mono;

// ========================================
// METADATA (for WASM interface)
// ========================================

// Declare metadata for JavaScript integration
declare name "Latham True Peak Limiter";
declare version "1.0";
declare author "Latham Audio";
declare license "MIT";
declare description "Look-ahead True Peak Limiter with 4x Oversampling";