# LathamAudio Mastering — Traditional Mastering Methodology

## Product definition

LathamAudio Mastering is a traditional mastering workflow with genre-aware target guidance.

Genre defines the destination. It does not blindly define the processing.

The engine must measure the incoming premaster, compare it with the selected genre target space, choose the least damaging intervention, re-measure the complete result, and stop when the master is inside an acceptable region or further processing would make it worse.

## Core rule

Never apply a genre curve because of the genre name alone.

Bad:

`Trance -> +1 dB bass, +3 dB air, -2 dB mud, width 1.12`

Correct:

`Source analysis -> Trance target envelope -> measured delta -> required correction`

If a Trance premaster already has the correct high-frequency balance, the high-shelf correction is 0 dB. If it is already too bright, the Trance engine must be able to recommend a high-frequency cut.

## Mastering sequence

1. INPUT / TECHNICAL QC
   - Decode integrity
   - sample peak / true peak
   - integrated loudness
   - crest / dynamic range
   - DC / channel anomalies where measurable
   - gain staging

2. SOURCE DIAGNOSIS
   - broad spectral balance
   - low-frequency excess / deficiency
   - low-mid congestion
   - presence / harshness
   - top-end extension
   - stereo distribution
   - transient density
   - dynamic behaviour

3. GENRE TARGET SPACE
   - tonal envelope
   - dynamic / density envelope
   - stereo behaviour
   - low-end convention
   - typical mastering loudness region
   - delivery constraints are kept separate from genre identity

4. DELTA CALCULATION
   - calculate only what the source needs to move toward the target
   - use deadbands so an already-correct source receives no move
   - cap automatic mastering moves to conservative ranges
   - never invent corrections from measurements that do not exist

5. PROCESSOR SELECTION
   - corrective EQ only when a tonal defect exists
   - tape only when its compression / density / HF behaviour solves a problem
   - transformer only when harmonic density or weight helps
   - bus compression only when glue or transient control is required
   - multiband only for an identified frequency-dependent dynamic problem
   - M/S only for an identified image problem or required mono-bass control
   - clipper only when peak shaping is preferable to additional limiting
   - limiter is the final peak authority and loudness stage

6. CHAIN INTERACTION AUDIT
   - measure the cumulative response after every proposed chain
   - prevent hidden low-frequency accumulation from EQ + transformer + tape
   - prevent processor stacking from creating a worse downstream limiter problem
   - reject a solution if fixing one defect creates a larger new defect

7. LOUDNESS / PEAK MANAGEMENT
   - loudness is achieved before / through the final limiter, not by blind post-limiter output gain
   - delivery target is a requested destination, not a requirement to destroy the master
   - if the requested loudness cannot be reached within quality guardrails, report the best transparent result

8. LEVEL-MATCHED A/B
   - processed and bypass paths must be latency aligned
   - comparison should be loudness matched so louder is not mistaken for better
   - preview must use the same processing decisions as export

9. EXPORT / QC
   - export renders the exact approved chain at higher quality / oversampling
   - verify integrated LUFS
   - verify true peak
   - verify no NaN / clipping / channel faults
   - verify the exported render still sits inside the chosen target envelope

## Genre model status

`src/app/data/genre-target-space.ts` introduces the first source-relative target-space model.

The current analyser exposes only three broad spectral energy bands (bass / mids / highs) plus dynamic range. Therefore the first target model is deliberately conservative:

- It may recommend broad bass and high-frequency steering.
- It may evaluate whether dynamic range is inside the genre envelope.
- It does not invent a 250 Hz mud correction because the analyser does not isolate that region.
- It does not invent a stereo-width correction because the current analyser does not measure stereo width by frequency.

The current target ranges are explicitly labelled engineering priors. They must eventually be replaced or refined with measured statistics from a curated reference corpus.

## Reference-corpus direction

For the Trance target, build a curated set of contemporary masters representative of the desired ASOT / modern trance presentation. Measure each reference with the same analysis pipeline used on uploaded premaster material. Store distributions, not single magic values.

The target should become ranges such as:

- median + percentile spectral envelope
- crest / dynamic-range distribution
- integrated loudness distribution
- true-peak distribution
- stereo width by band
- low-frequency side energy
- transient density / short-term loudness behaviour

A source is then moved toward a statistical target region, not toward one arbitrary song and not through one fixed EQ preset.

## Required DSP validation before release

- flat / swept-sine cumulative chain response
- transformer-only response
- tape-only response
- transformer + tape cumulative low-frequency response
- multiband neutral reconstruction / null test
- multiband crossover magnitude and phase response
- profile EQ measured response for every visible control
- M/S unity / mono compatibility tests
- limiter LUFS / true-peak regression tests
- live preview vs offline export parity tests
- level-matched bypass tests

## Product rule

A good premaster should be allowed to receive almost no processing.

A poor premaster should cause the system to search for a sequence of compromises that makes it translate better.

The system succeeds when the final master works—not when every rack processor lights up.
