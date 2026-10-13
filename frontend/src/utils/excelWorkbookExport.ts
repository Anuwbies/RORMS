import type { CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { readSheetPreviewFormatting } from './excelPreviewStyles.ts'
import type { WorkbookEditSnapshot } from './excelWorkbookState'
import type { ExcelFontCell } from './excelFontRuns'
import { materializeScheduleStatuses } from './excelScheduleStatusColumn.ts'

const xml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
const rgb = (value: unknown) => {
  const color = String(value ?? '').replace(/^#/, '')
  return /^[\da-f]{6}$/i.test(color) ? `FF${color.toUpperCase()}` : /^[\da-f]{3}$/i.test(color) ? `FF${[...color].map(part => part + part).join('').toUpperCase()}` : undefined
}
const colorXml = (value: unknown, tag = 'color') => rgb(value) ? `<${tag} rgb="${rgb(value)}"/>` : ''
const BORDER_SIDES = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const
const DEFAULT_GRIDLINE = '1px solid #d4d4d4'

function withGridlines(style: CSSProperties): CSSProperties {
  const result = { ...style }
  // Native Excel gridlines disappear on filled cells. The editor always supplies
  // a light grid when a custom border is absent or has been removed.
  for (const side of BORDER_SIDES) {
    if (!result[side] || result[side] === 'none') result[side] = DEFAULT_GRIDLINE
  }
  return result
}

function fontXml(style: CSSProperties): string {
  const size = Number.parseFloat(String(style.fontSize ?? '11pt'))
  const points = String(style.fontSize).endsWith('px') || typeof style.fontSize === 'number' ? size * 0.75 : size
  const decoration = String(style.textDecoration ?? '')
  return `<font><sz val="${points || 11}"/><name val="${xml(style.fontFamily || 'Arial')}"/>${colorXml(style.color)}${style.fontWeight === 'bold' || Number(style.fontWeight) >= 600 ? '<b/>' : ''}${style.fontStyle === 'italic' ? '<i/>' : ''}${decoration.includes('underline') ? '<u/>' : ''}${decoration.includes('line-through') ? '<strike/>' : ''}</font>`
}

function borderXml(style: CSSProperties): string {
  const sides = ['left', 'right', 'top', 'bottom'] as const
  return `<border>${sides.map(side => {
    const value = String(style[`border${side[0].toUpperCase()}${side.slice(1)}` as keyof CSSProperties] ?? '')
    if (!value || /\b(none|hidden)\b/.test(value)) return `<${side}/>`
    const width = Number.parseFloat(value)
    const line = value.includes('double') ? 'double' : value.includes('dotted') ? 'dotted' : value.includes('dashed') ? width >= 2 ? 'mediumDashed' : 'dashed' : width >= 3 ? 'thick' : width >= 2 ? 'medium' : 'thin'
    return `<${side} style="${line}">${colorXml(value.match(/#[\da-f]{3,8}\b/i)?.[0] || '#000000')}</${side}>`
  }).join('')}<diagonal/></border>`
}

function alignmentXml(style: CSSProperties): string {
  const attributes: string[] = []
  if (style.textAlign) attributes.push(`horizontal="${xml(style.textAlign)}"`)
  if (style.verticalAlign) attributes.push(`vertical="${style.verticalAlign === 'middle' ? 'center' : xml(style.verticalAlign)}"`)
  if (style.whiteSpace === 'pre-wrap' || style.whiteSpace === 'normal') attributes.push('wrapText="1"')
  const angle = Number.parseFloat(String(style.rotate ?? 0)) || 0
  const rotation = style.writingMode === 'vertical-rl' ? 255 : angle < 0 ? Math.min(90, -angle) : angle > 0 ? 90 + Math.min(90, angle) : 0
  if (rotation) attributes.push(`textRotation="${rotation}"`)
  return attributes.length ? `<alignment ${attributes.join(' ')}/>` : ''
}

function appendXmlEntries(source: string, tag: string, entries: string[]): string {
  if (!entries.length) return source
  return source.replace(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`), (_, attributes: string, contents: string) => {
    const count = Number(attributes.match(/\bcount="(\d+)"/)?.[1] || 0) + entries.length
    return `<${tag}${attributes.replace(/\bcount="\d+"/, `count="${count}"`)}>${contents}${entries.join('')}</${tag}>`
  })
}

