# 在你身边 · 项目文档

更新时间：2026-10-15。面向项目所有者与后续开发者。

目标是一个角色陪伴安卓应用：文字聊天、角色日常、主动留言、可纠正的记忆、共同约定、出行物品与相册。采用暖酒红配色和可爱的示意美术。

## 从这里开始

| 页面 | 内容 |
| --- | --- |
| [产品与范围](Product.md) | 已确认体验、第一版边界与验收 |
| [技术架构](Architecture.md) | React、TypeScript、MySQL，以及前后端职责 |
| [开发路线](Roadmap.md) | 当前状态、里程碑、下一步与完成条件 |
| [数据模型](Data-Model.md) | 消息、记忆、日程、任务、预算之间的关系 |
| [接口草案](API-Design.md) | 主要接口、消息处理与同步约定 |
| [开发与交付](Development.md) | 现有项目运行方法、未来目录、检查与文档维护 |
| [通知与成本](Notifications-and-Costs.md) | vivo 通知验证、生成费用与预算限制 |
| [决策与待定项](Decisions.md) | 已决定、建议、未验证事项 |

## 当前实现状态

已完成：需求、静态视觉与交互原型；React/TypeScript 正式工程起步、Fastify 后端、共享校验、MySQL 迁移文件与消息接口、依赖锁文件。类型检查、生产构建、六项接口测试和浏览器流程检查通过。

真实数据库验证：GitHub Actions 的临时 MySQL 已通过迁移、重复迁移、并发去重、分页及重连读取检查。[验证记录](https://github.com/Grant-ccc/by-your-side/actions/runs/38720279819)，对应代码提交 `58c4323`。

本机验证：Docker 已恢复，真实 MySQL 的迁移、重复迁移、并发去重与重连读取通过；实际浏览器已验证 React → API → MySQL 保存消息，并在刷新后读取。测试不调用 AI。

未完成：真实 AI、自动记忆、日程调度、安卓安装包、真实通知、图片生成、云端同步与正式身份验证。新工程先迁移主页与聊天，其他模块明确标注为预览/待接入。

旧原型采用 HTML/CSS/JavaScript 和示例数据，仍保留。新工程通过 API 访问 MySQL，数据库故障时不假报成功，不自动使用内存代替。浏览器成功流程测试使用明确的测试数据，不能代替真库验证。

## 本轮技术方向

React、TypeScript、MySQL 已选定；后端采用 Node.js + Fastify，数据访问使用 mysql2 与版本化 SQL。Capacitor、AI 服务、托管和推送尚待实施/验证。

下一阶段选定 AI 接口并接入真实回复；同时尽早验证安卓通知条件。当前不会用固定台词冒充 AI 回复。

## 文档来源与维护

- [项目仓库](https://github.com/Grant-ccc/by-your-side)
- [人物辅助资料](https://github.com/Grant-ccc/by-your-side/blob/main/李泽言角色辅助资料.md)
- [交互原型目录](https://github.com/Grant-ccc/by-your-side/tree/main/原型)
- [暖红效果图](https://github.com/Grant-ccc/by-your-side/tree/main/效果图_暖红版)

`docs/wiki/` 是公开技术与产品文档源，GitHub Wiki 是发布副本。只描述应用能力，不收录个人身份、真实日程、私聊、个人外貌或私人关系经历。修改先进入主仓库，再同步 Wiki，避免两份各自演进。已实现内容与后续规划按当前状态分别标明。
