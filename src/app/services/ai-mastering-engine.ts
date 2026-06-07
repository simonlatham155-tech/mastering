// AI Mastering Engine - Intelligent Parameter Selection
// Based on audio analysis, automatically configures optimal mastering settings

import { AudioAnalysisResult } from '../utils/audio-analyzer';
import { GearProfileId, gearProfiles } from '../components/gear-selector';

export interface AIMasteringRecommendation {
  circuitDrive: number;           // 0-100 THD knob
  logicMode: 'brickwall' | 'dynamics';
  gearProfile: GearProfileId;
  targetLUFS: number;
  confidence: number;             // 0-100 confidence score
  reasoning: string;              // Explanation for user
}

export class AIMasteringEngine {
  /**
   * Analyze input audio and recommend optimal mastering settings
   */
  static recommend(analysis: AudioAnalysisResult): AIMasteringRecommendation {
    let circuitDrive = 50;
    let logicMode: 'brickwall' | 'dynamics' = 'dynamics';
    let gearProfile: GearProfileId = 'progressivehouse';
    let targetLUFS = -14;
    let reasoning = '';
    let confidence = 85;

    // STEP 1: Determine Logic Mode based on Dynamic Range
    if (analysis.isHeritage || analysis.dynamicRange > 12) {
      // Heritage content - preserve dynamics
      logicMode = 'dynamics';
      circuitDrive = Math.min(30, circuitDrive); // Low saturation
      reasoning = 'Heritage content detected - preserving dynamics. ';
      confidence = 95;
    } else if (analysis.dynamicRange < 6) {
      // Already heavily compressed
      logicMode = 'dynamics';
      circuitDrive = 40;
      reasoning = 'Input already compressed - gentle enhancement. ';
      confidence = 90;
    } else {
      // Normal dynamic range - choose based on genre
      logicMode = this.selectLogicModeForGenre(analysis.suggestedGenre);
      reasoning = `${analysis.suggestedGenre} profile selected. `;
    }

    // STEP 2: Select Gear Profile based on detected genre
    gearProfile = this.mapGenreToProfile(analysis);

    // STEP 3: Calculate optimal Circuit Drive (THD) based on profile + spectral content
    circuitDrive = this.calculateOptimalTHD(analysis, gearProfile);

    // STEP 4: Determine target LUFS based on gear profile
    const profileData = gearProfiles.find(p => p.id === gearProfile);
    targetLUFS = profileData?.targetLUFS || -14;

    // STEP 5: Build reasoning explanation
    reasoning += this.buildReasoning(analysis, circuitDrive, logicMode, gearProfile, targetLUFS);

    // STEP 6: Calculate confidence score
    confidence = this.calculateConfidence(analysis);

    return {
      circuitDrive,
      logicMode,
      gearProfile,
      targetLUFS,
      confidence,
      reasoning
    };
  }

  private static selectLogicModeForGenre(genre: string): 'brickwall' | 'dynamics' {
    // Aggressive genres use brickwall, organic/dynamic genres use dynamics
    const brickwallGenres = [
      'Hardstyle', 'Hardcore', 'Hard Techno', 'Psytrance', 
      'Dubstep', 'Techno', 'EDM'
    ];
    
    return brickwallGenres.some(g => genre.includes(g)) ? 'brickwall' : 'dynamics';
  }

