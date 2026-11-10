import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rewrite } from './scripts/hardcoded.mjs';
import { rewriteCommerce } from './scripts/commerce.mjs';
import { rewriteExtension } from './scripts/extensions.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COMMERCE = 'out/vs/workbench/workbench.xai-commerce-prepaid.js';
const BUNDLES = ['out/vs/workbench/workbench.desktop.main.js', 'out/vs/workbench/workbench.glass.main.js',
  'out/vs/workbench/workbench.anysphere-ui-automations.js', COMMERCE];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const exists = file => fs.existsSync(file);

// A small JSONC lexer also supplies exact edit offsets for argv.json. Quoted
// strings, comment text and nested properties must never become edit anchors.
export function jsonTokens(text) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const start = i, c = text[i];
    if (/\s|\uFEFF/.test(c)) { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new Error('JSON 注释未结束');
      i = end + 2; continue;
    }
    if (c === '"') {
      i++;
      while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === '"') break; }
    } else if ('{}[]:,'.includes(c)) i++;
    else { while (i < text.length && !/[\s{}\[\]:,]/.test(text[i])) i++; }
    tokens.push({ raw: text.slice(start, i), start, end: i });
  }
  return tokens;
}

export function parseJson(text) {
  const tokens = jsonTokens(text);
  return JSON.parse(tokens.filter((token, i) => !(token.raw === ',' && /^[}\]]$/.test(tokens[i + 1]?.raw))).map(t => t.raw).join(' '));
}
const read = (file, fallback) => exists(file) ? parseJson(fs.readFileSync(file, 'utf8')) : fallback;
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

export function localeText(text) {
  const parsed = parseJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('argv.json 必须是 JSON 对象');
  const tokens = jsonTokens(text);
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.raw === '{' || token.raw === '[') depth++;
    else if (token.raw === '}' || token.raw === ']') depth--;
    else if (depth === 1 && token.raw.startsWith('"') && JSON.parse(token.raw) === 'locale' && tokens[i + 1]?.raw === ':') {
      const value = tokens[i + 2];
      if (!value?.raw.startsWith('"')) throw new Error('argv.json 的 locale 不是字符串');
      return text.slice(0, value.start) + '"zh-cn"' + text.slice(value.end);
    }
  }
  const close = tokens.at(-1), previous = tokens.at(-2);
  if (close?.raw !== '}') throw new Error('argv.json 缺少结束括号');
  const comma = ['{', ','].includes(previous.raw) ? '' : ',';
  return text.slice(0, previous.end) + comma + text.slice(previous.end, close.start) + '\n  "locale": "zh-cn"\n' + text.slice(close.start);
}

function within(base, relative) {
  const result = path.resolve(base, relative), rel = path.relative(base, result);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('路径超出允许目录：' + relative);
  return result;
}
export function renameFile(source, target, { platform = process.platform, rename = fs.renameSync,
  wait = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return rename(source, target); }
    catch (error) {
      // Windows can briefly deny replacement while a freshly written JS file
      // is being inspected. Keep the atomic operation and bound the retry; do
      // not delete the destination, change ACLs or hide persistent failures.
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 8) throw error;
      wait(25 * (attempt + 1));
    }
  }
}
function atomic(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.zh-CN-' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: exists(file) ? fs.statSync(file).mode & 0o777 : 0o644 });
    renameFile(temp, file);
    if (hash(fs.readFileSync(file)) !== hash(bytes)) throw new Error('写入校验失败：' + file);
  } finally { if (exists(temp)) fs.unlinkSync(temp); }
}
const markers = text => [String(text).match(/\{\d+\}/g), String(text).match(/\$\([a-z0-9-~]+\)/gi), String(text).match(/\(command:[^)\s]+\)/g)]
  .map(list => (list ?? []).sort().join('\0')).join('\n');
const usable = (english, chinese) => typeof chinese === 'string' && chinese.length > 0 && markers(english) === markers(chinese);

