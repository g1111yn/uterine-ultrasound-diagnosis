import io
from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage,
    PageBreak,
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

STRATEGY_ZH = {
    "mean": "平均",
    "max_severity": "最严重优先",
    "majority_vote": "多数投票",
}


def _info_table(rows: list[tuple[str, str]]) -> Table:
    data = [[Paragraph(label, STYLE_LABEL), Paragraph(value, STYLE_VALUE)] for label, value in rows]
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
    for key in ("normal", "endometrial_cancer", "polyp"):
        val = probs.get(key, 0)
        data.append([
            Paragraph(labels[key], STYLE_LABEL),
            Paragraph(f"{val * 100:.1f}%", STYLE_VALUE),
        ])
    t = Table(data, colWidths=[120, 80])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _image_source_path(img) -> Path:
    """Return the path the PDF should render for this CaseImage.

    DICOM files aren't renderable by reportlab; fall back to the PNG preview.
    """
    if img.image_format == "dcm" and img.preview_path:
        p = DATA_DIR / img.preview_path
        if p.exists():
            return p
    return DATA_DIR / img.image_path


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


def generate_report_pdf(case, prediction, judgment, images=None) -> bytes:
    """Render the patient-level report.

    Parameters
    ----------
    case       : Case ORM instance
    prediction : Prediction (aggregated) or None
    judgment   : Judgment or None
    images     : ordered list of CaseImage (with per_image_prediction)
    """
    images = images or []
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

    story.append(Paragraph("基本信息", STYLE_SECTION))
    info_rows = [
        ("病例编号", case.case_id),
        ("患者编号", case.patient_no or "—"),
        ("检查日期", _fmt_dt(case.created_at)),
        ("医生", case.doctor_id or "—"),
        ("图像张数", str(len(images))),
    ]
    if case.check_project:
        info_rows.append(("检查方式", case.check_project))
    if case.clinical_text:
        info_rows.append(("检查所见", case.clinical_text))
    story.append(_info_table(info_rows))
    story.append(Spacer(1, 6 * mm))

    # Patient-level prediction
    if prediction:
        story.append(Paragraph("AI 病人级综合预测", STYLE_SECTION))
        pred_rows = [
            ("预测分类", CLASS_ZH.get(prediction.predicted_class, prediction.predicted_class)),
            ("置信度", f"{prediction.confidence * 100:.1f}%"),
            ("聚合策略", STRATEGY_ZH.get(prediction.aggregation_strategy, prediction.aggregation_strategy)),
            ("参与图数", str(prediction.image_count)),
            ("模型版本", prediction.model_version),
        ]
        story.append(_info_table(pred_rows))
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("病人级概率分布", STYLE_LABEL))
        story.append(Spacer(1, 2 * mm))
        story.append(_prob_bar_table({
            "normal": prediction.prob_normal,
            "endometrial_cancer": prediction.prob_cancer,
            "polyp": prediction.prob_polyp,
        }))
        story.append(Spacer(1, 6 * mm))

    # Per-image section
    if images:
        story.append(Paragraph("各图像明细", STYLE_SECTION))
        for img in images:
            pip = img.per_image_prediction
            original = _try_image(_image_source_path(img), 70 * mm, 70 * mm)
            if pip and pip.gradcam_path:
                grad = _try_image(DATA_DIR / pip.gradcam_path, 70 * mm, 70 * mm)
                img_row = Table(
                    [[original, Spacer(5 * mm, 0), grad]],
                    colWidths=[70 * mm, 5 * mm, 70 * mm],
                )
                img_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
                caption = Table(
                    [[Paragraph(f"图 {img.sequence} · 原图", STYLE_SMALL),
                      Spacer(5 * mm, 0),
                      Paragraph(f"图 {img.sequence} · Grad-CAM", STYLE_SMALL)]],
                    colWidths=[70 * mm, 5 * mm, 70 * mm],
                )
                story.append(img_row)
                story.append(caption)
            else:
                story.append(original)
                story.append(Paragraph(f"图 {img.sequence}", STYLE_SMALL))

            if pip:
                story.append(Spacer(1, 3 * mm))
                story.append(_info_table([
                    ("预测分类", CLASS_ZH.get(pip.predicted_class, pip.predicted_class)),
                    ("置信度", f"{pip.confidence * 100:.1f}%"),
                    ("推理耗时", f"{pip.inference_ms} ms"),
                ]))
                story.append(_prob_bar_table({
                    "normal": pip.prob_normal,
                    "endometrial_cancer": pip.prob_cancer,
                    "polyp": pip.prob_polyp,
                }))
            story.append(Spacer(1, 6 * mm))

    # Judgment
    story.append(Paragraph("医生判断", STYLE_SECTION))
    if judgment:
        judg_rows = [
            ("最终诊断", CLASS_ZH.get(judgment.final_class, judgment.final_class)),
            ("处置建议", RECOMMENDATION_ZH.get(judgment.recommendation, judgment.recommendation)),
            ("判断时间", _fmt_dt(judgment.judged_at)),
            ("医生", judgment.doctor_id or "—"),
        ]
        if judgment.note:
            judg_rows.append(("备注", judgment.note))
        story.append(_info_table(judg_rows))
    else:
        story.append(Paragraph("尚未提交医生判断", STYLE_BODY))

    story.append(Spacer(1, 20 * mm))
    sign_table = Table(
        [[Paragraph("诊断医生签名：", STYLE_BODY), Paragraph("日期：", STYLE_BODY)],
         [Paragraph("_" * 30, STYLE_BODY), Paragraph("_" * 20, STYLE_BODY)]],
        colWidths=[250, 210],
    )
    sign_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sign_table)

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "本报告由子宫超声辅助诊断系统生成，AI 预测结果仅供参考，最终诊断以医生判断为准。",
        STYLE_SMALL,
    ))

    doc.build(story)
    return buf.getvalue()
