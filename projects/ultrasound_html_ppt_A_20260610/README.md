# 子宫超声辅助诊断系统 HTML PPT

这是一个 4 页静态 HTML PPT，基于项目 README 和关键实现文件整理，采用浅色临床科技风格，并在单页内加入数据流、队列流转、方法脉冲和热图扫描等动态演示。

## 打开方式

推荐用本地静态服务器打开：

```bash
cd /Users/sleepy_gyn/Documents/医院超声诊断项目/projects/ultrasound_html_ppt_A_20260610
python3 -m http.server 58080
```

然后访问：

```text
http://localhost:58080/
```

## 快捷键

- `←` / `→`：翻页
- `S`：演讲者备注
- `T`：切换主题
- `F`：全屏
- `O`：总览

## 页面结构

1. 项目总览：临床场景、核心能力、训练规模、前端界面切片。
2. V2 多模态方法：EfficientNet-B3、医学 BERT、图像主导门控融合。
3. 单例与批量推理：priority queue、task_id 轮询、单 worker 串行推理、聚合策略。
4. 临床闭环与工程保障：Grad-CAM、报告、历史检索、数据库、审计日志和运维指标。

## 验收记录

- 已在 1280 x 720 视口下逐页打开检查。
- 4 页均无页面滚动溢出。
- 三张 Nature 风格 SVG 配图均加载成功。
- 浏览器预览地址：`http://localhost:58080/`
