import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  faustLimiterMetaUrl,
  faustLimiterWasmUrl,
  faustVendorModuleUrl,
} from '../faust-limiter';

type FaustUiItem = {
  address?: string;
  items?: FaustUiItem[];
};

function collectAddresses(items: FaustUiItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.address ? [item.address] : []),
    ...collectAddresses(item.items ?? []),
  ]);
}

describe('Faust limiter build contract', () => {
  it('ships a stereo limiter with every visible runtime parameter', () => {
    const metadataUrl = new URL(
      '../../../../public/faust/compiled/limiter/dsp-meta.json',
      import.meta.url
    );
    const metadata = JSON.parse(readFileSync(metadataUrl, 'utf8')) as {
      name: string;
      inputs: number;
      outputs: number;
      ui: FaustUiItem[];
    };

    expect(metadata.name).toBe('Latham Master Limiter');
    expect(metadata.inputs).toBe(2);
    expect(metadata.outputs).toBe(2);
    expect(collectAddresses(metadata.ui).sort()).toEqual(
      [
        '/Limiter/Attack',
        '/Limiter/Ceiling',
        '/Limiter/Mix',
        '/Limiter/Ratio',
        '/Limiter/Release',
        '/Limiter/Threshold',
      ].sort()
    );
  });

  it('resolves every fetched Faust asset to an absolute browser URL', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://example.test/mastering/' },
    });

    for (const assetUrl of [
      faustVendorModuleUrl(),
      faustLimiterWasmUrl(),
      faustLimiterMetaUrl(),
    ]) {
      expect(new URL(assetUrl).origin).toBe('https://example.test');
    }

    vi.unstubAllGlobals();
  });
});
