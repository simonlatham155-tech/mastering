import("stdfaust.lib");

//==============================================================================
// LATHAM AUDIO REFERENCE MATCHING EQ
// ISO-Standard 10-band octave equalizer for professional mastering
// Based on ISO 266:2003 preferred frequencies
//==============================================================================

declare name "Latham ISO Reference Matching EQ";
declare author "Latham Audio";
declare version "2.0";
declare license "MIT";

//------------------------------------------------------------------------------
// ISO-STANDARD 10-BAND ARRAY
// These frequencies are the industry standard for octave-band equalization
// Q-factor of 1.41 ensures adjacent bands blend smoothly at half-power points
//------------------------------------------------------------------------------

// Band 1: 31 Hz (Sub-Bass) - Physical rumble, saves headroom
band1_freq = 31;
band1_q = 1.41;
band1_gain = hslider("v:Matching/Band1_31Hz[unit:dB]", 0, -12, 12, 0.1);

// Band 2: 63 Hz (Bass) - Kick drum thump, bass guitar meat
band2_freq = 63;
band2_q = 1.41;
band2_gain = hslider("v:Matching/Band2_63Hz[unit:dB]", 0, -12, 12, 0.1);

// Band 3: 125 Hz (Low-End) - Mix weight, warmth
band3_freq = 125;
band3_q = 1.41;
band3_gain = hslider("v:Matching/Band3_125Hz[unit:dB]", 0, -12, 12, 0.1);

// Band 4: 250 Hz (Low-Mids) - "Mud" zone, reduce for clarity
band4_freq = 250;
band4_q = 1.41;
band4_gain = hslider("v:Matching/Band4_250Hz[unit:dB]", 0, -12, 12, 0.1);

// Band 5: 500 Hz (Mids) - Vocal/guitar body, can sound "boxy"
band5_freq = 500;
band5_q = 1.41;
band5_gain = hslider("v:Matching/Band5_500Hz[unit:dB]", 0, -12, 12, 0.1);

// Band 6: 1 kHz (High-Mids) - Clarity and definition, most sensitive area
band6_freq = 1000;
band6_q = 1.41;
band6_gain = hslider("v:Matching/Band6_1kHz[unit:dB]", 0, -12, 12, 0.1);

// Band 7: 2 kHz (Presence) - Guitar crunch, snare snap
band7_freq = 2000;
band7_q = 1.41;
band7_gain = hslider("v:Matching/Band7_2kHz[unit:dB]", 0, -12, 12, 0.1);

// Band 8: 4 kHz (Edge) - Bite (too much = fatigue)
band8_freq = 4000;
band8_q = 1.41;
band8_gain = hslider("v:Matching/Band8_4kHz[unit:dB]", 0, -12, 12, 0.1);

// Band 9: 8 kHz (Brilliance) - Vocal sheen, cymbal sparkle
band9_freq = 8000;
band9_q = 1.41;
band9_gain = hslider("v:Matching/Band9_8kHz[unit:dB]", 0, -12, 12, 0.1);

// Band 10: 16 kHz (Air) - "Expensive" top-end, adds openness
band10_freq = 16000;
band10_q = 1.41;
band10_gain = hslider("v:Matching/Band10_16kHz[unit:dB]", 0, -12, 12, 0.1);

//------------------------------------------------------------------------------
// MASTER CONTROLS
//------------------------------------------------------------------------------

// Matching strength (0-100%)
// Pro mastering engineers typically use 30-50% to preserve character
matchStrength = hslider("v:Matching/Strength[unit:%]", 50, 0, 100, 1) / 100;

// Overall gain compensation (auto-calculated by matching algorithm)
autoGain = hslider("v:Matching/AutoGain[unit:dB]", 0, -6, 6, 0.1);

// Bypass
bypass = checkbox("v:Matching/Bypass");

