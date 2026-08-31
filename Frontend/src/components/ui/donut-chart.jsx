import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="flex items-center gap-1.5 font-semibold" style={{ color: p.color }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
        {name}
      </p>
      <p className="text-slate-700 mt-0.5">
        Count: <span className="font-semibold">{value.toLocaleString("en-IN")}</span>
      </p>
      {p.percentage !== undefined && (
        <p className="text-slate-500">{p.percentage}% of total</p>
      )}
    </div>
  );
};

export function DonutChart({ data, className }) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  const enriched = data.map((d) => ({
    ...d,
    percentage: total > 0 ? Math.round((d.value / total) * 100) : 0,
  }));

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={enriched}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {enriched.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
