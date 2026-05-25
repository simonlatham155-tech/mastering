import { useState } from 'react';
import { motion } from 'motion/react';
import { Play, Download, FileAudio } from 'lucide-react';
import { audioProcessor } from '../services/audio-processor';

interface TestResult {
  filename: string;
  genre: string;
  inputLUFS: number;
  inputPeakDBFS: number;
  inputCrestDB: number;
  outputLUFS: number;
  outputPeakDBFS: number;
  outputCrestDB: number;
  avgGainReduction: number;
  peakGainReduction: number;
  processingMode: 'MINIMAL' | 'FULL';
  duration: number;
}

export function TestSuite() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentTest, setCurrentTest] = useState<string>('');

  const runTestSuite = async () => {
    setIsRunning(true);
    setResults([]);
    
    // This would be replaced with actual test files in production
    // For now, this demonstrates the structure
    
    const testFiles: Array<{name: string, genre: string, file: File}> = [];
    
    // User would upload test files through a file input
    // Example structure shown in console
    console.log('📊 TEST SUITE STRUCTURE:');
    console.log('Genre 1: House (3-4 tracks)');
    console.log('  - Dynamic mix (-18 LUFS, -6 dBFS peak)');
    console.log('  - Hot mastered (-14 LUFS, -0.5 dBFS peak)');
    console.log('  - Quiet stem (-22 LUFS, -12 dBFS peak)');
    console.log('');
    console.log('Genre 2: Techno (3-4 tracks)');
    console.log('  - Dynamic mix (-16 LUFS, -8 dBFS peak)');
    console.log('  - Hot mastered (-10 LUFS, -0.3 dBFS peak)');
    console.log('  - Quiet stem (-24 LUFS, -15 dBFS peak)');
    console.log('');
    console.log('Genre 3: R&B (3-4 tracks)');
    console.log('  - Dynamic mix (-20 LUFS, -9 dBFS peak)');
    console.log('  - Hot mastered (-12 LUFS, -0.8 dBFS peak)');
    console.log('  - Quiet stem (-26 LUFS, -18 dBFS peak)');
    
    setIsRunning(false);
  };

  const downloadReport = () => {
    if (results.length === 0) return;
    
    // Generate CSV report
    const headers = [
      'Filename',
      'Genre',
      'Input LUFS',
      'Input Peak (dBFS)',
      'Input Crest (dB)',
      'Output LUFS',
      'Output Peak (dBFS)',
      'Output Crest (dB)',
      'Avg GR (dB)',
      'Peak GR (dB)',
      'Processing Mode',
      'Duration (s)'
    ];
    
    const rows = results.map(r => [
      r.filename,
      r.genre,
      r.inputLUFS.toFixed(1),
      r.inputPeakDBFS.toFixed(1),
      r.inputCrestDB.toFixed(1),
      r.outputLUFS.toFixed(1),
      r.outputPeakDBFS.toFixed(1),
      r.outputCrestDB.toFixed(1),
      r.avgGainReduction.toFixed(1),
      r.peakGainReduction.toFixed(1),
      r.processingMode,
      r.duration.toFixed(1)
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `latham-test-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <FileAudio className="w-4 h-4 text-cyan-400" />
          Test Suite - Quality Assurance
        </h3>
        <p className="text-xs text-zinc-400 mt-0.5">
          Process 10 tracks across 3 genres, generate LUFS/TP/GR report
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs space-y-2">
        <p className="text-zinc-300 font-semibold">Test Set Requirements:</p>
        <ul className="text-zinc-400 space-y-1 list-disc list-inside">
          <li>10 tracks total (3-4 per genre)</li>
          <li>3 genres: House, Techno, R&B</li>
          <li>Mix of: dynamic mixes, hot masters, quiet stems</li>
          <li>Report includes: LUFS in/out, Peak in/out, Crest, GR stats, Processing mode</li>
        </ul>
      </div>

      {/* Run Test Button */}
      <motion.button
        onClick={runTestSuite}
        disabled={isRunning}
        whileHover={!isRunning ? { scale: 1.02 } : {}}
        whileTap={!isRunning ? { scale: 0.98 } : {}}
        className={`w-full px-6 py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
          isRunning
            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/30'
        }`}
      >
        <Play className="w-4 h-4" />
        {isRunning ? `Running: ${currentTest}` : 'Run Test Suite'}
      </motion.button>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-300">
              Test Results ({results.length} tracks)
            </p>
            <button
              onClick={downloadReport}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <Download className="w-3 h-3" />
              Download CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-2 text-zinc-400 font-semibold">File</th>
                  <th className="text-left py-2 px-2 text-zinc-400 font-semibold">Genre</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">In LUFS</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">In Peak</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">Out LUFS</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">Out Peak</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">Avg GR</th>
                  <th className="text-right py-2 px-2 text-zinc-400 font-semibold">Peak GR</th>
                  <th className="text-left py-2 px-2 text-zinc-400 font-semibold">Mode</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr key={idx} className="border-b border-zinc-900 hover:bg-zinc-900/50">
                    <td className="py-2 px-2 text-zinc-300 font-mono">{result.filename}</td>
                    <td className="py-2 px-2 text-zinc-400">{result.genre}</td>
                    <td className="py-2 px-2 text-zinc-300 font-mono text-right">{result.inputLUFS.toFixed(1)}</td>
                    <td className="py-2 px-2 text-zinc-300 font-mono text-right">{result.inputPeakDBFS.toFixed(1)}</td>
                    <td className="py-2 px-2 text-cyan-400 font-mono text-right font-semibold">{result.outputLUFS.toFixed(1)}</td>
                    <td className="py-2 px-2 text-cyan-400 font-mono text-right font-semibold">{result.outputPeakDBFS.toFixed(1)}</td>
                    <td className="py-2 px-2 text-amber-400 font-mono text-right">{result.avgGainReduction.toFixed(1)}</td>
                    <td className="py-2 px-2 text-amber-400 font-mono text-right">{result.peakGainReduction.toFixed(1)}</td>
                    <td className="py-2 px-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-semibold ${
                        result.processingMode === 'MINIMAL'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {result.processingMode}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase">Avg Output LUFS</p>
              <p className="text-lg font-mono text-cyan-400">
                {(results.reduce((sum, r) => sum + r.outputLUFS, 0) / results.length).toFixed(1)}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase">Avg Peak (dBFS)</p>
              <p className="text-lg font-mono text-cyan-400">
                {(results.reduce((sum, r) => sum + r.outputPeakDBFS, 0) / results.length).toFixed(1)}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase">Avg GR</p>
              <p className="text-lg font-mono text-amber-400">
                {(results.reduce((sum, r) => sum + r.avgGainReduction, 0) / results.length).toFixed(1)} dB
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase">Minimal Mode</p>
              <p className="text-lg font-mono text-green-400">
                {results.filter(r => r.processingMode === 'MINIMAL').length}/{results.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
