// Read actual installation resources, then exercise only an isolated copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveInstall, runPack, parseJson } from '../scripts/LanguagePack.mjs';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: node tests/real-install-copy.mjs <Cursor install path>');
const source = resolveInstall(process.argv[2]);
const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'translated-zh-CN/extensions.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-real-copy-'));
const installRoot = path.join(temp, 'Apps & Tools', '中文 Cursor=copy');
const app = path.join(installRoot, 'resources/app');
const originals = new Map();
let completed = false;
function copy(relative) {
  const file = path.join(source.appRoot, relative);
  if (!fs.existsSync(file)) return;
  const bytes = fs.readFileSync(file);
  originals.set(relative, sha(bytes));
  const target = path.join(app, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
}
try {
  for (const relative of ['package.json','product.json','out/nls.keys.json','out/nls.messages.json',
    'out/vs/workbench/workbench.desktop.main.js', 'out/vs/workbench/workbench.glass.main.js',
    'out/vs/workbench/workbench.anysphere-ui-automations.js','out/vs/workbench/workbench.xai-commerce-prepaid.js']) copy(relative);
  const extRoot = path.join(source.appRoot, 'extensions');
  for (const name of fs.readdirSync(extRoot)) {
    const directory = path.join(extRoot, name), manifest = path.join(directory, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const pkg = parseJson(fs.readFileSync(manifest,'utf8'));
    const dict = dictionary[`${pkg.publisher || 'vscode'}.${pkg.name}`];
    if (!dict) continue;
    copy(`extensions/${name}/package.json`); copy(`extensions/${name}/package.nls.json`);
    for (const folder of new Set([pkg.l10n || 'l10n', '.'])) copy(`extensions/${name}/${folder}/bundle.l10n.json`);
    if (dict.bundle) {
      const scan = folder => {
        for (const item of fs.readdirSync(folder, { withFileTypes:true })) {
          if (item.isDirectory() && !['node_modules','tests','test'].includes(item.name)) scan(path.join(folder,item.name));
          else if(item.isFile() && /\.[cm]?js$/.test(item.name)) copy(path.relative(source.appRoot,path.join(folder,item.name)));
        }
      };
      scan(directory);
    }
  }
  const options = { dir: installRoot, profileRoot:path.join(temp,'profile'), platform:'fixture' };
  const result = runPack(options);
  const afterInstall = new Map([...originals].map(([relative])=>[relative,sha(fs.readFileSync(path.join(app,relative)))]));
  let checked = 0;
  for (const [relative, before] of originals) {
    const file = path.join(app,relative);
    if (!/\.[cm]?js$/.test(relative) || sha(fs.readFileSync(file)) === before) continue;
    const check = spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});
    assert.equal(check.status,0,relative+': '+(check.error?.message??check.stderr)); checked++;
  }
  runPack(options);
  for(const [relative, installed] of afterInstall) assert.equal(sha(fs.readFileSync(path.join(app,relative))),installed,'repeat install '+relative);
  runPack({...options,action:'restore'});
  for(const [relative, before] of originals) {
    assert.equal(sha(fs.readFileSync(path.join(app,relative))),before,'copy restored '+relative);
    assert.equal(sha(fs.readFileSync(path.join(source.appRoot,relative))),before,'actual app remains unchanged '+relative);
  }
  console.log(JSON.stringify({ resources:originals.size, changedFiles:result.files, checkedJavaScript:checked, stats:result.stats,
    repeatInstall:'passed',restoreBytes:'identical',actualApp:'read-only' }));
  completed = true;
} finally {
  assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('cursor-real-copy-'));
  if (completed || !process.env.CURSOR_KEEP_FAILED_COPY) fs.rmSync(temp,{recursive:true,force:true});
  else console.error('Kept failed isolated fixture for inspection: '+temp);
}
