import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The JSON report is what `tools/test-counts` reads for the baseline line, so every run
    // writes one — including a run someone did by hand.
    reporters: ['default', 'json'],
    outputFile: { json: 'node_modules/.ts-gradual-strict/test-report.json' },
    // Property tests compile hundreds of small programs; the lib files are parsed once per
    // worker and cached, but the first compile in a worker still costs a second or two.
    testTimeout: 60_000,
  },
});
