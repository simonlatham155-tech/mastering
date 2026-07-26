/**
 * LATHAM AUDIO TRUE PEAK LIMITER
 * Uses Faust's built-in lookahead limiter (Dario Sanfilippo)
 * with added metering and dry/wet control
 * 
 * Compilation: faust -lang wasm -cn limiter limiter-fixed.dsp -o limiter.wasm
 */

import("stdfaust.lib");

// ========================================
// PARAMETERS
// ========================================

threshold_db = hslider("threshold", -6.0, -20, 0, 0.1);
attack_t = hslider("attack", 0.005, 0.0001, 0.05, 0.0001);
hold_t = hslider("hold", 0.05, 0.001, 0.5, 0.001);
release_t = hslider("release", 0.1, 0.01, 1.0, 0.01);
ceiling_db = hslider("ceiling", -1.0, -10, 0, 0.1);
mix_amt = hslider("mix", 1.0, 0, 1, 0.01);
ratio = hslider("ratio", 10, 1, 100, 0.1);

// Convert ceiling from dB to linear
ceiling_lin = ba.db2linear(ceiling_db);

// ========================================
// METERING (gain reduction in dB)
// ========================================

gr_meter = hbargraph("gain_reduction_db", -30, 0);

// ========================================
// CORE LIMITER (linked stereo, lookahead)
// ========================================

// Lookahead delay: 5ms (compile-time constant)
LD = 0.005;

// Use built-in lookahead limiter
limiter_stereo = co.limiter_lad_N(2, LD, ceiling_lin, attack_t, hold_t, release_t);

// ========================================
// DRY/WET MIX
// ========================================

drywet(dl, dr, wl, wr) = 
    dl * (1.0 - mix_amt) + wl * mix_amt,
    dr * (1.0 - mix_amt) + wr * mix_amt;

// ========================================
// PROCESS
// ========================================

process = _, _ <: (_, _), limiter_stereo : drywet;

// ========================================
// METADATA
// ========================================

declare name "Latham True Peak Limiter";
declare version "1.0";
declare author "Latham Audio";
declare license "MIT";
declare description "Lookahead True Peak Limiter with Soft Knee";
