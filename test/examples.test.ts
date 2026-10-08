/**
 * Runs `spec.md`'s worked examples verbatim. Each `### ` under `## Examples` is one
 * `example.ts`, a `text` fence of exact expected output, and a `Test:` line naming the test
 * that runs it. An example without its test line fails here rather than going unchecked.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkProgram } from '../src/check.ts';
import { format, strictProgram } from './support.ts';

interface Example {
  readonly title: string;
  readonly source: string;
  readonly expected: string;
  readonly testLine: string | undefined;
}

function fence(body: string, lang: string): string | undefined {
  const match = new RegExp(`^\`\`\`${lang}\\n([\\s\\S]*?)^\`\`\`$`, 'm').exec(body);
  return match?.[1];
}

function readExamples(): readonly Example[] {
  const spec = readFileSync(new URL('../spec.md', import.meta.url), 'utf8');
  const section = spec.split(/^## Examples$/m)[1] ?? '';
  return section
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const title = block.slice(0, block.indexOf('\n')).trim();
      return {
        title,
        source: fence(block, 'ts') ?? '',
        expected: fence(block, 'text') ?? '',
        testLine: /^Test: `(.*)`$/m.exec(block)?.[1],
      };
    });
}

const examples = readExamples();

describe('examples', () => {
  test('spec.md has examples', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  for (const ex of examples) {
    const name = ex.title.charAt(0).toLowerCase() + ex.title.slice(1);
    test(name, () => {
      expect(ex.testLine).toBe(`examples › ${name}`);
      const actual = format(checkProgram(strictProgram({ 'example.ts': ex.source })));
      if (process.env.PRINT_EXAMPLES)
        process.stdout.write(`### ${ex.title}\n${actual}\n`);
      expect(actual).toBe(ex.expected);
    });
  }
});
