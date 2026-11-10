# Cursor 简体中文一键汉化

沿用 Claude 汉化项目的使用方式：完整解压，退出 Cursor，双击脚本。只保留简体中文，不需要 npm、npx、语言扩展、Python 或构建依赖；脚本优先使用 Cursor 自带的 JavaScript 运行时。

当前已对照 Windows Cursor **3.29.9** 的本地资源。译文包含工作台、内置扩展、设置、智能体、插件/MCP/技能、语音、项目协作、环境、用量和自动化界面；在原有资源上新增 **1,547 条**硬编码译文，并为 **10 个同键异文**提供 **21 个原文变体**，避免错误套用同一译文。未匹配或占位符不符的内容保留原文，品牌、命令、路径和协议标识保留必要英文。

## Windows

1. 保存工作，从托盘完全退出 Cursor。
2. 双击 `安装中文语言包.bat`。
3. 脚本自动寻找安装位置；发现多份时选择目标，完成后请求启动 Cursor。

支持注册表、运行进程、PATH、开始菜单/桌面快捷方式，以及各固定磁盘的常见安装目录，兼容中文和空格路径。使用系统自带 Windows PowerShell 5.1。无需全盘递归扫描；没有找到时可手动指定路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\LanguagePack.ps1 -InstallDir "D:\Program Files\cursor\Cursor.exe"
# 只预览、不自动启动、查看状态、恢复
powershell -NoProfile -ExecutionPolicy Bypass -File .\LanguagePack.ps1 -Preview
powershell -NoProfile -ExecutionPolicy Bypass -File .\LanguagePack.ps1 -NoRestart
powershell -NoProfile -ExecutionPolicy Bypass -File .\LanguagePack.ps1 -Status
powershell -NoProfile -ExecutionPolicy Bypass -File .\LanguagePack.ps1 -Uninstall
```

## macOS（实验性）

1. 完整解压，保存工作并退出 Cursor。
2. 双击 `安装中文语言包.command`。
3. 脚本搜索 `/Applications`、当前用户的 `Applications` 和 Spotlight 中的 `Cursor.app`。发现多份时选择目标。

脚本使用 Cursor 内置运行时和系统自带的 `ditto`、`codesign`。先备份整份原应用，在副本上汉化并做本地 ad-hoc 签名，签名校验通过后才替换目标应用。完整备份会额外占用一份应用的磁盘空间。恢复时使用整份备份，恢复原始可执行文件和签名。

```bash
# 手动指定、预览、不自动启动
bash ./LanguagePack.command --dir="/Applications/Cursor.app" --preview --no-launch
bash ./LanguagePack.command --dir="/Applications/Cursor.app" --no-launch
# 恢复安装前文件
bash ./LanguagePack.command --restore
```

如果解压工具没有保留执行权限，可在终端执行：

```bash
chmod +x ./*.command
```

若系统拒绝修改应用，请检查“系统设置 → 隐私与安全性 → App 管理”中运行脚本的终端权限，并确保安装目录可写。**本次在 Windows 环境验证了 shell 语法和模拟 macOS 副本/签名/恢复事务，尚未完成 Mac 真机上的权限、签名和启动验收。**

## 常用入口

| 操作 | Windows | macOS |
| --- | --- | --- |
| 安装简体中文 | `安装中文语言包.bat` | `安装中文语言包.command` |
| 只读预览 | `预览汉化改动.bat` | `预览汉化改动.command` |
| 查看当前版本状态 | `查看汉化状态.bat` | `查看汉化状态.command` |
| 恢复安装前文件 | `恢复程序文件.bat` | `恢复程序文件.command` |

所有文件须放在一起，不要只复制启动脚本。正常情况下不需要另装运行环境；只有 Cursor 内置运行时不可用时，才尝试系统 Node.js（最低 18.17，建议 22 或更高）。

## 备份与覆盖范围

- 直接修改安装目录内的 NLS 消息、内置扩展语言资源和已确认的界面字符串，并同步程序资源校验值；不安装或卸载任何语言扩展。
- 仅设置用户 `argv.json` 的 `locale`，保留注释及其他选项。恢复时只在配置未被用户继续修改的情况下恢复原配置，否则保留并提示。
- 不强制结束 Cursor 进程。安装及恢复要求目标 Cursor 已退出。
- 原始文件按安装位置、版本和 commit 分开保存到用户目录 `.cursor/cursor-zh-CN/`，重复安装不覆盖原始备份。程序文件被外部修改、NLS 数量不符或备份损坏时停止。
- Windows 写入失败会尝试回滚本次内容；macOS 签名失败不替换原应用。备份不会自动删除。
- Cursor 更新后请重跑安装脚本。网站或服务端动态下发内容、第三方扩展、工具协议和模型提示不做无差别替换。
- 如果此前装过中文语言扩展，其生成的 NLS 缓存可能优先于本地默认资源。要完全使用本脚本译文，请在 Cursor 中卸载旧中文语言扩展，再退出并重跑脚本；脚本不会自动处理用户已装的扩展。

## 文件与维护

`LanguagePack.ps1` / `LanguagePack.command` 负责平台入口，`LanguagePack.mjs` 为共用的备份、汉化与恢复引擎。`scripts/` 仅保留路径发现和两类界面补丁，`translated-zh-CN/` 保存正式简体资源，`tests/` 为不触碰真实安装的维护测试。

维护时只改译文的值，保留 `{0}`、`{name}`、ICU 分支、富文本标签、命令链接和图标标记。同一语言键有多种英文时，使用 `bySource` 区分，不能只按键覆盖。

有 Node.js 的维护环境可执行：

```bash
node --test tests/*.test.mjs
```

本次通过 31 项测试。Windows 3.29.9 的真实资源副本中，127 个文件完成安装、重复运行和逐文件字节恢复验证，31 份修改后的 JS 通过语法检查；工作台界面原文兜底为 0，另外 108 项保留原文的键均位于内部测试模块。这些结果不等于登录后的所有界面逐屏验收。

## 许可与来源

MIT，保留原项目贡献者署名。工作台及内置扩展资源来源于 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)，补充译文和界面补丁沿用 [Cursor Language Pack](https://github.com/polang233/cursor-language-pack) 并进行本地改造。来源 commit 见 `translated-zh-CN/metadata.json`，完整许可见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。本项目与 Anysphere、Microsoft 无隶属关系。
