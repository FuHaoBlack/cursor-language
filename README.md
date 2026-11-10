# Cursor 简体中文一键汉化（二创版）

> **forked from [polang233/cursor-language-pack](https://github.com/polang233/cursor-language-pack) 的二创版本**，保留原项目贡献者署名及 MIT 许可。

为 Cursor 的工作台、设置、智能体和内置扩展界面添加简体中文。自动查找安装位置，使用 Cursor 自带运行时，下载后即可运行。

已核对 Windows Cursor **3.29.9** 的资源。macOS 为实验性适配，尚未完成真机验收。

## 使用

1. 完整下载或解压本项目，保留各文件的相对位置。
2. 保存工作并完全退出 Cursor。
3. 双击对应的安装脚本；发现多份安装时选择目标。

| 平台 | 安装 | 恢复安装前文件 |
| --- | --- | --- |
| Windows | `安装中文语言包.bat` | `恢复程序文件.bat` |
| macOS | `安装中文语言包.command` | `恢复程序文件.command` |

Windows 使用系统 PowerShell 5.1。脚本优先使用 Cursor 内置运行时，不可用时尝试系统 Node.js，最低版本为 18.17。

macOS 会备份整份原应用，在副本上修改并签名，校验通过后再替换；备份需要额外一份应用的磁盘空间。若脚本没有执行权限，运行 `chmod +x ./*.command`。遇到权限错误时，检查终端的“App 管理”权限及安装目录的写权限。

## 可选参数

安装位置无法自动找到时手动指定；预览和状态查询均不修改程序或用户配置。

```powershell
# Windows：指定路径并安装，不自动启动 Cursor
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\LanguagePack.ps1 -InstallDir "D:\Program Files\cursor\Cursor.exe" -NoRestart
# 只读预览 / 查看状态
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\LanguagePack.ps1 -Preview
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\LanguagePack.ps1 -Status
```

```bash
# macOS：指定路径并安装，不自动启动 Cursor
bash ./scripts/LanguagePack.sh --dir="/Applications/Cursor.app" --no-launch
# 只读预览 / 查看状态
bash ./scripts/LanguagePack.sh --preview
bash ./scripts/LanguagePack.sh --status
```

## 备份与注意事项

- 原始文件按安装位置、版本和 commit 保存至用户目录 `.cursor/cursor-zh-CN/`。重复安装保留原始备份，恢复后备份仍保留。
- 安装和恢复均要求退出 Cursor，不会强制结束会话。文件被外部修改、资源结构不符或备份损坏时停止；写入失败会尝试回滚。
- 语言配置仅修改 `argv.json` 的 `locale`。恢复时若配置已被用户继续修改，则保留当前配置并提示。
- Cursor 更新后重跑安装脚本。已有中文语言扩展的缓存可能覆盖本地资源；出现旧译文时，卸载旧语言扩展后退出并重跑。
- 未匹配的文案保留原文。服务端动态内容及第三方扩展不在本地资源汉化范围内，品牌、命令和协议标识保留必要英文。

## 项目结构与验证

根目录仅提供安装、恢复入口，其余实现集中存放：

```text
scripts/           平台入口、共用引擎和界面补丁
translated-zh-CN/  简体译文及版本、来源信息
tests/             隔离安装、回滚和恢复测试
```

维护测试使用 Node.js；Windows 另有 PowerShell 路径发现检查：

```bash
node --test tests/*.test.mjs
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\windows.test.ps1
```

已有验证包括 31 项测试，以及 Windows 资源副本的安装、重复安装、JS 语法和逐文件字节恢复；不等于登录后界面逐屏验收。macOS 当前仅完成语法和模拟事务验证。

## 来源与许可

本二创版本沿用 MIT 许可，版权及第三方声明见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。基础译文来自 [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc)，版本和来源基准记录在 [metadata.json](translated-zh-CN/metadata.json)。本项目与 Anysphere、Microsoft 无隶属关系。
