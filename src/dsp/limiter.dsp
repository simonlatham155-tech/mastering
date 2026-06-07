/**
 * LATHAM EXPORT LIMITER (Faust → WASM)
 *
 * Compilable stereo limiter used on the export/offline render path
 * (`npm run build:faust` → public/faust/compiled/limiter/).
 *
 * Architecture: per-channel compressor (compressors.lib) + hard ceiling clip.
 * True-peak safety on export is handled upstream by the JS oversampling worklet
 * when Faust is unavailable; this DSP enforces threshold/ratio/ceiling in WASM.
 *
 * Future look-ahead / 4× OS design (does not compile yet): limiter-lookahead.dsp
 */

import("stdfaust.lib");
import("compressors.lib");

declare name "Latham True Peak Limiter";
declare version "1.0";
declare author "Latham Audio";
declare description "Export limiter — compressor + brickwall ceiling";

threshold = hslider("h:Limiter/Threshold[unit:dB]", -6, -20, 0, 0.1);
ratio = hslider("h:Limiter/Ratio", 10, 1, 100, 0.1);
attack = hslider("h:Limiter/Attack[unit:ms]", 5, 0.1, 50, 0.1) / 1000;
release = hslider("h:Limiter/Release[unit:ms]", 100, 10, 1000, 1) / 1000;
ceiling = hslider("h:Limiter/Ceiling[unit:dBTP]", -1, -10, 0, 0.1);
mix = hslider("h:Limiter/Mix", 1, 0, 1, 0.01);

ceil_lin = ba.db2linear(ceiling);

hardclip(x) = max(-ceil_lin, min(ceil_lin, x));

mono_lim = compressor_mono(ratio, threshold, attack, release) : hardclip;
crossfade(dry, wet, m) = dry * (1 - m) + wet * m;

process = _, _ <: (_, _), (mono_lim, mono_lim) : (crossfade(_, _, mix), crossfade(_, _, mix));
