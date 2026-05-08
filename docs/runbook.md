# 运维手册（V1 Runbook）

所有命令默认以 `ultrasound` 用户执行，工作目录 `/opt/ultrasound/backend`。

## 紧急联系人

| 角色 | 联系方式 |
|------|----------|
| 信息科负责人 | （补全） |
| AI 供应方 | （补全） |
| 数据库管理员 | （补全） |

## 常用命令

```bash
# 服务状态
systemctl status ultrasound
journalctl -u ultrasound -f

# 重启
sudo systemctl restart ultrasound

# 关闭
sudo systemctl stop ultrasound

# 快速健康检查
curl -sS http://127.0.0.1:8000/api/health | jq
```

## 预案

### 1) 服务挂了 / 无法访问首页

1. `systemctl status ultrasound` 看是不是 active。不是就 `systemctl restart ultrasound`。
2. `journalctl -u ultrasound -n 200 --no-pager` 看最近 200 行日志。
3. `curl http://127.0.0.1:8000/api/health` — 如果返回 200、`model_loaded: true`，检查 Nginx / 网络。
4. 模型加载失败（`startup.model_load_failed`）：确认 `MODEL_CKPT_PATH` / `BERT_PATH` 文件存在且权限允许读。

### 2) SQLite 锁死 / 写入缓慢

SQLite WAL + `busy_timeout=5000` 已默认开启，但长事务仍可能卡写。

1. `lsof backend/data/app.db` 看有谁持有。
2. 看是不是 backup 脚本正在跑 `.backup`（正常现象，完成后会释放）。
3. 极端情况下重启服务（会中断未完成的批量任务，资源先保住）。

### 3) 磁盘满

```bash
du -sh /opt/ultrasound/backend/data/*
# 通常 uploads/ 最大
```

处理顺序：

1. 跑一次 backup.sh，把老数据归档到 NAS；
2. 删 30 天以前的 `uploads/YYYY/MM/DD/` 子目录（**先确认备份**）；
3. 用 `PRAGMA wal_checkpoint(TRUNCATE)` 压缩 WAL。

### 4) 推理变慢 / P95 飙升

1. `curl http://127.0.0.1:8000/api/metrics` (admin cookie) 看 `inference.avg_latency_ms` 和 `queue_length`；
2. 正在跑批量任务？让它跑完再观察；
3. 服务器 CPU 占满？考虑限制并发批量数（`MAX_PENDING_BATCHES_GLOBAL`）或升级硬件；
4. BERT 缓存失效？首次加载后 avg 应在 80 ms 左右，如果明显更慢说明模型反复被换出，查内存。

### 5) 忘记管理员密码

有至少一个可用 admin：

- 登录后台用 `PATCH /api/admin/users/<user_id>` 的 `new_password` 字段。

全部 admin 丢了：

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python scripts/init_admin.py --user-id admin --password 'NewAdminPass#2026' --reset
```

### 6) 备份恢复演练

```bash
# 在测试机上
cp /mnt/nas/backups/ultrasound/app-20260501-030000.db data/app.db
rsync -a /mnt/nas/backups/ultrasound/uploads-latest/ data/uploads/

# 启动，登录，随机抽 5 个 case_id 验证 /api/cases/<id> 能拉出详情
```

## 日志解读

- `startup.model_loaded`：模型正常加载
- `startup.model_load_failed`：模型文件路径错或损坏，服务会继续跑但 `/api/predict` 全失败
- `response.5xx`：一次 5xx 响应，附 path / method / request_id
- `unhandled_exception`：未预期异常，堆栈已落盘
- `audit.xxx`：审计行为（登录/登出/创建用户等）
- 所有日志都带 `request_id`，用它穿透一次请求的全链路

## 压测

轻量 locust-like 脚本放在 `backend/tests/loadtest.py`：

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python tests/loadtest.py \
  --base-url http://127.0.0.1:8000 \
  --user-id admin --password 'Admin#2026' \
  --concurrency 10 --total 30 \
  --image /path/to/sample.jpg
```

脚本打印 P50/P95/P99 / 错误计数，期望 CPU 推理 P95 < 5 秒。