  private static mapGenreToProfile(analysis: AudioAnalysisResult): GearProfileId {
    const genre = analysis.suggestedGenre.toLowerCase();
    const bass = analysis.spectralBalance.bass;
    const mids = analysis.spectralBalance.mids;
    const highs = analysis.spectralBalance.highs;
    const tempo = analysis.tempo || 120;
    const dynamicRange = analysis.dynamicRange;

    // HOUSE FAMILY (120-128 BPM, warm/groovy)
    if (genre.includes('house')) {
      if (bass > 40 && mids < 30) return 'deephouse'; // Deep, warm
      if (mids > 35 && tempo > 125) return 'techhouse'; // Tight, punchy
      if (highs > 30 && dynamicRange > 8) return 'progressivehouse'; // Emotional, wide
      return 'house'; // Classic fallback
    }

    // TECHNO FAMILY (128-145 BPM, dark/driving)
    if (genre.includes('techno')) {
      if (highs > 25 && dynamicRange > 8) return 'melodictechno'; // Atmospheric
      if (bass > 45 && tempo > 140) return 'hardtechno'; // Industrial
      return 'techno'; // Dark, heavy
    }

    // TRANCE FAMILY (135-145 BPM, bright/energetic)
    if (genre.includes('trance')) {
      if (tempo > 145) return 'psytrance'; // Driving, psychedelic
      if (highs > 35 && dynamicRange > 9) return 'uplifting'; // Emotional builds
      return 'trance'; // Uplifting
    }

    // BASS MUSIC (dubstep, dnb, trap, future bass)
    if (
      genre.includes('drum & bass') ||
      genre.includes('drum and bass') ||
      genre.includes('dnb') ||
      (genre.includes('drum') && genre.includes('bass'))
    ) {
      return 'dnb';
    }

    if (genre.includes('dubstep') || bass > 50) {
      if (tempo > 160) return 'dnb'; // Fast, sub-bass
      if (mids > 40) return 'dubstep'; // Wobble clarity
      if (highs > 40) return 'futurebass'; // Bright supersaws
      return 'trap'; // 808 dominance
    }

    if (genre.includes('drum') || genre.includes('bass')) {
      if (tempo > 160) return 'dnb';
      if (bass > 45 && !genre.includes('drum')) return 'trap';
      return 'futurebass';
    }

    // HARD DANCE (150+ BPM, extreme loudness)
    if (genre.includes('hardstyle') || genre.includes('hardcore')) {
      if (tempo > 180) return 'hardcore'; // Gabber
      return 'hardstyle'; // Reverse bass
    }

    // UK STYLES (skippy, funky)
    if (genre.includes('garage') || genre.includes('uk')) {
      return 'ukgarage'; // Skippy beats
    }
    if (genre.includes('break')) {
      return 'breakbeat'; // Funky
    }

    // VOCAL/ORGANIC CONTENT
    if (genre.includes('r&b') || genre.includes('soul') || genre.includes('vocal')) {
      return 'rnb';
    }

    // HERITAGE/VINTAGE
    if (genre.includes('jazz') || genre.includes('classical') || genre.includes('vintage')) {
      return 'tape';
    }

    // GENRE KEYWORD MATCHING
    if (genre.includes('deep')) return 'deephouse';
    if (genre.includes('tech') && genre.includes('house')) return 'techhouse';
    if (genre.includes('progressive')) return 'progressivehouse';
    if (genre.includes('melodic')) return 'melodictechno';
    if (genre.includes('psy')) return 'psytrance';
    if (genre.includes('trap')) return 'trap';
    if (genre.includes('future')) return 'futurebass';

    // TEMPO-BASED FALLBACK
    if (tempo < 100) return 'rnb'; // Slow/vocal
    if (tempo < 115) return 'deephouse'; // House tempo
    if (tempo < 128) return 'house'; // Standard house
    if (tempo < 138) return 'techno'; // Techno range
    if (tempo < 148) return 'trance'; // Trance range
    if (tempo > 160) return 'dnb'; // Fast tempo

    // DEFAULT: Progressive House (versatile, balanced)
    return 'progressivehouse';
  }

  private static calculateOptimalTHD(analysis: AudioAnalysisResult, gearProfile: GearProfileId): number {
    // Start with profile's recommended saturation
    const profileData = gearProfiles.find(p => p.id === gearProfile);
    let thd = profileData?.saturationAmount || 50;

    // RULE 1: Heritage content needs minimal saturation
    if (analysis.isHeritage) {
      thd = Math.min(thd, 25);
    }

    // RULE 2: Adjust based on spectral balance
    if (analysis.spectralBalance.bass > 40) {
      thd += 5; // More saturation for warmth
    }
    if (analysis.spectralBalance.highs > 35) {
      thd += 8; // Saturation to warm up bright content
    }

    // RULE 3: Already distorted/saturated content
    if (analysis.dynamicRange < 6) {
      thd = Math.min(thd, 35); // Don't over-saturate
    }

    // RULE 4: Dynamic range consideration
    if (analysis.dynamicRange > 12) {
      thd = Math.min(thd, 40); // Preserve clarity
    }

    // Clamp to valid range
    return Math.max(0, Math.min(100, Math.round(thd)));
  }

