from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, Circle, Wedge


plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans"]
plt.rcParams["svg.fonttype"] = "none"
plt.rcParams["pdf.fonttype"] = 42
plt.rcParams["font.size"] = 9


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


def setup_fig(width=12.0, height=4.2):
    fig, ax = plt.subplots(figsize=(width, height), dpi=200)
    fig.patch.set_facecolor(COL["bg"])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, label, sub="", fc=None, ec=None, lw=1.3, r=0.035,
        color=None, fontsize=10, subsize=7.3):
    fc = fc or COL["paper"]
    ec = ec or COL["line"]
    color = color or COL["text"]
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.012,rounding_size={r}",
        facecolor=fc,
        edgecolor=ec,
        linewidth=lw,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h * 0.57, label, ha="center", va="center",
            color=color, fontsize=fontsize, weight="bold")
    if sub:
        ax.text(x + w / 2, y + h * 0.29, sub, ha="center", va="center",
                color=COL["muted"], fontsize=subsize)
    return patch


def arrow(ax, xy1, xy2, color=None, lw=1.5, rad=0.0, ms=11):
    arr = FancyArrowPatch(
        xy1, xy2,
        arrowstyle="-|>",
        mutation_scale=ms,
        linewidth=lw,
        color=color or COL["primary"],
        connectionstyle=f"arc3,rad={rad}",
        shrinkA=4,
        shrinkB=4,
    )
    ax.add_patch(arr)
    return arr


def save(fig, stem):
    for ext in ("svg", "pdf"):
        fig.savefig(OUT / f"{stem}.{ext}")
    fig.savefig(OUT / f"{stem}.png", dpi=220)
    fig.savefig(OUT / f"{stem}.tiff", dpi=600)
    plt.close(fig)


def model_fusion():
    fig, ax = setup_fig()
    ax.text(0.025, 0.94, "a", fontsize=15, weight="bold", color=COL["text"])
    ax.text(0.065, 0.94, "V2 multimodal inference architecture",
            fontsize=13, weight="bold", color=COL["text"], va="center")
    ax.text(0.065, 0.885, "Image-dominant gated fusion keeps ultrasound evidence primary while incorporating exam text.",
            fontsize=8.6, color=COL["muted"], va="center")

    box(ax, 0.055, 0.62, 0.145, 0.15, "US images", "JPEG/PNG/DICOM", fc=COL["blue_soft"], ec=COL["blue"])
    box(ax, 0.055, 0.30, 0.145, 0.15, "Clinical text", "project + findings", fc=COL["primary_soft"], ec=COL["primary"])
    box(ax, 0.255, 0.62, 0.165, 0.15, "EfficientNet-B3", "1536-d image vector", fc="#FFFFFF", ec=COL["blue"])
    box(ax, 0.255, 0.30, 0.165, 0.15, "Medical BERT", "768-d CLS vector", fc="#FFFFFF", ec=COL["primary"])
    box(ax, 0.475, 0.62, 0.145, 0.15, "Image proj", "256-d hidden", fc="#FFFFFF", ec=COL["line"])
    box(ax, 0.475, 0.30, 0.145, 0.15, "Text proj", "256-d hidden", fc="#FFFFFF", ec=COL["line"])

    gate = Circle((0.70, 0.54), 0.082, facecolor=COL["gold_soft"], edgecolor=COL["gold"], linewidth=1.4)
    ax.add_patch(gate)
    ax.text(0.70, 0.56, "gate", ha="center", va="center", fontsize=11, weight="bold", color=COL["text"])
    ax.text(0.70, 0.50, "g in [0,1]", ha="center", va="center", fontsize=7.8, color=COL["muted"])
    ax.text(0.70, 0.39, "g·image + (1-g)·text", ha="center", va="center", fontsize=8.1, color=COL["gold"])

    box(ax, 0.800, 0.49, 0.145, 0.17, "Classifier", "512 -> 256 -> 3", fc=COL["red_soft"], ec=COL["red"])
    box(ax, 0.805, 0.19, 0.15, 0.18, "Patient risk", "normal / cancer / polyp", fc="#FFFFFF", ec=COL["red"])

    arrow(ax, (0.200, 0.695), (0.255, 0.695), COL["blue"])
    arrow(ax, (0.200, 0.375), (0.255, 0.375), COL["primary"])
    arrow(ax, (0.420, 0.695), (0.475, 0.695), COL["blue"])
    arrow(ax, (0.420, 0.375), (0.475, 0.375), COL["primary"])
    arrow(ax, (0.620, 0.695), (0.640, 0.585), COL["blue"], rad=-0.08)
    arrow(ax, (0.620, 0.375), (0.640, 0.500), COL["primary"], rad=0.08)
    arrow(ax, (0.760, 0.545), (0.800, 0.575), COL["gold"])
    arrow(ax, (0.875, 0.49), (0.880, 0.37), COL["red"])

    ax.plot([0.55, 0.80], [0.695, 0.695], color=COL["line"], lw=1.0, ls=(0, (4, 3)))
    ax.text(0.675, 0.725, "image feature retained", ha="center", fontsize=7.4, color=COL["muted"])
    ax.text(0.055, 0.10, "Training scale: 10,587 patients / 196,255 images | 5-fold CV | Fold 3 EMA pat_acc=0.8600",
            fontsize=8.0, color=COL["muted"])
    save(fig, "fig_model_fusion")


