import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { formatUserName } from '../utils/userName'
import { Button } from './Button'
import { CalendarIcon, ClockIcon, UserIcon } from './Icons'

export interface MemberLogDetails {
  id: string
  target: string
  action: string
  detail: string
  date: string
  time: string
  actor: string
  role?: string
  outcome?: 'Success' | 'Warning' | 'Failed'
  sourcePath?: string
  memberSnapshot?: { email: string; role: string; department: string }
  memberChanges?: Array<{ field: string; label: string; before: string; after: string }>
}

interface MemberDetails {
  name: string
  email: string
  role: string
  department: string
  access: string
  avatar: string
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function MemberLogDetailsModal({ event, onClose }: { event: MemberLogDetails; onClose: () => void }) {
  const [current, setCurrent] = useState<MemberDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sourceNotice, setSourceNotice] = useState('')
  const [avatarError, setAvatarError] = useState(false)

  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    let active = true
    setCurrent(null)
    setAvatarError(false)
    setSourceNotice('')
    setIsLoading(true)
    const load = async () => {
      try {
        const [collectionName, id, extra] = (event.sourcePath || '').split('/')
        if (!['memberships', 'users'].includes(collectionName) || !id || extra !== undefined) {
          if (active) setSourceNotice('Showing the member details recorded with this event.')
          return
        }
        const source = await getDoc(doc(db, collectionName, id))
        if (!source.exists()) {
          if (active) setSourceNotice('The source record was removed. The member details and changes recorded with this event are preserved.')
          return
        }
        let membership: Record<string, unknown> = collectionName === 'memberships' ? source.data() : {}
        let user: Record<string, unknown> = collectionName === 'users' ? source.data() : {}
        let hasUser = collectionName === 'users'
        if (collectionName === 'memberships') {
          const userId = text(membership.userId)
          if (userId && !userId.includes('/')) {
            const profile = await getDoc(doc(db, 'users', userId))
            hasUser = profile.exists()
            user = profile.data() || {}
          }
        } else {
          const assignments = await getDocs(query(collection(db, 'memberships'), where('userId', '==', id), limit(1)))
          membership = assignments.docs[0]?.data() || {}
        }
        if (active) setCurrent({
          name: formatUserName(user, membership) || event.target,
          email: text(user.email) || text(membership.email) || event.memberSnapshot?.email || 'Unavailable',
          role: text(membership.role) || 'Unassigned', department: text(membership.department) || 'Unassigned',
          access: hasUser ? user.isActive === false ? 'Deactivated' : 'Active' : text(membership.userId) ? 'Account unavailable' : 'Not registered',
          avatar: text(user.profilePicture),
        })
      } catch {
        if (active) setSourceNotice('Current member details could not be loaded. Showing the details recorded with this event.')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [event])

  const outcome = event.outcome || 'Success'
  const outcomeClass = outcome === 'Success' ? 'bg-emerald-100 text-emerald-700'
    : outcome === 'Warning' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="member-log-details-title" aria-describedby="member-log-description" className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
          <h3 id="member-log-details-title" className="text-xl font-bold leading-tight">Member Log Details</h3>
          <p id="member-log-description" className="mt-1 text-sm text-white/80">Review the recorded action and member information</p>
        </div>
        <div className="max-h-[400px] min-h-0 overflow-y-auto custom-scrollbar">
          <div className="p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h4 className="min-w-0 break-words text-xl font-bold leading-tight text-slate-900">{event.action}</h4>
                <span className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-widest ${outcomeClass}`}>{outcome}</span>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                  <UserIcon className="h-6 w-6 text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Changed by</p>
                  <p className="break-words text-sm font-bold leading-tight text-slate-700">{event.actor}</p>
                  {event.role && <p className="mt-0.5 text-xs font-medium text-slate-500">{event.role}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                  <div className="min-w-0"><dt className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Event date</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700"><CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.date}</span></dd></div>
                  <div className="min-w-0 min-[400px]:text-right"><dt className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Time · PHT</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700 min-[400px]:justify-end"><ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.time}</span></dd></div>
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <h5 className="mb-2 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Member at the time of this event</h5>
                <p className="break-words text-sm font-bold text-slate-700">{event.target}</p>
                {event.memberSnapshot?.email && <p className="mt-1 break-all text-xs text-slate-500">{event.memberSnapshot.email}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-2.5">
                  {[['Role', event.memberSnapshot?.role || 'Not recorded'], ['Department', event.memberSnapshot?.department || 'Unassigned']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</dd></div>)}
                </dl>
              </div>

              {event.memberChanges?.length ? <section aria-labelledby="member-changes-title" className="space-y-2">
                <h5 id="member-changes-title" className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Recorded changes</h5>
                {event.memberChanges.map(change => <div key={change.field} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <h6 className="mb-2 text-sm font-bold text-slate-700">{change.label}</h6>
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5"><dt className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Before</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-500">{change.before}</dd></div>
                    <div className="min-w-0 rounded-lg border border-[#c6dbb6] bg-[#f3f7ee] p-2.5"><dt className="text-[0.65rem] font-bold uppercase tracking-widest text-[#526f34]">After</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-700">{change.after}</dd></div>
                  </dl>
                </div>)}
              </section> : <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3"><h5 className="mb-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Recorded action</h5><p className="whitespace-pre-line break-words text-sm font-semibold leading-relaxed text-slate-600">{event.detail || 'No field changes recorded.'}</p></div>}

              {sourceNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">{sourceNotice}</p>}
              <details className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <summary className="cursor-pointer text-sm font-bold text-slate-700">Current member information{isLoading ? ' · Loading…' : ''}</summary>
                <div className="mt-3 space-y-3" aria-live="polite">
                  {isLoading ? <p className="text-xs text-slate-500">Loading current member details…</p> : current ? <>
                    <p className="text-xs leading-relaxed text-slate-500">Current information may differ from the recorded event above.</p>
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">{current.avatar && !avatarError ? <img src={current.avatar} alt={current.name} className="h-full w-full object-cover" onError={() => setAvatarError(true)} /> : <UserIcon className="h-6 w-6 text-slate-400" />}</div>
                      <div className="min-w-0"><p className="break-words text-sm font-bold text-slate-700">{current.name}</p><p className="mt-1 break-all text-xs text-slate-500">{current.email}</p></div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[['Role', current.role], ['Department', current.department], ['Account access', current.access]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</dd></div>)}
                    </dl>
                  </> : <p className="text-xs text-slate-500">Current member information is unavailable. The recorded event is preserved above.</p>}
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">
                <span>Historical record</span><span title={event.id}>Log: {event.id.replace(/^account_/, '').slice(0, 8)}</span>
              </div>
              {event.sourcePath && <details className="text-xs text-slate-400"><summary className="cursor-pointer">Source record</summary><p className="mt-1 break-all">{event.sourcePath}</p></details>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 bg-white px-5 py-4"><Button type="button" variant="outline" className="flex-1 h-12 text-base" autoFocus onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}
