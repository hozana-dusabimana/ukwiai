import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Skeleton } from "../ui/primitives";

interface Point { date: string; value: number }
interface StagePoint { stage: string; count: number }

export default function DashboardCharts({ projectId }: { projectId?: number | null }) {
  const [progress, setProgress] = useState<Point[] | null>(null);
  const [cost, setCost] = useState<Point[] | null>(null);
  const [stages, setStages] = useState<StagePoint[] | null>(null);

  useEffect(() => {
    const q = projectId ? `?project_id=${projectId}&days=30` : "?days=30";
    const stageQ = projectId ? `?project_id=${projectId}` : "";
    api<Point[]>(`/api/dashboard/charts/progress-trend${q}`).then(setProgress).catch(() => setProgress([]));
    api<Point[]>(`/api/dashboard/charts/cost-trend${q}`).then(setCost).catch(() => setCost([]));
    api<StagePoint[]>(`/api/dashboard/charts/stage-distribution${stageQ}`).then(setStages).catch(() => setStages([]));
  }, [projectId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ChartCard title="Progress trend" subtitle="Last 30 days · AI predictions">
        {progress === null ? <Skeleton className="h-32" /> : <SparkLine data={progress} stroke="#ea580c" fill="#fed7aa" unit="%" />}
      </ChartCard>
      <ChartCard title="Cost trend" subtitle="Last 30 days · cumulative spend">
        {cost === null ? <Skeleton className="h-32" /> : <SparkLine data={cost} stroke="#0f172a" fill="#e2e8f0" unit="RWF" />}
      </ChartCard>
      <ChartCard title="Stage distribution" subtitle="Projects by current stage">
        {stages === null ? <Skeleton className="h-32" /> : <StageBars data={stages} />}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-bold text-slate-900">{title}</h3>
        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function SparkLine({ data, stroke, fill, unit }: { data: Point[]; stroke: string; fill: string; unit?: string }) {
  if (!data || data.length === 0) {
    return <p className="text-xs text-gray-400 py-10 text-center">No data in this window.</p>;
  }
  const w = 320; const h = 120;
  const values = data.map((d) => Number(d.value) || 0);
  const xs = data.map((_, i) => (i / Math.max(1, data.length - 1)) * w);
  const max = Math.max(...values, 1);
  const ys = values.map((v) => h - (v / max) * (h - 10) - 4);
  const path = data.map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const last = { ...data[data.length - 1], value: values[values.length - 1] };
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
        <path d={area} fill={fill} opacity={0.6} />
        <path d={path} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={stroke} />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1">
        <span>{data[0]?.date?.slice(0, 10)}</span>
        <span className="font-mono font-bold text-slate-900">{last.value.toFixed(unit === "RWF" ? 0 : 1)}{unit ? ` ${unit}` : ""}</span>
        <span>{last.date?.slice(0, 10)}</span>
      </div>
    </div>
  );
}

function StageBars({ data }: { data: StagePoint[] }) {
  if (!data || data.length === 0) {
    return <p className="text-xs text-gray-400 py-10 text-center">No stage data.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2 mt-1">
      {data.map((d) => (
        <div key={d.stage} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-gray-700" title={d.stage}>{d.stage}</span>
          <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-orange-500" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="font-mono font-bold text-slate-900 w-6 text-right">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
