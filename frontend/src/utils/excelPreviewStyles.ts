import type { CSSProperties } from 'react'
import { unzipSync } from 'fflate'
import * as XLSX from 'xlsx'

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const THEME_COLOR_NAMES = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
const INDEXED_COLORS = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF']

export interface ExcelPreviewStyles {
  files: Record<string, Uint8Array>
  sheetPaths: Record<string, string>
  cellStyles: CSSProperties[]
  differentialStyles: CSSProperties[]
}

export interface ExcelConditionalRule {
  ranges: XLSX.Range[]
  type: string
  operator: string | null
  threshold: number
  style: CSSProperties
  priority: number
}

export interface SheetPreviewFormatting {
  indexes: Map<string, number>
  rowIndexes: Map<number, number>
  columnIndexes: { first: number; last: number; styleId: number }[]
  conditionalRules: ExcelConditionalRule[]
}

function readXml(files: Record<string, Uint8Array>, path: string): Document | null {
  const contents = files[path]
  if (!contents) return null
  return new DOMParser().parseFromString(new TextDecoder().decode(contents), 'application/xml')
}

function firstChild(element: Element | null | undefined, name: string): Element | null {
  return Array.from(element?.children ?? []).find(child => child.localName === name) ?? null
}

function directChildren(element: Element | null | undefined): Element[] {
  return Array.from(element?.children ?? [])
}

