/** Quote every field and include a UTF-8 BOM so Excel preserves names and punctuation. */
export function downloadReportCsv(filename: string, headers: readonly string[], rows: readonly (readonly string[])[]) {
  const csv = [headers, ...rows]
    .map(row => row.map(value => {
      // Spreadsheet apps can evaluate user-entered text as a formula even when CSV fields are quoted.
      const safeValue = /^\s*[=+@]/.test(value) || /^\s*-(?!\d+(?:\.\d+)?\s*$)/.test(value) ? `'${value}` : value
      return `"${safeValue.replaceAll('"', '""')}"`
    }).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Let the browser start consuming the download before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
