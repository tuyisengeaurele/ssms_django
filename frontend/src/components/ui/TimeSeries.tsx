import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DayCount {
  day: string;
  count: number;
}

interface TimeSeriesProps {
  /** Names the chart for screen readers and the data table. */
  label: string;
  /** What one unit is called in the tooltip, such as "Users". */
  unit: string;
  data: DayCount[];
  color: string;
  height?: number;
}

function Hover({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip-label">{label}</p>
      <p className="chart-tip-value">{payload[0].value} {unit.toLowerCase()}</p>
    </div>
  );
}

/** One line with a faint wash under it. A hidden table carries the same numbers for screen readers. */
export default function TimeSeries({ label, unit, data, color, height = 210 }: TimeSeriesProps) {
  return (
    <div className="timeseries" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="#E9E4D8" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#566760' }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#566760' }} />
          <Tooltip cursor={{ stroke: '#C9C2B2' }} content={<Hover unit={unit} />} />
          <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: color }} />
        </AreaChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
