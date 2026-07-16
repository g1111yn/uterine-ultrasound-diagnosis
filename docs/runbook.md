# 运维手册

本文面向值班人员。除特别说明外，应用目录为 `/opt/ultrasound`，后端目录为 `/opt/ultrasound/backend`。涉及删除、恢复或数据库写入前，必须先停止相关操作并完成可验证备份。

## 1. 紧急联系人

| 角色 | 联系方式 |
|------|----------|
| 信息科负责人 | （上线前补全） |
| 临床科室负责人 | （上线前补全） |
| AI 系统维护方 | （上线前补全） |
| 数据库/备份负责人 | （上线前补全） |

## 2. 常用检查

```bash
# 服务与最近日志
sudo systemctl status ultrasound --no-pager
sudo journalctl -u ultrasound -n 200 --no-pager

# 实时日志
sudo journalctl -u ultrasound -f

# 无需登录的健康检查
curl -sS http://127.0.0.1:8000/api/health

# 数据目录容量
du -sh /opt/ultrasound/backend/data/*
df -h /opt/ultrasound/backend/data
```

`GET /api/metrics` 仅管理员可访问，包含模型状态、推理延迟、队列长度、数据库规模和进程内错误计数。可通过已登录的管理员页面查看，或使用受保护的管理员会话发起请求；不要把会话 Cookie 写入共享脚本或工单。

## 3. 事件处置

### 3.1 服务不可用或首页打不开

1. 执行 `systemctl status` 和 `journalctl`，确认服务是否启动失败或反复重启。
2. 请求 `/api/health`。若返回 200，检查 Nginx、证书、DNS 和防火墙；若连接失败，继续检查 Uvicorn 日志和 8000 端口。
3. 若 API 正常但首页 404，确认 `/opt/ultrasound/frontend/dist/index.html` 存在。重新执行 `npm ci && npm run build` 后必须重启后端，因为静态目录只在后端启动时挂载。
4. 恢复服务后完成登录、病例详情和一次小规模推理抽样。

### 3.2 批量任务停滞或终态异常

批量任务公开状态为 `queued`、`running`、`completed`、`failed`、`cancelled`；数据库内部把排队状态记为 `pending`。批量患者串行处理，单病例任务可以优先插队，因此短时进度不变不一定是故障。

1. 在批次详情页手动刷新，记录 `job_id`、当前患者、已完成图像数、患者成功/失败数和错误信息。
2. 查看 `/api/health` 的 `queue_length`，并由管理员查看 `/api/metrics` 的队列长度和推理延迟。
3. 用 `request_id`、`job_id` 或患者编号检索服务日志，关注图像推理超时、模型异常和数据库锁。
4. 只读核对数据库状态：

   ```bash
   cd /opt/ultrasound/backend
   sqlite3 data/app.db "SELECT job_id,status,total_patients,completed_patients,succeeded_patients,failed_patients,total_images,completed_images,error_message FROM batch_jobs ORDER BY started_at DESC LIMIT 20;"
   ```

5. 单图超过 `BATCH_IMAGE_TIMEOUT_SECONDS`（默认 300 秒）时，任务会转为 `failed`，应先解决模型或资源问题，再重新提交 ZIP。
6. 服务重启不会续跑批次；启动时遗留的 `pending/running` 会自动标记为 `failed`，错误信息为“服务重启，批量任务已中断，请重新提交。”
7. 若任务持续活动但日志和计数都不再变化，在保存证据后执行受控重启。重启会中断当前批次，恢复后由临床人员确认并重新提交。

不要直接修改 `batch_jobs` 计数或状态来伪造完成，也不要重复点击提交制造多个任务。取消接口只允许任务提交者取消其活动批次，但所有已登录医生当前都能查看批次详情。

### 3.3 医生判断冲突

`JUDGMENT_CONFLICT` 表示该病例的判断版本已被其他医生或另一个标签页更新。系统以 `expected_judged_at` 做乐观并发控制，这是防止后保存内容静默覆盖先保存内容的正常保护。

1. 保留当前未保存内容，刷新病例并核对最新医生、判断、建议、备注和保存时间。
2. 与相关医生确认最终内容后，基于最新版本重新录入并保存。
3. 若冲突反复出现，关闭同一病例的重复标签页，记录 `case_id`、用户、时间和 `request_id` 后交给维护人员排查。

