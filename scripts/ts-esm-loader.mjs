import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tryResolve = async (candidate) => {
  try {
    await access(candidate);
    return pathToFileURL(candidate).href;
  } catch {
    return null;
  }
};

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const isAbsolutePath = specifier.startsWith('/');
    const isFileUrl = specifier.startsWith('file://');

    if (!isRelative && !isAbsolutePath && !isFileUrl) {
      throw error;
    }

    const parentPath = context.parentURL
      ? fileURLToPath(context.parentURL)
      : process.cwd();
    const basePath = isFileUrl
      ? fileURLToPath(specifier)
      : isAbsolutePath
        ? specifier
        : path.resolve(path.dirname(parentPath), specifier);

    const candidates = [
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.mjs`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
      path.join(basePath, 'index.mjs'),
      basePath,
    ];

    for (const candidate of candidates) {
      const resolved = await tryResolve(candidate);
      if (resolved) {
        return defaultResolve(resolved, context, defaultResolve);
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
      },
      fileName: fileURLToPath(url),
      reportDiagnostics: false,
    });

    return {
      format: 'module',
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