export function resolveInstall(candidate) {
  let root = path.resolve(candidate);
  if (exists(root) && fs.statSync(root).isFile()) root = path.dirname(root);
  if (/\.app$/i.test(root)) root = path.join(root, 'Contents');
  for (let i = 0; i < 5; i++) {
    for (const resources of ['resources', 'Resources']) {
      const appRoot = path.join(root, resources, 'app');
      if (exists(path.join(appRoot, 'package.json')) && exists(path.join(appRoot, 'product.json'))) return { installRoot: fs.realpathSync(root), appRoot: fs.realpathSync(appRoot) };
    }
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error('未找到 Cursor 的 resources/app：' + candidate);
}

export function assertClosed(installRoot, { platform = process.platform, run = spawnSync } = {}) {
  let processes = [];
  if (platform === 'win32') {
    const command = '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ConvertTo-Json -Compress -InputObject @(Get-Process -Name Cursor -ErrorAction SilentlyContinue | Select-Object Id,Path)';
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const result = run(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
    if (result.error || result.status !== 0) throw new Error('无法检查 Cursor 进程，请完全退出后重试。' + (result.error?.message ?? result.stderr ?? ''));
    processes = parseJson(result.stdout.replace(/^\uFEFF/, ''));
  } else if (platform === 'darwin') {
    const result = run('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('无法检查 Cursor 进程');
    processes = result.stdout.split('\n').flatMap(line => {
      const match = line.match(/^\s*(\d+)\s+(.+\/Cursor)\s*$/);
      return match ? [{ Id: Number(match[1]), Path: match[2] }] : [];
    });
  }
  const normalized = value => platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  for (const item of processes) {
    if (item.Id === process.pid) continue;
    if (!item.Path || normalized(item.Path).startsWith(normalized(installRoot) + path.sep)) {
      throw new Error(`请先保存工作并完全退出目标 Cursor（PID ${item.Id}），再安装或恢复。`);
    }
  }
}

function execute(run, command, args) {
  const result = run(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(path.basename(command) + ' 失败：' + (result.error?.message ?? result.stderr ?? result.stdout ?? result.status));
}

// Only directories freshly created by this call may be removed here. Full app
// backups are retained in the profile and never cleaned up automatically.
function removeStage(stage, appParent) {
  if (path.dirname(stage) !== appParent || !path.basename(stage).startsWith('.Cursor.zh-CN-')) throw new Error('拒绝清理未验证的路径');
  fs.rmSync(stage, { recursive: true, force: true });
}

export function runPack({ dir, action = 'install', translationsRoot = path.join(ROOT, 'translated-zh-CN'), profileRoot,
  platform = process.platform, run = spawnSync, log = console.log, beforeWrite = () => {} }) {
  const install = resolveInstall(dir);
  const productFile = path.join(install.appRoot, 'product.json');
  const productBefore = fs.readFileSync(productFile);
  const product = parseJson(productBefore.toString('utf8'));
  const version = product.version ?? read(path.join(install.appRoot, 'package.json')).version;
  if (!/cursor/i.test(product.nameShort ?? product.nameLong ?? '')) throw new Error('目标不是 Cursor，未修改文件');
  const dataFolder = product.dataFolderName || '.cursor';
  if (path.basename(dataFolder) !== dataFolder || ['.', '..'].includes(dataFolder)) throw new Error('不支持的用户数据目录名');
  const profile = profileRoot ?? path.join(os.homedir(), dataFolder);
  const identity = platform === 'win32' ? install.installRoot.toLowerCase() : install.installRoot;
  const stateRoot = path.join(profile, 'cursor-zh-CN', hash(Buffer.from(identity)).slice(0, 16), hash(Buffer.from(`${version}:${product.commit ?? ''}`)).slice(0, 16));
  const stateFile = path.join(stateRoot, 'state.json');
  const savedStateBytes = exists(stateFile) ? fs.readFileSync(stateFile) : null;
  const state = savedStateBytes ? parseJson(savedStateBytes.toString('utf8')) : null;
  if (state && (state.installRoot !== install.installRoot || state.version !== version || state.commit !== product.commit)) throw new Error('备份身份不匹配，未修改文件');
  const backupFile = relative => within(stateRoot, 'files/' + relative);
  log(`Cursor ${version}：${install.installRoot}`);
  if (action === 'status') {
    const entries = Object.entries(state?.files ?? {});
    const intact = entries.filter(([relative, entry]) => exists(within(install.appRoot, relative)) && hash(fs.readFileSync(within(install.appRoot, relative))) === entry.patched).length;
    log(state ? `${state.phase === 'restored' ? '已恢复安装前文件' : state.phase === 'installed' ? '已安装简体中文补丁' : '上次操作未完成，已保留可恢复备份'}；文件校验 ${intact}/${entries.length}；备份：${stateRoot}` : '当前版本尚未通过此脚本汉化。');
    return { stateRoot, intact, files: entries.length };
  }
  if (!['install', 'preview', 'restore'].includes(action)) throw new Error('未知操作：' + action);
  if (action !== 'preview') assertClosed(install.installRoot, { platform, run });
  const argvFile = path.join(profile, 'argv.json');
  const profileBefore = exists(argvFile) ? fs.readFileSync(argvFile) : null;
  const plan = new Map();
  const nextFiles = { ...(state?.files ?? {}) };
  const warnings = [];
  const source = relative => {
    const file = within(install.appRoot, relative);
    const physical = path.relative(fs.realpathSync(install.appRoot), fs.realpathSync(file));
    if (physical.startsWith('..') || path.isAbsolute(physical)) throw new Error('拒绝修改应用目录外的符号链接：' + relative);
    const current = fs.readFileSync(file);
    const previous = state?.files?.[relative];
    if (!previous) return { current, original: current };
    if (![previous.original, previous.patched].includes(hash(current))) throw new Error(relative + ' 在安装后被其他程序修改，已停止，备份保留。');
    const backup = backupFile(relative);
    if (!exists(backup) || hash(fs.readFileSync(backup)) !== previous.original) throw new Error(relative + ' 原始备份缺失或校验失败');
    return { current, original: fs.readFileSync(backup) };
  };
  const add = (relative, bytes, originalData) => {
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const { current, original } = originalData ?? source(relative);
    if (!current.equals(data)) plan.set(relative, { relative, current, original, data });
  };
  let stats = {};
  let profileAfter = profileBefore;
  if (action === 'restore') {
    if (!state) { log('当前版本没有需要恢复的文件。'); return { restored: 0, stateRoot }; }
    for (const relative of Object.keys(state.files)) { const data = source(relative); add(relative, data.original, data); }
    if (state.profile && profileBefore && hash(profileBefore) === state.profile.patched) {
      profileAfter = state.profile.original === null ? null : Buffer.from(state.profile.original, 'base64');
    } else if (state.profile && state.phase !== 'restored') warnings.push('用户语言配置已在安装后更改，保留当前配置；可在 Cursor 中手动切换显示语言。');
  } else {
    const info = read(path.join(translationsRoot, 'metadata.json'));
    if (info.locale !== 'zh-cn') throw new Error('此脚本仅支持简体中文资源');
    if (!info.verifiedCursorVersions.includes(version)) warnings.push(`Cursor ${version} 尚未核对，未匹配或占位符不符的文案将保留原文。`);
    const translations = read(path.join(translationsRoot, 'workbench.json'));
    const keysFile = path.join(install.appRoot, 'out/nls.keys.json');
    if (!exists(keysFile)) throw new Error('不支持此版本的 NLS 结构（缺少 nls.keys.json），未修改程序');
    const keyBytes = fs.readFileSync(keysFile), keys = parseJson(keyBytes.toString('utf8'));
    if (state?.keyMetadataHash && state.keyMetadataHash !== hash(keyBytes)) throw new Error('当前版本的 NLS 键结构已改变，未修改程序');
    const nls = source('out/nls.messages.json'), messages = parseJson(nls.original.toString('utf8'));
    if (!Array.isArray(keys) || !Array.isArray(messages)) throw new Error('NLS 资源必须是数组');
    let offset = 0, matched = 0, fallback = 0, testFallback = 0;
    const output = [...messages];
    for (const [module, entries] of keys) {
      if (!Array.isArray(entries)) throw new Error('NLS 键列表格式不符');
      for (const entry of entries) {
        const key = typeof entry === 'string' ? entry : entry.key;
        const candidate = translations[module]?.[key];
        const chinese = typeof candidate === 'object' && candidate ? candidate.bySource?.[messages[offset]] : candidate;
        if (usable(messages[offset], chinese)) { output[offset] = chinese; matched++; }
        else { fallback++; if (/(?:^|\/)tests?\/|\.test$/.test(module)) testFallback++; }
        offset++;
      }
    }
    if (offset !== messages.length || messages.some(item => typeof item !== 'string')) throw new Error('NLS 键和值数量不符，停止以避免错位翻译');
    if (!matched) throw new Error('未匹配任何工作台译文，未修改程序');
    add('out/nls.messages.json', jsonBytes(output), nls);
    stats = { total: offset, matched, fallback, testFallback, uiFallback: fallback - testFallback, hardcoded: 0, builtin: 0, keyMetadataHash: hash(keyBytes) };
    const dictionary = read(path.join(translationsRoot, 'hardcoded.json'));
    const commerce = read(path.join(translationsRoot, 'commerce.json'));
    for (const relative of BUNDLES) {
      if (!exists(within(install.appRoot, relative))) continue;
      const data = source(relative), text = data.original.toString('utf8');
      if (relative === COMMERCE && text.includes('/* cursor-commerce-i18n */')) continue;
      const result = relative === COMMERCE ? rewriteCommerce(text, commerce) : rewrite(text, dictionary);
      stats.hardcoded += result.count;
      add(relative, result.text, data);
    }
    const extensionTranslations = read(path.join(translationsRoot, 'extensions.json'));
    const extensionRoot = path.join(install.appRoot, 'extensions');
    if (exists(extensionRoot)) for (const folder of fs.readdirSync(extensionRoot, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const base = path.join(extensionRoot, folder.name), manifest = read(path.join(base, 'package.json'), null);
      if (!manifest) continue;
      const dictionary = extensionTranslations[`${manifest.publisher || 'vscode'}.${manifest.name}`];
      if (!dictionary) continue;
      const candidates = [{ relative: `extensions/${folder.name}/package.nls.json`, dictionary: dictionary.package }];
      for (const directory of new Set([manifest.l10n || 'l10n', '.'])) {
        const target = within(base, path.join(directory, 'bundle.l10n.json'));
        candidates.push({ relative: path.relative(install.appRoot, target), dictionary: dictionary.bundle });
      }
      for (const candidate of candidates) {
        if (!candidate.dictionary || !exists(within(install.appRoot, candidate.relative))) continue;
        const data = source(candidate.relative), strings = parseJson(data.original.toString('utf8'));
        for (const [key, old] of Object.entries(strings)) {
          const english = typeof old === 'string' ? old : old?.message;
          const chinese = candidate.dictionary[key];
          if (typeof english !== 'string' || !usable(english, chinese)) continue;
          strings[key] = typeof old === 'string' ? chinese : { ...old, message: chinese };
          stats.builtin++;
        }
        add(candidate.relative, jsonBytes(strings), data);
      }
      if (dictionary.bundle) {
        const scan = directory => {
          for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && !['node_modules', 'test', 'tests'].includes(entry.name)) scan(path.join(directory, entry.name));
            else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
              const relative = path.relative(install.appRoot, path.join(directory, entry.name));
              const data = source(relative), text = data.original.toString('utf8');
              let result;
              try { result = rewriteExtension(text, dictionary.bundle); }
              catch (error) { throw new Error(relative + ' 本地化调用未识别：' + error.message); }
              if (result.count) { stats.builtin += result.count; add(relative, result.text, data); }
            }
          }
        };
        scan(base);
      }
    }
    const productData = source('product.json');
    let productText = productData.original.toString('utf8');
    for (const key of Object.keys(parseJson(productText).checksums ?? {})) {
      const item = plan.get(key) ?? plan.get('out/' + key);
      const recorded = state?.files?.[key] ?? state?.files?.['out/' + key];
      const bytes = item?.data ?? (recorded ? fs.readFileSync(within(install.appRoot, state.files[key] ? key : 'out/' + key)) : null);
      if (!bytes) continue;
      const escaped = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('(' + escaped + '\\s*:\\s*")[^"]*(")');
      const checksum = crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '');
      productText = productText.replace(re, (_, start, end) => start + checksum + end);
    }
    add('product.json', productText, productData);
    profileAfter = Buffer.from(localeText(profileBefore?.toString('utf8') ?? '{}\n'));
    log(`工作台匹配 ${matched}/${offset} 项，界面英文兜底 ${fallback - testFallback} 项、内部测试原文 ${testFallback} 项；硬编码替换 ${stats.hardcoded} 处；内置扩展匹配 ${stats.builtin} 项。`);
  }
  for (const warning of warnings) log('[提示] ' + warning);
  log(`${action === 'preview' ? '预览将修改' : action === 'restore' ? '准备恢复' : '准备汉化'} ${plan.size} 个程序文件。`);
  if (action === 'preview') return { stats, files: plan.size, stateRoot, warnings };
  for (const item of plan.values()) {
    const file = backupFile(item.relative);
    if (exists(file)) { if (hash(fs.readFileSync(file)) !== hash(item.original)) throw new Error('原始备份内容不符：' + item.relative); }
    else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, item.original, { flag: 'wx' }); }
    nextFiles[item.relative] = { original: hash(item.original), patched: hash(item.data) };
  }
  const profileRecord = state?.profile ?? { original: profileBefore?.toString('base64') ?? null, patched: profileAfter ? hash(profileAfter) : null };
  if (action === 'install') profileRecord.patched = hash(profileAfter);
  const next = { installRoot: install.installRoot, version, commit: product.commit, phase: 'pending', files: nextFiles,
    keyMetadataHash: stats.keyMetadataHash ?? state?.keyMetadataHash, profile: profileRecord };
  let stage, displaced, macApp, swapped = false;
  const appParent = platform === 'darwin' ? path.dirname(path.dirname(install.installRoot)) : null;
  const fullBackup = path.join(stateRoot, 'original.app');
  try {
    if (platform === 'darwin' && plan.size) {
      macApp = path.dirname(install.installRoot);
      if (path.basename(install.installRoot) !== 'Contents' || !macApp.endsWith('.app')) throw new Error('macOS 目标必须是 Cursor.app');
      fs.mkdirSync(stateRoot, { recursive: true });
      if (action === 'install' && !exists(fullBackup)) {
        const preparingBackup = path.join(stateRoot, '.Cursor.zh-CN-original-' + crypto.randomUUID() + '.app');
        try { execute(run, '/usr/bin/ditto', [macApp, preparingBackup]); fs.renameSync(preparingBackup, fullBackup); }
        finally { if (exists(preparingBackup)) removeStage(preparingBackup, stateRoot); }
      }
      if (action === 'restore' && !exists(fullBackup)) throw new Error('完整应用备份缺失，不能恢复 macOS 签名');
      if (action === 'restore') for (const [relative, entry] of Object.entries(state.files)) {
        const backupTarget = within(path.join(fullBackup, path.relative(macApp, install.appRoot)), relative);
        if (!exists(backupTarget) || hash(fs.readFileSync(backupTarget)) !== entry.original) throw new Error('完整应用备份校验失败：' + relative);
      }
      stage = path.join(appParent, '.Cursor.zh-CN-stage-' + crypto.randomUUID() + '.app');
      execute(run, '/usr/bin/ditto', [action === 'restore' ? fullBackup : macApp, stage]);
      if (action === 'install') {
        const relativeApp = path.relative(macApp, install.appRoot);
        for (const item of plan.values()) atomic(within(path.join(stage, relativeApp), item.relative), item.data);
        execute(run, '/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements,requirements,flags,runtime', stage]);
        execute(run, '/usr/bin/codesign', ['--verify', '--deep', '--strict', stage]);
      }
    }
    if (hash(fs.readFileSync(productFile)) !== hash(productBefore)) throw new Error('准备期间 Cursor 已更新，未继续写入');
    for (const item of plan.values()) if (hash(fs.readFileSync(within(install.appRoot, item.relative))) !== hash(item.current)) throw new Error('准备期间文件已改变：' + item.relative);
    atomic(stateFile, jsonBytes(next));
    if (stage) {
      displaced = path.join(appParent, '.Cursor.zh-CN-previous-' + crypto.randomUUID() + '.app');
      fs.renameSync(macApp, displaced);
      try { fs.renameSync(stage, macApp); swapped = true; } catch (error) { fs.renameSync(displaced, macApp); displaced = null; throw error; }
    } else for (const item of plan.values()) { beforeWrite(item.relative); atomic(within(install.appRoot, item.relative), item.data); }
    if ((profileAfter === null) !== (profileBefore === null) || (profileAfter && !profileAfter.equals(profileBefore ?? Buffer.alloc(0)))) {
      if (profileAfter === null) fs.unlinkSync(argvFile); else atomic(argvFile, profileAfter);
    }
    for (const item of plan.values()) if (hash(fs.readFileSync(within(install.appRoot, item.relative))) !== hash(item.data)) throw new Error('最终校验失败：' + item.relative);
    next.phase = action === 'restore' ? 'restored' : 'installed';
    atomic(stateFile, jsonBytes(next));
    if (displaced) {
      try { removeStage(displaced, appParent); } catch (error) { log('[提示] 安装前副本清理未完成：' + displaced + '；' + error.message); }
      displaced = null;
    }
  } catch (error) {
    const rollbackErrors = [];
    const rollback = action => { try { action(); } catch (failure) { rollbackErrors.push(failure.message); } };
    rollback(() => {
      if (swapped && displaced) {
        const failed = path.join(appParent, '.Cursor.zh-CN-failed-' + crypto.randomUUID() + '.app');
        fs.renameSync(macApp, failed); fs.renameSync(displaced, macApp); displaced = null; removeStage(failed, appParent);
      } else if (!stage) for (const item of plan.values()) rollback(() => {
        const target = within(install.appRoot, item.relative);
        if (!exists(target) || hash(fs.readFileSync(target)) !== hash(item.current)) atomic(target, item.current);
      });
    });
    rollback(() => {
      if (profileBefore === null) { if (exists(argvFile)) fs.unlinkSync(argvFile); }
      else if (!exists(argvFile) || hash(fs.readFileSync(argvFile)) !== hash(profileBefore)) atomic(argvFile, profileBefore);
    });
    if (!rollbackErrors.length) rollback(() => {
      if (savedStateBytes) atomic(stateFile, savedStateBytes); else if (exists(stateFile)) fs.unlinkSync(stateFile);
    });
    throw new Error(error.message + (rollbackErrors.length ? '；回滚未完成：' + rollbackErrors.join('；') : '；已恢复本次写入前的内容'));
  } finally {
    if (stage && exists(stage)) removeStage(stage, appParent);
  }
  log(action === 'restore' ? '已恢复安装前的程序文件，备份保留。' : '简体中文汉化完成。');
  log('备份：' + stateRoot);
  return { stats, files: plan.size, stateRoot, warnings, restored: action === 'restore' ? plan.size : undefined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let action = 'install', dir;
    for (const arg of process.argv.slice(2)) {
      if (['--preview', '--restore', '--status'].includes(arg)) { if (action !== 'install') throw new Error('操作不能同时指定'); action = arg.slice(2); }
      else if (arg.startsWith('--dir=')) dir = arg.slice(6);
      else throw new Error('不支持的参数：' + arg);
    }
    if (!dir) throw new Error('请从双击脚本启动，或用 --dir=安装路径指定目标');
    runPack({ dir, action });
  } catch (error) { console.error('[错误] ' + error.message); process.exitCode = 1; }
}
