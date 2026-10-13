import { formatUserName, titleCaseName } from './userName.ts'
import { excelScheduleFacultyKeys, isExcelScheduleTba } from './excelScheduleValidation.ts'
import { sliceFontRuns, replaceFontRuns, type ExcelFontRun } from './excelFontRuns.ts'

export interface ExcelFacultyDirectory {
  names: readonly string[]
  loading: boolean
  error?: string
}

const searchKey = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function departmentFacultyNames(members: readonly Record<string, unknown>[], users: ReadonlyMap<string, Record<string, unknown>>, departmentCode: string): string[] {
  const names = new Map<string, string>()
  for (const member of members) {
    if (member.department !== departmentCode || member.status !== 'accepted' || !['Instructor', 'Program Head'].includes(String(member.role))) continue
    const user = typeof member.userId === 'string' ? users.get(member.userId) : undefined
    if (user?.isActive === false) continue
    const name = formatUserName(user, member)
    if (name && !names.has(searchKey(name))) names.set(searchKey(name), name)
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b))
}

export function filterFacultyNames(names: readonly string[], query: string): string[] {
  const words = searchKey(query).split(/\s+/).filter(Boolean)
  return names.filter(name => {
    const normalized = searchKey(name)
    return words.every(word => normalized.includes(word))
  })
}

interface FacultyNameReplacement { start: number; end: number; name: string }

function formatFacultyName(value: string): string {
  if (!value.includes(',')) {
    const words = titleCaseName(value.trim().replace(/\s+/g, ' ')).split(' ')
    return words.length > 1 ? `${words.at(-1)}, ${words.slice(0, -1).join(' ')}` : words[0]
  }
  const parts = value.split(',').map(part => titleCaseName(part.trim().replace(/\s+/g, ' ')))
  return parts.reduce((name, part, index) => index === 0 ? part : `${name},${part ? ` ${part}` : ''}`, '')
}

function facultyNameReplacements(text: string, names: readonly string[]): FacultyNameReplacement[] {
  if (!text.trim()) return []
  const directory = names.map(name => ({ name, keys: excelScheduleFacultyKeys(name) }))
  const placeholders = [...text.matchAll(/\bN\s*\/\s*A\b/gi)]
  const replacements: FacultyNameReplacement[] = []
  for (const entry of text.matchAll(/[^/;\r\n]+/g)) {
    const value = entry[0].trim()
    const start = entry.index + entry[0].length - entry[0].trimStart().length
    const end = start + value.length
    if (!value || placeholders.some(match => start < match.index + match[0].length && end > match.index)) continue
    const keys = excelScheduleFacultyKeys(value)
    const matches = [...new Set(directory.filter(item => keys.some(key => item.keys.includes(key))).map(item => item.name))]
    const name = isExcelScheduleTba(value) ? 'TBA' : formatFacultyName(matches.length === 1 ? matches[0] : value)
    if (name !== value) replacements.push({ start, end, name })
  }
  return replacements
}

export function canonicalizeFacultyText(text: string, names: readonly string[]): string {
  for (const replacement of facultyNameReplacements(text, names).reverse()) {
    text = text.slice(0, replacement.start) + replacement.name + text.slice(replacement.end)
  }
  return text
}

// Keep font runs and separators, including the independent font of each faculty entry.
export function canonicalizeFacultyFontRuns(runs: readonly ExcelFontRun[], names: readonly string[]): ExcelFontRun[] {
  const text = runs.map(run => run.text).join('')
  const replacements = facultyNameReplacements(text, names)
  if (!replacements.length) return runs as ExcelFontRun[]
  let result = [...runs]
  for (const replacement of replacements.reverse()) {
    const original = sliceFontRuns(result, replacement.start, replacement.end)
    let offset = 0
    const inserted = original.map(run => {
      const text = replacement.name.slice(offset, offset + run.text.length)
      offset += run.text.length
      return { ...run, text }
    })
    if (offset < replacement.name.length) inserted.push({ text: replacement.name.slice(offset), fontFamily: original.at(-1)!.fontFamily })
    result = replaceFontRuns(result, replacement.start, replacement.end, inserted)
  }
  return result
}
// Commas belong to names. Replace only the faculty entry at the caret.
export function facultyFragment(text: string, selectionStart: number, selectionEnd = selectionStart): { start: number; end: number; query: string } {
  const caret = Math.max(0, Math.min(selectionStart, text.length))
  let start = caret
  while (start > 0 && !/[\/;\n]/.test(text[start - 1])) start--
  let end = Math.max(caret, Math.min(selectionEnd, text.length))
  while (end < text.length && !/[\/;\n]/.test(text[end])) end++
  const query = text.slice(start, caret).trim()
  while (start < caret && /\s/.test(text[start])) start++
  while (end > caret && /\s/.test(text[end - 1])) end--
  return { start, end, query }
}
