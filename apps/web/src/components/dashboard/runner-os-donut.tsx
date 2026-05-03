"use client";

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

const OS_LABELS: Record<string, string> = {
  ubuntu: "Linux",
  windows: "Windows",
  macos: "macOS",
  "self-hosted": "Self-hosted",
};

const OS_COLORS: Record<string, string> = {
  ubuntu: "rgb(124, 58, 237)",
  windows: "rgb(59, 130, 246)",
  macos: "rgb(14, 165, 233)",
  "self-hosted": "rgb(148, 163, 184)",
};

export interface RunnerOsDonutProps {
  data: Array<{ os: string; costUsd: number }>;
}

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function RunnerOsDonut({ data }: RunnerOsDonutProps) {
  const chartData = useMemo(
    () => ({
      labels: data.map((d) => OS_LABELS[d.os] ?? d.os),
      datasets: [
        {
          data: data.map((d) => d.costUsd),
          backgroundColor: data.map((d) => OS_COLORS[d.os] ?? "rgb(148, 163, 184)"),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    }),
    [data],
  );

  const total = data.reduce((acc, d) => acc + d.costUsd, 0);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      animation: { duration: 400 },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: {
            font: { size: 12 },
            color: "rgb(120, 120, 130)",
            usePointStyle: true,
            pointStyle: "circle" as const,
            boxWidth: 8,
            padding: 14,
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 15, 18, 0.95)",
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx: { label: string; parsed: number }) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
              return `${ctx.label}: ${fmtUsd(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    }),
    [total],
  );

  return (
    <div className="h-64 w-full">
      <Doughnut data={chartData} options={options} />
    </div>
  );
}