  private static buildReasoning(
    analysis: AudioAnalysisResult,
    circuitDrive: number,
    logicMode: 'brickwall' | 'dynamics',
    gearProfile: GearProfileId,
    targetLUFS: number
  ): string {
    let reasoning = '';

    // Profile selection
    const profileData = gearProfiles.find(p => p.id === gearProfile);
    if (profileData) {
      reasoning += `${profileData.name} profile: ${profileData.description}. `;
    }

    // Input analysis
    const gainNeeded = targetLUFS - analysis.lufs;
    reasoning += `Input at ${analysis.lufs.toFixed(1)} LUFS requires ${Math.abs(gainNeeded).toFixed(1)}dB ${gainNeeded > 0 ? 'boost' : 'reduction'} to reach ${targetLUFS} LUFS. `;

    // Dynamic range handling
    if (analysis.dynamicRange > 12) {
      reasoning += `High DR (${analysis.dynamicRange.toFixed(1)}dB) - using gentle Dynamics mode to preserve musicality. `;
    } else if (analysis.dynamicRange < 6) {
      reasoning += `Low DR (${analysis.dynamicRange.toFixed(1)}dB) - already compressed, gentle enhancement only. `;
    } else {
      reasoning += `${logicMode === 'brickwall' ? 'Brickwall limiting' : 'Dynamics mode'} for ${analysis.dynamicRange.toFixed(1)}dB DR. `;
    }

    // THD explanation
    if (circuitDrive < 30) {
      reasoning += 'Minimal harmonic saturation to preserve clarity. ';
    } else if (circuitDrive > 60) {
      reasoning += 'Heavy harmonic saturation for analog warmth and weight. ';
    } else {
      reasoning += `${circuitDrive}% THD for moderate harmonic enhancement. `;
    }

    // Spectral balance
    if (analysis.spectralBalance.bass > 40) {
      reasoning += 'Bass-heavy content - extra low-end control. ';
    }
    if (analysis.spectralBalance.highs > 35) {
      reasoning += 'Bright content - saturation adds warmth. ';
    }

    // Tempo-based note
    if (analysis.tempo) {
      if (analysis.tempo > 160) {
        reasoning += `Fast tempo (${Math.round(analysis.tempo)} BPM) - tight dynamics. `;
      } else if (analysis.tempo < 100) {
        reasoning += `Slow tempo (${Math.round(analysis.tempo)} BPM) - preserving groove. `;
      }
    }

    return reasoning.trim();
  }

  private static calculateConfidence(analysis: AudioAnalysisResult): number {
    let confidence = 85; // Base confidence

    // Higher confidence for clear spectral patterns
    if (analysis.spectralBalance.bass > 40 && analysis.tempo && analysis.tempo > 120) {
      confidence += 10; // Clear dance music
    }

    // Higher confidence for heritage content
    if (analysis.isHeritage && analysis.dynamicRange > 12) {
      confidence += 10; // Clear preservation case
    }

    // Lower confidence for edge cases
    if (analysis.lufs > -6 || analysis.lufs < -30) {
      confidence -= 15; // Unusual input levels
    }

    if (analysis.truePeak > -0.5) {
      confidence -= 10; // Clipping/limiting already present
    }

    // Lower confidence for ambiguous genre
    if (analysis.suggestedGenre === 'Unknown' || analysis.suggestedGenre === 'Other') {
      confidence -= 20;
    }

    // Tempo confidence
    if (analysis.tempo && (analysis.tempo < 60 || analysis.tempo > 200)) {
      confidence -= 10; // Unusual tempo
    }

    return Math.max(50, Math.min(100, confidence));
  }
}
