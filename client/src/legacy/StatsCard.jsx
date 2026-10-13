import { cn } from '@/lib/utils';

export default function StatsCard({ title, value, icon: Icon, color, trend }) {
  const colorStyles = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
  };

  const iconStyles = {
    indigo: "bg-indigo-100 text-indigo-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("p-3 rounded-xl", iconStyles[color])}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div className="text-slate-500 text-sm font-medium mb-1">{title}</div>
      <div className="text-2xl font-heading font-bold text-slate-900">{value}</div>
    </div>
  );
}
