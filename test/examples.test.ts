/**
 * Runs `spec.md`'s worked examples verbatim. Each `### ` under `## Examples` is one
 * `example.ts`, a `text` fence of exact expected output, and a `Test:` line naming the test
 * that runs it. An example without its test line fails here rather than going unchecked.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, test } from 'vitest';
import { checkProgram } from '../src/check.ts';
import { buildReport, formatReport } from '../src/report.ts';
import { format, ROOT, strictProgram } from './support.ts';

interface Example {
  readonly title: string;
  readonly source: string;
  readonly expected: string;
  readonly testLine: string | undefined;
  readonly report: boolean;
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
        report: /^Flags: .*--report/m.test(block),
      };
    });
}

const examples = readExamples();

// `EXAMPLES_OUT=<file>` writes every example's actual output as JSON, for reading a new
// example's result before pinning it. Never written back into spec.md automatically: an
// example is a claim someone read, not a snapshot.
const actuals: Record<string, string> = {};
afterAll(() => {
  const out = process.env.EXAMPLES_OUT;
  if (out !== undefined) writeFileSync(out, JSON.stringify(actuals, null, 2));
});

describe('examples', () => {
  test('spec.md has examples', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  for (const ex of examples) {
    const name = ex.title.charAt(0).toLowerCase() + ex.title.slice(1);
    test(name, () => {
      expect(ex.testLine).toBe(`examples › ${name}`);
      const program = strictProgram({ 'example.ts': ex.source });
      const diagnostics = checkProgram(program);
      let actual = format(diagnostics);
      if (ex.report) {
        // As the command prints it: a blank line between the two when both are present.
        actual += `${diagnostics.length > 0 ? '\n' : ''}${formatReport(buildReport(program), ROOT)}`;
      }
      actuals[ex.title] = actual;
      expect(actual).toBe(ex.expected);
    });
  }
});
