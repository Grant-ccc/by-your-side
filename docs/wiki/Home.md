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

已完成：需求整理、静态视觉方案、可点击原型、浏览器本地保存、示例备份恢复，以及主要流程的浏览器检查。

未完成：React 工程迁移、后端、MySQL 表与迁移、真实 AI、自动记忆、真实日程调度、安卓安装包、真实通知、图片生成、云端同步与正式身份验证。

当前原型采用 HTML/CSS/JavaScript 和示例数据。看到“正在输入”“预算用尽”等状态，不代表相关后台已经实现。详细进度以开发路线为准，不用一个笼统百分比衡量完成程度。

## 本轮技术方向

用户指定 React、TypeScript、MySQL；规划采用 Node.js + TypeScript 后端与 Capacitor 安卓打包。具体后端框架、ORM、AI 服务、托管和推送方案在验证后确定。

下一阶段先实现：发送文字 → 后端保存 → AI 回复 → 保存回复 → 再次打开能看到；同时尽早验证目标 vivo 手机上的通知条件。

## 文档来源与维护

- [项目仓库](https://github.com/Grant-ccc/by-your-side)
- [人物辅助资料](https://github.com/Grant-ccc/by-your-side/blob/main/李泽言角色辅助资料.md)
- [交互原型目录](https://github.com/Grant-ccc/by-your-side/tree/main/原型)
- [暖红效果图](https://github.com/Grant-ccc/by-your-side/tree/main/效果图_暖红版)

`docs/wiki/` 是公开技术与产品文档源，GitHub Wiki 是发布副本。只描述应用能力，不收录个人身份、真实日程、私聊、个人外貌或私人关系经历。修改先进入主仓库，再同步 Wiki，避免两份各自演进。本文是规划，不声称已经创建所描述的正式工程。
