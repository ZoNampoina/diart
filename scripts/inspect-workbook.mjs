import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const file = 'Carnet de note Tonalité.xlsx'
const wb = XLSX.readFile(file, { cellDates: true })
const summary = wb.SheetNames.map((name) => {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
  const firstNonEmpty = rows.findIndex((row) => Array.isArray(row) && row.some((v) => String(v).trim() !== ''))
  return {
    name,
    range: ws['!ref'] ?? null,
    rowCount: rows.length,
    firstNonEmptyRow: firstNonEmpty >= 0 ? firstNonEmpty + 1 : null,
    sampleRows: rows.slice(Math.max(firstNonEmpty, 0), Math.max(firstNonEmpty, 0) + 8)
  }
})
console.log('DIART_WORKBOOK_STRUCTURE=' + JSON.stringify(summary))
