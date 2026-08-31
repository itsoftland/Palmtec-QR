import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const CustomTooltip = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}:{" "}
          <span className="font-semibold">
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
};

export function AreaChart({ data, areas, formatter, className }) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            {areas.map((area) => (
              <linearGradient key={area.key} id={`grad-${area.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={area.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={area.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatter}
            width={60}
          />
          <Tooltip content={<CustomTooltip formatter={formatter} />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            iconType="circle"
            iconSize={8}
          />
          {areas.map((area) => (
            <Area
              key={area.key}
              type="monotone"
              dataKey={area.key}
              name={area.name}
              stroke={area.color}
              strokeWidth={2}
              fill={`url(#grad-${area.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