/** Export current editor contents; the stored source XLSX does not contain text/style overrides. */
export function createExcelExport(snapshot: WorkbookEditSnapshot, selectedNames: readonly string[]): Uint8Array {
  snapshot = materializeScheduleStatuses(snapshot)
  const chosen = new Set(selectedNames)
  const names = snapshot.workbook.SheetNames.filter(name => chosen.has(name))
  if (!names.length || names.length !== chosen.size) throw new Error('Choose at least one valid sheet to export.')
  const output: XLSX.WorkBook = { SheetNames: names, Sheets: {}, Workbook: { Sheets: [] } }
  const stylesBySheet = new Map<string, Map<string, CSSProperties>>()
  const rowStylesBySheet = new Map<string, Map<number, CSSProperties>>()
  const columnStylesBySheet = new Map<string, { first: number; last: number; style: CSSProperties }[]>()
  for (const name of names) {
    const source = snapshot.workbook.Sheets[name]
    const sheet: XLSX.WorkSheet = { ...source }
    const formatting = snapshot.formattingOverrides.get(name) ?? readSheetPreviewFormatting(snapshot.previewStyles, name)
    const overrides = snapshot.cellTextOverrides.get(name)
    const edits = snapshot.cellStyleOverrides.get(name)
    const styles = new Map<string, CSSProperties>()
    const styleAt = (address: string) => {
      const position = XLSX.utils.decode_cell(address)
      const index = formatting.indexes.get(address) ?? formatting.rowIndexes.get(position.r)
        ?? formatting.columnIndexes.find(column => position.c >= column.first && position.c <= column.last)?.styleId ?? 0
      const style: CSSProperties = { ...snapshot.previewStyles?.cellStyles[index] }
      const cell = source[address] as XLSX.CellObject | undefined
      const text = overrides?.get(address) ?? cell?.w ?? String(cell?.v ?? '')
      for (const rule of [...formatting.conditionalRules].sort((a, b) => b.priority - a.priority)) {
        if (!rule.ranges.some(range => position.r >= range.s.r && position.r <= range.e.r && position.c >= range.s.c && position.c <= range.e.c)) continue
        const matches = rule.type === 'notContainsBlanks' ? text.trim() !== ''
          : rule.type === 'cellIs' && rule.operator === 'lessThan' && text.trim() !== '' && Number.isFinite(Number(overrides?.get(address) ?? cell?.v)) && Number(overrides?.get(address) ?? cell?.v) < rule.threshold
        if (matches) Object.assign(style, rule.style)
      }
      return withGridlines({ ...style, ...edits?.get(address) })
    }
    const range = XLSX.utils.decode_range(source['!ref'] || 'A1')
    const include = (position: XLSX.CellAddress) => {
      range.s.r = Math.min(range.s.r, position.r); range.s.c = Math.min(range.s.c, position.c)
      range.e.r = Math.max(range.e.r, position.r); range.e.c = Math.max(range.e.c, position.c)
    }
    const addresses = new Set([...Object.keys(source).filter(address => !address.startsWith('!')), ...formatting.indexes.keys(), ...[...formatting.rowIndexes.keys()].map(row => XLSX.utils.encode_cell({ r: row, c: 0 })), ...overrides?.keys() || [], ...edits?.keys() || []])
    for (const address of addresses) {
      const cell: ExcelFontCell = { ...source[address] }
      const text = overrides?.get(address)
      if (text !== undefined) {
        cell.t = 's'; cell.v = text
        delete cell.f; delete cell.F; delete cell.w; delete cell.r; delete cell.h
      } else if (cell.t === 'z' || !cell.t) { cell.t = 's'; cell.v = '' }
      sheet[address] = cell
      include(XLSX.utils.decode_cell(address))
      styles.set(address, styleAt(address))
    }
    const merges = snapshot.mergeOverrides.get(name) ?? source['!merges'] ?? []
    sheet['!merges'] = merges.map(merge => ({ s: { ...merge.s }, e: { ...merge.e } }))
    merges.forEach(merge => include(merge.e))
    for (const merge of merges) {
      // Border styles must exist on the whole perimeter, including blank cells.
      const perimeter = new Set<string>()
      for (let row = merge.s.r; row <= merge.e.r; row++) {
        perimeter.add(XLSX.utils.encode_cell({ r: row, c: merge.s.c }))
        perimeter.add(XLSX.utils.encode_cell({ r: row, c: merge.e.c }))
      }
      for (let column = merge.s.c; column <= merge.e.c; column++) {
        perimeter.add(XLSX.utils.encode_cell({ r: merge.s.r, c: column }))
        perimeter.add(XLSX.utils.encode_cell({ r: merge.e.r, c: column }))
      }
      for (const address of perimeter) {
        if (!sheet[address]) sheet[address] = { t: 's', v: '' }
        if (!styles.has(address)) styles.set(address, styleAt(address))
      }
    }
    for (const [address, style] of styles) {
      const position = XLSX.utils.decode_cell(address)
      const merge = merges.find(merge => position.r >= merge.s.r && position.r <= merge.e.r && position.c >= merge.s.c && position.c <= merge.e.c)
      if (!merge) continue
      // A merged cell has a grid only along its outside edges.
      if (position.r > merge.s.r) style.borderTop = 'none'
      if (position.r < merge.e.r) style.borderBottom = 'none'
      if (position.c > merge.s.c) style.borderLeft = 'none'
      if (position.c < merge.e.c) style.borderRight = 'none'
    }
    sheet['!rows'] = source['!rows']?.map(row => ({ ...row })) || []
    sheet['!cols'] = source['!cols']?.map(column => ({ ...column })) || []
    for (const [row, height] of snapshot.rowHeightOverrides.get(name) || []) {
      sheet['!rows'][row] = { ...sheet['!rows'][row], hpt: height * 0.75 }
      delete sheet['!rows'][row].hpx
      include({ r: row, c: range.s.c })
    }
    for (const [column, width] of snapshot.columnWidthOverrides.get(name) || []) {
      sheet['!cols'][column] = { ...sheet['!cols'][column], wpx: width }
      delete sheet['!cols'][column].width; delete sheet['!cols'][column].wch
      include({ r: range.s.r, c: column })
    }
    range.e.r = Math.min(1048575, range.e.r + (snapshot.addedRowsBySheet.get(name) ?? 0))
    sheet['!ref'] = XLSX.utils.encode_range(range)
    output.Sheets[name] = sheet
    const metadata = snapshot.workbook.Workbook?.Sheets?.[snapshot.workbook.SheetNames.indexOf(name)]
    output.Workbook!.Sheets!.push({ ...metadata, name })
    stylesBySheet.set(name, styles)
    rowStylesBySheet.set(name, new Map([...formatting.rowIndexes].map(([row, index]) => [row, withGridlines(snapshot.previewStyles?.cellStyles[index] || {})])))
    columnStylesBySheet.set(name, formatting.columnIndexes.map(column => ({ ...column, style: withGridlines(snapshot.previewStyles?.cellStyles[column.styleId] || {}) })))
  }
  // Excel requires a visible sheet even when only hidden sheets are selected.
  if (output.Workbook!.Sheets!.every(sheet => sheet.Hidden)) output.Workbook!.Sheets![0].Hidden = 0
  const files = unzipSync(new Uint8Array(XLSX.write(output, { type: 'array', bookType: 'xlsx', cellStyles: true })))
  let stylesXml = strFromU8(files['xl/styles.xml'])
  const count = (tag: string) => Number(stylesXml.match(new RegExp(`<${tag}\\b[^>]*count="(\\d+)"`))?.[1] || 0)
  const initialFonts = count('fonts'), initialFills = count('fills'), initialBorders = count('borders'), initialXfs = count('cellXfs')
  const baseXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1].match(/<xf\b[^>]*?\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || []
  const fonts: string[] = [], fills: string[] = [], borders: string[] = [], xfs: string[] = []
  const styleIds = new Map<string, number>()
  const styleId = (style: CSSProperties, original = 0) => {
    const numFmt = Number(baseXfs[original]?.match(/\bnumFmtId="(\d+)"/)?.[1] || 0)
    const key = JSON.stringify([style, numFmt])
    const cached = styleIds.get(key)
    if (cached !== undefined) return cached
    const index = xfs.length
    fonts.push(fontXml(style))
    fills.push(rgb(style.backgroundColor) ? `<fill><patternFill patternType="solid">${colorXml(style.backgroundColor, 'fgColor')}<bgColor indexed="64"/></patternFill></fill>` : '<fill><patternFill patternType="none"/></fill>')
    borders.push(borderXml(style))
    xfs.push(`<xf numFmtId="${numFmt}" fontId="${initialFonts + index}" fillId="${initialFills + index}" borderId="${initialBorders + index}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1">${alignmentXml(style)}</xf>`)
    const id = initialXfs + index
    styleIds.set(key, id)
    return id
  }
  names.forEach((name, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`
    let sheetXml = strFromU8(files[path])
    sheetXml = sheetXml.replace(/<c\b([^>]*)(\/>|>)/g, (tag, attributes: string, end: string) => {
      const address = attributes.match(/\br="([^"]+)"/)?.[1]
      const style = address ? stylesBySheet.get(name)?.get(address) : undefined
      if (!style) return tag
      const id = styleId(style, Number(attributes.match(/\bs="(\d+)"/)?.[1] || 0))
      return `<c${attributes.replace(/\s+s="[^"]*"/g, '')} s="${id}"${end}`
    })
    sheetXml = sheetXml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (tag, attributes: string) => {
      const address = attributes.match(/\br="([^"]+)"/)?.[1]
      const cell = address ? output.Sheets[name][address] as ExcelFontCell | undefined : undefined
      const runs = cell?.previewFontRuns
      if (!runs?.length || runs.map(run => run.text).join('') !== String(cell?.v ?? '')) return tag
      const base = stylesBySheet.get(name)?.get(address!) || {}
      const richText = runs.map(run => `<r><rPr>${fontXml({ ...base, fontFamily: run.fontFamily }).slice(6, -7).replace('<name ', '<rFont ')}</rPr><t xml:space="preserve">${xml(run.text)}</t></r>`).join('')
      return `<c${attributes.replace(/\s+t="[^"]*"/g, '')} t="inlineStr"><is>${richText}</is></c>`
    })
    sheetXml = sheetXml.replace(/<row\b([^>]*)(\/>|>)/g, (tag, attributes: string, end: string) => {
      const row = Number(attributes.match(/\br="(\d+)"/)?.[1]) - 1
      const style = rowStylesBySheet.get(name)?.get(row)
      return style ? `<row${attributes.replace(/\s+(s|customFormat)="[^"]*"/g, '')} s="${styleId(style)}" customFormat="1"${end}` : tag
    })
    const columnStyles = columnStylesBySheet.get(name) || []
    // Split inherited styles and width/visibility metadata into nonoverlapping column ranges.
    if (columnStyles.length) {
      sheetXml = sheetXml.replace(/<cols>([\s\S]*?)<\/cols>|(?=<sheetData\b)/, (tag: string) => {
        const existing = [...(tag || '').matchAll(/<col\b([^>]*)\/>/g)].map(match => ({ attributes: match[1], first: Number(match[1].match(/\bmin="(\d+)"/)?.[1]) - 1, last: Number(match[1].match(/\bmax="(\d+)"/)?.[1]) - 1 }))
        const boundaries = [...new Set([...columnStyles, ...existing].flatMap(column => [column.first, column.last + 1]))].sort((a, b) => a - b)
        const columns = boundaries.slice(0, -1).map((first, index) => {
          const last = boundaries[index + 1] - 1
          const metadata = existing.find(column => first >= column.first && first <= column.last)
          const inherited = columnStyles.find(column => first >= column.first && first <= column.last)
          if (!metadata && !inherited) return ''
          const attributes = (metadata?.attributes || '').replace(/\s+(min|max|style)="[^"]*"/g, '')
          return `<col min="${first + 1}" max="${last + 1}"${attributes}${inherited ? ` style="${styleId(inherited.style)}"` : ''}/>`
        }).join('')
        return `<cols>${columns}</cols>`
      })
    }
    const tabColor = rgb(snapshot.sheetColors.get(name))
    if (tabColor) sheetXml = sheetXml.replace(/<sheetPr\b([^>]*)(?:\/>|>([\s\S]*?)<\/sheetPr>)|(?=<dimension\b)/, (_, attributes = '', contents = '') => `<sheetPr${attributes}><tabColor rgb="${tabColor}"/>${contents.replace(/<tabColor\b[^>]*\/>/g, '')}</sheetPr>`)
    files[path] = strToU8(sheetXml)
  })
  stylesXml = appendXmlEntries(stylesXml, 'fonts', fonts)
  stylesXml = appendXmlEntries(stylesXml, 'fills', fills)
  stylesXml = appendXmlEntries(stylesXml, 'borders', borders)
  files['xl/styles.xml'] = strToU8(appendXmlEntries(stylesXml, 'cellXfs', xfs))
  return zipSync(files, { level: 6 })
}
