# MySQL 数据模型草案

[返回首页](Home.md)

状态：基础迁移文件 `database/migrations/001_initial.sql` 与 mysql2 存储代码已编写，包含 users、characters、relationships、conversations、messages、budget_periods、generation_runs 七张表。本机 MySQL 引擎未就绪，不能称为已执行建表。其余实体仍为草案。

## 建模约定

- 云端 MySQL 负责持久事实；客户端不持有数据库账号。
- 按用户与角色关系隔离数据，即使首版只有一位用户也不以全局变量串联全部内容。
- 时间存储统一，展示和日程规则使用明确时区；本项目默认为 Asia/Shanghai。
- 重要写入带版本/来源，任务带唯一执行标识，消息有可排序的同步游标。
- 图片文件单独保存，表中只存标识、位置和关联信息。

## 最小真实聊天阶段

| 实体 | 主要字段 | 用途 |
| --- | --- | --- |
| users | id、display_name、timezone、created_at | 使用者身份与偏好 |
| characters | id、name、profile_version、profile_content | 可版本化角色资料，不混入用户隐私 |
| relationships | id、user_id、character_id、nickname、anniversary、settings | 每位用户与角色的关系 |
| conversations | id、relationship_id、created_at | 会话归属 |
| messages | id、conversation_id、client_request_id、role、text、version、status、created_at | 消息、去重、同步、有效版本 |
| generation_runs | id、relationship_id、batch_id、state、model、reserved_cost、actual_cost、request_key | AI 任务与费用关联 |
| budget_periods | id、user_id、period、limit、spent、reserved | 月预算控制 |

messages 不用“文本为空”表示失败。明确区分已提交、等待角色查看、已读、生成中、成功、失败、被替换等状态；模拟角色已读与服务器已收到不是同一个时间。

## 后续逐步增加

| 实体 | 主要字段 | 用途 |
| --- | --- | --- |
| memories | relationship_id、content、category、status、source_message_id、source_version、valid_from、invalidated_at | 有效/候选/撤销记忆 |
| memory_sources | memory_id、message_id、message_version | 多来源追溯 |
| summaries | conversation_id、revision、source_range、invalidated_at | 上下文压缩，删除纠错后重建受影响部分 |
| appointments | relationship_id、title、start_at、end_at、status、confirmed_at | 共同约定与冲突检查 |
| user_schedules | user_id、kind、title、start_at、recurrence_rule | 课程、考试、待办；循环课表规则需后续明确 |
| habits / habit_logs | user_id、name、goal；habit_id、recorded_at、value | 自定义习惯与打卡事实 |
| character_events | relationship_id、start_at、end_at、type、state、origin、revision | 角色生活事实与时间线 |
| scheduled_jobs | relationship_id、type、due_at、state、attempts、lease_until、idempotency_key | 持久任务与失败重试 |
| items / inventories | character_id、definition；relationship_id、item_id、source_event_id | 物品定义与收藏 |
| trips | relationship_id、carried_item_id、event_id、result | 出行条件与结果 |
| photos | relationship_id、file_key、event_id、state、quota_period、run_id、caption | 相册、生成状态与周额度 |
| notification_deliveries | message_id、device_id、state、provider_id、attempts | 将生成与送达分开追踪 |
| devices | user_id、platform、push_registration、updated_at | 设备关联，不能代替用户身份认证 |

## 一致性要求

1. **重复发送**：同一会话内 client_request_id 唯一；重试返回已有结果，而非再次生成扣费。
2. **忙后批次**：批次记录包含消息范围；生成期间新消息如何并入下一批要有规则。
3. **重新回复**：保留修订关系并失效旧版本派生内容；最新一轮优先实现，不能无声改写后续事实。
4. **纠正记忆**：旧事实失效，关联摘要不继续携带它。历史消息保留与模型检索排除是两个独立动作。
5. **约定确认**：一次确认完成约定与记忆关联写入，不能一处成功另一处丢失。
6. **任务执行**：领取任务用并发控制/租约；执行唯一键防止多次留言或多次生成图片。
7. **费用预留**：先锁定预算预留，再调用服务；结算实际费用、释放剩余预留。超时需核对任务，不能直接认定未消费。
8. **图片额度**：周额度与费用一起检查；并发请求需要预占位置。失败是否占成功张数、有限重试次数待最终决定，但实际费用始终计入。

## 恢复与迁移

备份包含格式版本和关联关系；导入需要完整校验，并在事务或受控恢复流程中生效。删除标记不能在合并时静默复活。密钥、会话令牌和推送注册信息不作为用户可携带备份内容。

迁移采用命名锁、内容校验和与 schema_migrations 表。MySQL DDL 可能隐式提交，迁移失败后需检查部分建表状态，不自动重置数据库。真库重跑与并发存储检查已加入 CI，结果需单独核对。本页中后续实体不充当已实现的 SQL。
