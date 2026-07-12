from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Wedge


OUT = Path(__file__).resolve().parent

COL = {
    "bg": "#FFFFFF",
    "paper": "#F7FAF9",
    "primary": "#00796B",
    "primary_soft": "#DCEDEA",
    "text": "#1F2933",
    "muted": "#64748B",
    "line": "#A9B7B3",
    "red": "#B64342",
    "red_soft": "#F4D9D7",
    "blue": "#0F4D92",
    "blue_soft": "#DDE9F5",
    "gold": "#D08A24",
    "gold_soft": "#F4E3C8",
}


plt.rcParams.update(
    {
        "font.family": "sans-serif",
        "font.sans-serif": [
            "PingFang SC",
            "Hiragino Sans GB",
            "Arial Unicode MS",
            "Heiti TC",
            "DejaVu Sans",
            "sans-serif",
        ],
        "svg.fonttype": "none",
        "pdf.fonttype": 42,
        "font.size": 9,
        "axes.linewidth": 0.8,
    }
)


def box(ax, x, y, w, h, label, sub="", fc=None, ec=None, fontsize=9.4, subsize=6.9):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.012,rounding_size=0.030",
        facecolor=fc or "#FFFFFF",
        edgecolor=ec or COL["line"],
        linewidth=1.35,
    )
    ax.add_patch(patch)
    ax.text(
        x + w / 2,
        y + h * 0.60,
        label,
        ha="center",
        va="center",
        color=COL["text"],
        fontsize=fontsize,
        weight="bold",
    )
    if sub:
        ax.text(
            x + w / 2,
            y + h * 0.31,
            sub,
            ha="center",
            va="center",
            color=COL["muted"],
            fontsize=subsize,
        )
    return patch


def arrow(ax, start, end, color=None, rad=0.0, lw=1.55, ms=11):
    patch = FancyArrowPatch(
        start,
        end,
        arrowstyle="-|>",
        mutation_scale=ms,
        linewidth=lw,
        color=color or COL["primary"],
        connectionstyle=f"arc3,rad={rad}",
        shrinkA=5,
        shrinkB=5,
    )
    ax.add_patch(patch)
    return patch


def main():
    fig, ax = plt.subplots(figsize=(12, 4.2), dpi=220)
    fig.patch.set_facecolor(COL["bg"])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    ax.text(0.026, 0.93, "c", fontsize=15, weight="bold", color=COL["text"])
    ax.text(0.064, 0.93, "临床解释与治理闭环", fontsize=14, weight="bold", color=COL["text"], va="center")
    ax.text(
        0.064,
        0.875,
        "模型概率只有进入解释、报告、审计和运维链路后，才形成可复核的临床价值。",
        fontsize=8.8,
        color=COL["muted"],
        va="center",
    )

    cx, cy = 0.50, 0.48
    segments = [
        (116, 176, COL["blue_soft"], "上传", "DICOM / 图像"),
        (42, 102, COL["primary_soft"], "V2 模型", "三类概率"),
        (-28, 32, COL["gold_soft"], "Grad-CAM", "关注区域"),
        (-102, -42, COL["red_soft"], "医生判断", "最终建议"),
        (-176, -116, "#EEF2F7", "报告", "PDF + 历史"),
    ]
    radius = 0.285
    for a1, a2, color, label, sub in segments:
        wedge = Wedge((cx, cy), radius, a1, a2, width=0.074, facecolor=color, edgecolor="#FFFFFF", linewidth=2.0)
        ax.add_patch(wedge)
        amid = (a1 + a2) / 2
        import math

        tx = cx + radius * 0.82 * math.cos(math.radians(amid))
        ty = cy + radius * 0.82 * math.sin(math.radians(amid))
        ax.text(tx, ty + 0.017, label, ha="center", va="center", fontsize=8.7, weight="bold", color=COL["text"])
        ax.text(tx, ty - 0.018, sub, ha="center", va="center", fontsize=6.9, color=COL["muted"])

    ax.add_patch(Circle((cx, cy), 0.128, facecolor="#FFFFFF", edgecolor=COL["line"], linewidth=1.35))
    ax.text(cx, cy + 0.032, "患者级结果", ha="center", va="center", fontsize=11, weight="bold", color=COL["text"])
    ax.text(cx, cy - 0.021, "逐图预测聚合", ha="center", va="center", fontsize=8.2, color=COL["muted"])

    # Heatmap focus behind the center.
    ax.add_patch(Circle((cx - 0.020, cy + 0.004), 0.086, facecolor="#F7D75A", edgecolor="none", alpha=0.46))
    ax.add_patch(Circle((cx + 0.030, cy - 0.010), 0.065, facecolor=COL["red"], edgecolor="none", alpha=0.23))

    box(ax, 0.075, 0.55, 0.205, 0.13, "审计留痕", "登录 / 建档 / 用户管理", ec=COL["primary"])
    box(ax, 0.075, 0.25, 0.205, 0.13, "报告闭环", "医生判断 + PDF 导出", ec=COL["primary"])
    box(ax, 0.720, 0.55, 0.205, 0.13, "热图解释", "原图 / Grad-CAM 对照", ec=COL["blue"])
    box(ax, 0.720, 0.25, 0.205, 0.13, "检索与运维", "历史筛选 + health / metrics", ec=COL["blue"])

    arrow(ax, (0.280, 0.615), (0.380, 0.570), COL["primary"], rad=-0.18)
    arrow(ax, (0.720, 0.615), (0.620, 0.570), COL["blue"], rad=0.18)
    arrow(ax, (0.280, 0.315), (0.382, 0.402), COL["primary"], rad=0.18)
    arrow(ax, (0.720, 0.315), (0.620, 0.402), COL["blue"], rad=-0.18)

    ax.plot([0.14, 0.86], [0.128, 0.128], color=COL["line"], linewidth=1.1, linestyle=(0, (4, 3)))
    chain = [
        (0.19, "cases"),
        (0.32, "case_images"),
        (0.49, "per_image_predictions"),
        (0.67, "predictions / judgments"),
        (0.82, "audit_logs"),
    ]
    for x, label in chain:
        ax.add_patch(Circle((x, 0.128), 0.012, facecolor=COL["primary"], edgecolor="#FFFFFF", linewidth=0.8))
        ax.text(x, 0.082, label, ha="center", va="center", fontsize=6.9, color=COL["muted"])

    ax.text(
        0.50,
        0.030,
        "SQLite WAL + busy_timeout + foreign_keys；审计日志使用独立事务，业务回滚也保留操作轨迹。",
        ha="center",
        va="center",
        fontsize=8.2,
        color=COL["muted"],
    )

    fig.savefig(OUT / "fig_clinical_loop.svg", bbox_inches="tight")
    fig.savefig(OUT / "fig_clinical_loop.png", dpi=220, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
