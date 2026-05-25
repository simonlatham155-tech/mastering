import("stdfaust.lib");

//==============================================================================
// LATHAM AUDIO PRO COMPRESSOR
// Industry-grade feed-forward compressor with soft knee
// Designed for AI mastering with neural-ready topology
//==============================================================================

declare name "Latham Audio Pro Compressor";
declare author "Latham Audio";
declare version "1.0";
declare license "MIT";

//------------------------------------------------------------------------------
// PARAMETERS
//------------------------------------------------------------------------------

// Compression Parameters
threshold = hslider("v:Compressor/Threshold[unit:dB]", -20, -60, 0, 0.1);
ratio = hslider("v:Compressor/Ratio", 4, 1, 20, 0.1);
knee = hslider("v:Compressor/Knee[unit:dB]", 6, 0, 12, 0.1);
attack = hslider("v:Compressor/Attack[unit:ms]", 5, 0.1, 100, 0.1) / 1000;
release = hslider("v:Compressor/Release[unit:ms]", 100, 10, 1000, 1) / 1000;
makeupGain = hslider("v:Compressor/MakeupGain[unit:dB]", 0, 0, 24, 0.1);

// Detection Mode (0 = Peak, 1 = RMS)
detectionMode = hslider("v:Compressor/DetectionMode", 1, 0, 1, 1);

// Sidechain HPF
sidechainEnable = hslider("v:Sidechain/Enable", 1, 0, 1, 1);
sidechainCutoff = hslider("v:Sidechain/Cutoff[unit:Hz]", 80, 20, 200, 1);

// Look-Ahead (ms)
lookAheadTime = hslider("v:Advanced/LookAhead[unit:ms]", 5, 0, 10, 0.1) / 1000;

//------------------------------------------------------------------------------
// SIDECHAIN HIGH-PASS FILTER
// Prevents low frequencies (kick/bass) from triggering compression
//------------------------------------------------------------------------------

sidechainHPF(cutoff) = fi.highpass(2, cutoff);

applySidechainHPF(x) = ba.if(sidechainEnable, sidechainHPF(sidechainCutoff, x), x);

//------------------------------------------------------------------------------
// SOFT KNEE COMPRESSION CURVE
// Parabolic interpolation for transparent compression
//------------------------------------------------------------------------------

// Compute gain reduction with soft knee
// This is the CRITICAL function that prevents "digital" pumping
softKneeGain(level) = gainReduction
with {
    levelDB = 20 * log10(max(level, 0.000001));
    
    // Knee boundaries
    kneeStart = threshold - (knee / 2);
    kneeEnd = threshold + (knee / 2);
    
    // Calculate gain reduction based on region
    gainReduction = ba.if(
        levelDB < kneeStart,
        // Below knee: no compression
        0,
        ba.if(
            levelDB > kneeEnd,
            // Above knee: full ratio compression
            (threshold - levelDB) + ((levelDB - threshold) / ratio),
            // Inside knee: quadratic curve (THE MAGIC)
            (levelDB - kneeStart) * (levelDB - kneeStart) / (2 * knee * ratio)
        )
    );
};

//------------------------------------------------------------------------------
// PEAK/RMS DETECTION
//------------------------------------------------------------------------------

// RMS detection (1ms window)
rmsDetector = an.amp_follower_ar(0.001, 0.001);

// Peak detection
peakDetector = an.amp_follower_ar(attack, release);

// Select detection mode
detector = ba.if(detectionMode, rmsDetector, peakDetector);

//------------------------------------------------------------------------------
// GAIN COMPUTER WITH ENVELOPE FOLLOWER
//------------------------------------------------------------------------------

gainComputer(x) = gainSmooth
with {
    // Apply sidechain HPF to detection path
    detectionSignal = applySidechainHPF(x);
    
    // Detect level
    detectedLevel = detector(detectionSignal);
    
    // Compute gain reduction
    gr = softKneeGain(detectedLevel);
    
    // Convert to linear gain
    linearGain = ba.db2linear(gr);
    
    // Smooth with attack/release
    gainSmooth = an.amp_follower_ar(attack, release, linearGain);
};

//------------------------------------------------------------------------------
// LOOK-AHEAD DELAY LINE
// Allows compressor to "see the future" and prevent clipping
//------------------------------------------------------------------------------

lookAheadDelay(maxDelay, delayTime) = de.fdelay(maxDelay * ma.SR, delayTime * ma.SR);

// Maximum look-ahead: 10ms
maxLookAhead = 0.010;

//------------------------------------------------------------------------------
// STEREO COMPRESSOR WITH LINKED DETECTION
//------------------------------------------------------------------------------

stereoCompressor = _ , _ : linkDetect : applyGain
with {
    // Link stereo channels (use max of both for detection)
    linkDetect = _ <: (abs + abs) / 2 : gainComputer , _ , _;
    
    // Apply gain to both channels with look-ahead delay
    applyGain(gain, left, right) = 
        (lookAheadDelay(maxLookAhead, lookAheadTime, left) * gain * ba.db2linear(makeupGain)),
        (lookAheadDelay(maxLookAhead, lookAheadTime, right) * gain * ba.db2linear(makeupGain));
};

//------------------------------------------------------------------------------
// MAIN PROCESS
//------------------------------------------------------------------------------

process = stereoCompressor;

//------------------------------------------------------------------------------
// METERING OUTPUTS (for UI visualization)
// These will be exposed to the main thread via SharedArrayBuffer
//------------------------------------------------------------------------------

// Gain reduction in dB (for meter display)
grMeter = _ <: (abs + abs) / 2 : gainComputer : ba.linear2db : attach;

// Input level in dB (for meter display)
inputMeter = _ <: (abs + abs) / 2 : ba.linear2db : attach;