def inference_workflow():
    fig, ax = setup_fig()
    ax.text(0.025, 0.94, "b", fontsize=15, weight="bold", color=COL["text"])
    ax.text(0.065, 0.94, "Asynchronous patient-level inference workflow",
            fontsize=13, weight="bold", color=COL["text"], va="center")
    ax.text(0.065, 0.885, "Single-case tasks preempt batch jobs, while all model calls remain serialized for stability.",
            fontsize=8.6, color=COL["muted"], va="center")

    box(ax, 0.055, 0.62, 0.16, 0.15, "Single case", "1-30 images", fc=COL["blue_soft"], ec=COL["blue"])
    box(ax, 0.055, 0.30, 0.16, 0.15, "Batch ZIP", "manifest + folders", fc=COL["primary_soft"], ec=COL["primary"])
    box(ax, 0.285, 0.49, 0.18, 0.19, "Priority queue", "single=0 | batch=5", fc="#FFFFFF", ec=COL["gold"])
    box(ax, 0.535, 0.49, 0.17, 0.19, "Per-image V2", "serialized worker", fc="#FFFFFF", ec=COL["blue"])
    box(ax, 0.770, 0.49, 0.17, 0.19, "Aggregation", "mean / severity / vote", fc="#FFFFFF", ec=COL["red"])
    box(ax, 0.770, 0.18, 0.17, 0.17, "Case detail", "probability + heatmap", fc=COL["red_soft"], ec=COL["red"])

    arrow(ax, (0.215, 0.695), (0.285, 0.61), COL["blue"], rad=-0.08)
    arrow(ax, (0.215, 0.375), (0.285, 0.54), COL["primary"], rad=0.08)
    arrow(ax, (0.465, 0.585), (0.535, 0.585), COL["gold"])
    arrow(ax, (0.705, 0.585), (0.770, 0.585), COL["blue"])
    arrow(ax, (0.855, 0.49), (0.855, 0.35), COL["red"])

    ax.plot([0.17, 0.92], [0.105, 0.105], color=COL["line"], lw=1.2)
    dots = [(0.22, "submit 202"), (0.39, "poll task"), (0.57, "per-image done"), (0.74, "aggregate"), (0.90, "read case")]
    for x, lab in dots:
        ax.add_patch(Circle((x, 0.105), 0.014, facecolor=COL["primary"], edgecolor="none"))
        ax.text(x, 0.065, lab, ha="center", va="center", fontsize=7.4, color=COL["muted"])

    for x in [0.565, 0.605, 0.645]:
        ax.add_patch(Circle((x, 0.435), 0.010, facecolor=COL["blue"], edgecolor="none", alpha=0.85))
    ax.text(0.605, 0.405, "N images per patient", ha="center", fontsize=7.2, color=COL["muted"])
    ax.text(0.055, 0.83, "Immediate doctor interaction", fontsize=8.0, color=COL["blue"], weight="bold")
    ax.text(0.055, 0.215, "Long-running cohort processing", fontsize=8.0, color=COL["primary"], weight="bold")
    save(fig, "fig_inference_workflow")


