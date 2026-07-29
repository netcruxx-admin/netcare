'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Stethoscope, UserRound, LayoutDashboard } from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { dbOperations } from '@/lib/db';

type Role = 'patient' | 'doctor' | 'admin' | 'lab' | 'nurse' | 'superadmin';

interface NavLink {
  label: string;
  href: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  role,
  navItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  navItems: NavLink[];
}) {
  const router = useRouter();
  const staff = role === 'admin' || role === 'doctor' || role === 'nurse' || role === 'lab';

  // Build searchable entity lists once per open.
  const { patients, doctors } = useMemo(() => {
    if (!open || !staff) return { patients: [], doctors: [] };
    const users = new Map(dbOperations.getAllUsers().map((u) => [u.id, u]));
    const patients = dbOperations.getAllPatients().map((p) => ({
      id: p.id,
      name: users.get(p.userId)?.name ?? p.id,
      sub: users.get(p.userId)?.email ?? '',
    }));
    const doctors = dbOperations.getAllDoctors().map((d) => ({
      id: d.id,
      name: users.get(d.userId)?.name ?? d.id,
      sub: d.specialization,
    }));
    return { patients, doctors };
  }, [open, staff]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Jump to a page, patient, or doctor">
      <CommandInput placeholder="Search pages, patients, doctors…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {navItems.map((n) => (
            <CommandItem key={n.href} value={`page ${n.label}`} onSelect={() => go(n.href)}>
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {staff && patients.length > 0 && (
          <CommandGroup heading="Patients">
            {patients.map((p) => (
              <CommandItem key={p.id} value={`patient ${p.name} ${p.sub}`} onSelect={() => go(`/patient/${p.id}`)}>
                <UserRound className="w-4 h-4 text-slate-400" />
                <span>{p.name}</span>
                {p.sub && <span className="text-xs text-slate-400 ml-auto">{p.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {role === 'admin' && doctors.length > 0 && (
          <CommandGroup heading="Doctors">
            {doctors.map((d) => (
              <CommandItem key={d.id} value={`doctor ${d.name} ${d.sub}`} onSelect={() => go('/dashboard/admin/doctors')}>
                <Stethoscope className="w-4 h-4 text-slate-400" />
                <span>Dr. {d.name}</span>
                {d.sub && <span className="text-xs text-slate-400 ml-auto">{d.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
