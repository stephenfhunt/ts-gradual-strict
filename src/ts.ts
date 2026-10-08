/**
 * The compiler adapter: every place this tool *constructs* something from TypeScript —
 * a parsed config, a compiler host, a program — lives here, so that supporting another
 * compiler API (TypeScript 7's, `decisions.md` open question) is a change to one module.
 * Reading the AST and diagnostics a program hands back is done where it is used.
 */
import ts from 'typescript';

/**
 * What "strict" means inside a marked region. One constant on purpose: the second
 * program differs from the project's own in exactly these options and nothing else, and
 * adding a strict-family flag later is adding a key here (`decisions.md` 2026-10-08).
 */
export const STRICT_OVERRIDES: ts.CompilerOptions = { strictNullChecks: true };

/**
 * Options the second program needs to *run* without changing what it checks. `noEmit`
 * because this is a checker; `ignoreDeprecations` because TypeScript 6 reports options a
 * legacy tsconfig is likely to carry (`target: es5`, `moduleResolution: node10`) as
 * errors, and a project that builds today must not fail here for that.
 */
const RUN_OVERRIDES: ts.CompilerOptions = { noEmit: true, ignoreDeprecations: '6.0' };

export interface LoadedProject {
  readonly rootNames: readonly string[];
  readonly options: ts.CompilerOptions;
  /** Config-file errors. Non-empty means the project could not be read. */
  readonly errors: readonly ts.Diagnostic[];
}

/** Read a tsconfig the way `tsc -p` does: `extends`, `include`, `files` and all. */
export function loadProject(tsconfigPath: string): LoadedProject {
  const errors: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        errors.push(d);
      },
    },
  );
  if (parsed === undefined) return { rootNames: [], options: {}, errors };
  return { rootNames: parsed.fileNames, options: parsed.options, errors: parsed.errors };
}

/** The project's options with the strict overrides applied. */
export function strictOptions(options: ts.CompilerOptions): ts.CompilerOptions {
  return { ...options, ...RUN_OVERRIDES, ...STRICT_OVERRIDES };
}

/**
 * Lib and other default-library files, parsed once per process. A real project pays for
 * this once; the property suite compiles thousands of small programs and would otherwise
 * spend nearly all its time re-parsing `lib.es*.d.ts`. Keyed by name, language version and
 * the options that change how a file is *bound* (strict mode is a binder concern). Type
 * options such as `strictNullChecks` are not in the key: a bound file is reused across
 * programs that differ only in checking, which is what TypeScript's own document registry
 * does.
 */
const libCache = new Map<string, ts.SourceFile>();

/**
 * A compiler host that always parses JSDoc. TypeScript 5.3+ lets a host skip JSDoc in
 * `.ts` files for speed, and `@strict` is JSDoc, so the default is stated rather than
 * trusted. `files` overlays in-memory sources on the real filesystem, for tests.
 */
export function createHost(
  options: ts.CompilerOptions,
  files?: ReadonlyMap<string, string>,
): ts.CompilerHost {
  const host = ts.createCompilerHost(options, true);
  host.jsDocParsingMode = ts.JSDocParsingMode.ParseAll;
  const realGetSourceFile = host.getSourceFile;
  const defaultLibDir = host.getDefaultLibLocation?.() ?? '';
  const bindKey = `${options.strict ?? ''}/${options.alwaysStrict ?? ''}`;
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = files?.get(fileName);
    if (text !== undefined) {
      return ts.createSourceFile(fileName, text, languageVersion, true);
    }
    const isLib = defaultLibDir !== '' && fileName.startsWith(defaultLibDir);
    const version =
      typeof languageVersion === 'object'
        ? languageVersion.languageVersion
        : languageVersion;
    const key = `${version}:${bindKey}:${fileName}`;
    const cached = isLib ? libCache.get(key) : undefined;
    if (cached !== undefined) return cached;
    const sf = realGetSourceFile.call(
      host,
      fileName,
      languageVersion,
      onError,
      shouldCreate,
    );
    if (isLib && sf !== undefined) libCache.set(key, sf);
    return sf;
  };
  if (files !== undefined) {
    const realFileExists = host.fileExists;
    const realReadFile = host.readFile;
    host.fileExists = (f) => files.has(f) || realFileExists.call(host, f);
    host.readFile = (f) => files.get(f) ?? realReadFile.call(host, f);
  }
  return host;
}

/** The second program: the project's files, read with strict meaning. */
export function createStrictProgram(
  rootNames: readonly string[],
  options: ts.CompilerOptions,
  host?: ts.CompilerHost,
): ts.Program {
  const strict = strictOptions(options);
  return ts.createProgram(rootNames, strict, host ?? createHost(strict));
}
