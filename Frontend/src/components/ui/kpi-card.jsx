import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({ title, value, subtitle, icon: Icon, color, loading, className }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 truncate">
            {title}
          </p>

          {loading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="mt-1.5 text-xl font-bold text-slate-900 truncate">
              {value}
            </p>
          )}

          {loading ? (
            <Skeleton className="mt-1.5 h-3.5 w-20" />
          ) : subtitle ? (
            <p className="mt-1 text-xs text-slate-500 truncate">{subtitle}</p>
          ) : null}
        </div>

        {Icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-4 ring-white"
            style={{ backgroundColor: color || "#6366f1" }}
          >
            <Icon size={18} className="text-white" />
          </div>
        )}
      </div>

      {/* Subtle color accent at bottom */}
      <div
        className="absolute bottom-0 left-0 h-0.5 w-full opacity-60"
        style={{ backgroundColor: color || "#6366f1" }}
      />
    </div>
  );
}
