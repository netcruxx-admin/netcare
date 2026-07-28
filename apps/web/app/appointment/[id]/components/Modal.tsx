'use client';

import type { ReactNode } from 'react';

// Shared modal shell: fixed backdrop + centered white card. Children supply the
// heading and body. `scroll` caps the height for the taller forms.
export function Modal({
  children,
  maxWidth = 'max-w-md',
  scroll = false,
}: {
  children: ReactNode;
  maxWidth?: string;
  scroll?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} p-6 ${scroll ? 'max-h-[92vh] overflow-y-auto' : ''}`}>
        {children}
      </div>
    </div>
  );
}
