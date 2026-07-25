import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

interface WorkletPort {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage: (message: unknown) => void;
}

interface TestProcessor {
  port: WorkletPort;
  process: (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ) => boolean;
}

type ProcessorConstructor = new () => TestProcessor;

function loadProcessor(sampleRate = 48_000): TestProcessor {
  const workletUrl = new URL(
    '../../../../public/worklets/oversampling-limiter.js',
    import.meta.url
  );
  const source = readFileSync(workletUrl, 'utf8');
  let Processor: ProcessorConstructor | null = null;

  class MockAudioWorkletProcessor {
    port: WorkletPort = {
      onmessage: null,
      postMessage: () => undefined,
    };
  }

  vm.runInNewContext(source, {
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    Float32Array,
    Math,
    console,
    sampleRate,
    registerProcessor: (_name: string, constructor: ProcessorConstructor) => {
      Processor = constructor;
    },
  });

  if (!Processor) {
    throw new Error('Worklet did not register a processor');
  }
  const RegisteredProcessor = Processor as ProcessorConstructor;
  return new RegisteredProcessor();
}

function setParameters(
  processor: TestProcessor,
  data: Record<string, number | boolean>
): void {
  processor.port.onmessage?.({
    data: { type: 'setParameters', data },
  });
}

function renderBlocks(
  processor: TestProcessor,
  left: Float32Array,
  right: Float32Array
): [Float32Array, Float32Array] {
  const blockSize = 128;
  const outputLeft = new Float32Array(left.length);
  const outputRight = new Float32Array(right.length);

  for (let offset = 0; offset < left.length; offset += blockSize) {
    const output = [
      new Float32Array(blockSize),
      new Float32Array(blockSize),
    ];
    processor.process(
      [[
        left.subarray(offset, offset + blockSize),
        right.subarray(offset, offset + blockSize),
      ]],
      [output]
    );
    outputLeft.set(output[0], offset);
    outputRight.set(output[1], offset);
  }

  return [outputLeft, outputRight];
}

describe('4× FIR true-peak worklet DSP', () => {
  it('keeps the source and deployed worklet byte-identical', () => {
    const source = readFileSync(
      new URL('../../worklets/oversampling-limiter.js', import.meta.url),
      'utf8'
    );
    const deployed = readFileSync(
      new URL('../../../../public/worklets/oversampling-limiter.js', import.meta.url),
      'utf8'
    );
    expect(deployed).toBe(source);
  });

  it('provides real 5 ms look-ahead and preserves stereo image under limiting', () => {
    const processor = loadProcessor();
    setParameters(processor, {
      ceiling: -6,
      attack: 0.0001,
      release: 0.1,
      hqMode: true,
      monitorOnly: false,
    });

    const left = new Float32Array(4_096);
    const right = new Float32Array(4_096);
    left[0] = 1;
    right[0] = 0.25;

    const [outputLeft, outputRight] = renderBlocks(processor, left, right);
    const firstSignal = outputLeft.findIndex((sample) => Math.abs(sample) > 1e-8);
    let peakIndex = 0;
    for (let i = 1; i < outputLeft.length; i++) {
      if (Math.abs(outputLeft[i]) > Math.abs(outputLeft[peakIndex])) {
        peakIndex = i;
      }
    }

    expect(firstSignal).toBe(240);
    expect(outputLeft[peakIndex] / outputRight[peakIndex]).toBeCloseTo(4, 5);
  });

  it.each([44_100, 48_000, 96_000])(
    'quantizes 5 ms look-ahead consistently at %i Hz',
    (testSampleRate) => {
      const processor = loadProcessor(testSampleRate);
      setParameters(processor, {
        ceiling: -6,
        attack: 0.0001,
        release: 0.1,
        hqMode: true,
        monitorOnly: false,
      });

      const length = Math.ceil((testSampleRate * 0.02) / 128) * 128;
      const impulse = new Float32Array(length);
      impulse[0] = 1;
      const [output] = renderBlocks(processor, impulse, impulse);
      const expectedLookahead = Math.ceil(
        Math.floor(testSampleRate * 0.005 * 4) / 4
      );
      let peakIndex = 0;
      for (let i = 1; i < output.length; i++) {
        if (Math.abs(output[i]) > Math.abs(output[peakIndex])) peakIndex = i;
      }

      expect(output.findIndex((sample) => Math.abs(sample) > 1e-8)).toBe(
        expectedLookahead
      );
      expect(peakIndex).toBe(expectedLookahead + 5);
    }
  );

  it('uses one linked gain envelope and respects the ceiling in HQ and basic modes', () => {
    for (const hqMode of [true, false]) {
      const processor = loadProcessor();
      setParameters(processor, {
        ceiling: -6,
        attack: 0.001,
        release: 0.1,
        hqMode,
        monitorOnly: false,
      });

      const left = new Float32Array(8_192);
      const right = new Float32Array(8_192);
      for (let i = 0; i < left.length; i++) {
        left[i] = 1.2 * Math.sin((2 * Math.PI * 997 * i) / 48_000);
        right[i] = left[i] * 0.4;
      }

      const [outputLeft, outputRight] = renderBlocks(processor, left, right);
      const ceilingLinear = 10 ** (-6 / 20);
      let peak = 0;
      let maxRatioError = 0;
      for (let i = 0; i < outputLeft.length; i++) {
        peak = Math.max(peak, Math.abs(outputLeft[i]), Math.abs(outputRight[i]));
        if (Math.abs(outputRight[i]) > 1e-5) {
          maxRatioError = Math.max(
            maxRatioError,
            Math.abs(outputLeft[i] / outputRight[i] - 2.5)
          );
        }
      }

      expect(peak).toBeLessThanOrEqual(ceilingLinear + 1e-6);
      expect(maxRatioError).toBeLessThan(0.001);
    }
  });

  it('is sample-identical when used as a monitor-only meter tap', () => {
    const processor = loadProcessor();
    setParameters(processor, {
      ceiling: -1,
      hqMode: true,
      monitorOnly: true,
    });

    const left = Float32Array.from({ length: 256 }, (_, i) => Math.sin(i / 9));
    const right = Float32Array.from({ length: 256 }, (_, i) => Math.cos(i / 13));
    const [outputLeft, outputRight] = renderBlocks(processor, left, right);

    expect(outputLeft).toEqual(left);
    expect(outputRight).toEqual(right);
  });
});
