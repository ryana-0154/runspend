"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export interface DailySpendChartProps {
  data: Array<{ date: string; costUsd: number }>;
}

const dayLabel = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DailySpendChart({ data }: DailySpendChartProps) {
  const chartData = useMemo(
    () => ({
      labels: data.map((d) => dayLabel(d.date)),
      datasets: [
        {
          data: data.map((d) => d.costUsd),
          borderColor: "rgb(124, 58, 237)",
          backgroundColor: (ctx: { chart: { ctx: CanvasRenderingContext2D } }) => {
            const c = ctx.chart.ctx;
            const grad = c.createLinearGradient(0, 0, 0, 220);
            grad.addColorStop(0, "rgba(124, 58, 237, 0.32)");
            grad.addColorStop(1, "rgba(124, 58, 237, 0)");
            return grad;
          },
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "rgb(124, 58, 237)",
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 2,
        },
      ],
    }),
    [data],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 15, 18, 0.95)",
          titleFont: { size: 12, weight: 500 as const },
          bodyFont: { size: 12 },
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (ctx: { parsed: { y: number | null } }) => fmtUsd(ctx.parsed.y ?? 0),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxRotation: 0,
            autoSkipPadding: 24,
            font: { size: 11 },
            color: "rgb(120, 120, 130)",
          },
          border: { display: false },
        },
        y: {
          grid: { color: "rgba(120, 120, 130, 0.12)" },
          ticks: {
            font: { size: 11 },
            color: "rgb(120, 120, 130)",
            callback: (v: string | number) => `$${v}`,
          },
          border: { display: false },
          beginAtZero: true,
        },
      },
    }),
    [],
  );

  return (
    <div className="h-64 w-full">
      <Line data={chartData} options={options} />
    </div>
  );
}
