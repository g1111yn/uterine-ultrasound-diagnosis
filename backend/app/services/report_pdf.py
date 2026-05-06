import io
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

from app.config import DATA_DIR
from app.models.schemas import CLASS_ZH

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

FONT = "STSong-Light"
COLOR_PRIMARY = HexColor("#1a1a2e")
COLOR_ACCENT = HexColor("#2563eb")
COLOR_BORDER = HexColor("#d1d5db")

STYLE_TITLE = ParagraphStyle("title", fontName=FONT, fontSize=18, leading=24, textColor=COLOR_PRIMARY, alignment=1)
STYLE_SUBTITLE = ParagraphStyle("subtitle", fontName=FONT, fontSize=10, leading=14, textColor=HexColor("#6b7280"), alignment=1)
STYLE_SECTION = ParagraphStyle("section", fontName=FONT, fontSize=12, leading=16, textColor=COLOR_ACCENT, spaceBefore=12, spaceAfter=6)
STYLE_BODY = ParagraphStyle("body", fontName=FONT, fontSize=10, leading=14, textColor=COLOR_PRIMARY)
STYLE_LABEL = ParagraphStyle("label", fontName=FONT, fontSize=9, leading=12, textColor=HexColor("#6b7280"))
STYLE_VALUE = ParagraphStyle("value", fontName=FONT, fontSize=10, leading=14, textColor=COLOR_PRIMARY)
STYLE_SMALL = ParagraphStyle("small", fontName=FONT, fontSize=8, leading=10, textColor=HexColor("#9ca3af"), alignment=1)

RECOMMENDATION_ZH = {
    "none": "无",
    "followup": "随访观察",
    "biopsy": "活检",
    "surgery": "手术",
    "other": "其他",
}


def _info_table(rows: list[tuple[str, str]]) -> Table:
    data = []
    for label, value in rows:
        data.append([
            Paragraph(label, STYLE_LABEL),
            Paragraph(value, STYLE_VALUE),
        ])
    t = Table(data, colWidths=[80, 380])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]))
    return t


def _prob_bar_table(probs: dict[str, float]) -> Table:
    labels = {"normal": "子宫正常大", "endometrial_cancer": "子宫内膜癌", "polyp": "息肉"}
    data = []
    for key in ["normal", "endometrial_cancer", "polyp"]:
        val = probs.get(key, 0)
        pct = f"{val * 100:.1f}%"
        data.append([
            Paragraph(labels[key], STYLE_LABEL),
            Paragraph(pct, STYLE_VALUE),
        ])
    t = Table(data, colWidths=[120, 80])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _try_image(path: Path, width: float, height: float):
    if path.exists():
        try:
            return RLImage(str(path), width=width, height=height)
        except Exception:
            pass
    return Paragraph(f"[图片不可用: {path.name}]", STYLE_BODY)


def _fmt_dt(val) -> str:
    if not val:
        return "—"
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d %H:%M")
    return str(val)


def generate_report_pdf(case, prediction, judgment) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    story = []

    story.append(Paragraph("子宫超声辅助诊断报告", STYLE_TITLE))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Uterine Ultrasound AI-Assisted Diagnosis Report", STYLE_SUBTITLE))
    story.append(Spacer(1, 8 * mm))

    # Basic info
    story.append(Paragraph("基本信息", STYLE_SECTION))
    info_rows = [
        ("病例编号", case.case_id),
        ("患者编号", case.patient_no or "—"),
        ("检查日期", _fmt_dt(case.created_at)),
        ("医生", case.doctor_id or "—"),
    ]
    if case.clinical_text:
        info_rows.append(("临床信息", case.clinical_text))
    story.append(_info_table(info_rows))
    story.append(Spacer(1, 6 * mm))

    # Images
    story.append(Paragraph("超声图像", STYLE_SECTION))
    img_path = DATA_DIR / case.image_path
    original = _try_image(img_path, 70 * mm, 70 * mm)

    if prediction and prediction.gradcam_path:
        gradcam_path = DATA_DIR / prediction.gradcam_path
        gradcam = _try_image(gradcam_path, 70 * mm, 70 * mm)
        img_row = Table(
            [[original, Spacer(5 * mm, 0), gradcam]],
            colWidths=[70 * mm, 5 * mm, 70 * mm],
        )
        img_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story.append(img_row)
        caption = Table(
            [[Paragraph("原始超声图像", STYLE_SMALL), Spacer(5 * mm, 0), Paragraph("Grad-CAM 热图", STYLE_SMALL)]],
            colWidths=[70 * mm, 5 * mm, 70 * mm],
        )
        story.append(caption)
    else:
        story.append(original)
        story.append(Paragraph("原始超声图像", STYLE_SMALL))

    story.append(Spacer(1, 6 * mm))

    # Prediction
    if prediction:
        story.append(Paragraph("AI 预测结果", STYLE_SECTION))
        pred_class_zh = CLASS_ZH.get(prediction.predicted_class, prediction.predicted_class)
        pred_rows = [
            ("预测分类", pred_class_zh),
            ("置信度", f"{prediction.confidence * 100:.1f}%"),
            ("模型版本", prediction.model_version),
            ("推理耗时", f"{prediction.inference_ms} ms"),
        ]
        story.append(_info_table(pred_rows))
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("分类概率分布", STYLE_LABEL))
        story.append(Spacer(1, 2 * mm))
        probs = {
            "normal": prediction.prob_normal,
            "endometrial_cancer": prediction.prob_cancer,
            "polyp": prediction.prob_polyp,
        }
        story.append(_prob_bar_table(probs))
        story.append(Spacer(1, 6 * mm))

    # Judgment
    story.append(Paragraph("医生判断", STYLE_SECTION))
    if judgment:
        final_zh = CLASS_ZH.get(judgment.final_class, judgment.final_class)
        rec_zh = RECOMMENDATION_ZH.get(judgment.recommendation, judgment.recommendation)
        judg_rows = [
            ("最终诊断", final_zh),
            ("处置建议", rec_zh),
            ("判断时间", _fmt_dt(judgment.judged_at)),
            ("医生", judgment.doctor_id or "—"),
        ]
        if judgment.note:
            judg_rows.append(("备注", judgment.note))
        story.append(_info_table(judg_rows))
    else:
        story.append(Paragraph("尚未提交医生判断", STYLE_BODY))

    # Signature
    story.append(Spacer(1, 20 * mm))
    sign_data = [
        [Paragraph("诊断医生签名：", STYLE_BODY), Paragraph("日期：", STYLE_BODY)],
        [Paragraph("_" * 30, STYLE_BODY), Paragraph("_" * 20, STYLE_BODY)],
    ]
    sign_table = Table(sign_data, colWidths=[250, 210])
    sign_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sign_table)

    # Disclaimer
    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "本报告由子宫超声辅助诊断系统生成，AI 预测结果仅供参考，最终诊断以医生判断为准。",
        STYLE_SMALL,
    ))

    doc.build(story)
    return buf.getvalue()
