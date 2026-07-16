# 生产部署手册

本文以 Linux、systemd 和 Nginx 为基准，部署目录为 `/opt/ultrasound`。Windows 可使用 NSSM，参考 `backend/deploy/nssm-install.md`。

## 1. 部署边界

- 后端使用 FastAPI、SQLite 和本地文件目录，前端构建产物由后端静态托管。
- 推理模型为 EfficientNet-B3 + 医学 BERT，默认执行患者级 `mean` 聚合。
- 当前任一已登录医生都能查看病例和批量任务，也能为任意已完成推理的病例创建或更新医生判断；批量任务仅允许创建者取消。正式接入医院前，应按院方的科室、岗位和病例归属规则收紧权限。
- 不要把模型权重、真实患者数据、生产密码、证书私钥或会话 Cookie 提交到 Git。

## 2. 资源与软件要求

| 项目 | 最低建议 | 生产建议 |
|------|----------|----------|
| CPU | 4 核 | 8 核或以上 |
| 内存 | 8 GB | 16 GB 或以上，并以真实样本压测校准 |
| 磁盘 | 50 GB SSD | 200 GB SSD 或按医院留存周期扩容 |
| 网络 | 100 Mbps | 1 Gbps 内网 |
| 操作系统 | Ubuntu 22.04 LTS / Rocky Linux 9 | 由医院统一维护的长期支持版本 |
| Python | 3.10 或以上 | 独立虚拟环境 |
| Node.js | 20.19 或以上 | 与 `frontend/package-lock.json` 兼容的 LTS 版本 |

系统依赖示例：

```bash
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip sqlite3 rsync \
  libjpeg-dev libpng-dev
node --version
npm --version
```

Node.js 建议通过医院批准的软件源安装，不要直接在生产服务器运行未经审核的在线安装脚本。

## 3. 目录、账户与模型文件

创建专用运行账户并将代码放到 `/opt/ultrasound`：

```bash
sudo useradd -r -s /bin/bash -m -d /opt/ultrasound ultrasound
sudo mkdir -p /opt/ultrasound/backend/checkpoints
sudo mkdir -p /opt/ultrasound/backend/models
sudo chown -R ultrasound:ultrasound /opt/ultrasound
```

部署代码后，由受控介质放置以下模型文件：

```text
/opt/ultrasound/backend/checkpoints/best_single_fold3.pth
/opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical/
```

代码和模型应由 `ultrasound` 账户部署。若通过 `root`、`scp` 或其他账户落盘，必须在创建虚拟环境和构建前端前再次校正所有权，否则 `ultrasound` 可能无法创建 `venv/`、`node_modules/`、`dist/` 和运行数据目录：

```bash
sudo chown -R ultrasound:ultrasound /opt/ultrasound
```

确认文件存在且运行账户可读：

```bash
sudo -u ultrasound test -r /opt/ultrasound/backend/checkpoints/best_single_fold3.pth
sudo -u ultrasound test -d /opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical
```

## 4. 安装、构建与首次启动

必须先安装后端依赖并构建前端，再启动 systemd。后端只会在启动时检测 `frontend/dist/`；启动后才构建前端会导致首页不可用，直到服务重启。

### 4.1 安装后端依赖

```bash
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  python3.10 -m venv venv
  source venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
'
```

### 4.2 构建前端

```bash
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/frontend
  npm ci
  npm run build
  test -f dist/index.html
'
```

### 4.3 初始化数据库和管理员

```bash
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  source venv/bin/activate
  python scripts/init_db.py
  python scripts/init_admin.py --user-id admin --password "<一次性强密码>"
'
```

管理员首次登录后必须立即修改一次性密码。命令行密码可能进入 shell 历史或进程列表，应按医院密码交付流程执行并清理暴露面。

### 4.4 安装 systemd 服务

仓库服务文件默认使用 `www-data`。本手册创建的是 `ultrasound` 账户，因此必须用 override 保持运行账户和目录权限一致：

```bash
sudo cp /opt/ultrasound/backend/deploy/ultrasound.service /etc/systemd/system/ultrasound.service
sudo mkdir -p /etc/systemd/system/ultrasound.service.d
sudo tee /etc/systemd/system/ultrasound.service.d/override.conf >/dev/null <<'EOF'
[Service]
User=ultrasound
Group=ultrasound
Environment=MODEL_CKPT_PATH=/opt/ultrasound/backend/checkpoints/best_single_fold3.pth
Environment=BERT_PATH=/opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ultrasound
sudo systemctl status ultrasound --no-pager
```

### 4.5 首次验证

```bash
curl -sS http://127.0.0.1:8000/api/health
journalctl -u ultrasound -n 100 --no-pager
```

健康响应应为 HTTP 200，且 `model_loaded` 为 `true`。随后在浏览器完成登录、单病例推理、医生判断保存和小型批量任务抽样；不要只以首页可打开作为验收标准。

## 5. 环境变量

可在 systemd override 中增加 `Environment=`，修改后执行 `systemctl daemon-reload` 和 `systemctl restart ultrasound`。

