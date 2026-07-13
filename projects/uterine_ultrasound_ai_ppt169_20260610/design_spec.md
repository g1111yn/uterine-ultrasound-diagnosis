# uterine_ultrasound_ai - Design Spec

## I. Project Information

| Item | Value |
| ---- | ----- |
| **Project Name** | 子宫超声辅助诊断系统 |
| **Canvas Format** | PPT 16:9 (1280×720) |
| **Page Count** | 12 |
| **Design Style** | B) General Consulting + restrained medical technology + warm low-noise interface language |
| **Target Audience** | 医院妇科/超声科、信息科、项目验收人员、院内管理或合作方 |
| **Use Case** | 项目汇报、验收演示、科室介绍、部署沟通 |
| **Created Date** | 2026-06-10 |

---

## II. Canvas Specification

| Property | Value |
| -------- | ----- |
| **Format** | PPT 16:9 |
| **Dimensions** | 1280×720 |
| **viewBox** | `0 0 1280 720` |
| **Margins** | left/right 56px, top 46px, bottom 38px |
| **Content Area** | 1168×636 |

---

## III. Visual Theme

### Theme Style

- **Style**: B) General Consulting + restrained medical technology
- **Theme**: Light theme
- **Tone**: clinical, credible, calm, system-oriented, warm rather than cold

### Color Scheme

| Role | HEX | Purpose |
| ---- | --- | ------- |
| **Background** | `#F7F6F0` | Warm page background |
| **Secondary bg** | `#FFFFFF` | Panels and cards |
| **Primary** | `#00796B` | Medical technology anchor, icons, section markers |
| **Accent** | `#C15F3C` | Key numbers, selected emphasis, arrows |
| **Secondary accent** | `#2F7C95` | Architecture links, technical highlights |
| **Body text** | `#1F1E1D` | Main copy |
| **Secondary text** | `#6B6864` | Notes, captions, metadata |
| **Tertiary text** | `#8B8881` | Footers and subtle labels |
| **Border/divider** | `#D8D6CC` | Dividers and card borders |
| **Success** | `#3B6D11` | Normal class / positive status |
| **Warning** | `#854F0B` | Polyp class / caution |
| **Danger** | `#A32D2D` | Endometrial cancer class / risk |
| **Info pale** | `#E6F1FB` | Soft information surface |
| **Teal pale** | `#E6F3F0` | Soft primary surface |
| **Coral pale** | `#FCEDE8` | Soft accent surface |

---

## IV. Typography System

### Font Plan

**Typography direction**: CJK-primary consulting deck with a restrained serif accent for title moments.

| Role | Chinese | English | Fallback tail |
| ---- | ------- | ------- | ------------- |
| **Title** | `"Microsoft YaHei"` | `Georgia` | `serif` |
| **Body** | `"Microsoft YaHei", "PingFang SC"` | `Arial` | `sans-serif` |
| **Emphasis** | `"Microsoft YaHei"` | `Georgia` | `serif` |
| **Code** | — | `Consolas, "Courier New"` | `monospace` |

**Per-role font stacks**:

- Title: `Georgia, "Microsoft YaHei", serif`
- Body: `"Microsoft YaHei", "PingFang SC", Arial, sans-serif`
- Emphasis: `Georgia, "Microsoft YaHei", serif`
- Code: `Consolas, "Courier New", monospace`

### Font Size Hierarchy

**Baseline**: Body font size = 20px.

| Purpose | Ratio to body | Current Project | Weight |
| ------- | ------------- | --------------- | ------ |
| Cover title (hero headline) | 2.5-5x | 70px | Bold |
| Chapter / section opener | 2-2.5x | 48px | Bold |
| Page title | 1.5-2x | 36px | Bold |
| Hero number (consulting KPIs) | 1.5-2x | 40px | Bold |
| Subtitle | 1.2-1.5x | 26px | SemiBold |
| **Body content** | **1x** | **20px** | Regular |
| Annotation / caption | 0.7-0.85x | 15px | Regular |
| Page number / footnote | 0.5-0.65x | 12px | Regular |

Formula rendering policy: `text-only`. The source has no complex formula-worthy expressions; model dimensions and metrics remain editable text.

---

## V. Layout Principles

### Page Structure

