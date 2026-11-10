import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewriteExtension } from '../scripts/extensions.mjs';

test('built-in l10n arguments translate without changing dispatch IDs, protocol strings or comments', () => {
  const before = 'const a=vscode.l10n.t("Open"),b=l10n.t(\'Files {0}\',n),id="Open";\n// vscode.l10n.t("Open")\nconst text=\'vscode.l10n.t("Open")\';other.t("Open");';
  const result = rewriteExtension(before, { Open: '打开', 'Files {0}': '文件 {0}' });
  assert.equal(result.count, 2);
  assert.match(result.text, /vscode.l10n.t\("打开"\)/);
  assert.match(result.text, /l10n.t\("文件 \{0\}",n\)/);
  assert.ok(result.text.includes('id="Open"'));
  assert.ok(result.text.includes('// vscode.l10n.t("Open")'));
  assert.ok(result.text.includes('other.t("Open")'));
  assert.ok(result.text.includes('const text=\'vscode.l10n.t("Open")\''));
  assert.equal(rewriteExtension(result.text, { Open: '打开', 'Files {0}': '文件 {0}' }).count, 0);
});

test('message objects distinguish comments and retain format arguments', () => {
  const source = 'api.l10n.t({message:"Open",comment:["verb"]});api.l10n.t({message:"Open",comment:"adjective"});api.l10n.t("Count {0}",n);';
  const result = rewriteExtension(source, { 'Open/verb': '打开', 'Open/adjective': '开放', 'Count {0}': '数量 {1}' });
  assert.equal(result.count, 2);
  assert.ok(result.text.includes('message:"打开",comment:["verb"]'));
  assert.ok(result.text.includes('message:"开放",comment:"adjective"'));
  assert.ok(result.text.includes('l10n.t("Count {0}",n)'));
});
