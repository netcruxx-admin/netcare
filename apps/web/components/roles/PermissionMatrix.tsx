'use client';

import { useMemo } from 'react';
import type { PermissionGrant, PermissionInfo } from '@/store/api';

/**
 * The superadmin's permission picker, grouped by resource.
 *
 * The catalog comes from the backend, so this renders whatever permissions the
 * platform currently supports — no list is duplicated here. Permissions that
 * take a breadth ("own" vs "all") show a scope selector, because that choice is
 * what distinguishes, say, a doctor from an admin without either being named.
 */
export function PermissionMatrix({
  permissions,
  granted,
  onChange,
  disabled = false,
}: {
  permissions: PermissionInfo[];
  granted: PermissionGrant[];
  onChange: (next: PermissionGrant[]) => void;
  disabled?: boolean;
}) {
  const grantedByCode = useMemo(
    () => new Map(granted.map((g) => [g.code, g.scope ?? null])),
    [granted],
  );

  // Preserve the catalog's sort order within each resource group.
  const groups = useMemo(() => {
    const byResource = new Map<string, PermissionInfo[]>();
    for (const permission of permissions) {
      const list = byResource.get(permission.resource) ?? [];
      list.push(permission);
      byResource.set(permission.resource, list);
    }
    return [...byResource.entries()];
  }, [permissions]);

  const toggle = (permission: PermissionInfo, on: boolean) => {
    const next = granted.filter((g) => g.code !== permission.code);
    if (on) {
      // Default new grants to the narrower breadth — widening is a deliberate act.
      next.push({ code: permission.code, scope: permission.supportsScope ? 'own' : null });
    }
    onChange(next);
  };

  const setScope = (code: string, scope: 'own' | 'all') => {
    onChange(granted.map((g) => (g.code === code ? { ...g, scope } : g)));
  };

  if (permissions.length === 0) {
    return <p className="text-sm text-slate-400">Loading permissions…</p>;
  }

  return (
    <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
      {groups.map(([resource, items]) => (
        <div key={resource}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
            {resource.replace(/_/g, ' ')}
          </p>
          <div className="space-y-1.5">
            {items.map((permission) => {
              const isGranted = grantedByCode.has(permission.code);
              const scope = grantedByCode.get(permission.code) ?? 'own';
              return (
                <div key={permission.code} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`perm-${permission.code}`}
                    checked={isGranted}
                    disabled={disabled}
                    onChange={(e) => toggle(permission, e.target.checked)}
                    className="w-4 h-4 mt-0.5 shrink-0"
                  />
                  <label htmlFor={`perm-${permission.code}`} className="flex-1 min-w-0 cursor-pointer">
                    <span className="text-sm text-slate-800">{permission.label}</span>
                    {permission.module && (
                      <span
                        className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 align-middle"
                        title={`Only effective at hospitals with the ${permission.module} module enabled`}
                      >
                        {permission.module}
                      </span>
                    )}
                    <span className="block text-xs text-slate-400 truncate">{permission.code}</span>
                  </label>
                  {isGranted && permission.supportsScope && (
                    <select
                      value={scope ?? 'own'}
                      disabled={disabled}
                      onChange={(e) => setScope(permission.code, e.target.value as 'own' | 'all')}
                      className="text-xs border border-slate-300 rounded px-1.5 py-1 shrink-0"
                      title="How much of the hospital's data this covers"
                    >
                      <option value="own">Own</option>
                      <option value="all">All</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
