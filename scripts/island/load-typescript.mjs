import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';

const require = createRequire(import.meta.url);

// Exercise the actual runtime modules in Node, including Vite raw-SVG imports.
export function loadTS(filename, cache = new Map()) {
  if (cache.has(filename)) return cache.get(filename).exports;
  if (filename.endsWith('.json')) return JSON.parse(readFileSync(filename, 'utf8'));
  const module = { exports: {} }; cache.set(filename, module);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name === 'three') return THREE;
    if (name.endsWith('.svg?raw')) return readFileSync(require.resolve(name.slice(0, -4)), 'utf8');
    if (!name.startsWith('.')) return require(name);
    const base = resolve(dirname(filename), name);
    const target = [base, `${base}.ts`, `${base}.json`, resolve(base, 'index.ts')]
      .find(file => { try { return statSync(file).isFile(); } catch { return false; } });
    if (!target) throw new Error(`Missing test module ${name}`);
    return loadTS(target, cache);
  };
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
}
