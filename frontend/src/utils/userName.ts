export interface UserNameFields {
  firstName: string
  surname: string
  fullName: string
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function titleCaseName(value: string): string {
  return value.toLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu, word =>
    word.replace(/^\p{L}/u, first => first.toUpperCase()))
}

// Prefer explicit name parts, even when an earlier source has only a legacy fullName.
// Never infer name parts by splitting a full name.
export function userNameFields(...sources: readonly unknown[]): UserNameFields {
  const records = sources.filter((source): source is Record<string, unknown> =>
    Boolean(source && typeof source === 'object' && !Array.isArray(source)))
  const structured = records.find(source => text(source.firstName) && text(source.surname))
    ?? records.find(source => text(source.firstName) || text(source.surname))
  const firstName = text(structured?.firstName)
  const surname = text(structured?.surname)
  const fullName = firstName && surname
    ? `${firstName} ${surname}`
    : records.map(source => text(source.fullName)).find(Boolean) || ''
  return { firstName, surname, fullName }
}

export function formatUserName(...sources: readonly unknown[]): string {
  const { firstName, surname, fullName } = userNameFields(...sources)
  return firstName && surname ? `${surname}, ${firstName}` : fullName
}
