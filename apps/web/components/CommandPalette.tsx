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
import { useListDoctorsQuery, useListPatientsQuery } from '@/store/api';
import { adminRole, labRole, staffRoles } from '@/lib/roles';

// A role code from the backend catalog (roles are runtime data, see
// lib/roles.ts). Only compared against known codes below, so an unrecognised
// role simply gets the non-staff view.
type Role = string;

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
  const staff = staffRoles.includes(role) || role === labRole;

  // Only fetched while the palette is open to a staff user; the API returns
  // whatever that role may see, so the search can't surface hidden records.
  const skip = !open || !staff;
  const { data: patientRecords = [] } = useListPatientsQuery(undefined, { skip });
  const { data: doctorRecords = [] } = useListDoctorsQuery(undefined, { skip });

  const patients = useMemo(
    () =>
      patientRecords.map((p) => ({
        id: p.id,
        name: p.user?.name ?? p.id,
        sub: p.user?.email ?? '',
      })),
    [patientRecords],
  );
  const doctors = useMemo(
    () =>
      doctorRecords.map((d) => ({
        id: d.id,
        name: d.user?.name ?? d.id,
        sub: d.specialization,
      })),
    [doctorRecords],
  );

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

        {role === adminRole && doctors.length > 0 && (
          <CommandGroup heading="Doctors">
            {doctors.map((d) => (
              <CommandItem key={d.id} value={`doctor ${d.name} ${d.sub}`} onSelect={() => go('/dashboard/doctors')}>
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