不要直接修改数据库绕过冲突。当前已登录医生共享查看和更新病例判断，正式医院接入后再按院方规则收紧科室或所有者权限。

### 3.4 模型加载失败

典型现象是 `/api/health` 返回 `model_loaded: false`，日志出现 `startup.model_load_failed`，后续推理失败。

1. 核对 systemd 实际环境和固定生产路径：

   ```bash
   sudo systemctl cat ultrasound
   sudo -u ultrasound test -r /opt/ultrasound/backend/checkpoints/best_single_fold3.pth
   sudo -u ultrasound test -d /opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical
   ```

2. `MODEL_CKPT_PATH` 应指向 `/opt/ultrasound/backend/checkpoints/best_single_fold3.pth`；`BERT_PATH` 应指向 `/opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical/`。
3. 检查磁盘、内存、文件权限和模型文件校验值；权重损坏时从受控模型制品重新部署，不要从未知来源下载替换。
4. 修正后重启服务，再确认日志出现 `startup.model_loaded` 且健康检查为 `model_loaded: true`。
5. 用脱敏样本完成单病例与批量抽样，不要仅根据进程存活判断模型恢复。

### 3.5 批量 ZIP 校验失败

先在隔离目录解压检查，不要把含患者数据的 ZIP 复制到个人设备或公共文件服务。有效结构示例：

```text
batch.zip
├── manifest.csv
├── P001/
│   ├── 001.dcm
│   └── 002.jpg
└── P002/
    └── 001.png
```

逐项确认：

- `manifest.csv` 必须位于 ZIP 根目录，编码为 UTF-8 或 UTF-8 BOM。
- 必需列为 `patient_no`、`clinical_text`，可选列为 `check_project`；未知列会被忽略并产生提示。
- 患者目录名必须与去除首尾空格后的 `patient_no` 完全一致，包括大小写和字符。
- 支持 `jpg`、`jpeg`、`png`、`bmp`、`tif`、`tiff`、`dcm`；根目录散落的图像不会作为患者图像处理。
- `MAX_IMAGE_BYTES=52428800`（50 MB）是单病例上传的单图限制；批量入口按 ZIP 解压总量和每患者图数限制，不要误认为它会逐张拒绝批量包中的大文件。
- 解压总量不得超过 `BATCH_MAX_UNCOMPRESSED_BYTES=524288000`（500 MB）。压缩比异常、路径穿越或无效 ZIP 会被拒绝。
- 每患者只处理按文件名排序后的前 `BATCH_MAX_IMAGES_PER_PATIENT=30` 张；发现更多图像时应整理后重新打包，避免样本被静默截断。
- `manifest.csv` 中没有对应图像目录的患者、未列入 manifest 的目录会被跳过并产生提示；所有患者均无有效图像时任务会被拒绝。

修正原始数据后创建新 ZIP 并重新提交。不要手工把文件塞进服务器的 `data/batch/` 目录，后台任务不会因此自动建立病例。

### 3.6 判断和批量统计不同步

批次详情中的患者判断状态由病例判断记录动态生成，批次进度计数则保存在 `batch_jobs`。页面轮询或浏览器缓存可能造成短时显示滞后。

1. 先停止重复保存，记录 `job_id`、`case_id`、页面计数和最后操作时间。
2. 在页面手动刷新；仍不一致时重新登录或在新标签页打开同一批次，排除本地缓存。
3. 通过已认证的 `GET /api/batch/{job_id}` 和 `GET /api/cases/{case_id}` 对比服务端当前结果。
4. 只读核对数据库：

   ```bash
   cd /opt/ultrasound/backend
   sqlite3 data/app.db "SELECT job_id,status,total_patients,completed_patients,succeeded_patients,failed_patients,total_images,completed_images FROM batch_jobs WHERE job_id='<job_id>';"
   sqlite3 data/app.db "SELECT c.case_id,c.patient_no,j.doctor_id,j.final_class,j.judged_at FROM cases c LEFT JOIN judgments j ON j.case_id=c.case_id WHERE c.batch_job_id='<job_id>' ORDER BY c.created_at;"
   ```

