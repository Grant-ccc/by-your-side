# 在你身边 · by-your-side

李泽言主题的个人安卓陪伴 App 项目。已有交互原型，并新增 React + TypeScript 前端、Fastify + TypeScript 后端与 MySQL 消息存储工程。尚未接入真实 AI、云端通知或生成安卓安装包。

## 项目文档与开发规划

[进入项目文档](docs/wiki/Home.md)：产品范围、技术架构、开发路线、MySQL 数据模型、接口草案、开发交付、通知与成本、决策记录。

正式工程采用 **React + TypeScript + MySQL**，后端为 Node.js + Fastify，数据库驱动为 mysql2，迁移使用版本化 SQL。Capacitor 安卓打包仍待实现。现有 `原型/` 保留完整交互参考；新开发版先迁移主页和聊天，不代表其他模块均已接入后端。

`docs/wiki/` 为版本化文档源，准备同步至 [GitHub Wiki](https://github.com/Grant-ccc/by-your-side/wiki)。Wiki 必须先在 GitHub 网页初始化第一篇页面，随后可运行 `python scripts/sync_wiki.py --publish` 发布；`python scripts/sync_wiki.py` 只检查和导出本地文档。

## 运行正式工程开发版

要求 Node.js 22.12+；本地数据库可用 Docker 的 MySQL 8.4，或现有 MySQL 服务。Docker 不是应用本身的强制依赖。

```sh
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

`setup:local` 只在不存在时创建被 Git 忽略的 `.env.local`，生成随机开发数据库密码，不覆盖已有配置。开发页面为 `http://127.0.0.1:17400`，API 为 `http://127.0.0.1:17401`，MySQL 默认仅绑定本机 3307。已有 MySQL 时调整本地环境配置、预先创建空数据库并授权，然后跳过 `db:up`。

当前后端只允许本机开发访问，尚未实现生产登录。数据库未启动或未迁移时返回明确不可用状态，不自动退回内存数据库。新聊天页不会用固定台词冒充 AI；成功保存只标记“已存入数据库”，不标记角色已读。

验证：

```sh
npm run check
npm test
npm run build
npm run test:db
# 先保持 npm run dev 运行，再执行浏览器检查（需本机 Edge）：
npm run test:web
```

默认 `npm test` 的 MySQL 真库用例显式跳过，`test:db` 才执行真库往返、并发去重与重连持久化。GitHub Actions 配置了隔离的临时 MySQL 服务，用于验证迁移、重复迁移和真实读写。不能把仅通过接口测试解释为已经完成 MySQL 验证。

本轮本机 Docker 因启动故障不可用，因此本机数据库往返尚未完成。GitHub Actions 的真实 MySQL 迁移、重复迁移、并发去重与重连读取检查已通过：[验证记录](https://github.com/Grant-ccc/by-your-side/actions/runs/38720279819)。CI 通过不等于本机环境已恢复；当前本机可先检查数据库不可用提示。

## 体验原型

用浏览器打开 [独立原型 HTML](原型/在你身边-原型.html)，无需安装依赖。GitHub 文件页面展示的是源码，下载项目后打开即可。

也可在项目根目录运行 `python -m http.server 8000 --bind 127.0.0.1`，然后在本电脑打开 `http://127.0.0.1:8000/原型/`。

包含日常主页、聊天、忙碌等待、陪伴模式、打卡、共同约定、出行物品、相册、记忆管理和备份恢复。桌面左侧与设置页提供状态演示入口。

**聊天是固定示例，相册为构图示意，头像尚未定稿。无 AI 调用、真实通知或实际消费。** 数据保存在当前浏览器，可手动导出。不同打开方式的本地数据可能不互通。

## 目录

- `原型/`：源码、独立 HTML、使用说明及浏览器检查脚本。
- `apps/web/`、`apps/server/`：React 客户端与 Fastify 后端。
- `packages/shared/`：前后端共享类型与 Zod 运行时校验。
- `database/migrations/`：MySQL 版本化迁移。
- `compose.yaml`：本地开发 MySQL 配置，持久卷不会被停止命令删除。
- `效果图_暖红版/`：用户认可配色方向的最新效果图。
- `效果图/`：早期视觉版本，保留供比较。
- [第一版需求说明](第一版需求说明.md)：页面、功能规则、验收标准与待定项。
- [需求初稿](需求初稿.md)：需求访谈记录。
- [角色辅助资料](李泽言角色辅助资料.md)：公开资料来源、事实与推断的区分。
- [一天的体验样例](一天的体验样例.md)：生活和聊天联动示例。
- `绘制效果图.py`、`视觉方向.md`：静态效果图制作源文件。

## 修改与验证

原型源码为 `原型/index.html`、`原型/style.css` 和 `原型/app.js`。修改后运行 `python 原型/打包原型.py`，更新独立 HTML。

静态图绘制脚本需要 Pillow 与 Windows 微软雅黑字体，输出至 `效果图_暖红版/`。

浏览器检查需要 Node.js、Playwright 和本机 Microsoft Edge：

```sh
npm install
npm run check
npm run test:prototype
```

可设置 `CHROME_PATH` 指向已安装的 Chromium 浏览器。检查仅操作临时浏览器上下文和示例数据，覆盖导航、打卡、安排、记忆、约定、物品分支、消息等待、陪伴、相册限额、预算暂停、备份恢复与窄屏布局。

## 后续方向

优先改进更可爱的头像、物品和相册美术，再验证角色聊天效果、成本和安卓后台通知。第一版功能范围以需求说明为准，原型效果不代表后台功能已实现。

角色来自《恋与制作人》，本项目为个人非官方原型；不包含游戏安装包、完整剧情库或官方美术资源，不对第三方角色主张所有权。