def clinical_loop():
    fig, ax = setup_fig()
    ax.text(0.025, 0.94, "c", fontsize=15, weight="bold", color=COL["text"])
    ax.text(0.065, 0.94, "Clinical interpretation and governance loop",
            fontsize=13, weight="bold", color=COL["text"], va="center")
    ax.text(0.065, 0.885, "Predictions become useful only when paired with explanation, reporting, auditability and operations signals.",
            fontsize=8.6, color=COL["muted"], va="center")

    cx, cy = 0.50, 0.46
    radius = 0.275
    ring_cols = [COL["blue_soft"], COL["primary_soft"], COL["gold_soft"], COL["red_soft"], "#EEF2F7"]
    labels = [
        ("Upload", "DICOM / image"),
        ("V2 model", "3-class risk"),
        ("Grad-CAM", "visual attention"),
        ("Doctor", "final judgment"),
        ("Report", "PDF + history"),
    ]
    angles = [(110, 170), (38, 98), (-34, 26), (-106, -46), (-178, -118)]
    pos = []
    for (a1, a2), col in zip(angles, ring_cols):
        ax.add_patch(Wedge((cx, cy), radius, a1, a2, width=0.072, facecolor=col, edgecolor=COL["bg"], linewidth=2))
        amid = (a1 + a2) / 2
        import math
        pos.append((cx + radius * 0.82 * math.cos(math.radians(amid)),
                    cy + radius * 0.82 * math.sin(math.radians(amid))))
    ax.add_patch(Circle((cx, cy), 0.13, facecolor="#FFFFFF", edgecolor=COL["line"], linewidth=1.3))
    ax.text(cx, cy + 0.025, "Patient-level", ha="center", va="center", fontsize=10.5, weight="bold", color=COL["text"])
    ax.text(cx, cy - 0.030, "decision support", ha="center", va="center", fontsize=8.2, color=COL["muted"])

    for (x, y), (main, sub) in zip(pos, labels):
        ax.text(x, y + 0.017, main, ha="center", va="center", fontsize=8.4, weight="bold", color=COL["text"])
        ax.text(x, y - 0.018, sub, ha="center", va="center", fontsize=6.9, color=COL["muted"])

    box(ax, 0.075, 0.20, 0.20, 0.13, "Security", "bcrypt + HttpOnly cookie", fc="#FFFFFF", ec=COL["primary"], fontsize=9)
    box(ax, 0.075, 0.52, 0.20, 0.13, "Audit trail", "login / case / admin", fc="#FFFFFF", ec=COL["primary"], fontsize=9)
    box(ax, 0.725, 0.52, 0.20, 0.13, "Operations", "health + metrics", fc="#FFFFFF", ec=COL["blue"], fontsize=9)
    box(ax, 0.725, 0.20, 0.20, 0.13, "Search", "date / class / source", fc="#FFFFFF", ec=COL["blue"], fontsize=9)

    arrow(ax, (0.275, 0.575), (0.370, 0.560), COL["primary"], rad=-0.20, ms=10)
    arrow(ax, (0.725, 0.575), (0.630, 0.560), COL["blue"], rad=0.20, ms=10)
    arrow(ax, (0.275, 0.265), (0.370, 0.360), COL["primary"], rad=0.20, ms=10)
    arrow(ax, (0.725, 0.265), (0.630, 0.360), COL["blue"], rad=-0.20, ms=10)
    ax.text(0.50, 0.105, "Clinical value = model probability + explainable evidence + governed workflow",
            ha="center", fontsize=8.4, color=COL["muted"])
    save(fig, "fig_clinical_loop")


if __name__ == "__main__":
    model_fusion()
    inference_workflow()
    clinical_loop()
