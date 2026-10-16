const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
require.extensions['.ts'] = compile
require.extensions['.tsx'] = compile

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const originalLoad = Module._load
Module._load = function(request, ...args) {
  const result = originalLoad.call(this, request, ...args)
  return request === 'react-dom' ? { ...result, createPortal: element => element } : result
}
const { scheduleValidationTone } = require('../src/utils/ScheduleValidation.ts')
const { createEmptyDepartmentScheduleSheet } = require('../src/utils/departmentScheduleImport.ts')
const { parseDepartmentScheduleImportRows, extractDepartmentScheduleImportRows } = require('../src/utils/departmentScheduleImportRows.ts')
const { createDepartmentScheduleWorkbookSnapshot } = require('../src/utils/departmentScheduleWorkbookState.ts')
const { DepartmentScheduleImportTableBody } = require('../src/components/DepartmentScheduleImportTableBody.tsx')
const { ExcelValidationTooltip } = require('../src/components/ExcelValidationTooltip.tsx')
const directory = { departmentCode: '', faculty: [], rooms: [] }
let notice
for (let column = 13; column <= 20; column++) for (const value of ['TBA', ' tba ', 'TBA/TBA']) {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values[column] = value
  const rows = parseDepartmentScheduleImportRows([sheet], directory)
  assert.equal(rows[0].validationIssues.length, 1, `Column ${column}: ${value}`)
  notice = rows[0].validationIssues[0]
  assert.match(notice, /^TBA: (Faculty|Time|Day|Room) \((Lec|Lab)\) is still to be assigned\.$/)
  assert.equal(scheduleValidationTone(rows[0].validationIssues), 'blue')
  const state = createDepartmentScheduleWorkbookSnapshot([sheet], 0, null)
  assert.deepEqual(extractDepartmentScheduleImportRows(state.snapshot, state.ownedNames, [sheet], directory)[0].validationIssues, rows[0].validationIssues)
  sheet.rows[0].values[column] = ''
  assert.deepEqual(parseDepartmentScheduleImportRows([sheet], directory), [], 'Clearing TBA clears its notice')
}
const sheet = createEmptyDepartmentScheduleSheet()
sheet.rows[0].values[15] = '7:30-9:00/TBA'
sheet.rows[0].values[17] = 'MON/TBA'
const mixed = parseDepartmentScheduleImportRows([sheet], directory)[0].validationIssues
assert.equal(mixed.length, 2)
assert.equal(scheduleValidationTone(mixed), 'blue')
assert.equal(scheduleValidationTone([notice, 'Duplicate Subject ITE 101 for Section 1 · Row 2.']), 'purple')
assert.equal(scheduleValidationTone([notice, 'Room XYZ does not exist in the rooms collection.']), 'danger')

function renderRow(messages, savedStatus, statusesReady = true) {
  return renderToStaticMarkup(React.createElement('table', null, React.createElement(DepartmentScheduleImportTableBody, {
    rows: [sheet.rows[0]], sheetIndex: 0, selection: null, columnLabels: Array(21).fill('Cell'), actions: {}, hasSheet: true,
    sheetName: 'Schedule', statusesReady,
    rowStatuses: savedStatus ? new Map([[JSON.stringify(['Schedule', sheet.rows[0].rowNumber]), savedStatus]]) : new Map(),
    rowIssues: new Map([[sheet.rows[0].rowNumber, messages]]),
  })))
}
assert.match(renderRow([notice]), /bg-blue-100 text-blue-900/)
assert.match(renderRow([notice, 'Duplicate Subject ITE 101 for Section 1 · Row 2.']), /bg-purple-100 text-purple-900/)
assert.match(renderRow([notice, 'Room XYZ does not exist.']), /bg-rose-100 text-rose-900/)
assert.match(renderRow([]), /Schedule status: Draft/)
assert.match(renderRow([], 'Plot'), /Schedule status: Plot/)
assert.match(renderRow([], undefined, false), /No schedule status/)
const tooltip = tone => renderToStaticMarkup(React.createElement(ExcelValidationTooltip, {
  anchor: { left: 0, right: 100, top: 100, bottom: 120 }, messages: [notice], tone, portalTarget: {},
}))
assert.match(tooltip('blue'), /bg-blue-950/)
assert.match(tooltip('blue'), /border-t-blue-950/)
assert.match(tooltip('danger'), /text-blue-200/)
console.log('Passed: TBA notices in all meeting columns, paired/mixed entries, live/Save parity, clearing notices, severity priority, and actual row/tooltip colors.')
