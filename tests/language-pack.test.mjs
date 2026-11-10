import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { runPack, resolveInstall, parseJson, localeText, assertClosed, renameFile } from '../scripts/LanguagePack.mjs';

const checksum = bytes => crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const tree = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory()
  ? tree(path.join(dir, item.name)) : [path.join(dir, item.name)]).sort();
const snapshot = dir => Object.fromEntries(tree(dir).map(file => [path.relative(dir, file), fs.readFileSync(file).toString('base64')]));
function fixture(mac = false) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-zh-CN-'));
  const dir = path.join(temp, 'Apps & Tools', mac ? 'Cursor.app/Contents' : '中文 Cursor=local');
  const app = path.join(dir, mac ? 'Resources/app' : 'resources/app');
  const profileRoot = path.join(temp, 'profile');
  const translationsRoot = path.join(temp, 'translated-zh-CN');
  const main = path.join(app, 'out/vs/workbench/workbench.desktop.main.js');
  write(main, 'const ui={label:"Sign In",id:"Sign In",title:"General",note:"Sign In"};\n');
  write(path.join(app, 'package.json'), { name: 'cursor', version: '3.29.9' });
  write(path.join(app, 'product.json'), { nameShort: 'Cursor', version: '3.29.9', commit: 'fixture-a', dataFolderName: '.cursor',
    checksums: { 'vs/workbench/workbench.desktop.main.js': checksum(fs.readFileSync(main)), 'nls.messages.json': 'old' } });
  write(path.join(app, 'out/nls.keys.json'), [['test/ui', ['hello', 'hello', 'count', 'future']]]);
  write(path.join(app, 'out/nls.messages.json'), ['Hello', 'World', 'Files {0}', 'New feature']);
  write(path.join(app, 'extensions/git/package.json'), { name: 'git', publisher: 'vscode', l10n: './l10n' });
  write(path.join(app, 'extensions/git/package.nls.json'), { title: 'Git settings', protocol: 'DO_NOT_CHANGE' });
  write(path.join(app, 'extensions/git/l10n/bundle.l10n.json'), { Open: { message: 'Open', comment: 'keep comment' }, Unknown: 'New text' });
  write(path.join(app, 'extensions/git/dist/main.js'), 'const message=api.l10n.t("Open");const id="Open";\n');
  write(path.join(profileRoot, 'argv.json'), '// Keep this comment\n{\n  "disable-hardware-acceleration": true,\n  "nested": {"locale":"en"},\n}\n');
  write(path.join(translationsRoot, 'metadata.json'), { locale: 'zh-cn', verifiedCursorVersions: ['3.29.9'] });
  write(path.join(translationsRoot, 'workbench.json'), { 'test/ui': { hello: { bySource: { Hello: '你好', World: '世界' } }, count: '文件 {1}' } });
  write(path.join(translationsRoot, 'hardcoded.json'), { 'Sign In': '登录', General: '通用' });
  write(path.join(translationsRoot, 'commerce.json'), {});
  write(path.join(translationsRoot, 'extensions.json'), { 'vscode.git': { package: { title: 'Git 设置' }, bundle: { Open: '打开' } } });
  if (mac) {
    write(path.join(dir, 'MacOS/Cursor'), 'original signed executable');
    write(path.join(dir, '_CodeSignature/CodeResources'), 'original resource seal');
  }
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (command === '/bin/ps') return { status: 0, stdout: '' };
    if (command === '/usr/bin/ditto') { fs.cpSync(args[0], args[1], { recursive: true }); return { status: 0 }; }
    if (command === '/usr/bin/codesign') {
      if (args.includes('--force')) {
        write(path.join(args.at(-1), 'Contents/_CodeSignature/CodeResources'), 'ad-hoc resource seal');
        write(path.join(args.at(-1), 'Contents/MacOS/Cursor'), 'ad-hoc executable');
      }
      return { status: 0 };
    }
    throw new Error('Unexpected command: ' + command);
  };
  return { temp, dir, app, main, profileRoot, translationsRoot, calls, run,
    options: { dir, profileRoot, translationsRoot, platform: mac ? 'darwin' : 'fixture', run, log: () => {} },
    cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}

test('JSONC locale edit preserves comments, nested locale, strings and unrelated options', () => {
  const before = '// "locale": "fake"\n{ "nested":{"locale":"en"}, "url":"https://host/,}", "flag":true, }';
  const after = localeText(before);
  assert.ok(after.includes('// "locale": "fake"'));
  assert.ok(after.includes('"nested":{"locale":"en"}'));
  assert.equal(parseJson(after).locale, 'zh-cn');
  assert.equal(parseJson(after).url, 'https://host/,}');
  assert.equal(parseJson(after).flag, true);
  assert.equal(localeText(after), after);
  assert.equal(parseJson(localeText('{"\\u006cocale":"en"}')).locale, 'zh-cn');
  for (const bad of ['[]', '{"locale":false}', '{"x":1 2}', '{/* unterminated']) assert.throws(() => localeText(bad));
});

