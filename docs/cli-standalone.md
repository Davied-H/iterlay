# CLI 独立运行与服务托管

2026-11-26：新增纯 Node 运行时，源码实现尚未公开发布。CLI 包含客户端与独立服务，不要求安装桌面 App、Electron、显示服务器或 Xvfb。模型生成、文件保存与画板操作复用 App 的业务服务；桌面窗口操作不属于独立服务。

## 安装与首次配置

需要 Node.js >=22.12.0。构建可以仅安装 CLI 的依赖，无需安装根项目 Electron：

```bash
npm ci --prefix cli
npm run build --prefix cli
cd cli
npm pack
npm install -g ./iterlay-0.1.70.tgz
iterlay status --standalone --json
```

从环境变量或 stdin 提供服务商密钥，不把值放进参数：

```bash
iterlay providers set --standalone --kind image --provider images \
  --base-url https://api.openai.com --model gpt-image-1 \
  --api-key-env OPENAI_API_KEY --default --json
iterlay image generate --standalone --prompt "米白色咖啡杯" --out cup.png --json
iterlay boards list --standalone --json
iterlay server stop --standalone --json
```

图片配置支持 OpenAI-compatible、OpenRouter、Poe、Ark、百炼和 fal，按现有 Provider 适配器执行；未验收个人或付费服务。`--api-mode images|responses` 控制通用协议，`--generation-endpoint` / `--reference-endpoint` 可指定相对接口路径。服务地址已经含 `/v1` 时，可显式设置 `/images/generations`、`/images/edits`，避免重复拼接版本前缀。原始的 App 模式沿用系统安全存储；独立模式配置在独立工作区保存，不自动迁移桌面 OAuth 或凭据。

## 后台生命周期与数据

- 未安装 App 时自动选用 Node；安装 App 的机器可通过 `--standalone` 显式选择。
- 默认 CLI 自动启动常驻后台；`--no-launch` 只连接已有后台。使用 `serve` 前台托管时，客户端建议带 `--no-launch`，避免进程管理器之外另起后台。
- Linux 默认 `${XDG_DATA_HOME:-~/.local/share}/iterlay`；macOS 默认 `~/Library/Application Support/Iterlay CLI`；Windows 默认 `%LOCALAPPDATA%/Iterlay CLI`。
- `--user-data-path` / `ITERLAY_USER_DATA_PATH` 指定整个独立工作区，每条命令必须一致。拒绝 App 默认目录、指向它的符号链接及没有独立标识的已有设置目录。
- 工作区带心跳锁；正常退出释放，异常退出后约 10 秒过期。不要手动删除活跃锁或让多个容器复用同一工作区。
- 图片与任务数据沿用原存储格式；AES-GCM 凭据需要同时备份 `credential-key`，将其按私密文件保护。它与加密文件一同位于本地，不提供系统钥匙串或外部 KMS 的安全边界。
- CLI 退出、超时或 Ctrl+C 不停止已提交任务。服务正常停止等待已接收图片任务持久化；视频暂停轮询并在重启后按原 ID 恢复。强制终止后的未确认图片请求按 unknown 处理，先核对服务商，不能自动重新计费。

`status` 返回 `runtime: "node"` 和实际工作区目录。独立服务仅绑定回环地址并使用每次启动生成的鉴权信息；不要将发现文件或凭据写入日志。使用 SSH 执行远端 CLI 即可管理服务器工作区，本版本不提供公网 API。

## systemd 示例

先创建运行用户可写的 `/var/lib/iterlay`，并核对 `command -v node` 与 `command -v iterlay`。以下路径对应 `/usr/bin/node` 和 `/usr/local/bin/iterlay` 的安装方式，使用自己的实际路径：

```ini
[Unit]
Description=Iterlay standalone workspace
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=iterlay
Group=iterlay
StateDirectory=iterlay
UMask=0077
ExecStart=/usr/bin/node /usr/local/bin/iterlay serve --user-data-path /var/lib/iterlay
Restart=on-failure
RestartSec=12
TimeoutStopSec=660

[Install]
WantedBy=multi-user.target
```

服务启动后，在同一用户身份下运行：

```bash
iterlay status --standalone --user-data-path /var/lib/iterlay --no-launch --json
```

模型配置通过 CLI 保存在这个工作区，systemd 不需要在启动参数中携带密钥。`TimeoutStopSec` 给正在执行的图片生成留出正常收尾时间；强杀仍可能导致远端结果不确定。

## 无桌面 Linux 容器验收

先在主仓库构建 CLI，再制作 tarball。只挂载安装包与验收脚本，容器不会看到项目或 App：

```bash
pnpm build:cli
mkdir -p output/cli-standalone
npm pack ./cli --ignore-scripts --pack-destination output/cli-standalone
cp scripts/cli-standalone-smoke.mjs output/cli-standalone/
docker run --rm \
  --mount type=bind,src="$PWD/output/cli-standalone",target=/artifacts,readonly \
  --tmpfs /work:exec,size=512m \
  node:22.12.0-bookworm-slim sh -c \
  'cd /work && npm install --omit=dev /artifacts/iterlay-0.1.70.tgz && ITERLAY_TEST_CLI=/work/node_modules/iterlay/dist/main.js node /artifacts/cli-standalone-smoke.mjs'
```

验收使用本地模拟图片/视频接口，覆盖并发启动、鉴权、配置加密、画板、模板、图片生成/编辑/切图/导出、幂等请求、视频重启恢复、前台运行和 SIGTERM 清理。它不验证真实模型效果，也不调用个人 Provider。Sharp 由 npm 按目标系统安装，不能将 macOS 的 node_modules 复制到 Linux。

## 能力边界

独立运行支持 CLI 的图片生成/编辑、视频生成和恢复、素材导入/导出/切图、画板与图片布局/版本/回收站、模板及修改请求。`open_iterlay`、`boards open`、窗口聚焦和适配视图会明确返回错误。`export_assets` 使用桌面对话框，独立模式用 `assets export --out` 导出。

音频当前只有 TTS 配置；不包含语音生成、桌面登录或 GUI。视频原样生成/下载无需 FFmpeg；本次没有增加视频剪辑或序列合成 CLI。桌面随包 CLI 继续优先使用 App；完整的独立切图环境通过 npm 安装包分发 Sharp。