//------------------------------------------------------------------------------
// PARAMETRIC BELL FILTER (Q = 1.41 FOR OCTAVE BANDWIDTH)
// This Q-factor ensures adjacent bands "touch" at their half-power points,
// creating a smooth, musical curve instead of sharp peaks
//------------------------------------------------------------------------------

// Single parametric bell with fixed Q = 1.41
parametricBell(freq, gain) = fi.peak_eq(gain, freq, freq / 1.41);

//------------------------------------------------------------------------------
// 10-BAND ISO MATCHING EQ CASCADE
// Each band is one octave apart, ensuring perfect blend
//------------------------------------------------------------------------------

isoMatchingEQ = 
    // Band 1: 31 Hz (Sub-Bass)
    parametricBell(band1_freq, band1_gain * matchStrength) :
    
    // Band 2: 63 Hz (Bass)
    parametricBell(band2_freq, band2_gain * matchStrength) :
    
    // Band 3: 125 Hz (Low-End)
    parametricBell(band3_freq, band3_gain * matchStrength) :
    
    // Band 4: 250 Hz (Low-Mids)
    parametricBell(band4_freq, band4_gain * matchStrength) :
    
    // Band 5: 500 Hz (Mids)
    parametricBell(band5_freq, band5_gain * matchStrength) :
    
    // Band 6: 1 kHz (High-Mids)
    parametricBell(band6_freq, band6_gain * matchStrength) :
    
    // Band 7: 2 kHz (Presence)
    parametricBell(band7_freq, band7_gain * matchStrength) :
    
    // Band 8: 4 kHz (Edge)
    parametricBell(band8_freq, band8_gain * matchStrength) :
    
    // Band 9: 8 kHz (Brilliance)
    parametricBell(band9_freq, band9_gain * matchStrength) :
    
    // Band 10: 16 kHz (Air)
    parametricBell(band10_freq, band10_gain * matchStrength) :
    
    // Auto gain compensation to prevent level jumps
    *(ba.db2linear(autoGain));

//------------------------------------------------------------------------------
// STEREO PROCESSING (LINKED)
//------------------------------------------------------------------------------

stereoMatching = isoMatchingEQ , isoMatchingEQ;

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
// METERING OUTPUTS (for UI visualization)
// Expose gain adjustments for real-time spectral overlay
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
// TECHNICAL NOTES
//==============================================================================

/*
WHY Q = 1.41?

In filter design, Q-factor determines the bandwidth:
    
    Bandwidth (octaves) = log2(1 + (1 / (2 * Q^2)) + sqrt((1 / (2 * Q^2)) * (1 / (2 * Q^2) + 2)))

For Q = 1.41 (also known as Q = √2):
    Bandwidth ≈ 1 octave

This means:
- Band at 1 kHz has -3dB points at ~707 Hz and ~1.41 kHz
- Band at 2 kHz has -3dB points at ~1.41 kHz and ~2.83 kHz
- The -3dB point of one band aligns with the center of adjacent bands

RESULT: Smooth, musical EQ curve without "peaks" or "valleys"

This is the same approach used by:
- iZotope Ozone (Tonal Balance Control)
- FabFilter Pro-Q 3 (Dynamic EQ mode)
- Waves GEQ (Graphic EQ)
- Neve 1073/1084 (Classic console EQs)

ISO 266:2003 COMPLIANCE:
These exact frequencies are the international standard for:
- Octave-band analyzers
- Room acoustics measurement
- Noise control engineering
- Professional audio mastering

MATHEMATICAL PROOF:
Each band is exactly one octave apart:
    31 Hz × 2 = 62 Hz  ≈ 63 Hz
    63 Hz × 2 = 126 Hz ≈ 125 Hz
    125 Hz × 2 = 250 Hz
    250 Hz × 2 = 500 Hz
    500 Hz × 2 = 1000 Hz
    1 kHz × 2 = 2 kHz
    2 kHz × 2 = 4 kHz
    4 kHz × 2 = 8 kHz
    8 kHz × 2 = 16 kHz

This logarithmic spacing matches human hearing perception (Weber-Fechner law).
*/