- **Header area**: 46-112px depending on page type; includes page marker, title, and occasional section tag.
- **Content area**: 520-600px; varies between structured diagrams, cards, timelines, and comparison bands.
- **Footer area**: 32-38px; page number and a concise system name.

### Layout Pattern Library

| Pattern | Suitable Scenarios |
| ------- | ----------------- |
| **Single column centered** | Cover, closing, risk principle |
| **Symmetric split (5:5)** | Clinical value versus engineering response |
| **Asymmetric split (3:7 / 2:8)** | Model architecture, deployment summary |
| **Top-bottom split** | End-to-end workflow and inference pipeline |
| **Three/four column cards** | Feature maps, operation safeguards |
| **Matrix grid (2×2)** | Security and operations safeguards |
| **Z-pattern / waterfall** | User journey and batch queue flow |
| **Center-radiating** | Capability map and architecture center concept |
| **Negative-space-driven** | Boundary principles and roadmap conclusion |

### Spacing Specification

**Universal**:

| Element | Recommended Range | Current Project |
| ------- | ---------------- | --------------- |
| Safe margin from canvas edge | 40-60px | 56px |
| Content block gap | 24-40px | 28px |
| Icon-text gap | 8-16px | 12px |

**Card-based layouts**:

| Element | Recommended Range | Current Project |
| ------- | ---------------- | --------------- |
| Card gap | 20-32px | 22px |
| Card padding | 20-32px | 24px |
| Card border radius | 8-16px | 12px |
| Single-row card height | 530-600px | 540px |
| Double-row card height | 265-295px each | 260-280px |
| Three-column card width | 360-380px each | 356px |

**Non-card containers**:

- Use whitespace, dividers, and section bands rather than nested cards.
- Line-height: 1.45× body font size.
- Large diagrams should keep all labels editable as SVG text.

---

## VI. Icon Usage Specification

### Source

- **Built-in icon library**: `tabler-outline`
- **Stroke width**: `2`
- **Usage method**: SVG placeholder `<use data-icon="tabler-outline/icon-name" .../>`

### Recommended Icon List

| Purpose | Icon Path | Page |
| ------- | --------- | ---- |
| Clinical context | `tabler-outline/stethoscope` | P01, P02 |
| Project target | `tabler-outline/target` | P02 |
| Capability route | `tabler-outline/route` | P03 |
| Multimodal AI | `tabler-outline/brain` | P04 |
| Signal / inference | `tabler-outline/activity-heartbeat` | P05 |
| Medical report | `tabler-outline/report-medical` | P07 |
| Backend service | `tabler-outline/server` | P08 |
| Database | `tabler-outline/database` | P08 |
| Security | `tabler-outline/shield-check` | P10 |
| Risk boundary | `tabler-outline/alert-circle` | P11 |
| Users / stakeholders | `tabler-outline/users` | P03 |
| Checklist | `tabler-outline/checklist` | P10 |
| Metrics / chart | `tabler-outline/chart-infographic` | P09 |
| CPU inference | `tabler-outline/cpu` | P09 |
| Deployment | `tabler-outline/cloud` | P09 |
| Export file | `tabler-outline/file-report` | P07 |
| Medical cross | `tabler-outline/medical-cross` | P06 |
| Presentation / roadmap | `tabler-outline/presentation` | P12 |

---

## VII. Visualization Reference List (if needed)

No chart-library template is required. All visualizations are custom SVG diagrams to keep the deck editable and aligned with the specific product architecture.

**Runners-up considered**:

- `timeline_horizontal` | rejected for P05/P06 because the deck needs mixed clinical + system states rather than a simple dated sequence.
- `architecture_layers` | rejected for P08 because the project architecture includes queue, model, storage, reports, auth, and frontend interactions that need a custom flow.
- `kpi_cards` | rejected for P09 because deployment conditions are better shown as a compact readiness board with hardware, latency, and backup notes.

---

## VIII. Image Resource List (if needed)

No external images are required. The deck intentionally avoids AI-generated medical imagery. Clinical images, screenshots, or hospital logos can be added later as user-supplied assets if needed.

---

## IX. Content Outline

### Part 1: Why This System Exists

#### Slide 01 - Cover

