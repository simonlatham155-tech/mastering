import("stdfaust.lib");

//==============================================================================
// LATHAM AUDIO PRO COMPRESSOR
// Industry-grade feed-forward compressor with soft knee
// Uses Faust compressors library for maximum quality
//==============================================================================

declare name "Latham Audio Pro Compressor";
declare author "Latham Audio";
declare version "1.0";
declare license "MIT";

//------------------------------------------------------------------------------
// PARAMETERS
//------------------------------------------------------------------------------

threshold = hslider("v:Compressor/Threshold[unit:dB]", -20, -60, 0, 0.1);
ratio = hslider("v:Compressor/Ratio", 4, 1, 20, 0.1);
knee_w = hslider("v:Compressor/Knee[unit:dB]", 6, 0, 12, 0.1);
attack = hslider("v:Compressor/Attack[unit:ms]", 5, 0.1, 100, 0.1) / 1000;
release = hslider("v:Compressor/Release[unit:ms]", 100, 10, 1000, 1) / 1000;
makeupGain = hslider("v:Compressor/MakeupGain[unit:dB]", 0, 0, 24, 0.1);

// Sidechain HPF
sidechainEnable = hslider("v:Sidechain/Enable", 1, 0, 1, 1);
sidechainCutoff = hslider("v:Sidechain/Cutoff[unit:Hz]", 80, 20, 200, 1);

// Look-Ahead (ms)
lookAheadMs = hslider("v:Advanced/LookAhead[unit:ms]", 5, 0, 10, 0.1);

//------------------------------------------------------------------------------
// STRENGTH (1 - 1/ratio, normalised 0-1)
//------------------------------------------------------------------------------

strength = 1 - (1 / max(ratio, 1));

//------------------------------------------------------------------------------
// SIDECHAIN HPF
//------------------------------------------------------------------------------

sc_hpf = fi.highpass(2, sidechainCutoff);
apply_hpf(x) = select2(sidechainEnable, x, sc_hpf(x));

//------------------------------------------------------------------------------
// METERING
//------------------------------------------------------------------------------

gr_meter = hbargraph("v:Meters/GainReduction[unit:dB]", -30, 0);

//------------------------------------------------------------------------------
// LOOKAHEAD DELAY
//------------------------------------------------------------------------------

maxLookAheadSamples = 480; // 10ms at 48kHz
lookAheadSamples = int(lookAheadMs * ma.SR / 1000);
la_delay = de.delay(maxLookAheadSamples, lookAheadSamples);

//------------------------------------------------------------------------------
// GAIN COMPUTATION (linked stereo with sidechain HPF)
//------------------------------------------------------------------------------

// Detection: apply HPF then use peak compression gain
// Using the built-in compressor gain computer for maximum quality
// strength: 0=no compression, 1=brickwall
// prePost: 0=pre-peak, 1=post-peak (we use 0 for feed-forward)

compute_gain(l, r) = gr_db
with {
    // Apply sidechain HPF
    sc_l = apply_hpf(l);
    sc_r = apply_hpf(r);
    
    // Linked stereo: max of both channels
    linked = max(abs(sc_l), abs(sc_r));
    
    // Gain computation using library function
    gr_db = linked : co.peak_compression_gain_mono_db(strength, threshold, attack, release, knee_w, 0);
};

//------------------------------------------------------------------------------
// STEREO COMPRESSOR
//------------------------------------------------------------------------------

stereo_compressor = _, _ <: 
    // Path 1: compute gain from raw signal
    compute_gain,
    // Path 2: delay both channels for look-ahead
    (la_delay, la_delay)
    :
    // Apply gain (1 gain value, 2 delayed channels)
    apply_gain
with {
    apply_gain(gr_db, dl, dr) = dl * gain * makeup, dr * gain * makeup
    with {
        // Meter the gain reduction
        gr_metered = gr_db : gr_meter;
        gain = ba.db2linear(gr_metered);
        makeup = ba.db2linear(makeupGain);
    };
};

//------------------------------------------------------------------------------
// MAIN PROCESS
//------------------------------------------------------------------------------

process = stereo_compressor;
