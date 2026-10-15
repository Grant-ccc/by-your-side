# 开发与交付

[返回首页](Home.md)

## 当前能运行的内容

现有应用是 `原型/` 内的无构建依赖网页。双击 `原型/在你身边-原型.html` 可离线体验；或在仓库根目录运行：

```sh
python -m http.server 8000 --bind 127.0.0.1
```

在本电脑打开 `http://127.0.0.1:8000/原型/`。本机地址不是手机外网链接。

修改原型源码后：

```sh
python 原型/打包原型.py
```

旧原型的检查命令：

```sh
npm install
npm run test:prototype
```

检查需要本机 Edge；可用 `CHROME_PATH` 指向 Chromium 浏览器。测试在独立浏览器上下文操作示例数据，会生成预览截图和忽略提交的测试备份。它验证原型，不证明安卓后台或真实 AI 已可用。

## 正式工程

以下目录已创建：

```text
apps/
  web/              React + TypeScript + Vite
  server/           Node.js + TypeScript API 与任务执行器
packages/
  shared/           API 类型、运行时 schema、共享常量
database/
  migrations/       MySQL 版本化迁移
docs/
  wiki/             Wiki 文档源
scripts/            文档同步、开发辅助
原型/                保留既有设计与交互参考
```

安卓工程仍未创建，随 Capacitor 初始化后放入确定的客户端目录；不提前虚构 Gradle 或 SDK 配置。

### 首次启动

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

开发页 `http://127.0.0.1:17400`，API `http://127.0.0.1:17401`。后端仅允许本机开发访问，尚无生产认证。MySQL 默认通过 Compose 绑定本机 3307。`db:down` 仅停止，不删除数据库卷。

`setup:local` 生成被忽略的 `.env.local` 与随机开发密码，不覆盖已有文件。已有 MySQL 时可编辑本地配置、创建空数据库并授权，然后跳过 Docker 启动。不要把真实密码或本地环境文件提交。

### 检查

```sh
npm run check
npm test
npm run build
npm run db:check
npm run test:db
# 保持开发服务运行后：
npm run test:web
```

默认单元/接口测试不要求 MySQL，真库用例显式跳过。`test:db` 强制执行真实 MySQL 往返检查，数据库不可用时失败，不静默跳过。浏览器测试用测试数据验证成功流程，同时验证真实数据库未就绪的失败界面；两者不能混为真库通过。

GitHub Actions 使用隔离的临时 MySQL 服务，执行类型检查、测试、构建、迁移、重复迁移与真库测试；工作流内的测试账号仅用于临时服务，不是部署凭据。

## M1 环境检查

检查实际 Node.js 与包管理器版本、MySQL 服务与可用账号、JDK、Android Studio/SDK 和真机连接方式。选择依赖时核对当前稳定文档，记录版本与锁文件。先本机开发，再决定云端托管。

当前提交 `.env.example` 中的变量名与无效示例；本地随机密码仅在被忽略文件中。数据库密码、模型密钥、设备令牌不入库、不打包进客户端。生产登录与访问隔离在云端可访问前完成。当前本机 Docker 启动故障尚未解决，真实 MySQL 执行结果需以 CI 或恢复后的本机测试为准。

## 检查与变更纪律

已约定每次完成项目改动并验证后提交、推送 GitHub。涉及功能、技术决策或实现进度的变化，同时更新对应文档与开发路线并同步 Wiki。只同步适合公开的项目内容，不上传密钥、真实私聊、个人运行数据或私人备份。遇到同步失败时保留本地工作，明确说明阻碍，不声称已经上传。

- 前端：类型检查、主要交互与窄屏截图，避免迁移时改变已认可布局。
- 后端：消息幂等、资源归属、预算并发、记忆失效、任务恢复和约定事务。
- 数据：空数据库迁移、升级路径、备份恢复，避免用临时手改数据库代替迁移。
- 安卓：安装、前台/后台/锁屏、划掉任务、权限与通知隐私分别记录。
- 每次交付说明实现了什么、仍在模拟什么、如何验证。

## 文档与 Wiki 同步

在 `docs/wiki/` 更新，提交到主仓库后，再同步至 Wiki。英文文件名稳定，页面正文用中文；代码仓库中的相对 `.md` 链接在同步时转成 Wiki 页面链接。

GitHub 要先在网页创建第一篇 Wiki 页面，随后才能克隆 `.wiki.git`。当前同步工具不创建账号、不修改仓库权限、不绕过登录。[GitHub 官方说明](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)

准备好的同步命令：

```sh
python scripts/sync_wiki.py
python scripts/sync_wiki.py --publish
```

第一条只在本地生成 Wiki 发布文件并检查链接；第二条克隆/更新专用 Wiki 检出目录并普通推送，不强推。若 Wiki 尚未初始化，会保留全部文档并给出初始化链接。