- **Layout**: Full canvas with subtle medical-technology linework and centered title.
- **Title**: 子宫超声辅助诊断系统
- **Subtitle**: 多模态 AI 支撑妇科超声的患者级风险提示与复核闭环
- **Info**: 项目汇报 · 2026-06-10

#### Slide 02 - Clinical Background & Goal

- **Layout**: Symmetric split with clinical pain points on the left and system goals on the right.
- **Title**: 从单张影像判断，走向患者级辅助决策
- **Core message**: 系统目标不是替代医生，而是把多图、多文本、可解释和可追溯能力接入真实超声流程。
- **Content**:
  - 临床输入天然包含多张切面图像与检查文字。
  - 输出需要从单图概率上升到患者级诊断参考。
  - 医生需要热力图、报告和历史记录来支持复核。
  - 现场单例推理必须优先于后台批量任务。

### Part 2: What The Product Does

#### Slide 03 - Capability Map

- **Layout**: Center-radiating capability map.
- **Title**: 一个系统覆盖“上传、推理、解释、报告、运维”闭环
- **Core message**: 项目价值来自模型能力与临床工作流的结合，而不是单一分类器。
- **Content**:
  - 单例推理：1-30 张图像，患者级聚合。
  - 批量推理：ZIP + manifest.csv，异步排队。
  - 结果解释：逐图预测 + Grad-CAM。
  - 病例闭环：历史检索、医生判断、PDF 报告。
  - 管理保障：认证、审计、指标、备份。

#### Slide 04 - V2 Multimodal Model

- **Layout**: Asymmetric architecture diagram: image/text encoders → gated fusion → classifier.
- **Title**: V2 模型以图像为主导融合医学文本上下文
- **Core message**: EfficientNet-B3 与医学 BERT 的门控融合，让系统同时利用影像形态和检查描述。
- **Content**:
  - 图像编码器：EfficientNet-B3，1536 维特征。
  - 文本编码器：阿里医学 BERT，768 维 CLS。
  - 融合模块：ImageDominantGatedFusion，256 维隐层。
  - 分类器：512 → 256 → 3，输出三类 softmax。
  - 训练规模：10,587 例患者 / 196,255 张图像。
  - 推理权重：Fold 3 EMA，pat_acc = 0.8600。

#### Slide 05 - Single-Case Inference Flow

- **Layout**: Top-bottom pipeline with six connected stations.
- **Title**: 单例推理围绕医生现场操作保持低等待感
- **Core message**: 任务提交后异步处理，前端持续反馈队列和运行状态，完成后回到病例详情。
- **Content**:
  - 输入：病例编号、检查方式、1-30 张图像、检查所见。
  - 提交：idempotency_key 避免重复病例。
  - 任务：返回 202 + task_id，前端轮询状态。
  - 推理：逐图分析，再进行患者级聚合。
  - 输出：概率分布、最终分类、Grad-CAM、医生判断入口。

#### Slide 06 - Batch & Priority Queue

- **Layout**: Z-pattern / waterfall from ZIP upload to patient list to per-image detail.
- **Title**: 批量任务可以跑在后台，单例任务仍然优先响应
- **Core message**: 优先级队列把临床交互和后台处理解耦，避免批量任务占满推理资源。
- **Content**:
  - 批量输入：ZIP + manifest.csv + 患者子目录。
  - 单例任务 priority = 0，批量任务 priority = 5。
  - 后台 worker 串行调用模型，保证推理安全。
  - 批量历史展示分类汇总、患者列表和逐图详情。

#### Slide 07 - Explainability & Reporting

- **Layout**: Three-stage report ribbon: prediction → explanation → report.
- **Title**: 结果解释与报告让 AI 输出进入可复核流程
- **Core message**: 模型输出以风险提示和复核参考形式呈现，并保留医生判断入口。
- **Content**:
  - 患者级聚合诊断：正常、内膜癌、息肉概率。
  - 逐图预测：保留每张图像的分类与置信度。
  - Grad-CAM：展示模型关注区域。
  - PDF 报告：生成中文诊断报告，便于归档和沟通。

### Part 3: How It Is Built And Operated

#### Slide 08 - Technical Architecture

