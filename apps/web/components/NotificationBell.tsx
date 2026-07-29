'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getNotifications,
  isRead,
  markAllRead,
  markRead,
  type AppNotification,
  type NotificationTone,
} from '@/lib/notifications';

interface SessionUser {
  id: string;
  name: string;
  role: string;
}

const toneIcon: Record<NotificationTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
};
const toneColor: Record<NotificationTone, string> = {
  info: 'text-cyan-600 bg-cyan-100',
  success: 'text-green-600 bg-green-100',
  warning: 'text-amber-600 bg-amber-100',
};

export function NotificationBell({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [, forceTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(getNotifications(user));
  }, [user]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((n) => !isRead(n.id)).length;

  const openItem = (n: AppNotification) => {
    markRead([n.id]);
    forceTick((t) => t + 1);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const handleMarkAll = () => {
    markAllRead(items);
    forceTick((t) => t + 1);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => {
                const Icon = toneIcon[n.tone];
                const read = isRead(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition ${
                      read ? 'opacity-60' : ''
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${toneColor[n.tone]}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{n.title}</span>
                        {!read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5 truncate">{n.description}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
