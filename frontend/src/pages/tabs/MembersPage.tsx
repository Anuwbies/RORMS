import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, onSnapshot, orderBy, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '../../firebase'
import { UsersIcon, UserIcon, EditIcon, TrashIcon, MinusCircleIcon, ChevronDownIcon, CheckIcon, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, FilterIcon, BellIcon, MailIcon, CloseIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'

import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import { AnthillColonyQueue } from '../../components/AnthillColonyQueue'
import type { MemberRole, MemberStatus, Department, Member } from '../../types/member'
import { Button } from '../../components/Button'
import { FilterDropdown } from '../../components/FilterDropdown'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { Snackbar } from '../../components/Snackbar'
const rolePriority: Record<MemberRole, number> = {
  Admin: 0,
  Registrar: 1,
  Dean: 2,
  'Program Head': 3,
  Instructor: 4,
}

const statusPriority: Record<MemberStatus, number> = {
  Active: 0,
  Pending: 1,
  Deactivated: 2,
}

const roleClasses: Record<MemberRole, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}

const statusClasses: Record<MemberStatus, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Deactivated: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

const ROLE_HEX: Record<MemberRole, string> = {
  Admin: '#9333ea',
  Registrar: '#2563eb',
  Dean: '#d97706',
  'Program Head': '#e11d48',
  Instructor: '#059669',
}

// Deterministic dust motes (no re-render randomness)
const HR_DUST_MOTES = [
  { left: '18%', top: '46%', dur: '9s', delay: '0s', size: '0.45cqw', drift: '4cqw' },
  { left: '34%', top: '58%', dur: '11s', delay: '2.2s', size: '0.35cqw', drift: '-3cqw' },
  { left: '52%', top: '50%', dur: '10s', delay: '4.1s', size: '0.5cqw', drift: '5cqw' },
  { left: '66%', top: '64%', dur: '12s', delay: '1.3s', size: '0.32cqw', drift: '-4cqw' },
  { left: '78%', top: '54%', dur: '9.5s', delay: '3.4s', size: '0.42cqw', drift: '3cqw' },
  { left: '88%', top: '68%', dur: '10.5s', delay: '5.2s', size: '0.36cqw', drift: '-2cqw' },
  { left: '44%', top: '74%', dur: '11.5s', delay: '6.1s', size: '0.4cqw', drift: '4cqw' },
]

/**
 * Homeroom Roster — a whimsical top-down classroom scene.
 * Every active member gets a desk seat (color-coded by role, initialed),
 * Admins sit behind the teacher's desk, pending invites occupy dashed
 * "waiting list" seats, and the chalkboard acts as a live legend.
 */
