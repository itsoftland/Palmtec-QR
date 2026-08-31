import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Single card showing a total plus a same-card breakdown by state
 * (e.g. Companies: total + validated/unvalidated/expired).
 * states: [{ label, value, color }]
 */
export function StateBreakdownCard({ title, subtitle, icon: Icon, total, states, loading, className }) {
  const safeTotal = total || 0;
  const barTotal = states.reduce((sum, s) => sum + (s.value || 0), 0) || 1;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Icon size={16} />
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          <p className="text-2xl font-bold text-slate-900 leading-none">{safeTotal}</p>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ) : (
        <>
          {/* Segmented bar */}
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            {states.map((s, i) => (
              <div
                key={i}
                className="h-full transition-all duration-500"
                style={{ width: `${((s.value || 0) / barTotal) * 100}%`, backgroundColor: s.color }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 space-y-1.5">
            {states.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-slate-500 flex-1">{s.label}</span>
                <span className="text-xs font-semibold text-slate-800">{s.value ?? 0}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
