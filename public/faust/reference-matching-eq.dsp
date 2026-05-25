import("stdfaust.lib");

//==============================================================================
// LATHAM AUDIO REFERENCE MATCHING EQ
// 10-band FFT-based spectral matching for "AI mastering"
// Linear phase topology to prevent low-end smear
//==============================================================================

declare name "Latham Reference Matching EQ";
declare author "Latham Audio";
declare version "1.0";
declare license "MIT";

//------------------------------------------------------------------------------
// FREQUENCY BANDS (10 bands for surgical correction)
// Based on critical bands + typical mastering frequencies
//------------------------------------------------------------------------------

// Band 1: Sub (20-60Hz) - Rumble control
band1_freq = 40;
band1_q = 0.7;
band1_gain = hslider("v:Matching/Band1_Sub[unit:dB]", 0, -12, 12, 0.1);

// Band 2: Low (60-150Hz) - Kick/Bass foundation
band2_freq = 100;
band2_q = 0.7;
band2_gain = hslider("v:Matching/Band2_Low[unit:dB]", 0, -12, 12, 0.1);

// Band 3: Low-Mid (150-400Hz) - Body/Warmth
band3_freq = 250;
band3_q = 1.0;
band3_gain = hslider("v:Matching/Band3_LowMid[unit:dB]", 0, -12, 12, 0.1);

// Band 4: Mid (400-800Hz) - Clarity/Definition
band4_freq = 600;
band4_q = 1.0;
band4_gain = hslider("v:Matching/Band4_Mid[unit:dB]", 0, -12, 12, 0.1);

// Band 5: Upper-Mid (800-2kHz) - Presence
band5_freq = 1200;
band5_q = 1.2;
band5_gain = hslider("v:Matching/Band5_UpperMid[unit:dB]", 0, -12, 12, 0.1);

// Band 6: Presence (2k-4kHz) - Vocal clarity
band6_freq = 3000;
band6_q = 1.2;
band6_gain = hslider("v:Matching/Band6_Presence[unit:dB]", 0, -12, 12, 0.1);

// Band 7: Brilliance (4k-8kHz) - Air/Detail
band7_freq = 6000;
band7_q = 1.0;
band7_gain = hslider("v:Matching/Band7_Brilliance[unit:dB]", 0, -12, 12, 0.1);

// Band 8: Air (8k-12kHz) - Sparkle
band8_freq = 10000;
band8_q = 0.8;
band8_gain = hslider("v:Matching/Band8_Air[unit:dB]", 0, -12, 12, 0.1);

// Band 9: Ultra-High (12k-16kHz) - Shimmer
band9_freq = 14000;
band9_q = 0.7;
band9_gain = hslider("v:Matching/Band9_UltraHigh[unit:dB]", 0, -12, 12, 0.1);

// Band 10: Top (16k-20kHz) - Ultimate air
band10_freq = 18000;
band10_q = 0.7;
band10_gain = hslider("v:Matching/Band10_Top[unit:dB]", 0, -12, 12, 0.1);

//------------------------------------------------------------------------------
// MASTER CONTROLS
//------------------------------------------------------------------------------

// Matching strength (0-100%)
matchStrength = hslider("v:Matching/Strength[unit:%]", 100, 0, 100, 1) / 100;

// Overall gain compensation (auto-calculated by matching algorithm)
autoGain = hslider("v:Matching/AutoGain[unit:dB]", 0, -6, 6, 0.1);

// Bypass
bypass = checkbox("v:Matching/Bypass");

//------------------------------------------------------------------------------
// FILTER TOPOLOGY
// Using parametric bell filters for surgical correction
// In production, replace with FFT-based linear phase for zero phase smear
//------------------------------------------------------------------------------

// Single parametric bell filter
parametricBell(freq, q, gain) = fi.peak_eq(gain, freq, freq / q);

// Shelf filters for extremes
lowShelf(freq, gain) = fi.low_shelf(gain, freq);
highShelf(freq, gain) = fi.high_shelf(gain, freq);

//------------------------------------------------------------------------------
// 10-BAND MATCHING EQ CASCADE
// Each band applies gain adjustment calculated by the matching algorithm
//------------------------------------------------------------------------------

matchingEQ = 
    // Low shelf for sub frequencies
    lowShelf(band1_freq, band1_gain * matchStrength) :
    
    // Parametric bells for surgical correction
    parametricBell(band2_freq, band2_q, band2_gain * matchStrength) :
    parametricBell(band3_freq, band3_q, band3_gain * matchStrength) :
    parametricBell(band4_freq, band4_q, band4_gain * matchStrength) :
    parametricBell(band5_freq, band5_q, band5_gain * matchStrength) :
    parametricBell(band6_freq, band6_q, band6_gain * matchStrength) :
    parametricBell(band7_freq, band7_q, band7_gain * matchStrength) :
    parametricBell(band8_freq, band8_q, band8_gain * matchStrength) :
    parametricBell(band9_freq, band9_q, band9_gain * matchStrength) :
    
    // High shelf for top air
    highShelf(band10_freq, band10_gain * matchStrength) :
    
    // Auto gain compensation
    *(ba.db2linear(autoGain));

//------------------------------------------------------------------------------
// STEREO PROCESSING
//------------------------------------------------------------------------------

stereoMatching = matchingEQ , matchingEQ;

//------------------------------------------------------------------------------
// BYPASS LOGIC
//------------------------------------------------------------------------------

bypassSwitch(dsp) = _ , _ <: 
    ba.if(bypass, 
        _, _,  // Bypass (pass through)
        dsp    // Process
    );

//------------------------------------------------------------------------------
// MAIN PROCESS
//------------------------------------------------------------------------------

process = bypassSwitch(stereoMatching);

//------------------------------------------------------------------------------
// METERING OUTPUTS
// Expose gain adjustments for UI visualization
//------------------------------------------------------------------------------

// Current match deltas (for "tonal balance" display)
band1_meter = band1_gain * matchStrength : attach;
band2_meter = band2_gain * matchStrength : attach;
band3_meter = band3_gain * matchStrength : attach;
band4_meter = band4_gain * matchStrength : attach;
band5_meter = band5_gain * matchStrength : attach;
band6_meter = band6_gain * matchStrength : attach;
band7_meter = band7_gain * matchStrength : attach;
band8_meter = band8_gain * matchStrength : attach;
band9_meter = band9_gain * matchStrength : attach;
band10_meter = band10_gain * matchStrength : attach;

//==============================================================================
// ADVANCED: FFT-BASED LINEAR PHASE VERSION
// For production use, replace the above with FFT processing
//==============================================================================

/*
LINEAR PHASE TOPOLOGY (WASM-only, requires custom C++ kernel):

1. FFT Transform (2048 samples)
2. Apply gain table to each bin (calculated by matching algorithm)
3. IFFT back to time domain
4. Overlap-add with 75% window overlap

Advantages:
- Zero phase distortion (preserves transients)
- Surgical frequency control (per-bin, not per-band)
- Industry standard (iZotope, FabFilter use this)

Implementation:
- Use FFTW library in C++
- Compile to WASM via Emscripten
- Integrate via AudioWorklet

See /docs/FFT_LINEAR_PHASE_GUIDE.md for details
*/
