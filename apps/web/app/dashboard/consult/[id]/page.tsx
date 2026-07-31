'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, MessageSquare,
  FileText, Send, CheckCircle2, Signal, CameraOff, ArrowLeft,
} from 'lucide-react';
import { useDashboardGuard } from '@/hooks/useDashboardGuard';
import { adminRole, doctorRole } from '@/lib/roles';
import { dbOperations } from '@/lib/db';

interface ChatMsg { from: 'me' | 'them'; text: string; }
type Phase = 'lobby' | 'call' | 'ended';

function fmtTimer(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
const initials = (name: string) => name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() || '?';

// Renders a live MediaStream (self camera). Mirrored like every video app.
function SelfVideo({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={className} style={{ transform: 'scaleX(-1)' }} />;
}

export default function ConsultRoomPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;

  const session = useDashboardGuard();
  const [ready, setReady] = useState(false);
  const [otherName, setOtherName] = useState('Participant');
  const [selfName, setSelfName] = useState('You');
  const [amDoctor, setAmDoctor] = useState(false);
  const [scheduled, setScheduled] = useState('');

  const [phase, setPhase] = useState<Phase>('lobby');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const [seconds, setSeconds] = useState(0);
  const [remote, setRemote] = useState<'connecting' | 'connected'>('connecting');
  const [tab, setTab] = useState<'chat' | 'notes'>('chat');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load appointment context.
  useEffect(() => {
    const s = session;
    if (!s) return;
    const appt = dbOperations.getAppointment(appointmentId);
    if (!appt) { router.push('/login'); return; }
    const doctor = dbOperations.getDoctor(appt.doctorId);
    const patient = dbOperations.getPatient(appt.patientId);
    const doctorUser = doctor ? dbOperations.getUserById(doctor.userId) : undefined;
    const patientUser = patient ? dbOperations.getUserById(patient.userId) : undefined;
    const isDoctor = s.user.role === doctorRole || s.user.role === adminRole;
        setAmDoctor(isDoctor);
    setSelfName(s.user.name);
    setOtherName(isDoctor ? (patientUser?.name ?? 'Patient') : (doctorUser ? `Dr. ${doctorUser.name}` : 'Doctor'));
    setScheduled(`${appt.date} · ${appt.time}`);
    setReady(true);
  }, [appointmentId, router, session]);

  // Acquire the camera/mic once, on mount.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
      })
      .catch(() => setMediaError(true));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Reflect toggles onto the real tracks.
  useEffect(() => { streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn)); }, [micOn, stream]);
  useEffect(() => { streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn, stream]);

  // In-call: timer + simulated remote join + a canned greeting.
  useEffect(() => {
    if (phase !== 'call') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const connectT = setTimeout(() => setRemote('connected'), 2500);
    const greetT = setTimeout(
      () => setMessages((m) => [...m, { from: 'them', text: amDoctor ? 'Hello doctor, thank you for seeing me.' : `Hello, I can see and hear you. How are you feeling today?` }]),
      5000,
    );
    return () => { clearInterval(timer); clearTimeout(connectT); clearTimeout(greetT); };
  }, [phase, amDoctor]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  if (!session || !ready) return null;

  const sendMessage = () => {
    if (!draft.trim()) return;
    setMessages((m) => [...m, { from: 'me', text: draft.trim() }]);
    setDraft('');
  };

  const saveNote = () => {
    if (!note.trim()) return;
    const appt = dbOperations.getAppointment(appointmentId);
    if (appt) {
      dbOperations.createMedicalRecord({
        id: `med-${Date.now()}`, patientId: appt.patientId, appointmentId, doctorId: appt.doctorId,
        diagnosis: `[Teleconsult note] ${note.trim()}`, prescription: '', labReports: [], createdAt: new Date().toISOString(),
      });
    }
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const endCall = (markComplete: boolean) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (markComplete && amDoctor) dbOperations.updateAppointment(appointmentId, { status: 'completed' });
    setPhase('ended');
  };

  // ---- Lobby ---------------------------------------------------------------
  if (phase === 'lobby') {
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-3xl">
          <h1 className="text-xl font-semibold text-center mb-1">Ready to join?</h1>
          <p className="text-sm text-slate-400 text-center mb-6">Video consultation with {otherName} · {scheduled}</p>

          <div className="relative aspect-video rounded-2xl bg-slate-800 overflow-hidden border border-slate-700">
            {stream && camOn && !mediaError ? (
              <SelfVideo stream={stream} className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                {mediaError ? <CameraOff className="w-10 h-10 mb-2" /> : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-4xl font-bold text-white">{initials(selfName)}</div>}
                <p className="text-sm mt-3">{mediaError ? 'Camera unavailable — you can still join' : 'Camera is off'}</p>
              </div>
            )}
            <span className="absolute bottom-3 left-3 text-sm bg-black/40 px-2 py-1 rounded-md">{selfName} (you)</span>
          </div>

          {/* Device controls */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => setMicOn((v) => !v)} disabled={mediaError} className={`w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-40 ${micOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500'}`}>
              {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button onClick={() => setCamOn((v) => !v)} disabled={mediaError} className={`w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-40 ${camOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500'}`}>
              {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          </div>

          <div className="flex justify-center mt-6">
            <button onClick={() => setPhase('call')} className="px-8 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-teal-600 font-semibold hover:opacity-95 flex items-center gap-2">
              <VideoIcon className="w-5 h-5" /> Join now
            </button>
          </div>
          <button onClick={() => router.push(`/appointment/${appointmentId}`)} className="mx-auto mt-4 flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-4 h-4" /> Back to appointment
          </button>
        </div>
      </div>
    );
  }

  // ---- Ended ---------------------------------------------------------------
  if (phase === 'ended') {
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <PhoneOff className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-semibold">Call ended</h1>
          <p className="text-sm text-slate-400 mt-1">Duration {fmtTimer(seconds)} · with {otherName}</p>
          <button onClick={() => router.push(`/appointment/${appointmentId}`)} className="mt-6 px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-medium">
            Back to appointment
          </button>
        </div>
      </div>
    );
  }

  // ---- In call -------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-950/60">
        <div>
          <p className="font-semibold">Video Consultation</p>
          <p className="text-xs text-slate-400">with {otherName}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:flex items-center gap-1 text-green-400"><Signal className="w-4 h-4" /> HD</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="tabular-nums text-slate-300">{fmtTimer(seconds)}</span></span>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Stage */}
        <div className="flex-1 relative p-4 flex items-center justify-center">
          {/* Remote tile */}
          <div className="w-full h-full max-w-4xl rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative overflow-hidden">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-4xl font-bold">
              {initials(otherName)}
            </div>
            {remote === 'connecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50">
                <div className="w-8 h-8 rounded-full border-2 border-slate-500 border-t-white animate-spin mb-3" />
                <p className="text-sm text-slate-300">Connecting to {otherName}…</p>
              </div>
            )}
            <span className="absolute bottom-3 left-3 text-sm bg-black/40 px-2 py-1 rounded-md flex items-center gap-2">
              {otherName}
              {remote === 'connected' && <span className="w-2 h-2 rounded-full bg-green-400" />}
            </span>
          </div>

          {/* Self PiP */}
          <div className="absolute bottom-6 right-6 w-32 h-44 sm:w-44 sm:h-56 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-center overflow-hidden shadow-lg">
            {stream && camOn && !mediaError ? (
              <SelfVideo stream={stream} className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-slate-400">
                {camOn ? <div className="w-14 h-14 rounded-full bg-slate-600 flex items-center justify-center text-xl font-bold">{initials(selfName)}</div> : <VideoOff className="w-6 h-6" />}
              </div>
            )}
            <span className="absolute bottom-2 left-2 text-[11px] bg-black/40 px-1.5 py-0.5 rounded">You</span>
          </div>
        </div>

        {/* Side panel */}
        <div className="hidden md:flex w-80 flex-col bg-slate-800 border-l border-slate-700">
          <div className="flex border-b border-slate-700">
            <button onClick={() => setTab('chat')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${tab === 'chat' ? 'text-white border-b-2 border-cyan-400' : 'text-slate-400'}`}>
              <MessageSquare className="w-4 h-4" /> Chat
            </button>
            {amDoctor && (
              <button onClick={() => setTab('notes')} className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${tab === 'notes' ? 'text-white border-b-2 border-cyan-400' : 'text-slate-400'}`}>
                <FileText className="w-4 h-4" /> Notes
              </button>
            )}
          </div>

          {tab === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && <p className="text-xs text-slate-500 text-center mt-6">Messages are private to this call.</p>}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <span className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.from === 'me' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-100'}`}>{m.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-slate-700 flex gap-2">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type a message…" className="flex-1 bg-slate-700 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                <button onClick={sendMessage} className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500"><Send className="w-4 h-4" /></button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col p-3">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Consultation notes (saved to the patient's medical record)…" className="flex-1 bg-slate-700 rounded-lg p-3 text-sm resize-none placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
              <button onClick={saveNote} className="mt-2 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium flex items-center justify-center gap-2">
                {noteSaved ? <><CheckCircle2 className="w-4 h-4 text-green-400" /> Saved</> : 'Save note to record'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-4 bg-slate-950/60">
        <button onClick={() => setMicOn((v) => !v)} className={`w-12 h-12 rounded-full flex items-center justify-center ${micOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'}`} aria-label="Toggle microphone">
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button onClick={() => setCamOn((v) => !v)} className={`w-12 h-12 rounded-full flex items-center justify-center ${camOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'}`} aria-label="Toggle camera">
          {camOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button onClick={() => endCall(false)} className="h-12 px-6 rounded-full bg-red-600 hover:bg-red-700 flex items-center gap-2 font-semibold">
          <PhoneOff className="w-5 h-5" /> Leave
        </button>
        {amDoctor && (
          <button onClick={() => endCall(true)} className="h-12 px-5 rounded-full bg-green-600 hover:bg-green-700 flex items-center gap-2 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" /> End &amp; complete
          </button>
        )}
      </div>
    </div>
  );
}
