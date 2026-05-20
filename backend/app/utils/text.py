"""文本清洗 —— 1:1 复刻训练侧（train_fold.py 数据预处理使用的版本）。

部署清洗规则必须和训练完全一致，否则 BERT 输入分布偏移、模型性能下降。
任何修改都必须先和训练工程师对齐。
"""
from __future__ import annotations

import re


def clean_check_seen(s: str | None) -> str:
    """检查所见清洗：技术规范化，保留所有医学描述。"""
    if s is None:
        return ""
    s = str(s)
    # 去换行符
    s = s.replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
    # 符号规范化
    s = re.sub(r"[×xX]", "*", s)
    s = re.sub(r"[,。;::]", ",", s)
    s = re.sub(r"\s*,\s*", ", ", s)
    # 空白压缩
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_check_project(s: str | None) -> str:
    """检查项目清洗：标准化检查方式名称。"""
    if s is None:
        return ""
    s = str(s)
    s = re.sub(r"彩色", "", s)
    s = re.sub(r"子宫附件超声检查", "超声", s)
    s = re.sub(r"盆腔脏器", "盆腔", s)
    s = re.sub(r"经会阴盆底", "经会阴", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def build_clinical_text(check_project: str | None, check_seen: str | None) -> str:
    """把检查项目 + 检查所见拼成 BERT 输入的完整文本。

    训练时拼接形式：f"{cleaned_project} {cleaned_seen}".strip()
    两段都为空时返回空字符串（推理时会走 768 维零向量）。
    """
    project = clean_check_project(check_project)
    seen = clean_check_seen(check_seen)
    return f"{project} {seen}".strip()