function normalizeSheetPath(target: string): string {
  const path = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

function readSheetPaths(files: Record<string, Uint8Array>): Record<string, string> {
  const workbookXml = readXml(files, 'xl/workbook.xml')
  const relationshipsXml = readXml(files, 'xl/_rels/workbook.xml.rels')
  if (!workbookXml || !relationshipsXml) return {}

  const relationshipTargets = new Map(
    Array.from(relationshipsXml.getElementsByTagNameNS(PACKAGE_REL_NS, 'Relationship'))
      .map(relation => [relation.getAttribute('Id'), relation.getAttribute('Target')]),
  )
  const paths: Record<string, string> = {}
  for (const sheet of Array.from(workbookXml.getElementsByTagNameNS(MAIN_NS, 'sheet'))) {
    const name = sheet.getAttribute('name')
    const id = sheet.getAttributeNS(OFFICE_REL_NS, 'id') || sheet.getAttribute('r:id')
    const target = relationshipTargets.get(id)
    if (name && target) paths[name] = normalizeSheetPath(target)
  }
  return paths
}

function readThemeColors(files: Record<string, Uint8Array>): string[] {
  const themeXml = readXml(files, 'xl/theme/theme1.xml')
  const colorScheme = themeXml?.getElementsByTagNameNS(DRAWING_NS, 'clrScheme')[0]
  return THEME_COLOR_NAMES.map(name => {
    const color = firstChild(colorScheme, name)?.firstElementChild
    const hex = color?.getAttribute('lastClr') || color?.getAttribute('val')
    return hex ? `#${hex.slice(-6)}` : ''
  })
}

function resolveColor(color: Element | null, themeColors: string[]): string | undefined {
  if (!color) return undefined
  const rgb = color.getAttribute('rgb')
  const theme = color.getAttribute('theme')
  const indexed = color.getAttribute('indexed')
  let hex = rgb ? `#${rgb.slice(-6)}` : theme !== null ? themeColors[Number(theme)] : indexed !== null ? INDEXED_COLORS[Number(indexed)] : undefined
  if (!hex) return undefined

  const tint = Number(color.getAttribute('tint') || 0)
  if (tint && /^#[0-9a-f]{6}$/i.test(hex)) {
    const baseHex = hex
    const channels = [1, 3, 5].map(position => parseInt(baseHex.slice(position, position + 2), 16))
    const adjusted = channels.map(channel => Math.round(tint > 0 ? channel + (255 - channel) * tint : channel * (1 + tint)))
    hex = `#${adjusted.map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`
  }
  return hex
}

function borderCss(border: Element | null, themeColors: string[]): string | undefined {
  const kind = border?.getAttribute('style')
  if (!kind || kind === 'none') return undefined
  const width = kind === 'medium' || kind.startsWith('medium') ? '2px' : kind === 'thick' ? '3px' : '1px'
  const line = kind === 'double' ? 'double' : kind.includes('dash') || kind.includes('Dash') ? 'dashed' : kind === 'dotted' ? 'dotted' : 'solid'
  const color = resolveColor(firstChild(border, 'color'), themeColors) || '#000000'
  return `${kind === 'double' ? '3px' : width} ${line} ${color}`
}

function readCellStyles(files: Record<string, Uint8Array>): CSSProperties[] {
  const stylesXml = readXml(files, 'xl/styles.xml')
  if (!stylesXml) return []

  const themeColors = readThemeColors(files)
  const styleSheet = stylesXml.getElementsByTagNameNS(MAIN_NS, 'styleSheet')[0]
  const fonts = directChildren(firstChild(styleSheet, 'fonts'))
  const fills = directChildren(firstChild(styleSheet, 'fills'))
  const borders = directChildren(firstChild(styleSheet, 'borders'))
  const styleXfs = directChildren(firstChild(styleSheet, 'cellStyleXfs'))
  const xfs = directChildren(firstChild(styleSheet, 'cellXfs'))

  return xfs.map(xf => {
    const font = fonts[Number(xf.getAttribute('fontId') || 0)]
    const fill = fills[Number(xf.getAttribute('fillId') || 0)]
    const border = borders[Number(xf.getAttribute('borderId') || 0)]
    const baseXf = styleXfs[Number(xf.getAttribute('xfId') || 0)]
    const alignment = firstChild(xf, 'alignment') || firstChild(baseXf, 'alignment')
    const pattern = firstChild(fill, 'patternFill')
    const result: CSSProperties = {}

    const fontColor = resolveColor(firstChild(font, 'color'), themeColors)
    if (fontColor) result.color = fontColor
    const fontName = firstChild(font, 'name')?.getAttribute('val')
    const fontSize = firstChild(font, 'sz')?.getAttribute('val')
    if (fontName) result.fontFamily = fontName
    if (fontSize) result.fontSize = `${fontSize}pt`
    const bold = firstChild(font, 'b')
    if (bold) result.fontWeight = bold.getAttribute('val') === '0' ? 'normal' : 'bold'
    if (firstChild(font, 'i')) result.fontStyle = 'italic'
    if (firstChild(font, 'u')) result.textDecoration = 'underline'
    if (firstChild(font, 'strike')) result.textDecoration = [result.textDecoration, 'line-through'].filter(Boolean).join(' ')

    if (pattern?.getAttribute('patternType') === 'solid') {
      const fillColor = resolveColor(firstChild(pattern, 'fgColor') || firstChild(pattern, 'bgColor'), themeColors)
      if (fillColor) result.backgroundColor = fillColor
    }

    const horizontal = alignment?.getAttribute('horizontal')
    if (horizontal === 'center' || horizontal === 'centerContinuous') result.textAlign = 'center'
    else if (horizontal === 'right') result.textAlign = 'right'
    else if (horizontal === 'left') result.textAlign = 'left'
    else if (horizontal === 'justify' || horizontal === 'distributed') result.textAlign = 'justify'

    const vertical = alignment?.getAttribute('vertical')
    if (vertical === 'center') result.verticalAlign = 'middle'
    else if (vertical === 'top' || vertical === 'bottom') result.verticalAlign = vertical
    if (alignment?.getAttribute('wrapText') === '1') {
      result.whiteSpace = 'pre-wrap'
      result.overflowWrap = 'break-word'
    } else {
      result.whiteSpace = 'pre'
    }
    const rotation = Number(alignment?.getAttribute('textRotation') || 0)
    if (rotation === 255) {
      result.rotate = '0deg'
      result.writingMode = 'vertical-rl'
      result.textOrientation = 'upright'
    } else if (rotation > 0 && rotation <= 180) {
      // Excel encodes upward rotation as positive; CSS rotates clockwise.
      result.rotate = `${rotation > 90 ? rotation - 90 : -rotation}deg`
    }

    const top = borderCss(firstChild(border, 'top'), themeColors)
    const right = borderCss(firstChild(border, 'right'), themeColors)
    const bottom = borderCss(firstChild(border, 'bottom'), themeColors)
    const left = borderCss(firstChild(border, 'left'), themeColors)
    if (top) result.borderTop = top
    if (right) result.borderRight = right
    if (bottom) result.borderBottom = bottom
    if (left) result.borderLeft = left
    return result
  })
}

function readDifferentialStyles(files: Record<string, Uint8Array>): CSSProperties[] {
  const stylesXml = readXml(files, 'xl/styles.xml')
  if (!stylesXml) return []
  const themeColors = readThemeColors(files)
  const styleSheet = stylesXml.getElementsByTagNameNS(MAIN_NS, 'styleSheet')[0]
  return directChildren(firstChild(styleSheet, 'dxfs')).map(dxf => {
    const font = firstChild(dxf, 'font')
    const fill = firstChild(dxf, 'fill')
    const pattern = firstChild(fill, 'patternFill')
    const result: CSSProperties = {}
    const color = resolveColor(firstChild(font, 'color'), themeColors)
    if (color) result.color = color
    if (firstChild(font, 'b')) result.fontWeight = 'bold'
    if (pattern?.getAttribute('patternType') === 'solid') {
      const background = resolveColor(firstChild(pattern, 'fgColor') || firstChild(pattern, 'bgColor'), themeColors)
      if (background) result.backgroundColor = background
    }
    return result
  })
}

export function parseExcelPreviewStyles(data: ArrayBuffer): ExcelPreviewStyles {
  const files = unzipSync(new Uint8Array(data))
  return {
    files,
    sheetPaths: readSheetPaths(files),
    cellStyles: readCellStyles(files),
    differentialStyles: readDifferentialStyles(files),
  }
}

export function readSheetPreviewFormatting(previewStyles: ExcelPreviewStyles | null, sheetName: string): SheetPreviewFormatting {
  const indexes = new Map<string, number>()
  const rowIndexes = new Map<number, number>()
  const columnIndexes: SheetPreviewFormatting['columnIndexes'] = []
  const conditionalRules: ExcelConditionalRule[] = []
  if (!previewStyles) return { indexes, rowIndexes, columnIndexes, conditionalRules }
  const path = previewStyles.sheetPaths[sheetName]
  const sheetXml = path ? readXml(previewStyles.files, path) : null
  if (!sheetXml) return { indexes, rowIndexes, columnIndexes, conditionalRules }

  for (const column of Array.from(sheetXml.getElementsByTagNameNS(MAIN_NS, 'col'))) {
    const styleId = column.getAttribute('style')
    if (styleId !== null) columnIndexes.push({
      first: Number(column.getAttribute('min')) - 1,
      last: Number(column.getAttribute('max')) - 1,
      styleId: Number(styleId),
    })
  }

  for (const row of Array.from(sheetXml.getElementsByTagNameNS(MAIN_NS, 'row'))) {
    const rowNumber = row.getAttribute('r')
    const styleId = row.getAttribute('s')
    const customFormat = row.getAttribute('customFormat')
    if (rowNumber && styleId !== null && customFormat !== '0' && customFormat !== 'false') {
      rowIndexes.set(Number(rowNumber) - 1, Number(styleId))
    }
  }

  for (const cell of Array.from(sheetXml.getElementsByTagNameNS(MAIN_NS, 'c'))) {
    const address = cell.getAttribute('r')
    const styleId = cell.getAttribute('s')
    if (address && styleId !== null) indexes.set(address, Number(styleId))
  }

  for (const formatting of Array.from(sheetXml.getElementsByTagNameNS(MAIN_NS, 'conditionalFormatting'))) {
    const ranges = (formatting.getAttribute('sqref') || '').split(/\s+/).flatMap(reference => {
      if (!reference) return []
      try { return [XLSX.utils.decode_range(reference)] } catch { return [] }
    })
    for (const rule of directChildren(formatting)) {
      if (rule.localName !== 'cfRule') continue
      const differentialAttribute = rule.getAttribute('dxfId')
      if (differentialAttribute === null) continue
      const differentialId = Number(differentialAttribute)
      const style = previewStyles.differentialStyles[differentialId]
      if (!style || Object.keys(style).length === 0) continue
      conditionalRules.push({
        ranges,
        type: rule.getAttribute('type') || '',
        operator: rule.getAttribute('operator'),
        threshold: Number(firstChild(rule, 'formula')?.textContent),
        style,
        priority: Number(rule.getAttribute('priority') || 0),
      })
    }
  }
  conditionalRules.sort((a, b) => a.priority - b.priority)
  return { indexes, rowIndexes, columnIndexes, conditionalRules }
}
