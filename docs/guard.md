# Guard 命令描述

Iterlay 提供一份供 [HOL Guard](https://github.com/hashgraph-online/hol-guard) 审查 Agent 命令调用的声明式描述。它不负责执行图片任务，也不接管 Provider 凭证。

```sh
iterlay guard descriptor
iterlay guard descriptor --json
```

第一条输出原始 JSON 描述；第二条使用 CLI 的标准 `{ schemaVersion, ok, data }` 输出封装。两条都仅读取安装包内的文件，无需运行 Iterlay 工作区，不连接模型、不写入用户配置、不安装或启用 Guard。

规范源文件位于 `resources/guard/command.iterlay.json`；CLI 构建时复制进 `cli/guard/`，桌面安装包也携带相同文件。描述采用 Guard 的 `guard.command-extension-source.v1` 格式；它是贡献源，不是可以绕过 Guard 自身安装、信任审查或编译步骤的运行时保护。

## 操作边界

- 图片/视频生成与编辑会写受管文件，并可能产生服务商费用，需要审查。
- 显式导出与带 `--out` 的等待任务会写本地文件；`--overwrite` 会允许替换文件，不能因为是等待/读取命令而忽略副作用。
- `add` / `remove` 会安装或移除 Agent Skill，并可能更新旧集成配置；`--agent` 仅选择目标客户端，不构成权限或额度隔离。
- 画板列表、素材列表与版本读取没有上述生成/导出副作用；描述不为这些操作新增同等审查规则。不过它们仍受 Guard 全局策略和执行环境限制，不能保证自动允许。
- `iterlay call <operation>` 必须依据实际操作分类。通用入口、未知操作和无法确认参数含义的调用不能整体按只读放行。查看 `iterlay tools list --json` 可取得准确的工作台操作目录。
- 一些读取命令可能按 CLI 正常行为启动本地 App；需要禁止自动启动时使用 `--no-launch`。素材内容也可能属于私密数据，只读不代表可以随意向外发送。

最终决定由 Guard 自身规则及管理员策略完成。描述文件不是沙箱、访问授权、每个 Agent 的预算上限或服务商限流隔离，也不能替代用户对具体创作任务的授权。应用级三任务队列、凭证和保存规则继续由 Iterlay 管理。

## 上游贡献与安装

已提交 [上游贡献 PR #5232](https://github.com/hashgraph-online/hol-guard/pull/5232)，当前为 Draft，尚未合并；包含规范源文件、36 个原生测试用例及外部信任边界声明。随包副本与该贡献相同。

上游贡献包含命令源、可移植行为测试和独立信任边界声明。源代码合并、上游版本发布与用户在设备上启用保护是不同步骤。请遵循 Guard 当前的贡献和管理员文档；Iterlay 不自动把外部规则安装到你的 Agent。

如果希望检查此描述或运行其回归，使用对应 Guard checkout 的原生编译器与 portable fixtures，而不是仅凭 JSON 语法正确就认为分类已生效。具体贡献链接和验证结果以发布记录为准。

本次 portable fixtures 已使用 HOL Guard 3.49.0 官方 macOS wheel 中的原生编译器独立验证，36 个用例通过，未执行目标 Iterlay 命令。上游 main 的完整贡献预备/交接接口与该已发布编译器存在差异，PR 将如实列出这一限制，并交由上游 CI 及维护者审查；不能将这些定向用例表述为完整上游交接或真实 Agent 保护验收。