test('Windows replacement retries brief denial but preserves persistent and unrelated errors', () => {
  let calls = 0;
  const waits = [];
  renameFile('source', 'target', { platform: 'win32', rename: () => { if (++calls < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' }); }, wait: ms => waits.push(ms) });
  assert.equal(calls, 3); assert.equal(waits.length, 2);
  let failures = 0;
  assert.throws(() => renameFile('source', 'target', { platform: 'win32', rename: () => { failures++; throw Object.assign(new Error('denied'), { code: 'EACCES' }); }, wait: () => {} }), /denied/);
  assert.equal(failures, 9);
  for (const [platform, code] of [['darwin', 'EPERM'], ['win32', 'ENOENT']]) {
    let attempts = 0;
    assert.throws(() => renameFile('source', 'target', { platform, rename: () => { attempts++; throw Object.assign(new Error(code), { code }); }, wait: () => assert.fail('must not retry') }));
    assert.equal(attempts, 1);
  }
});

test('Windows and macOS running-client guards ignore only their own runtime and other installations', () => {
  const root = path.resolve('Apps/Cursor');
  const result = processes => () => ({ status: 0, stdout: JSON.stringify(processes) });
  assert.doesNotThrow(() => assertClosed(root, { platform: 'win32', run: result([{ Id: process.pid, Path: path.join(root, 'Cursor.exe') }]) }));
  assert.doesNotThrow(() => assertClosed(root, { platform: 'win32', run: result([{ Id: 12345678, Path: path.resolve('Other/Cursor.exe') }]) }));
  assert.throws(() => assertClosed(root, { platform: 'win32', run: result([{ Id: 12345678, Path: path.join(root, 'Cursor.exe') }]) }), /完全退出/);
  assert.throws(() => assertClosed(root, { platform: 'win32', run: result([{ Id: process.ppid, Path: path.join(root, 'Cursor.exe') }]) }), /完全退出/);
  assert.throws(() => assertClosed('/Applications/Cursor.app/Contents', { platform: 'darwin', run: () => ({ status: 0, stdout: ' 987654 /Applications/Cursor.app/Contents/MacOS/Cursor\n' }) }), /完全退出/);
});

test('preview is read-only and identifies source variants, fallback and built-in translations', () => {
  const f = fixture();
  try {
    const appBefore = snapshot(f.app), profileBefore = snapshot(f.profileRoot);
    const result = runPack({ ...f.options, action: 'preview' });
    assert.equal(result.stats.matched, 2); assert.equal(result.stats.fallback, 2);
    assert.equal(result.stats.builtin, 3);
    assert.deepEqual(snapshot(f.app), appBefore); assert.deepEqual(snapshot(f.profileRoot), profileBefore);
    assert.equal(fs.existsSync(result.stateRoot), false);
    assert.equal(resolveInstall(path.join(f.app, 'product.json')).installRoot, f.dir);
  } finally { f.cleanup(); }
});

test('install, repeat install and restore keep original bytes, JSONC options, code IDs and checksums', () => {
  const f = fixture();
  try {
    const original = snapshot(f.app), argvBefore = fs.readFileSync(path.join(f.profileRoot, 'argv.json'));
    const first = runPack(f.options);
    assert.deepEqual(parseJson(fs.readFileSync(path.join(f.app, 'out/nls.messages.json'), 'utf8')), ['你好', '世界', 'Files {0}', 'New feature']);
    assert.match(fs.readFileSync(f.main, 'utf8'), /label:"登录",id:"Sign In",title:"通用",note:"Sign In"/);
    assert.match(fs.readFileSync(path.join(f.app, 'extensions/git/dist/main.js'), 'utf8'), /l10n.t\("打开"\);const id="Open"/);
    assert.equal(parseJson(fs.readFileSync(path.join(f.app, 'product.json'), 'utf8')).checksums['vs/workbench/workbench.desktop.main.js'], checksum(fs.readFileSync(f.main)));
    assert.equal(parseJson(fs.readFileSync(path.join(f.profileRoot, 'argv.json'), 'utf8')).nested.locale, 'en');
    const patched = snapshot(f.app);
    const backup = fs.readFileSync(path.join(first.stateRoot, 'files/out/vs/workbench/workbench.desktop.main.js'));
    runPack(f.options);
    assert.deepEqual(snapshot(f.app), patched);
    assert.deepEqual(fs.readFileSync(path.join(first.stateRoot, 'files/out/vs/workbench/workbench.desktop.main.js')), backup);
    runPack({ ...f.options, action: 'restore' });
    assert.deepEqual(snapshot(f.app), original);
    assert.deepEqual(fs.readFileSync(path.join(f.profileRoot, 'argv.json')), argvBefore);
    assert.equal(runPack({ ...f.options, action: 'restore' }).files, 0);
  } finally { f.cleanup(); }
});

test('injected write failure rolls application and profile contents back', () => {
  const f = fixture();
  try {
    const before = snapshot(f.app), argv = fs.readFileSync(path.join(f.profileRoot, 'argv.json'));
    assert.throws(() => runPack({ ...f.options, beforeWrite: relative => { if (relative.includes('workbench')) throw new Error('injected disk failure'); } }), /已恢复本次写入前/);
    assert.deepEqual(snapshot(f.app), before);
    assert.deepEqual(fs.readFileSync(path.join(f.profileRoot, 'argv.json')), argv);
  } finally { f.cleanup(); }
});

test('foreign app edits and missing backups stop restore before touching any target', () => {
  const f = fixture();
  try {
    const installed = runPack(f.options);
    const patched = fs.readFileSync(f.main);
    write(f.main, 'foreign edit');
    const foreign = snapshot(f.app);
    assert.throws(() => runPack({ ...f.options, action: 'restore' }), /其他程序修改/);
    assert.deepEqual(snapshot(f.app), foreign);
    fs.writeFileSync(f.main, patched);
    fs.unlinkSync(path.join(installed.stateRoot, 'files/out/nls.messages.json'));
    const before = snapshot(f.app);
    assert.throws(() => runPack({ ...f.options, action: 'restore' }), /原始备份缺失/);
    assert.deepEqual(snapshot(f.app), before);
  } finally { f.cleanup(); }
});

test('NLS misalignment and invalid profile JSON stop before app writes', () => {
  const f = fixture();
  try {
    write(path.join(f.app, 'out/nls.messages.json'), ['Hello']);
    const before = snapshot(f.app);
    assert.throws(() => runPack(f.options), /数量不符/);
    assert.deepEqual(snapshot(f.app), before);
    write(path.join(f.app, 'out/nls.messages.json'), ['Hello', 'World', 'Files {0}', 'New feature']);
    write(path.join(f.profileRoot, 'argv.json'), '{invalid');
    const secondBefore = snapshot(f.app);
    assert.throws(() => runPack(f.options));
    assert.deepEqual(snapshot(f.app), secondBefore);
  } finally { f.cleanup(); }
});

test('user changes to profile options after install are kept during app restore', () => {
  const f = fixture();
  try {
    runPack(f.options);
    write(path.join(f.profileRoot, 'argv.json'), '{"locale":"en","new-user-setting":true}');
    const result = runPack({ ...f.options, action: 'restore' });
    assert.ok(result.warnings.some(w => w.includes('保留当前配置')));
    assert.equal(parseJson(fs.readFileSync(path.join(f.profileRoot, 'argv.json'), 'utf8'))['new-user-setting'], true);
  } finally { f.cleanup(); }
});

test('macOS stages and signs a copy, retains a full app backup and restores original signatures', () => {
  const f = fixture(true);
  try {
    const appBundle = path.dirname(f.dir), original = snapshot(appBundle);
    const installed = runPack(f.options);
    assert.equal(fs.readFileSync(path.join(f.dir, 'MacOS/Cursor'), 'utf8'), 'ad-hoc executable');
    assert.equal(fs.readFileSync(path.join(installed.stateRoot, 'original.app/Contents/MacOS/Cursor'), 'utf8'), 'original signed executable');
    assert.equal(f.calls.filter(([command]) => command.endsWith('/codesign')).length, 2);
    runPack(f.options);
    assert.equal(f.calls.filter(([command]) => command.endsWith('/codesign')).length, 2, 'repeat install needs no signing');
    runPack({ ...f.options, action: 'restore' });
    assert.deepEqual(snapshot(appBundle), original);
    assert.equal(fs.readdirSync(path.dirname(appBundle)).some(n => n.startsWith('.Cursor.zh-CN-')), false);
  } finally { f.cleanup(); }
});

test('macOS signing failure preserves the actual app and cleans only the staging copy', () => {
  const f = fixture(true);
  try {
    const appBundle = path.dirname(f.dir), original = snapshot(appBundle);
    const run = (command, args, options) => command.endsWith('/codesign') ? { status: 1, stderr: 'injected signing failure' } : f.run(command, args, options);
    assert.throws(() => runPack({ ...f.options, run }), /codesign 失败/);
    assert.deepEqual(snapshot(appBundle), original);
    assert.equal(fs.readdirSync(path.dirname(appBundle)).some(n => n.startsWith('.Cursor.zh-CN-')), false);
  } finally { f.cleanup(); }
});