| 变量 | 代码默认值 | 说明 |
|------|------------|------|
| `HOST` | `0.0.0.0` | 监听地址；systemd 的 `ExecStart` 已显式指定 |
| `PORT` | `8000` | 监听端口；systemd 的 `ExecStart` 已显式指定 |
| `LOG_FORMAT` | `console` | 生产建议 `json`；仓库 systemd 文件已设置 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `COOKIE_SECURE` | `false` | 全站 HTTPS 后设为 `true` |
| `COOKIE_SAMESITE` | `lax` | 会话 Cookie SameSite 策略 |
| `SESSION_LIFETIME_HOURS` | `8` | 滑动会话有效期 |
| `LOGIN_FAILURE_LIMIT` | `5` | 锁定窗口内允许的连续失败次数 |
| `LOGIN_LOCKOUT_MINUTES` | `15` | 登录锁定窗口 |
| `PASSWORD_MIN_LENGTH` | `8` | 密码仍必须同时包含字母和数字 |
| `HSTS_ENABLED` | `false` | 仅在全站 HTTPS 验证完成后开启 |
| `FORCE_HTTPS_REDIRECT` | `false` | 仅在反向代理协议头配置正确后开启 |
| `MODEL_CKPT_PATH` | `backend/checkpoints/best_single_fold3.pth` | 生产路径见上文 |
| `BERT_PATH` | `backend/models/nlp_corom_sentence-embedding_chinese-base-medical/` | 生产路径见上文 |
| `MODEL_FOLD_PATHS` | 空 | 当前仅解析该配置，推理器尚未接入多折权重；设置该变量不能启用多折推理 |
| `AGGREGATION_STRATEGY` | `mean` | 可选 `mean`、`max_severity`、`majority_vote` |
| `MAX_IMAGES_PER_CASE` | `30` | 单病例最多 30 张 |
| `MAX_IMAGE_BYTES` | `52428800` | 单图 50 MB |
| `BATCH_MAX_UNCOMPRESSED_BYTES` | `524288000` | ZIP 解压后总量 500 MB |
| `BATCH_MAX_IMAGES_PER_PATIENT` | `30` | 批量每患者最多处理 30 张 |
| `BATCH_IMAGE_TIMEOUT_SECONDS` | `300` | 批量单图等待推理的超时时间 |
| `MAX_ACTIVE_BATCHES_PER_USER` | `1` | 每用户同时处于活动状态的批次数 |
| `MAX_PENDING_BATCHES_GLOBAL` | `10` | 全局活动批次数上限 |

限制值来自当前代码配置。提高限制会同步增加上传、磁盘、内存和推理队列压力，修改前必须用医院真实规模的脱敏样本验证。

## 6. HTTPS 与 Nginx

建议由 Nginx 终止 TLS，并只向医院内网开放服务：

```nginx
server {
    listen 443 ssl http2;
    server_name diagnosis.hospital.internal;

    ssl_certificate     /etc/ssl/certs/hospital.crt;
    ssl_certificate_key /etc/ssl/private/hospital.key;

    client_max_body_size 600m;
    proxy_read_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

示例中的 `client_max_body_size 600m` 是网关层额外限制，低于后端单病例的理论组合上限（30 个文件 x 50 MB）。医院可以保留更严格的网关限制，但必须把实际可上传总量告知临床用户；若业务确需接近后端理论上限，应在磁盘、请求时长和并发容量验证后相应调高，避免请求在到达 FastAPI 前被 Nginx 拒绝。

确认 HTTPS、反向代理和登录均正常后，再设置：

```ini
Environment=COOKIE_SECURE=true
Environment=HSTS_ENABLED=true
Environment=FORCE_HTTPS_REDIRECT=true
```

## 7. 数据目录与备份

运行数据位于 `/opt/ultrasound/backend/data/`：

```text
app.db       SQLite 数据库
uploads/     原始上传图像
previews/    DICOM 等格式的浏览预览
gradcam/     可解释性图像
batch/       批量 ZIP 解压工作目录
```

`backend/scripts/backup.sh` 当前只备份 SQLite 数据库和 `uploads/`，默认写入 `/var/backups/ultrasound` 并保留 30 天。若医院要求完整恢复预览和 Grad-CAM，还必须按院方策略额外备份 `previews/` 与 `gradcam/`；不要把 `batch/` 当作长期临床归档。

每日备份示例：

```cron
0 3 * * * BACKUP_DIR=/mnt/nas/backups/ultrasound /opt/ultrasound/backend/scripts/backup.sh >> /var/log/ultrasound-backup.log 2>&1
```

每月至少在隔离测试机恢复一次：复制一份 `app-*.db` 为 `backend/data/app.db`，同步 `uploads-latest/`，按备份范围恢复预览和 Grad-CAM，然后验证登录、病例详情、原图、推理结果与医生判断。恢复前必须停止测试实例，且不得用演练数据覆盖生产目录。

## 8. 升级与回滚

升级按以下顺序执行：

1. 记录当前版本号和模型校验值，通知临床用户维护窗口。
2. `sudo systemctl stop ultrasound`。
3. 执行 `backend/scripts/backup.sh`，并确认数据库和图像备份可读。
4. 更新代码；不要覆盖生产模型、数据目录和 systemd override。
5. 在后端虚拟环境执行 `python -m pip install -r requirements.txt`。
6. 在 `frontend/` 执行 `npm ci && npm run build`，确认 `dist/index.html` 存在。
7. 如版本说明包含数据库迁移，先在备份副本验证后再执行；当前项目未集成 Alembic，不要臆测或手工修改表结构。
8. `sudo systemctl start ultrasound`，检查 status、日志和 `/api/health`。
9. 登录后抽样验证历史病例、单病例推理、医生判断保存及一个小型批量任务。

回滚时停止服务，恢复已验证的代码版本、数据库和与其一致的图像文件，再构建对应前端并启动。批量任务不能跨服务重启续跑：启动时遗留的 `pending/running` 任务会被标记为失败，需要重新提交。

## 9. 运维入口

值班排障、批次异常、医生判断冲突、ZIP 校验和统计不同步处理见 `docs/runbook.md`。
