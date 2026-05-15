import { Card } from '@/components/ui/card';
import { Check, Minus, ShieldCheck } from 'lucide-react';
import { permissionRows, matrixRoles, roleHasPermission } from '@/data/permissions';
import { cn } from '@/lib/utils';

/**
 * Role × Permission matrix.
 * Read-only visualization of which role can do what.
 */
export const RoleMatrix = () => {
  // Group consecutive rows by module to render module label once.
  const grouped: { module: string; rows: typeof permissionRows }[] = [];
  for (const row of permissionRows) {
    const last = grouped[grouped.length - 1];
    if (last && last.module === row.module) last.rows.push(row);
    else grouped.push({ module: row.module, rows: [row] });
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border/60">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div className="font-semibold">مصفوفة الأدوار والصلاحيات</div>
        <div className="text-xs text-muted-foreground mr-auto">
          الصلاحيات الممنوحة لكل دور افتراضياً
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/40">
            <tr className="border-b border-border/60">
              <th className="text-start font-medium px-4 py-3 w-44">الوحدة</th>
              <th className="text-start font-medium px-4 py-3">الصلاحية</th>
              {matrixRoles.map((r) => (
                <th key={r.role} className="text-center font-medium px-4 py-3 whitespace-nowrap">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) =>
              g.rows.map((row, idx) => (
                <tr
                  key={row.key}
                  className={cn(
                    'border-b border-border/40 last:border-0 hover:bg-muted/20',
                  )}
                >
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {idx === 0 ? <span className="font-medium text-foreground">{g.module}</span> : ''}
                  </td>
                  <td className="px-4 py-2.5">{row.action}</td>
                  {matrixRoles.map((r) => {
                    const allowed = roleHasPermission(r.role, row.key);
                    return (
                      <td key={r.role} className="px-4 py-2.5 text-center">
                        {allowed ? (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
                            <Minus className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
