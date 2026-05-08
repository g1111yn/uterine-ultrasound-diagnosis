# 部署文档（V1）

## 1. 硬件要求

| 场景 | 最低 | 推荐 |
|------|------|------|
| CPU | 4 核 | 8 核 + |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 50 GB SSD | 200 GB SSD |
| 网络 | 100 Mbps | 1 Gbps |

> CPU 推理。首次加载 BERT + ResNet18 约需 1.2 GB 内存；模型权重 + BERT 目录合计约 500 MB。

## 2. 系统支持

- Linux：Ubuntu 22.04 LTS / Rocky 9（推荐 systemd 部署）
- Windows：Windows Server 2019 / 2022（用 NSSM，见 `backend/deploy/nssm-install.md`）

## 3. 一次性安装步骤（Linux）

```bash
# 3.1 依赖
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip sqlite3 rsync libjpeg-dev libpng-dev

# 3.2 用户 + 目录
sudo useradd -r -s /bin/bash -m -d /opt/ultrasound ultrasound
sudo -u ultrasound mkdir -p /opt/ultrasound

# 3.3 拉取代码到 /opt/ultrasound/（scp 或 git）
sudo chown -R ultrasound:ultrasound /opt/ultrasound

# 3.4 建 venv
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  python3.10 -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
'

# 3.5 放模型权重
#   将 bert-base_fold1_best.pth 放到 /opt/ultrasound/models/checkpoints/
#   将 tiansz/bert-base-chinese 整个目录放到 /opt/ultrasound/models/bert/
#   （或保持默认路径 ~/Documents/超声/，不改环境变量）

# 3.6 初始化数据库 + 管理员
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  source venv/bin/activate
  python scripts/init_db.py
  python scripts/init_admin.py --user-id admin --password "Admin#2026"
'

# 3.7 装 systemd 服务
sudo cp /opt/ultrasound/backend/deploy/ultrasound.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ultrasound
sudo systemctl status ultrasound

# 3.8 前端构建
cd /opt/ultrasound/frontend
sudo -u ultrasound bash -lc 'npm install && npm run build'
# dist 就在 frontend/dist/，后端会自动挂载
```

访问 `http://<服务器 IP>:8000/`，用 admin 登录后立即修改密码并在"管理 → 用户"里创建医生账号。

## 4. 环境变量（.env 或 systemd Environment=）

| 变量 | 默认 | 说明 |
|------|------|------|
| `LOG_FORMAT` | `console` | `json` 时输出结构化日志（推荐生产用） |
| `LOG_LEVEL` | `INFO` | |
| `COOKIE_SECURE` | `false` | HTTPS 部署改为 `true` |
| `COOKIE_SAMESITE` | `lax` | |
| `SESSION_LIFETIME_HOURS` | `8` | |
| `LOGIN_FAILURE_LIMIT` | `5` | 连续失败次数触发锁 |
| `LOGIN_LOCKOUT_MINUTES` | `15` | |
| `PASSWORD_MIN_LENGTH` | `8` | |
| `HSTS_ENABLED` | `false` | HTTPS 才开 |
| `FORCE_HTTPS_REDIRECT` | `false` | HTTPS 才开 |
| `MODEL_CKPT_PATH` | `~/Documents/超声/checkpoints/bert-base_fold1_best.pth` | |
| `BERT_PATH` | `~/Documents/超声/models/tiansz/bert-base-chinese` | |
| `AGGREGATION_STRATEGY` | `mean` | `mean` / `max_severity` / `majority_vote` |
| `MAX_IMAGES_PER_CASE` | `10` | 单例一次最多图数 |
| `MAX_IMAGE_BYTES` | `52428800` | 单图 ≤ 50 MB |
| `BATCH_MAX_UNCOMPRESSED_BYTES` | `524288000` | ZIP 解压上限 500 MB |
| `BATCH_MAX_IMAGES_PER_PATIENT` | `20` | |
| `MAX_ACTIVE_BATCHES_PER_USER` | `1` | |
| `MAX_PENDING_BATCHES_GLOBAL` | `10` | |

## 5. HTTPS（可选）

建议用 Nginx 做 TLS 终止反代：

```nginx
server {
    listen 443 ssl http2;
    server_name diagnosis.hospital.internal;
    ssl_certificate     /etc/ssl/certs/hospital.crt;
    ssl_certificate_key /etc/ssl/private/hospital.key;

    client_max_body_size 600m;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

部署后把 `COOKIE_SECURE=true`、`HSTS_ENABLED=true`、`FORCE_HTTPS_REDIRECT=true` 打开，重启 systemd 服务。

## 6. 备份

`backend/scripts/backup.sh` 做 SQLite `.backup` + uploads 增量 rsync，保留 30 天。

cron 每天凌晨 3 点：

```cron
0 3 * * * /opt/ultrasound/backend/scripts/backup.sh >> /var/log/ultrasound-backup.log 2>&1
```

**每月做一次恢复演练**：从 `BACKUP_DIR/app-*.db` 复制到一台测试机 `data/app.db`、把 `uploads-latest/` 同步到 `data/uploads/`，启动服务确认能登录 + 查历史 + 查单个 case 详情。

## 7. 升级流程

1. `systemctl stop ultrasound`
2. 跑一次 backup.sh 留档
3. `git pull` 或 rsync 新代码
4. `pip install -r requirements.txt`
5. 有 schema 变更时手动跑迁移脚本（V2 时会接入 Alembic）
6. `npm run build`（前端）
7. `systemctl start ultrasound`，看 `systemctl status`、`journalctl -u ultrasound -f`

## 8. 故障排查

详见 `docs/runbook.md`。
