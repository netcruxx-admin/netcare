'use client';

import { useState } from 'react';
import { Search, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { useListPublicHospitalsQuery } from '@/store/api';
import type { HospitalPublicInfo } from '@/store/api';

interface Props {
  onSelect: (hospital: HospitalPublicInfo) => void;
}

export function HospitalStep({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const { data: hospitals = [], isLoading, isError } = useListPublicHospitalsQuery();

  const filtered = hospitals.filter((h) =>
    h.name.toLowerCase().includes(query.toLowerCase()) ||
    h.tagline.toLowerCase().includes(query.toLowerCase()) ||
    h.subdomain.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900">Find Your Hospital</h2>
        <p className="text-slate-600 mt-2">Select the hospital you want to register with</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name or location..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
          autoFocus
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading hospitals...</span>
        </div>
      )}

      {isError && (
        <p className="text-center text-sm text-red-600 py-4">
          Could not load hospitals. Please try again later.
        </p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-4">
          {query ? `No hospitals found matching "${query}"` : 'No hospitals available for registration.'}
        </p>
      )}

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {filtered.map((hospital) => (
          <button
            key={hospital.id}
            onClick={() => onSelect(hospital)}
            className="w-full p-4 border-2 border-slate-100 rounded-lg hover:border-cyan-400 hover:bg-cyan-50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              {hospital.logoUrl ? (
                <img src={hospital.logoUrl} alt={hospital.name} className="w-10 h-10 rounded-lg object-contain flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-cyan-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">{hospital.name}</h3>
                {hospital.tagline && (
                  <p className="text-sm text-slate-500 truncate">{hospital.tagline}</p>
                )}
                <p className="text-xs text-slate-400 capitalize">{hospital.category.replace(/-/g, ' ')}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-cyan-500 transition flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