- **Layout**: Layered architecture diagram from frontend to API, queue, model, database, files.
- **Title**: 前后端、任务队列、模型服务共同支撑临床闭环
- **Core message**: 工程架构围绕可部署、可追踪、可恢复的医院场景设计。
- **Content**:
  - Frontend：React 19 + TypeScript + Vite + React Query。
  - Backend：FastAPI + SQLAlchemy + SQLite WAL。
  - AI：PyTorch CPU 推理 + EfficientNet-B3 + 医学 BERT。
  - Storage：uploads、gradcam、previews、batch、SQLite。
  - Operations：结构化日志、request_id、健康检查、指标接口。

#### Slide 09 - Data, Performance & Deployment

- **Layout**: Readiness board with four KPI blocks and a deployment mini-flow.
- **Title**: 生产部署关注模型资源、推理时延和备份恢复
- **Core message**: 当前方案能在常规 CPU 服务器上运行，但需要明确模型权重、内存、备份和 HTTPS 配置。
- **Content**:
  - 硬件：最低 4 核 / 8 GB / 50 GB SSD，推荐 8 核+ / 16 GB / 200 GB。
  - 模型加载：EfficientNet-B3 + BERT 约 2 GB 内存。
  - 推理性能：CPU 推理约 1.2 秒每图。
  - 部署：Linux systemd / Windows NSSM，Nginx 可选 HTTPS。
  - 备份：SQLite 热备 + uploads 增量 rsync，保留 30 天。

#### Slide 10 - Security, Audit & Operations

- **Layout**: 2×2 operations matrix.
- **Title**: 权限、审计、日志和恢复构成上线后的安全网
- **Core message**: 临床系统不仅要能推理，还要能解释“谁在何时做了什么”和“故障时如何恢复”。
- **Content**:
  - 认证：bcrypt、HttpOnly、SameSite、失败锁定、强制改密。
  - 审计：登录、登出、创建病例、用户管理、CSV 导出。
  - 可观测：structlog JSON、request_id、/api/health、/api/metrics。
  - 运维：backup.sh、恢复演练、systemd / journalctl 故障排查。

### Part 4: Boundaries And Next Steps

#### Slide 11 - Clinical Boundary

- **Layout**: Negative-space-driven principle page with three boundary statements.
- **Title**: AI 输出是风险提示，不是最终诊断结论
- **Core message**: 项目必须把“辅助诊断”边界写进产品表达和临床使用流程。
- **Content**:
  - 使用“预测概率”“风险提示”“复核参考”等表述。
  - 避免“确诊”“替代医生”“自动诊断”等绝对化措辞。
  - 医生判断、病理结果和临床流程仍是最终依据。
  - 需要持续监控数据漂移、异常病例和模型误差。

#### Slide 12 - Roadmap

- **Layout**: Three-horizon roadmap with near / mid / long term.
- **Title**: 下一步从可用系统走向可验证、可集成、可持续改进
- **Core message**: 后续演进应聚焦临床验证、系统集成和模型治理，而不是只增加页面功能。
- **Content**:
  - 近期：完善真实病例验证、界面细节、报告模板和部署文档。
  - 中期：接入院内账号、影像系统或数据归档流程。
  - 长期：模型版本治理、质控面板、更多病种或多中心验证。

---

## X. Speaker Notes Requirements

One speaker note file per page, saved to `notes/`:

- **Filename**: match SVG name, e.g. `01_cover.md`.
- **Content**: Chinese presenter notes with key points, timing cues, and transition phrases.

---

## XI. Technical Constraints Reminder

### SVG Generation Must Follow:

1. viewBox: `0 0 1280 720`
2. Background uses `<rect>` elements
3. Text wrapping uses `<tspan>`; `<foreignObject>` forbidden
4. Transparency uses `fill-opacity` / `stroke-opacity`; `rgba()` forbidden
5. Forbidden: `mask`, `<style>`, `class`, `<foreignObject>`
6. Forbidden: `textPath`, `animate*`, `script`
7. Text characters use raw Unicode where allowed; XML reserved characters must be escaped
8. `marker-end` allowed only through PPT-safe `<marker>` definitions when needed
9. `clipPath` only on `<image>` elements, not used in this no-image deck

### PPT Compatibility Rules:

- Group opacity forbidden; set opacity on each child element individually.
- Inline styles only; external CSS and `@font-face` forbidden.
- Icons use the approved `tabler-outline` placeholders only.
