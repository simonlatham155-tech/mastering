/**
 * LATHAM MASTER LIMITER (Faust → WASM)
 *
 * Stereo-linked dynamics followed by Faust's maintained N-channel look-ahead
 * limiter. The linked detector applies one gain envelope to both channels, so
 * hard left/right transients cannot pull the stereo image around.
 *
 * This is the sample-peak gain-control stage. The separate 4× FIR worklet is
 * the true-peak measurement/guard layer used by HQ preview and export.
 */

import("stdfaust.lib");
import("compressors.lib");

declare name "Latham Master Limiter";
declare version "2.0";
declare author "Latham Audio";
declare description "Stereo-linked compressor and 5 ms look-ahead ceiling";

threshold = hslider("h:Limiter/Threshold[unit:dB]", -6, -20, 0, 0.1);
ratio = hslider("h:Limiter/Ratio", 10, 1, 100, 0.1);
attack_ms = hslider("h:Limiter/Attack[unit:ms]", 5, 0.1, 50, 0.1);
release_ms = hslider("h:Limiter/Release[unit:ms]", 100, 10, 1000, 1);
ceiling = hslider("h:Limiter/Ceiling[unit:dBFS]", -1, -10, 0, 0.1);
mix = hslider("h:Limiter/Mix", 1, 0, 1, 0.01);

attack = attack_ms / 1000;
release = release_ms / 1000;
ceiling_linear = ba.db2linear(ceiling);

lookahead_seconds = 0.005;
lookahead_samples = int(lookahead_seconds * ma.SR);
two_pi = 2 * ma.PI;

// The 2π-scaled time constants follow Faust's colourless limiter reference.
linked_wet =
  co.compressor_stereo(ratio, threshold, attack, release)
  : co.limiter_lad_N(
      2,
      lookahead_seconds,
      ceiling_linear,
      lookahead_seconds / two_pi,
      lookahead_seconds * 2,
      release / two_pi
    );

aligned_dry = par(i, 2, @(lookahead_samples));
crossfade(dry, wet) = dry * (1 - mix) + wet * mix;

process =
  _, _ <: aligned_dry, linked_wet
  : ro.interleave(2, 2)
  : par(i, 2, crossfade);