5. 若 API 与数据库一致而页面不一致，收集浏览器时间、接口响应和前端版本后升级处理；若数据库计数自身不一致，先备份 `data/app.db`、保留日志和问题 ZIP，再交由研发定位事务或终态更新问题。

不要通过直接更新统计字段“修平”数据，也不要删除判断记录后重录。

### 3.7 SQLite 锁等待或写入缓慢

SQLite 已启用 WAL 和 `busy_timeout=5000`，并发长事务、备份或磁盘异常仍可能阻塞写入。

1. 执行 `lsof /opt/ultrasound/backend/data/app.db*` 确认访问进程。
2. 检查备份是否正在执行，以及磁盘空间、I/O 和服务日志中的锁错误。
3. 等待正常备份结束；若临床业务持续受阻，通知用户停止提交，执行受控服务重启。
4. 若需执行 WAL checkpoint，先备份并确认没有其他应用进程写库：

   ```bash
   cd /opt/ultrasound/backend
   sqlite3 data/app.db "PRAGMA wal_checkpoint(TRUNCATE);"
   ```

不要删除 `app.db-wal` 或 `app.db-shm` 文件，也不要在服务运行时复制数据库文件替代 SQLite `.backup`。

### 3.8 磁盘空间不足

1. 使用 `du` 和 `df` 确认增长来自 `uploads/`、`previews/`、`gradcam/`、`batch/`、数据库还是日志。
2. 暂停新推理和批量提交，先运行备份并在隔离环境验证可恢复。
3. `data/batch/` 是批量解压工作目录，可在确认对应任务已终止且保留问题证据后清理残留目录。
4. 原图、预览、Grad-CAM 和数据库均可能属于临床记录。只有在医院数据留存策略明确授权、备份验证通过且病例关联已评估后才能删除。

## 4. 管理员密码恢复

若仍有可用管理员，应优先通过管理页面重置用户密码。全部管理员不可用时，在受控终端执行：

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python scripts/init_admin.py --user-id admin --password '<一次性强密码>' --reset
```

新密码必须满足长度要求且同时包含字母和数字。恢复后立即登录修改密码，并检查审计日志；命令行中的密码按医院安全流程处置。

## 5. 备份恢复演练

`scripts/backup.sh` 当前备份 `data/app.db` 和 `data/uploads/`，不包含 `previews/`、`gradcam/`。完整恢复演练必须同时覆盖医院另行配置的这些目录备份。

```bash
# 仅在隔离测试机执行，确保测试服务已停止
cp /mnt/nas/backups/ultrasound/app-20260701-030000.db data/app.db
rsync -a /mnt/nas/backups/ultrasound/uploads-latest/ data/uploads/
```

启动测试实例后，验证登录、随机病例详情、原始图像、DICOM 预览、Grad-CAM、医生判断和批次历史。记录恢复点、耗时、缺失文件和验证人，不得将演练数据库接入生产入口。

## 6. 日志索引

- `startup.model_loading`：开始加载模型。
- `startup.model_loaded`：模型加载成功。
- `startup.model_load_failed`：模型加载失败；服务仍可能存活，但不能据此认为推理可用。
- `startup.stale_batches_marked_failed`：启动时将遗留活动批次标记为失败。
- `response.5xx`：一次 5xx 响应，包含请求路径、方法和 `request_id`。
- `unhandled_exception`：未处理异常及堆栈。
- `audit.*`：登录、用户管理、推理、判断等审计行为。

所有请求日志都带 `request_id`。排障记录至少包含时间、用户、`request_id`、`case_id` 或 `job_id`、页面现象和是否已重试；不要在工单中粘贴患者完整临床文本或原始影像。

## 7. 性能抽样

仓库包含轻量压测脚本：

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python tests/loadtest.py \
  --base-url http://127.0.0.1:8000 \
  --user-id '<测试账号>' --password '<测试密码>' \
  --concurrency 10 --total 30 \
  --image /path/to/deidentified-sample.jpg
```

只使用专用测试账号和脱敏样本，在批准的维护窗口运行。脚本输出 P50/P95/P99 与错误计数；是否达标应以医院服务器、模型和业务并发基线为准，不使用固定的通用耗时承诺。
