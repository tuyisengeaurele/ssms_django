import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface HourPoint {
  hour: string;
  [key: string]: string | number | null;
}

interface RangeChartProps {
  /** Names the chart for screen readers and its hidden table. */
  label: string;
  data: HourPoint[];
  dataKey: string;
  unit: string;
  color: string;
  /** The healthy range, drawn as a soft band behind the line. */
  safe: [number, number];
  height?: number;
}

function Hover({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; unit: string }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip-label">{label}</p>
      <p className="chart-tip-value">{Number(payload[0].value).toFixed(1)} {unit}</p>
    </div>
  );
}

/** A reading over time with the healthy range shaded, so a glance shows when it left the range. */
export default function RangeChart({ label, data, dataKey, unit, color, safe, height = 170 }: RangeChartProps) {
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E9E4D8" />
          <ReferenceArea y1={safe[0]} y2={safe[1]} fill="#1F7A52" fillOpacity={0.07} strokeOpacity={0} />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#566760' }} minTickGap={28} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#566760' }} domain={['auto', 'auto']} />
          <Tooltip cursor={{ stroke: '#C9C2B2' }} content={<Hover unit={unit} />} />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.08} dot={false} connectNulls activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.hour}>
              <th scope="row">{d.hour}</th>
              <td>{d[dataKey] == null ? '-' : `${d[dataKey]} ${unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
