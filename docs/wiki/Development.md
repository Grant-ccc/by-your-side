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

安卓工程位于 `apps/web/android/`，使用 Capacitor 8.4.3、JDK 21 和 Android SDK 36。GitHub Actions 已完成 Java 检查与 APK 编译，本机仍未安装安卓 SDK。安装、`setup:lan`、`dev:lan` 与安全边界见[安卓局域网连接](Android-LAN.md)。

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

若默认 3307 端口被其他服务占用，在 `.env.local` 中将 `DB_PORT` 改为可用端口（例如 43307），重新执行 `npm run db:up` 并重启 `npm run dev`。本地环境修改无需上传，也无需停止其他项目的服务。

### 平时启动、检查和停止

在 Docker Desktop 显示运行后，从项目根目录打开 PowerShell。先启动 MySQL，再检查迁移和连接。

```powershell
npm run db:up
npm run db:migrate
npm run db:check
```

| 使用场景 | 启动并保持终端开着 | 在另一终端检查 |
| --- | --- | --- |
| 电脑网页 | `npm run dev` | `Invoke-RestMethod http://127.0.0.1:17400/health`，看 `database` 是否为 `connected` |
| vivo 试用包 | `npm run dev:lan` | `npm run test:lan -- --health`，核对电脑端 HTTPS、凭据和 MySQL |

手机模式需要已有适用于当前电脑 IP 的配对配置。首次配对或电脑地址变化时，按[安卓局域网说明](Android-LAN.md#电脑准备)执行 `setup:lan`。只用手机时，数据库和 `dev:lan` 两项即可。若改过 `WEB_PORT`，把表中的 17400 换成自己的端口。

`ai: configured` 表示后端已读到模型配置。手机可达性由 App 内实际连接确认。状态检查只读，不生成回复。

网页可以打开但 `/health` 返回 503 时，先用 `npm run db:check` 检查 MySQL。手机后端的只读检查通过、手机仍提示超时时，按[网络排查说明](Android-LAN.md#网络不通如何排查)核对当前网络和配对地址。

结束时，在每个正在运行的服务终端按 `Ctrl+C`。如果 Windows 提示终止批处理作业，输入 `Y` 并回车。确认使用方都退出后，可运行 `npm run db:down` 停止 MySQL。下次 `db:up` 会复用原来的数据卷。

### 在临时副本恢复代码版本

以下命令从项目根目录开始。在 `.local/t08-check` 创建独立克隆，旧版本和现用版本都可以在里面构建。

```powershell
git status --short --branch
git log -5 --oneline
git clone --no-hardlinks . .local/t08-check
Set-Location .local/t08-check
git switch --detach 1bfe272
npm ci
npm run build
git switch --detach e35f016
npm ci
npm run build
git rev-parse --short HEAD
```

示例从加入 TXT 导出前的 `1bfe272` 回到含导出的 `e35f016`。构建演练仅需要 Git 和 npm。若要在临时副本启动服务，另建独立的数据库项目、配置和端口，并用合成数据验证。切换代码后，是否能复用现有数据库取决于版本间的迁移兼容性。数据库备份和恢复单独按[恢复步骤](#导出聊天与演练恢复)执行。

### 检查

```sh
npm run check
npm test
npm run build
npm run db:check
npm run test:db
# 保持开发服务运行后：
npm run test:web
npm run test:local-chat
```

默认单元/接口测试不要求 MySQL，真库用例显式跳过。`test:db` 强制执行真实 MySQL 往返检查，数据库不可用时失败，不静默跳过。`test:web` 检查当前健康状态，并模拟不可用、成功和重试场景；模拟场景不能代替真库验证。`test:local-chat` 需先执行 `npm run build` 并保持开发服务运行，实际通过浏览器保存消息、刷新读取并核对数据库，仅清理本次唯一标识的测试消息，不调用 AI。

GitHub Actions 使用隔离的临时 MySQL 服务，执行类型检查、测试、构建、迁移、重复迁移与真库测试；工作流内的测试账号仅用于临时服务，不是部署凭据。

### 导出聊天与演练恢复

在 App 的「设置 → 当前会话」点「导出聊天记录（TXT）」。文件包含已保存消息的北京时间、发言人和正文。网页发起下载，安卓打开系统保存界面。系统记录、未保存的草稿和连接配置不写进文件。导出沿用当前会话的分页读取，上限为 10,000 条，超出时会明确提示而不会生成残缺文件。[Android 文件保存说明](https://developer.android.com/training/data-storage/shared/documents-files)

在项目根目录运行。备份读取本项目的 Compose MySQL 服务，执行时请避开数据库迁移。ZIP 输出到被 Git 忽略的 `.local/backups/`，包含带校验值的数据库快照。

```sh
npm run db:backup
npm run db:restore -- .local/backups/替换为实际文件名.zip
npm run test:backup
```

恢复使用本机 `mysql:8.4` 镜像新建独立容器，校验 ZIP 和恢复后的表与数据。容器无网络、无主机端口，工具只接受空白恢复目标。成功后按终端提示用 `docker exec` 查看副本，完成演练后可删除该副本。备份包含会话、消息、回复关联、版本、用量和费用快照，不包含数据库账户、环境文件、设备配对凭据或模型密钥。TXT 和 ZIP 都包含可读私聊，请保存在你控制的位置。[MySQL SQL 备份说明](https://dev.mysql.com/doc/refman/8.4/en/mysqldump-sql-format.html)

恢复命令只用于验证和取回数据。旧费用快照留在隔离副本，当前 App 继续使用原数据库和原费用账本。如果以后需要切换现用数据库，先与供应商账单对齐费用和未结算请求，再恢复模型调用。

## M1 环境检查

检查实际 Node.js 与包管理器版本、MySQL 服务与可用账号、JDK、Android Studio/SDK 和真机连接方式。选择依赖时核对当前稳定文档，记录版本与锁文件。先本机开发，再决定云端托管。

当前提交 `.env.example` 中的变量名与无效示例；本地随机密码仅在被忽略文件中。数据库密码、模型密钥、设备令牌不入库、不打包进客户端。生产登录与访问隔离在云端可访问前完成。本机 Docker 已恢复，真实 MySQL 与浏览器保存后刷新读取均已通过，安卓编译通过，目标手机运行与校园 Wi-Fi 连通尚未验证。

文字模型接入、密钥变量、费用预留及故障恢复限制见[DeepSeek 聊天配置](AI-Setup.md)。密钥缺失时只能保存消息，不生成假回复。

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
