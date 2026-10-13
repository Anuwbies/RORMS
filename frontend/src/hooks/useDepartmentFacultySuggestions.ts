import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { departmentFacultyNames, type ExcelFacultyDirectory } from '../utils/excelFacultySuggestions'

export function useDepartmentFacultySuggestions(departmentCode?: string): ExcelFacultyDirectory {
  const [directory, setDirectory] = useState<ExcelFacultyDirectory>({ names: [], loading: true })
  useEffect(() => {
    setDirectory({ names: [], loading: Boolean(departmentCode) })
    if (!departmentCode) return
    let unsubscribeMembers: (() => void) | undefined
    let unsubscribeUsers: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeMembers?.()
      unsubscribeUsers?.()
      setDirectory(user ? { names: [], loading: true } : { names: [], loading: false, error: 'Sign in to load department instructors.' })
      if (!user) return
      let members: Record<string, unknown>[] | undefined
      let users: Map<string, Record<string, unknown>> | undefined
      let failed = false
      const update = () => {
        if (!failed && members && users) setDirectory({ names: departmentFacultyNames(members, users, departmentCode), loading: false })
      }
      const fail = (error: Error) => {
        failed = true
        console.error('Error loading department faculty suggestions:', error)
        setDirectory({ names: [], loading: false, error: 'Unable to load department instructors.' })
      }
      unsubscribeMembers = onSnapshot(query(collection(db, 'memberships'), where('department', '==', departmentCode)), snapshot => {
        members = snapshot.docs.map(item => item.data())
        update()
      }, fail)
      unsubscribeUsers = onSnapshot(collection(db, 'users'), snapshot => {
        users = new Map(snapshot.docs.map(item => [item.id, item.data()]))
        update()
      }, fail)
    })
    return () => { unsubscribeAuth(); unsubscribeMembers?.(); unsubscribeUsers?.() }
  }, [departmentCode])
  return directory
}
