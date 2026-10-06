import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const serverRequire = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const frontendRequire = createRequire(new URL('../artifacts/hesabat/package.json', import.meta.url));
const mockupRequire = createRequire(new URL('../artifacts/mockup-sandbox/package.json', import.meta.url));
const globRequire = createRequire(mockupRequire.resolve('fast-glob'));
const micromatchRequire = createRequire(globRequire.resolve('micromatch'));
const braces = micromatchRequire('braces');

function version(requireFrom, name) {
  let directory = path.dirname(requireFrom.resolve(name));
  while (directory !== path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const info = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (info.name === name) return info.version;
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Cannot locate ${name} package metadata`);
}

test('resolved dependencies use the security releases', () => {
  const expressRequire = createRequire(serverRequire.resolve('express'));
  const prettyRequire = createRequire(serverRequire.resolve('pino-pretty'));
  const postcssRequire = createRequire(frontendRequire.resolve('postcss'));
  assert.equal(version(serverRequire, 'esbuild'), '0.28.1');
  assert.equal(version(expressRequire, 'proxy-addr'), '2.0.8');
  assert.equal(version(prettyRequire, 'fast-copy'), '4.1.0');
  assert.equal(version(postcssRequire, 'source-map-js'), '1.2.2');
});

test('IPv4-mapped IPv6 subnet trust does not accept unrelated addresses', () => {
  const expressRequire = createRequire(serverRequire.resolve('express'));
  const proxyaddr = expressRequire('proxy-addr');
  const trust = proxyaddr.compile(['::ffff:127.0.0.1/128']);
  assert.equal(trust('127.0.0.1'), true);
  assert.equal(trust('::ffff:127.0.0.1'), true);
  assert.equal(trust('10.0.0.1'), false);
  assert.equal(trust('::ffff:10.0.0.1'), false);
});

test('braces rejects hostile nesting before exhausting the stack', () => {
  // Keep the payload below the existing 10,000-character guard.
  const tooDeep = '{'.repeat(4_998) + 'a,b' + '}'.repeat(4_998);
  const tooManyParens = '('.repeat(4_998) + 'x' + ')'.repeat(4_998);
  const reject = { name: 'SyntaxError', message: /maximum depth/ };
  for (const pattern of [tooDeep, tooManyParens, '{'.repeat(4_000)]) {
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](pattern), reject, method);
    }
  }
  // AST callers bypass the parser, so each recursive walker needs its guard.
  for (const method of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'x' };
    for (let i = 0; i < 2_000; i++) ast = { type: 'root', nodes: [ast] };
    assert.throws(() => braces[method](ast), reject, `${method} AST`);
  }
});

test('normal brace expansion and glob matching still work', () => {
  assert.deepEqual(braces.expand('src/{pages,components}/**/*.{ts,tsx}'), [
    'src/pages/**/*.ts', 'src/pages/**/*.tsx',
    'src/components/**/*.ts', 'src/components/**/*.tsx',
  ]);
  assert.deepEqual(braces.expand('{1..3}'), ['1', '2', '3']);
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.equal(braces.compile('a/{b,c}/d'), 'a/(b|c)/d');
  const micromatch = globRequire('micromatch');
  assert.deepEqual(micromatch(['src/a.ts', 'src/a.tsx', 'src/a.js'], 'src/*.{ts,tsx}'), ['src/a.ts', 'src/a.tsx']);
});
