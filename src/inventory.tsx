import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, ImageDown, MapPin, Minus, PackagePlus, Plus, Save, Trash2, X } from 'lucide-react'
import { db } from './db'
import type { InventoryMaterial, InventoryProgram } from './types'

export const DEFAULT_INVENTORY_MATERIALS = [
  'XLR-XLR',
  'XLR(M) - JACK',
  'XLR(F) - JACK',
  'JACK-JACK',
  'ALIMENTATION',
  'SUSTAIN',
  'PEDAL',
  'minijack-JACK',
  'RCL-minijack'
] as const

const now = () => new Date().toISOString()

function starterMaterials(): InventoryMaterial[] {
  return DEFAULT_INVENTORY_MATERIALS.map(name => ({ id: crypto.randomUUID(), name, quantity: 0 }))
}

async function createProgram(name: string): Promise<InventoryProgram> {
  const stamp = now()
  const program: InventoryProgram = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Nouvel événement',
    date: '',
    location: '',
    notes: '',
    items: starterMaterials(),
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null
  }
  await db.programs.add(program)
  return program
}

async function patchProgram(id: string, patch: Partial<Omit<InventoryProgram, 'id' | 'createdAt'>>): Promise<void> {
  await db.programs.update(id, { ...patch, updatedAt: now() })
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'fiche-technique'
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? line + ' ' + word : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

export async function exportTechnicalSheetImage(program: InventoryProgram): Promise<void> {
  const selected = program.items.filter(item => item.quantity > 0)
  const rows = selected.length ? selected : [{ id: 'empty', name: 'Aucun matériel renseigné', quantity: 0 }]
  const width = 1600
  const rowHeight = 104
  const notesLinesEstimate = program.notes.trim() ? Math.max(2, Math.ceil(program.notes.length / 70)) : 0
  const height = Math.max(1200, 690 + rows.length * rowHeight + notesLinesEstimate * 46 + 170)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Export image indisponible sur cet appareil.')

  ctx.fillStyle = '#f8fbfb'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#0f2f33'
  ctx.fillRect(0, 0, width, 26)

  const left = 120
  const right = width - 120
  let y = 110

  ctx.fillStyle = '#0f2f33'
  ctx.font = '700 34px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText("DI'ART by ARIZONA", left, y)
  ctx.fillStyle = '#558087'
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('INVENTAIRE · PROGRAMME', right, y)
  ctx.textAlign = 'left'

  y += 96
  ctx.fillStyle = '#0b2024'
  ctx.font = '800 66px system-ui, -apple-system, Segoe UI, sans-serif'
  const titleLines = wrapCanvasText(ctx, program.name || 'Événement', right - left)
  for (const line of titleLines.slice(0, 2)) { ctx.fillText(line, left, y); y += 78 }

  const meta = [
    program.date ? new Date(program.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '',
    program.location.trim()
  ].filter(Boolean).join('  ·  ')
  if (meta) {
    ctx.fillStyle = '#58757a'
    ctx.font = '500 28px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText(meta, left, y + 8)
    y += 66
  } else y += 28

  y += 22
  ctx.fillStyle = '#0f2f33'
  ctx.font = '800 28px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('FICHE TECHNIQUE · MATÉRIEL', left, y)
  y += 40

  ctx.fillStyle = '#dfeaec'
  ctx.fillRect(left, y, right - left, 68)
  ctx.fillStyle = '#0f2f33'
  ctx.font = '800 24px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('MATÉRIEL', left + 28, y + 44)
  ctx.textAlign = 'right'
  ctx.fillText('QTÉ', right - 28, y + 44)
  ctx.textAlign = 'left'
  y += 68

  rows.forEach((item, index) => {
    ctx.fillStyle = index % 2 ? '#f0f5f5' : '#ffffff'
    ctx.fillRect(left, y, right - left, rowHeight)
    ctx.strokeStyle = '#d8e5e7'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(left, y + rowHeight)
    ctx.lineTo(right, y + rowHeight)
    ctx.stroke()

    ctx.fillStyle = '#17383d'
    ctx.font = '650 30px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText(item.name, left + 28, y + 64)
    ctx.fillStyle = '#0f6f78'
    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(String(item.quantity), right - 34, y + 66)
    ctx.textAlign = 'left'
    y += rowHeight
  })

  if (program.notes.trim()) {
    y += 72
    ctx.fillStyle = '#0f2f33'
    ctx.font = '800 26px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('NOTES', left, y)
    y += 46
    ctx.fillStyle = '#4d6f74'
    ctx.font = '500 25px system-ui, -apple-system, Segoe UI, sans-serif'
    const noteLines = wrapCanvasText(ctx, program.notes, right - left)
    for (const line of noteLines) { ctx.fillText(line, left, y); y += 40 }
  }

  ctx.fillStyle = '#789096'
  ctx.font = '500 20px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('Généré avec DI’ART · ' + new Date().toLocaleDateString('fr-FR'), left, height - 80)

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Création de l’image impossible.')), 'image/png', 1))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(program.name) + '-fiche-technique.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function InventoryPage({ onOpen, onChanged, toast }: {
  onOpen: (id: string) => void
  onChanged: () => void
  toast: (text: string) => void
}) {
  const [programs, setPrograms] = useState<InventoryProgram[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => setPrograms((await db.programs.toArray()).filter(item => !item.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  useEffect(() => { void refresh() }, [])

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const item = await createProgram(name)
      setName('')
      await refresh()
      onChanged()
      toast('Programme créé.')
      onOpen(item.id)
    } finally { setBusy(false) }
  }

  return <>
    <section className="inventory-hero panel">
      <div>
        <span className="eyebrow">Organisation matérielle</span>
        <h1>Inventaire</h1>
        <p>Créez un programme par événement, préparez le matériel nécessaire et exportez la fiche technique en image.</p>
      </div>
      <div className="inventory-create">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create() }} placeholder="Nom de l’événement / programme" />
        <button className="primary" disabled={!name.trim() || busy} onClick={() => void create()}><Plus />Créer</button>
      </div>
    </section>

    <div className="inventory-section-head">
      <div><h2>Programmes</h2><span>{programs.length} événement{programs.length > 1 ? 's' : ''}</span></div>
    </div>

    <div className="program-grid">
      {programs.length ? programs.map(program => {
        const total = program.items.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0)
        const active = program.items.filter(item => item.quantity > 0).length
        return <button className="program-card panel" key={program.id} onClick={() => onOpen(program.id)}>
          <div className="program-card-icon"><CalendarDays /></div>
          <div className="program-card-main">
            <b>{program.name}</b>
            <div className="program-meta">
              {program.date && <span><CalendarDays />{new Date(program.date + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
              {program.location && <span><MapPin />{program.location}</span>}
            </div>
            <small>{active} type{active > 1 ? 's' : ''} de matériel · {total} unité{total > 1 ? 's' : ''}</small>
          </div>
          <ChevronRight />
        </button>
      }) : <div className="panel inventory-empty"><PackagePlus /><b>Aucun programme</b><span>Créez votre premier événement ci-dessus.</span></div>}
    </div>
  </>
}

export function InventoryProgramPage({ programId, onBack, onChanged, toast }: {
  programId: string
  onBack: () => void
  onChanged: () => void
  toast: (text: string) => void
}) {
  const [program, setProgram] = useState<InventoryProgram | null>(null)
  const [customName, setCustomName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const refresh = async () => setProgram((await db.programs.get(programId)) ?? null)
  useEffect(() => { void refresh() }, [programId])

  const persist = async (patch: Partial<Omit<InventoryProgram, 'id' | 'createdAt'>>) => {
    if (!program) return
    const updatedAt = now()
    const next = { ...program, ...patch, updatedAt }
    setProgram(next)
    await db.programs.update(program.id, { ...patch, updatedAt })
    onChanged()
  }

  const items = program?.items ?? []
  const selectedItems = useMemo(() => items.filter(item => item.quantity > 0), [items])
  const totalQuantity = useMemo(() => selectedItems.reduce((sum, item) => sum + item.quantity, 0), [selectedItems])

  const setQuantity = (id: string, quantity: number) => {
    const next = items.map(item => item.id === id ? { ...item, quantity: Math.max(0, Math.min(999, Math.floor(Number.isFinite(quantity) ? quantity : 0))) } : item)
    void persist({ items: next })
  }

  const addCustom = () => {
    const value = customName.trim()
    if (!value || !program) return
    const existing = items.find(item => item.name.trim().toLowerCase() === value.toLowerCase())
    const next = existing
      ? items.map(item => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item)
      : [...items, { id: crypto.randomUUID(), name: value, quantity: 1 }]
    setCustomName('')
    void persist({ items: next })
  }

  const removeItem = (id: string) => void persist({ items: items.filter(item => item.id !== id) })

  const restoreDefaults = () => {
    const names = new Set(items.map(item => item.name.trim().toLowerCase()))
    const missing = DEFAULT_INVENTORY_MATERIALS.filter(name => !names.has(name.toLowerCase())).map(name => ({ id: crypto.randomUUID(), name, quantity: 0 }))
    if (!missing.length) { toast('Tous les matériels par défaut sont déjà présents.'); return }
    void persist({ items: [...items, ...missing] })
    toast('Matériels par défaut restaurés.')
  }

  const removeProgram = async () => {
    if (!program) return
    await db.programs.update(program.id, { deletedAt: now(), updatedAt: now() })
    onChanged()
    toast('Programme supprimé.')
    onBack()
  }

  if (!program) return <section className="panel inventory-empty"><span>Chargement du programme…</span></section>

  return <>
    <section className="program-detail-head panel">
      <div className="program-title-block">
        <span className="eyebrow">Programme · événement</span>
        <input className="program-title-input" value={program.name} onChange={e => setProgram({ ...program, name: e.target.value })} onBlur={() => void persist({ name: program.name.trim() || 'Événement' })} />
        <div className="program-summary"><span>{selectedItems.length} type{selectedItems.length > 1 ? 's' : ''}</span><span>{totalQuantity} unité{totalQuantity > 1 ? 's' : ''}</span></div>
      </div>
      <div className="program-head-actions">
        <button className="secondary" disabled={exporting} onClick={() => {
          setExporting(true)
          void exportTechnicalSheetImage(program).then(() => toast('Fiche technique exportée en image.')).catch(error => toast(error instanceof Error ? error.message : 'Export impossible.')).finally(() => setExporting(false))
        }}><ImageDown />{exporting ? 'Export…' : 'Exporter en image'}</button>
        <button className="bare-action danger-icon" aria-label="Supprimer le programme" title="Supprimer" onClick={() => setConfirmDelete(true)}><Trash2 /></button>
      </div>
    </section>

    <section className="program-fields panel">
      <label><span>Date</span><input type="date" value={program.date} onChange={e => void persist({ date: e.target.value })} /></label>
      <label><span>Lieu</span><input value={program.location} onChange={e => setProgram({ ...program, location: e.target.value })} onBlur={() => void persist({ location: program.location })} placeholder="Lieu de l’événement" /></label>
      <label className="program-notes-field"><span>Notes</span><textarea value={program.notes} onChange={e => setProgram({ ...program, notes: e.target.value })} onBlur={() => void persist({ notes: program.notes })} rows={3} placeholder="Consignes, besoins particuliers, remarques…" /></label>
    </section>

    <section className="panel inventory-material-panel">
      <div className="panel-title-row inventory-material-title">
        <div><h2>Matériels</h2><span>Réglez la quantité avec − / + ou saisissez directement le nombre.</span></div>
        <button className="secondary" onClick={restoreDefaults}><Save />Matériels par défaut</button>
      </div>

      <div className="material-add-row">
        <input value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustom() }} placeholder="Ajouter un autre matériel…" />
        <button className="primary" disabled={!customName.trim()} onClick={addCustom}><Plus />Ajouter</button>
      </div>

      <div className="material-list">
        {items.map(item => <div className={'material-row ' + (item.quantity > 0 ? 'active' : '')} key={item.id}>
          <div className="material-name"><b>{item.name}</b>{item.quantity > 0 && <small>Prévu pour cet événement</small>}</div>
          <div className="qty-stepper">
            <button className="icon-btn" aria-label={'Retirer un ' + item.name} onClick={() => setQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 0}><Minus /></button>
            <input type="number" min="0" max="999" inputMode="numeric" value={item.quantity} aria-label={'Quantité ' + item.name} onChange={e => setQuantity(item.id, Number(e.target.value))} />
            <button className="icon-btn" aria-label={'Ajouter un ' + item.name} onClick={() => setQuantity(item.id, item.quantity + 1)}><Plus /></button>
          </div>
          <button className="bare-action danger-icon material-delete" aria-label={'Supprimer ' + item.name} onClick={() => removeItem(item.id)}><Trash2 /></button>
        </div>)}
      </div>
    </section>

    <section className="panel technical-summary">
      <div><span className="eyebrow">Aperçu fiche technique</span><h2>{program.name}</h2>{program.date && <p>{new Date(program.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>}{program.location && <p>{program.location}</p>}</div>
      <div className="technical-summary-list">
        {selectedItems.length ? selectedItems.map(item => <div key={item.id}><span>{item.name}</span><b>× {item.quantity}</b></div>) : <span className="muted-copy">Aucune quantité renseignée pour l’instant.</span>}
      </div>
    </section>

    {confirmDelete && <div className="inventory-confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfirmDelete(false) }}>
      <div className="inventory-confirm panel">
        <button className="bare-action inventory-confirm-close" onClick={() => setConfirmDelete(false)}><X /></button>
        <h3>Supprimer ce programme ?</h3>
        <p>Le programme sera retiré de la liste Inventaire.</p>
        <div className="modal-actions"><button className="secondary" onClick={() => setConfirmDelete(false)}>Annuler</button><button className="danger" onClick={() => void removeProgram()}><Trash2 />Supprimer</button></div>
      </div>
    </div>}
  </>
}
