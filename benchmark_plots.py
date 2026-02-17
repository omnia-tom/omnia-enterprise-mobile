#!/usr/bin/env python3
"""
Hand Tracking Benchmark v2 — Visualization
Plots per-frame time-series data from individual 60s benchmark CSVs.
Each CSV is one scenario run with columns:
  frame, wall_time_s, handler_ms, inference_ms, extract_ms, e2e_ms,
  hands, joints, avg_conf, min_joint_conf, max_joint_conf, avg_jitter_px,
  thermal, battery, memory_mb, frame_interval_ms
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import re

# ─── Config ───────────────────────────────────────────────────────────────────

CSV_DIR = Path.home() / "Downloads"
CSV_FILES = [
    "benchmark_1_CPU_CVPixelBuffer_2H_1771303527.csv",
    "benchmark_2_Auto_CVPixelBuffer_2H_1771303616.csv",
    "benchmark_3_ANE_CVPixelBuffer_2H_1771303694.csv",
    # Skip short GPU run (97 rows), use full one
    "benchmark_4_GPU_CVPixelBuffer_2H_1771303781.csv",
    "benchmark_5_Auto_CGImage_2H_1771303858.csv",
    "benchmark_6_Auto_CVPixelBuffer_1H_1771303943.csv",
    "benchmark_7_CPU_CGImage_1H_1771304006.csv",
]

OUTPUT_DIR = Path(__file__).parent / "benchmark_results"
OUTPUT_DIR.mkdir(exist_ok=True)

# ─── Theme ────────────────────────────────────────────────────────────────────

sns.set_theme(style="darkgrid", rc={
    "figure.facecolor": "#0D0D12",
    "axes.facecolor": "#1C1C23",
    "axes.edgecolor": "#333340",
    "axes.labelcolor": "#F0F0F5",
    "text.color": "#F0F0F5",
    "xtick.color": "#A0A0B0",
    "ytick.color": "#A0A0B0",
    "grid.color": "#2A2A35",
    "legend.facecolor": "#1C1C23",
    "legend.edgecolor": "#333340",
})

SCENARIO_COLORS = {
    1: "#FF453A",   # CPU PB 2H — red
    2: "#30D158",   # Auto PB 2H — green
    3: "#0A84FF",   # ANE PB 2H — blue
    4: "#FF9F0A",   # GPU PB 2H — orange
    5: "#BF5AF2",   # Auto CGImage 2H — purple
    6: "#64D2FF",   # Auto PB 1H — cyan
    7: "#FFD60A",   # CPU CGImage 1H — yellow
}

SCENARIO_LABELS = {
    1: "CPU | PB | 2H",
    2: "Auto | PB | 2H",
    3: "ANE | PB | 2H",
    4: "GPU | PB | 2H",
    5: "Auto | CGI | 2H",
    6: "Auto | PB | 1H",
    7: "CPU | CGI | 1H",
}


# ─── Load ─────────────────────────────────────────────────────────────────────

def parse_scenario_id(filename: str) -> int:
    m = re.match(r"benchmark_(\d+)_", filename)
    return int(m.group(1)) if m else 0


def load_all() -> dict[int, pd.DataFrame]:
    """Load CSVs into dict keyed by scenario id."""
    data = {}
    for f in CSV_FILES:
        path = CSV_DIR / f
        if not path.exists():
            print(f"  WARNING: {path} not found, skipping")
            continue
        sid = parse_scenario_id(f)
        df = pd.read_csv(path)
        df.columns = df.columns.str.strip()
        # Drop first frame (cold-start outlier)
        df = df.iloc[1:].reset_index(drop=True)
        data[sid] = df
        print(f"  Loaded scenario {sid}: {len(df)} frames — {SCENARIO_LABELS.get(sid, f)}")
    return data


# ─── Plot 1: Inference Latency Per Frame (one subplot per scenario) ──────────

def plot_latency_per_frame(data: dict[int, pd.DataFrame]):
    n = len(data)
    cols = 4
    rows = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(22, 5 * rows), sharey=True)
    axes = axes.flatten()

    for i, (sid, df) in enumerate(sorted(data.items())):
        ax = axes[i]
        color = SCENARIO_COLORS[sid]
        label = SCENARIO_LABELS[sid]

        ax.plot(df["wall_time_s"], df["inference_ms"],
                color=color, linewidth=0.5, alpha=0.6)
        # Rolling average
        rolling = df["inference_ms"].rolling(30, center=True).mean()
        ax.plot(df["wall_time_s"], rolling, color=color, linewidth=2, label="30-frame avg")
        # Median line
        med = df["inference_ms"].median()
        ax.axhline(med, color=color, linestyle="--", linewidth=1, alpha=0.6,
                    label=f"p50={med:.1f}ms")

        ax.set_title(label, fontsize=11, fontweight="600", pad=8)
        ax.set_xlabel("Time (s)")
        if i % cols == 0:
            ax.set_ylabel("Inference (ms)")
        ax.legend(fontsize=7, loc="upper right")
        ax.tick_params(labelsize=8)

    # Hide unused axes
    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("Inference Latency Per Frame — 60s Live Tests", fontsize=16, fontweight="700", y=1.01)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "1_latency_per_frame.png", dpi=200, bbox_inches="tight")
    print("  Saved: 1_latency_per_frame.png")
    plt.close(fig)


# ─── Plot 2: Latency Distribution (Violin) ──────────────────────────────────

def plot_latency_distribution(data: dict[int, pd.DataFrame]):
    # Combine into one DataFrame
    frames = []
    for sid, df in sorted(data.items()):
        d = df[["inference_ms"]].copy()
        d["scenario"] = SCENARIO_LABELS[sid]
        d["sid"] = sid
        frames.append(d)
    combined = pd.concat(frames, ignore_index=True)

    order = combined.groupby("scenario")["inference_ms"].median().sort_values().index.tolist()
    palette = [SCENARIO_COLORS[next(s for s, l in SCENARIO_LABELS.items() if l == sc)] for sc in order]

    fig, ax = plt.subplots(figsize=(14, 7))
    sns.violinplot(data=combined, x="scenario", y="inference_ms", order=order,
                   inner="box", linewidth=0.8, palette=palette, alpha=0.8, ax=ax,
                   cut=0, density_norm="width")

    ax.set_xlabel("")
    ax.set_ylabel("Inference Latency (ms)", fontsize=12)
    ax.set_title("Latency Distribution — Sorted by Median", fontsize=16, fontweight="700")
    ax.tick_params(axis="x", rotation=25, labelsize=10)

    for i, label in enumerate(order):
        subset = combined[combined["scenario"] == label]["inference_ms"]
        p95 = np.percentile(subset, 95)
        ax.annotate(f"p95={p95:.1f}", xy=(i, p95), fontsize=8,
                    color="#FF9F0A", ha="center", va="bottom", fontweight="600")

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "2_latency_distribution.png", dpi=200, bbox_inches="tight")
    print("  Saved: 2_latency_distribution.png")
    plt.close(fig)


# ─── Plot 3: E2E Breakdown (Stacked Bar — handler + inference + extract) ─────

def plot_e2e_breakdown(data: dict[int, pd.DataFrame]):
    rows = []
    for sid, df in sorted(data.items()):
        rows.append({
            "scenario": SCENARIO_LABELS[sid],
            "sid": sid,
            "handler_ms": df["handler_ms"].mean(),
            "inference_ms": df["inference_ms"].mean(),
            "extract_ms": df["extract_ms"].mean(),
            "e2e_ms": df["e2e_ms"].mean(),
        })
    agg = pd.DataFrame(rows).sort_values("e2e_ms")

    fig, ax = plt.subplots(figsize=(14, 6))
    x = np.arange(len(agg))

    ax.barh(x, agg["handler_ms"], height=0.6, color="#FF9F0A", label="Handler (PB creation)")
    ax.barh(x, agg["inference_ms"], height=0.6, left=agg["handler_ms"], color="#0A84FF", label="Inference")
    ax.barh(x, agg["extract_ms"], height=0.6,
            left=agg["handler_ms"].values + agg["inference_ms"].values,
            color="#30D158", label="Extract")

    ax.set_yticks(x)
    ax.set_yticklabels(agg["scenario"], fontsize=10)
    ax.set_xlabel("Latency (ms)", fontsize=11)
    ax.set_title("E2E Latency Breakdown — Handler + Inference + Extract", fontsize=14, fontweight="700")
    ax.legend(fontsize=10, loc="lower right")

    # Annotate total E2E
    for i, (_, row) in enumerate(agg.iterrows()):
        ax.annotate(f'{row["e2e_ms"]:.1f}ms', (row["e2e_ms"] + 0.3, i),
                    fontsize=9, va="center", color="#F0F0F5", fontweight="500")

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "3_e2e_breakdown.png", dpi=200, bbox_inches="tight")
    print("  Saved: 3_e2e_breakdown.png")
    plt.close(fig)


# ─── Plot 4: Scenario Comparison Summary (p50/p95/max + FPS) ────────────────

def plot_scenario_comparison(data: dict[int, pd.DataFrame]):
    rows = []
    for sid, df in sorted(data.items()):
        fps = len(df) / df["wall_time_s"].iloc[-1] if df["wall_time_s"].iloc[-1] > 0 else 0
        rows.append({
            "scenario": SCENARIO_LABELS[sid],
            "sid": sid,
            "p50": df["inference_ms"].median(),
            "p95": np.percentile(df["inference_ms"], 95),
            "max": df["inference_ms"].max(),
            "fps": fps,
            "avg_conf": df.loc[df["hands"] > 0, "avg_conf"].mean() if (df["hands"] > 0).any() else 0,
        })
    agg = pd.DataFrame(rows).sort_values("p95")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 7))

    # Left: Latency percentiles
    x = np.arange(len(agg))
    ax1.barh(x, agg["max"], height=0.6, color="#FF453A", alpha=0.3, label="Max")
    ax1.barh(x, agg["p95"], height=0.6, color="#FF9F0A", alpha=0.6, label="p95")
    ax1.barh(x, agg["p50"], height=0.6, color="#30D158", alpha=0.8, label="p50")
    ax1.set_yticks(x)
    ax1.set_yticklabels(agg["scenario"], fontsize=10)
    ax1.set_xlabel("Inference Latency (ms)", fontsize=11)
    ax1.set_title("Latency Percentiles", fontsize=14, fontweight="700")
    ax1.legend(fontsize=10)
    ax1.invert_yaxis()

    # Right: FPS + confidence
    colors = [SCENARIO_COLORS[sid] for sid in agg["sid"]]
    ax2.barh(x, agg["fps"], height=0.6, color=colors, alpha=0.8)
    ax2.set_yticks(x)
    ax2.set_yticklabels(agg["scenario"], fontsize=10)
    ax2.set_xlabel("Throughput (FPS)", fontsize=11)
    ax2.set_title("Throughput (frames processed / elapsed)", fontsize=14, fontweight="700")
    ax2.invert_yaxis()

    for i, (_, row) in enumerate(agg.iterrows()):
        conf_str = f'{row["avg_conf"]*100:.0f}% conf' if row["avg_conf"] > 0 else "no hands"
        ax2.annotate(conf_str, (row["fps"] + 0.2, i), fontsize=9, va="center",
                     color="#F0F0F5", fontweight="500")

    fig.suptitle("Scenario Comparison — Sorted by p95 Latency", fontsize=16, fontweight="700", y=1.01)
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "4_scenario_comparison.png", dpi=200, bbox_inches="tight")
    print("  Saved: 4_scenario_comparison.png")
    plt.close(fig)


# ─── Plot 5: Handler Cost — CVPixelBuffer vs CGImage ────────────────────────

def plot_handler_cost(data: dict[int, pd.DataFrame]):
    rows = []
    for sid, df in sorted(data.items()):
        rows.append({
            "scenario": SCENARIO_LABELS[sid],
            "sid": sid,
            "handler_ms": df["handler_ms"].mean(),
            "handler_p95": np.percentile(df["handler_ms"], 95),
            "is_cgimage": "CGI" in SCENARIO_LABELS[sid],
        })
    agg = pd.DataFrame(rows).sort_values("handler_ms", ascending=False)

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(len(agg))
    colors = ["#BF5AF2" if cgi else "#0A84FF" for cgi in agg["is_cgimage"]]

    bars = ax.barh(x, agg["handler_ms"], height=0.5, color=colors, alpha=0.8, label="Mean")
    ax.barh(x, agg["handler_p95"], height=0.5, color=colors, alpha=0.3, label="p95")

    ax.set_yticks(x)
    ax.set_yticklabels(agg["scenario"], fontsize=10)
    ax.set_xlabel("Handler Time (ms)", fontsize=11)
    ax.set_title("Handler Cost: CVPixelBuffer Creation vs CGImage Pass-Through",
                 fontsize=14, fontweight="700")
    ax.legend(fontsize=10)

    for i, (_, row) in enumerate(agg.iterrows()):
        fmt = "CGImage" if row["is_cgimage"] else "CVPixelBuffer"
        ax.annotate(f'{row["handler_ms"]:.2f}ms ({fmt})',
                    (max(row["handler_ms"], row["handler_p95"]) + 0.1, i),
                    fontsize=9, va="center", color="#F0F0F5")

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "5_handler_cost.png", dpi=200, bbox_inches="tight")
    print("  Saved: 5_handler_cost.png")
    plt.close(fig)


# ─── Plot 6: Confidence & Jitter Over Time ──────────────────────────────────

def plot_confidence_jitter(data: dict[int, pd.DataFrame]):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(16, 10), sharex=False)

    for sid, df in sorted(data.items()):
        color = SCENARIO_COLORS[sid]
        label = SCENARIO_LABELS[sid]
        has_hands = df[df["hands"] > 0]

        if len(has_hands) > 10:
            # Confidence
            rolling_conf = has_hands["avg_conf"].rolling(30, center=True).mean()
            ax1.plot(has_hands["wall_time_s"], rolling_conf,
                     color=color, linewidth=1.5, alpha=0.8, label=label)

            # Jitter
            jitter_nonzero = has_hands[has_hands["avg_jitter_px"] > 0]
            if len(jitter_nonzero) > 10:
                rolling_jitter = jitter_nonzero["avg_jitter_px"].rolling(30, center=True).mean()
                ax2.plot(jitter_nonzero["wall_time_s"], rolling_jitter,
                         color=color, linewidth=1.5, alpha=0.8, label=label)

    ax1.set_ylabel("Avg Joint Confidence", fontsize=11)
    ax1.set_title("Detection Confidence Over Time (30-frame rolling avg)", fontsize=14, fontweight="700")
    ax1.set_ylim(0, 1)
    ax1.legend(fontsize=8, loc="lower right", ncol=2)

    ax2.set_xlabel("Time (s)", fontsize=11)
    ax2.set_ylabel("Avg Jitter (px)", fontsize=11)
    ax2.set_title("Joint Position Jitter Over Time (30-frame rolling avg)", fontsize=14, fontweight="700")
    ax2.legend(fontsize=8, loc="upper right", ncol=2)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "6_confidence_jitter.png", dpi=200, bbox_inches="tight")
    print("  Saved: 6_confidence_jitter.png")
    plt.close(fig)


# ─── Plot 7: Hands Detected Reliability (Stacked Bar) ───────────────────────

def plot_hands_reliability(data: dict[int, pd.DataFrame]):
    rows = []
    for sid, df in sorted(data.items()):
        total = len(df)
        for n_hands in [0, 1, 2]:
            pct = (df["hands"] == n_hands).sum() / total * 100
            rows.append({"scenario": SCENARIO_LABELS[sid], "sid": sid,
                         "hands": str(n_hands), "pct": pct})
    df_hands = pd.DataFrame(rows)

    scenarios = [SCENARIO_LABELS[s] for s in sorted(data.keys())]
    fig, ax = plt.subplots(figsize=(14, 6))
    hand_colors = {"0": "#FF453A", "1": "#FF9F0A", "2": "#30D158"}

    bottom = np.zeros(len(scenarios))
    for nh in ["0", "1", "2"]:
        subset = df_hands[df_hands["hands"] == nh]
        # Ensure correct order
        vals = [subset[subset["scenario"] == s]["pct"].values[0] for s in scenarios]
        ax.bar(scenarios, vals, bottom=bottom,
               label=f"{nh} hands", color=hand_colors[nh],
               edgecolor="#0D0D12", linewidth=0.5)
        bottom += vals

    ax.set_ylabel("% of Frames", fontsize=11)
    ax.set_title("Hands Detected Reliability Per Scenario", fontsize=16, fontweight="700")
    ax.tick_params(axis="x", rotation=25, labelsize=10)
    ax.legend(fontsize=10)
    ax.set_ylim(0, 105)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "7_hands_reliability.png", dpi=200, bbox_inches="tight")
    print("  Saved: 7_hands_reliability.png")
    plt.close(fig)


# ─── Plot 8: Thermal & Battery Over Time ────────────────────────────────────

def plot_thermal_battery(data: dict[int, pd.DataFrame]):
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(16, 8), sharex=False)

    thermal_map = {"nominal": 0, "fair": 1, "serious": 2, "critical": 3}

    for sid, df in sorted(data.items()):
        color = SCENARIO_COLORS[sid]
        label = SCENARIO_LABELS[sid]

        # Thermal
        thermal_num = df["thermal"].map(thermal_map)
        ax1.plot(df["wall_time_s"], thermal_num, color=color, linewidth=1.5,
                 alpha=0.8, label=label)

        # Battery
        ax2.plot(df["wall_time_s"], df["battery"] * 100, color=color, linewidth=1.5,
                 alpha=0.8, label=label)

    ax1.set_yticks([0, 1, 2, 3])
    ax1.set_yticklabels(["Nominal", "Fair", "Serious", "Critical"])
    ax1.set_ylabel("Thermal State", fontsize=11)
    ax1.set_title("Device Thermal State During Benchmark", fontsize=14, fontweight="700")
    ax1.legend(fontsize=8, loc="upper left", ncol=4)

    ax2.set_xlabel("Time (s)", fontsize=11)
    ax2.set_ylabel("Battery (%)", fontsize=11)
    ax2.set_title("Battery Level During Benchmark", fontsize=14, fontweight="700")
    ax2.legend(fontsize=8, loc="lower left", ncol=4)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "8_thermal_battery.png", dpi=200, bbox_inches="tight")
    print("  Saved: 8_thermal_battery.png")
    plt.close(fig)


# ─── Plot 9: Memory Usage ───────────────────────────────────────────────────

def plot_memory(data: dict[int, pd.DataFrame]):
    fig, ax = plt.subplots(figsize=(14, 6))

    for sid, df in sorted(data.items()):
        color = SCENARIO_COLORS[sid]
        label = SCENARIO_LABELS[sid]
        ax.plot(df["wall_time_s"], df["memory_mb"], color=color, linewidth=1.5,
                alpha=0.8, label=label)

    ax.set_xlabel("Time (s)", fontsize=11)
    ax.set_ylabel("Resident Memory (MB)", fontsize=11)
    ax.set_title("Memory Usage During Benchmark", fontsize=14, fontweight="700")
    ax.legend(fontsize=8, loc="upper left", ncol=4)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "9_memory.png", dpi=200, bbox_inches="tight")
    print("  Saved: 9_memory.png")
    plt.close(fig)


# ─── Plot 10: Frame Interval (delivery jitter) ──────────────────────────────

def plot_frame_interval(data: dict[int, pd.DataFrame]):
    frames = []
    for sid, df in sorted(data.items()):
        d = df[["frame_interval_ms"]].copy()
        d["scenario"] = SCENARIO_LABELS[sid]
        # Skip first few frames with 0 interval
        d = d[d["frame_interval_ms"] > 0]
        frames.append(d)
    combined = pd.concat(frames, ignore_index=True)

    order = [SCENARIO_LABELS[s] for s in sorted(data.keys())]
    palette = [SCENARIO_COLORS[s] for s in sorted(data.keys())]

    fig, ax = plt.subplots(figsize=(14, 7))
    sns.boxplot(data=combined, x="scenario", y="frame_interval_ms", order=order,
                palette=palette, fliersize=2, linewidth=0.8, ax=ax)

    ax.axhline(66.7, color="#30D158", linestyle="--", linewidth=1, alpha=0.6,
               label="15 FPS target (66.7ms)")
    ax.set_xlabel("")
    ax.set_ylabel("Frame Interval (ms)", fontsize=11)
    ax.set_title("Frame Delivery Interval — Processing Backpressure",
                 fontsize=14, fontweight="700")
    ax.tick_params(axis="x", rotation=25, labelsize=10)
    ax.legend(fontsize=10)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "10_frame_interval.png", dpi=200, bbox_inches="tight")
    print("  Saved: 10_frame_interval.png")
    plt.close(fig)


# ─── Plot 11: Summary Table ─────────────────────────────────────────────────

def plot_summary_table(data: dict[int, pd.DataFrame]):
    rows = []
    for sid, df in sorted(data.items()):
        has_hands = df[df["hands"] > 0]
        fps = len(df) / df["wall_time_s"].iloc[-1] if df["wall_time_s"].iloc[-1] > 0 else 0
        rows.append({
            "Scenario": SCENARIO_LABELS[sid],
            "Frames": len(df),
            "FPS": f"{fps:.1f}",
            "Inf p50": f'{df["inference_ms"].median():.1f}',
            "Inf p95": f'{np.percentile(df["inference_ms"], 95):.1f}',
            "E2E p50": f'{df["e2e_ms"].median():.1f}',
            "Handler": f'{df["handler_ms"].mean():.2f}',
            "Conf": f'{has_hands["avg_conf"].mean():.3f}' if len(has_hands) > 0 else "—",
            "Jitter": f'{has_hands["avg_jitter_px"].mean():.1f}' if len(has_hands) > 0 else "—",
            "Detect%": f'{len(has_hands)/len(df)*100:.0f}%',
            "Thermal": f'{df["thermal"].iloc[0]}→{df["thermal"].iloc[-1]}',
            "Mem MB": f'{df["memory_mb"].mean():.0f}',
        })

    fig, ax = plt.subplots(figsize=(20, 4))
    ax.axis("off")

    table_df = pd.DataFrame(rows)
    table = ax.table(cellText=table_df.values, colLabels=table_df.columns,
                     loc="center", cellLoc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1.0, 1.6)

    # Style header
    for j in range(len(table_df.columns)):
        table[0, j].set_facecolor("#333340")
        table[0, j].set_text_props(color="#F0F0F5", fontweight="bold")
    # Style rows
    for i in range(len(table_df)):
        sid = sorted(data.keys())[i]
        for j in range(len(table_df.columns)):
            table[i + 1, j].set_facecolor("#1C1C23")
            table[i + 1, j].set_text_props(color="#F0F0F5")
            table[i + 1, j].set_edgecolor("#333340")

    ax.set_title("Benchmark Summary — 60s Live Tests (Meta Ray-Ban → Vision Framework)",
                 fontsize=14, fontweight="700", pad=20)

    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / "11_summary_table.png", dpi=200, bbox_inches="tight")
    print("  Saved: 11_summary_table.png")
    plt.close(fig)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Loading benchmark CSVs...")
    data = load_all()
    if not data:
        print("ERROR: No CSV files found!")
        return

    print(f"\nLoaded {len(data)} scenarios, generating plots...\n")

    plot_latency_per_frame(data)
    plot_latency_distribution(data)
    plot_e2e_breakdown(data)
    plot_scenario_comparison(data)
    plot_handler_cost(data)
    plot_confidence_jitter(data)
    plot_hands_reliability(data)
    plot_thermal_battery(data)
    plot_memory(data)
    plot_frame_interval(data)
    plot_summary_table(data)

    print(f"\nAll 11 plots saved to: {OUTPUT_DIR}/")
    print("Open them with: open benchmark_results/")


if __name__ == "__main__":
    main()
