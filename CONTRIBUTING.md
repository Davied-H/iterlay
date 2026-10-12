# 贡献指南

请先在 Issue 中说明较大改动的目标，再提交范围清晰的 Pull Request。

## 开发

使用 Node.js 22.12+ 与 pnpm 10，运行 `pnpm install`、`pnpm electron:dev`。macOS 需要 Xcode Command Line Tools。

提交前运行 `pnpm test`、`pnpm lint`、`pnpm build`，并说明测试结果、平台和已知限制。界面改动请附截图，修复问题请提供复现步骤。

不要提交 API Key、激活码、用户数据或本地环境文件。维护者发布脚本会推送商业发布渠道，普通贡献不需要运行该脚本。

提交贡献表示你有权提供相应代码，并同意以本仓库 MIT 许可证发布原创贡献。第三方代码与资源请保留来源及许可证。