function HomeroomRosterVisual({ members }: { members: Member[] }) {
  const activeMembers = useMemo(() => members.filter(m => m.status === 'Active'), [members])
  const pendingMembers = useMemo(() => members.filter(m => m.status === 'Pending'), [members])
  const admins = activeMembers.filter(m => m.role === 'Admin')
  const students = activeMembers.filter(m => m.role !== 'Admin')

  const roleCounts = (['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor'] as MemberRole[]).map(role => ({
    role,
    count: activeMembers.filter(m => m.role === role).length,
  }))

  const deskFont = students.length > 44 ? '0.78cqw' : students.length > 22 ? '0.92cqw' : '1.08cqw'

  const initialsOf = (m: Member) => {
    const src = (m.name || m.email || '?').trim()
    const parts = src.split(/\s+/)
    if (m.name && parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return src.slice(0, 2).toUpperCase()
  }

  return (
    <div className="@container absolute inset-0 overflow-hidden rounded-xl border border-[#d9c9a8] shadow-inner">
      <style>{`
        @keyframes hrSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes hrSway {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-0.3em); }
        }
        @keyframes hrPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes hrFloat {
          0% { transform: translate(0, 0); opacity: 0; }
          20% { opacity: 0.65; }
          80% { opacity: 0.4; }
          100% { transform: translate(var(--drift, 3cqw), -2.6cqw); opacity: 0; }
        }
        @keyframes hrSteam {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          25% { opacity: 0.65; }
          100% { transform: translateY(-1.7cqw) scale(1.5); opacity: 0; }
        }
        @keyframes hrBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>

      {/* Classroom Wall */}
      <div className="absolute inset-x-0 top-0 h-[36%] bg-gradient-to-b from-[#f2f5ea] to-[#e2e9d3]" />

      {/* Baseboard Trim */}
      <div className="absolute inset-x-0 top-[36%] h-[2.5%] border-y border-[#96794f]/40 bg-[#b09a72]" />

      {/* Wooden Plank Floor */}
      <div
        className="absolute inset-x-0 bottom-0 top-[38.5%]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #cfa76f 0, #cfa76f 4.5cqw, #bd9157 4.5cqw, #bd9157 4.9cqw), linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.07))',
        }}
      />

      {/* Drifting Dust Motes */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {HR_DUST_MOTES.map((mote, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white shadow-[0_0_3px_rgba(255,255,255,0.9)]"
            style={{
              left: mote.left,
              top: mote.top,
              width: mote.size,
              height: mote.size,
              animation: `hrFloat ${mote.dur} ease-in-out ${mote.delay} infinite`,
              '--drift': mote.drift,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Chalkboard Legend */}
      <div className="absolute left-[3%] top-[4%] z-10 w-[46%] rounded-md border-[0.45cqw] border-[#8a5a2b] bg-[#2e4d33] p-[1cqw] shadow-md">
        <p
          className="text-[1.5cqw] font-black uppercase leading-none tracking-[0.22em] text-amber-100/90"
          style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive" }}
        >
          Role Homeroom
          <span
            aria-hidden
            className="ml-[0.5cqw] inline-block h-[1.2cqw] w-[0.55cqw] translate-y-[0.15cqw] bg-amber-200/90"
            style={{ animation: 'hrBlink 1.1s steps(1) infinite' }}
          />
        </p>
        <div className="mt-[0.8cqw] space-y-[0.32cqw]">
          {roleCounts.map(({ role, count }) => (
            <div key={role} className="flex items-center gap-[0.7cqw]">
              <span
                className="h-[0.9cqw] w-[0.9cqw] shrink-0 rounded-full border border-white/30"
                style={{ backgroundColor: ROLE_HEX[role] }}
              />
              <span className="truncate text-[1.02cqw] leading-none text-emerald-50/85">{role}</span>
              <span className="ml-auto text-[1.02cqw] font-bold leading-none text-amber-200">{count}</span>
            </div>
          ))}
          {pendingMembers.length > 0 && (
            <div className="mt-[0.3cqw] flex items-center gap-[0.7cqw] border-t border-dashed border-white/20 pt-[0.35cqw]">
              <span className="truncate text-[1.02cqw] leading-none text-emerald-50/65">Waiting List</span>
              <span className="ml-auto text-[1.02cqw] font-bold leading-none text-amber-200">{pendingMembers.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Wall Clock (ticking hands) */}
      <div className="absolute left-[56%] top-[7%] z-10 h-[4.6cqw] w-[4.6cqw] rounded-full border-[0.4cqw] border-slate-600 bg-white shadow">
        <div className="absolute left-1/2 top-1/2 h-[1.05cqw] w-[0.24cqw] origin-bottom -translate-x-1/2 -translate-y-full rotate-[300deg] rounded bg-slate-700" />
        <div className="absolute left-1/2 top-1/2 h-[0.85cqw] w-[0.22cqw] origin-bottom -translate-x-1/2 -translate-y-full">
          <div
            className="h-full w-full origin-bottom rounded bg-slate-700"
            style={{ animation: 'hrSpin 40s linear infinite' }}
          />
        </div>
        <div className="absolute left-1/2 top-1/2 h-[1.3cqw] w-[0.14cqw] origin-bottom -translate-x-1/2 -translate-y-full">
          <div
            className="h-full w-full origin-bottom rounded-full bg-rose-500"
            style={{ animation: 'hrSpin 8s linear infinite' }}
          />
          <span className="absolute -bottom-[0.28cqw] left-1/2 h-[0.28cqw] w-[0.28cqw] -translate-x-1/2 rounded-full bg-rose-500" />
        </div>
        <div className="absolute left-1/2 top-1/2 h-[0.35cqw] w-[0.35cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500" />
      </div>

      {/* Teacher's Desk (Admins) */}
      <div className="absolute right-[4%] top-[13%] z-10 flex w-[30%] flex-col items-center">
        <div className="relative z-10 -mb-[1.2cqw] flex min-h-[3.2cqw] items-end justify-center gap-[1.8cqw]">
          {admins.map((admin, i) => (
            <div
              key={admin.id}
              title={admin.name ? `${admin.name} — Admin` : `${admin.email} — Admin`}
              className="flex cursor-default flex-col items-center"
              style={{ animation: 'hrSway 3.6s ease-in-out infinite', animationDelay: `${i * 0.6}s` }}
            >
              <span className="-mb-[0.4cqw] text-[1.3cqw] leading-none drop-shadow-sm">👑</span>
              <span
                className="h-[1.8cqw] w-[1.8cqw] rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: ROLE_HEX.Admin }}
              />
              <span
                className="h-[1.2cqw] w-[2.8cqw] rounded-t-full border border-b-0 border-black/10"
                style={{ backgroundColor: ROLE_HEX.Admin, opacity: 0.85 }}
              />
            </div>
          ))}
        </div>
        <div className="relative z-0 flex h-[3.4cqw] w-full items-start justify-center rounded-t-md border-x-2 border-t-2 border-[#a87e54] bg-gradient-to-b from-[#e2bf8d] to-[#cfa76f] pt-[0.5cqw] shadow-md">
          {/* Steaming Coffee Mug */}
          <div className="pointer-events-none absolute left-[7%] top-[-1cqw] flex flex-col items-center">
            <span
              className="absolute -top-[1.1cqw] h-[1cqw] w-[0.28cqw] rounded-full bg-white/80 blur-[1px]"
              style={{ animation: 'hrSteam 2.4s ease-out infinite' }}
            />
            <span
              className="absolute -top-[1.1cqw] h-[0.8cqw] w-[0.24cqw] rounded-full bg-white/70 blur-[1px]"
              style={{ animation: 'hrSteam 2.4s ease-out 1.2s infinite' }}
            />
            <span className="h-[0.95cqw] w-[0.85cqw] rounded-b-[0.25cqw] border border-[#8a5a2b] bg-white shadow-sm" />
            <span className="absolute right-[-0.3cqw] top-[0.15cqw] h-[0.45cqw] w-[0.45cqw] rounded-full border-2 border-[#8a5a2b]" />
          </div>
          <span className="rounded-sm border border-[#8a5a2b] bg-[#fdf8f0] px-[0.8cqw] py-[0.15cqw] text-[0.95cqw] font-black uppercase tracking-[0.2em] text-[#6b4e2e] shadow-sm">
            Front Office
          </span>
        </div>
      </div>

      {/* Student Desks & Waiting List Seats */}
      <div className="absolute inset-x-[3%] bottom-[3.5%] top-[43%] z-10 flex flex-wrap content-start items-start overflow-hidden gap-x-[1.4cqw] gap-y-[0.9cqw]">
        {students.map((m, idx) => (
          <div
            key={`${m.membershipId || m.id}-desk`}
            title={m.name ? `${m.name} — ${m.role}` : `${m.email} — ${m.role}`}
            className="group flex cursor-default flex-col items-center transition-transform duration-200 hover:z-30 hover:-translate-y-[2px] hover:scale-[1.05]"
            style={{ width: '6.4cqw', fontSize: deskFont }}
          >
            <div
              className="relative z-10 -mb-[0.9em] flex flex-col items-center"
              style={{ animation: 'hrSway 2.6s ease-in-out infinite', animationDelay: `${(idx * 0.37) % 2.6}s` }}
            >
              <span
                className="block h-[1.6em] w-[1.6em] rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: ROLE_HEX[m.role] }}
              />
              <span
                className="mx-auto block h-[1em] w-[2.4em] rounded-t-full border border-b-0 border-black/10"
                style={{ backgroundColor: ROLE_HEX[m.role], opacity: 0.85 }}
              />
            </div>
            <div className="z-0 flex h-[2.4em] w-full items-center justify-center rounded-[0.3em] border border-[#a87e54] bg-gradient-to-b from-[#e2bf8d] to-[#d0a86e] shadow-sm transition-shadow group-hover:shadow-md">
              <span className="font-black tracking-wide text-[#5f4526]">{initialsOf(m)}</span>
            </div>
          </div>
        ))}

        {pendingMembers.map(m => (
          <div
            key={`waiting-${m.id}`}
            title={`Invitation pending — ${m.email}`}
            className="flex cursor-help flex-col items-center transition-opacity hover:opacity-100"
            style={{ width: '6.4cqw', fontSize: deskFont, animation: 'hrPulse 2.8s ease-in-out infinite' }}
          >
            <span className="mb-[0.9em] flex h-[1.6em] w-[2.4em] items-center justify-center rounded-t-full border-2 border-dashed border-slate-400 pb-[0.1em] text-[0.9em] font-bold leading-none text-slate-400">
              ?
            </span>
            <div className="flex h-[2.4em] w-full items-center justify-center rounded-[0.3em] border border-dashed border-slate-400 bg-white/50">
              <span className="text-[0.8em] font-black tracking-widest text-slate-400">•••</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Deterministic cloud layout (no render randomness)
const EXP_CLOUDS = [
  { top: '7%', size: '10cqw', dur: '46s', delay: '-9s' },
  { top: '15%', size: '7cqw', dur: '60s', delay: '-32s' },
  { top: '4%', size: '5.5cqw', dur: '38s', delay: '-20s' },
]

/**
 * Pending Platform — a whimsical train-station scene where every pending
 * invitation is a figure waiting to come aboard. Figures are colored by
 * their invited role, the departures board lists the waiting queue, and an
 * express periodically chugs through behind the platform.
 */
function PendingPlatformVisual({ invites }: { invites: Member[] }) {
  const shown = invites.slice(0, 8)
  const seated = shown.slice(0, Math.min(3, shown.length))
  const standers = shown.slice(3)
  const overflow = invites.length - shown.length

  const figFont = invites.length > 10 ? '0.85cqw' : invites.length > 6 ? '1.05cqw' : '1.25cqw'
  const isEmpty = invites.length === 0

  return (
    <div className="@container absolute inset-0 overflow-hidden rounded-xl border border-slate-200 shadow-inner">
      <style>{`
        @keyframes expScrollA { from { background-position-x: 0; } to { background-position-x: -300px; } }
        @keyframes expScrollB { from { background-position-x: 0; } to { background-position-x: -480px; } }
        @keyframes expCloud { from { transform: translateX(110cqw); } to { transform: translateX(-30cqw); } }
        @keyframes expPass { from { transform: translateX(0); } to { transform: translateX(170cqw); } }
        @keyframes expSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes expBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-0.22cqw); } }
        @keyframes expSmoke {
          0% { transform: translate(0, 0) scale(0.7); opacity: 0.85; }
          100% { transform: translate(-2.4cqw, -4.6cqw) scale(1.6); opacity: 0; }
        }
        @keyframes expSway {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-0.24em); }
        }
        @keyframes expBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes expGlow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
      `}</style>

      {/* Sky */}
      <div className="absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-[#dff0fb] via-[#cfe7f7] to-[#e8f3db]" />

      {/* Drifting Clouds */}
      {EXP_CLOUDS.map((cloud, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute z-[1]"
          style={{ top: cloud.top, left: 0, animation: `expCloud ${cloud.dur} linear ${cloud.delay} infinite` }}
        >
          <div className="relative" style={{ width: cloud.size, height: `calc(${cloud.size} * 0.34)` }}>
            <span className="absolute bottom-0 left-0 h-[70%] w-[45%] rounded-full bg-white/85" />
            <span className="absolute bottom-0 left-[28%] h-full w-[46%] rounded-full bg-white/95" />
            <span className="absolute bottom-0 right-0 h-[64%] w-[40%] rounded-full bg-white/80" />
          </div>
        </div>
      ))}

      {/* Parallax Hills (cqw-sized domes scale with the card) */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[30%] z-[2] h-[17%]"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 100%, #bccfa1 0 58%, transparent 59%)',
          backgroundSize: '22cqw 100%',
          backgroundRepeat: 'repeat-x',
          backgroundPositionX: '4cqw',
          animation: 'expScrollA 26s linear infinite',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[27%] z-[2] h-[13%]"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 100%, #94ad75 0 56%, transparent 57%)',
          backgroundSize: '15cqw 100%',
          backgroundRepeat: 'repeat-x',
          backgroundPositionX: '11cqw',
          animation: 'expScrollB 17s linear infinite',
        }}
      />

      {/* Grassy Ground */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 z-[3] h-[29%] bg-gradient-to-b from-[#93b171] to-[#7d9c5d]" />

      {/* Railway Track */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-[8.4%] z-[4] h-[2.1cqw]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #6b4e2e 0, #6b4e2e 1cqw, transparent 1cqw, transparent 2.6cqw)',
          opacity: 0.85,
        }}
      />
      <div aria-hidden className="absolute inset-x-0 bottom-[11.6%] z-[4] h-[0.3cqw] rounded bg-slate-600 opacity-50" />
      <div aria-hidden className="absolute inset-x-0 bottom-[9%] z-[5] h-[0.36cqw] rounded bg-slate-600" />

      {/* ═══ Express Train (loops across behind the platform) ═══ */}
      <div
        aria-hidden
        className="absolute bottom-[9.6%] left-[-52cqw] z-[5] flex items-end"
        style={{ animation: 'expPass 17s linear infinite', willChange: 'transform' }}
      >
        <div className="flex items-end gap-[0.9cqw]" style={{ animation: 'expBob 0.65s ease-in-out infinite' }}>
          {/* Passenger Carriage */}
          <div className="relative h-[6.4cqw] w-[19cqw] rounded-md border-2 border-slate-700 bg-gradient-to-b from-[#5b83ba] to-[#4a72a8]">
            <div className="absolute inset-x-[0.6cqw] top-[0.35cqw] h-[0.55cqw] rounded-sm bg-slate-600" />
            <p className="absolute inset-x-0 top-[1.7cqw] text-center text-[0.78cqw] font-black uppercase tracking-[0.3em] text-white/90">
              RORMS Express
            </p>
            <div className="absolute inset-x-[1cqw] bottom-[1cqw] flex justify-between">
              {[0, 1, 2].map(w => (
                <span key={w} className="h-[1.5cqw] w-[1.5cqw] rounded-[0.25cqw] border border-slate-600 bg-sky-100/90" />
              ))}
            </div>
            {/* Carriage wheels */}
            {[2.4, 14.6].map(wx => (
              <span
                key={wx}
                className="absolute -bottom-[1cqw] h-[2cqw] w-[2cqw] rounded-full border-[0.3cqw] border-slate-500 bg-slate-800"
                style={{ left: `${wx}cqw` }}
              >
                <span className="block h-full w-full rounded-full" style={{ animation: 'expSpin 0.9s linear infinite' }}>
                  <span className="mx-auto block h-full w-[0.16cqw] bg-slate-400" />
                </span>
              </span>
            ))}
          </div>

          {/* Coupling */}
          <span className="mb-[1.6cqw] h-[0.5cqw] w-[1.7cqw] rounded bg-slate-600" />

          {/* Locomotive */}
          <div className="relative h-[9.4cqw] w-[22cqw]">
            <div className="absolute bottom-[1.7cqw] left-0 h-[4.8cqw] w-[13.5cqw] rounded-l-full border-2 border-slate-700 bg-gradient-to-b from-slate-400 to-slate-600" />
            <div className="absolute bottom-[1.7cqw] right-0 h-[7cqw] w-[7.5cqw] rounded-sm border-2 border-slate-700 bg-gradient-to-b from-[#4a72a8] to-[#3f6396]">
              <span className="absolute left-[1cqw] top-[0.9cqw] h-[1.9cqw] w-[2.4cqw] rounded-sm border border-slate-600 bg-sky-100/90" />
            </div>
            {/* Chimney + smoke */}
            <div className="absolute bottom-[6.3cqw] left-[2.4cqw] h-[2.8cqw] w-[1.5cqw] rounded-t-sm border-2 border-slate-700 bg-slate-800">
              <span className="absolute -top-[0.35cqw] left-1/2 h-[0.55cqw] w-[2.1cqw] -translate-x-1/2 rounded-full border-2 border-slate-700 bg-slate-700" />
            </div>
            {[0, 1, 2].map(s => (
              <span
                key={s}
                className="absolute h-[1.5cqw] w-[1.5cqw] rounded-full bg-white/75 blur-[1px]"
                style={{
                  left: '2.3cqw',
                  top: '-0.6cqw',
                  animation: `expSmoke 2.2s ease-out ${s * 0.73}s infinite`,
                }}
              />
            ))}
            {/* Cowcatcher */}
            <span
              className="absolute -right-[0.2cqw] bottom-[1.4cqw] h-[1.9cqw] w-[2.1cqw] bg-amber-600"
              style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
            />
            {/* Wheels with spinning spokes */}
            {[2.6, 7.4, 16.4].map(wx => (
              <span
                key={wx}
                className="absolute -bottom-[1.25cqw] h-[2.6cqw] w-[2.6cqw] rounded-full border-[0.35cqw] border-slate-500 bg-slate-900"
                style={{ left: `${wx}cqw` }}
              >
                <span className="block h-full w-full rounded-full" style={{ animation: 'expSpin 0.8s linear infinite' }}>
                  <span className="mx-auto block h-full w-[0.18cqw] bg-slate-400" />
                  <span className="absolute left-1/2 top-1/2 block h-[0.18cqw] w-full -translate-x-1/2 -translate-y-1/2 bg-slate-400" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Station Platform (foreground) ═══ */}
      <div className="absolute bottom-0 left-0 z-[6] h-[34%] w-[54%]">
        {/* Top cap = the standing surface */}
        <div className="absolute inset-x-0 top-0 h-[24%] border-t-[0.45cqw] border-amber-300/90 bg-slate-200 shadow-[inset_0_-0.4cqw_0_rgba(0,0,0,0.08)]" />
        {/* Front face */}
        <div className="absolute inset-x-0 bottom-0 h-[76%] bg-slate-300 shadow-[inset_0_0.5cqw_0_rgba(255,255,255,0.35)]" />

        {/* Signpost (planted through the cap) */}
        <div className="absolute bottom-[68%] left-[5%] flex flex-col items-center">
          <div className="-rotate-2 rounded-md border-2 border-slate-800 bg-[#27406b] px-[0.9cqw] py-[0.35cqw] shadow-md">
            <span className="text-[0.72cqw] font-black uppercase tracking-[0.18em] text-sky-100">Pending Platform</span>
          </div>
          <span className="h-[5.4cqw] w-[0.5cqw] rounded-b bg-slate-600" />
        </div>

        {/* Lamp Post (flickering glow, planted through the cap) */}
        <div className="absolute bottom-[70%] right-[7%] flex flex-col items-center">
          <span
            aria-hidden
            className="absolute -top-[1.2cqw] h-[4cqw] w-[4cqw] rounded-full bg-amber-200/60 blur-[0.5cqw]"
            style={{ animation: 'expGlow 3.4s ease-in-out infinite' }}
          />
          <span className="relative z-10 h-[2.2cqw] w-[1.9cqw] rounded-t-md border-2 border-slate-700 bg-amber-100 shadow-inner" />
          <span className="relative z-10 h-[6.2cqw] w-[0.55cqw] rounded-b bg-slate-600" />
        </div>

        {/* Waiting Figures (seated/queued on the cap surface) */}
        {!isEmpty && (
          <div
            className="absolute bottom-[76%] left-[20%] right-[4%] flex items-end justify-start gap-[2.2cqw]"
            style={{ fontSize: figFont }}
          >
            {seated.map((inv, i) => (
              <div
                key={inv.id}
                title={`Waiting — ${inv.email}`}
                className="group flex cursor-default flex-col items-center transition-transform duration-200 hover:-translate-y-[2px] hover:scale-[1.05]"
              >
                <div
                  className="relative z-10 flex flex-col items-center"
                  style={{ animation: 'expSway 2.8s ease-in-out infinite', animationDelay: `${i * 0.5}s` }}
                >
                  <span
                    className="block h-[1.7em] w-[1.7em] rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: ROLE_HEX[inv.role] }}
                  />
                  <span
                    className="block h-[1.05em] w-[2.5em] rounded-t-full border border-b-0 border-black/10"
                    style={{ backgroundColor: ROLE_HEX[inv.role], opacity: 0.85 }}
                  />
                </div>
                {/* Stool (legs sink into the cap) */}
                <span className="-mt-[0.35em] block h-[0.5em] w-[3em] rounded-sm border border-slate-500 bg-[#d9b382] shadow-sm" />
                <span className="-mt-[0.15em] flex w-[2.4em] justify-between">
                  <span className="h-[0.9em] w-[0.3em] rounded-b bg-slate-500" />
                  <span className="h-[0.9em] w-[0.3em] rounded-b bg-slate-500" />
                </span>
              </div>
            ))}

            {standers.map((inv, i) => (
              <div
                key={inv.id}
                title={`In queue — ${inv.email}`}
                className="group flex cursor-default flex-col items-center transition-transform duration-200 hover:-translate-y-[2px] hover:scale-[1.05]"
                style={{ marginLeft: i > 0 ? '-0.6cqw' : undefined }}
              >
                <div
                  className="relative z-10 flex flex-col items-center"
                  style={{ animation: 'expSway 3.1s ease-in-out infinite', animationDelay: `${0.3 + i * 0.42}s` }}
                >
                  <span
                    className="block h-[1.8em] w-[1.8em] rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: ROLE_HEX[inv.role] }}
                  />
                  <span
                    className="block h-[1.9em] w-[2.6em] rounded-t-full border border-b-0 border-black/10"
                    style={{ backgroundColor: ROLE_HEX[inv.role], opacity: 0.85 }}
                  />
                </div>
                <span className="mt-[-0.2em] h-[0.4em] w-[2.6em] rounded-full bg-black/10 blur-[1px]" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Station Clock (hanging from the top edge) */}
      <div className="absolute left-[30%] top-0 z-[8] flex flex-col items-center">
        <span className="h-[2.4cqw] w-[0.3cqw] bg-slate-500" />
        <div className="relative h-[4.4cqw] w-[4.4cqw] rounded-full border-[0.38cqw] border-slate-700 bg-white shadow-md">
          <div className="absolute left-1/2 top-1/2 h-[1cqw] w-[0.2cqw] origin-bottom -translate-x-1/2 -translate-y-full rotate-[210deg] rounded bg-slate-700" />
          <div className="absolute left-1/2 top-1/2 h-[0.8cqw] w-[0.18cqw] origin-bottom -translate-x-1/2 -translate-y-full">
            <div
              className="h-full w-full origin-bottom rounded bg-slate-700"
              style={{ animation: 'expSpin 40s linear infinite' }}
            />
          </div>
          <div className="absolute left-1/2 top-1/2 h-[0.32cqw] w-[0.32cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500" />
        </div>
      </div>

      {/* Departures Board */}
      <div className="absolute right-[3%] top-[6%] z-[8] w-[36%] rounded-lg border-[0.4cqw] border-slate-700 bg-[#101826] p-[1cqw] shadow-lg">
        <div className="flex items-center gap-[0.6cqw]">
          <span
            aria-hidden
            className="h-[0.75cqw] w-[0.75cqw] shrink-0 rounded-full bg-emerald-400"
            style={{ animation: 'expBlink 1.3s steps(1) infinite' }}
          />
          <span className="text-[0.95cqw] font-black uppercase tracking-[0.24em] text-sky-300">Departures</span>
          <span className="ml-auto rounded-full border border-sky-400/30 bg-sky-400/10 px-[0.7cqw] py-[0.12cqw] text-[0.8cqw] font-black leading-none text-sky-300">
            {invites.length} waiting
          </span>
        </div>
        <div className="my-[0.7cqw] border-t border-white/10" />

        {isEmpty ? (
          <div className="py-[1.4cqw] text-center">
            <p className="text-[1.5cqw] font-black tracking-wide text-emerald-300">ALL ABOARD ✓</p>
            <p className="mt-[0.3cqw] text-[0.85cqw] text-slate-400">No pending invitations</p>
          </div>
        ) : (
          <div className="space-y-[0.45cqw]">
            {shown.slice(0, 3).map(inv => (
              <div key={inv.id} className="flex items-center gap-[0.6cqw]" title={`${inv.email} — invited as ${inv.role}`}>
                <span
                  className="h-[0.8cqw] w-[0.8cqw] shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: ROLE_HEX[inv.role] }}
                />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[0.92cqw] leading-none text-slate-200">
                  {inv.email.split('@')[0] || inv.email}
                </span>
                <span className="shrink-0 text-[0.8cqw] font-bold leading-none text-sky-400">
                  {inv.department || '—'}
                </span>
              </div>
            ))}
            {(overflow > 0 || shown.length > 3) && (
              <p className="pt-[0.15cqw] text-right text-[0.82cqw] italic text-slate-400">
                +{overflow > 0 ? overflow : invites.length - 3} more on the platform
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MembersPage() {
  const [users, setUsers] = useState<Member[]>([])
  const [rawMemberships, setRawMemberships] = useState<any[]>([])
  const [rawInvites, setRawInvites] = useState<any[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<MemberStatus[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})

  // Pagination state is now handled internally by DataTable

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('Instructor')
  const [inviteDepartment, setInviteDepartment] = useState('None')
  const [hasEmailError, setHasEmailError] = useState(false)
  const [isInviting, setIsInviting] = useState(false)

  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editRole, setEditRole] = useState<MemberRole>('Instructor')
  const [editDept, setEditDept] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [isRemovingMember, setIsRemovingMember] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [removeConfirmText, setRemoveConfirmText] = useState('')

  const [memberToReinvite, setMemberToReinvite] = useState<Member | null>(null)
  const [isReinvitingMember, setIsReinvitingMember] = useState(false)

  const [activeDropdowns, setActiveDropdowns] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string>(() => auth.currentUser?.uid || '')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || '')
    })
    return () => unsubscribe()
  }, [])

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  const [isLoading, setIsLoading] = useState(true)

  const [snackbar, setSnackbar] = useState<{
    isOpen: boolean
    message: string
    title?: string
    type: 'error' | 'warning' | 'info' | 'success' | 'brand'
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'success'
  })

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand' = 'success', title?: string) => {
    setSnackbar({
      isOpen: true,
      message,
      title,
      type
    })
  }

  useEffect(() => {
    // 1. Fetch all users to have a local map for joining
    let unsubscribeUsers: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeInvites: (() => void) | null = null
    let unsubscribeDepts: (() => void) | null = null

    let usersLoaded = false
    let membershipsLoaded = false
    let invitesLoaded = false
    let deptsLoaded = false

    const checkFinishedLoading = () => {
      if (usersLoaded && (membershipsLoaded || usersSnapEmpty) && invitesLoaded && deptsLoaded) {
        setIsLoading(false)
      }
    }
    let usersSnapEmpty = false
    // 1. Fetch users to map user details
    unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, { id: uDoc.id, ...uDoc.data() }))
      usersLoaded = true
      if (usersSnap.empty) {
        usersSnapEmpty = true
        setIsLoading(false)
      }

      // 2. Fetch memberships and join with users
      if (unsubscribeMemberships) unsubscribeMemberships()
      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (mSnap) => {
        const activeUserIdsWithMembership = new Set<string>()
        const membersData: Member[] = []
        const rawMList: any[] = []

        mSnap.docs.forEach(mDoc => {
          const mData = mDoc.data()
          rawMList.push({ id: mDoc.id, ...mData })

          // Skip pending memberships where userId is empty (these belong to pending invites and will be merged into the invites list)
          if (!mData.userId || !usersMap.has(mData.userId)) {
            return
          }

          const userData = usersMap.get(mData.userId) || {}
          activeUserIdsWithMembership.add(mData.userId)

          const resolvedDept = mData.department || (
            mData.role === 'Admin' ? 'Administrative Office' :
            mData.role === 'Registrar' ? "Registrar's Office" : ''
          )

          membersData.push({
            id: mData.userId,
            membershipId: mDoc.id,
            name: userData.fullName || mData.fullName || '',
            email: userData.email || mData.email || '',
            role: (mData.role as MemberRole) || 'Instructor',
            status: (userData.isActive !== false) ? 'Active' : 'Deactivated',
            department: resolvedDept,
            joinedDate: userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }) : '— — — — —',
            avatar: userData.profilePicture || '',
          })
        })

        // Include any inactive or deactivated users who do not have an active membership doc
        usersMap.forEach((userData, userId) => {
          if (userData.isActive === false && !activeUserIdsWithMembership.has(userId)) {
            membersData.push({
              id: userId,
              membershipId: '',
              name: userData.fullName || '',
              email: userData.email || '',
              role: 'Instructor',
              status: 'Deactivated',
              department: '',
              joinedDate: userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric'
              }) : '— — — — —',
              avatar: userData.profilePicture || '',
            })
          }
        })

        setUsers(membersData)
        setRawMemberships(rawMList)
        membershipsLoaded = true
        checkFinishedLoading()
      }, () => {
        membershipsLoaded = true
        checkFinishedLoading()
      })
    }, () => {
      usersLoaded = true
      checkFinishedLoading()
    })

    // 3. Listener for pending invitations
    const invitesQuery = query(
      collection(db, 'invitations'),
      where('status', '==', 'pending')
    )
    unsubscribeInvites = onSnapshot(invitesQuery, (snapshot) => {
      const invitesData = snapshot.docs.map((doc) => {
        const data = doc.data()
        // Check if invite is expired
        const now = new Date()
        const isExpired = data.expiresAt && data.expiresAt.toDate() < now
        if (isExpired) return null

        return {
          id: doc.id,
          membershipId: data.membershipId || '',
          email: data.email || '',
          role: (data.role as MemberRole) || '',
          department: data.department || '',
        }
      }).filter(Boolean) as any[]
      setRawInvites(invitesData)
      invitesLoaded = true
      checkFinishedLoading()
    }, () => {
      invitesLoaded = true
      checkFinishedLoading()
    })

    // 4. Listener for departments
    const deptsQuery = query(collection(db, 'departments'), orderBy('code'))
    unsubscribeDepts = onSnapshot(deptsQuery, (snapshot) => {
      const deptsData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.name || '',
          code: data.code || '',
          dean: data.dean || '',
          programHead: data.programHead || ''
        }
      }) as Department[]
      setDepartments(deptsData)
      deptsLoaded = true
      checkFinishedLoading()
    }, () => {
      deptsLoaded = true
      checkFinishedLoading()
    })

    return () => {
      if (unsubscribeUsers) unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
      if (unsubscribeInvites) unsubscribeInvites()
      if (unsubscribeDepts) unsubscribeDepts()
    }
  }, [])

  const invites = useMemo<Member[]>(() => {
    const memsById = new Map(rawMemberships.map(m => [m.id, m]))
    const memsByEmail = new Map(rawMemberships.map(m => [m.email?.toLowerCase(), m]))

    return rawInvites.map((inv: any) => {
      const memData = (inv.membershipId ? memsById.get(inv.membershipId) : null) || memsByEmail.get(inv.email?.toLowerCase())
      const role = (memData?.role || inv.role || 'Instructor') as MemberRole
      const department = memData?.department || inv.department || (
        role === 'Admin' ? 'Administrative Office' :
        role === 'Registrar' ? "Registrar's Office" : ''
      )
      const isReactivation = Boolean(
        inv.isReactivation ||
        (memData?.userId && memData.userId !== '') ||
        users.some(u => u.email.toLowerCase() === inv.email?.toLowerCase())
      )

      return {
        id: inv.id,
        membershipId: inv.membershipId || memData?.id || '',
        name: memData?.fullName || '',
        email: inv.email,
        role,
        status: 'Pending' as MemberStatus,
        department,
        joinedDate: '— — — — —',
        avatar: '',
        isReactivation,
      }
    })
  }, [rawInvites, rawMemberships, users])

  const members = useMemo(() => {
    const userByEmail = new Map(users.map(u => [u.email.toLowerCase(), u]))
    const pendingEmails = new Set(invites.map(inv => inv.email.toLowerCase()))
    const filteredUsers = users.filter(u => {
      // If a deactivated user has an active pending reinvitation, hide the duplicate deactivated row
      if (u.status === 'Deactivated' && pendingEmails.has(u.email.toLowerCase())) {
        return false
      }
      return true
    })

    const mergedInvites = invites.map(inv => {
      const existingUser = userByEmail.get(inv.email.toLowerCase())
      if (existingUser) {
        return {
          ...inv,
          isReactivation: true,
          name: existingUser.name || inv.name,
          joinedDate: (existingUser.joinedDate && !existingUser.joinedDate.includes('—')) ? existingUser.joinedDate : inv.joinedDate,
          avatar: existingUser.avatar || inv.avatar,
        }
      }
      return inv
    })

    return [...filteredUsers, ...mergedInvites]
  }, [users, invites])

  const filteredMembers = members
    .filter((member) => {
      const matchesSearch = [member.name, member.email].some((val) =>
        val.toLowerCase().includes(searchTerm.toLowerCase())
      )
      const matchesRole = selectedRoles.length === 0 || selectedRoles.includes(member.role)
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(member.status)

      const memberDept = member.department || (member.role === 'Admin' ? 'Administrative Office' : member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned')
      const matchesDepartment = selectedDepartments.length === 0 || selectedDepartments.includes(memberDept)

      return matchesSearch && matchesRole && matchesStatus && matchesDepartment
    })
    .sort((a, b) => {
      const statusDiff = (statusPriority[a.status] ?? 0) - (statusPriority[b.status] ?? 0)
      if (statusDiff !== 0) return statusDiff

      // For Pending status: pending re-activations come above pending new user invites
      if (a.status === 'Pending' && b.status === 'Pending') {
        const isReactivationA = a.isReactivation ? 0 : 1
        const isReactivationB = b.isReactivation ? 0 : 1
        if (isReactivationA !== isReactivationB) {
          return isReactivationA - isReactivationB
        }
      }

      return (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
    })

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!inviteEmail.trim()) {
      setHasEmailError(true)
      showNotification('Email address is required.', 'error', 'Missing Information')
      return
    }

    const emailList = inviteEmail
      .split(/[\s,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0)

    if (emailList.length === 0) {
      setHasEmailError(true)
      showNotification('Please enter at least one valid email address.', 'error', 'Invalid Email')
      return
    }

    const invalidEmails = emailList.filter(e => !e.includes('@'))
    if (invalidEmails.length > 0) {
      setHasEmailError(true)
      const errMsg = `Invalid format: ${invalidEmails.slice(0, 2).join(', ')}${invalidEmails.length > 2 ? '...' : ''}`
      showNotification(errMsg, 'error', 'Invalid Email Format')
      return
    }

    // Validation for Dean and Program Head assignment
    if ((inviteRole === 'Dean' || inviteRole === 'Program Head') && inviteDepartment && inviteDepartment !== 'None') {
      if (emailList.length > 1) {
        showNotification(`Cannot invite multiple users as ${inviteRole} for a single department.`, 'error', 'Assignment Conflict')
        return
      }

      const existingConflict = members.find(m => 
        m.role === inviteRole && 
        m.department === inviteDepartment &&
        !emailList.includes(m.email.toLowerCase())
      )
      
      if (existingConflict) {
        showNotification(`A ${inviteRole} already exists for ${inviteDepartment}.`, 'error', 'Assignment Conflict')
        return
      }
    }

    setIsInviting(true)
    setHasEmailError(false)

    try {
      const results = {
        sent: [] as string[],
        exists: [] as string[],
        pending: [] as string[],
      }

      for (const normalizedEmail of emailList) {
        // 1. Check if user already exists in 'users' collection (active or deactivated)
        const userQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail))
        const userSnapshot = await getDocs(userQuery)

        if (!userSnapshot.empty) {
          results.exists.push(normalizedEmail)
          continue
        }

        // 2. Check for existing active invitations
        const inviteQuery = query(
          collection(db, 'invitations'),
          where('email', '==', normalizedEmail),
          where('status', '==', 'pending')
        )
        const inviteSnapshot = await getDocs(inviteQuery)

        const now = new Date()
        const activeInvite = inviteSnapshot.docs.find(doc => {
          const data = doc.data()
          return data.expiresAt.toDate() > now
        })

        if (activeInvite) {
          results.pending.push(normalizedEmail)
          continue
        }

        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        const assignedDept = inviteRole === 'Admin'
          ? 'Administrative Office'
          : inviteRole === 'Registrar'
            ? "Registrar's Office"
            : (inviteRole === 'Instructor' || inviteRole === 'Dean' || inviteRole === 'Program Head')
              ? (inviteDepartment === 'None' ? '' : inviteDepartment || '')
              : ''

        // 1. Create the membership document for the invited user
        const membershipRef = await addDoc(collection(db, 'memberships'), {
          userId: '',
          fullName: '',
          email: normalizedEmail,
          role: inviteRole,
          department: assignedDept,
          status: assignedDept ? 'accepted' : '',
          joinedAt: '',
          createdAt: serverTimestamp()
        })

        // 2. Create the invitation tracking document
        const inviteRef = await addDoc(collection(db, 'invitations'), {
          email: normalizedEmail,
          membershipId: membershipRef.id,
          status: 'pending',
          invitedBy: auth.currentUser?.uid || 'system',
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt),
        })

        // 4. Create the mail document to trigger the extension
        const signupLink = `${window.location.origin}/signup?token=${inviteRef.id}`

        await addDoc(collection(db, 'mail'), {
          to: normalizedEmail,
          message: {
            subject: `Invitation to join RORMS - ${normalizedEmail}`,
            html: `
                  <div style="background-color: #f4f7f6; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                      <!-- Brand Header -->
                      <div style="background-color: #62853e; padding: 30px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">RORMS</h1>
                        <p style="color: #e0ead6; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Registrar Office Room Management System</p>
                      </div>
                      <!-- Email Body -->
                      <div style="padding: 40px 30px;">
                        <h2 style="color: #333333; margin-top: 0; font-size: 22px;">You've been invited!</h2>
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                          Hello,<br><br>
                          You have been officially invited to join the <strong>RORMS</strong> platform as a <strong>${inviteRole}</strong>. 
                          Through this system, you will be able to seamlessly manage and track university resources.
                        </p>
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 40px 0;">
                          <a href="${signupLink}" style="background-color: #62853e; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(98, 133, 62, 0.25);">
                            Accept Invitation & Sign Up
                          </a>
                        </div>
                        <!-- Security Callout -->
                        <div style="background-color: #f9f9f9; border-left: 4px solid #e0e0e0; padding: 15px; margin-bottom: 30px;">
                          <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                            <strong>Security Note:</strong> This invitation is strictly tied to your email address and will automatically expire in <strong>7 days</strong>.
                          </p>
                        </div>
                        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
                        <!-- Fallback Link -->
                        <p style="color: #999999; font-size: 13px; text-align: center; line-height: 1.5; margin: 0;">
                          If the button above doesn't work, copy and paste the following URL into your browser:<br>
                          <a href="${signupLink}" style="color: #62853e; word-break: break-all;">${signupLink}</a>
                        </p>
                      </div>
                      <!-- Footer -->
                      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                        <p style="color: #aaaaaa; font-size: 12px; margin: 0;">
                          &copy; ${new Date().getFullYear()} PHINMA University of Pangasinan. All rights reserved.
                        </p>
                      </div>
                    </div>
                  </div>
                `,
          },
        })
        results.sent.push(normalizedEmail)
      }

      if (results.sent.length === emailList.length) {
        setIsInviteModalOpen(false)
        setInviteEmail('')
        setInviteRole('Instructor')
        setInviteDepartment('None')
        setHasEmailError(false)
        showNotification(
          emailList.length === 1
            ? `Invitation sent successfully to ${emailList[0]}.`
            : `${emailList.length} invitations sent successfully.`,
          'success',
          'Invitation Sent'
        )
      } else {
        const parts = []
        if (results.sent.length > 0) parts.push(`Sent ${results.sent.length}`)
        if (results.exists.length > 0) parts.push(`${results.exists.length} already a user`)
        if (results.pending.length > 0) parts.push(`${results.pending.length} already invited`)

        // Filter out successfully sent emails from the textarea
        const remainingEmails = emailList.filter(e => !results.sent.includes(e))
        setInviteEmail(remainingEmails.join(', '))
        if (results.sent.length === 0 && results.exists.length === emailList.length) {
          showNotification(
            emailList.length === 1
              ? `"${emailList[0]}" is already a registered user.`
              : 'All specified emails are already registered users.',
            'warning',
            'User Already Exists'
          )
        } else {
          showNotification(parts.join(', '), results.sent.length > 0 ? 'info' : 'warning', 'Invitation Status')
        }
      }
    } catch (error) {
      console.error('Error sending invitation:', error)
      showNotification('Failed to send invitation. Please try again.', 'error', 'Error Sending Invitation')
    } finally {
      setIsInviting(false)
    }
  }

  const openInviteModal = () => {
    setIsInviteModalOpen(true)
    setInviteEmail('')
    setInviteRole('Instructor')
    setInviteDepartment('None')
    setHasEmailError(false)
  }

  const openEditModal = (member: Member) => {
    setEditingMember(member)
    setEditRole(member.role)
    const isOfficeDept = member.department === 'Administrative Office' || member.department === "Registrar's Office"
    setEditDept(isOfficeDept ? '' : (member.department || ''))
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember) return

    const isPending = editingMember.status === 'Pending'
    const wasDean = editingMember.role === 'Dean'
    const isNowDean = editRole === 'Dean'
    const wasProgramHead = editingMember.role === 'Program Head'
    const isNowProgramHead = editRole === 'Program Head'
    const oldDeptCode = editingMember.department || ''
    const newDeptCode = editDept

    // 1. Validation for Dean and Program Head assignment
    if (isNowDean && newDeptCode) {
      const existingDean = members.find(m => m.role === 'Dean' && m.department === newDeptCode && m.id !== editingMember.id && m.email.toLowerCase() !== editingMember.email.toLowerCase())
      if (existingDean) {
        showNotification(`A Dean already exists for ${newDeptCode}.`, 'warning', 'Assignment Conflict')
        return
      }
    }

    if (isNowProgramHead && newDeptCode) {
      const existingProgramHead = members.find(m => m.role === 'Program Head' && m.department === newDeptCode && m.id !== editingMember.id && m.email.toLowerCase() !== editingMember.email.toLowerCase())
      if (existingProgramHead) {
        showNotification(`A Program Head already exists for ${newDeptCode}.`, 'warning', 'Assignment Conflict')
        return
      }
    }

    setIsSavingEdit(true)
    try {
      const batch = writeBatch(db)

      const canHaveDept = editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head'
      const isOffice = editDept === 'Administrative Office' || editDept === "Registrar's Office"
      const finalDept = editRole === 'Admin'
        ? 'Administrative Office'
        : editRole === 'Registrar'
          ? "Registrar's Office"
          : (canHaveDept && !isOffice)
            ? editDept
            : ''

      if (isPending) {
        // Update the membership document created for this pending invite
        if (editingMember.membershipId) {
          batch.update(doc(db, 'memberships', editingMember.membershipId), {
            role: editRole,
            department: finalDept,
            status: finalDept ? 'accepted' : '',
          })
        }
      } else {
        if (wasDean && (!isNowDean || oldDeptCode !== finalDept)) {
          // Clear old department's dean field
          const oldDept = departments.find(d => d.code === oldDeptCode)
          if (oldDept && oldDept.dean === editingMember.id) {
            batch.update(doc(db, 'departments', oldDept.id), {
              dean: '',
              updatedAt: serverTimestamp()
            })
          }
        }

        if (isNowDean && finalDept) {
          const newDept = departments.find(d => d.code === finalDept)
          if (newDept) {
            // Set new department's dean field
            batch.update(doc(db, 'departments', newDept.id), {
              dean: editingMember.id,
              updatedAt: serverTimestamp()
            })
          }
        }

        if (wasProgramHead && (!isNowProgramHead || oldDeptCode !== finalDept)) {
          // Clear old department's programHead field
          const oldDept = departments.find(d => d.code === oldDeptCode)
          if (oldDept && oldDept.programHead === editingMember.id) {
            batch.update(doc(db, 'departments', oldDept.id), {
              programHead: '',
              updatedAt: serverTimestamp()
            })
          }
        }

        if (isNowProgramHead && finalDept) {
          const newDept = departments.find(d => d.code === finalDept)
          if (newDept) {
            // Set new department's programHead field
            batch.update(doc(db, 'departments', newDept.id), {
              programHead: editingMember.id,
              updatedAt: serverTimestamp()
            })
          }
        }

        // 2. Update or create membership document
        if (editingMember.membershipId) {
          const updateData: any = {
            role: editRole,
            department: finalDept,
            status: finalDept ? 'accepted' : '',
            fullName: editingMember.name || '',
            email: editingMember.email || '',
          }

          // Update joinedAt only if the department has changed (including unassigned to department or vice versa)
          if (oldDeptCode !== finalDept) {
            updateData.joinedAt = finalDept ? serverTimestamp() : ''
          }

          batch.update(doc(db, 'memberships', editingMember.membershipId), updateData)
          batch.update(doc(db, 'users', editingMember.id), {
            updatedAt: serverTimestamp()
          })
        } else {
          const newMembershipRef = doc(collection(db, 'memberships'))
          batch.set(newMembershipRef, {
            userId: editingMember.id,
            fullName: editingMember.name || '',
            email: editingMember.email || '',
            role: editRole,
            department: finalDept,
            status: finalDept ? 'accepted' : '',
            joinedAt: finalDept ? serverTimestamp() : '',
            createdAt: serverTimestamp()
          })
          batch.update(doc(db, 'users', editingMember.id), {
            updatedAt: serverTimestamp()
          })
        }
      }

      await batch.commit()
      const memberName = editingMember.name || editingMember.email
      setEditingMember(null)
      showNotification(
        isPending ? `Invitation for "${memberName}" updated successfully.` : `Member "${memberName}" updated successfully.`,
        'success',
        isPending ? 'Invitation Updated' : 'Member Updated'
      )
    } catch (error) {
      console.error('Error updating member:', error)
      showNotification('Failed to update member. Please try again.', 'error', 'Error Updating Member')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleRemoveSubmit = async () => {
    if (!memberToRemove) return

    setIsRemovingMember(true)
    setRemoveError('')
    try {
      const batch = writeBatch(db)

      if (memberToRemove.status === 'Pending') {
        // 1. Delete the invitation document
        batch.delete(doc(db, 'invitations', memberToRemove.id))

        // 2. Delete the associated membership document only if this was a new user invite (not an existing registered/deactivated user)
        if (memberToRemove.membershipId) {
          const mem = rawMemberships.find(m => m.id === memberToRemove.membershipId)
          const isExistingUser = Boolean(mem?.userId && mem.userId !== '') || users.some(u => u.email.toLowerCase() === memberToRemove.email.toLowerCase())
          if (!isExistingUser) {
            batch.delete(doc(db, 'memberships', memberToRemove.membershipId))
          }
        }

        // 3. Delete the associated mail document (find by email)
        const mailQuery = query(collection(db, 'mail'), where('to', '==', memberToRemove.email))
        const mailSnapshot = await getDocs(mailQuery)
        mailSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'mail', mDoc.id))
        })
      } else {
        // 1. Soft delete the user document (do not completely delete from Firestore)
        batch.update(doc(db, 'users', memberToRemove.id), {
          isActive: false,
          updatedAt: serverTimestamp()
        })

        // 2. Clean up any lingering mail and invitations
        const mailQuery = query(collection(db, 'mail'), where('to', '==', memberToRemove.email))
        const mailSnapshot = await getDocs(mailQuery)
        mailSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'mail', mDoc.id))
        })

        const inviteQuery = query(collection(db, 'invitations'), where('email', '==', memberToRemove.email))
        const inviteSnapshot = await getDocs(inviteQuery)
        inviteSnapshot.forEach((iDoc) => {
          batch.delete(doc(db, 'invitations', iDoc.id))
        })
      }

      await batch.commit()
      const memberLabel = memberToRemove.name || memberToRemove.email
      const isPending = memberToRemove.status === 'Pending'
      const mem = rawMemberships.find(m => m.id === memberToRemove.membershipId)
      const isReactivation = isPending && Boolean(
        memberToRemove.isReactivation ||
        (mem?.userId && mem.userId !== '') ||
        users.some(u => u.email.toLowerCase() === memberToRemove.email.toLowerCase())
      )

      setMemberToRemove(null)
      setRemoveConfirmText('')

      const successTitle = !isPending
        ? 'Member Deactivated'
        : isReactivation
          ? 'Re-invitation Cancelled'
          : 'Invitation Cancelled'

      const successMsg = !isPending
        ? `Member "${memberLabel}" deactivated successfully.`
        : isReactivation
          ? `Re-invitation for "${memberLabel}" cancelled.`
          : `Invitation for "${memberLabel}" cancelled.`

      showNotification(successMsg, 'success', successTitle)
    } catch (error) {
      console.error('Error processing member remove action:', error)
      const isPending = memberToRemove?.status === 'Pending'
      const isReactivation = isPending && Boolean(memberToRemove?.isReactivation)
      
      const errorMsg = !isPending
        ? 'Failed to deactivate member. Please try again.'
        : isReactivation
          ? 'Failed to cancel re-invitation. Please try again.'
          : 'Failed to cancel invitation. Please try again.'

      const errorTitle = !isPending
        ? 'Error Deactivating Member'
        : isReactivation
          ? 'Error Cancelling Re-invitation'
          : 'Error Cancelling Invitation'

      setRemoveError(errorMsg)
      showNotification(errorMsg, 'error', errorTitle)
    } finally {
      setIsRemovingMember(false)
    }
  }

  const handleReinviteSubmit = async () => {
    if (!memberToReinvite) return

    setIsReinvitingMember(true)
    try {
      const normalizedEmail = memberToReinvite.email.trim().toLowerCase()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      const assignedDept = memberToReinvite.role === 'Admin'
        ? 'Administrative Office'
        : memberToReinvite.role === 'Registrar'
          ? "Registrar's Office"
          : (memberToReinvite.role === 'Instructor' || memberToReinvite.role === 'Dean' || memberToReinvite.role === 'Program Head')
            ? (memberToReinvite.department === 'None' ? '' : memberToReinvite.department || '')
            : ''

      let membershipId = memberToReinvite.membershipId
      if (membershipId) {
        await updateDoc(doc(db, 'memberships', membershipId), {
          role: memberToReinvite.role,
          department: assignedDept,
          fullName: memberToReinvite.name || '',
          email: normalizedEmail,
        })
      } else {
        const memRef = await addDoc(collection(db, 'memberships'), {
          userId: memberToReinvite.id,
          fullName: memberToReinvite.name || '',
          email: normalizedEmail,
          role: memberToReinvite.role,
          department: assignedDept,
          status: '',
          joinedAt: '',
          createdAt: serverTimestamp()
        })
        membershipId = memRef.id
      }

      const inviteRef = await addDoc(collection(db, 'invitations'), {
        email: normalizedEmail,
        membershipId: membershipId,
        status: 'pending',
        isReactivation: true,
        invitedBy: auth.currentUser?.uid || 'system',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      })

      const signupLink = `${window.location.origin}/signup?token=${inviteRef.id}`

      await addDoc(collection(db, 'mail'), {
        to: normalizedEmail,
        message: {
          subject: `Welcome back to RORMS - ${normalizedEmail}`,
          html: `
            <div style="background-color: #f4f7f6; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <!-- Brand Header -->
                <div style="background-color: #62853e; padding: 30px 20px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">RORMS</h1>
                  <p style="color: #e0ead6; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Registrar Office Room Management System</p>
                </div>
                <!-- Email Body -->
                <div style="padding: 40px 30px;">
                  <h2 style="color: #333333; margin-top: 0; font-size: 22px;">Welcome Back!</h2>
                  <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                    Hello,<br><br>
                    Your account has been officially invited back to the <strong>RORMS</strong> platform as a <strong>${memberToReinvite.role}</strong>.
                  </p>
                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 40px 0;">
                    <a href="${signupLink}" style="background-color: #62853e; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(98, 133, 62, 0.25);">
                      Accept & Reactivate Account
                    </a>
                  </div>
                  <!-- Security Callout -->
                  <div style="background-color: #f9f9f9; border-left: 4px solid #e0e0e0; padding: 15px; margin-bottom: 30px;">
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                      <strong>Security Note:</strong> This reactivation link is strictly tied to your email address and will automatically expire in <strong>7 days</strong>.
                    </p>
                  </div>
                </div>
                <!-- Footer -->
                <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                  <p style="color: #aaaaaa; font-size: 12px; margin: 0;">
                    &copy; ${new Date().getFullYear()} PHINMA University of Pangasinan. All rights reserved.
                  </p>
                </div>
              </div>
            </div>
          `,
        },
      })

      const memberLabel = memberToReinvite.name || memberToReinvite.email
      setMemberToReinvite(null)
      showNotification(`Re-invitation sent to "${memberLabel}".`, 'success', 'Re-invitation Sent')
    } catch (error) {
      console.error('Error sending re-invitation:', error)
      showNotification('Failed to send re-invitation. Please try again.', 'error', 'Error Sending Re-invitation')
    } finally {
      setIsReinvitingMember(false)
    }
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Decorative Background Elements */}
      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Edit Member</h3>
              <p className="mt-1 text-sm text-white/80">Update role and department for {editingMember.name || editingMember.email}.</p>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-1/2">
                  <label htmlFor="edit-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Role
                  </label>
                  <SingleSelectDropdown
                    options={['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor']}
                    value={editRole}
                    onChange={(val) => {
                      const prevRole = editRole
                      setEditRole(val)
                      if (val === 'Admin' || val === 'Registrar' || prevRole === 'Admin' || prevRole === 'Registrar') {
                        setEditDept('')
                      }
                    }}
                    onToggle={handleDropdownToggle}
                    className="w-full"
                  />
                </div>

                <div className="sm:w-1/2">
                  <label htmlFor="edit-dept" className={`block text-xs font-bold uppercase tracking-widest mb-2 transition-colors ${(editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head') ? 'text-gray-500' : 'text-gray-300'
                    }`}>
                    Department
                  </label>
                  <SingleSelectDropdown
                    options={['', ...departments.map(d => d.code)]}
                    value={(editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head') ? editDept : ''}
                    onChange={(val) => {
                      setEditDept(val)
                    }}
                    onToggle={handleDropdownToggle}
                    isDisabled={editRole !== 'Dean' && editRole !== 'Instructor' && editRole !== 'Program Head'}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMember(null)}
                  disabled={isSavingEdit}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSavingEdit}
                  className="flex-1"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onMouseDown={() => {
              if (activeDropdowns > 0) return
              if (!isSavingEdit) setEditingMember(null)
            }}
          />
        </div>
      )}

      {/* Deactivate Member / Cancel Invitation / Cancel Re-invitation Modal */}
      {memberToRemove && (() => {
        const isPending = memberToRemove.status === 'Pending'
        const mem = rawMemberships.find(m => m.id === memberToRemove.membershipId)
        const isReactivation = isPending && Boolean(
          memberToRemove.isReactivation ||
          (mem?.userId && mem.userId !== '') ||
          users.some(u => u.email.toLowerCase() === memberToRemove.email.toLowerCase())
        )

        const modalTitle = !isPending
          ? 'Deactivate Member'
          : isReactivation
            ? 'Cancel Re-invitation'
            : 'Cancel Invitation'

        const modalSubtitle = !isPending
          ? 'Are you sure you want to deactivate this member?'
          : isReactivation
            ? 'Are you sure you want to cancel this re-invitation?'
            : 'Are you sure you want to cancel this invitation?'

        const modalWarning = !isPending
          ? 'This action will deactivate their account and remove their access to the system.'
          : isReactivation
            ? 'This action will cancel the pending re-invitation. The user will remain deactivated until invited again.'
            : 'This action will cancel the pending invitation and prevent this user from completing registration.'

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div
              className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-rose-600 p-6 text-white">
                <h3 className="text-xl font-bold">{modalTitle}</h3>
                <p className="mt-1 text-sm text-white/80">{modalSubtitle}</p>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden">
                    {memberToRemove.avatar && !avatarErrors[memberToRemove.avatar] ? (
                      <img
                        src={memberToRemove.avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => setAvatarErrors(prev => ({ ...prev, [memberToRemove.avatar]: true }))}
                      />
                    ) : (
                      <UserIcon className="h-7 w-7" />
                    )}
                  </div>
                  <div>
                    {memberToRemove.name && <p className="text-sm font-bold text-gray-900">{memberToRemove.name}</p>}
                    <p className={memberToRemove.name ? "text-xs font-medium text-gray-500" : "text-sm font-bold text-gray-900"}>
                      {memberToRemove.email}
                     </p>
                  </div>
                </div>

                <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                  <p className="text-xs leading-relaxed text-rose-700">
                    <span className="font-bold uppercase tracking-wider">Warning:</span>{' '}
                    {modalWarning}
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirm-remove-input" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
                    To confirm, please type <span className="text-rose-600">"confirm"</span>
                  </label>
                  <TextInput
                    id="confirm-remove-input"
                    value={removeConfirmText}
                    onChange={(val) => setRemoveConfirmText(val)}
                    placeholder="Type confirm here..."
                    autoFocus
                  />
                </div>

                {removeError && (
                  <p className="text-xs font-bold text-rose-600 text-center animate-in fade-in slide-in-from-top-1">
                    {removeError}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMemberToRemove(null)
                      setRemoveConfirmText('')
                    }}
                    disabled={isRemovingMember}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleRemoveSubmit}
                    disabled={isRemovingMember || removeConfirmText.toLowerCase() !== 'confirm'}
                    className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                  >
                    {isRemovingMember ? (isPending ? 'Cancelling...' : 'Deactivating...') : 'Confirm'}
                  </Button>
                </div>
              </div>
            </div>
            <div
              className="absolute inset-0 -z-10"
              onMouseDown={() => {
                if (!isRemovingMember) {
                  setMemberToRemove(null)
                  setRemoveConfirmText('')
                }
              }}
            />
          </div>
        )
      })()}

      {/* Re-invite Member Modal */}
      {memberToReinvite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold">Re-invite Member</h3>
              <p className="mt-1 text-sm text-white/80">Send a reactivation invitation to restore access.</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden shrink-0">
                  {memberToReinvite.avatar && !avatarErrors[memberToReinvite.avatar] ? (
                    <img
                      src={memberToReinvite.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarErrors(prev => ({ ...prev, [memberToReinvite.avatar]: true }))}
                    />
                  ) : (
                    <UserIcon className="h-7 w-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {memberToReinvite.name && <p className="text-sm font-bold text-gray-900 truncate">{memberToReinvite.name}</p>}
                  <p className={memberToReinvite.name ? "text-xs font-medium text-gray-500 truncate" : "text-sm font-bold text-gray-900 truncate"}>
                    {memberToReinvite.email}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-100">
                <p className="text-xs leading-relaxed text-emerald-800">
                  A reactivation email with a 7-day secure access link will be sent to <strong>{memberToReinvite.email}</strong>. Once accepted, their account will be restored.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMemberToReinvite(null)}
                  disabled={isReinvitingMember}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="brand"
                  onClick={handleReinviteSubmit}
                  disabled={isReinvitingMember}
                  className="flex-1"
                >
                  {isReinvitingMember ? 'Sending...' : 'Send Re-invitation'}
                </Button>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onMouseDown={() => {
              if (!isReinvitingMember) setMemberToReinvite(null)
            }}
          />
        </div>
      )}

      {/* Invite Member Modal Overlay */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl overflow-hidden">
              <h3 className="text-xl font-bold">Invite New Member</h3>
              <p className="mt-1 text-sm text-white/80">Send an invitation link to join the team.</p>
            </div>

            <form onSubmit={handleInvite} className="p-6 space-y-5" noValidate>
              <div className="flex flex-col gap-5">
                <div className="relative flex-1">
                  <label htmlFor="invite-email" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <TextInput
                    value={inviteEmail}
                    onChange={(val) => {
                      setInviteEmail(val);
                      if (hasEmailError) setHasEmailError(false);
                    }}
                    error={hasEmailError}
                    placeholder="name@example.com, another"
                    className="w-full"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="w-full">
                    <label htmlFor="invite-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Assign Role
                    </label>
                    <SingleSelectDropdown
                      options={['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor']}
                      value={inviteRole}
                      onChange={(val) => {
                        setInviteRole(val)
                        if (val === 'Admin' || val === 'Registrar') {
                          setInviteDepartment('None')
                        }
                      }}
                      onToggle={handleDropdownToggle}
                      className="w-full"
                    />
                  </div>

                  <div className="w-full">
                    <label htmlFor="invite-department" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Department
                    </label>
                    <div className={(inviteRole === 'Admin' || inviteRole === 'Registrar') ? 'opacity-50 pointer-events-none' : ''}>
                      <SingleSelectDropdown
                        options={['None', ...departments.map(d => d.code)]}
                        value={inviteDepartment}
                        onChange={setInviteDepartment}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isInviting}
                  className="flex-1"
                >
                  {isInviting ? 'Sending...' : 'Send Invitations'}
                </Button>
              </div>
            </form>
          </div>
          {/* Click outside to close */}
          <div
            className="absolute inset-0 -z-10"
            onMouseDown={() => {
              if (activeDropdowns > 0) return
              setIsInviteModalOpen(false)
            }}
          />
        </div>
      )}

      <div className="space-y-6">
        <SectionHeader
          title="User Directory"
          description="Manage system access, roles, and department assignments for all users in a centralized hub."
        />

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <SummaryCard
              title="Colony Directory"
              subtitle={`${users.filter(u => u.status === 'Active').length} Active • ${invites.length} Pending`}
              icon={<UsersIcon className="h-4.5 w-4.5 text-[var(--brand-color)]" />}
              gradientClasses="from-[var(--brand-color)]/20 to-[var(--brand-color)]/10"
              outlineClasses="bg-[var(--brand-color)]"
              blobClasses="bg-[var(--brand-color)]/5"
            >
              <AnthillColonyQueue
                members={members}
                users={users}
                invites={invites}
                departments={departments}
              />
            </SummaryCard>
            <SummaryCard
              title="Homeroom Roster"
              subtitle={`${members.filter(m => m.status === 'Active').length} Seated • ${invites.length} On Waitlist`}
              icon={<UserIcon className="h-4.5 w-4.5 text-amber-600" />}
              gradientClasses="from-amber-200 to-amber-100"
              outlineClasses="bg-amber-500"
              blobClasses="bg-amber-500/5"
            >
              <HomeroomRosterVisual members={members} />
            </SummaryCard>
            <SummaryCard
              title="Pending Platform"
              subtitle={`${invites.length} awaiting boarding`}
              icon={<BellIcon className="h-4.5 w-4.5 text-sky-600" />}
              gradientClasses="from-sky-200 to-sky-100"
              outlineClasses="bg-sky-500"
              blobClasses="bg-sky-500/5"
            >
              <PendingPlatformVisual invites={invites} />
            </SummaryCard>
          </div>
        </div>        {/* Unified Table Container */}
        <div className="relative z-10">
          <DataTable
            isLoading={isLoading}
            data={filteredMembers}
            columns={[
              {
                header: 'Member Info',
                width: '30%',
                render: (member) => (
                  <div className="flex items-center gap-4">
                    {member.avatar && !avatarErrors[member.avatar] ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
                        onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar]: true }))}
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
                        <UserIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      {member.name ? (
                        <>
                          <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.name}</span>
                          <span className="text-xs font-medium text-slate-500">{member.email}</span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.email}</span>
                      )}
                    </div>
                  </div>
                )
              },
              {
                header: 'Role',
                width: '16%',
                render: (member) => (
                  <div className={`flex items-center gap-2 ${roleClasses[member.role]?.split(' ')[1] || 'text-gray-500'}`}>
                    <div className="h-2 w-2 rounded-full bg-current" />
                    <span className="text-[0.7rem] font-bold uppercase tracking-widest">
                      {member.role}
                    </span>
                  </div>
                )
              },
              {
                header: 'Department',
                width: '18%',
                render: (member) => (
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                    {member.department || (
                      member.role === 'Admin' ? 'Administrative Office' :
                        member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned'
                    )}
                  </span>
                )
              },
              {
                header: 'Status',
                width: '16%',
                render: (member) => (
                  <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[member.status]}`}>
                    {member.status}
                  </span>
                )
              },
              {
                header: 'Join Date',
                width: '16%',
                render: (member) => (
                  <span className="text-sm font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
                    {member.joinedDate}
                  </span>
                )
              },
              {
                header: 'Actions',
                width: '2%',
                align: 'right',
                render: (member) => {
                  const isSelf = member.id === currentUserId
                  const isEditDisabled = isSelf
                  const isRemoveDisabled = isSelf

                  return (
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        label="Edit member"
                        onClick={() => openEditModal(member)}
                        className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${isEditDisabled
                          ? 'opacity-30 cursor-default text-slate-400'
                          : 'text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5'
                          }`}
                        disabled={isEditDisabled}
                      >
                        <EditIcon className="h-4 w-4" />
                      </IconButton>
                      {member.status === 'Deactivated' ? (
                        <IconButton
                          label="Re-invite member"
                          onClick={() => setMemberToReinvite(member)}
                          className="h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 text-[var(--brand-color)] hover:border-[var(--brand-color)]/40 hover:bg-[var(--brand-color)]/5 hover:text-[var(--brand-color-hover)] hover:shadow hover:-translate-y-0.5 transition-all"
                        >
                          <MailIcon className="h-4 w-4" />
                        </IconButton>
                      ) : member.status === 'Pending' ? (
                        <IconButton
                          label={member.isReactivation ? 'Cancel re-invitation' : 'Cancel invitation'}
                          onClick={() => setMemberToRemove(member)}
                          className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${isRemoveDisabled
                            ? 'opacity-30 cursor-default text-slate-400'
                            : 'text-rose-500 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5'
                            }`}
                          disabled={isRemoveDisabled}
                        >
                          <CloseIcon className="h-4 w-4" />
                        </IconButton>
                      ) : (
                        <IconButton
                          label="Deactivate member"
                          onClick={() => setMemberToRemove(member)}
                          className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${isRemoveDisabled
                            ? 'opacity-30 cursor-default text-slate-400'
                            : 'text-rose-500 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5'
                            }`}
                          disabled={isRemoveDisabled}
                        >
                          <MinusCircleIcon className="h-4 w-4" />
                        </IconButton>
                      )}
                    </div>
                  )
                }
              }
            ]}
            searchPlaceholder="Search by name or email..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={
              <FilterDropdown
                groups={[
                  {
                    id: 'role',
                    title: 'Role',
                    options: ['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor'],
                    selectedValues: selectedRoles,
                    onChange: (newSelected) => setSelectedRoles(newSelected as MemberRole[])
                  },
                  {
                    id: 'department',
                    title: 'Department',
                    options: ['Administrative Office', "Registrar's Office", 'Unassigned', ...departments.map(d => d.code)],
                    selectedValues: selectedDepartments,
                    onChange: setSelectedDepartments
                  },
                  {
                    id: 'status',
                    title: 'Status',
                    options: ['Active', 'Deactivated', 'Pending'],
                    selectedValues: selectedStatuses,
                    onChange: (newSelected) => setSelectedStatuses(newSelected as MemberStatus[])
                  }
                ]}
                onClearAll={() => {
                  setSelectedRoles([])
                  setSelectedDepartments([])
                  setSelectedStatuses([])
                }}
              />
            }
            primaryAction={
              <Button
                variant="brand"
                className="w-full lg:w-auto"
                onClick={openInviteModal}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Invite Member
              </Button>
            }
            emptyTitle="No members found"
            emptyDescription="Try adjusting your filters or search terms."
            emptyIcon={<UsersIcon className="h-12 w-12" />}
          />
        </div>
      </div>

      <Snackbar
        isOpen={snackbar.isOpen}
        onClose={() => setSnackbar(prev => ({ ...prev, isOpen: false }))}
        title={snackbar.title}
        message={snackbar.message}
        type={snackbar.type}
        position="top-center"
      />
    </section>
  )
}

export default MembersPage
