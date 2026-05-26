const palettes = {
  ongoing: "bg-emerald-100 text-emerald-700",
  planned: "bg-slate-100 text-slate-700",
  completed: "bg-sky-100 text-sky-700",
  on_hold: "bg-amber-100 text-amber-700",
  over: "bg-rose-100 text-rose-700",
  on_track: "bg-emerald-100 text-emerald-700",
  under: "bg-sky-100 text-sky-700",
  critical: "bg-rose-100 text-rose-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-sky-100 text-sky-700",
};

export default function StatusBadge({ value }) {
  if (!value) return null;
  const cls = palettes[value] || "bg-slate-100 text-slate-700";
  return <span className={`badge ${cls}`}>{String(value).replace(/_/g, " ")}</span>;
}
